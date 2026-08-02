import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const icon = (category, id) => `assets/historical-icons/${category}/${id}.svg`;
const cost = (wood, stone, food, gold) => [
  ['wood', wood], ['stone', stone], ['food', food], ['gold', gold]
].filter(([, amount]) => amount > 0).map(([resourceId, amount]) => ({ resourceId, amount }));

const eraDefs = [
  ['primitive', '原始时代', '公元前10000年—前3000年', 0, 0],
  ['ancient', '上古时代', '公元前3000年—前500年', 1, 5],
  ['classical', '古典时代', '公元前500年—公元500年', 2, 8],
  ['medieval', '中世纪', '500年—1450年', 3, 11],
  ['exploration', '探索时代', '1450年—1750年', 4, 14],
  ['early_modern', '近代', '1750年—1949年', 5, 17],
  ['modern', '现代', '1949年至今', 6, 20]
];
const eras = eraDefs.map(([id, name, timeline, order, starRequirement]) => ({
  id, name, timeline, order, starRequirement, researchCompletionRequired: 0.7,
  icon: icon('eras', id)
}));

const civDefs = {
  primitive: [
    ['proto_civilization', '原始文明', '氏族猎手', '氏族火塘', '共同祖先', '采猎协作']
  ],
  ancient: [
    ['zhou', '周', '虎贲甲士', '礼乐宗庙', '封邦建国', '礼乐秩序'],
    ['assyria', '亚述', '亚述攻城队', '王家兵工场', '两河霸权', '攻城传统'],
    ['neo_babylon', '新巴比伦', '城门卫士', '空中花园', '星象历法', '灌溉城市'],
    ['old_egypt', '古埃及', '梅杰弓手', '尼罗河神庙', '尼罗河赠礼', '石工传统'],
    ['archaic_greece', '古希腊', '城邦重装兵', '卫城议事场', '爱琴海城邦', '公民方阵'],
    ['vedic_india', '吠陀印度', '吠陀战车', '吠陀祭坛', '恒河聚落', '祭礼传承']
  ],
  classical: [
    ['han', '汉', '羽林骑', '长安宫阙', '郡县天下', '丝路商队'],
    ['rome', '罗马', '罗马军团', '广场', '条条大路通罗马', '军团工程'],
    ['parthia', '帕提亚', '帕提亚骑射手', '商旅驿站', '丝路枢纽', '回马箭'],
    ['kushan', '贵霜', '贵霜具装骑兵', '犍陀罗寺院', '欧亚交汇', '商道包容'],
    ['aksum', '阿克苏姆', '高原矛卫', '方尖碑广场', '红海商路', '高原王国'],
    ['teotihuacan', '特奥蒂瓦坎', '黑曜石战士', '太阳金字塔', '高原都会', '黑曜石贸易'],
    ['maya_classic', '古典玛雅', '投枪武士', '阶梯金字塔', '长纪历法', '雨林城邦'],
    ['yamatai', '邪马台', '弥生弓卫', '祭政宫馆', '列岛联盟', '稻作共同体']
  ],
  medieval: [
    ['tang', '唐', '玄甲军', '大明宫', '万国来朝', '均田府兵'],
    ['abbasid', '阿拔斯', '马穆鲁克', '智慧宫', '翻译运动', '商旅驿站'],
    ['byzantium', '拜占庭', '瓦兰吉卫队', '狄奥多西城墙', '罗马遗产', '希腊火防线'],
    ['franks', '法兰克', '法兰克骑士', '加洛林宫廷', '封建采邑', '骑士冲锋'],
    ['anglo_saxon', '盎格鲁-撒克逊', '亲兵卫队', '木砦大厅', '郡县民兵', '盾墙传统'],
    ['srivijaya', '室利佛逝', '海峡水军', '海贸佛寺', '马六甲航路', '群岛贸易'],
    ['ghana_empire', '加纳帝国', '萨赫勒骑兵', '黄金商站', '跨撒哈拉商路', '黄金税赋'],
    ['heian_japan', '平安日本', '武士侍从', '平安京官署', '摄关政治', '庄园武备'],
    ['chola', '朱罗', '朱罗海军', '石造神庙', '孟加拉湾航线', '远洋征服'],
    ['toltec', '托尔特克', '鹰柱武士', '图拉武士柱殿', '中部高原霸权', '黑曜石军备']
  ],
  exploration: [
    ['ming', '明', '神机营', '宝船厂', '朝贡海贸', '火器营制'],
    ['ottoman', '奥斯曼', '耶尼切里', '帝国兵工厂', '海峡帝国', '重炮攻城'],
    ['spain', '西班牙', '征服者', '传教会所', '白银船队', '方阵火枪'],
    ['portugal', '葡萄牙', '卡拉维尔战船', '航海学院', '远洋航路', '海图学派'],
    ['england_exploration', '英格兰', '私掠船', '皇家交易所', '大西洋航路', '海权萌芽'],
    ['dutch', '荷兰', '海上乞丐', '东印度商馆', '股份贸易', '低地水工'],
    ['mughal', '莫卧儿', '火枪战象', '红堡花园', '印度斯坦盛世', '复合军团'],
    ['aztec', '阿兹特克', '鹰战士', '大神庙', '湖上都城', '贡赋同盟'],
    ['songhai', '桑海', '尼日尔骑兵', '廷巴克图学宫', '尼日尔商路', '盐金贸易'],
    ['sengoku_japan', '战国日本', '铁炮足轻', '山城天守', '战国动员', '兵农分离']
  ],
  early_modern: [
    ['qing', '大清', '湘军火枪队', '江南制造局', '多省财赋', '洋务自强'],
    ['british_empire', '大英帝国', '红衫步兵', '皇家船坞', '日不落航线', '工业舰队'],
    ['french_empire', '法兰西', '老近卫军', '凯旋门', '拿破仑法典', '军团制'],
    ['russian_empire', '俄罗斯帝国', '哥萨克骑兵', '冬宫兵工厂', '广袤腹地', '纵深防御'],
    ['prussia', '普鲁士', '近卫掷弹兵', '总参谋部', '军国行政', '任务式指挥'],
    ['usa_industrial', '美国', '边疆步枪手', '流水线工厂', '大陆拓殖', '标准化生产'],
    ['meiji_japan', '明治日本', '近卫师团', '官营制铁所', '文明开化', '富国强兵'],
    ['ottoman_reform', '奥斯曼改革', '新式步兵团', '坦志麦特官署', '帝国改革', '新军训练'],
    ['mexico_industrial', '墨西哥', '乡村骑兵', '银矿庄园', '高原共和国', '矿业出口'],
    ['brazil_empire', '巴西帝国', '帝国龙骑兵', '咖啡出口港', '热带帝国', '咖啡繁荣']
  ],
  modern: [
    ['china_modern', '中国', '机械化步兵旅', '大型联合工厂', '全民建设', '纵深动员'],
    ['usa_modern', '美国', '装甲特遣队', '航空工业城', '大规模生产', '联合兵种'],
    ['russia_modern', '俄罗斯', '近卫坦克军', '重工业联合体', '欧亚纵深', '大纵深作战'],
    ['uk_modern', '英国', '皇家突击队', '雷达站', '海空防线', '特种作战'],
    ['france_modern', '法国', '外籍军团', '马奇诺要塞', '共和传统', '机动作战'],
    ['germany_modern', '德国', '装甲掷弹兵', '精密机械厂', '工程体系', '任务式战术'],
    ['india_modern', '印度', '山地步兵', '国家理工学院', '多元联邦', '高原防卫'],
    ['japan_modern', '日本', '海上护卫队', '综合制造所', '精益工业', '岛链防御'],
    ['korea_modern', '韩国', '网络化陆战队', '半导体园区', '高速创新', '电子制造'],
    ['brazil_modern', '巴西', '丛林特战旅', '生物科技园', '绿色国土', '雨林机动'],
    ['nigeria_modern', '尼日利亚', '西非维和旅', '拉各斯物流港', '人口活力', '区域联运'],
    ['indonesia_modern', '印度尼西亚', '群岛海军陆战队', '群岛联运港', '千岛通衢', '海峡控制']
  ]
};

const uniqueUnitBranches = {
  '氏族猎手': 'ranged', '虎贲甲士': 'infantry', '亚述攻城队': 'siege', '城门卫士': 'anti_cavalry',
  '城邦重装兵': 'anti_cavalry', '吠陀战车': 'cavalry', '帕提亚骑射手': 'cavalry', '贵霜具装骑兵': 'cavalry',
  '高原矛卫': 'anti_cavalry', '弥生弓卫': 'ranged', '海峡水军': 'navy', '朱罗海军': 'navy',
  '卡拉维尔战船': 'navy', '私掠船': 'navy', '尼日尔骑兵': 'cavalry', '铁炮足轻': 'ranged',
  '新式步兵团': 'ranged', '帝国龙骑兵': 'cavalry', '西非维和旅': 'special', '群岛海军陆战队': 'navy',
  // 骑乘与高机动特色单位
  '战车矛兵': 'cavalry', '三人战车': 'cavalry', '羽林骑': 'cavalry', '战象军': 'cavalry',
  '法兰西骑士': 'cavalry', '马穆鲁克': 'cavalry', '怯薛骑射手': 'cavalry', '古拉姆骑兵': 'cavalry',
  '征服者': 'cavalry', '火枪战象': 'cavalry', '哥萨克骑兵': 'cavalry', '乡村骑兵': 'cavalry',
  // 远程与火器特色单位
  '梅杰弓手': 'ranged', '投枪武士': 'ranged', '长弓卫队': 'ranged', '神机营': 'ranged',
  '耶尼切里': 'ranged', '玻利维亚投石兵': 'ranged', '湘军火枪队': 'ranged', '边疆步枪手': 'ranged',
  // 反骑与重型阵列
  '城卫矛兵': 'anti_cavalry', '重装步兵': 'anti_cavalry', '斯巴达重步兵': 'anti_cavalry',
  '不死军': 'anti_cavalry', '罗马军团': 'anti_cavalry',
  // 明确的海军单位；名称含“海军”的陆战队仍归陆军
  '海上乞丐': 'navy', '海上护卫队': 'navy', '先进护卫舰': 'navy',
  // 现代合成、装甲和特战力量
  '装甲特遣队': 'special', '近卫坦克军': 'special', '皇家突击队': 'special',
  '装甲掷弹兵': 'special', '机械化步兵旅': 'special', '合成作战旅': 'special',
  '数字化战斗旅': 'special', '信息化山地军': 'special', '网络化陆战队': 'special',
  '丛林特战旅': 'special', '联合维和旅': 'special'
};
const branchForUniqueUnit = unitName => uniqueUnitBranches[unitName] || 'infantry';
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
const diplomaticPersonalities = ['cooperative', 'commercial', 'scholarly', 'defensive', 'expansionist', 'maritime'];
const civilizationSpecializations = [
  { productionMul: 1.06, buildSpeedMul: 1.04 },
  { tradeValueMul: 1.08, relationGainBonus: 2 },
  { sciencePointMul: 1.08, researchSpeedMul: 1.04 },
  { civicPointMul: 1.08, satisfactionBonus: 2 },
  { armyPowerMul: 1.06, trainingSpeedMul: 1.05 },
  { navalPowerMul: 1.08, routeCapacityBonus: 1 }
];
for (const era of eras) {
  civDefs[era.id].forEach((entry, index) => {
    const [id, name, unitName, buildingName, legacyName, traitName] = entry;
    const branch = branchForUniqueUnit(unitName);
    const domain = branch === 'navy' ? 'naval' : 'land';
    const [strongAgainst, weakAgainst] = matchupFor(branch);
    const uniqueUnitId = `${id}_unique_unit`;
    civilizations.push({
      id, name, eraId: era.id, summary: `${name}的历史道路，以${legacyName}与${traitName}塑造当代。`,
      legacy: { name: legacyName, description: `${legacyName}成为跨时代永久遗产。`, effects: { legacyScoreBonus: 1 + era.order, legacyProductionMul: 1.01 + era.order * 0.005 } },
      trait: { name: traitName, description: `${traitName}强化本时代的建设、外交或军事优势。`, effects: civilizationSpecializations[index % civilizationSpecializations.length] },
      uniqueUnitId,
      uniqueBuilding: { id: `${id}_unique_building`, name: buildingName, replaces: index % 2 ? 'civic_hall' : 'academy', description: `${name}的特色建筑替代项。` },
      technologyReplacement: { replaces: `tech_${era.id}_${(index % 8) + 1}`, name: `${traitName}技术`, effects: { researchSpeedMul: 1.03 + (index % 3) * 0.01 } },
      civicReplacement: { replaces: `civic_${era.id}_${((index + 3) % 8) + 1}`, name: `${legacyName}制度`, effects: { civicPointMul: 1.03 + (index % 3) * 0.01 } },
      diplomaticPersonality: diplomaticPersonalities[index % diplomaticPersonalities.length],
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
  primitive: ['打制石器', '掌握火种', '采集篮具', '狩猎协作', '简易棚屋', '兽皮加工', '独木舟', '口述记事'],
  ancient: ['青铜冶铸', '定居农业', '制陶工艺', '早期文字', '轮轴运输', '灌溉渠网', '城墙营造', '星象历法'],
  classical: ['铁器锻造', '道路工程', '复合弓', '水利机械', '攻城机械', '远洋帆装', '医学体系', '几何测量'],
  medieval: ['重犁农业', '马镫技术', '堡垒工程', '弩机改良', '火药雏形', '远洋罗盘', '造纸印刷', '大学制度'],
  exploration: ['活字印刷', '海图测绘', '远洋船体', '火绳枪械', '铸造火炮', '金融会计', '科学方法', '殖民补给'],
  early_modern: ['蒸汽动力', '机械纺织', '铁路运输', '电报通信', '内燃机', '现代化学', '钢铁工业', '流水生产'],
  modern: ['无线通信', '装甲车辆', '航空工程', '雷达卫星', '现代医学', '喷气动力', '数字计算', '新能源电网']
};
const civicNames = {
  primitive: ['氏族议事', '祖先传统', '公共祭仪', '习惯法', '劳动分工', '物物交换', '部落联盟', '长者传承'],
  ancient: ['礼仪秩序', '成文法典', '官僚萌芽', '劳役组织', '常备卫队', '早期教育', '王家驿传', '跨城贸易'],
  classical: ['成文法典', '公民大会', '郡县行政', '行省治理', '职业军队', '古典教育', '帝国驿传', '多神宽容'],
  medieval: ['封建契约', '行会制度', '骑士精神', '宗教法庭', '城市自治', '科举官僚', '驿站体系', '海贸特许'],
  exploration: ['中央集权', '常备军制', '重商主义', '海军法典', '殖民公司', '启蒙沙龙', '外交使团', '测绘档案'],
  early_modern: ['国民教育', '现代税制', '民族国家', '职业警察', '工厂法案', '普遍兵役', '公共卫生', '代议制度'],
  modern: ['社会保障', '大众传媒', '国际组织', '现代大学', '职业外交', '劳动权利', '文化遗产', '多边治理']
};
const diplomacyUnlocks = ['negotiate', 'trade', 'ceasefire', 'open_borders', 'non_aggression', 'joint_patrol', 'alliance', 'alliance'];
const makeTree = (kind, namesByEra) => eras.flatMap(era => namesByEra[era.id].map((name, index) => ({
  id: `${kind}_${era.id}_${index + 1}`, name, eraId: era.id, eraOrder: era.order, pageIndex: index,
  tier: era.order, researchTime: 4 + era.order * 2 + Math.floor(index / 2), pointCost: 12 + era.order * 14 + index * 3,
  prerequisites: index === 0 ? [] : [`${kind}_${era.id}_${index}`],
  effects: kind === 'tech' ? { productionMul: 1 + (index + 1) * 0.01 } : { satisfactionBonus: index % 3 === 0 ? 1 : 0, diplomacyMul: 1 + index * 0.005 },
  description: kind === 'tech'
    ? `${name}把当代经验转化为可重复的生产与军事方法，并提升聚落整体效率。`
    : `${name}建立共同体认可的制度与价值，改善居民认同并扩展对外交往手段。`,
  history: `${name}代表${era.name}社会在技术、组织与知识传承上的重要积累。`,
  unlocks: kind === 'tech'
    ? { units: [`${era.id}_${branchCycle[index]}_${index + 1}`] }
    : { diplomacyActions: [diplomacyUnlocks[index]] },
  icon: icon(kind === 'tech' ? 'techs' : 'civics', `${kind}_${era.id}_${index + 1}`)
})));
const techs = makeTree('tech', techNames);
const civics = makeTree('civic', civicNames);

const genericNames = {
  primitive: ['氏族战士', '投石手', '猎矛兵', '狩猎队', '冲撞木槌', '斥候', '独木舟', '战斗木舟'],
  ancient: ['青铜剑士', '弓箭手', '矛盾兵', '早期战车', '冲车', '侦察骑手', '桨划舟', '武装商船'],
  classical: ['持盾剑士', '复合弓手', '方阵枪兵', '具装骑兵', '弩炮', '轻装标枪兵', '三列桨战船', '五列桨战船'],
  medieval: ['披甲步兵', '弩手', '长枪方阵', '重装骑士', '配重投石机', '边境游骑', '桨帆战船', '武装柯克船'],
  exploration: ['长枪兵', '火绳枪手', '拒马枪兵', '胸甲骑兵', '野战炮', '龙骑兵', '盖伦帆船', '火船'],
  early_modern: ['线列步兵', '后膛步枪兵', '反骑兵方阵', '枪骑兵', '榴弹炮', '机枪队', '铁甲舰', '鱼雷艇'],
  modern: ['机械化步兵', '特种作战队', '防空导弹队', '主战坦克', '远程火箭炮', '无人机分队', '导弹驱逐舰', '攻击潜艇']
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
  ['war_academy', '军事学院', 'military', 5, { trainsBranches: ['special'], commandPointsBonus: 5, armyCapacityBonus: 1 }],
  ['castle', '城堡', 'defense', 3, { soldierCapacity: 20, defensePower: 60, unlockEliteUnits: true, armyCapacityBonus: 1, garrisonCapacity: 2, garrisonDefenseMul: 1.35 }],
  ['city_wall', '城墙', 'defense', 3, { defensePower: 35, blocksEnemyMovement: true }],
  ['watch_tower', '瞭望塔', 'defense', 2, { visionRadius: 8, defensePower: 12 }],
  ['harbor', '港口', 'naval', 5, { routeCapacity: 2, navalSupply: 10, transportCapacity: 12 }],
  ['grand_shipyard', '大型造船厂', 'naval', 6, { trainsBranches: ['navy'], navalTrainingMul: 1.15 }],
  ['lighthouse', '灯塔', 'naval', 3, { navalVisionRadius: 12, navalSpeedMul: 1.08 }],
  ['engineers_guild', '工程师行会', 'industry', 5, { buildSpeedMul: 1.12, repairMul: 1.2 }],
  ['blacksmith', '铁匠铺', 'industry', 5, { meleePowerMul: 1.06 }],
  ['tavern_hall', '历史酒馆', 'hero', 3, { unlockSystem: 'heroes', heroOfferBonus: 1 }],
  ['strategy_office', '谋略府', 'strategy', 4, { unlockSystem: 'strategies', strategyCooldownMul: 0.9, armyCapacityBonus: 1 }],
  ['field_camp', '野战营寨', 'defense', 1, { garrisonCapacity: 1, garrisonDefenseMul: 1.12, garrisonSupplyRecovery: 0.08, garrisonMoraleRecovery: 3, visionRadius: 4 }, { width: 1, height: 1 }],
  ['frontier_fort', '边境要塞', 'defense', 2, { garrisonCapacity: 2, garrisonDefenseMul: 1.3, garrisonSupplyRecovery: 0.15, garrisonMoraleRecovery: 6, visionRadius: 7, defensePower: 40 }, { width: 2, height: 2 }],
  ['grand_fortress', '大型城垒', 'defense', 4, { garrisonCapacity: 4, garrisonDefenseMul: 1.55, garrisonSupplyRecovery: 0.25, garrisonMoraleRecovery: 10, visionRadius: 11, defensePower: 90, armyCapacityBonus: 1 }, { width: 3, height: 3 }]
];
const buildings = buildingDefs.map(([id, name, category, maxWorkers, uniqueFunction, footprint], index) => ({
  id, name, category, description: `${name}承担${category}体系中的独特职责。`, footprint: footprint || { width: index % 4 === 0 ? 2 : 1, height: index % 4 === 0 ? 2 : 1 },
  maxCount: null, initialBuilding: id === 'timber_house', maxWorkers, jobType: category,
  buildCost: cost(24 + index * 3, 12 + index * 2, index % 6 === 0 ? 10 : 0, Math.floor(index / 3) * 3),
  buildTime: 1 + Math.floor(index / 10), unlockConditions: [], production: uniqueFunction.resourceId ? { perWorker: true, output: [{ resourceId: uniqueFunction.resourceId, amount: uniqueFunction.amount }] } : null,
  housingCapacity: uniqueFunction.housingCapacity || 0,
  soldierCapacity: uniqueFunction.soldierCapacity || 0,
  storageMultiplier: uniqueFunction.storageMultiplier || undefined,
  allowedGrounds: category === 'naval' ? ['S', 'W'] : (id === 'forestry_camp' ? ['F'] : (id === 'stone_quarry' || id === 'gold_mine' ? ['R'] : (id === 'grain_farm' ? ['G', 'D'] : undefined))),
  uniqueFunction, icon: icon('buildings', id), imageDetail: icon('buildings', id), mapIcon: icon('buildings', id),
  labelLayout: { nameOffsetY: 0, progressBarOffsetY: 0, workersOffsetY: 0 }, tags: [category]
}));

const heroDefs = {
  ancient: [
    ['fu_hao', '妇好', 'commander'], ['jiang_ziya', '姜尚', 'strategist'], ['ramesses_ii', '拉美西斯二世', 'commander'], ['tiglath_pileser_iii', '提格拉特帕拉沙尔三世', 'commander'], ['cyrus_the_great', '居鲁士大帝', 'commander'],
    ['duke_of_zhou', '周公旦', 'governor'], ['hammurabi', '汉谟拉比', 'governor'], ['imhotep', '伊姆霍特普', 'engineer'], ['hatshepsut', '哈特谢普苏特', 'diplomat'], ['confucius', '孔子', 'scholar']
  ],
  classical: [
    ['han_xin', '韩信', 'commander'], ['caesar', '恺撒', 'commander'], ['alexander', '亚历山大', 'commander'], ['scipio_africanus', '大西庇阿', 'strategist'], ['arminius', '阿米尼乌斯', 'commander'],
    ['zhang_qian', '张骞', 'explorer'], ['ashoka', '阿育王', 'governor'], ['archimedes', '阿基米德', 'engineer'], ['cai_lun', '蔡伦', 'engineer'], ['ban_zhao', '班昭', 'scholar']
  ],
  medieval: [
    ['li_jing', '李靖', 'strategist'], ['charlemagne', '查理曼', 'commander'], ['genghis_khan', '成吉思汗', 'commander'], ['william_conqueror', '征服者威廉', 'commander'], ['richard_lionheart', '狮心王理查', 'commander'],
    ['li_shimin', '李世民', 'governor'], ['ibn_sina', '伊本·西那', 'physician'], ['mansa_musa', '曼萨·穆萨', 'governor'], ['wang_an_shi', '王安石', 'governor'], ['xuanzang', '玄奘', 'scholar']
  ],
  exploration: [
    ['suleiman', '苏莱曼一世', 'commander'], ['yi_sun_sin', '李舜臣', 'admiral'], ['tokugawa_ieyasu', '德川家康', 'strategist'], ['hernan_cortes', '埃尔南·科尔特斯', 'commander'], ['francis_drake', '弗朗西斯·德雷克', 'admiral'],
    ['elcano', '埃尔卡诺', 'explorer'], ['elizabeth_i', '伊丽莎白一世', 'diplomat'], ['galileo', '伽利略', 'scholar'], ['machiavelli', '马基雅维利', 'diplomat'], ['akbar', '阿克巴', 'governor']
  ],
  early_modern: [
    ['napoleon', '拿破仑', 'commander'], ['wellington', '威灵顿公爵', 'commander'], ['ulysses_grant', '尤利西斯·格兰特', 'commander'], ['horatio_nelson', '霍雷肖·纳尔逊', 'admiral'], ['zuo_zongtang', '左宗棠', 'strategist'],
    ['bismarck', '俾斯麦', 'diplomat'], ['lin_zexu', '林则徐', 'governor'], ['stephenson', '乔治·斯蒂芬森', 'engineer'], ['florence_nightingale', '南丁格尔', 'physician'], ['charles_darwin', '查尔斯·达尔文', 'scholar']
  ],
  modern: [
    ['zhukov', '朱可夫', 'commander'], ['eisenhower', '艾森豪威尔', 'strategist'], ['chester_nimitz', '切斯特·尼米兹', 'admiral'], ['montgomery', '蒙哥马利', 'commander'], ['peng_dehuai', '彭德怀', 'commander'],
    ['qian_xuesen', '钱学森', 'engineer'], ['turing', '艾伦·图灵', 'scholar'], ['tu_youyou', '屠呦呦', 'physician'], ['yuan_longping', '袁隆平', 'scholar'], ['gandhi', '甘地', 'diplomat']
  ]
};
const militaryRoles = new Set(['commander', 'admiral', 'strategist']);
const heroRoleProfiles = {
  commander: { targets: ['army'], bonusKey: 'combatPowerMul', skill: '统军', description: '提升军团正面作战与追击能力。' },
  admiral: { targets: ['army'], bonusKey: 'navalPowerMul', skill: '制海', description: '强化舰队火力、补给与水域机动。' },
  strategist: { targets: ['army'], bonusKey: 'tacticPowerMul', skill: '谋略', description: '增强侦察、侧击与战术阶段效果。' },
  diplomat: { targets: ['embassy', 'diplomatic_mission'], bonusKey: 'diplomacyMul', skill: '斡旋', description: '提高关系收益并降低外交行动成本。' },
  engineer: { targets: ['academy', 'engineers_guild', 'building'], bonusKey: 'buildSpeedMul', skill: '工程督造', description: '加快建设、维修并提升工程研究。' },
  explorer: { targets: ['settlement', 'trade_route'], bonusKey: 'explorationSpeedMul', skill: '远行勘察', description: '扩大视野并提高探险和商路效率。' },
  physician: { targets: ['settlement', 'hospital'], bonusKey: 'recoveryMul', skill: '医护组织', description: '改善人口健康与英雄、军团恢复。' },
  scholar: { targets: ['academy', 'library'], bonusKey: 'sciencePointMul', skill: '学术主持', description: '提高科技值产出与研究效率。' },
  governor: { targets: ['settlement', 'council_hall'], bonusKey: 'administrationMul', skill: '治政', description: '提高行政、税收、满意度与人口效率。' }
};
const heroes = eras.flatMap(era => (heroDefs[era.id] || []).map(([id, name, role], index) => {
  const profile = heroRoleProfiles[role];
  const heroClass = militaryRoles.has(role) ? 'military' : 'civil';
  const power = 1.08 + index * 0.01 + era.order * 0.005;
  return {
  id, name, eraId: era.id, role, heroClass, assignmentTargets: profile.targets,
  title: heroClass === 'military' ? '历史武将' : '历史文臣',
  description: `${name}是一位${era.name}的${heroClass === 'military' ? '军事人物' : '治理人物'}，可通过酒馆招募并永久保留。`,
  recruitCost: cost(20 + era.order * 12, 10 + era.order * 8, 25 + era.order * 10, 20 + era.order * 18),
  recoveryDays: 3 + Math.floor(era.order / 2), bonuses: { [profile.bonusKey]: power },
  skills: [{ id: `${id}_signature`, name: profile.skill, description: profile.description, trigger: heroClass === 'military' ? 'battle_phase' : 'assignment_tick', effects: { [profile.bonusKey]: power } }],
  aura: { radius: 3 + era.order, effect: role }, icon: icon('heroes', id)
  };
}));

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
