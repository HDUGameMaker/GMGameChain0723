# -*- coding: utf-8 -*-
"""Step 9: enemies.json units(15) + ea_integration.json units(10) + enemies(8) 新增 description。"""
import io, sys
sys.path.insert(0, r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\tmp\textwork")
from texttools import replace_fields_in_entries

ENEMIES = {
    "warrior": "手持简陋武器的民兵，是聚落武装的第一道防线。",
    "swordsman": "经训练的职业剑士，剑刃与盾牌皆比民兵精良。",
    "musketeer": "装填火药的滑膛枪手，齐射的弹雨让旧式阵列土崩瓦解。",
    "modern_infantry": "自动武器与制式装备武装的现代步兵，机动与火力兼备。",
    "knight": "披甲执矛的马上骑士，冲锋是他们最熟悉的战场语言。",
    "armored_cavalry": "人马俱披重甲的冲击骑兵，是撕开阵线的铁刃。",
    "biplane": "木骨布翼的早期飞机，首次让战争蔓延到天空。",
    "jet_fighter": "喷气引擎驱动的战斗机，速度与火力都翻越了旧时代的边界。",
    "cannon": "直射的青铜炮，一炮轰开城墙与阵线的缺口。",
    "tank": "履带、装甲与主炮的结合体，陆地战争的钢铁堡垒。",
    "rocket_artillery": "多管齐发的火箭炮，一片弹雨覆盖整个战场。",
    "raft": "原木捆扎的简易水运工具，载着最早的河上战士。",
    "sailing_ship": "风帆驱动的战船，是远洋与贸易的载体。",
    "battleship": "巨炮林立的钢铁巨舰，海洋霸权的象征。",
    "missile_destroyer": "导弹武装的现代化战舰，海上的移动武库。",
}

EA_UNITS = {
    "spearman": "手持长矛的步兵，能有效迟滞骑兵的冲锋。",
    "pikeman": "数米长枪列成的枪阵，是骑兵的噩梦。",
    "archer": "弯弓搭箭的射手，在阵后提供持续火力。",
    "crossbowman": "上弦省力的弩手，穿透力远超普通弓箭。",
    "longbowman": "射程极远的长弓射手，箭雨如乌云压顶。",
    "catapult": "抛射石弹的攻城器械，让城墙承受天降之灾。",
    "trebuchet": "配重杠杆抛石机，投出的石弹足以砸穿城垛。",
    "siege_tower": "与城墙齐高的木塔，士兵从塔顶涌入城头。",
    "galley": "帆桨并用的战船，地中海海战的主力。",
    "fire_ship": "满载油脂的火攻船，冲入敌阵同归于尽。",
}

EA_ENEMIES = {
    "wolf": "成群出没的掠食者，嗅到血腥便会围拢而来。",
    "boar": "暴怒的野猪横冲直撞，獠牙能挑翻粗心的猎手。",
    "bandit_raider": "落草为寇的强盗，专抢落单的商旅与车队。",
    "bandit_archer": "躲在树丛后放冷箭的匪徒，箭法刁钻。",
    "outpost_guard": "据点里装备齐全的守卫，警惕任何靠近的人。",
    "outpost_crossbow": "据点的弩箭射手，依托掩体射击精准。",
    "corsair_galley": "横行海上的海盗船，专劫商路。",
    "sea_serpent": "出没于深海的巨蛇，是水手的噩梦。",
}

if __name__ == '__main__':
    E = r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\config\enemies.json"
    EA = r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\config\ea_integration.json"
    u1 = {uid: {'description': d} for uid, d in ENEMIES.items()}
    u2 = {uid: {'description': d} for uid, d in EA_UNITS.items()}
    u3 = {uid: {'description': d} for uid, d in EA_ENEMIES.items()}
    r1 = replace_fields_in_entries(E, 'units', u1, add_fields=True, indent=2)
    r2 = replace_fields_in_entries(EA, 'units', u2, add_fields=True, indent=2)
    r3 = replace_fields_in_entries(EA, 'enemies', u3, add_fields=True, indent=2)
    print('enemies.json units:', r1)
    print('ea_integration.json units:', r2)
    print('ea_integration.json enemies:', r3)
    import json as _json
    bad = []
    for f, arr, d in [(E, 'units', ENEMIES), (EA, 'units', EA_UNITS), (EA, 'enemies', EA_ENEMIES)]:
        data = _json.load(io.open(f, encoding='utf-8'))
        items = {x['id']: x for x in data.get(arr, [])}
        for uid, desc in d.items():
            if items.get(uid, {}).get('description') != desc:
                bad.append(f'{arr}:{uid}')
    print('校验：错误 =', bad if bad else '无 ✔')
