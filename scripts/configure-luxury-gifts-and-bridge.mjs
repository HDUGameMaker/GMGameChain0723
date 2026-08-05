import { readFile, writeFile } from 'node:fs/promises';

const path = 'config/historical_content.json';
const content = JSON.parse(await readFile(path, 'utf8'));
const effects = {
  silk: { goldProductionMul: 1.07, buildCostMul: 0.98 }, jade: { civicPointMul: 1.08, satisfactionBonus: 2 }, tea: { sciencePointMul: 1.08 },
  spices: { foodConsumeMul: 0.96, foodProductionMul: 1.05 }, ivory: { armyHpMul: 1.07 }, wine: { satisfactionBonus: 5 },
  incense: { civicPointMul: 1.06, sciencePointMul: 1.03 }, gems: { goldProductionMul: 1.1 }, pearls: { goldProductionMul: 1.05, sciencePointMul: 1.03 },
  amber: { woodProductionMul: 1.08 }, fur: { foodConsumeMul: 0.95, housingCapacityMul: 1.03 }, dyes: { civicPointMul: 1.05, satisfactionBonus: 2 },
  cocoa: { growthMul: 1.06, foodProductionMul: 1.03 }, coffee: { sciencePointMul: 1.06, civicPointMul: 1.02 }, porcelain: { civicPointMul: 1.06, buildCostMul: 0.99 },
  perfume: { satisfactionBonus: 3, growthMul: 1.03 }, silverware: { stoneProductionMul: 1.07, buildCostMul: 0.98 }, horses: { armySpeedMul: 1.1 },
  salt: { foodConsumeMul: 0.94, foodProductionMul: 1.04 }, cotton: { housingCapacityMul: 1.08 }
};
const applications = {
  silk: ['城市市场', '提高黄金产出。'], ivory: ['住宅与公共设施', '耐用的雕刻器具提高住宅承载能力。'],
  pearls: ['珠宝工坊', '加工珍珠饰品，提高黄金产出。'], amber: ['工艺市场', '作为珍贵工艺品提高黄金产出。'],
  fur: ['居民冬衣', '改善保暖条件，降低人口食物消耗。'], dyes: ['公共文化设施', '用于旗帜与公共艺术，提高人文点产出。'],
  porcelain: ['礼仪与教育设施', '精美器物推动礼制教育，提高人文点产出。'],
  perfume: ['城市公共生活', '改善生活品质，直接提高满意度。'], silverware: ['学院与实验设施', '标准化器皿和度量工具提高科技点产出。'],
  horses: ['农业与运输', '改善运输和耕作效率，提高人口增长速度。'], salt: ['粮食保存', '延长食物保存时间，降低人口食物消耗。']
};
for (const luxury of content.luxuries || []) {
  luxury.effects = effects[luxury.id] || luxury.effects;
  luxury.stackable = false;
  luxury.giftable = true;
  if (applications[luxury.id]) {
    luxury.application ||= {};
    luxury.application.targetName = applications[luxury.id][0];
    luxury.application.useDescription = applications[luxury.id][1];
  }
}

const bridge = {
  id: 'classical_bridge', name: '石木桥梁', description: '【通行】建造在一格水面上，使敌我双方的陆军都能从该格通行。',
  eraId: 'classical', category: 'basic_industry', icon: 'assets/historical-icons/buildings/classical_bridge.svg', mapIcon: 'assets/historical-icons/buildings/classical_bridge.svg', footprint: { width: 1, height: 1 },
  allowedGrounds: ['S', 'W'], waterBuildable: true, passable: true, maxCount: null, maxWorkers: 0, buildTime: 0,
  buildCost: [{ resourceId: 'composite_plank', amount: 18 }, { resourceId: 'goldstone', amount: 12 }],
  uniqueFunction: { bridge: true, allowsLandMovement: true }
};
content.buildings = (content.buildings || []).filter(building => building.id !== bridge.id);
content.buildings.push(bridge);
await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
