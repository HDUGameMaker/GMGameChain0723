import { readFileSync, writeFileSync } from 'node:fs';

const mapPath = new URL('../config/maps/base_map.json', import.meta.url);
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const { gridWidth: width, gridHeight: height } = map;
map.grid = map.grid.map(row => Array.from(row));
const water = Array.from({ length: height }, () => Array(width).fill(false));

const fillRect = (x0, y0, x1, y1) => {
  for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) water[y][x] = true;
  }
};
const fillCircle = (cx, cy, radius) => {
  for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) {
    if (x >= 0 && y >= 0 && x < width && y < height && (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) water[y][x] = true;
  }
};
const carveHorizontal = (x0, x1, y, halfWidth = 1) => fillRect(Math.min(x0, x1), y - halfWidth, Math.max(x0, x1), y + halfWidth);
const carveVertical = (x, y0, y1, halfWidth = 1) => fillRect(x - halfWidth, Math.min(y0, y1), x + halfWidth, Math.max(y0, y1));

// 西部海域与南部海域构成主水体。
fillRect(0, 0, 25, height - 1);
fillRect(0, 192, width - 1, height - 1);

// 两条主河把内陆、海洋、湖泊和海盗锚地连成一张可航行网络。
carveHorizontal(25, 199, 85, 1);
carveVertical(100, 20, 192, 1);

fillCircle(55, 50, 10);
carveHorizontal(25, 45, 50, 1);
fillCircle(150, 50, 11);
carveHorizontal(100, 139, 50, 1);
fillCircle(155, 145, 11);
carveHorizontal(100, 144, 145, 1);
fillCircle(95, 110, 8);
carveVertical(100, 110, 110, 1);

// 玩家开局营地与陆地城邦核心必须保持陆地。
for (let y = 103; y <= 119; y++) for (let x = 72; x <= 90; x++) water[y][x] = false;
const landOutposts = [[65, 115], [110, 95], [55, 125], [110, 125], [145, 100]];
for (const [cx, cy] of landOutposts) for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) water[y][x] = false;

// 旧水面全部重新归入地形底图，再写入新的浅/深水网络。
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  if (map.grid[y][x] === 'W' || map.grid[y][x] === 'S') map.grid[y][x] = 'G';
}
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  if (!water[y][x]) continue;
  const deep = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    return nx < 0 || ny < 0 || nx >= width || ny >= height || water[ny][nx];
  });
  map.grid[y][x] = deep ? 'W' : 'S';
}

map.groundTypes.W = {
  ...(map.groundTypes.W || {}),
  name: '深水',
  buildable: 'restricted',
  colorHint: '#245a8d',
  texture: 'assets/map/water.png'
};
map.groundTypes.S = {
  name: '浅水',
  buildable: 'restricted',
  colorHint: '#5b9ec5',
  texture: 'assets/map/grasswater.png'
};
map.waterDesign = {
  targetRatio: 0.22,
  navigableGrounds: ['S', 'W'],
  description: '西部海域、南部海域、两条主河与四座湖泊相互连通。'
};
map.grid = map.grid.map(row => row.join(''));

writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
