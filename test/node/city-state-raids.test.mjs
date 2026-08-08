import test from 'node:test';
import assert from 'node:assert/strict';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { EnemyExpansionSystem } from '../../src/systems/EnemyExpansionSystem.js';
import { DiplomacySystem } from '../../src/systems/DiplomacySystem.js';
import { getTickInterval } from '../../src/utils/gameTime.js';

test('city-state raids create real enemy cells and move toward the player every tick', () => {
  eventBus.clear();
  configRegistry._configs = {
    global: { TICK_INTERVAL: 10 },
    enemyExpansion: { countdownStart: 3 },
    enemies: { enemies: [{ id: 'raider', name: '城邦袭击军', strategicOnly: true, maxHp: 20, attack: 4, speed: 1, attackRange: 1 }] },
    map: { gridWidth: 8, gridHeight: 4, grid: Array.from({ length: 4 }, () => Array(8).fill('G')) }
  };
  const enemies = new EnemyExpansionSystem();
  enemies.init();
  enemies.initNew();
  // 8.7 起袭击军由帧级 update(delta) 推进,不再响应 tick;直线上移的寻路 stub 保证一次 update = 1 格。
  enemies._pathfindingSystem = {
    getVersion: () => 0,
    isPathAffectedByInvalidations: () => false,
    findPath: (x, y, targetX, targetY) => {
      const path = [];
      let cx = x, cy = y;
      while (cx !== targetX || cy !== targetY) {
        if (cx !== targetX) cx += Math.sign(targetX - cx);
        else cy += Math.sign(targetY - cy);
        path.push({ x: cx, y: cy });
      }
      return path;
    }
  };
  assert.equal(enemies.spawnCityStateRaid({ outpostId: 'city', gridX: 6, gridY: 1, targetX: 1, targetY: 1, strength: 30 }), true);
  assert.equal(enemies.getAllCells()[0].x, 6);
  enemies.update(getTickInterval(), 1);
  assert.equal(enemies.getAllCells()[0].x, 5);
  assert.equal(enemies.getAllCells()[0].raidOutpostId, 'city');
});

test('legacy hostile cells no longer expand or return from old saves', () => {
  eventBus.clear();
  configRegistry._configs = {
    enemyExpansion: { countdownStart: 1, firstSpawnDay: 1, spawnCountBase: 5 },
    enemies: { enemies: [{ id: 'raider', name: '袭击军', strategicOnly: true, maxHp: 20, attack: 4 }] },
    map: { gridWidth: 6, gridHeight: 4, grid: Array.from({ length: 4 }, () => Array(6).fill('G')) }
  };
  const enemies = new EnemyExpansionSystem();
  enemies.init();
  enemies.restoreState({ cells: [{ x: 2, y: 2, strength: 20, countdown: 0 }] });
  assert.equal(enemies.getCellCount(), 0);
  eventBus.emit('dayStart', { day: 14 });
  assert.equal(enemies.getCellCount(), 0);
  eventBus.clear();
});

test('conquering a city-state grants materials and removes its whole deployment', () => {
  eventBus.clear();
  configRegistry._configs = {
    map: {}, worldFactions: {}, eaIntegration: {}, resources: [],
    historicalContent: { eras: [], buildings: [], units: [], luxuries: [{ id: 'silk', name: '丝绸' }] }
  };
  const diplomacy = new DiplomacySystem();
  diplomacy._configCache = {
    key: ':0x0::{}',
    value: { actions: {}, settings: {}, outposts: [{ id: 'city', name: '测试城邦', gridX: 4, gridY: 4 }] }
  };
  diplomacy._states.city = {
    active: true, status: 'hostile', hp: 50, maxHp: 50, level: 2,
    buildings: [{ id: 'hq', x: 4, y: 4 }, { id: 'wall', x: 3, y: 4 }],
    armies: [{ id: 'guard', x: 5, y: 4 }], controlledCells: [{ x: 4, y: 4 }], luxuryDeposits: []
  };
  const granted = [];
  let removedRaidId = null;
  diplomacy.setSystems({
    resource: { addClamped: (resourceId, amount) => { granted.push({ resourceId, amount }); return amount; } },
    era: { getCurrentEra: () => ({ id: 'primitive', order: 0 }) },
    enemyExpansion: { removeRaidsByOutpost: outpostId => { removedRaidId = outpostId; } }
  });
  const result = diplomacy.attackOutpost('city', { power: 100 });
  assert.equal(result.victory, true);
  assert.deepEqual(result.materialDrops.map(drop => drop.resourceId), ['wood', 'stone']);
  assert.equal(granted.length, 2);
  assert.equal(diplomacy.getOutpostState('city').active, false);
  assert.deepEqual(diplomacy.getOutpostState('city').buildings, []);
  assert.deepEqual(diplomacy.getOutpostState('city').armies, []);
  assert.equal(diplomacy.getVisibleOutposts().length, 0);
  assert.equal(removedRaidId, 'city');
  eventBus.clear();
});
