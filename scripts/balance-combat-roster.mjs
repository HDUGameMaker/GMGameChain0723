import { readFile, writeFile } from 'node:fs/promises';

const historicalPath = new URL('../config/historical_content.json', import.meta.url);
const enemiesPath = new URL('../config/enemies.json', import.meta.url);
const eaPath = new URL('../config/ea_integration.json', import.meta.url);
const historical = JSON.parse(await readFile(historicalPath, 'utf8'));
const enemies = JSON.parse(await readFile(enemiesPath, 'utf8'));
const ea = JSON.parse(await readFile(eaPath, 'utf8'));

const eras = historical.eras || [];
const targetScores = [170, 210, 250, 290, 330, 365, 400];
const swiftSpeeds = [2, 2, 3, 3, 4, 4, 5];
const balancedSpeeds = [2, 2, 2, 2, 3, 3, 3];
const maxRanges = [2, 2, 3, 3, 4, 4, 5];
const removedIds = new Set((historical.units || []).filter(unit => /_navy_8$/.test(unit.id)).map(unit => unit.id));
historical.units = (historical.units || []).filter(unit => !removedIds.has(unit.id));

for (const node of [...(historical.techs || []), ...(historical.civics || [])]) {
  if (node.unlocks?.units) node.unlocks.units = node.unlocks.units.filter(id => !removedIds.has(id));
}

const eraIndex = eraId => Math.max(0, eras.findIndex(era => era.id === eraId));
const archetypeFor = unit => {
  if (unit.roleTags?.includes('healer')) return 'balanced';
  if (['cavalry', 'special'].includes(unit.branch)) return 'swift';
  if (['anti_cavalry', 'siege'].includes(unit.branch)) return 'heavy';
  return 'balanced';
};

const isMountedRanged = unit => unit.branch === 'cavalry' && (
  unit.roleTags?.includes('mounted_ranged') || unit.roleTags?.includes('horse_archer') || /骑射|弓骑/.test(unit.name || '')
);

const balanceUnit = unit => {
  const index = eraIndex(unit.eraId);
  const baseTarget = targetScores[index] || targetScores[0];
  const archetype = archetypeFor(unit);
  const mountedRanged = isMountedRanged(unit);
  const ranged = mountedRanged || ['ranged', 'siege'].includes(unit.branch) || unit.roleTags?.includes('ranged');
  const healer = unit.roleTags?.includes('healer');
  const attackRange = ranged ? maxRanges[index] : (unit.domain === 'naval' ? Math.min(3, maxRanges[index]) : 1);
  const speed = mountedRanged ? Math.min(5, swiftSpeeds[index] + 1) : archetype === 'swift' ? swiftSpeeds[index] : archetype === 'heavy' ? 1 : balancedSpeeds[index];
  const target = baseTarget * (archetype === 'balanced' ? 0.95 : 1.05);
  let hp = Math.round(target * (archetype === 'swift' ? 0.17 : archetype === 'heavy' ? 0.52 : 0.43));
  if (ranged) hp = Math.round(target * (mountedRanged ? 0.18 : archetype === 'heavy' ? 0.35 : 0.28));
  if (healer) hp = Math.round(target * 0.45);
  const fixed = hp + (speed - 1) * 30 + (attackRange - 1) * 50;
  const attack = Math.max(8, Math.round((target - fixed) / 1.2));
  const cp = 1;
  const comprehensiveStrength = Math.round((hp + attack * 1.2 + (speed - 1) * 30 + (attackRange - 1) * 50) * cp * 1.3);
  Object.assign(unit, {
    hp, attack, speed, attackRange, cp,
    combatPower: comprehensiveStrength,
    comprehensiveStrength,
    archetype,
    healingAfterBattle: healer ? attack : 0
  });
  if (mountedRanged) {
    unit.roleTags = [...new Set([...(unit.roleTags || []), 'cavalry', 'ranged', 'mounted_ranged'])];
    unit.archetype = 'mounted_ranged';
    unit.lane = 'rear';
  }
  const baseDescription = String(unit.description || unit.name)
    .replace(/【(?:治疗|迅捷|重装|均衡)型】生命\d+，攻击\d+，速度[\d.]+，射程\d+，CP\s*\d+(?:；战后为军团恢复\d+点生命)?。/g, '')
    .trim();
  unit.description = `${baseDescription}【${healer ? '治疗' : archetype === 'swift' ? '迅捷' : archetype === 'heavy' ? '重装' : '均衡'}型】生命${hp}，攻击${attack}，速度${speed}，射程${attackRange}，CP ${cp}${healer ? `；战后为军团恢复${attack}点生命` : ''}。`;
};

const healerNames = ['草药医者', '战地医师', '军团疗愈师', '修会医士', '随军外科医', '战地救护队', '纳米医疗组'];
for (let index = 0; index < eras.length; index += 1) {
  const era = eras[index];
  const existing = historical.units.find(unit => unit.id === `${era.id}_healer`);
  if (!existing) {
    const sample = historical.units.find(unit => unit.eraId === era.id && unit.domain !== 'naval');
    historical.units.push({
      id: `${era.id}_healer`, name: healerNames[index], eraId: era.id,
      domain: 'land', branch: 'infantry', tier: index + 1,
      populationRequired: 1, unlocked: true,
      trainingBuildingId: sample?.trainingBuildingId || 'barracks_hall',
      icon: sample?.icon || 'assets/historical-icons/units/primitive_infantry_1.svg',
      cardArt: sample ? (sample.cardArt || `assets/unit-cards/${sample.id}.png`) : undefined,
      cost: structuredClone(sample?.cost || []),
      roleTags: ['support', 'healer'], strongAgainst: [], weakAgainst: ['swift']
    });
  }
  const healer = historical.units.find(unit => unit.id === `${era.id}_healer`);
  const artSample = historical.units.find(unit => unit.eraId === era.id && unit.id !== healer?.id);
  if (healer && !healer.cardArt && artSample) healer.cardArt = artSample.cardArt || `assets/unit-cards/${artSample.id}.png`;
}

for (const unit of historical.units) balanceUnit(unit);
for (const unit of enemies.units || []) balanceUnit(unit);
for (const unit of ea.units || []) balanceUnit(unit);

const boss = {
  id: 'eastern_ruin_guardian', name: '东境遗迹守护者',
  description: '沉睡在东侧大型遗迹中央的古代巨像。遭受攻击前保持中立。',
  icon: '🗿', faction: '远古遗迹', domain: 'land',
  maxHp: 20000, attack: 1500, attackRange: 3, speed: 3,
  footprint: { width: 2, height: 2 }, alertRange: 4,
  homeHealPerTick: 200, neutralUntilAttacked: true,
  boss: true, strategicOnly: true, spawnAtEasternRuin: true
};
enemies.enemies = [...(enemies.enemies || []).filter(enemy => enemy.id !== boss.id), boss];

for (const [index, eraId] of ['ancient', 'classical', 'medieval', 'exploration', 'early_modern'].entries()) {
  const tech = historical.techs.find(node => node.id === `tech_${eraId}_8`)
    || historical.techs.find(node => node.eraId === eraId);
  if (tech) {
    tech.effects ||= {};
    tech.effects.armyUnitCapacityBonus = 1;
    if (!String(tech.description || '').includes('军团士兵上限 +1')) {
      tech.description = `${tech.description || ''} 军团士兵上限 +1。`.trim();
    }
  }
}

await writeFile(historicalPath, `${JSON.stringify(historical, null, 2)}\n`, 'utf8');
await writeFile(enemiesPath, `${JSON.stringify(enemies, null, 2)}\n`, 'utf8');
await writeFile(eaPath, `${JSON.stringify(ea, null, 2)}\n`, 'utf8');
console.log(`Removed ${removedIds.size} duplicate units, balanced ${historical.units.length} historical units, and configured the eastern ruin boss.`);
