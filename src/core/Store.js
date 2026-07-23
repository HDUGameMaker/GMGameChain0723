/**
 * Store - 简易响应式状态容器
 * 用于跨系统状态同步和 UI 刷新驱动
 */
class Store {
  constructor() {
    this._state = {};
    this._subscribers = {};
  }

  /**
   * 获取状态
   * @param {string} key - 状态键名，不传则返回全部
   * @returns {*}
   */
  getState(key) {
    if (key === undefined) return { ...this._state };
    return this._state[key];
  }

  /**
   * 设置状态（浅合并）
   * @param {object} partial - 要合并的状态对象
   */
  setState(partial) {
    const changedKeys = [];
    for (const [key, value] of Object.entries(partial)) {
      if (this._state[key] !== value) {
        this._state[key] = value;
        changedKeys.push(key);
      }
    }
    // 通知订阅者
    for (const key of changedKeys) {
      this._notify(key, this._state[key]);
    }
    // 通知通配符订阅者
    if (changedKeys.length > 0) {
      this._notify('*', this._state);
    }
  }

  /**
   * 订阅状态变化
   * @param {string} key - 状态键名，'*' 表示订阅所有变化
   * @param {Function} callback - 回调函数 (newValue, key)
   * @returns {Function} 取消订阅的函数
   */
  subscribe(key, callback) {
    if (!this._subscribers[key]) {
      this._subscribers[key] = [];
    }
    this._subscribers[key].push(callback);
    return () => {
      this._subscribers[key] = this._subscribers[key].filter(cb => cb !== callback);
    };
  }

  /**
   * 通知订阅者
   * @param {string} key
   * @param {*} value
   */
  _notify(key, value) {
    const listeners = this._subscribers[key];
    if (!listeners) return;
    for (const cb of [...listeners]) {
      try {
        cb(value, key);
      } catch (e) {
        console.error(`[Store] Error in subscriber for "${key}":`, e);
      }
    }
  }
}

// 全局单例
export const store = new Store();
export default Store;
