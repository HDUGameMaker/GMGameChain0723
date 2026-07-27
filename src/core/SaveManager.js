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
      // 先检查紧急存档
      const emergency = localStorage.getItem('gmgc_emergency_save');
      
      const db = await SaveManager._getDB();
      const saved = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(SAVE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });

      // 比较紧急存档和正常存档的时间戳
      if (emergency) {
        try {
          const emergencyData = JSON.parse(emergency);
          if (!saved || (emergencyData.timestamp > saved.timestamp)) {
            localStorage.removeItem('gmgc_emergency_save');
            return emergencyData;
          }
        } catch (e) {
          // ignore parse error
        }
        localStorage.removeItem('gmgc_emergency_save');
      }

      return saved;
    } catch (e) {
      console.error('[SaveManager] Load failed:', e);
      return null;
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
