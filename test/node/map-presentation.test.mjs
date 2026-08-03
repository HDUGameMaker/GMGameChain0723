import test from 'node:test';
import assert from 'node:assert/strict';
import { createArmySelectionModel, createBuildingHoverDetails, createMapTokenModels, getTerrainFillColor, getTopDownShoreEdges } from '../../src/rendering/MapPresentation.js';

test('building hover details expose status, jobs, output, aura and upgrade information', () => {
  const details = createBuildingHoverDetails(
    { buildingId: 'academy', status: 'active', currentWorkers: 3 },
    {
      id: 'academy', name: '学院', category: 'research', maxWorkers: 6, upgradesTo: 'library',
      description: '解锁科技树并生产科技值。',
      production: { output: [{ resourceId: 'gold', amount: 2 }] },
      uniqueFunction: { sciencePerWorker: 1, aura: { radius: 2, effect: 'researchSpeedMul', multiplier: 1.1 } }
    },
    { upgradeName: '图书馆' }
  );
  assert.equal(details.title, '学院');
  assert.match(details.lines.join('\n'), /运行中/);
  assert.match(details.lines.join('\n'), /3\/6/);
  assert.match(details.lines.join('\n'), /科技/);
  assert.match(details.lines.join('\n'), /半径 2/);
  assert.match(details.lines.join('\n'), /图书馆/);
});

test('map token models distinguish armies, fleets and wild sites', () => {
  const tokens = createMapTokenModels({
    armies: [
      { id: 'a1', name: '第一军团', gridX: 2, gridY: 3, embarked: false, unitCount: 5, power: 40 },
      { id: 'a2', name: '远洋舰队', gridX: 5, gridY: 6, embarked: true, unitCount: 3, power: 55 }
    ],
    wildSites: [
      { id: 'w1', name: '海盗港', category: 'pirate_haven', gridX: 8, gridY: 9, strength: 30 },
      { id: 'w2', name: '古代遗迹', category: 'ruin_guard', gridX: 10, gridY: 11, strength: 20 }
    ]
  });
  assert.equal(tokens.length, 4);
  assert.equal(tokens.find(token => token.id === 'a1').kind, 'army');
  assert.equal(tokens.find(token => token.id === 'a2').kind, 'fleet');
  assert.equal(tokens.find(token => token.id === 'w1').icon, '☠');
  assert.equal(tokens.find(token => token.id === 'w2').icon, '◆');
  assert.ok(tokens.every(token => Number.isFinite(token.gridX) && token.label));
});

test('army map tokens resolve the highest-command-point unit icon before card art', () => {
  const units = [
    { id: 'spear', commandPoints: 2, icon: 'assets/historical-icons/units/spear.svg', cardArt: 'assets/unit-cards/spear.png' },
    { id: 'guard', commandPoints: 5, icon: 'assets/historical-icons/units/guard.svg', cardArt: 'assets/unit-cards/guard.png' }
  ];
  const [token] = createMapTokenModels({
    armies: [{ id: 'army_1', name: 'Guard', unitIds: ['spear', 'guard'], gridX: 1, gridY: 1 }],
    unitConfigs: units,
    selectedArmyId: 'army_1'
  });

  assert.equal(token.art, units[1].icon);
  assert.equal(token.fallbackArt, units[1].cardArt);
  assert.equal(token.fallbackIcon, '⚔️');
  assert.equal(token.selected, true);
  assert.equal(token.unitCount, 2);
});

test('selected army presentation exposes its name, unit count and remaining route', () => {
  assert.deepEqual(createArmySelectionModel({
    id: 'army-1',
    name: '第一军团',
    gridX: 2,
    gridY: 3,
    unitIds: ['spear', 'archer'],
    movePath: [{ x: 3, y: 3 }, { x: 4, y: 3 }]
  }), {
    armyId: 'army-1',
    name: '第一军团',
    unitCount: 2,
    gridX: 2,
    gridY: 3,
    route: [{ x: 3, y: 3 }, { x: 4, y: 3 }]
  });
});

test('mountain terrain uses readable contour bands instead of pure black tiles', () => {
  const map = {
    groundTypes: {
      G: { colorHint: '#7BA05B' },
      B: { colorHint: '#89847a' },
      M: { colorHint: '#5e6268' }
    },
    grid: [
      'GGGGGGGGG',
      'GBBBBBBBG',
      'GBMMMMMBG',
      'GBMMMMMBG',
      'GBMMMMMBG',
      'GBMMMMMBG',
      'GBMMMMMBG',
      'GBBBBBBBG',
      'GGGGGGGGG'
    ]
  };
  const foothill = getTerrainFillColor(map, 1, 1);
  const slope = getTerrainFillColor(map, 2, 2);
  const ridge = getTerrainFillColor(map, 4, 4);
  assert.notEqual(foothill, slope);
  assert.notEqual(slope, ridge);
  for (const color of [foothill, slope, ridge]) assert.ok(color > 0x202020, `terrain color ${color.toString(16)} is too dark`);
});

test('top-down shoreline edges follow adjacent land without using side-view terrain sections', () => {
  const map = { grid: ['GGG', 'GSG', 'WWW'] };
  assert.deepEqual(getTopDownShoreEdges(map, 1, 1), ['top', 'right', 'left']);
  assert.deepEqual(getTopDownShoreEdges(map, 1, 2), []);
  assert.deepEqual(getTopDownShoreEdges(map, 0, 0), []);
});
