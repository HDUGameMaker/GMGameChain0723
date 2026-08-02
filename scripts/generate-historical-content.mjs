import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const icon = (category, id) => `assets/historical-icons/${category}/${id}.svg`;
const cost = (wood, stone, food, gold) => [
  ['wood', wood], ['stone', stone], ['food', food], ['gold', gold]
].filter(([, amount]) => amount > 0).map(([resourceId, amount]) => ({ resourceId, amount }));

const eraDefs = [
  ['ancient', '远古时代', '公元前10000年—前1200年', 0, 0],
  ['classical', '古典时代', '公元前1200年—公元500年', 1, 5],
  ['medieval', '中世纪', '500年—1450年', 2, 8],
  ['exploration', '探索时代', '1450年—1750年', 3, 11],
  ['industrial', '工业时代', '1750年—1914年', 4, 14],
  ['modern', '现代时代', '1914年—1991年', 5, 17],
  ['information', '信息时代', '1991年至未来', 6, 20]
];
const eras = eraDefs.map(([id, name, timeline, order, starRequirement]) => ({
  id, name, timeline, order, starRequirement, researchCompletionRequired: 0.7,
  icon: icon('eras', id)
}));

const civDefs = {
  ancient: [
    ['huaxia_tribes', '华夏部落', '陶寺武士', '夯土聚落', '河洛先民', '河谷农耕'],
    ['sumer', '苏美尔', '战车矛兵', '塔庙', '最初的城市', '灌溉渠网'],
    ['old_egypt', '古埃及', '梅杰弓手', '尼罗河神庙', '尼罗河赠礼', '石工传统'],
    ['indus', '印度河文明', '城卫矛兵', '大浴场', '规划城市', '公共卫生'],
    ['minoan', '米诺斯', '海宫卫队', '克诺索斯宫', '群岛航路', '宫殿贸易'],
    ['akkad', '阿卡德', '阿卡德常备军', '总督府', '四方之王', '常备军制'],
    ['hittite', '赫梯', '三人战车', '铁工堡垒', '安纳托利亚铁', '战车工艺'],
    ['olmec', '奥尔梅克', '美洲豹战士', '巨石头像广场', '雨林开拓', '仪式中心']
  ],
  classical: [
    ['han', '汉', '羽林骑', '长安宫阙', '郡县天下', '丝路商队'],
    ['rome', '罗马', '罗马军团', '广场', '条条大路通罗马', '军团工程'],
    ['achaemenid', '波斯', '不死军', '驿站', '王家大道', '行省治理'],
    ['maurya', '孔雀王朝', '战象军', '阿育王石柱', '法治诏令', '大象军团'],
    ['athens', '雅典', '重装步兵', '卫城', '公民议政', '海上同盟'],
    ['sparta', '斯巴达', '斯巴达重步兵', '公共军营', '尚武城邦', '终身军训'],
    ['carthage', '迦太基', '圣团步兵', '商港', '腓尼基商路', '雇佣军契约'],
    ['maya_classic', '玛雅', '投枪武士', '阶梯金字塔', '长纪历法', '雨林城邦']
  ],
  medieval: [
    ['tang', '唐', '玄甲军', '大明宫', '万国来朝', '均田府兵'],
    ['franks', '法兰西', '法兰西骑士', '哥特大教堂', '封建采邑', '骑士冲锋'],
    ['england', '英格兰', '长弓卫队', '城堡庄园', '王室法庭', '长弓齐射'],
    ['byzantium', '拜占庭', '瓦兰吉卫队', '狄奥多西城墙', '罗马遗产', '希腊火防线'],
    ['abbasid', '阿拔斯', '马穆鲁克', '智慧宫', '翻译运动', '商旅驿站'],
    ['mongol', '蒙古', '怯薛骑射手', '斡耳朵', '草原驿骑', '机动汗国'],
    ['delhi', '德里苏丹国', '古拉姆骑兵', '宣礼塔', '印度斯坦税制', '边疆要塞'],
    ['aztec', '阿兹特克', '鹰战士', '大神庙', '湖上都城', '贡赋同盟']
  ],
  exploration: [
    ['ming', '明', '神机营', '宝船厂', '朝贡海贸', '火器营制'],
    ['spain', '西班牙', '征服者', '传教会所', '白银船队', '方阵火枪'],
    ['portugal', '葡萄牙', '海军步兵', '航海学院', '远洋航路', '卡拉维尔帆船'],
    ['ottoman', '奥斯曼', '耶尼切里', '帝国兵工厂', '海峡帝国', '重炮攻城'],
    ['venice', '威尼斯', '斯基亚沃尼卫队', '军械库', '潟湖共和国', '流水造船'],
    ['dutch', '荷兰', '海上乞丐', '东印度商馆', '股份贸易', '低地水工'],
    ['mughal', '莫卧儿', '火枪战象', '红堡花园', '印度斯坦盛世', '复合军团'],
    ['inca', '印加', '玻利维亚投石兵', '梯田神庙', '安第斯路网', '山地动员']
  ],
  industrial: [
    ['qing', '大清', '湘军火枪队', '江南制造局', '多省财赋', '洋务自强'],
    ['french_empire', '法兰西帝国', '老近卫军', '凯旋门', '拿破仑法典', '军团制'],
    ['british_empire', '大英帝国', '红衫步兵', '皇家船坞', '日不落航线', '工业舰队'],
    ['prussia', '普鲁士', '近卫掷弹兵', '总参谋部', '军国行政', '任务式指挥'],
    ['russian_empire', '俄罗斯帝国', '哥萨克骑兵', '冬宫兵工厂', '广袤腹地', '纵深防御'],
    ['usa_industrial', '美国', '边疆步枪手', '流水线工厂', '大陆拓殖', '标准化生产'],
    ['meiji_japan', '明治日本', '近卫师团', '官营制铁所', '文明开化', '富国强兵'],
    ['mexico_industrial', '墨西哥', '乡村骑兵', '银矿庄园', '高原共和国', '矿业出口']
  ],
  modern: [
    ['china_modern', '中国', '机械化步兵旅', '大型联合工厂', '全民建设', '纵深动员'],
    ['usa_modern', '美国', '装甲特遣队', '航空工业城', '大规模生产', '联合兵种'],
    ['ussr', '苏联', '近卫坦克军', '重工业联合体', '计划工业化', '大纵深作战'],
    ['uk_modern', '英国', '皇家突击队', '雷达站', '海空防线', '特种作战'],
    ['france_modern', '法国', '外籍军团', '马奇诺要塞', '共和传统', '机动作战'],
    ['germany_modern', '德国', '装甲掷弹兵', '精密机械厂', '工程体系', '任务式战术'],
    ['india_modern', '印度', '山地步兵', '国家理工学院', '多元联邦', '高原防卫'],
    ['japan_modern', '日本', '海上护卫队', '综合制造所', '精益工业', '岛链防御']
  ],
  information: [
    ['china_info', '中国', '合成作战旅', '高速铁路枢纽', '超大规模建设', '体系作战'],
    ['usa_info', '美国', '数字化战斗旅', '航天中心', '全球创新网', '信息优势'],
    ['eu', '欧盟', '欧盟战斗群', '跨国研究区', '共同市场', '联合研发'],
    ['india_info', '印度', '信息化山地军', '软件科技园', '数字公共设施', '服务网络'],
    ['japan_info', '日本', '先进护卫舰', '机器人产业园', '精密社会', '自动化生产'],
    ['korea_info', '韩国', '网络化陆战队', '半导体园区', '高速创新', '电子制造'],
    ['brazil_info', '巴西', '丛林特战旅', '生物科技园', '绿色国土', '雨林机动'],
    ['african_union', '非洲联盟', '联合维和旅', '泛非物流港', '大陆协作', '区域联运']
  ]
};

const branchCycle = ['infantry', 'ranged', 'anti_cavalry', 'cavalry', 'siege', 'special', 'navy', 'navy'];
const laneFor = branch => ({ infantry: 'front', anti_cavalry: 'front', ranged: 'rear', cavalry: 'flank', siege: 'siege', special: 'support', navy: 'naval' }[branch]);
const trainingFor = branch => ({ infantry: 'barracks_hall', ranged: 'archery_range', anti_cavalry: 'barracks_hall', cavalry: 'stable', siege: 'siege_workshop', special: 'war_academy', navy: 'grand_shipyard' }[branch]);
const tagsFor = branch => ({
  infantry: ['melee', 'shield'], ranged: ['ranged', 'light'], anti_cavalry: ['spear', 'melee'], cavalry: ['cavalry', 'shock'],
  siege: ['siege', 'engine'], special: ['light', 'support'], navy: ['naval', 'vessel']
}[branch]);
const matchupFor = branch => ({
  infantry: [['light'], ['ranged']], ranged: [['infantry'], ['cavalry']], anti_cavalry: [['cavalry'], ['ranged']], cavalry: [['ranged', 'light'], ['spear']],
  siege: [['building'], ['light', 'cavalry']], special: [['siege', 'support'], ['cavalry']], navy: [['transport', 'vessel'], ['fire_ship']]
}[branch]);

const civilizations = [];
const uniqueUnits = [];
for (const era of eras) {
  civDefs[era.id].forEach((entry, index) => {
    const [id, name, unitName, buildingName, legacyName, traitName] = entry;
    const branch = branchCycle[index];
    const domain = branch === 'navy' ? 'naval' : 'land';
    const [strongAgainst, weakAgainst] = matchupFor(branch);
    const uniqueUnitId = `${id}_unique_unit`;
    civilizations.push({
      id, name, eraId: era.id, summary: `${name}的历史道路，以${legacyName}与${traitName}塑造当代。`,
      legacy: { name: legacyName, description: `${legacyName}成为跨时代永久遗产。`, effects: { legacyScoreBonus: 1 + era.order } },
      trait: { name: traitName, description: `${traitName}强化本时代的建设、外交或军事优势。`, effects: { eraProductionMul: 1.05 + index * 0.005 } },
      uniqueUnitId,
      uniqueBuilding: { id: `${id}_unique_building`, name: buildingName, replaces: index % 2 ? 'civic_hall' : 'academy', description: `${name}的特色建筑替代项。` },
      icon: icon('civilizations', id)
    });
    const scale = 4 + era.order * 18 + index;
    uniqueUnits.push({
      id: uniqueUnitId, name: unitName, eraId: era.id, civilizationId: id, unique: true, domain, branch,
      lane: laneFor(branch), trainingBuildingId: trainingFor(branch), populationRequired: domain === 'naval' ? 3 : (branch === 'siege' ? 2 : 1),
      combatPower: Math.round(scale * 1.15), hp: 8 + era.order * 7 + index, attack: 3 + era.order * 5 + Math.floor(index / 2), attackRange: ['ranged', 'siege'].includes(branch) ? 3 + era.order : 1,
      roleTags: tagsFor(branch), strongAgainst, weakAgainst,
      cost: cost(12 + era.order * 8, branch === 'siege' ? 20 + era.order * 7 : 5 + era.order * 4, 14 + era.order * 8, era.order * 8 + index * 2),
      icon: icon('units', uniqueUnitId), unlocked: false
    });
  });
}

const techNames = {
  ancient: ['石器加工', '定居农业', '制陶工艺', '早期冶金', '轮轴运输', '航河木舟', '城墙营造', '文字记事'],
  classical: ['铁器锻造', '道路工程', '复合弓', '水利机械', '攻城机械', '远洋帆装', '医学体系', '几何测量'],
  medieval: ['重犁农业', '马镫技术', '堡垒工程', '弩机改良', '火药雏形', '远洋罗盘', '造纸印刷', '大学制度'],
  exploration: ['活字印刷', '海图测绘', '远洋船体', '火绳枪械', '铸造火炮', '金融会计', '科学方法', '殖民补给'],
  industrial: ['蒸汽动力', '机械纺织', '铁路运输', '电报通信', '内燃机', '现代化学', '钢铁工业', '流水生产'],
  modern: ['无线通信', '装甲车辆', '航空工程', '雷达探测', '抗生素', '喷气动力', '火箭技术', '电子计算'],
  information: ['卫星网络', '精密制导', '数字通信', '机器人生产', '新能源电网', '生物工程', '人工智能', '太空工程']
};
const civicNames = {
  ancient: ['氏族议事', '祖先传统', '公共祭仪', '习惯法', '劳役组织', '物物交换', '部落联盟', '早期官僚'],
  classical: ['成文法典', '公民大会', '郡县行政', '行省治理', '职业军队', '古典教育', '帝国驿传', '多神宽容'],
  medieval: ['封建契约', '行会制度', '骑士精神', '宗教法庭', '城市自治', '科举官僚', '驿站体系', '海贸特许'],
  exploration: ['中央集权', '常备军制', '重商主义', '海军法典', '殖民公司', '启蒙沙龙', '外交使团', '测绘档案'],
  industrial: ['国民教育', '现代税制', '民族国家', '职业警察', '工厂法案', '普遍兵役', '公共卫生', '代议制度'],
  modern: ['社会保障', '大众传媒', '国家动员', '国际组织', '现代大学', '职业外交', '劳动权利', '文化遗产'],
  information: ['数字治理', '全球供应链', '知识经济', '环境公约', '公共数据', '跨国科研', '危机管理', '多边联盟']
};
const makeTree = (kind, namesByEra) => eras.flatMap(era => namesByEra[era.id].map((name, index) => ({
  id: `${kind}_${era.id}_${index + 1}`, name, eraId: era.id, eraOrder: era.order, pageIndex: index,
  tier: era.order, researchTime: 4 + era.order * 2 + Math.floor(index / 2), pointCost: 12 + era.order * 14 + index * 3,
  prerequisites: index === 0 ? [] : [`${kind}_${era.id}_${index}`],
  effects: kind === 'tech' ? { productionMul: 1 + (index + 1) * 0.01 } : { satisfactionBonus: index % 3 === 0 ? 1 : 0, diplomacyMul: 1 + index * 0.005 },
  icon: icon(kind === 'tech' ? 'techs' : 'civics', `${kind}_${era.id}_${index + 1}`)
})));
const techs = makeTree('tech', techNames);
const civics = makeTree('civic', civicNames);

const genericNames = {
  ancient: ['氏族战士', '投石手', '猎矛兵', '早期战车', '冲车', '斥候', '独木舟', '战斗木舟'],
  classical: ['持盾剑士', '复合弓手', '方阵枪兵', '具装骑兵', '弩炮', '轻装标枪兵', '三列桨战船', '五列桨战船'],
  medieval: ['披甲步兵', '弩手', '长枪方阵', '重装骑士', '配重投石机', '边境游骑', '桨帆战船', '武装柯克船'],
  exploration: ['长枪兵', '火绳枪手', '胸甲骑兵', '野战炮', '工兵队', '龙骑兵', '盖伦帆船', '火船'],
  industrial: ['线列步兵', '后膛步枪兵', '枪骑兵', '榴弹炮', '野战工程兵', '机枪队', '铁甲舰', '鱼雷艇'],
  modern: ['现代步兵', '摩托化步兵', '中型坦克', '自行火炮', '反坦克分队', '战斗机', '驱逐舰', '潜艇'],
  information: ['机械化步兵', '特种作战队', '主战坦克', '远程火箭炮', '防空导弹队', '无人机分队', '导弹驱逐舰', '攻击核潜艇']
};
const genericUnits = [];
for (const era of eras) {
  genericNames[era.id].forEach((name, index) => {
    const branch = branchCycle[index];
    const domain = branch === 'navy' ? 'naval' : 'land';
    const [strongAgainst, weakAgainst] = matchupFor(branch);
    const id = `${era.id}_${branch}_${index + 1}`;
    genericUnits.push({
      id, name, eraId: era.id, domain, branch, lane: laneFor(branch), trainingBuildingId: trainingFor(branch),
      populationRequired: domain === 'naval' ? 3 + Math.floor(era.order / 2) : (branch === 'siege' ? 2 : 1),
      combatPower: 4 + era.order * 20 + index * 2, hp: 7 + era.order * 8 + index, attack: 2 + era.order * 6 + index,
      attackRange: ['ranged', 'siege'].includes(branch) ? 3 + Math.floor(era.order / 2) : 1,
      roleTags: tagsFor(branch), strongAgainst, weakAgainst,
      cost: cost(10 + era.order * 8, branch === 'siege' ? 16 + era.order * 8 : 4 + era.order * 3, 12 + era.order * 7, era.order * 7 + index),
      icon: icon('units', id), unlocked: era.order === 0 && index < 3
    });
  });
}
const units = [...genericUnits, ...uniqueUnits];

const luxuryDefs = [
  ['silk', '丝绸', 'F', { diplomacyMul: 1.08 }], ['jade', '玉石', 'R', { civicPointMul: 1.1 }],
  ['tea', '茶叶', 'G', { sciencePointMul: 1.08 }], ['spices', '香料', 'F', { foodConsumeMul: 0.95 }],
  ['ivory', '象牙', 'G', { cavalryPowerMul: 1.08 }], ['wine', '葡萄酒', 'G', { satisfactionBonus: 5 }],
  ['incense', '熏香', 'D', { civicSpeedMul: 1.08 }], ['gems', '宝石', 'R', { goldProductionMul: 1.1 }],
  ['pearls', '珍珠', 'S', { navalPowerMul: 1.08 }], ['amber', '琥珀', 'S', { tradeValueMul: 1.1 }],
  ['fur', '毛皮', 'F', { weatherPenaltyMul: 0.8 }], ['dyes', '染料', 'F', { cultureVictoryScoreBonus: 2 }],
  ['cocoa', '可可', 'F', { growthMul: 1.06 }], ['coffee', '咖啡', 'G', { researchSpeedMul: 1.06 }],
  ['porcelain', '瓷器', 'D', { outpostRelationGainBonus: 2 }], ['perfume', '香水', 'G', { heroRefreshDaysBonus: -1 }],
  ['silverware', '银器', 'R', { administrationMul: 1.08 }], ['horses', '良马', 'G', { cavalrySpeedMul: 1.1 }],
  ['salt', '盐', 'R', { foodStorageMul: 1.15 }], ['cotton', '棉花', 'G', { housingCapacityMul: 1.08 }]
];
const luxuries = luxuryDefs.map(([id, name, groundType, effects], index) => ({
  id, name, description: `首份${name}提供帝国加成，重复份可在市场与城邦贸易。`, groundType,
  developmentBuildingId: index % 5 === 3 ? 'luxury_workshop' : 'trade_depot', baseTradeValue: 24 + index * 3,
  satisfaction: 4, effects, icon: icon('luxuries', id)
}));

const buildingDefs = [
  ['timber_house', '木构民居', 'housing', 0, { housingCapacity: 16 }],
  ['stone_tenement', '石砌民居', 'housing', 0, { housingCapacity: 14 }],
  ['manor', '庄园', 'housing', 2, { housingCapacity: 24, satisfactionBonus: 2 }],
  ['forestry_camp', '林业营地', 'gathering', 5, { resourceId: 'wood', amount: 2 }],
  ['stone_quarry', '石料采掘场', 'gathering', 5, { resourceId: 'stone', amount: 2 }],
  ['grain_farm', '粮食农场', 'gathering', 6, { resourceId: 'food', amount: 3 }],
  ['gold_mine', '金矿', 'gathering', 4, { resourceId: 'gold', amount: 1 }],
  ['granary_hall', '粮仓', 'storage', 3, { foodStorageMul: 1.25, spoilageMul: 0.8 }],
  ['central_warehouse', '中央仓库', 'storage', 3, { storageMultiplier: 1.25 }],
  ['academy', '学院', 'research', 6, { unlockSystem: 'tech', sciencePerWorker: 1 }],
  ['library', '图书馆', 'research', 4, { sciencePerWorker: 1.5, researchSpeedMul: 1.05 }],
  ['monument', '纪念碑', 'civic', 3, { unlockSystem: 'civics', civicPerWorker: 1 }],
  ['civic_hall', '人文馆', 'civic', 6, { unlockSystem: 'civics', civicPerWorker: 1.5 }],
  ['council_hall', '议政厅', 'administration', 5, { civicPerWorker: 1, administrationMul: 1.1 }],
  ['market_square', '市场', 'commerce', 4, { unlockSystem: 'luxury_trade', goldPerWorker: 1 }],
  ['trade_depot', '商栈', 'commerce', 5, { tradeValueMul: 1.12, routeCapacity: 1 }],
  ['luxury_workshop', '奢侈品工坊', 'commerce', 4, { luxuryYieldBonus: 1 }],
  ['embassy', '使馆', 'diplomacy', 4, { unlockSystem: 'advanced_diplomacy', relationGainBonus: 2 }],
  ['courthouse', '法院', 'administration', 4, { territoryUpkeepMul: 0.9 }],
  ['barracks_hall', '步兵营', 'military', 4, { trainsBranches: ['infantry', 'anti_cavalry'], soldierCapacity: 10 }],
  ['archery_range', '靶场', 'military', 4, { trainsBranches: ['ranged'], rangedTrainingMul: 1.15 }],
  ['stable', '马厩', 'military', 5, { trainsBranches: ['cavalry'], cavalryTrainingMul: 1.15 }],
  ['siege_workshop', '攻城工坊', 'military', 6, { trainsBranches: ['siege'], siegePowerMul: 1.08 }],
  ['war_academy', '军事学院', 'military', 5, { trainsBranches: ['special'], commandPointsBonus: 5 }],
  ['castle', '城堡', 'defense', 3, { soldierCapacity: 20, defensePower: 60, unlockEliteUnits: true }],
  ['city_wall', '城墙', 'defense', 3, { defensePower: 35, blocksEnemyMovement: true }],
  ['watch_tower', '瞭望塔', 'defense', 2, { visionRadius: 8, defensePower: 12 }],
  ['harbor', '港口', 'naval', 5, { routeCapacity: 2, navalSupply: 10 }],
  ['grand_shipyard', '大型造船厂', 'naval', 6, { trainsBranches: ['navy'], navalTrainingMul: 1.15 }],
  ['lighthouse', '灯塔', 'naval', 3, { navalVisionRadius: 12, navalSpeedMul: 1.08 }],
  ['engineers_guild', '工程师行会', 'industry', 5, { buildSpeedMul: 1.12, repairMul: 1.2 }],
  ['blacksmith', '铁匠铺', 'industry', 5, { meleePowerMul: 1.06 }],
  ['tavern_hall', '历史酒馆', 'hero', 3, { unlockSystem: 'heroes', heroOfferBonus: 1 }],
  ['strategy_office', '谋略府', 'strategy', 4, { unlockSystem: 'strategies', strategyCooldownMul: 0.9 }]
];
const buildings = buildingDefs.map(([id, name, category, maxWorkers, uniqueFunction], index) => ({
  id, name, category, description: `${name}承担${category}体系中的独特职责。`, footprint: { width: index % 4 === 0 ? 2 : 1, height: index % 4 === 0 ? 2 : 1 },
  maxCount: null, initialBuilding: id === 'timber_house', maxWorkers, jobType: category,
  buildCost: cost(24 + index * 3, 12 + index * 2, index % 6 === 0 ? 10 : 0, Math.floor(index / 3) * 3),
  buildTime: 1 + Math.floor(index / 10), unlockConditions: [], production: uniqueFunction.resourceId ? { perWorker: true, output: [{ resourceId: uniqueFunction.resourceId, amount: uniqueFunction.amount }] } : null,
  housingCapacity: uniqueFunction.housingCapacity || 0,
  soldierCapacity: uniqueFunction.soldierCapacity || 0,
  storageMultiplier: uniqueFunction.storageMultiplier || undefined,
  allowedGrounds: id === 'forestry_camp' ? ['F'] : (id === 'stone_quarry' || id === 'gold_mine' ? ['R'] : (id === 'grain_farm' ? ['G', 'D'] : undefined)),
  uniqueFunction, icon: icon('buildings', id), imageDetail: icon('buildings', id), mapIcon: icon('buildings', id),
  labelLayout: { nameOffsetY: 0, progressBarOffsetY: 0, workersOffsetY: 0 }, tags: [category]
}));

const heroDefs = {
  ancient: [['yu_the_great', '大禹', 'engineer'], ['imhotep', '伊姆霍特普', 'scholar'], ['sargon', '萨尔贡', 'commander'], ['hatshepsut', '哈特谢普苏特', 'diplomat'], ['hammurabi', '汉谟拉比', 'governor']],
  classical: [['han_xin', '韩信', 'commander'], ['zhang_qian', '张骞', 'explorer'], ['caesar', '恺撒', 'commander'], ['ashoka', '阿育王', 'governor'], ['archimedes', '阿基米德', 'engineer']],
  medieval: [['li_shimin', '李世民', 'governor'], ['charlemagne', '查理曼', 'commander'], ['saladin', '萨拉丁', 'diplomat'], ['genghis_khan', '成吉思汗', 'commander'], ['zheng_he_early', '汪大渊', 'explorer']],
  exploration: [['zheng_he', '郑和', 'explorer'], ['elcano', '埃尔卡诺', 'explorer'], ['suleiman', '苏莱曼一世', 'governor'], ['da_vinci', '达·芬奇', 'engineer'], ['elizabeth_i', '伊丽莎白一世', 'diplomat']],
  industrial: [['napoleon', '拿破仑', 'commander'], ['bismarck', '俾斯麦', 'diplomat'], ['lin_zexu', '林则徐', 'governor'], ['stephenson', '乔治·斯蒂芬森', 'engineer'], ['florence_nightingale', '南丁格尔', 'physician']],
  modern: [['sun_yat_sen', '孙中山', 'governor'], ['zhukov', '朱可夫', 'commander'], ['turing', '艾伦·图灵', 'scholar'], ['qian_xuesen', '钱学森', 'engineer'], ['gandhi', '甘地', 'diplomat']],
  information: [['tu_youyou', '屠呦呦', 'physician'], ['yuan_longping', '袁隆平', 'scholar'], ['tim_berners_lee', '蒂姆·伯纳斯-李', 'engineer'], ['wangari_maathai', '旺加里·马塔伊', 'diplomat'], ['mae_jemison', '梅·杰米森', 'explorer']]
};
const heroes = eras.flatMap(era => heroDefs[era.id].map(([id, name, role], index) => ({
  id, name, eraId: era.id, role, description: `${name}以${role}专长服务城市与军队。`,
  recruitCost: cost(20 + era.order * 12, 10 + era.order * 8, 25 + era.order * 10, 20 + era.order * 18),
  recoveryDays: 3 + Math.floor(era.order / 2), bonuses: { [`${role}PowerMul`]: 1.08 + index * 0.02 },
  aura: { radius: 3 + era.order, effect: role }, icon: icon('heroes', id)
})));

const strategyDefs = [
  ['forced_march', '急行军', 'army_speed', { multiplier: 1.35, durationTicks: 6 }],
  ['harvest_drive', '抢收动员', 'regional_production', { resourceId: 'food', multiplier: 1.5, durationTicks: 8 }],
  ['timber_quota', '木材统筹', 'regional_production', { resourceId: 'wood', multiplier: 1.5, durationTicks: 8 }],
  ['stone_quota', '石料统筹', 'regional_production', { resourceId: 'stone', multiplier: 1.5, durationTicks: 8 }],
  ['emergency_tax', '紧急征税', 'instant_resource', { resourceId: 'gold', amount: 120, satisfactionCost: 8 }],
  ['research_focus', '集中攻关', 'research_speed', { multiplier: 1.6, durationTicks: 8 }],
  ['civic_campaign', '公共宣讲', 'civic_speed', { multiplier: 1.6, durationTicks: 8 }],
  ['rapid_repairs', '工程抢修', 'repair', { percent: 0.35 }],
  ['naval_blockade', '封锁航道', 'enemy_naval_debuff', { multiplier: 0.7, durationTicks: 8 }],
  ['false_intelligence', '散布假情报', 'enemy_power_debuff', { multiplier: 0.8, durationTicks: 6 }],
  ['delay_advance', '迟滞作战', 'freeze_enemy_countdown', { durationTicks: 4 }],
  ['fortify', '就地设防', 'defense_buff', { multiplier: 1.4, durationTicks: 6 }],
  ['rationing', '战时配给', 'food_consume', { multiplier: 0.65, durationDays: 2 }],
  ['market_intervention', '市场干预', 'trade_value', { multiplier: 1.4, durationDays: 2 }],
  ['diplomatic_mission', '特使斡旋', 'relation_gain', { amount: 18 }],
  ['open_granaries', '开仓赈济', 'satisfaction', { amount: 12, resourceId: 'food', cost: 80 }],
  ['veteran_recall', '召回老兵', 'restore_units', { percent: 0.25 }],
  ['coastal_patrol', '沿海巡防', 'naval_vision', { radius: 12, durationTicks: 12 }],
  ['counter_siege', '反攻城准备', 'anti_siege', { multiplier: 1.5, durationTicks: 8 }],
  ['scorched_supply', '破坏补给', 'enemy_supply', { multiplier: 0.6, durationTicks: 6 }],
  ['public_works', '公共工程', 'build_speed', { multiplier: 1.5, durationTicks: 8 }],
  ['merchant_convoy', '护航商队', 'trade_route', { bonusGold: 90 }],
  ['heroic_address', '统帅演说', 'morale', { amount: 20, durationTicks: 6 }],
  ['survey_corps', '测绘队', 'reveal_map', { radius: 16 }]
];
const strategies = strategyDefs.map(([id, name, effectType, params], index) => ({
  id, name, category: index < 5 ? 'economy' : (index < 13 ? 'military' : 'administration'),
  description: `${name}是一张由任务、事件、英雄或时代星获得的一次性历史策略卡。`, effectType, params,
  cooldownDays: index % 4, rarity: index % 6 === 0 ? 'rare' : 'common', icon: icon('strategies', id)
}));

const content = {
  schemaVersion: 1,
  eraSettings: { researchCompletionRequired: 0.7, civilizationSelectionRequired: true, retainLegacyBonuses: true },
  populationSettings: { initial: 12, minimumAfterMigration: 8, foodPerPerson: 1, baseSatisfaction: 60, starvationEmigrationThreshold: 35 },
  eras, civilizations, luxuries, buildings, techs, civics, units, heroes, strategies
};

const output = resolve(import.meta.dirname, '../config/historical_content.json');
writeFileSync(output, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
console.log(`Generated ${output}`);
console.log(JSON.stringify({
  eras: eras.length, civilizations: civilizations.length, luxuries: luxuries.length,
  buildings: buildings.length, techs: techs.length, civics: civics.length,
  units: units.length, heroes: heroes.length, strategies: strategies.length
}));
