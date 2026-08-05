# -*- coding: utf-8 -*-
"""Step 11: 润色 config/buildings.json 全部 16 条描述（保留机制信息）。"""
import io, sys
sys.path.insert(0, r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\tmp\textwork")
from texttools import replace_fields_in_entries

PATH = r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\config\buildings.json"

TEXTS = {
    "work_shed": "士兵的驻训营地，操练声昼夜不息。提升可容纳的士兵上限，训练出的士兵皆受此约束。",
    "plank_house": "加固的大型营房，可容纳更多士兵。由军营升级而来。",
    "logging_camp": "林地边缘的伐木前哨，斧锯声中，原木被源源运回。仅能建造在林地边缘。",
    "stope": "裸露岩石上的露天采石场，锤凿之下石料滚落。仅能建造在裸露石头地形上。",
    "farm": "平原上的耕地，麦浪随风起伏，喂饱聚落的每一张嘴。仅能建造在草地或普通土地上。大建筑，被敌人触及会整栋摧毁。",
    "gold_mint": "将基础资源熔铸为黄金的核心设施，消耗木材、石料与食物，支撑建设、贸易与军饷。",
    "warehouse": "阵营的核心指挥建筑，四方物资汇聚于此，提升全局存储上限。不可拆除；一旦被敌人占领即告失败。",
    "supply_post": "物资调度点，为邻近的基础采集建筑输送补给，提升其产出。",
    "strategy_archive": "整理战报、地图与历史案例的研究设施，为城市提供战略卡获取线索。",
    "logging_camp_t2": "升级版伐木前哨，产出翻倍。由伐木集散点升级而来；需科技「轮轴运输」解锁。",
    "stope_t2": "升级版采石场，深入地下，产出翻倍。由采石场升级而来；需科技「青铜冶铸」解锁。",
    "farm_t2": "升级版农田，引渠灌溉，产出翻倍。由农田升级而来；需人文「劳役组织」解锁。",
    "gold_mint_t2": "升级版铸币所，工艺精进，黄金产出翻倍（同等原料）。由铸币所升级而来；需人文「跨城贸易」解锁。",
    "hunting_lodge": "在野生动物出没的食物点建立猎人营地，配置工人后持续取得食物，是前期机动供给的利器。",
    "forager_hut": "覆盖浆果、野粮与灌木食物点，配置工人后以稳定但较低的速度采集食物。",
    "trade_post": "覆盖地图上的奢侈品产地，配置工人后缓慢采集奢侈品——每种的第一份为帝国带来加成，多余的份额可用于贸易。",
}

if __name__ == '__main__':
    updates = {bid: {'description': d} for bid, d in TEXTS.items()}
    missing, notfound, replaced = replace_fields_in_entries(PATH, '@root', updates, indent=2)
    print('完成。替换:', len(replaced), '缺失:', missing, '未找到:', notfound)
    import json as _json
    data = _json.load(io.open(PATH, encoding='utf-8'))
    bs = {b['id']: b for b in data}
    bad = [bid for bid, d in TEXTS.items() if bs.get(bid, {}).get('description') != d]
    print('校验：错误 =', bad if bad else '无 ✔')
