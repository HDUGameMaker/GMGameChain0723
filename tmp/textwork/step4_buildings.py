# -*- coding: utf-8 -*-
"""Step 4: 重写 historical_content.json 中 buildings 数组全部 94 个条目的 description。
37 个常规建筑新写；57 个文明特色建筑沿用 step3 的 uniqueBuilding.description。"""
import io, sys
sys.path.insert(0, r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\tmp\textwork")
from texttools import replace_fields_in_entries
from step3_civs import TEXTS as CIV_TEXTS

PATH = r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\config\historical_content.json"

# 常规建筑描述
COMMON = {
    "timber_house": "以原木搭建的民居，冬暖夏凉，为居民提供栖身之所。",
    "stone_tenement": "以石料砌筑的坚实住宅，能容纳更多家庭，防火防潮。",
    "manor": "贵族的田产庄园，屋舍与谷仓环绕庭院，居住舒适，主仆各安其位。",
    "forestry_camp": "伐木工在山林边缘扎下的营地，斧锯之下，原木源源不断运回聚落。",
    "stone_quarry": "采石场里锤凿叮当，坚硬的石料从这里流向工地与城墙。",
    "grain_farm": "翻土、播种、收割，农场让麦浪代替荒草，喂饱每一张嘴巴。",
    "gold_mine": "矿道深处的金光，是聚落最耀眼的财富，也是商人们追逐的目标。",
    "granary_hall": "防潮隔鼠的高架仓房，让丰收的余粮能安然度过歉收之年。",
    "central_warehouse": "聚落物资的中枢，木材石料在此集散，供应各处建设。",
    "academy": "学者们在此讲学论道，点亮科技之路的灯火。",
    "library": "藏书与抄本堆积如山，知识在书架之间长出新的枝芽。",
    "monument": "铭刻先人事迹的石碑，凝聚民心，也催生人文思想。",
    "civic_hall": "议事、祭祀与庆典皆在此举行，人文的灵感在此汇聚。",
    "council_hall": "官员与长老在此议政决事，行政效率随之提升。",
    "market_square": "摊位林立、人声鼎沸，集市让货物与黄金在此流转。",
    "trade_depot": "商队在此交割货物，路通四海，货殖八方。",
    "luxury_workshop": "匠人巧手制成珍玩，让奢侈品的产量更上一层。",
    "embassy": "使节驻节之地，橄榄枝在此递出，关系的裂痕在此弥合。",
    "courthouse": "明镜高悬、断案如流，公正的司法降低了领地的治理成本。",
    "barracks_hall": "操练场上的喊杀声不绝于耳，步兵与反骑兵部队在此受训。",
    "archery_range": "弓弦嗡鸣、箭矢破空，远程射手在此练就百步穿杨。",
    "stable": "草料与马蹄声相伴，良马在此蓄养，骑兵训练事半功倍。",
    "siege_workshop": "木槌与铁件碰撞，攻城器械的部件在此拼装成型。",
    "war_academy": "兵法、阵列与后勤皆入课程，将领的种子在此发芽。",
    "castle": "高墙深壕的要塞，既是军队的集结地，也是领民最后的庇护所。",
    "city_wall": "环绕聚落的屏障，阻挡敌兵，也宣告着文明的边界。",
    "watch_tower": "高塔之上视野开阔，敌踪与野火都逃不过守望者的眼睛。",
    "harbor": "栈桥延伸入水，船帆往来如织，海军舰队在此集结。",
    "grand_shipyard": "船坞中龙骨高耸，一艘艘战舰从这里下水。",
    "lighthouse": "夜色中火光如炬，为远航的船只指引归港的方向。",
    "engineers_guild": "图纸与水准仪并列，匠师们的经验让工程又快又好。",
    "blacksmith": "炉火通红、锤声铿锵，锋利的刀剑在铁砧上成形。",
    "tavern_hall": "酒香与故事同样醇厚，四海英雄在此歇脚，等待被招募。",
    "strategy_office": "沙盘与地图布满案头，奇谋妙策在此酝酿成形。",
    "field_camp": "军帐连绵的临时营地，让军团能在前线扎下脚跟。",
    "frontier_fort": "扼守边境的堡垒，驻军在此震慑来犯之敌。",
    "grand_fortress": "巍峨的多层城垒，是防线中最坚固的一环。",
}

# 特色建筑：从 step3 文明文案中取 uniqueBuilding.description
UNIQUE = {}
for cid, fields in CIV_TEXTS.items():
    uname = fields.get('uniqueBuilding.description')
    if uname:
        UNIQUE[f'{cid}_unique_building'] = uname

if __name__ == '__main__':
    updates = {}
    for bid, desc in COMMON.items():
        updates[bid] = {'description': desc}
    for bid, desc in UNIQUE.items():
        updates[bid] = {'description': desc}
    missing, notfound, replaced = replace_fields_in_entries(PATH, 'buildings', updates)
    print('完成。替换:', len(replaced), '缺失:', missing, '未找到:', notfound)
    import json as _json
    data = _json.load(io.open(PATH, encoding='utf-8'))
    bs = {b['id']: b for b in data['buildings']}
    bad = [bid for bid, d in updates.items() if bs.get(bid, {}).get('description') != d]
    print('校验：错误 =', bad if bad else '无 ✔')
