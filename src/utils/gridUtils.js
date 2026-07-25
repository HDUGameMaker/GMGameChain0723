/**
 * gridUtils - 网格坐标辅助函数
 */

/**
 * 网格坐标转屏幕坐标（格子中心点）
 */
export function gridToScreen(col, row, tileSize) {
  return {
    x: col * tileSize + tileSize / 2,
    y: row * tileSize + tileSize / 2
  };
}

/**
 * 网格坐标转屏幕坐标（格子左上角）
 */
export function gridToScreenTopLeft(col, row, tileSize) {
  return {
    x: col * tileSize,
    y: row * tileSize
  };
}

/**
 * 屏幕坐标转网格坐标
 */
export function screenToGrid(x, y, tileSize) {
  return {
    col: Math.floor(x / tileSize),
    row: Math.floor(y / tileSize)
  };
}

/**
 * 检查坐标是否在地图边界内
 */
export function isInBounds(col, row, gridWidth, gridHeight) {
  return col >= 0 && col < gridWidth && row >= 0 && row < gridHeight;
}

/**
 * 检查建筑放置区域是否完全在边界内
 */
export function isAreaInBounds(gridX, gridY, width, height, gridWidth, gridHeight) {
  return gridX >= 0 && gridY >= 0 &&
    gridX + width <= gridWidth &&
    gridY + height <= gridHeight;
}

/**
 * 检查两个矩形区域是否重叠
 */
export function isAreaOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

/**
 * 获取区域覆盖的所有网格坐标
 */
/**
 * 计算两个格子中心点之间的欧几里得距离
 * @param {number} col1 - 第一个格子的列
 * @param {number} row1 - 第一个格子的行
 * @param {number} col2 - 第二个格子的列
 * @param {number} row2 - 第二个格子的行
 * @returns {number} 距离（以格子为单位）
 */
export function euclideanDistance(col1, row1, col2, row2) {
  const dx = (col1 + 0.5) - (col2 + 0.5);
  const dy = (row1 + 0.5) - (row2 + 0.5);
  return Math.sqrt(dx * dx + dy * dy);
}

export function getAreaCells(gridX, gridY, width, height) {
  const cells = [];
  for (let r = gridY; r < gridY + height; r++) {
    for (let c = gridX; c < gridX + width; c++) {
      cells.push({ col: c, row: r });
    }
  }
  return cells;
}
