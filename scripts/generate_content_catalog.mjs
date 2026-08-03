import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const write = (name, content) => {
  const directory = resolve(root, 'docs/content');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, name), `${content.trim()}\n`, 'utf8');
};
const mergeUnique = (...collections) => {
  const records = new Map();
  for (const collection of collections) {
    for (const record of collection || []) if (!records.has(record.id)) records.set(record.id, record);
  }
  return [...records.values()];
};
const cell = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
const compact = (value, limit = 92) => {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return cell(text.length > limit ? `${text.slice(0, limit - 1)}…` : text);
};
const costs = entries => (entries || []).map(entry => `${entry.resourceId}:${entry.amount}`).join(' / ') || '—';

const historical = load('config/historical_content.json');
const ea = load('config/ea_integration.json');
const enemies = load('config/enemies.json');
const baseBuildings = load('config/buildings.json');
const baseTechs = load('config/techs.json');
const baseCivics = load('config/culture.json');
const historicalEvents = load('config/events/events_historical.json');
const world = load('config/world-factions.json');
const eraNames = Object.fromEntries(historical.eras.map(era => [era.id, era.name]));
const eraOrder = Object.fromEntries(historical.eras.map(era => [era.id, era.order]));

const legacyUnitEra = {
  warrior: 'primitive', raft: 'primitive', spearman: 'primitive', archer: 'primitive',
  swordsman: 'classical', catapult: 'classical', galley: 'classical',
  knight: 'medieval', armored_cavalry: 'medieval', pikeman: 'medieval', crossbowman: 'medieval',
  longbowman: 'medieval', trebuchet: 'medieval', siege_tower: 'medieval',
  musketeer: 'exploration', sailing_ship: 'exploration', fire_ship: 'exploration',
  cannon: 'early_modern', biplane: 'early_modern', tank: 'early_modern',
  modern_infantry: 'modern', jet_fighter: 'modern', rocket_artillery: 'modern', battleship: 'modern', missile_destroyer: 'modern'
};
const units = mergeUnique(enemies.units, ea.units, historical.units)
  .map(unit => ({ ...unit, eraId: unit.eraId || legacyUnitEra[unit.id] || 'primitive' }))
  .sort((left, right) => (eraOrder[left.eraId] ?? 0) - (eraOrder[right.eraId] ?? 0) || left.id.localeCompare(right.id));

const unitRows = units.map(unit => `| ${cell(unit.id)} | ${cell(unit.name)} | ${cell(eraNames[unit.eraId] || unit.eraId)} | ${cell(unit.domain || 'land')} / ${cell(unit.branch || 'other')} | ${unit.combatPower ?? 0} | ${unit.hp ?? '—'} / ${unit.attack ?? '—'} / ${unit.attackRange ?? '—'} | ${unit.commandPoints ?? 1} | ${cell(costs(unit.cost))} | ${compact(unit.strongAgainst, 48)} | ${compact(unit.weakAgainst, 48)} | ${cell(unit.requiredBuildingId || unit.trainingBuildingId || '—')} | ${cell(unit.civilizationId || '通用')} |`);
write('UNIT_BALANCE_CATALOG.md', `
# 兵种与海军平衡目录

生成日期：2026-08-03。运行时共 ${units.length} 个独立兵种；数据按主版 → EA 兼容层 → 历史内容层的 ID 优先级合并。每个条目均对应 \`assets/unit-cards/<id>.png\` 的独立 2.5D 招募立绘。

| ID | 名称 | 时代 | 领域/分支 | 战力 | HP/攻击/射程 | CP | 训练成本 | 克制 | 受制 | 训练建筑 | 文明 |
|---|---|---|---|---:|---|---:|---|---|---|---|---|
${unitRows.join('\n')}
`);

const legacyHeroEra = {
  sun_tzu: 'ancient', zhuge_liang: 'classical', yue_fei: 'medieval', zheng_he: 'exploration',
  li_shizhen: 'exploration', shen_kuo: 'medieval', zhang_heng: 'classical', hua_mulan: 'medieval',
  saladin: 'medieval', hannibal: 'classical', leonardo: 'exploration', joan_of_arc: 'medieval'
};
const militaryRoles = new Set(['commander', 'admiral', 'strategist']);
const heroes = mergeUnique(ea.heroes, historical.heroes)
  .map(hero => ({
    ...hero,
    eraId: hero.eraId || legacyHeroEra[hero.id] || 'ancient',
    heroClass: hero.heroClass || (militaryRoles.has(hero.role) ? '武将' : '文臣')
  }))
  .sort((left, right) => (eraOrder[left.eraId] ?? 0) - (eraOrder[right.eraId] ?? 0) || left.id.localeCompare(right.id));
const heroRows = heroes.map(hero => `| ${cell(hero.id)} | ${cell(hero.name)} | ${cell(eraNames[hero.eraId] || hero.era || hero.eraId)} | ${cell(hero.heroClass)} | ${cell(hero.role)} | ${compact(hero.skills || hero.bonuses, 110)} | ${cell(costs(hero.cost || hero.recruitCost))} | ${hero.recoveryDays ?? 3} |`);
write('HERO_CATALOG.md', `
# 历史英雄数据目录

运行时共 ${heroes.length} 位英雄，其中武将只能进入军团，文臣只能进入城市、研究、外交、工程等非战斗岗位；进入新时代后，过去时代未招募人物仍会继续刷新。每位英雄对应 \`assets/hero-portraits/<id>.png\` 独立头像。

| ID | 姓名 | 时代 | 类型 | 职能 | 技能/增益 | 招募成本 | 休养天数 |
|---|---|---|---|---|---|---|---:|
${heroRows.join('\n')}
`);

const civRows = historical.civilizations
  .sort((left, right) => eraOrder[left.eraId] - eraOrder[right.eraId] || left.id.localeCompare(right.id))
  .map(civ => `| ${cell(civ.id)} | ${cell(civ.name)} | ${cell(eraNames[civ.eraId])} | ${cell(civ.trait?.name)}：${compact(civ.trait?.effects, 70)} | ${cell(civ.legacy?.name)}：${compact(civ.legacy?.effects, 70)} | ${cell(civ.uniqueUnitId)} | ${cell(civ.uniqueBuilding?.name)} | ${cell(civ.technologyReplacement?.name)} | ${cell(civ.civicReplacement?.name)} | ${cell(civ.diplomaticPersonality)} |`);
write('CIVILIZATION_CATALOG.md', `
# 时代文明差异化目录

七时代共 ${historical.civilizations.length} 种文明，分布为原始 1、上古 6、古典 8、中世纪 10、探索 10、近代 10、现代 12。同一时代不重复同地域连续王朝。时代特质在当代生效，文明遗产跨时代保留。

| ID | 文明 | 时代 | 当代特质 | 永久遗产 | 特色兵种 | 特色建筑 | 科技替换 | 人文替换 | 外交人格 |
|---|---|---|---|---|---|---|---|---|---|
${civRows.join('\n')}
`);

const buildings = mergeUnique(baseBuildings, ea.buildings, historical.buildings)
  .sort((left, right) => (eraOrder[left.eraId] ?? -1) - (eraOrder[right.eraId] ?? -1) || left.id.localeCompare(right.id));
const buildingRows = buildings.map(building => `| ${cell(building.id)} | ${cell(building.name)} | ${cell(eraNames[building.eraId] || building.eraId || '通用')} | ${compact(building.tags, 58)} | ${building.maxWorkers ?? building.workerCapacity ?? 0} | ${cell(costs(building.cost || building.buildCost))} | ${compact(building.production || building.outputs || building.effects, 78)} | ${compact(building.uniqueFunction || building.aura || building.adjacencyBonus, 98)} | ${compact(building.unlockConditions, 72)} |`);
write('BUILDING_CATALOG.md', `
# 建筑、岗位与功能目录

运行时共 ${buildings.length} 种独立建筑配置，覆盖居住、四资源生产、仓储、科研、人文、商业、转化、光环、兵种训练、军团指挥、三级野战防御、酒馆、港口与造船。零岗位建筑保留其解锁功能，有岗位的建筑按实际工人数量线性或按配置曲线产出。

| ID | 名称 | 时代 | 标签 | 岗位 | 建造成本 | 基础产出 | 独特功能/光环 | 解锁条件 |
|---|---|---|---|---:|---|---|---|---|
${buildingRows.join('\n')}
`);

const techs = mergeUnique(baseTechs, historical.techs);
const civics = mergeUnique(baseCivics, historical.civics);
const researchRows = (kind, nodes) => nodes
  .sort((left, right) => (eraOrder[left.eraId] ?? -1) - (eraOrder[right.eraId] ?? -1) || left.id.localeCompare(right.id))
  .map(node => `| ${kind} | ${cell(node.id)} | ${cell(node.name)} | ${cell(eraNames[node.eraId] || node.eraId || '兼容节点')} | ${node.cost ?? node.researchCost ?? 0} | ${compact(node.prerequisites || node.requires, 58)} | ${compact(node.effects || node.unlocks, 105)} | ${compact(node.description, 95)} |`);
write('RESEARCH_CATALOG.md', `
# 科技树与人文树数据目录

正式时代分页各含 56 个科技节点与 56 个人文节点（每时代各 8 个），另保留 ${techs.length - historical.techs.length} 个主版兼容科技节点和 ${civics.length - historical.civics.length} 个人文兼容节点，供旧兵种前置与旧存档迁移使用。每个正式节点都有描述、成本、效果或解锁，并具有独立 SVG 图标。

| 树 | ID | 名称 | 时代 | 点数成本 | 前置 | 功能/解锁 | 描述 |
|---|---|---|---|---:|---|---|---|
${[...researchRows('科技', techs), ...researchRows('人文', civics)].join('\n')}
`);

const strategyRows = historical.strategies.map(strategy => `| ${cell(strategy.id)} | ${cell(strategy.name)} | ${cell(strategy.category)} | ${compact(strategy.effects, 110)} | ${strategy.durationDays ?? '即时'} | ${strategy.cooldownDays ?? 0} | ${compact(strategy.description, 90)} |`);
const eventRows = historicalEvents.map(event => `| ${cell(event.id)} | ${cell(event.name)} | ${cell(event.category)} | ${cell(eraNames[event.eraId] || event.eraId || '多时代')} | ${compact(event.choices || event.effects, 125)} |`);
const cityStates = mergeUnique(ea.outposts, world.cityStates);
const factionRows = cityStates.map(faction => `| 城邦 | ${cell(faction.id)} | ${cell(faction.name)} | ${cell(faction.domain || 'land')} | ${compact(faction.personality || faction.description, 80)} | ${faction.gridX ?? faction.x ?? '—'}, ${faction.gridY ?? faction.y ?? '—'} |`);
const wildRows = world.wildSites.map(site => `| 野外目标 | ${cell(site.id)} | ${cell(site.name)} | ${cell(site.domain || 'land')} | ${compact(site.type || site.description, 80)} | ${site.gridX ?? site.x ?? '—'}, ${site.gridY ?? site.y ?? '—'} |`);
write('WORLD_STRATEGY_EVENT_CATALOG.md', `
# 世界、策略与随机事件目录

## 策略卡（${historical.strategies.length}）

| ID | 名称 | 分类 | 效果 | 持续 | 冷却 | 描述 |
|---|---|---|---|---:|---:|---|
${strategyRows.join('\n')}

## 历史随机事件（${historicalEvents.length}）

| ID | 名称 | 分类 | 时代 | 选择/效果 |
|---|---|---|---|---|
${eventRows.join('\n')}

## 城邦与野外目标（${cityStates.length} + ${world.wildSites.length}）

| 类型 | ID | 名称 | 领域 | 人格/类型 | 地图坐标 |
|---|---|---|---|---|---|
${[...factionRows, ...wildRows].join('\n')}
`);

console.log(`Generated content catalogs: ${units.length} units, ${heroes.length} heroes, ${historical.civilizations.length} civilizations, ${buildings.length} buildings.`);
