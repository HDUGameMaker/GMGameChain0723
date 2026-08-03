import { test, expect } from '@playwright/test';

async function closeVisiblePopup(page) {
  for (let attempt = 0; attempt < 6 && await page.locator('#popup-overlay.active').count(); attempt += 1) {
    const later = page.getByRole('button', { name: '稍后处理' });
    if (await later.count()) await later.click();
    else await page.locator('#popup-close-btn').click();
    await expect(page.locator('#popup-overlay')).not.toHaveClass(/active/);
  }
}

async function expectFirstDetailImage(page) {
  const image = page.locator('#popup-body img').first();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth >= 250)).toBe(true);
}

test('new game opens economy panels without browser errors', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByText('新游戏', { exact: true }).click();
  await page.waitForSelector('#btn-economy-orders', { state: 'visible', timeout: 15000 });
  await expect(page.locator('#popup-title')).toHaveText('战役目标', { timeout: 15000 });
  await closeVisiblePopup(page);
  await page.locator('#btn-pause').click();
  await page.screenshot({ path: 'test-results/qa-fixed-map-and-fog.png' });

  await page.evaluate(() => {
    const game = window.__game;
    const buildingIndex = game.systems.building.buildings.findIndex(building => building.buildingId === 'warehouse');
    game.popupManager.open('building_detail', { buildingIndex });
  });
  await expect(page.locator('#popup-title')).toHaveText('建筑详情');
  await expectFirstDetailImage(page);
  await expect(page.locator('#popup-body')).toContainText('无需人口');
  await page.screenshot({ path: 'test-results/qa-building-detail.png' });
  await closeVisiblePopup(page);

  await page.evaluate(() => {
    const game = window.__game;
    const farm = {
      instanceId: 'browser_qa_farm', buildingId: 'farm', gridX: 270, gridY: 184,
      status: 'active', buildProgress: 3, currentWorkers: 0,
      cropId: 'grain', pendingCropId: null, pendingCropDay: null, cropLuxuryProgress: 0
    };
    game.systems.building.buildings.push(farm);
    game.popupManager.open('building_detail', { buildingIndex: game.systems.building.buildings.length - 1 });
  });
  await expect(page.locator('#popup-body')).toContainText('农田作物');
  await expect(page.locator('#popup-body')).toContainText('当前种植');
  await expectFirstDetailImage(page);
  await page.screenshot({ path: 'test-results/qa-farm-detail.png' });
  await closeVisiblePopup(page);

  await page.getByRole('button', { name: /农业/ }).click();
  await expect(page.locator('#popup-title')).toHaveText('农业总览');
  await expect(page.locator('#popup-body select')).toHaveCount(0);
  await expect(page.locator('#popup-body')).toContainText('打开农田详情');
  await closeVisiblePopup(page);

  await page.evaluate(() => {
    const game = window.__game;
    game.systems.building.buildings.push({
      instanceId: 'browser_qa_market', buildingId: 'market_square', gridX: 274, gridY: 184,
      status: 'active', buildProgress: 3, currentWorkers: 1
    });
    game.popupManager.open('building_detail', { buildingIndex: game.systems.building.buildings.length - 1 });
  });
  await expect(page.locator('#popup-body')).toContainText('商业经营');
  await expect(page.locator('#popup-body')).toContainText('唯一 Buff');
  await page.screenshot({ path: 'test-results/qa-commercial-detail.png' });
  await closeVisiblePopup(page);

  await page.getByRole('button', { name: /商业/ }).click();
  await expect(page.locator('#popup-title')).toHaveText('城市商业');
  await closeVisiblePopup(page);
  await page.getByRole('button', { name: /贸易/ }).click();
  await expect(page.locator('#popup-title')).toHaveText('城邦贸易');
  await expect(page.locator('#popup-body')).toContainText('城邦贸易与资源加工');
  await page.screenshot({ path: 'test-results/qa-trade-panel.png' });
  await closeVisiblePopup(page);
  await page.getByRole('button', { name: /军队/ }).click();
  await expect(page.getByText('军队管理')).toBeVisible();
  await closeVisiblePopup(page);
  await page.getByRole('button', { name: /世界/ }).click();
  await expect(page.getByText(/城邦势力（24）/)).toBeVisible();
  await expect(page.getByText(/野外营地、守军与海盗/)).toBeVisible();
  await closeVisiblePopup(page);

  await page.setViewportSize({ width: 1024, height: 700 });
  await page.evaluate(() => {
    const game = window.__game;
    const buildingIndex = game.systems.building.buildings.findIndex(building => building.buildingId === 'work_shed');
    game.popupManager.open('building_detail', { buildingIndex });
  });
  await page.getByTestId('open-building-training').click();
  const unitArt = page.locator('[data-testid="unit-card-art"]').first();
  await expect(unitArt).toBeVisible();
  await expect.poll(() => unitArt.evaluate(image => image.complete && image.naturalWidth >= 200)).toBe(true);
  const train = page.locator('[data-testid^="train-unit-"]:not([disabled])').first();
  await expect(train).toBeVisible();
  await train.click();
  const trainingBox = await page.locator('#popup-container').boundingBox();
  expect(trainingBox.x).toBeGreaterThanOrEqual(0);
  expect(trainingBox.y).toBeGreaterThanOrEqual(0);
  expect(trainingBox.x + trainingBox.width).toBeLessThanOrEqual(1024);
  expect(trainingBox.y + trainingBox.height).toBeLessThanOrEqual(700);
  await closeVisiblePopup(page);

  await page.evaluate(() => {
    const game = window.__game;
    const buildingIndex = game.systems.building.buildings.findIndex(building => building.buildingId === 'warehouse');
    game.popupManager.open('building_detail', { buildingIndex });
  });
  await expect(page.getByTestId('building-assembly-map-icon')).toBeVisible();
  await page.getByTestId('open-building-assembly').click();
  const reserveArt = page.locator('[data-testid^="reserve-unit-art-"]').first();
  await expect(reserveArt).toBeVisible();
  await expect.poll(() => reserveArt.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.locator('[data-testid^="reserve-add-"]').first().click();
  await page.getByTestId('deploy-army').click();
  await closeVisiblePopup(page);

  const points = await page.evaluate(() => {
    const game = window.__game;
    const renderer = game.mapRenderer;
    const army = game.systems.army.getArmies()[0];
    const toClient = (x, y) => ({
      x: (x * renderer.tileSize + renderer.tileSize / 2 - renderer.camX) * renderer.zoom,
      y: (y * renderer.tileSize + renderer.tileSize / 2 - renderer.camY) * renderer.zoom
    });
    return { army: toClient(army.gridX, army.gridY), target: toClient(army.gridX, army.gridY - 1) };
  });
  await page.mouse.click(points.army.x, points.army.y);
  await page.mouse.click(points.target.x, points.target.y);
  await expect.poll(() => page.evaluate(() => window.__game.systems.army.getArmies()[0].order.type)).toBe('move');

  await page.evaluate(() => {
    const game = window.__game;
    const army = game.systems.army.getArmies()[0];
    void game.systems.armyInteraction.request({
      armyId: army.id,
      target: {
        kind: 'enemy', source: 'combat', gridX: army.gridX, gridY: army.gridY,
        enemy: { name: 'Browser QA target' }
      }
    });
  });
  await expect(page.locator('#popup-overlay')).toHaveClass(/active/);
  await expect(page.locator('#popup-body')).toContainText('Browser QA target');
  await expect(page.locator('#popup-body button')).toHaveCount(2);
  await page.locator('#popup-body button').first().click();
  await expect(page.locator('#popup-overlay')).not.toHaveClass(/active/);

  await page.evaluate(() => {
    const game = window.__game;
    game.systems.era._currentEraIndex = 1;
    game.systems.era._updateStore();
    game.systems.hero.initNew();
    game.popupManager.open('tavern_heroes', {});
  });
  const heroPortrait = page.locator('[data-testid="hero-portrait"]').first();
  await expect(heroPortrait).toBeVisible();
  await expect.poll(() => heroPortrait.evaluate(image => image.complete && image.naturalWidth >= 200)).toBe(true);
  await closeVisiblePopup(page);
  await page.setViewportSize({ width: 1280, height: 720 });

  const renderedResourceArt = await page.evaluate(() => {
    const game = window.__game;
    const definitions = game.systems.resourceNodes ? window.__game.mapRenderer._resourceNodeSystem && ['wood', 'stone', 'food', 'gold'] : [];
    const config = window.__game.mapRenderer ? window.__game.mapRenderer._textureCache : null;
    const paths = ['wood', 'stone', 'food', 'gold'].map(id => `assets/resource-nodes/${id}.png`);
    return definitions.length === 4 && paths.every(path => config?.get(path)?.width > 0);
  });
  expect(renderedResourceArt).toBe(true);

  const fogContract = await page.evaluate(() => {
    const fog = window.__game.mapRenderer._fogOfWar;
    if (!fog || !window.__game.mapRenderer._fogCanvas) return false;
    const probe = new fog.constructor(32, 32);
    probe.recalculate([{ gridX: 15, gridY: 15 }], 'morning');
    const dayTen = probe.getTileState(25, 15) === 'visible';
    probe.recalculate([{ gridX: 15, gridY: 15 }], 'night');
    return dayTen && probe.getTileState(25, 15) === 'remembered' && probe.getTileState(21, 15) === 'visible';
  });
  expect(fogContract).toBe(true);

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
