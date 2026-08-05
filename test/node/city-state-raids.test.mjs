import test from 'node:test';
import assert from 'node:assert/strict';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { EnemyExpansionSystem } from '../../src/systems/EnemyExpansionSystem.js';

test('city-state raids create real enemy cells and move toward the player every tick', () => {
  eventBus.clear();
  configRegistry._configs = {
    enemyExpansion: { countdownStart: 3 },
    enemies: { enemies: [{ id: 'raider', name: '城邦袭击军', strategicOnly: true, maxHp: 20, attack: 4, speed: 1, attackRange: 1 }] },
    map: { gridWidth: 8, gridHeight: 4, grid: Array.from({ length: 4 }, () => Array(8).fill('G')) }
  };
  const enemies = new EnemyExpansionSystem();
  enemies.init();
  enemies.initNew();
  assert.equal(enemies.spawnCityStateRaid({ outpostId: 'city', gridX: 6, gridY: 1, targetX: 1, targetY: 1, strength: 30 }), true);
  assert.equal(enemies.getAllCells()[0].x, 6);
  eventBus.emit('tick', {});
  assert.equal(enemies.getAllCells()[0].x, 5);
  assert.equal(enemies.getAllCells()[0].raidOutpostId, 'city');
});
