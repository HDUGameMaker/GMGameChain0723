import { test, expect } from '@playwright/test';

async function closeVisiblePopup(page) {
  for (let attempt = 0; attempt < 6 && await page.locator('#popup-overlay.active').count(); attempt += 1) {
    const later = page.getByRole('button', { name: '稍后处理' });
    if (await later.count()) await later.click();
    else await page.locator('#popup-close-btn').click();
    await expect(page.locator('#popup-overlay')).not.toHaveClass(/active/);
  }
}

test('new game opens economy panels without browser errors', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByText('新游戏', { exact: true }).click();
  await page.waitForSelector('#btn-economy-orders', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1000);
  await closeVisiblePopup(page);
  await page.locator('#btn-pause').click();
  await page.getByRole('button', { name: /作业/ }).click();
  await expect(page.getByText('农业与地图采集')).toBeVisible();
  await closeVisiblePopup(page);
  await page.getByRole('button', { name: /商业/ }).click();
  await expect(page.getByText('商业中心与自动贸易')).toBeVisible();
  await closeVisiblePopup(page);
  await page.getByRole('button', { name: /军队/ }).click();
  await expect(page.getByText('军队管理')).toBeVisible();
  await closeVisiblePopup(page);
  await page.getByRole('button', { name: /世界/ }).click();
  await expect(page.getByText(/城邦势力（12）/)).toBeVisible();
  await expect(page.getByText(/野外营地、守军与海盗/)).toBeVisible();
  await closeVisiblePopup(page);

  const buildingPoint = await page.evaluate(() => {
    const game = window.__game;
    const building = game.systems.building.buildings[0];
    const renderer = game.mapRenderer;
    return {
      x: (building.gridX * renderer.tileSize + renderer.tileSize / 2 - renderer.camX) * renderer.zoom,
      y: (building.gridY * renderer.tileSize + renderer.tileSize / 2 - renderer.camY) * renderer.zoom
    };
  });
  await page.mouse.move(buildingPoint.x, buildingPoint.y);
  await expect(page.locator('#map-hover-card')).toHaveClass(/visible/);
  await expect(page.locator('#map-hover-card')).toContainText(/状态：运行中/);
  expect(errors).toEqual([]);
});
