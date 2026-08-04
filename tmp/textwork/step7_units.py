# -*- coding: utf-8 -*-
"""Step 7: 为 historical_content.json units 数组 113 个单位新增 description 字段。"""
import io, sys
sys.path.insert(0, r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\tmp\textwork")
from texttools import replace_fields_in_entries

PATH = r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\config\historical_content.json"

TEXTS = {
    # ===== 原始 =====
    "primitive_infantry_1": "手持石斧与木盾的部落战士，是聚落最早的常备武力。",
    "primitive_ranged_2": "用投石索甩出石块，隔着溪流与灌木也能骚扰敌人。",
    "primitive_anti_cavalry_3": "猎过猛兽的投矛手，专克冲锋而来的骑手。",
    "primitive_cavalry_4": "骑乘驯化野马的猎人，追得上猎物，也追得上溃敌。",
    "primitive_siege_5": "整木凿成的简易攻城槌，对付简陋的栅栏绰绰有余。",
    "primitive_special_6": "轻装快行的侦察者，为聚落带回远方的消息与敌情。",
    "primitive_navy_7": "掏空的树干做成的小舟，载着最早的河上勇士。",
    "primitive_navy_8": "加固加长的战斗独木舟，弓手立于船头往来冲杀。",
    # ===== 上古 =====
    "ancient_infantry_1": "手持青铜剑与圆盾的精锐步兵，是王国的中坚。",
    "ancient_ranged_2": "弯弓搭箭的射手，在阵列后方洒下箭雨。",
    "ancient_anti_cavalry_3": "长矛与盾牌并举，步卒列成的反骑兵壁垒。",
    "ancient_cavalry_4": "驷马挽曳的战车，在平原上碾出轰隆的冲锋。",
    "ancient_siege_5": "包铁木槌架在车架之上，一下下撞击着城门。",
    "ancient_special_6": "单骑巡边的轻骑兵，来去如风、踪迹难寻。",
    "ancient_navy_7": "数十支桨齐挥的战舟，近海作战灵活迅捷。",
    "ancient_navy_8": "商船载着水手与弓手，既做贸易也护航线。",
    # ===== 古典 =====
    "classical_infantry_1": "长剑与塔盾的军团步兵，列阵而战、纪律严明。",
    "classical_ranged_2": "角木复合的强弓，箭矢能穿透普通甲胄。",
    "classical_anti_cavalry_3": "长枪如林的方阵，是骑兵冲击的噩梦。",
    "classical_cavalry_4": "人马披甲的冲击骑兵，是战场上的铁锤。",
    "classical_siege_5": "以扭力发射巨石与巨箭，攻城拔寨的利器。",
    "classical_special_6": "投掷标枪的散兵，游走于阵列之间。",
    "classical_navy_7": "三层桨座的海上利刃，撞角冲撞是它的绝技。",
    "classical_navy_8": "更大的桨帆战船，甲板上搭载着登船步兵。",
    # ===== 中世纪 =====
    "medieval_infantry_1": "锁甲与剑盾武装的职业步兵，城堡下的坚石。",
    "medieval_ranged_2": "钢弩上弦省力、穿透惊人，寻常农夫也能击穿骑士。",
    "medieval_anti_cavalry_3": "密集长枪组成森林，是骑兵冲锋的终结者。",
    "medieval_cavalry_4": "全副武装的骑士冲锋，封建时代的战争之王。",
    "medieval_siege_5": "杠杆抛石机投出成吨的石弹，是城墙的克星。",
    "medieval_special_6": "轻装骑马的巡边者，穿插侦察、袭扰补给。",
    "medieval_navy_7": "帆桨并用的战船，地中海舰队的骨干。",
    "medieval_navy_8": "装上首尾堡垒的商用柯克船，兼作护航战舰。",
    # ===== 探索 =====
    "exploration_infantry_1": "十六英尺长枪列成的方阵核心，是火枪手的守护者。",
    "exploration_ranged_2": "火绳点火的滑膛枪手，轰鸣中宣告冷兵器时代的结束。",
    "exploration_anti_cavalry_3": "以拒马与长枪抵御骑兵冲击的混合部队。",
    "exploration_cavalry_4": "身披胸甲的重骑兵，冲锋时势如破竹。",
    "exploration_siege_5": "青铜炮管发射实心弹，城墙在炮火下崩塌。",
    "exploration_special_6": "骑马机动、下马射击的骑乘步兵，来去如电。",
    "exploration_navy_7": "多层甲板、舷炮林立的远洋战舰，海上的移动城堡。",
    "exploration_navy_8": "满载易燃物的火攻船，冲向敌舰同归于尽。",
    # ===== 近代 =====
    "early_modern_infantry_1": "排成线列齐射的步兵，是纪律与火药的化身。",
    "early_modern_ranged_2": "后装步枪装填更快，精准与火力俱佳。",
    "early_modern_anti_cavalry_3": "步枪与刺刀组成的方阵，让骑兵不敢越雷池一步。",
    "early_modern_cavalry_4": "挥舞骑枪的龙骑兵后代，侦察与追击的尖刀。",
    "early_modern_siege_5": "曲射的榴弹炮，抛出的炮弹能越过城墙。",
    "early_modern_special_6": "转管机枪倾泻弹雨，一寸土地一寸钢铁。",
    "early_modern_navy_7": "包覆铁甲的蒸汽战舰，木船时代的终结者。",
    "early_modern_navy_8": "快如闪电的小艇，贴着海面发射鱼雷。",
    # ===== 现代 =====
    "modern_infantry_1": "装甲车载送的步兵，机动与火力兼得。",
    "modern_ranged_2": "精干的特种分队，深入敌后执行精准打击。",
    "modern_anti_cavalry_3": "地对空导弹锁定来袭之敌，是天空的守护者。",
    "modern_cavalry_4": "钢铁洪流的核心，陆战之王的代名词。",
    "modern_siege_5": "多管火箭炮倾泻火力，覆盖整片战区。",
    "modern_special_6": "无人机的眼睛与铁拳，战争的形态因它而变。",
    "modern_navy_7": "装备导弹的现代化战舰，海上的移动武库。",
    "modern_navy_8": "潜行于大洋深处的猎手，神出鬼没的暗影。",
    # ===== 特色单位 =====
    "proto_civilization_unique_unit": "聚落最熟练的猎手组成的投石队伍，人人都是丛林里的活地图。",
    "zhou_unique_unit": "周天子麾下的精锐武士，甲胄鲜明，拱卫王畿。",
    "assyria_unique_unit": "专业工兵与攻城槌的编队，亚述攻城艺术的精华。",
    "neo_babylon_unique_unit": "伊什塔尔门前的雄狮卫士，以长矛守护荣耀之门。",
    "old_egypt_unique_unit": "努比亚雇佣的神射手，法老的箭雨洒向尼罗河两岸。",
    "archaic_greece_unique_unit": "自备装备的公民士兵，盾墙与荣誉同在。",
    "vedic_india_unique_unit": "颂歌中的战车武士，祭司为其祈福，恒河为其开路。",
    "han_unique_unit": "大汉天子亲率的羽林骑兵，马踏匈奴，卫护长安。",
    "rome_unique_unit": "纪律与工程并重的职业军团，条条大路通向它的营盘。",
    "parthia_unique_unit": "回马一箭的骑射大师，卡莱之战的传奇。",
    "kushan_unique_unit": "人马皆披铁甲的冲锋骑兵，丝路上的铁流。",
    "aksum_unique_unit": "阿克苏姆国王的持矛卫队，守护着方尖碑与商路。",
    "teotihuacan_unique_unit": "手持黑曜石刃的武士，刃口锋利如传说。",
    "maya_classic_unique_unit": "雨林中的掷矛猎手，借助树干与藤蔓隐藏身形。",
    "yamatai_unique_unit": "邪马台女王麾下的弓手，箭簇淬着稻作之国的坚韧。",
    "tang_unique_unit": "李世民亲练的黑甲精骑，马踏关河，战无不克。",
    "abbasid_unique_unit": "从小训练的奴隶骑兵，忠诚与武艺皆是顶尖。",
    "byzantium_unique_unit": "北欧雇佣的皇家卫队，皇帝的贴身盾墙。",
    "franks_unique_unit": "重甲骑士的先锋，加洛林王朝的铁骑。",
    "anglo_saxon_unique_unit": "誓死追随领主的亲兵，战死也不后退一步。",
    "srivijaya_unique_unit": "扼守马六甲的船队，向每艘过路商船收取敬意。",
    "ghana_empire_unique_unit": "萨赫勒草原的轻骑兵，商路上的护卫与劫掠者。",
    "heian_japan_unique_unit": "庄园主的武装侍从，武士道的萌芽。",
    "chola_unique_unit": "纵横孟加拉湾的舰队，让远洋航路臣服于神庙之国。",
    "toltec_unique_unit": "图拉城的鹰武士团，以战功换取荣耀。",
    "ming_unique_unit": "明军火器部队，火铳与火炮齐鸣，东方火器的巅峰。",
    "ottoman_unique_unit": "苏丹的宫廷新军，从小训练的战争机器。",
    "spain_unique_unit": "跨洋而来的西班牙骑士，长矛、火枪与十字架同行。",
    "portugal_unique_unit": "轻快灵便的远洋帆船，海图学派的尖兵。",
    "england_exploration_unique_unit": "持证的海上盗贼，女王授权的劫掠舰队。",
    "dutch_unique_unit": "低地水手的战船队，让无敌舰队折戟的怒火。",
    "mughal_unique_unit": "背负火枪手与炮台的战象，帝国的移动堡垒。",
    "aztec_unique_unit": "阿兹特克最荣耀的武士阶层，为太阳而战。",
    "songhai_unique_unit": "沿河出击的桑海骑兵，商路与疆域的双重守护。",
    "sengoku_japan_unique_unit": "手持铁炮的足轻队，战国大名的决定性力量。",
    "qing_unique_unit": "湘军练就的火枪营，晚清自强的最早火种。",
    "british_empire_unique_unit": "红色军装的英国步兵，线列战术的帝国化身。",
    "french_empire_unique_unit": "拿破仑的贴身精锐，从意大利一路打到滑铁卢。",
    "russian_empire_unique_unit": "顿河与西伯利亚的哥萨克，天生的骑手与侦察兵。",
    "prussia_unique_unit": "腓特烈大王的精锐步兵，以铁一般的纪律闻名。",
    "usa_industrial_unique_unit": "西进运动中的神枪手，荒野里的游侠。",
    "meiji_japan_unique_unit": "明治天皇的御亲兵，新式陆军的种子。",
    "ottoman_reform_unique_unit": "西式操练的奥斯曼新军，改革的利刃。",
    "mexico_industrial_unique_unit": "墨西哥革命中的骑手，峡谷与荒原的游击者。",
    "brazil_empire_unique_unit": "巴西帝国的骑乘步兵，南美草原的铁骑。",
    "china_modern_unique_unit": "全机械化的合成旅，人民军队的钢铁拳头。",
    "usa_modern_unique_unit": "海陆空协同的装甲分队，联合作战的典范。",
    "russia_modern_unique_unit": "大纵深理论的重锤，钢铁洪流的核心。",
    "uk_modern_unique_unit": "特种突击的精锐，敌后渗透的利刃。",
    "france_modern_unique_unit": "来自世界各地的军团士兵，以荣誉为家。",
    "germany_modern_unique_unit": "伴随坦克作战的机械化步兵，闪电战的血肉。",
    "india_modern_unique_unit": "在高原雪线上下翻飞的山地战士，边境的守望者。",
    "japan_modern_unique_unit": "岛国海上自卫的舰队骨干，守卫着海上生命线。",
    "korea_modern_unique_unit": "数字化网络连接的海军陆战队，信息战先锋。",
    "brazil_modern_unique_unit": "穿行亚马逊雨林的特战部队，绿色地狱的主人。",
    "nigeria_modern_unique_unit": "活跃于西非维和行动的多国部队，和平的使者。",
    "indonesia_modern_unique_unit": "千岛之间的两栖部队，岛屿争夺战的专家。",
}

if __name__ == '__main__':
    updates = {uid: {'description': d} for uid, d in TEXTS.items()}
    missing, notfound, replaced = replace_fields_in_entries(PATH, 'units', updates, add_fields=True)
    print('完成。替换:', len(replaced), '缺失:', missing, '未找到:', notfound)
    import json as _json
    data = _json.load(io.open(PATH, encoding='utf-8'))
    us = {u['id']: u for u in data['units']}
    bad = []
    for uid, d in TEXTS.items():
        u = us.get(uid, {})
        if u.get('description') != d:
            bad.append(uid)
    missing_field = [uid for uid in us if 'description' not in us[uid]]
    print('校验：错误 =', bad if bad else '无 ✔', '| 仍缺字段 =', missing_field if missing_field else '无 ✔')
