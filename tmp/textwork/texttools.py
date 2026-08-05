# -*- coding: utf-8 -*-
"""文本替换通用工具：按数组→条目块作用域做精确替换（避免同名条目误伤）。
原理：先基于原文一次性收集所有编辑（偏移不失效），再从后往前应用。
"""
import json, io, re

def _find_balanced(text, open_idx):
    opener = text[open_idx]
    closer = ']' if opener == '[' else '}'
    depth = 0
    i = open_idx
    in_str = esc = False
    while i < len(text):
        ch = text[i]
        if in_str:
            if esc: esc = False
            elif ch == '\\': esc = True
            elif ch == '"': in_str = False
        else:
            if ch == '"': in_str = True
            elif ch in '({[': depth += 1
            elif ch in ')}]':
                depth -= 1
                if depth == 0:
                    return i + 1
        i += 1
    raise ValueError('未闭合')

def _array_span(text, arr_name):
    if arr_name == '@root':
        return (0, len(text))
    # 顶层数组字段在文件行首恰好为 2 空格缩进（如 '  "units": ['），
    # 用 MULTILINE 锚定行首，避免误匹配嵌套子对象（如 techs 的 unlocks.units）。
    m = re.search(r'^  "%s"\s*:\s*\[' % re.escape(arr_name), text, re.M)
    if not m:
        return None
    lb = text.find('[', m.start())
    return lb, _find_balanced(text, lb)

def _top_items(text, arr_start, arr_end):
    items = []
    i = arr_start
    in_str = esc = False
    while i < arr_end:
        ch = text[i]
        if in_str:
            if esc: esc = False
            elif ch == '\\': esc = True
            elif ch == '"': in_str = False
            i += 1
            continue
        if ch == '"':
            in_str = True; i += 1; continue
        if ch == '{':
            end = _find_balanced(text, i)
            items.append((i, end))
            i = end
            continue
        i += 1
    return items

def _string_end(text, p):
    """从开引号 p 开始扫描 JSON 字符串，返回闭引号后一位。处理转义。"""
    i = p + 1
    while i < len(text):
        ch = text[i]
        if ch == '\\':
            i += 2
            continue
        if ch == '"':
            return i + 1
        i += 1
    raise ValueError('字符串未闭合')

def _find_nested_block(text, blk_start, blk_end, key):
    """在 [blk_start, blk_end) 内找顶层键 key，若其值为对象 '{'，返回该对象块 (s, e)；否则返回 (值起, 值止) 的 (s,e) 供替换。"""
    blk = text[blk_start:blk_end]
    m = re.search(r'"%s"\s*:' % re.escape(key), blk)
    if not m:
        return None
    p = blk_start + m.end()
    while p < blk_end and text[p] in ' \t\n':
        p += 1
    if text[p] == '{':
        end = _find_balanced(text, p)
        return (p, end)
    # 字符串值
    if text[p] == '"':
        end = _string_end(text, p)
        return (p, end)
    return (p, p + 1)

def _locate_path(text, blk_start, blk_end, path):
    """按路径定位最终字段的 (abs_start, abs_end, 是否字符串值)。"""
    s, e = blk_start, blk_end
    for i, key in enumerate(path):
        r = _find_nested_block(text, s, e, key)
        if not r:
            return None
        s, e = r
        if i == len(path) - 1:
            return (s, e)
    return None

def replace_fields_in_entries(path, arr_name, updates, add_fields=False, indent=6):
    """updates: {entry_id: {'legacy.description': 新文本, ...}} 支持点路径。indent=插入新字段时的空格缩进。"""
    with io.open(path, encoding='utf-8') as f:
        text = f.read()
    data = json.loads(text)  # 校验可解析
    if arr_name == '@root':
        root_items = data if isinstance(data, list) else []
        ids = {e['id'] for e in root_items if isinstance(e, dict) and 'id' in e}
    else:
        ids = {e['id'] for e in data.get(arr_name) or []}
    span = _array_span(text, arr_name)
    if not span:
        raise ValueError(f'找不到数组: {arr_name}')
    arr_start, arr_end = span
    items = {}
    for s, e in _top_items(text, arr_start, arr_end):
        m = re.search(r'"id"\s*:\s*"(.*?)"', text[s:s + 300])
        if m:
            items[m.group(1)] = (s, e)
    edits = []
    missing, notfound, replaced = [], [], []
    for eid, fields in updates.items():
        if eid not in ids:
            missing.append(eid); continue
        if eid not in items:
            notfound.append(f'{eid}.block'); continue
        s, e = items[eid]
        blk = text[s:e]
        for field_key, new_val in fields.items():
            path_keys = field_key.split('.')
            if len(path_keys) > 1:
                loc = _locate_path(text, s, e, path_keys)
                if not loc:
                    notfound.append(f'{eid}.{field_key}'); continue
                s1, e1 = loc
                # 值应为字符串（带引号）
                if text[s1] != '"':
                    notfound.append(f'{eid}.{field_key}.nonstr'); continue
                edits.append((s1 + 1, e1 - 1, new_val))
            else:
                m = re.search(r'"%s"\s*:\s*"(.*?)"' % re.escape(field_key), blk, re.S)
                if m:
                    s1, e1 = s + m.start(1) - 1, s + m.end(1) + 1
                    edits.append((s1, e1, '"%s"' % new_val))
                elif add_fields:
                    mn = re.search(r'"name"\s*:\s*"(.*?)"', blk, re.S)
                    if not mn:
                        notfound.append(f'{eid}.no-name'); break
                    e1 = s + mn.end(1) + 1
                    edits.append((e1, e1, ',\n%s"%s": "%s"' % (' ' * indent, field_key, new_val)))
                else:
                    notfound.append(f'{eid}.{field_key}')
        replaced.append(eid)
    for edit in sorted(edits, key=lambda x: x[0], reverse=True):
        if len(edit) == 3:
            s1, e1, new_txt = edit
            text = text[:s1] + new_txt + text[e1:]
        else:
            p, new_txt = edit
            text = text[:p] + new_txt + text[p:]
    json.loads(text)
    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    return missing, notfound, replaced
