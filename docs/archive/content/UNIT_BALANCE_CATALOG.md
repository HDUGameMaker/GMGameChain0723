# 兵种与海军平衡目录

生成日期：2026-08-03。运行时共 138 个独立兵种；数据按主版 → EA 兼容层 → 历史内容层的 ID 优先级合并。每个条目均对应 `assets/unit-cards/<id>.png` 的独立 2.5D 招募立绘。

| ID | 名称 | 时代 | 领域/分支 | 战力 | HP/攻击/射程 | CP | 训练成本 | 克制 | 受制 | 训练建筑 | 文明 |
|---|---|---|---|---:|---|---:|---|---|---|---|---|
| archer | 弓箭手 | 原始时代 | land / archer | 4 | 6 / 3 / 3 | 2 | wood:18 / food:12 | ["light_infantry","spear"] | ["mounted","armored"] | — | 通用 |
| primitive_anti_cavalry_3 | 猎矛兵 | 原始时代 | land / anti_cavalry | 8 | 9 / 4 / 1 | 1 | wood:10 / stone:4 / food:12 / gold:2 | ["cavalry"] | ["ranged"] | barracks_hall | 通用 |
| primitive_cavalry_4 | 狩猎队 | 原始时代 | land / cavalry | 10 | 10 / 5 / 1 | 1 | wood:10 / stone:4 / food:12 / gold:3 | ["ranged","light"] | ["spear"] | stable | 通用 |
| primitive_infantry_1 | 氏族战士 | 原始时代 | land / infantry | 4 | 7 / 2 / 1 | 1 | wood:10 / stone:4 / food:12 | ["light"] | ["ranged"] | barracks_hall | 通用 |
| primitive_navy_7 | 独木舟 | 原始时代 | naval / navy | 16 | 13 / 8 / 1 | 1 | wood:10 / stone:4 / food:12 / gold:6 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| primitive_navy_8 | 战斗木舟 | 原始时代 | naval / navy | 18 | 14 / 9 / 1 | 1 | wood:10 / stone:4 / food:12 / gold:7 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| primitive_ranged_2 | 投石手 | 原始时代 | land / ranged | 6 | 8 / 3 / 3 | 1 | wood:10 / stone:4 / food:12 / gold:1 | ["infantry"] | ["cavalry"] | archery_range | 通用 |
| primitive_siege_5 | 冲撞木槌 | 原始时代 | land / siege | 12 | 11 / 6 / 3 | 1 | wood:10 / stone:16 / food:12 / gold:4 | ["building"] | ["light","cavalry"] | siege_workshop | 通用 |
| primitive_special_6 | 斥候 | 原始时代 | land / special | 14 | 12 / 7 / 1 | 1 | wood:10 / stone:4 / food:12 / gold:5 | ["siege","support"] | ["cavalry"] | war_academy | 通用 |
| proto_civilization_unique_unit | 氏族猎手 | 原始时代 | land / ranged | 5 | 8 / 3 / 3 | 1 | wood:12 / stone:5 / food:14 | ["infantry"] | ["cavalry"] | archery_range | proto_civilization |
| raft | 木筏 | 原始时代 | naval / navy | 4 | 8 / 2 / 1 | 2 | wood:20 / food:10 | — | — | — | 通用 |
| spearman | 长矛兵 | 原始时代 | land / infantry | 4 | 8 / 3 / 1 | 2 | wood:15 / food:12 | ["mounted"] | ["archer","heavy_infantry"] | — | 通用 |
| warrior | 战士 | 原始时代 | land / infantry | 2 | 6 / 2 / 1 | 2 | wood:10 / food:10 | — | — | — | 通用 |
| ancient_anti_cavalry_3 | 矛盾兵 | 上古时代 | land / anti_cavalry | 28 | 17 / 10 / 1 | 1 | wood:18 / stone:7 / food:19 / gold:9 | ["cavalry"] | ["ranged"] | barracks_hall | 通用 |
| ancient_cavalry_4 | 早期战车 | 上古时代 | land / cavalry | 30 | 18 / 11 / 1 | 1 | wood:18 / stone:7 / food:19 / gold:10 | ["ranged","light"] | ["spear"] | stable | 通用 |
| ancient_infantry_1 | 青铜剑士 | 上古时代 | land / infantry | 24 | 15 / 8 / 1 | 1 | wood:18 / stone:7 / food:19 / gold:7 | ["light"] | ["ranged"] | barracks_hall | 通用 |
| ancient_navy_7 | 桨划舟 | 上古时代 | naval / navy | 36 | 21 / 14 / 1 | 1 | wood:18 / stone:7 / food:19 / gold:13 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| ancient_navy_8 | 武装商船 | 上古时代 | naval / navy | 38 | 22 / 15 / 1 | 1 | wood:18 / stone:7 / food:19 / gold:14 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| ancient_ranged_2 | 弓箭手 | 上古时代 | land / ranged | 26 | 16 / 9 / 3 | 1 | wood:18 / stone:7 / food:19 / gold:8 | ["infantry"] | ["cavalry"] | archery_range | 通用 |
| ancient_siege_5 | 冲车 | 上古时代 | land / siege | 32 | 19 / 12 / 3 | 1 | wood:18 / stone:24 / food:19 / gold:11 | ["building"] | ["light","cavalry"] | siege_workshop | 通用 |
| ancient_special_6 | 侦察骑手 | 上古时代 | land / special | 34 | 20 / 13 / 1 | 1 | wood:18 / stone:7 / food:19 / gold:12 | ["siege","support"] | ["cavalry"] | war_academy | 通用 |
| archaic_greece_unique_unit | 城邦重装兵 | 上古时代 | land / anti_cavalry | 30 | 19 / 10 / 1 | 1 | wood:20 / stone:9 / food:22 / gold:16 | ["cavalry"] | ["ranged"] | barracks_hall | archaic_greece |
| assyria_unique_unit | 亚述攻城队 | 上古时代 | land / siege | 26 | 16 / 8 / 4 | 1 | wood:20 / stone:27 / food:22 / gold:10 | ["building"] | ["light","cavalry"] | siege_workshop | assyria |
| neo_babylon_unique_unit | 城门卫士 | 上古时代 | land / anti_cavalry | 28 | 17 / 9 / 1 | 1 | wood:20 / stone:9 / food:22 / gold:12 | ["cavalry"] | ["ranged"] | barracks_hall | neo_babylon |
| old_egypt_unique_unit | 梅杰弓手 | 上古时代 | land / ranged | 29 | 18 / 9 / 4 | 1 | wood:20 / stone:9 / food:22 / gold:14 | ["infantry"] | ["cavalry"] | archery_range | old_egypt |
| vedic_india_unique_unit | 吠陀战车 | 上古时代 | land / cavalry | 31 | 20 / 10 / 1 | 1 | wood:20 / stone:9 / food:22 / gold:18 | ["ranged","light"] | ["spear"] | stable | vedic_india |
| zhou_unique_unit | 虎贲甲士 | 上古时代 | land / infantry | 25 | 15 / 8 / 1 | 1 | wood:20 / stone:9 / food:22 / gold:8 | ["light"] | ["ranged"] | barracks_hall | zhou |
| aksum_unique_unit | 高原矛卫 | 古典时代 | land / anti_cavalry | 51 | 26 / 15 / 1 | 1 | wood:28 / stone:13 / food:30 / gold:24 | ["cavalry"] | ["ranged"] | barracks_hall | aksum |
| catapult | 投石车 | 古典时代 | land / siege | 11 | 11 / 9 / 4 | 6 | wood:35 / stone:15 / gold:5 | ["fortification","clustered"] | ["mounted","melee"] | — | 通用 |
| classical_anti_cavalry_3 | 方阵枪兵 | 古典时代 | land / anti_cavalry | 48 | 25 / 16 / 1 | 1 | wood:26 / stone:10 / food:26 / gold:16 | ["cavalry"] | ["ranged"] | barracks_hall | 通用 |
| classical_cavalry_4 | 具装骑兵 | 古典时代 | land / cavalry | 50 | 26 / 17 / 1 | 1 | wood:26 / stone:10 / food:26 / gold:17 | ["ranged","light"] | ["spear"] | stable | 通用 |
| classical_infantry_1 | 持盾剑士 | 古典时代 | land / infantry | 44 | 23 / 14 / 1 | 1 | wood:26 / stone:10 / food:26 / gold:14 | ["light"] | ["ranged"] | barracks_hall | 通用 |
| classical_navy_7 | 三列桨战船 | 古典时代 | naval / navy | 56 | 29 / 20 / 1 | 1 | wood:26 / stone:10 / food:26 / gold:20 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| classical_navy_8 | 五列桨战船 | 古典时代 | naval / navy | 58 | 30 / 21 / 1 | 1 | wood:26 / stone:10 / food:26 / gold:21 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| classical_ranged_2 | 复合弓手 | 古典时代 | land / ranged | 46 | 24 / 15 / 4 | 1 | wood:26 / stone:10 / food:26 / gold:15 | ["infantry"] | ["cavalry"] | archery_range | 通用 |
| classical_siege_5 | 弩炮 | 古典时代 | land / siege | 52 | 27 / 18 / 4 | 1 | wood:26 / stone:32 / food:26 / gold:18 | ["building"] | ["light","cavalry"] | siege_workshop | 通用 |
| classical_special_6 | 轻装标枪兵 | 古典时代 | land / special | 54 | 28 / 19 / 1 | 1 | wood:26 / stone:10 / food:26 / gold:19 | ["siege","support"] | ["cavalry"] | war_academy | 通用 |
| galley | 桨帆战船 | 古典时代 | naval / navy | 9 | 14 / 6 / 2 | 5 | wood:45 / stone:10 / food:30 / gold:5 | ["naval_transport","naval_light"] | ["naval_heavy","fire_ship"] | — | 通用 |
| han_unique_unit | 羽林骑 | 古典时代 | land / cavalry | 46 | 22 / 13 / 1 | 1 | wood:28 / stone:13 / food:30 / gold:16 | ["ranged","light"] | ["spear"] | stable | han |
| kushan_unique_unit | 贵霜具装骑兵 | 古典时代 | land / cavalry | 49 | 25 / 14 / 1 | 1 | wood:28 / stone:13 / food:30 / gold:22 | ["ranged","light"] | ["spear"] | stable | kushan |
| maya_classic_unique_unit | 投枪武士 | 古典时代 | land / ranged | 53 | 28 / 16 / 5 | 1 | wood:28 / stone:13 / food:30 / gold:28 | ["infantry"] | ["cavalry"] | archery_range | maya_classic |
| parthia_unique_unit | 帕提亚骑射手 | 古典时代 | land / cavalry | 48 | 24 / 14 / 1 | 1 | wood:28 / stone:13 / food:30 / gold:20 | ["ranged","light"] | ["spear"] | stable | parthia |
| rome_unique_unit | 罗马军团 | 古典时代 | land / anti_cavalry | 47 | 23 / 13 / 1 | 1 | wood:28 / stone:13 / food:30 / gold:18 | ["cavalry"] | ["ranged"] | barracks_hall | rome |
| swordsman | 剑士 | 古典时代 | land / infantry | 6 | 9 / 4 / 1 | 3 | wood:15 / stone:5 / food:20 | — | — | — | 通用 |
| teotihuacan_unique_unit | 黑曜石战士 | 古典时代 | land / infantry | 52 | 27 / 15 / 1 | 1 | wood:28 / stone:13 / food:30 / gold:26 | ["light"] | ["ranged"] | barracks_hall | teotihuacan |
| yamatai_unique_unit | 弥生弓卫 | 古典时代 | land / ranged | 54 | 29 / 16 / 5 | 1 | wood:28 / stone:13 / food:30 / gold:30 | ["infantry"] | ["cavalry"] | archery_range | yamatai |
| abbasid_unique_unit | 马穆鲁克 | 中世纪 | land / cavalry | 68 | 30 / 18 / 1 | 1 | wood:36 / stone:17 / food:38 / gold:26 | ["ranged","light"] | ["spear"] | stable | abbasid |
| anglo_saxon_unique_unit | 亲兵卫队 | 中世纪 | land / infantry | 71 | 33 / 20 / 1 | 1 | wood:36 / stone:17 / food:38 / gold:32 | ["light"] | ["ranged"] | barracks_hall | anglo_saxon |
| armored_cavalry | 重甲骑兵 | 中世纪 | land / cavalry | 24 | 18 / 10 / 1 | 6 | wood:15 / stone:20 / food:35 / gold:10 | — | — | — | 通用 |
| byzantium_unique_unit | 瓦兰吉卫队 | 中世纪 | land / infantry | 69 | 31 / 19 / 1 | 1 | wood:36 / stone:17 / food:38 / gold:28 | ["light"] | ["ranged"] | barracks_hall | byzantium |
| chola_unique_unit | 朱罗海军 | 中世纪 | naval / navy | 76 | 37 / 22 / 1 | 1 | wood:36 / stone:17 / food:38 / gold:40 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | chola |
| crossbowman | 弩兵 | 中世纪 | land / archer | 8 | 7 / 6 / 3 | 3 | wood:15 / stone:10 / food:18 | ["armored","spear"] | ["mounted","siege"] | — | 通用 |
| franks_unique_unit | 法兰克骑士 | 中世纪 | land / infantry | 70 | 32 / 19 / 1 | 1 | wood:36 / stone:17 / food:38 / gold:30 | ["light"] | ["ranged"] | barracks_hall | franks |
| ghana_empire_unique_unit | 萨赫勒骑兵 | 中世纪 | land / infantry | 74 | 35 / 21 / 1 | 1 | wood:36 / stone:17 / food:38 / gold:36 | ["light"] | ["ranged"] | barracks_hall | ghana_empire |
| heian_japan_unique_unit | 武士侍从 | 中世纪 | land / infantry | 75 | 36 / 21 / 1 | 1 | wood:36 / stone:17 / food:38 / gold:38 | ["light"] | ["ranged"] | barracks_hall | heian_japan |
| knight | 骑士 | 中世纪 | land / cavalry | 10 | 12 / 6 / 1 | 4 | wood:10 / stone:10 / food:25 | — | — | — | 通用 |
| longbowman | 长弓手 | 中世纪 | land / archer | 14 | 8 / 9 / 5 | 5 | wood:24 / food:25 / gold:8 | ["light_infantry","spear","artillery"] | ["mounted","armored"] | — | 通用 |
| medieval_anti_cavalry_3 | 长枪方阵 | 中世纪 | land / anti_cavalry | 68 | 33 / 22 / 1 | 1 | wood:34 / stone:13 / food:33 / gold:23 | ["cavalry"] | ["ranged"] | barracks_hall | 通用 |
| medieval_cavalry_4 | 重装骑士 | 中世纪 | land / cavalry | 70 | 34 / 23 / 1 | 1 | wood:34 / stone:13 / food:33 / gold:24 | ["ranged","light"] | ["spear"] | stable | 通用 |
| medieval_infantry_1 | 披甲步兵 | 中世纪 | land / infantry | 64 | 31 / 20 / 1 | 1 | wood:34 / stone:13 / food:33 / gold:21 | ["light"] | ["ranged"] | barracks_hall | 通用 |
| medieval_navy_7 | 桨帆战船 | 中世纪 | naval / navy | 76 | 37 / 26 / 1 | 1 | wood:34 / stone:13 / food:33 / gold:27 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| medieval_navy_8 | 武装柯克船 | 中世纪 | naval / navy | 78 | 38 / 27 / 1 | 1 | wood:34 / stone:13 / food:33 / gold:28 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| medieval_ranged_2 | 弩手 | 中世纪 | land / ranged | 66 | 32 / 21 / 4 | 1 | wood:34 / stone:13 / food:33 / gold:22 | ["infantry"] | ["cavalry"] | archery_range | 通用 |
| medieval_siege_5 | 配重投石机 | 中世纪 | land / siege | 72 | 35 / 24 / 4 | 1 | wood:34 / stone:40 / food:33 / gold:25 | ["building"] | ["light","cavalry"] | siege_workshop | 通用 |
| medieval_special_6 | 边境游骑 | 中世纪 | land / special | 74 | 36 / 25 / 1 | 1 | wood:34 / stone:13 / food:33 / gold:26 | ["siege","support"] | ["cavalry"] | war_academy | 通用 |
| pikeman | 重装枪兵 | 中世纪 | land / infantry | 9 | 13 / 5 / 1 | 4 | stone:18 / food:20 / gold:5 | ["mounted","armored"] | ["archer","artillery"] | — | 通用 |
| siege_tower | 攻城塔 | 中世纪 | land / siege | 10 | 22 / 3 / 1 | 7 | wood:50 / stone:25 | ["fortification","archer"] | ["fire","artillery"] | — | 通用 |
| srivijaya_unique_unit | 海峡水军 | 中世纪 | naval / navy | 72 | 34 / 20 / 1 | 1 | wood:36 / stone:17 / food:38 / gold:34 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | srivijaya |
| tang_unique_unit | 玄甲军 | 中世纪 | land / infantry | 67 | 29 / 18 / 1 | 1 | wood:36 / stone:17 / food:38 / gold:24 | ["light"] | ["ranged"] | barracks_hall | tang |
| toltec_unique_unit | 鹰柱武士 | 中世纪 | land / infantry | 77 | 38 / 22 / 1 | 1 | wood:36 / stone:17 / food:38 / gold:42 | ["light"] | ["ranged"] | barracks_hall | toltec |
| trebuchet | 配重投石机 | 中世纪 | land / siege | 21 | 14 / 15 / 6 | 9 | wood:55 / stone:25 / gold:12 | ["fortification","armored"] | ["mounted","air"] | — | 通用 |
| aztec_unique_unit | 鹰战士 | 探索时代 | land / infantry | 95 | 43 / 26 / 1 | 1 | wood:44 / stone:21 / food:46 / gold:46 | ["light"] | ["ranged"] | barracks_hall | aztec |
| dutch_unique_unit | 海上乞丐 | 探索时代 | naval / navy | 93 | 41 / 25 / 1 | 1 | wood:44 / stone:21 / food:46 / gold:42 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | dutch |
| england_exploration_unique_unit | 私掠船 | 探索时代 | naval / navy | 92 | 40 / 25 / 1 | 1 | wood:44 / stone:21 / food:46 / gold:40 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | england_exploration |
| exploration_anti_cavalry_3 | 拒马枪兵 | 探索时代 | land / anti_cavalry | 88 | 41 / 28 / 1 | 1 | wood:42 / stone:16 / food:40 / gold:30 | ["cavalry"] | ["ranged"] | barracks_hall | 通用 |
| exploration_cavalry_4 | 胸甲骑兵 | 探索时代 | land / cavalry | 90 | 42 / 29 / 1 | 1 | wood:42 / stone:16 / food:40 / gold:31 | ["ranged","light"] | ["spear"] | stable | 通用 |
| exploration_infantry_1 | 长枪兵 | 探索时代 | land / infantry | 84 | 39 / 26 / 1 | 1 | wood:42 / stone:16 / food:40 / gold:28 | ["light"] | ["ranged"] | barracks_hall | 通用 |
| exploration_navy_7 | 盖伦帆船 | 探索时代 | naval / navy | 96 | 45 / 32 / 1 | 1 | wood:42 / stone:16 / food:40 / gold:34 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| exploration_navy_8 | 火船 | 探索时代 | naval / navy | 98 | 46 / 33 / 1 | 1 | wood:42 / stone:16 / food:40 / gold:35 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| exploration_ranged_2 | 火绳枪手 | 探索时代 | land / ranged | 86 | 40 / 27 / 5 | 1 | wood:42 / stone:16 / food:40 / gold:29 | ["infantry"] | ["cavalry"] | archery_range | 通用 |
| exploration_siege_5 | 野战炮 | 探索时代 | land / siege | 92 | 43 / 30 / 5 | 1 | wood:42 / stone:48 / food:40 / gold:32 | ["building"] | ["light","cavalry"] | siege_workshop | 通用 |
| exploration_special_6 | 龙骑兵 | 探索时代 | land / special | 94 | 44 / 31 / 1 | 1 | wood:42 / stone:16 / food:40 / gold:33 | ["siege","support"] | ["cavalry"] | war_academy | 通用 |
| fire_ship | 火船 | 探索时代 | naval / navy | 15 | 8 / 14 / 1 | 5 | wood:30 / stone:25 / food:18 / gold:8 | ["naval_heavy","naval_medium"] | ["naval_light","ranged"] | — | 通用 |
| ming_unique_unit | 神机营 | 探索时代 | land / ranged | 87 | 36 / 23 / 7 | 1 | wood:44 / stone:21 / food:46 / gold:32 | ["infantry"] | ["cavalry"] | archery_range | ming |
| mughal_unique_unit | 火枪战象 | 探索时代 | land / cavalry | 94 | 42 / 26 / 1 | 1 | wood:44 / stone:21 / food:46 / gold:44 | ["ranged","light"] | ["spear"] | stable | mughal |
| musketeer | 火枪手 | 探索时代 | land / infantry | 18 | 10 / 8 / 3 | 5 | wood:20 / stone:10 / food:30 / gold:10 | — | — | — | 通用 |
| ottoman_unique_unit | 耶尼切里 | 探索时代 | land / ranged | 89 | 37 / 23 / 7 | 1 | wood:44 / stone:21 / food:46 / gold:34 | ["infantry"] | ["cavalry"] | archery_range | ottoman |
| portugal_unique_unit | 卡拉维尔战船 | 探索时代 | naval / navy | 91 | 39 / 24 / 1 | 1 | wood:44 / stone:21 / food:46 / gold:38 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | portugal |
| sailing_ship | 帆船 | 探索时代 | naval / navy | 18 | 16 / 8 / 3 | 5 | wood:30 / stone:5 / food:25 / gold:10 | — | — | — | 通用 |
| sengoku_japan_unique_unit | 铁炮足轻 | 探索时代 | land / ranged | 98 | 45 / 27 / 7 | 1 | wood:44 / stone:21 / food:46 / gold:50 | ["infantry"] | ["cavalry"] | archery_range | sengoku_japan |
| songhai_unique_unit | 尼日尔骑兵 | 探索时代 | land / cavalry | 97 | 44 / 27 / 1 | 1 | wood:44 / stone:21 / food:46 / gold:48 | ["ranged","light"] | ["spear"] | stable | songhai |
| spain_unique_unit | 征服者 | 探索时代 | land / cavalry | 90 | 38 / 24 / 1 | 1 | wood:44 / stone:21 / food:46 / gold:36 | ["ranged","light"] | ["spear"] | stable | spain |
| biplane | 双翼机 | 近代 | land / cavalry | 55 | 20 / 18 / 5 | 9 | wood:25 / stone:25 / food:45 / gold:25 | — | — | — | 通用 |
| brazil_empire_unique_unit | 帝国龙骑兵 | 近代 | land / cavalry | 118 | 52 / 32 / 1 | 1 | wood:52 / stone:25 / food:54 / gold:58 | ["ranged","light"] | ["spear"] | stable | brazil_empire |
| british_empire_unique_unit | 红衫步兵 | 近代 | land / infantry | 109 | 44 / 28 / 1 | 1 | wood:52 / stone:25 / food:54 / gold:42 | ["light"] | ["ranged"] | barracks_hall | british_empire |
| cannon | 加农炮 | 近代 | land / artillery | 16 | 10 / 12 / 4 | 6 | wood:5 / stone:25 / food:15 / gold:10 | — | — | — | 通用 |
| early_modern_anti_cavalry_3 | 反骑兵方阵 | 近代 | land / anti_cavalry | 108 | 49 / 34 / 1 | 1 | wood:50 / stone:19 / food:47 / gold:37 | ["cavalry"] | ["ranged"] | barracks_hall | 通用 |
| early_modern_cavalry_4 | 枪骑兵 | 近代 | land / cavalry | 110 | 50 / 35 / 1 | 1 | wood:50 / stone:19 / food:47 / gold:38 | ["ranged","light"] | ["spear"] | stable | 通用 |
| early_modern_infantry_1 | 线列步兵 | 近代 | land / infantry | 104 | 47 / 32 / 1 | 1 | wood:50 / stone:19 / food:47 / gold:35 | ["light"] | ["ranged"] | barracks_hall | 通用 |
| early_modern_navy_7 | 铁甲舰 | 近代 | naval / navy | 116 | 53 / 38 / 1 | 1 | wood:50 / stone:19 / food:47 / gold:41 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| early_modern_navy_8 | 鱼雷艇 | 近代 | naval / navy | 118 | 54 / 39 / 1 | 1 | wood:50 / stone:19 / food:47 / gold:42 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| early_modern_ranged_2 | 后膛步枪兵 | 近代 | land / ranged | 106 | 48 / 33 / 5 | 1 | wood:50 / stone:19 / food:47 / gold:36 | ["infantry"] | ["cavalry"] | archery_range | 通用 |
| early_modern_siege_5 | 榴弹炮 | 近代 | land / siege | 112 | 51 / 36 / 5 | 1 | wood:50 / stone:56 / food:47 / gold:39 | ["building"] | ["light","cavalry"] | siege_workshop | 通用 |
| early_modern_special_6 | 机枪队 | 近代 | land / special | 114 | 52 / 37 / 1 | 1 | wood:50 / stone:19 / food:47 / gold:40 | ["siege","support"] | ["cavalry"] | war_academy | 通用 |
| french_empire_unique_unit | 老近卫军 | 近代 | land / infantry | 110 | 45 / 29 / 1 | 1 | wood:52 / stone:25 / food:54 / gold:44 | ["light"] | ["ranged"] | barracks_hall | french_empire |
| meiji_japan_unique_unit | 近卫师团 | 近代 | land / infantry | 115 | 49 / 31 / 1 | 1 | wood:52 / stone:25 / food:54 / gold:52 | ["light"] | ["ranged"] | barracks_hall | meiji_japan |
| mexico_industrial_unique_unit | 乡村骑兵 | 近代 | land / cavalry | 117 | 51 / 32 / 1 | 1 | wood:52 / stone:25 / food:54 / gold:56 | ["ranged","light"] | ["spear"] | stable | mexico_industrial |
| ottoman_reform_unique_unit | 新式步兵团 | 近代 | land / ranged | 116 | 50 / 31 / 8 | 1 | wood:52 / stone:25 / food:54 / gold:54 | ["infantry"] | ["cavalry"] | archery_range | ottoman_reform |
| prussia_unique_unit | 近卫掷弹兵 | 近代 | land / infantry | 113 | 47 / 30 / 1 | 1 | wood:52 / stone:25 / food:54 / gold:48 | ["light"] | ["ranged"] | barracks_hall | prussia |
| qing_unique_unit | 湘军火枪队 | 近代 | land / ranged | 108 | 43 / 28 / 8 | 1 | wood:52 / stone:25 / food:54 / gold:40 | ["infantry"] | ["cavalry"] | archery_range | qing |
| russian_empire_unique_unit | 哥萨克骑兵 | 近代 | land / cavalry | 112 | 46 / 29 / 1 | 1 | wood:52 / stone:25 / food:54 / gold:46 | ["ranged","light"] | ["spear"] | stable | russian_empire |
| tank | 坦克 | 近代 | land / artillery | 60 | 30 / 24 / 3 | 10 | wood:15 / stone:35 / food:30 / gold:20 | — | — | — | 通用 |
| usa_industrial_unique_unit | 边疆步枪手 | 近代 | land / ranged | 114 | 48 / 30 / 8 | 1 | wood:52 / stone:25 / food:54 / gold:50 | ["infantry"] | ["cavalry"] | archery_range | usa_industrial |
| battleship | 战列舰 | 现代 | naval / navy | 70 | 36 / 26 / 5 | 11 | wood:30 / stone:40 / food:40 / gold:30 | — | — | — | 通用 |
| brazil_modern_unique_unit | 丛林特战旅 | 现代 | land / special | 139 | 59 / 37 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:66 | ["siege","support"] | ["cavalry"] | war_academy | brazil_modern |
| china_modern_unique_unit | 机械化步兵旅 | 现代 | land / special | 129 | 50 / 33 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:48 | ["siege","support"] | ["cavalry"] | war_academy | china_modern |
| france_modern_unique_unit | 外籍军团 | 现代 | land / infantry | 133 | 54 / 35 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:56 | ["light"] | ["ranged"] | barracks_hall | france_modern |
| germany_modern_unique_unit | 装甲掷弹兵 | 现代 | land / special | 135 | 55 / 35 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:58 | ["siege","support"] | ["cavalry"] | war_academy | germany_modern |
| india_modern_unique_unit | 山地步兵 | 现代 | land / infantry | 136 | 56 / 36 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:60 | ["light"] | ["ranged"] | barracks_hall | india_modern |
| indonesia_modern_unique_unit | 群岛海军陆战队 | 现代 | naval / navy | 141 | 61 / 38 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:70 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | indonesia_modern |
| japan_modern_unique_unit | 海上护卫队 | 现代 | naval / navy | 137 | 57 / 36 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:62 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | japan_modern |
| jet_fighter | 喷气式战机 | 现代 | land / cavalry | 120 | 28 / 34 / 6 | 12 | wood:40 / stone:40 / food:60 / gold:40 | — | — | — | 通用 |
| korea_modern_unique_unit | 网络化陆战队 | 现代 | land / special | 138 | 58 / 37 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:64 | ["siege","support"] | ["cavalry"] | war_academy | korea_modern |
| missile_destroyer | 导弹驱逐舰 | 现代 | naval / navy | 160 | 42 / 48 / 7 | 14 | wood:40 / stone:55 / food:55 / gold:50 | — | — | — | 通用 |
| modern_anti_cavalry_3 | 防空导弹队 | 现代 | land / anti_cavalry | 128 | 57 / 40 / 1 | 1 | wood:58 / stone:22 / food:54 / gold:44 | ["cavalry"] | ["ranged"] | barracks_hall | 通用 |
| modern_cavalry_4 | 主战坦克 | 现代 | land / cavalry | 130 | 58 / 41 / 1 | 1 | wood:58 / stone:22 / food:54 / gold:45 | ["ranged","light"] | ["spear"] | stable | 通用 |
| modern_infantry | 现代步兵 | 现代 | land / infantry | 42 | 14 / 16 / 4 | 7 | wood:30 / stone:20 / food:45 / gold:20 | — | — | — | 通用 |
| modern_infantry_1 | 机械化步兵 | 现代 | land / infantry | 124 | 55 / 38 / 1 | 1 | wood:58 / stone:22 / food:54 / gold:42 | ["light"] | ["ranged"] | barracks_hall | 通用 |
| modern_navy_7 | 导弹驱逐舰 | 现代 | naval / navy | 136 | 61 / 44 / 1 | 1 | wood:58 / stone:22 / food:54 / gold:48 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| modern_navy_8 | 攻击潜艇 | 现代 | naval / navy | 138 | 62 / 45 / 1 | 1 | wood:58 / stone:22 / food:54 / gold:49 | ["transport","vessel"] | ["fire_ship"] | grand_shipyard | 通用 |
| modern_ranged_2 | 特种作战队 | 现代 | land / ranged | 126 | 56 / 39 / 6 | 1 | wood:58 / stone:22 / food:54 / gold:43 | ["infantry"] | ["cavalry"] | archery_range | 通用 |
| modern_siege_5 | 远程火箭炮 | 现代 | land / siege | 132 | 59 / 42 / 6 | 1 | wood:58 / stone:64 / food:54 / gold:46 | ["building"] | ["light","cavalry"] | siege_workshop | 通用 |
| modern_special_6 | 无人机分队 | 现代 | land / special | 134 | 60 / 43 / 1 | 1 | wood:58 / stone:22 / food:54 / gold:47 | ["siege","support"] | ["cavalry"] | war_academy | 通用 |
| nigeria_modern_unique_unit | 西非维和旅 | 现代 | land / special | 140 | 60 / 38 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:68 | ["siege","support"] | ["cavalry"] | war_academy | nigeria_modern |
| rocket_artillery | 火箭炮 | 现代 | land / artillery | 140 | 24 / 42 / 6 | 13 | wood:25 / stone:50 / food:40 / gold:35 | — | — | — | 通用 |
| russia_modern_unique_unit | 近卫坦克军 | 现代 | land / special | 131 | 52 / 34 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:52 | ["siege","support"] | ["cavalry"] | war_academy | russia_modern |
| uk_modern_unique_unit | 皇家突击队 | 现代 | land / special | 132 | 53 / 34 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:54 | ["siege","support"] | ["cavalry"] | war_academy | uk_modern |
| usa_modern_unique_unit | 装甲特遣队 | 现代 | land / special | 130 | 51 / 33 / 1 | 1 | wood:60 / stone:29 / food:62 / gold:50 | ["siege","support"] | ["cavalry"] | war_academy | usa_modern |
