# -*- coding: utf-8 -*-
"""Step 10: culture.json new_policy 填描述、events_base 占位条目填描述、wildSites(96) 新增 description。"""
import io, sys
sys.path.insert(0, r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\tmp\textwork")
from texttools import replace_fields_in_entries

BASE = r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\config"

# 命名营地（18 个）
NAMED = {
    "wild_wood_1": "一群在林区盗伐的流民，木料与栅栏之间堆着他们的赃物。",
    "wild_food_1": "以狩猎为生的野人部落，猎获的兽肉晾晒在营火旁。",
    "wild_gold_1": "私自铸币的地下作坊，熔炉的火光映着假币与真金。",
    "wild_bandit_1": "盘踞林道的匪寨，专劫过往商旅，寨墙后堆满抢来的货物。",
    "wild_food_2": "野牛群聚集的草场，看守者驱赶兽群，也守卫这片丰饶。",
    "wild_stone_1": "据山而守的贼寇，以石块和滚木封锁山路。",
    "wild_nomad_1": "逐水草而居的游牧劫掠者，马队来去无踪。",
    "wild_mine_1": "占据废弃矿坑的守军，坑道深处或许藏着未采尽的矿脉。",
    "wild_bandit_2": "盘踞南道要冲的劫掠营地，是过往车队的必经之险。",
    "wild_ruin_1": "古战场废墟中的守灵者，据说亡者的兵器仍埋在地下。",
    "wild_wood_2": "潜伏密林的盗猎者，陷阱遍布，猎物与行人皆入其网。",
    "wild_fort_1": "叛离旧主的边塞守军，占据废弃要塞自立为王。",
    "wild_food_3": "看守丰饶谷地的武装，良田沃土是他们最硬的底气。",
    "wild_mine_2": "盘踞高地矿脉的矿团，铁镐与刀剑随时准备切换。",
    "wild_pirate_1": "藏身浅湾的海盗，帆影一起便扑向过路的商船。",
    "wild_pirate_2": "封锁河口的劫船团伙，扼住了水运的咽喉。",
    "wild_pirate_3": "活动于外海的私掠船队，挂着来历不明的旗号。",
    "wild_pirate_4": "封锁北水道的武装舰船，胆敢通行的船只都会被拦下。",
}

# 编号营地：按类别 2 个变体，按编号奇偶分配
VARS = {
    "barbarian_camp": [
        "盘踞边地的武装营寨，旌旗歪斜，却装备着从商队那里劫来的兵器。",
        "边地流寇的营寨，火堆与瞭望塔之间，堆着劫掠来的辎重。",
    ],
    "resource_guard": [
        "把守资源点的武装据点，守卫者对任何靠近的陌生人都充满敌意。",
        "圈占资源的守卫营地，他们以武力宣示对这片富饶土地的主权。",
    ],
    "roaming_host": [
        "四处游荡的武装军团，行军路线无人知晓，所过之处补给必遭洗劫。",
        "无固定据点的游荡队伍，行踪飘忽，随时可能出现在任何一条路上。",
    ],
    "ruin_guard": [
        "守护古老遗迹的守卫者，或许是在看守先人留下的秘密与财宝。",
        "遗迹废墟中的神秘守军，沉默地把守着通往过去的入口。",
    ],
    "pirate_fleet": [
        "横行海上的海盗舰队，黑帆所指，商路断绝。",
        "结伙而行的海盗船队，以劫掠为生，是海上贸易的宿敌。",
    ],
    "ancient_beast": [
        "盘踞此地的远古野兽，领地意识极强，踏入即被视作挑衅。",
        "荒原深处栖息的巨兽，人类的地图上从未为它留过位置。",
    ],
}

if __name__ == '__main__':
    import json as _json
    # 1) culture.json
    wf = _json.load(io.open(f'{BASE}\\world-factions.json', encoding='utf-8'))
    numbered = {}
    for w in wf.get('wildSites', []):
        if w['id'] in NAMED:
            continue
        num = int(w['id'].rsplit('_', 1)[-1])
        cat = w.get('category', 'barbarian_camp')
        desc = VARS.get(cat, VARS['barbarian_camp'])[num % 2]
        numbered[w['id']] = desc
    all_sites = {**NAMED, **numbered}
    r1 = replace_fields_in_entries(f'{BASE}\\world-factions.json', 'wildSites', {k: {'description': v} for k, v in all_sites.items()}, add_fields=True, indent=2)
    print('wildSites:', r1)

    # 2) culture.json（顶层数组）
    r2 = replace_fields_in_entries(f'{BASE}\\culture.json', '@root',
        {'new_policy': {'description': '试行一项全新的政策，为聚落确立新的治理方式。'}},
        add_fields=False, indent=2)
    print('culture:', r2)

    # 3) events_base.json 占位条目（顶层数组）
    r3 = replace_fields_in_entries(f'{BASE}\\events\\events_base.json', '@root',
        {'new_base_event': {'description': '一件发生在基地中的意外插曲，为平静的日子添上一点波澜。'}},
        add_fields=False, indent=2)
    print('events_base:', r3)

    # 校验
    bad = []
    data = _json.load(io.open(f'{BASE}\\world-factions.json', encoding='utf-8'))
    items = {x['id']: x for x in data['wildSites']}
    for sid, d in all_sites.items():
        if items.get(sid, {}).get('description') != d:
            bad.append('wild:' + sid)
    missing_wild = [sid for sid in items if 'description' not in items[sid]]
    print('校验 wildSites 错误 =', bad if bad else '无 ✔', '| 仍缺 =', missing_wild if missing_wild else '无 ✔')
