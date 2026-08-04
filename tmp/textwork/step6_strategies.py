# -*- coding: utf-8 -*-
"""Step 6: 重写 strategies(24) description、luxuries(20) description、eras(7) 新增 description。"""
import io, sys
sys.path.insert(0, r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\tmp\textwork")
from texttools import replace_fields_in_entries

PATH = r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\config\historical_content.json"

STRATEGIES = {
    "forced_march": "全军舍弃辎重、昼夜兼程，数日内把军团投送到战场的要害位置。",
    "harvest_drive": "男女老幼齐上阵，抢在风雨前把庄稼收进仓，粮食产量短时激增。",
    "timber_quota": "抽调全部伐木队集中作业，让原木在数日之内滚滚而来。",
    "stone_quota": "征调石工与驮畜专攻采石，石料供应在数日内成倍增长。",
    "emergency_tax": "以民心为代价征收特别税赋，国库在最短时间内获得一大笔黄金。",
    "research_focus": "调集学者与经费专攻一项研究，科技突破已在眼前。",
    "civic_campaign": "四处宣讲新政与理想，让人文思想在民众间迅速生根。",
    "rapid_repairs": "工匠昼夜赶工，损毁的建筑与设施在数日内修复如初。",
    "naval_blockade": "舰队封锁敌方港口与航道，切断其海上贸易与补给。",
    "false_intelligence": "放出伪造的情报扰乱敌方判断，使其战力评估大打折扣。",
    "delay_advance": "设伏、断桥、掘壕，一步步拖住敌军的脚步，为自己争取宝贵的时间。",
    "fortify": "就地构筑工事与拒马，守军的防御能力在短时间内大幅提升。",
    "rationing": "全民节衣缩食、统一配给，让有限的粮食撑过最艰难的日子。",
    "market_intervention": "官府插手市价、调控供需，让贸易的利润更多流向国库。",
    "diplomatic_mission": "派出资深使节穿梭斡旋，迅速拉近与城邦的关系。",
    "open_granaries": "打开官仓放粮赈民，民心与满意度在数日内回暖。",
    "veteran_recall": "征召退伍与老兵重返行伍，迅速恢复部队的编制与战力。",
    "coastal_patrol": "战船沿近海昼夜巡弋，让敌人的登陆企图无所遁形。",
    "counter_siege": "加固城门、储备滚木礌石，让来犯的攻城器械寸步难行。",
    "scorched_supply": "焚毁敌方粮草与仓库，使其军队的补给陷入困顿。",
    "public_works": "征发民夫大兴土木，所有建筑工程在数日内突飞猛进。",
    "merchant_convoy": "军队护送商队穿越危险地带，一趟航程换回丰厚的黄金。",
    "heroic_address": "统帅登高振臂一呼，全军士气大振，战力随之攀升。",
    "survey_corps": "测绘队深入荒野绘制地图，大片未知区域的迷雾就此揭开。",
}

LUXURIES = {
    "silk": "蚕丝织就的华美织物，轻若烟云、贵比黄金，是东方赠予世界的名片。",
    "jade": "温润坚洁的玉石，被奉为君子之德，是礼制与艺术最尊贵的载体。",
    "tea": "一片东方树叶的传奇——从提神的饮品到文明的纽带，让整个世界为之倾倒。",
    "spices": "让菜肴活色生香的珍物，曾驱动全世界的远航与贸易。",
    "ivory": "来自巨兽的洁白珍宝，雕琢成器便价值连城，也引来无休的追逐。",
    "wine": "阳光与土地酿成的琼浆，杯盏之间尽是宴饮与欢愉。",
    "incense": "袅袅青烟升腾于神庙与殿堂，气味本身就是一种权力。",
    "gems": "大地的结晶，以最璀璨的方式储存着财富与欲望。",
    "pearls": "蚌中孕育的月华，天然圆润，是海权帝国最温柔的勋章。",
    "amber": "凝固了千万年时光的松脂，既是宝石，也是穿越时空的信物。",
    "fur": "来自北境森林的温暖馈赠，一袭裘衣可抵万金。",
    "dyes": "让织物披上帝国色彩的颜料，昂贵的紫曾是王权的专属。",
    "cocoa": "苦中回甘的\u201c众神之饮\u201d，从美洲神殿走向全世界的甜梦。",
    "coffee": "苦涩而清醒的黑色饮品，是学者与思想家的忠实伴侣。",
    "porcelain": "火与土的魔法——薄可透光的瓷器，曾让整个欧洲为之痴迷。",
    "perfume": "以花露与香脂调配的芬芳，是宫廷与酒馆最昂贵的奢侈。",
    "silverware": "银光流转的器皿，既是财富的展示，也是度量与礼制的标准。",
    "horses": "战马是古战场的发动机，一匹好马能决定一支骑兵的生死。",
    "salt": "无色无味的白色黄金，没有它，一切美味与储存都无从谈起。",
    "cotton": "云朵般的柔软纤维，织成衣被，温暖了亿万人家。",
}

ERAS = {
    "primitive": "石器与火种的时代——人类从迁徙的猎手走向定居的聚落，文明的种子在此破土。",
    "ancient": "青铜与文字的时代——最早的国家在河谷中崛起，王权、神权与法典次第登场。",
    "classical": "铁器与哲学的时代——帝国与城邦并立，理性、律法与大道纵横交织。",
    "medieval": "骑士与信仰的时代——城堡林立、商路延伸，旧世界的秩序在战火中重塑。",
    "exploration": "大航海与火器的时代——船队驶向未知大洋，世界第一次连成一体。",
    "early_modern": "蒸汽与革命的时代——工厂、铁路与民族国家，把人类拖入前所未有的速度。",
    "modern": "原子与电子的时代——科技重塑一切，文明站在历史的十字路口眺望未来。",
}

if __name__ == '__main__':
    s_updates = {sid: {'description': d} for sid, d in STRATEGIES.items()}
    l_updates = {lid: {'description': d} for lid, d in LUXURIES.items()}
    e_updates = {eid: {'description': d} for eid, d in ERAS.items()}
    r1 = replace_fields_in_entries(PATH, 'strategies', s_updates)
    r2 = replace_fields_in_entries(PATH, 'luxuries', l_updates)
    r3 = replace_fields_in_entries(PATH, 'eras', e_updates, add_fields=True)
    print('策略:', r1)
    print('奢侈品:', r2)
    print('时代:', r3)
    import json as _json
    data = _json.load(io.open(PATH, encoding='utf-8'))
    bad = []
    for sid, d in STRATEGIES.items():
        m = next((x for x in data['strategies'] if x['id'] == sid), None)
        if not m or m.get('description') != d: bad.append('strategy:' + sid)
    for lid, d in LUXURIES.items():
        m = next((x for x in data['luxuries'] if x['id'] == lid), None)
        if not m or m.get('description') != d: bad.append('luxury:' + lid)
    for eid, d in ERAS.items():
        m = next((x for x in data['eras'] if x['id'] == eid), None)
        if not m or m.get('description') != d: bad.append('era:' + eid)
    print('校验：错误 =', bad if bad else '无 ✔')
