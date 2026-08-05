import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createArmySelectionModel,
  formatEnemyTokenStats,
  createBuildingHoverDetails,
  createMapTokenModels,
  getMountainRubbleSpriteModels,
  getMountainRockSpriteModel,
  getResourceNodeArtPath,
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

test('army map tokens use the assigned hero icon before unit art', () => {
  const units = [
    { id: 'spear', commandPoints: 2, icon: 'assets/historical-icons/units/spear.svg', cardArt: 'assets/unit-cards/spear.png' },
    { id: 'guard', commandPoints: 5, icon: 'assets/historical-icons/units/guard.svg', cardArt: 'assets/unit-cards/guard.png' }
  ];
  const [token] = createMapTokenModels({
    armies: [{ id: 'army_1', name: 'Guard', heroId: 'hero_1', heroIcon: 'assets/heroes/leader.png', unitIds: ['spear', 'guard'], gridX: 1, gridY: 1 }],
    unitConfigs: units,
    selectedArmyId: 'army_1'
  });

  assert.equal(token.art, 'assets/heroes/leader.png');
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
    attackRange: 0,
    route: [{ x: 3, y: 3 }, { x: 4, y: 3 }]
  });
});

test('a moving army keeps its route model without requiring a selected flag', () => {
  const model = createArmySelectionModel({
    id: 'army-moving', name: '行军军团', gridX: 1, gridY: 1,
    attackRange: 1, unitIds: ['spear'], movePath: [{ x: 2, y: 1 }, { x: 3, y: 1 }]
  });
  assert.deepEqual(model.route, [{ x: 2, y: 1 }, { x: 3, y: 1 }]);
  assert.equal(Object.hasOwn(model, 'selected'), false);
});

test('enemy map labels show current hp with a heart and speed with a shoe', () => {
  assert.equal(formatEnemyTokenStats({ hp: 7.2, maxHp: 10, speed: 1.5 }), '❤️8  👟1.5  ⚔️28.86');
  assert.equal(formatEnemyTokenStats({ maxHp: 12 }), '❤️12  👟1  ⚔️15.6');
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
  assert.equal(fillers.filter(filler => filler.edge === 'right').length, 3, 'vertical seams need upper, middle and lower rubble');
  assert.equal(fillers.filter(filler => filler.edge === 'bottom').length, 2, 'horizontal seams need left and right rubble');
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

test('mineable stone nodes use a clear square marker and the stone resource art', () => {
  assert.equal(
    getResourceNodeArtPath({ type: 'stone' }, { mapArt: 'assets/resource-nodes/stone.png' }),
    'assets/resource-nodes/stone-deposit.svg'
  );
  assert.deepEqual(
    getResourceNodeGroundStyle({ type: 'stone', developedByBuildingId: null }, { color: '#8d929d' }, 'visible'),
    { color: 0xc9ad7c, fillAlpha: 0.96, strokeColor: 0xe8d4aa, strokeAlpha: 0.95, shape: 'square' }
  );
});

test('each luxury deposit resolves to its own square PNG map marker', () => {
  const ids = ['silk', 'jade', 'tea', 'spices', 'ivory', 'wine', 'incense', 'gems', 'pearls', 'amber', 'fur', 'dyes', 'cocoa', 'coffee', 'porcelain', 'perfume', 'silverware', 'horses', 'salt', 'cotton'];
  for (const id of ids) {
    assert.equal(
      getResourceNodeArtPath({ type: 'luxury', luxuryId: id }, { mapArt: 'assets/resource-nodes/luxury.png' }, { id, icon: `legacy/${id}.svg` }),
      `assets/resource-nodes/luxuries/${id}.png`
    );
  }
  assert.deepEqual(
    getResourceNodeGroundStyle({ type: 'luxury' }, { color: '#b36bd4' }, 'visible'),
    { color: 0x3e294b, fillAlpha: 0.94, strokeColor: 0xd6a84b, strokeAlpha: 1, shape: 'square' }
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
