# -*- coding: utf-8 -*-
"""Step 8: 补全 config/techs.json 中 29 个缺失 + 3 个空字符串的科技 description。"""
import io, sys
sys.path.insert(0, r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\tmp\textwork")
from texttools import replace_fields_in_entries

PATH = r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\config\techs.json"

ADD = {  # 新增字段
    "logging": "掌握了斧柄与伐木的要领，聚落能高效地从森林中获取原木。",
    "mining": "学会开凿与支护矿洞，地下的石料与矿石得以源源而出。",
    "farming": "翻土、播种、轮作，让土地按季节回报稳定的粮食。",
    "basic_crafting": "粗木作架、石料为础，建立起最早的手工作坊。",
    "wood_processing": "锯解、刨平与干燥处理，让原木变成可用的建材。",
    "smelting": "高温熔炼矿石提取金属，铁与铜从矿石中重生。",
    "woodworking": "榫卯与拼接的技艺，让木屋更加牢固耐用。",
    "steelmaking": "在炭火中渗碳锻打，炼出远比铁坚硬的钢。",
    "precision_crafting": "卡尺与磨床的应用，让零件精度达到毫米级。",
    "brickmaking": "以黏土制坯、入窑烧成，砖块让建筑不再依赖木材。",
    "storage_tech": "分区货架与干燥通风的库房，让物资存储更有效率。",
    "fishing": "渔网、鱼钩与竹筏，让河流湖泊成为取之不尽的粮仓。",
    "hunting": "陷阱、猎弓与围猎技巧，让猎物成为稳定的肉食来源。",
    "mine_support_tech": "木柱与顶板支护，让矿工能深入更危险的矿层。",
    "mechanical_engineering": "齿轮、连杆与轴承的组合，让机械开始代替人力。",
    "brick_architecture": "以砖石砌墙、以灰浆黏合，建筑可以更高、更坚固。",
    "tile_housing": "屋顶覆瓦、地面铺砖，住宅的舒适与耐久更上一层。",
    "military_training": "阵列、操典与体能训练，让征召的士兵成为真正的军人。",
    "advanced_military": "分兵种协同训练与战场纪律，军队的组织度大幅提升。",
    "building_repair": "常备的修缮工匠与工具，让建筑始终保持最佳状态。",
    "exploration_tech": "地质调查与钻探取样，让地下的矿脉无所遁形。",
    "precision_manufacturing": "高精度机床与标准化生产，让工业制品质量飞跃。",
    "resource_expansion": "扩建仓储与装卸设施，聚落的物资容量再上台阶。",
    "grain_storage": "防潮防鼠的谷仓设计，让余粮可以长年保存。",
    "electronic_engineering": "电路、传感器与信号处理，为文明装上电子的大脑。",
    "deep_exploration": "深井钻探与地下测绘，触及最深处的资源。",
    "precision_molding": "模具压制与精密铸造，让金属零件一次成型。",
    "waterwheel": "以水流驱动水轮，借自然之力碾磨与鼓风。",
    "sail": "借风行船，让舟船摆脱桨橹的束缚驶向远洋。",
}
FILL = {  # 空字符串 → 填内容
    "domesticate_horses": "驯服野马为坐骑与挽畜，运输与骑兵的时代就此开启。",
    "vehicles": "四轮车厢与坚固车轴，让大宗货物得以远距离转运。",
    "firearm": "点燃药池、击发弹丸，火器将彻底改变战争的面貌。",
}

if __name__ == '__main__':
    a_updates = {tid: {'description': d} for tid, d in ADD.items()}
    f_updates = {tid: {'description': d} for tid, d in FILL.items()}
    r1 = replace_fields_in_entries(PATH, '@root', a_updates, add_fields=True, indent=2)
    r2 = replace_fields_in_entries(PATH, '@root', f_updates)
    print('新增字段:', r1)
    print('填空字段:', r2)
    import json as _json
    data = _json.load(io.open(PATH, encoding='utf-8'))
    ts = {t['id']: t for t in data}
    bad = []
    for tid, d in {**ADD, **FILL}.items():
        t = ts.get(tid, {})
        if t.get('description') != d:
            bad.append(tid)
    missing = [tid for tid in ts if 'description' not in ts[tid] or not ts[tid].get('description')]
    print('校验：错误 =', bad if bad else '无 ✔', '| 仍缺/空 =', missing if missing else '无 ✔')
