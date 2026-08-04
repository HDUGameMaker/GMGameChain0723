# -*- coding: utf-8 -*-
"""Step 3: 重写 historical_content.json 中 57 个文明的 summary / legacy.description / trait.description / uniqueBuilding.description。"""
import io, sys
sys.path.insert(0, r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\tmp\textwork")
from texttools import replace_fields_in_entries

PATH = r"E:\G-Game Design\Game Design Projects\GM GameChain2026\GM GameChain2026\config\historical_content.json"

TEXTS = {
    "proto_civilization": {
        "summary": "从迁徙的猎手群到围火的聚落，原始文明靠协作与传承走出了荒野。",
        "legacy.description": "共同的祖先记忆让分散的氏族始终彼此认同，这份纽带在时代的更迭中从未断裂。",
        "trait.description": "集体狩猎与分工采集磨炼出的默契，让聚落的生产与建造都事半功倍。",
        "uniqueBuilding.description": "火塘是氏族的中心——长者在火边议事，猎手在火边分食，文明的第一束光从这里升起。",
    },
    "zhou": {
        "summary": "以礼乐安天下、以分封治四方，周人在废墟上重建了秩序的大厦。",
        "legacy.description": "裂土分封让周的血脉与功勋遍布天下，宗法纽带维系着整个王朝的记忆。",
        "trait.description": "礼乐之制让长幼尊卑各安其位，社会在仪轨与乐声中趋于稳定。",
        "uniqueBuilding.description": "宗庙是周人祭祀祖先与举行大典的圣地，钟磬声中回响着\u201c敬天法祖\u201d的训诫。",
    },
    "assyria": {
        "summary": "以铁血军国横扫两河，亚述把\u201c恐惧\u201d锻造成了最锋利的统治工具。",
        "legacy.description": "底格里斯河与幼发拉底河之间的霸权，让亚述的名字成为征服的代名词。",
        "trait.description": "完备的攻城器械与残酷的威慑战术，让亚述的兵锋所向无人能挡。",
        "uniqueBuilding.description": "帝国兵工场日夜锻造刀剑与攻城器械，为亚述的远征军团输送着钢铁。",
    },
    "neo_babylon": {
        "summary": "在亚述的废墟上，新巴比伦以宏伟城垣与天象之学重绘了两河的辉煌。",
        "legacy.description": "祭司们对星空的记录化作历法与占卜，让巴比伦的智慧流传千年。",
        "trait.description": "发达的运河与水利让巴比伦的沃土养活庞大城市，也支撑起宏伟的工程。",
        "uniqueBuilding.description": "层层台阁上草木葱茏，据说那是为思念山乡的王后而建的悬空花园。",
    },
    "old_egypt": {
        "summary": "尼罗河的馈赠与石砌的神庙，让埃及文明在沙漠中矗立了三千余年。",
        "legacy.description": "每年洪泛带来的沃土是埃及的生命线，法老与神庙都仰赖这条河。",
        "trait.description": "精确的石料切割与搬运技术，让金字塔与方尖碑在沙漠中拔地而起。",
        "uniqueBuilding.description": "石柱林立的神庙矗立河畔，祭司在此祭拜诸神，也记录着河水的涨落。",
    },
    "archaic_greece": {
        "summary": "山海之间散落着百余座城邦，希腊人以公民之名书写了西方文明的序章。",
        "legacy.description": "城邦林立却共享语言与神祇，竞争与协作并存的爱琴海孕育了独特的文明。",
        "trait.description": "重装步兵方阵由公民自备武器组成，盾墙之后站着的不是雇佣兵，而是城邦本身。",
        "uniqueBuilding.description": "卫城之巅的议事场里，公民们辩论战和、决定税赋——这里没有王座。",
    },
    "vedic_india": {
        "summary": "圣歌、祭火与恒河的流水，构筑了吠陀时代印度最深邃的精神世界。",
        "legacy.description": "恒河两岸的聚落共享吠陀圣歌与种姓秩序，形成了稳定的社会肌理。",
        "trait.description": "世代口传的吠陀祭仪让知识以神圣的方式传承，祭司阶层守护着古老的智慧。",
        "uniqueBuilding.description": "祭坛上圣火长燃，祭司吟唱着千年前的颂歌，祈福丰收与平安。",
    },
    "han": {
        "summary": "从\u201c汉承秦制\u201d到丝绸之路，汉朝把大一统与开放写进了民族的基因。",
        "legacy.description": "郡县制让帝国的政令直达乡里，中央集权的传统自此延续两千年。",
        "trait.description": "驼铃穿越西域，丝绸与良马在商路上交换，汉的威名随之传遍四方。",
        "uniqueBuilding.description": "未央与长乐宫阙巍峨，长安城的街衢见证了万国使节的往来。",
    },
    "rome": {
        "summary": "从七丘之城到地中海帝国，罗马用军团、法律与道路征服了半个世界。",
        "legacy.description": "大道、水道与法典把帝国连成一体，罗马的遗产至今仍在我们脚下。",
        "trait.description": "军团既是士兵也是工程师，边修路边打仗的罗马人建起了世界上最庞大的工程网。",
        "uniqueBuilding.description": "广场是罗马的心跳——议政、审判、凯旋与市集都在这里上演。",
    },
    "parthia": {
        "summary": "骑射与商道双轮驱动，帕提亚在罗马与东方之间架起了横跨千里的桥梁。",
        "legacy.description": "帕提亚扼守丝路咽喉，东西方的货物与消息在这里交汇、转手、加价。",
        "trait.description": "撤退中回身放箭的骑射绝技，让追击帕提亚骑兵的敌人陷入死亡的追逐。",
        "uniqueBuilding.description": "丝路上的驿站为商队提供食宿与护卫，也向帝国报告每一支驼队的消息。",
    },
    "kushan": {
        "summary": "犍陀罗的佛陀塑像兼具希腊与印度之美，贵霜帝国本身就是文明的熔炉。",
        "legacy.description": "地处丝绸之路十字路口，贵霜让佛教艺术与希腊雕塑在这里相遇相融。",
        "trait.description": "对往来商旅的包容与保护，让贵霜的都市汇聚了各色人种与信仰。",
        "uniqueBuilding.description": "寺院的石壁上，希腊式卷发与佛陀的慈眉同时微笑——这是文明相遇的奇迹。",
    },
    "aksum": {
        "summary": "红海之滨的高原王国，以巨石方尖碑与海上贸易崛起为古代非洲的强权。",
        "legacy.description": "控制红海出口的阿克苏姆，把象牙、黄金与香料送往罗马与印度。",
        "trait.description": "高原上的梯田与蓄水池养活了强盛的王国，巨石建筑技艺独步非洲。",
        "uniqueBuilding.description": "高耸的方尖碑在广场上列队而立，记载着国王们的战功与血脉。",
    },
    "teotihuacan": {
        "summary": "众神之城特奥蒂瓦坎以太阳金字塔俯瞰高原，黑曜石之刃是它最锋利的商品。",
        "legacy.description": "这座规划严整的都会一度是美洲最大城市，连后来的阿兹特克人都敬畏地称它为\u201c众神之城\u201d。",
        "trait.description": "黑曜石刀与饰品随商队远销千里，让这座不靠海的城市富甲一方。",
        "uniqueBuilding.description": "太阳金字塔高逾六十米，登顶俯瞰的城市网格里，藏着古代美洲最精密的规划。",
    },
    "maya_classic": {
        "summary": "雨林深处的城邦以精确到天的历法与宏伟的阶梯金字塔，写下了中美洲的古典传奇。",
        "legacy.description": "玛雅人把时间丈量到数千万年，长纪历法至今仍让世界惊叹于他们的天文智慧。",
        "trait.description": "在雨林中开辟梯田与运河，玛雅城邦把难以耕作的丛林变成了粮仓。",
        "uniqueBuilding.description": "金字塔的台阶上刻满纪年铭文，祭祀的鼓声与历法的秘密一同回荡。",
    },
    "yamatai": {
        "summary": "列岛上的稻作聚落结成联盟，巫女王卑弥呼以祭祀维系着最早的日本政治。",
        "legacy.description": "三十余个稻作部落的联盟，是日本列岛走向统一国家的第一块基石。",
        "trait.description": "水田的修筑与灌溉让村落世代定居，共同体意识在稻香中生根。",
        "uniqueBuilding.description": "祭政合一的宫馆里，巫女王以神谕决断政事，列岛的命运系于一座祭坛。",
    },
    "tang": {
        "summary": "长安的街巷里飘着胡人的酒香，大唐以开放与包容成就了东亚的黄金时代。",
        "legacy.description": "万国使节云集长安，大唐的礼制与开放让\u201c唐人\u201d之名远播四海。",
        "trait.description": "均田制让农夫有田可耕，府兵制让壮丁有仗可打——王朝的根基在田亩之间。",
        "uniqueBuilding.description": "大明宫含元殿上，皇帝接受万邦朝贺，一座宫阙就是一座世界的中心。",
    },
    "abbasid": {
        "summary": "巴格达的智慧宫里，希腊的哲学与波斯的史诗在阿拉伯语中重生。",
        "legacy.description": "百年翻译运动把古代世界的知识汇聚到巴格达，再从这里流向整个欧洲。",
        "trait.description": "从地中海到印度洋的商站网络，让阿拔斯王朝坐拥东西方的财富。",
        "uniqueBuilding.description": "智慧宫的学者们翻译、实验、观测，代数学与天文学在这里奠基。",
    },
    "byzantium": {
        "summary": "罗马的余晖在君士坦丁堡的城墙上燃烧了一千年，拜占庭是旧帝国的金色遗嘱。",
        "legacy.description": "查士丁尼法典与圣索菲亚大教堂，让罗马的律法与荣光在东方延续千年。",
        "trait.description": "喷射的希腊火让敌舰在海上化为火海，拜占庭的海上防线固若金汤。",
        "uniqueBuilding.description": "三层城墙与深壕让君士坦丁堡千年不破，直到大炮时代才被征服。",
    },
    "franks": {
        "summary": "铁锤查理与查理曼的剑，把法兰克锻造成中世纪欧洲最强大的王国。",
        "legacy.description": "采邑与效忠的制度扩散到整个西欧，封建秩序从此扎根。",
        "trait.description": "重甲骑兵的集团冲锋势如破竹，骑士由此成为中世纪战场的主宰。",
        "uniqueBuilding.description": "亚琛的宫廷里，查理曼招揽学者推行教育，为欧洲的复兴点燃火种。",
    },
    "anglo_saxon": {
        "summary": "跨越北海的日耳曼诸部在不列颠扎根，木砦与长厅里响起吟游诗人的歌谣。",
        "legacy.description": "郡县民兵与贤人会议的传统，日后成为英格兰议会与法治的源头。",
        "trait.description": "盾牌密排成墙，长矛从缝隙中刺出——盎格鲁-撒克逊人以盾墙挡住了维京人。",
        "uniqueBuilding.description": "木砦大厅是贵族的宴饮之所，吟游诗人在炉火边传唱着英雄的传说。",
    },
    "srivijaya": {
        "summary": "扼守马六甲海峡的海上帝国，用商船与佛寺统治了千岛之国三百年。",
        "legacy.description": "控制海峡航道的室利佛逝，向每一艘过往商船收取财富与敬意。",
        "trait.description": "群岛间的香料与物产在港口集散，海商与僧侣共享这条黄金水道。",
        "uniqueBuilding.description": "佛寺与港口比邻而立，商人们在此供奉护佑航行的菩萨。",
    },
    "ghana_empire": {
        "summary": "撒哈拉以南的第一帝国，以黄金税赋与盐铁贸易积聚了令北非垂涎的财富。",
        "legacy.description": "横穿撒哈拉的驼队运来盐与布匹，运走黄金与象牙，帝国在商路上崛起。",
        "trait.description": "对每块金锭课税，让加纳的国王富可敌国，传说连王宫的狗都戴着金项圈。",
        "uniqueBuilding.description": "商站里秤金的天平日夜不休，帝国的财富从这里流向撒哈拉的另一端。",
    },
    "heian_japan": {
        "summary": "平安京的贵族以风雅立国，藤原氏的摄关政治让权力在屏风与和歌之间流转。",
        "legacy.description": "外戚摄政的体制延续百年，平安贵族的审美至今定义着\u201c日本之美\u201d。",
        "trait.description": "庄园中的武士逐渐崛起，刀光在风雅的外表下为新时代蓄势。",
        "uniqueBuilding.description": "官署里公文如雪，贵族们在纸墨间勾心斗角，也在庭院里吟咏四季。",
    },
    "chola": {
        "summary": "南印度的朱罗王朝以海军纵横孟加拉湾，用石造神庙宣示着帝国的荣光。",
        "legacy.description": "控制孟加拉湾航线的朱罗，让南印度的商人远航到东南亚的港口。",
        "trait.description": "庞大的远洋舰队远征马来群岛，朱罗是印度史上罕见的海洋帝国。",
        "uniqueBuilding.description": "神庙的塔门高达数十米，雕刻着诸神与舞女的石像，是朱罗艺术的高峰。",
    },
    "toltec": {
        "summary": "武士主宰的中部高原霸权，为后来的阿兹特克帝国铺下了神话与根基。",
        "legacy.description": "托尔特克的首都图拉威震中部高原，其传统被阿兹特克人奉为神圣。",
        "trait.description": "黑曜石武器锋利无匹，武士阶级以战功换取荣耀与土地。",
        "uniqueBuilding.description": "殿前的武士石柱持枪而立，鹰与美洲豹的图腾昭示着尚武的国魂。",
    },
    "ming": {
        "summary": "郑和的宝船七下西洋，大明以火器与朝贡体系威震四海，也守住了自己的城墙。",
        "legacy.description": "朝贡贸易网让万国帆影云集，大明的名号随着宝船远播重洋。",
        "trait.description": "神机营的火铳与火炮让明军火器冠绝东方，城墙攻防因此改写。",
        "uniqueBuilding.description": "宝船厂的船坞里，郑和的巨舰比哥伦布的旗舰大出数倍。",
    },
    "ottoman": {
        "summary": "征服者穆罕默德的巨炮轰开君士坦丁堡，奥斯曼帝国从此雄踞欧亚之间。",
        "legacy.description": "控制博斯普鲁斯海峡的帝国，让黑海与地中海的贸易都要向它低头。",
        "trait.description": "巨型乌尔班炮与工程兵的配合，让奥斯曼军队攻克了千年不破的坚城。",
        "uniqueBuilding.description": "兵工厂里铸造的巨炮与火铳，是奥斯曼军队威震三洲的底气。",
    },
    "spain": {
        "summary": "收复失地运动的骑士与美洲的白银，共同撑起了西班牙的黄金世纪。",
        "legacy.description": "波托西的白银随船队横渡大西洋，欧洲的物价与王冠都因之震颤。",
        "trait.description": "长矛与火枪混编的方阵横扫欧陆，西班牙步兵方阵曾是欧洲的噩梦。",
        "uniqueBuilding.description": "传教会所随征服者一同抵达新大陆，十字架与剑结伴而行。",
    },
    "portugal": {
        "summary": "小小的葡萄牙率先驶向未知的大洋，用海图与商站开启了大航海时代。",
        "legacy.description": "从西非到印度洋的航路与商站，让葡萄牙成为第一个全球海上帝国。",
        "trait.description": "恩里克王子的航海学校系统收集航线资料，把航海从经验升华为科学。",
        "uniqueBuilding.description": "学院里罗盘与海图并陈，年轻的航海家们从这里走向世界的尽头。",
    },
    "england_exploration": {
        "summary": "击溃无敌舰队的英格兰，用私掠船与特许公司叩开了海洋帝国的大门。",
        "legacy.description": "大西洋航路上的殖民地与商站，为不列颠的海上霸权埋下伏笔。",
        "trait.description": "皇家海军与私掠船的双轨扩张，让英格兰在大洋上步步为营。",
        "uniqueBuilding.description": "伦敦皇家交易所的屋檐下，商人们在为远航船队筹集股本与保险。",
    },
    "dutch": {
        "summary": "从海中夺地的低地共和国，以股份公司与商船队缔造了\u201c海上马车夫\u201d的传奇。",
        "legacy.description": "世界上第一家股份公司——荷兰东印度公司，为资本与冒险牵线。",
        "trait.description": "风车、圩田与运河让荷兰人向大海要地，也向大海要钱。",
        "uniqueBuilding.description": "阿姆斯特丹的商馆里，来自东方的香料在账簿上变成滚烫的数字。",
    },
    "mughal": {
        "summary": "从帖木儿后裔到印度皇帝，莫卧儿以骑兵、火器与税收统一了印度斯坦。",
        "legacy.description": "莫卧儿的黄金时代留下泰姬陵与细密画，印度斯坦的繁华令世界侧目。",
        "trait.description": "骑兵、火枪兵与象兵的复合编组，让莫卧儿军队在次大陆所向披靡。",
        "uniqueBuilding.description": "红堡的宫殿与花园依水而建，皇帝的夏宫里流淌着波斯式的凉意。",
    },
    "aztec": {
        "summary": "湖上之城特诺奇蒂特兰以贡赋与祭祀维系着帝国，阿兹特克是美洲最后的武士帝国。",
        "legacy.description": "湖心岛上的都城以堤道与运河连接陆地，规模曾让西班牙人目眩。",
        "trait.description": "三城同盟向四方征收贡赋，鲜花战争与祭祀维系着帝国的宗教秩序。",
        "uniqueBuilding.description": "大神庙的双塔供奉着雨神与战神，一级级台阶通向诸神的祭坛。",
    },
    "songhai": {
        "summary": "尼日尔河上的桑海帝国，让廷巴克图成为撒哈拉以南的学术与贸易之都。",
        "legacy.description": "尼日尔河的船队与撒哈拉的驼队在此交汇，商路即国脉。",
        "trait.description": "盐与黄金的贸易让桑海富甲西非，帝国的税吏沿河巡查每一船货物。",
        "uniqueBuilding.description": "廷巴克图的学宫里藏有数十万册手稿，西非学者在此研习天文与法学。",
    },
    "sengoku_japan": {
        "summary": "乱世出英雄——战国大名的山城与铁炮，将日本锻造成统一的国家。",
        "legacy.description": "兵农分离与检地制度让大名能动员数万大军，战国是日本军事化的熔炉。",
        "trait.description": "武士脱离农耕专职作战，铁炮队与足轻的配合改变了列岛的战争形态。",
        "uniqueBuilding.description": "山巅的天守阁俯瞰领国，石垣与铁炮狭间让大名有了不破的堡垒。",
    },
    "qing": {
        "summary": "天朝上国在炮声中惊醒，洋务运动试图用\u201c师夷长技\u201d守住古老的帝国。",
        "legacy.description": "多省财政与漕运体系撑起庞大帝国，也埋下了近代变革的伏笔。",
        "trait.description": "江南制造局与北洋水师承载着自强的梦想，新式枪炮第一次进入清军。",
        "uniqueBuilding.description": "制造局里机器轰鸣，中国人自己造出了第一批蒸汽机与铁甲舰。",
    },
    "british_empire": {
        "summary": "蒸汽、煤与自由贸易，把小小的岛国推上了\u201c日不落\u201d的巅峰。",
        "legacy.description": "全球航线与殖民网络让帝国的太阳永不落下，英镑与英语随之遍布世界。",
        "trait.description": "铁甲舰与蒸汽船让皇家海军无可匹敌，工业革命为舰队注入了钢铁的心脏。",
        "uniqueBuilding.description": "船坞里龙骨如山，英国海军从这里驶出，守卫着全球的海上商路。",
    },
    "french_empire": {
        "summary": "大革命与拿破仑的铁蹄重塑了欧洲，法兰西用法典与军团写下近代的宣言。",
        "legacy.description": "拿破仑法典确立的民法原则，至今仍是许多国家的法律基石。",
        "trait.description": "军团制与后勤改革让法军如臂使指，拿破仑的战争机器一度征服整个欧洲。",
        "uniqueBuilding.description": "凯旋门下无名烈士之火长燃，纪念着共和国与帝国的每一次远征。",
    },
    "russian_empire": {
        "summary": "从彼得大帝的窗口望向西方，俄罗斯以广袤的土地与铁腕学习着现代文明。",
        "legacy.description": "西伯利亚的纵深是俄罗斯最坚固的堡垒，入侵者都迷失在它的辽阔中。",
        "trait.description": "焦土与撤退换来的空间，让任何入侵俄国的军队都陷进无边的泥沼。",
        "uniqueBuilding.description": "冬宫的车间里，帝国的士兵在油画与水晶灯下学习操作新式步枪。",
    },
    "prussia": {
        "summary": "一个国家即一支军队——普鲁士用纪律与参谋制度把战争变成了科学。",
        "legacy.description": "军国一体的行政传统，让普鲁士在数十年间崛起为欧陆强权。",
        "trait.description": "只下达目标、不规定手段的指挥艺术，让普鲁士军官团灵活如臂。",
        "uniqueBuilding.description": "总参谋部的地图室里，毛奇用铁路时刻表规划着一场场战争。",
    },
    "usa_industrial": {
        "summary": "西进运动与机器轰鸣并进，美利坚用标准化与拓殖书写了工业时代的传奇。",
        "legacy.description": "从大西洋到太平洋的拓殖，把年轻的共和国变成了两洋大国。",
        "trait.description": "可互换的零件与流水线，让美国的工厂以史无前例的速度吐出产品。",
        "uniqueBuilding.description": "流水线上每个工位只做一个动作，工厂让\u201c美国制造\u201d成为效率的代名词。",
    },
    "meiji_japan": {
        "summary": "明治维新用一代人的时间，把锁国的岛国改造成现代化的列强。",
        "legacy.description": "剪发易服、西式学堂与铁路电报，明治日本以惊人的速度拥抱了近代文明。",
        "trait.description": "征兵令与近代军制让日本拥有了亚洲第一支现代化军队。",
        "uniqueBuilding.description": "釜石的制铁所高炉喷出第一炉日本钢，支撑起军舰与铁路的骨架。",
    },
    "ottoman_reform": {
        "summary": "\u201c欧洲病夫\u201d在改革的阵痛中求生，坦志麦特试图为古老的帝国续命。",
        "legacy.description": "坦志麦特改革颁布新律、兴办学校，为奥斯曼的近代化做了最后的努力。",
        "trait.description": "新制军队以西式操典训练，旧军团的弯刀让位于新军的步枪。",
        "uniqueBuilding.description": "官署里推行着新的法律与税制，改革者们在传统与现代之间走钢丝。",
    },
    "mexico_industrial": {
        "summary": "银矿与铁路让高原共和国重新与世界相连，墨西哥在独立后踏上近代之路。",
        "legacy.description": "独立后的墨西哥以共和制立国，高原上的都市重焕生机。",
        "trait.description": "银矿与矿产的出口换回铁路与机器，矿业是近代墨西哥的经济支柱。",
        "uniqueBuilding.description": "庄园的矿井深达数百米，白银从这里流向世界的铸币厂。",
    },
    "brazil_empire": {
        "summary": "热带帝国的咖啡园与港口的帆影，把巴西从殖民地推向世界舞台。",
        "legacy.description": "巴西帝国以和平的方式完成独立，成为南美最大的单一国家。",
        "trait.description": "咖啡出口的繁荣让里约的港口日夜繁忙，也改变着帝国的社会结构。",
        "uniqueBuilding.description": "桑托斯港的咖啡麻袋堆成小山，一船船咖啡从这里驶向世界。",
    },
    "china_modern": {
        "summary": "从积贫积弱到工业大国，中国用全民动员书写了二十世纪最惊人的复兴。",
        "legacy.description": "全民动员的建设传统，让国家能在短时间内集中力量办成大事。",
        "trait.description": "纵深动员让战争潜力深植于腹地与人民之中，任何侵略者都将陷入汪洋。",
        "uniqueBuilding.description": "联合工厂的高炉与车间连成一片，一个厂区就是一座城市。",
    },
    "usa_modern": {
        "summary": "二战的兵工厂与战后的超级大国，美国以联合兵种与工业实力主导了世界秩序。",
        "legacy.description": "大规模生产让美国在战时以压倒性产量决定战争走向，战后更成为经济引擎。",
        "trait.description": "海陆空联合兵种的协同作战，让美军在太平洋与欧洲战场如鱼得水。",
        "uniqueBuilding.description": "西海岸的厂房里，重型轰炸机以极快的速度走下生产线。",
    },
    "russia_modern": {
        "summary": "以钢铁洪流与广袤腹地回应一切来犯之敌，苏联的战争机器令人敬畏。",
        "legacy.description": "横跨欧亚的纵深让俄罗斯永远有撤退与反击的空间。",
        "trait.description": "大纵深作战理论以连续突击撕裂防线，红军从此不再被动挨打。",
        "uniqueBuilding.description": "乌拉尔的联合体在战时源源不断吐出坦克，数量本身就是一种战术。",
    },
    "uk_modern": {
        "summary": "坚守孤岛的英国以雷达、密码战与特种作战熬过了最黑暗的岁月。",
        "legacy.description": "不列颠空战的海空防线，让孤岛在纳粹的铁蹄前屹立不倒。",
        "trait.description": "突袭与情报战让英军以最小的代价打击敌人，特种部队的传统由此而生。",
        "uniqueBuilding.description": "海岸线上的雷达站昼夜扫描，让来袭的机群提前一小时现形。",
    },
    "france_modern": {
        "summary": "马奇诺防线的教训与共和国的韧性，共同构成了现代法国的双重性格。",
        "legacy.description": "自由、平等、博爱的共和传统，让法国始终站在欧洲思想的前列。",
        "trait.description": "装甲机动作战的探索，让法军在两次大战之间不断调整着自己的战法。",
        "uniqueBuilding.description": "马奇诺要塞的地下堡垒绵延数百公里，是\u201c固守\u201d思想最宏伟的纪念碑。",
    },
    "germany_modern": {
        "summary": "两次战败又两次崛起，德国以工程精神与战术创新在废墟上重建辉煌。",
        "legacy.description": "严谨的工程与教育体系，让德国在战败后仍能迅速恢复工业强国地位。",
        "trait.description": "强调速度与纵深的任务式战术，让德军在战争初期势如破竹。",
        "uniqueBuilding.description": "精密机械厂里，德国工程师把公差控制在微米级——品质是他们的信仰。",
    },
    "india_modern": {
        "summary": "世界上最大的民主国家，以多元文化与科技人才走出一条独特的发展之路。",
        "legacy.description": "数十种语言与宗教的多元联邦，让印度成为人类多样性最大的实验室。",
        "trait.description": "对高原边境的防卫与基础设施建设，构成了印度国防的独特命题。",
        "uniqueBuilding.description": "印度理工学院的门槛比名校还难跨，输送着全球科技界的印度大脑。",
    },
    "japan_modern": {
        "summary": "战后的日本以精益生产与贸易立国，从废墟上建成世界级经济体。",
        "legacy.description": "精益生产让日本制造以质量与效率征服世界，丰田模式成为全球范本。",
        "trait.description": "岛链防御与海上力量的现代化，守护着日本的海上生命线。",
        "uniqueBuilding.description": "综合制造所里，从钢铁到电子都在同一屋檐下完成——这就是\u201c综合\u201d的含义。",
    },
    "korea_modern": {
        "summary": "汉江奇迹与半导体之光，让朝鲜半岛的南部在几十年间跃居科技强国。",
        "legacy.description": "以高速创新追赶世界，韩国用两代人的时间完成了别的国家百年的跨越。",
        "trait.description": "半导体与显示面板的制造能力，让韩国握住了数字时代的命脉。",
        "uniqueBuilding.description": "无尘车间里晶圆在机械臂间流转，这个园区的产值超过许多国家的财富。",
    },
    "brazil_modern": {
        "summary": "亚马逊的雨林与圣保罗的天际线，共同定义了现代巴西的辽阔与活力。",
        "legacy.description": "全球最大雨林与最丰富的生物资源，让巴西成为\u201c地球之肺\u201d的守护者。",
        "trait.description": "在雨林与湿地中机动行军的本领，塑造了巴西军队独特的作战经验。",
        "uniqueBuilding.description": "生物科技园从雨林的基因库中提取财富，生物燃料让巴西能源自给。",
    },
    "nigeria_modern": {
        "summary": "非洲人口最多的国家，正以年轻的活力与区域枢纽地位走向未来。",
        "legacy.description": "两亿人口与年轻的结构，让尼日利亚拥有非洲最澎湃的活力浪潮。",
        "trait.description": "贯通西非的公路与港口联运，让拉各斯成为区域贸易的发动机。",
        "uniqueBuilding.description": "拉各斯的港口昼夜吞吐，集装箱的海洋里涌动着非洲的未来。",
    },
    "indonesia_modern": {
        "summary": "一万七千座岛屿串起的千岛之国，扼守着全球最繁忙的海上通道。",
        "legacy.description": "马六甲与巽他海峡的通衢，让印尼坐拥全球航运的黄金十字路口。",
        "trait.description": "对关键海峡的控制与岛际海运，让印尼的国防与贸易都系于大海。",
        "uniqueBuilding.description": "联运港里驳船往来如织，岛与岛之间靠钢铁般的物流网络相连。",
    },
}

if __name__ == '__main__':
    missing, notfound, replaced = replace_fields_in_entries(PATH, 'civilizations', TEXTS)
    print('完成。替换:', len(replaced), '缺失:', missing, '未找到:', notfound)
    # 校验
    import json as _json
    data = _json.load(io.open(PATH, encoding='utf-8'))
    civs = {c['id']: c for c in data['civilizations']}
    bad = []
    for cid, fields in TEXTS.items():
        c = civs.get(cid)
        if not c: bad.append((cid, '不存在')); continue
        if c.get('summary') != fields['summary']: bad.append((cid, 'summary'))
        if c.get('legacy', {}).get('description') != fields['legacy.description']: bad.append((cid, 'legacy'))
        if c.get('trait', {}).get('description') != fields['trait.description']: bad.append((cid, 'trait'))
        if c.get('uniqueBuilding', {}).get('description') != fields['uniqueBuilding.description']: bad.append((cid, 'uniBld'))
    print('校验：错误 =', bad if bad else '无 ✔')
