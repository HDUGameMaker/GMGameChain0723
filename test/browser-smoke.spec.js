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
  await expect(page.getByText(/城邦势力（24）/)).toBeVisible();
  await expect(page.getByText(/野外营地、守军与海盗/)).toBeVisible();
  await closeVisiblePopup(page);

  await page.setViewportSize({ width: 1024, height: 700 });
  await page.locator('#btn-training').click();
  const unitArt = page.locator('[data-testid="unit-card-art"]').first();
  await expect(unitArt).toBeVisible();
  expect(await unitArt.evaluate(image => image.complete && image.naturalWidth >= 200)).toBe(true);
  const trainingBox = await page.locator('#popup-container').boundingBox();
  expect(trainingBox.x).toBeGreaterThanOrEqual(0);
  expect(trainingBox.y).toBeGreaterThanOrEqual(0);
  expect(trainingBox.x + trainingBox.width).toBeLessThanOrEqual(1024);
  expect(trainingBox.y + trainingBox.height).toBeLessThanOrEqual(700);
  await closeVisiblePopup(page);

  await page.evaluate(() => {
    const game = window.__game;
    game.systems.era._currentEraIndex = 1;
    game.systems.era._updateStore();
    game.systems.hero.initNew();
    game.popupManager.open('tavern_heroes', {});
  });
  const heroPortrait = page.locator('[data-testid="hero-portrait"]').first();
  await expect(heroPortrait).toBeVisible();
  expect(await heroPortrait.evaluate(image => image.complete && image.naturalWidth >= 200)).toBe(true);
  await closeVisiblePopup(page);
  await page.setViewportSize({ width: 1280, height: 720 });

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
