# -*- coding: utf-8 -*-
"""修复 civic_classical_1（与 civic_ancient_2 同名'成文法典'导致误替换）+ 校验全部 civics/techs 文本正确性。"""
import io, sys
sys.path.insert(0, r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\tmp\textwork")
from texttools import replace_fields_in_entries

PATH = r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\config\historical_content.json"

fix = {
    "civic_classical_1": {
        "description": "律条公开刻写、执法有据可依，公民在法面前第一次获得平等的发言权。",
        "history": "罗马《十二铜表法》被平民逼着刻在广场上——法律的公开，是它公正的第一步。",
    },
}
missing, notfound, replaced = replace_fields_in_entries(PATH, 'civics', fix)
print('修复完成 missing=', missing, 'notfound=', notfound)

# 校验：读取 step2 的期望文本，检查每个 civic 的当前值
import json
from step2_civics import TEXTS as CIVIC_TEXTS
data = json.load(io.open(PATH, encoding='utf-8'))
civics = {c['id']: c for c in data['civics']}
bad = []
for cid, (desc, hist) in CIVIC_TEXTS.items():
    c = civics.get(cid)
    if not c:
        bad.append((cid, '条目不存在')); continue
    if c.get('description') != desc:
        bad.append((cid, 'description 不符'))
    if c.get('history') != hist:
        bad.append((cid, 'history 不符'))
print('人文校验：错误条目 =', bad if bad else '无 ✔')

# 校验 techs
from step1_techs import TEXTS as TECH_TEXTS
techs = {t['id']: t for t in data['techs']}
bad_t = []
for tid, (desc, hist) in TECH_TEXTS.items():
    t = techs.get(tid)
    if not t:
        bad_t.append((tid, '条目不存在')); continue
    if t.get('description') != desc:
        bad_t.append((tid, 'description 不符'))
    if t.get('history') != hist:
        bad_t.append((tid, 'history 不符'))
print('科技校验：错误条目 =', bad_t if bad_t else '无 ✔')
