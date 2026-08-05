import { readFile, writeFile } from 'node:fs/promises';

const jsonPaths = [
  new URL('../config/buildings.json', import.meta.url),
  new URL('../config/historical_content.json', import.meta.url),
  new URL('../config/events/events_historical.json', import.meta.url)
];

const removeStrategyEffects = value => {
  if (Array.isArray(value)) return value
    .filter(item => !(item && typeof item === 'object' && item.type === 'add_strategy_card'))
    .map(removeStrategyEffects);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (['strategies', 'strategyCards'].includes(key)) continue;
    if (key === 'strategyCooldownMul') continue;
    if (key === 'unlockSystem' && child === 'strategies') continue;
    result[key] = removeStrategyEffects(child);
  }
  return result;
};

const [buildings, historical, events] = await Promise.all(jsonPaths.map(path => readFile(path, 'utf8').then(JSON.parse)));
const isStrategyBuilding = building => ['strategy_archive', 'strategy_office'].includes(building.id)
  || building.jobType === 'strategy'
  || building.tags?.includes('strategy');

const nextBuildings = buildings.filter(building => !isStrategyBuilding(building)).map(removeStrategyEffects);
const nextHistorical = removeStrategyEffects(historical);
nextHistorical.buildings = (nextHistorical.buildings || []).filter(building => !isStrategyBuilding(building));
delete nextHistorical.strategies;
const nextEvents = removeStrategyEffects(events);

await Promise.all([
  writeFile(jsonPaths[0], `${JSON.stringify(nextBuildings, null, 2)}\n`, 'utf8'),
  writeFile(jsonPaths[1], `${JSON.stringify(nextHistorical, null, 2)}\n`, 'utf8'),
  writeFile(jsonPaths[2], `${JSON.stringify(nextEvents, null, 2)}\n`, 'utf8')
]);

console.log('Removed strategy buildings, cards, event rewards and configuration effects.');
