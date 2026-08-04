# -*- coding: utf-8 -*-
"""Step 12 修复版: commercial-buildings.json 条目顶层新增 description（在 name 之后插入），不动 buff。"""
import io, re, json

PATH = r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\config\commercial-buildings.json"

TEXTS = {
    "市场": "市场是聚落的商业心脏，摊位与货架之间，货物与黄金日夜流转。",
    "商馆": "商馆云集八方客商，贸易网络自此四通八达。",
    "钱庄": "钱庄兑换钱币、存放银两，让财富有了安全的去处。",
    "大钱庄": "规模更大的钱庄，银库深藏，信贷通达四方。",
    "交易所": "交易所统一报价、集中交易，商人们在长桌前敲定大宗买卖。",
}

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

if __name__ == '__main__':
    with io.open(PATH, encoding='utf-8') as f:
        text = f.read()
    data = json.loads(text)
    m = re.search(r'"buildings"\s*:\s*\[', text)
    lb = text.find('[', m.start())
    end = _find_balanced(text, lb)
    items = []
    i = lb
    while i < end:
        if text[i] == '{':
            e = _find_balanced(text, i)
            items.append((i, e))
            i = e
        else:
            i += 1
    edits = []
    missing = []
    for (s, e) in items:
        blk = text[s:e]
        nm = re.search(r'"name"\s*:\s*"(.*?)"', blk)
        if not nm:
            continue
        name = nm.group(1)
        if name not in TEXTS:
            continue
        # 仅当 name 后紧跟的键就是 description 时视为已存在（避免误判嵌套 buff）
        tail = blk[nm.end():nm.end() + 60]
        if re.search(r'",\s*\n\s*"description"\s*:', tail) or re.search(r'",\s*"description"\s*:', tail):
            missing.append(name + '.已存在'); continue
        e1 = s + nm.end(1) + 1  # name 值闭引号后
        edits.append((e1, e1, ',\n      "description": "%s"' % TEXTS[name]))
    for edit in sorted(edits, key=lambda x: x[0], reverse=True):
        if len(edit) == 3:
            s1, e1, nt = edit
            text = text[:s1] + nt + text[e1:]
        else:
            p, nt = edit
            text = text[:p] + nt + text[p:]
    json.loads(text)
    with io.open(PATH, 'w', encoding='utf-8') as f:
        f.write(text)
    print('完成。插入:', len(edits), '跳过:', missing)
    # 校验
    data2 = json.loads(io.open(PATH, encoding='utf-8').read())
    bad = []
    for x in data2['buildings']:
        if x.get('description') != TEXTS.get(x.get('name')):
            bad.append(x.get('name'))
        # buff.description 必须保持原文（机制描述）
        if not (x.get('buff') or {}).get('description', '').startswith('至少'):
            bad.append(x.get('name') + '.buff被改')
    print('校验：错误 =', bad if bad else '无 ✔')
