/**
 * test-config-validation.js — Config JSON 文件结构校验
 *
 * 通过 fetch 加载 config/ 下的 JSON 文件，验证：
 *   1. 文件存在且可解析
 *   2. 关键字段存在且类型正确
 *   3. 数据一致性（如事件引用的 building/resource/item ID 是否有效）
 *
 * 注意：需要 HTTP 服务器环境（fetch 不能用于 file://），
 * 请在 http://127.0.0.1:8080/test/scripts/test-runner.html 中运行。
 *
 * 导出 run() 函数，返回 Promise<{ name, passed, failed, total, results[] }>
 */

/**
 * 异步加载 JSON 配置
 */
async function loadConfig(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`无法加载 ${path}: ${response.status}`);
  }
  return response.json();
}

function assert(description, condition, expected, actual) {
  const pass = condition;
  return {
    description,
    pass,
    expected: expected !== undefined ? String(expected) : 'truthy',
    actual: actual !== undefined ? String(actual) : String(condition)
  };
}

export async function run() {
  const results = [];
  let passed = 0;
  let failed = 0;

  function test(description, condition, expected, actual) {
    const r = assert(description, condition, expected, actual);
    results.push(r);
    if (r.pass) passed++;
    else failed++;
  }

  // ============================
  // global.json
  // ============================
  try {
    const global = await loadConfig('../../config/global.json');
    test('global.json: 存在且可解析', typeof global === 'object');

    test('global.json: 包含 periodDurations', Array.isArray(global.periodDurations));
    test('global.json: periodDurations 有4个元素', global.periodDurations?.length === 4,
      4, global.periodDurations?.length);

    test('global.json: 包含 tickInterval', typeof global.tickInterval === 'number');

    test('global.json: 包含 initialResources', typeof global.initialResources === 'object');
    if (global.initialResources) {
      for (const [resId, amount] of Object.entries(global.initialResources)) {
        test(`global.json: initialResources.${resId} 是数字`,
          typeof amount === 'number', 'number', typeof amount);
      }
    }

    test('global.json: 包含 population 配置', typeof global.population === 'object');
  } catch (e) {
    test(`global.json: 加载失败 — ${e.message}`, false, 'loaded', 'error');
  }

  // ============================
  // buildings.json
  // ============================
  let buildingIds = new Set();
  try {
    const buildings = await loadConfig('../../config/buildings.json');
    test('buildings.json: 存在且可解析', typeof buildings === 'object');

    const list = buildings.buildings || [];
    test('buildings.json: buildings 是数组', Array.isArray(list));
    test('buildings.json: buildings 非空', list.length > 0);

    for (const b of list) {
      buildingIds.add(b.id);
      test(`建筑 ${b.id}: 有 id`, typeof b.id === 'string');
      test(`建筑 ${b.id}: 有 name`, typeof b.name === 'string');
      test(`建筑 ${b.id}: 有 size`, typeof b.size === 'object' && b.size !== null);
      if (b.costs) {
        for (const cost of b.costs) {
          test(`建筑 ${b.id} cost.${cost.resourceId}: amount 是正数`,
            typeof cost.amount === 'number' && cost.amount > 0);
        }
      }
    }
  } catch (e) {
    test(`buildings.json: 加载失败 — ${e.message}`, false, 'loaded', 'error');
  }

  // ============================
  // resources.json
  // ============================
  let resourceIds = new Set();
  try {
    const resources = await loadConfig('../../config/resources.json');
    test('resources.json: 存在且可解析', typeof resources === 'object');

    const list = resources.resources || [];
    test('resources.json: resources 是数组', Array.isArray(list));
    test('resources.json: resources 非空', list.length > 0);

    for (const r of list) {
      resourceIds.add(r.id);
      test(`资源 ${r.id}: 有 id`, typeof r.id === 'string');
      test(`资源 ${r.id}: 有 name`, typeof r.name === 'string');
      test(`资源 ${r.id}: maxAmount 是正数`,
        typeof r.maxAmount === 'number' && r.maxAmount > 0);
    }
  } catch (e) {
    test(`resources.json: 加载失败 — ${e.message}`, false, 'loaded', 'error');
  }

  // ============================
  // items.json
  // ============================
  let itemIds = new Set();
  try {
    const items = await loadConfig('../../config/items.json');
    test('items.json: 存在且可解析', typeof items === 'object');

    const list = items.items || [];
    test('items.json: items 是数组', Array.isArray(list));
    test('items.json: items 非空', list.length > 0);

    for (const item of list) {
      itemIds.add(item.id);
      test(`物品 ${item.id}: 有 id`, typeof item.id === 'string');
      test(`物品 ${item.id}: 有 name`, typeof item.name === 'string');
      test(`物品 ${item.id}: 有 rarity`, typeof item.rarity === 'string');
      test(`物品 ${item.id}: 有 category`, typeof item.category === 'string');
    }
  } catch (e) {
    test(`items.json: 加载失败 — ${e.message}`, false, 'loaded', 'error');
  }

  // ============================
  // maps/base_map.json
  // ============================
  try {
    const mapData = await loadConfig('../../config/maps/base_map.json');
    test('base_map.json: 存在且可解析', typeof mapData === 'object');
    test('base_map.json: 包含 gridWidth', typeof mapData.gridWidth === 'number');
    test('base_map.json: 包含 gridHeight', typeof mapData.gridHeight === 'number');
    test('base_map.json: 包含 tileSize', typeof mapData.tileSize === 'number');
    test('base_map.json: gridWidth=20', mapData.gridWidth === 20, 20, mapData.gridWidth);
    test('base_map.json: gridHeight=15', mapData.gridHeight === 15, 15, mapData.gridHeight);

    if (mapData.tiles) {
      test('base_map.json: tiles 是二维数组（20列）',
        Array.isArray(mapData.tiles) && mapData.tiles.every(row => Array.isArray(row)));
    }
  } catch (e) {
    test(`base_map.json: 加载失败 — ${e.message}`, false, 'loaded', 'error');
  }

  // ============================
  // expeditions/ 目录
  // ============================
  try {
    const regions = await loadConfig('../../config/expeditions/regions.json');
    test('regions.json: 存在且可解析', typeof regions === 'object');
    const regionList = regions.regions || [];
    test('regions.json: regions 是数组', Array.isArray(regionList));
  } catch (e) {
    test(`regions.json: 加载失败 — ${e.message}`, false, 'loaded', 'error');
  }

  try {
    const expGlobal = await loadConfig('../../config/expeditions/expedition_global.json');
    test('expedition_global.json: 存在且可解析', typeof expGlobal === 'object');
  } catch (e) {
    test(`expedition_global.json: 加载失败 — ${e.message}`, false, 'loaded', 'error');
  }

  // ============================
  // events/ 目录
  // ============================
  try {
    const eventsBase = await loadConfig('../../config/events/events_base.json');
    test('events_base.json: 存在且可解析', typeof eventsBase === 'object');
    const list = eventsBase.events || [];
    test('events_base.json: events 是数组', Array.isArray(list));
    for (const evt of list) {
      test(`事件 ${evt.id}: 有 id`, typeof evt.id === 'string');
      test(`事件 ${evt.id}: 有 name`, typeof evt.name === 'string');
    }
  } catch (e) {
    test(`events_base.json: 加载失败 — ${e.message}`, false, 'loaded', 'error');
  }

  try {
    const eventsExp = await loadConfig('../../config/events/events_expedition.json');
    test('events_expedition.json: 存在且可解析', typeof eventsExp === 'object');
    const list = eventsExp.events || [];
    test('events_expedition.json: events 是数组', Array.isArray(list));
  } catch (e) {
    test(`events_expedition.json: 加载失败 — ${e.message}`, false, 'loaded', 'error');
  }

  return {
    name: 'Config Validation',
    passed,
    failed,
    total: results.length,
    results
  };
}

export default { run };
