import { readFile, writeFile } from 'node:fs/promises';

const files = [
  new URL('../config/historical_content.json', import.meta.url),
  new URL('../config/enemies.json', import.meta.url),
  new URL('../config/ea_integration.json', import.meta.url)
];

const materialCosts = {
  primitive: [['wood', 6], ['stone', 4]],
  classical: [['composite_plank', 12], ['goldstone', 8]],
  medieval: [['hardwood_beam', 16], ['reinforced_stone', 11]],
  exploration: [['ship_timber', 20], ['dressed_marble', 14]],
  modern: [['carbon_composite', 26], ['advanced_alloy', 18]]
};

for (const file of files) {
  const config = JSON.parse(await readFile(file, 'utf8'));
  let changed = 0;
  for (const unit of config.units || []) {
    const costs = materialCosts[unit.eraId];
    if (!costs || unit.unlocked === true) continue;
    const existing = new Map((unit.unlockCost || []).map(cost => [cost.resourceId, cost]));
    for (const [resourceId, amount] of costs) {
      if (!existing.has(resourceId)) existing.set(resourceId, { resourceId, amount });
    }
    unit.unlockCost = [...existing.values()];
    changed += 1;
  }
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(`${file.pathname}: ${changed} unit unlock costs configured`);
}
