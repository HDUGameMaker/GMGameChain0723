/**
 * test-gridUtils.js — gridUtils 纯函数单元测试
 *
 * 覆盖 src/utils/gridUtils.js 全部 7 个导出函数：
 *   gridToScreen, gridToScreenTopLeft, screenToGrid,
 *   isInBounds, isAreaInBounds, isAreaOverlap, getAreaCells
 *
 * 导出 run() 函数，返回 { name, passed, failed, total, results[] }
 * 可在 test-runner.html 中批量运行，也可在浏览器控制台中：
 *   import('./test/scripts/test-gridUtils.js').then(m => console.table(m.run().results))
 */

import {
  gridToScreen,
  gridToScreenTopLeft,
  screenToGrid,
  isInBounds,
  isAreaInBounds,
  isAreaOverlap,
  getAreaCells
} from '../../src/utils/gridUtils.js';

/**
 * 简易断言工具
 */
function assert(description, condition, expected, actual) {
  const pass = condition;
  return {
    description,
    pass,
    expected: expected !== undefined ? String(expected) : 'truthy',
    actual: actual !== undefined ? String(actual) : String(condition)
  };
}

/**
 * 运行所有测试
 * @returns {{ name: string, passed: number, failed: number, total: number, results: Array }}
 */
export function run() {
  const results = [];
  let passed = 0;
  let failed = 0;

  function test(description, condition, expected, actual) {
    const r = assert(description, condition, expected, actual);
    results.push(r);
    if (r.pass) passed++;
    else failed++;
  }

  const TILE = 64; // 默认 tileSize

  // ============================
  // gridToScreen
  // ============================
  const g1 = gridToScreen(0, 0, TILE);
  test('gridToScreen(0,0) → x=TILE/2', g1.x === 32, 32, g1.x);
  test('gridToScreen(0,0) → y=TILE/2', g1.y === 32, 32, g1.y);

  const g2 = gridToScreen(2, 3, TILE);
  test('gridToScreen(2,3) → x=2*64+32=160', g2.x === 160, 160, g2.x);
  test('gridToScreen(2,3) → y=3*64+32=224', g2.y === 224, 224, g2.y);

  const g3 = gridToScreen(19, 14, 64); // 地图右下角
  test('gridToScreen(19,14) → x=19*64+32=1248', g3.x === 1248, 1248, g3.x);
  test('gridToScreen(19,14) → y=14*64+32=928', g3.y === 928, 928, g3.y);

  // 边界: tileSize=0
  const g4 = gridToScreen(5, 5, 0);
  test('gridToScreen(5,5,0) → x=0', g4.x === 0, 0, g4.x);
  test('gridToScreen(5,5,0) → y=0', g4.y === 0, 0, g4.y);

  // ============================
  // gridToScreenTopLeft
  // ============================
  const tl1 = gridToScreenTopLeft(0, 0, TILE);
  test('gridToScreenTopLeft(0,0) → (0,0)', tl1.x === 0 && tl1.y === 0, '(0,0)', `(${tl1.x},${tl1.y})`);

  const tl2 = gridToScreenTopLeft(3, 2, TILE);
  test('gridToScreenTopLeft(3,2) → x=192', tl2.x === 192, 192, tl2.x);
  test('gridToScreenTopLeft(3,2) → y=128', tl2.y === 128, 128, tl2.y);

  // ============================
  // screenToGrid
  // ============================
  const s1 = screenToGrid(100, 100, TILE);
  test('screenToGrid(100,100) → col=1', s1.col === 1, 1, s1.col);
  test('screenToGrid(100,100) → row=1', s1.row === 1, 1, s1.row);

  const s2 = screenToGrid(0, 0, TILE);
  test('screenToGrid(0,0) → col=0', s2.col === 0, 0, s2.col);
  test('screenToGrid(0,0) → row=0', s2.row === 0, 0, s2.row);

  const s3 = screenToGrid(1279, 959, TILE); // 地图边界附近 (20×64=1280, 15×64=960)
  test('screenToGrid(1279,959) → col=19', s3.col === 19, 19, s3.col);
  test('screenToGrid(1279,959) → row=14', s3.row === 14, 14, s3.row);

  // ============================
  // isInBounds
  // ============================
  test('isInBounds(0,0,20,15) → true', isInBounds(0, 0, 20, 15) === true);
  test('isInBounds(19,14,20,15) → true', isInBounds(19, 14, 20, 15) === true);
  test('isInBounds(20,0,20,15) → false', isInBounds(20, 0, 20, 15) === false);
  test('isInBounds(0,15,20,15) → false', isInBounds(0, 15, 20, 15) === false);
  test('isInBounds(-1,0,20,15) → false', isInBounds(-1, 0, 20, 15) === false);
  test('isInBounds(0,-1,20,15) → false', isInBounds(0, -1, 20, 15) === false);

  // ============================
  // isAreaInBounds
  // ============================
  test('isAreaInBounds(0,0,2,2,20,15) → true', isAreaInBounds(0, 0, 2, 2, 20, 15) === true);
  test('isAreaInBounds(18,13,2,2,20,15) → true', isAreaInBounds(18, 13, 2, 2, 20, 15) === true);
  test('isAreaInBounds(19,0,2,2,20,15) → false', isAreaInBounds(19, 0, 2, 2, 20, 15) === false);
  test('isAreaInBounds(0,14,2,2,20,15) → false', isAreaInBounds(0, 14, 2, 2, 20, 15) === false);
  test('isAreaInBounds(-1,0,1,1,20,15) → false', isAreaInBounds(-1, 0, 1, 1, 20, 15) === false);

  // ============================
  // isAreaOverlap
  // ============================
  test('isAreaOverlap 完全不重叠', isAreaOverlap(0, 0, 2, 2, 3, 3, 2, 2) === false);
  test('isAreaOverlap 完全重叠', isAreaOverlap(0, 0, 2, 2, 0, 0, 2, 2) === true);
  test('isAreaOverlap 部分重叠(右下)', isAreaOverlap(0, 0, 3, 3, 2, 2, 3, 3) === true);
  test('isAreaOverlap 相邻不重叠', isAreaOverlap(0, 0, 2, 2, 2, 0, 2, 2) === false);
  test('isAreaOverlap 一个完全包含另一个', isAreaOverlap(1, 1, 1, 1, 0, 0, 3, 3) === true);

  // ============================
  // getAreaCells
  // ============================
  const cells1 = getAreaCells(0, 0, 1, 1);
  test('getAreaCells(0,0,1,1) → 1个格子', cells1.length === 1, 1, cells1.length);
  test('getAreaCells(0,0,1,1)[0] → {col:0,row:0}',
    cells1[0].col === 0 && cells1[0].row === 0);

  const cells2 = getAreaCells(5, 3, 2, 3);
  test('getAreaCells(5,3,2,3) → 6个格子', cells2.length === 6, 6, cells2.length);
  test('getAreaCells 包含 (5,3)', cells2.some(c => c.col === 5 && c.row === 3));
  test('getAreaCells 包含 (6,5)', cells2.some(c => c.col === 6 && c.row === 5));
  test('getAreaCells 不包含 (7,3)', !cells2.some(c => c.col === 7 && c.row === 3));

  const cells3 = getAreaCells(10, 10, 0, 0);
  test('getAreaCells(10,10,0,0) → 空数组', cells3.length === 0, 0, cells3.length);

  // ============================
  // 往返测试: gridToScreen → screenToGrid
  // ============================
  const roundtrip = screenToGrid(
    gridToScreen(7, 11, TILE).x,
    gridToScreen(7, 11, TILE).y,
    TILE
  );
  test('往返: grid(7,11)→screen→grid → col=7', roundtrip.col === 7, 7, roundtrip.col);
  test('往返: grid(7,11)→screen→grid → row=11', roundtrip.row === 11, 11, roundtrip.row);

  return {
    name: 'gridUtils',
    passed,
    failed,
    total: results.length,
    results
  };
}

export default { run };
