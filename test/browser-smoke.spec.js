import { test, expect } from '@playwright/test';

test('new game opens economy panels without browser errors', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByText('新游戏', { exact: true }).click();
  await page.waitForSelector('#btn-economy-orders', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1000);
  if (await page.locator('#popup-overlay.active').count()) {
    await page.locator('#popup-close-btn').click();
  }
  await page.getByRole('button', { name: /作业/ }).click();
  await expect(page.getByText('农业与地图采集')).toBeVisible();
  await page.locator('#popup-close-btn').click();
  await page.getByRole('button', { name: /商业/ }).click();
  await expect(page.getByText('商业中心与自动贸易')).toBeVisible();
  await page.locator('#popup-close-btn').click();
  await page.getByRole('button', { name: /军队/ }).click();
  await expect(page.getByText('军队管理')).toBeVisible();
  expect(errors).toEqual([]);
});
