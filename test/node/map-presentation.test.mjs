import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createArmySelectionModel,
  createBuildingHoverDetails,
  createMapTokenModels,
  getMountainRubbleSpriteModels,
  getMountainRockSpriteModel,
  getResourceNodeGroundStyle,
  getTerrainPropDepth,
  getTerrainFillColor,
  getTopDownShoreEdges
} from '../../src/rendering/MapPresentation.js';

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

test('mountains and exposed mining rock share the yellow dirt foundation used beneath forest art', () => {
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
  const edge = getTerrainFillColor(map, 2, 2);
  const center = getTerrainFillColor(map, 4, 4);
  assert.equal(foothill, 0xc9ad7c);
  assert.equal(edge, center);
  assert.equal(center, 0xc9ad7c);
});

test('exposed mining rock uses the same yellow dirt foundation instead of gray', () => {
  const map = {
    groundTypes: { R: { colorHint: '#dedede' } },
    grid: ['R']
  };
  assert.equal(getTerrainFillColor(map, 0, 0), 0xc9ad7c);
});

test('mountain pillars overlap cell edges so adjacent rocks read as one stacked mass', () => {
  const map = {
    grid: ['GBMG', 'GMMG', 'GGGG'],
    groundTypes: {
      G: { colorHint: '#7BA05B' },
      B: { colorHint: '#89847a' },
      M: { colorHint: '#5e6268' }
    }
  };

  assert.equal(getMountainRockSpriteModel(map, 0, 0, 60), null);
  const foothill = getMountainRockSpriteModel(map, 1, 0, 60);
  const ridge = getMountainRockSpriteModel(map, 2, 0, 60);
  assert.deepEqual(ridge, getMountainRockSpriteModel(map, 2, 0, 60));

  for (const rock of [foothill, ridge]) {
    assert.match(rock.texture, /^assets\/map\/mountains\/mountain_0[1-6]\.png$/);
    assert.ok(rock.x < 0, 'pillar canvas should extend left of its cell');
    assert.ok(rock.x + rock.width > 60, 'pillar canvas should extend right of its cell');
    assert.ok(rock.y < 0, 'pillar should rise above its dirt cell');
    assert.equal(rock.anchor, 'bottom');
  }
  assert.ok(foothill.width >= 72, 'foothill rocks must cover at least 1.2 cells to close wide dirt seams');
  assert.ok(ridge.width >= 84, 'ridge rocks must cover at least 1.4 cells to read as a stacked mass');
  assert.ok(ridge.height > foothill.height, 'ridge pillars should read taller than foothill rocks');

  const textures = new Set();
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 12; col += 1) {
      const model = getMountainRockSpriteModel({ grid: Array(12).fill('MMMMMMMMMMMM') }, col, row, 60);
      textures.add(model.texture);
    }
  }
  assert.equal(textures.size, 6, 'a mountain group should use all six visual variants');
});

test('adjacent mountain cells receive stable small-rubble fillers across their shared gaps', () => {
  const map = {
    grid: [
      'GGGG',
      'GMMG',
      'GMBG',
      'GGGG'
    ]
  };

  assert.deepEqual(getMountainRubbleSpriteModels(map, 0, 0, 60), []);
  const fillers = getMountainRubbleSpriteModels(map, 1, 1, 60);
  assert.deepEqual(fillers, getMountainRubbleSpriteModels(map, 1, 1, 60));
  assert.deepEqual(new Set(fillers.map(filler => filler.edge)), new Set(['right', 'bottom']));
  for (const filler of fillers) {
    assert.match(filler.texture, /^assets\/map\/mountains\/stone_cluster_0[1-3]\.png$/);
    assert.ok(filler.width > 0 && filler.height > 0);
    if (filler.edge === 'right') {
      assert.ok(filler.x < 60 && filler.x + filler.width > 60, 'right filler must bridge the shared edge');
    } else {
      assert.ok(filler.y < 60 && filler.y + filler.height > 60, 'bottom filler must bridge the shared edge');
    }
  }
});

test('mineable stone nodes sit on opaque yellow dirt rather than a gray resource badge', () => {
  assert.deepEqual(
    getResourceNodeGroundStyle({ type: 'stone', developedByBuildingId: null }, { color: '#8d929d' }, 'visible'),
    { color: 0xc9ad7c, fillAlpha: 0.96, strokeColor: 0x6b542b, strokeAlpha: 0.9, shape: 'dirt' }
  );
});

test('terrain props nearer the camera sort above mountain props behind them', () => {
  const mountainBehind = getTerrainPropDepth(12, 'mountain');
  const treeInFront = getTerrainPropDepth(13, 'terrain');
  assert.ok(treeInFront > mountainBehind, 'a tree on the lower row must cover the mountain behind it');
  assert.ok(getTerrainPropDepth(12, 'terrain') > mountainBehind, 'a same-row forest prop must not be hidden by mountain overflow');
  assert.ok(mountainBehind > getTerrainPropDepth(12, 'rubble'), 'large rocks must cover their own rubble fillers');
});

test('top-down shoreline edges follow adjacent land without using side-view terrain sections', () => {
  const map = { grid: ['GGG', 'GSG', 'WWW'] };
  assert.deepEqual(getTopDownShoreEdges(map, 1, 1), ['top', 'right', 'left']);
  assert.deepEqual(getTopDownShoreEdges(map, 1, 2), []);
  assert.deepEqual(getTopDownShoreEdges(map, 0, 0), []);
});
