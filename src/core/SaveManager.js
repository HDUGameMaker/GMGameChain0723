/**
 * SaveManager - 存档管理
 * IndexedDB 封装，单存档位
 */

const DB_NAME = 'GMGameChainDB';
const DB_VERSION = 1;
const STORE_NAME = 'saves';
const SAVE_KEY = 'currentSave';

export class SaveManager {
  static _db = null;

  static migrate(raw) {
    if (!raw || !Number.isFinite(raw.version) || raw.version < 5 || raw.version > 7) return null;
    const state = structuredClone(raw);
    const history = [state.version];

    if (state.version === 5) {
      state.territory ??= {};
      state.enemyExpansion ??= {};
      state.buildingTech ??= {};
      state.diplomacy ??= { states: {} };
      state.heroes ??= { availableIds: [], recruited: {}, lastRefreshDay: 0 };
      state.version = 6;
      history.push(6);
    }

    if (state.version === 6) {
      const defaults = {
        wood: { current: 200, max: 1000 },
        stone: { current: 150, max: 1000 },
        food: { current: 220, max: 1000 },
        gold: { current: 80, max: 1000 }
      };
      const previousResources = state.resources || {};
      state.resources = {};
      for (const id of ['wood', 'stone', 'food', 'gold']) {
        const saved = previousResources[id];
        state.resources[id] = saved && Number.isFinite(saved.current) && Number.isFinite(saved.max)
          ? { current: Math.max(0, saved.current), max: Math.max(1, saved.max) }
          : { ...defaults[id] };
      }
      state.resources.__storageMultiplier = Number.isFinite(previousResources.__storageMultiplier)
        ? previousResources.__storageMultiplier
        : 1;

      state.population = {
        current: 12,
        declineCountdown: 0,
        expeditionWorkers: 0,
        constructionWorkers: 0,
        satisfaction: 60,
        starvationDays: 0,
        ...(state.population || {})
      };
      if (Array.isArray(state.buildings)) {
        state.buildings = state.buildings.map(building => ({ assignedWorkers: 0, ...building }));
      }
      state.era ??= { currentEraId: 'ancient', selectedCivilizations: {}, legacyCivilizationIds: [], eraStars: {} };
      state.luxuries ??= { inventory: {}, deposits: [], discoveredDepositIds: [] };
      state.strategies ??= {
        cards: { forced_march: 1, harvest_drive: 1, fortify: 1 },
        cooldowns: {},
        activeEffects: []
      };
      state.territory ??= {};
      state.enemyExpansion ??= {};
      state.buildingTech ??= {};
      state.diplomacy ??= { states: {} };
      state.heroes ??= { availableIds: [], recruited: {}, lastRefreshDay: 0 };
      delete state.alchemy;
      delete state.spell;
      state.version = 7;
      history.push(7);
    }

    state.migrationHistory = state.migrationHistory || history;
    return state;
  }

  static async _getDB() {
    if (SaveManager._db) return SaveManager._db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (e) => {
        SaveManager._db = e.target.result;
        resolve(SaveManager._db);
      };
      request.onerror = (e) => {
        console.error('[SaveManager] DB open error:', e);
        reject(e);
      };
    });
  }

  /**
   * 保存游戏状态
   */
  static async save(gameState) {
    try {
      const db = await SaveManager._getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(gameState, SAVE_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => {
          console.error('[SaveManager] Save error:', e);
          reject(e);
        };
      });
    } catch (e) {
      console.error('[SaveManager] Save failed:', e);
      return false;
    }
  }

  /**
   * 加载存档
   * @returns {object|null}
   */
  static async load() {
    try {
      const db = await SaveManager._getDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(SAVE_KEY);
        request.onsuccess = () => resolve(SaveManager.migrate(request.result || null));
        request.onerror = () => resolve(null);
      });
    } catch (e) {
      console.error('[SaveManager] Load failed:', e);
      return null;
    }
  }

  /**
   * 是否存在可继续的存档
   * @returns {Promise<boolean>}
   */
  static async hasSave() {
    try {
      const db = await SaveManager._getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(SAVE_KEY);
        request.onsuccess = () => resolve(Boolean(request.result));
        request.onerror = () => resolve(false);
      });
    } catch (e) {
      console.error('[SaveManager] hasSave failed:', e);
      return false;
    }
  }

  /**
   * 重置存档
   */
  static async reset() {
    try {
      localStorage.removeItem('gmgc_emergency_save');
      const db = await SaveManager._getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(SAVE_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e);
      });
    } catch (e) {
      console.error('[SaveManager] Reset failed:', e);
      return false;
    }
  }
}
