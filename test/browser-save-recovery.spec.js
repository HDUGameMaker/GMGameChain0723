import { test, expect } from '@playwright/test';

test.use({ channel: 'msedge' });
const BASE_URL = 'http://127.0.0.1:18763/';

async function startNewGame(page) {
  await page.goto(BASE_URL);
  await page.getByText('新游戏', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__game?.hud))).toBe(true);
  const overlay = page.locator('#popup-overlay');
  if (await overlay.evaluate(element => element.classList.contains('active'))) {
    await page.locator('#popup-close-btn').click();
  }
}

test('SaveManager rotates primary rollback and emergency records, then reset removes every copy', async ({ page }) => {
  await page.goto(BASE_URL);
  const result = await page.evaluate(async () => {
    const { SaveManager } = await import('/src/core/SaveManager.js');
    await SaveManager.reset();
    for (const marker of ['first', 'second', 'third']) {
      await SaveManager.save({ version: 8, resources: {}, buildings: [], marker });
    }
    const db = await SaveManager._getDB();
    const read = key => new Promise(resolve => {
      const request = db.transaction('saves', 'readonly').objectStore('saves').get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    const records = {
      primary: await read('primary'),
      rollback: await read('rollback'),
      emergency: await read('emergency'),
      legacy: await read('currentSave'),
      local: JSON.parse(localStorage.getItem('gmgc_emergency_save') || 'null')
    };
    await SaveManager.reset();
    records.afterReset = {
      primary: await read('primary'),
      rollback: await read('rollback'),
      emergency: await read('emergency'),
      legacy: await read('currentSave'),
      local: localStorage.getItem('gmgc_emergency_save')
    };
    return records;
  });

  expect(result.primary.payload.marker).toBe('third');
  expect(result.rollback.payload.marker).toBe('second');
  expect(result.emergency.payload.marker).toBe('first');
  expect(result.local.payload.marker).toBe('first');
  expect(result.primary.sequence).toBeGreaterThan(result.rollback.sequence);
  expect(result.rollback.sequence).toBeGreaterThan(result.emergency.sequence);
  expect(result.legacy).toBeNull();
  expect(result.afterReset).toEqual({ primary: null, rollback: null, emergency: null, legacy: null, local: null });
});

test('loadRecoverable reads legacy IndexedDB and local emergency payloads through v9 migration', async ({ page }) => {
  await page.goto(BASE_URL);
  const recovered = await page.evaluate(async () => {
    const { SaveManager } = await import('/src/core/SaveManager.js');
    await SaveManager.reset();
    const db = await SaveManager._getDB();
    const put = (value, key) => new Promise((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    await put({ version: 7, resources: {}, buildings: [], marker: 'indexed-legacy' }, 'currentSave');
    const indexed = await SaveManager.loadRecoverable();
    await SaveManager.reset();
    localStorage.setItem('gmgc_emergency_save', JSON.stringify({ version: 8, resources: {}, buildings: [], marker: 'local-legacy' }));
    const local = await SaveManager.loadRecoverable();
    await SaveManager.reset();
    return {
      indexed: { source: indexed.source, version: indexed.payload?.version, marker: indexed.payload?.marker },
      local: { source: local.source, version: local.payload?.version, marker: local.payload?.marker }
    };
  });

  expect(recovered.indexed).toEqual({ source: 'import', version: 9, marker: 'indexed-legacy' });
  expect(recovered.local).toEqual({ source: 'emergency', version: 9, marker: 'local-legacy' });
});

test('main saves and restores canonical domains and shows non-blocking rollback recovery UI', async ({ page }) => {
  await startNewGame(page);
  const saved = await page.evaluate(async () => {
    const game = window.__game;
    const { store } = await import('/src/core/Store.js');
    const { SaveManager } = await import('/src/core/SaveManager.js');
    game.systems.army.setAvailableUnits({ spearman: 2 });
    store.setState({ factions: { states: { city_1: { status: 'friendly' } }, relations: {}, lastSyncDay: 6 } });
    const saveResults = [await game.saveGame(), await game.saveGame()];
    const db = await SaveManager._getDB();
    const read = key => new Promise(resolve => {
      const request = db.transaction('saves', 'readonly').objectStore('saves').get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    const primary = await read('primary');
    if (!primary) throw new Error('main save did not create a primary envelope');
    const tx = db.transaction('saves', 'readwrite');
    primary.payload.resources.wood.current += 1;
    tx.objectStore('saves').put(primary, 'primary');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    return {
      hasArmyState: Boolean(primary.payload.armyState),
      hasCommerce: Boolean(primary.payload.commerce),
      mirrors: ['armies', 'availableUnits', 'tradeRoutes', 'factions'].filter(key => key in primary.payload),
      saveResults
    };
  });

  expect(saved).toEqual({ hasArmyState: true, hasCommerce: true, mirrors: [], saveResults: [true, true] });
  await page.reload();
  await page.getByText('继续游戏', { exact: true }).click();
  await expect(page.locator('[data-testid="save-recovery-panel"]')).toBeVisible();
  await expect(page.locator('[data-testid="save-recovery-source"]')).toHaveText('rollback');
  await expect(page.locator('[data-testid="save-recovery-warning"]')).toContainText('primary_invalid');

  const restored = await page.evaluate(async () => {
    const { store } = await import('/src/core/Store.js');
    return {
      initialized: Boolean(window.__game?.hud && window.__game?.mapRenderer),
      paused: window.__game ? window.__game._gameOver : true,
      reserves: window.__game.systems.army.getAvailableUnits(),
      factionStatus: store.getState('factions')?.states?.city_1?.status
    };
  });
  expect(restored.initialized).toBe(true);
  expect(restored.paused).toBe(false);
  expect(restored.reserves.spearman).toBe(2);
  expect(restored.factionStatus).toBe('friendly');
});
