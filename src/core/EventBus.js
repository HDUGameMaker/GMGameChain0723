/**
 * EventBus - 跨系统通信的发布/订阅模式
 */
class EventBus {
  constructor() {
    this._listeners = {};
  }

  /**
   * 注册事件监听
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听的函数
   */
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  /**
   * 注册一次性事件监听
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback(...args);
    };
    this.on(event, wrapper);
  }

  /**
   * 取消事件监听
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  /**
   * 触发事件
   * @param {string} event - 事件名
   * @param {*} data - 事件数据
   */
  emit(event, data) {
    if (!this._listeners[event]) return;
    const listeners = [...this._listeners[event]];
    for (const cb of listeners) {
      try {
        cb(data);
      } catch (e) {
        console.error(`[EventBus] Error in listener for "${event}":`, e);
      }
    }
  }

  /**
   * 清除所有监听
   */
  clear() {
    this._listeners = {};
  }
}

// 全局单例
export const eventBus = new EventBus();
export default EventBus;
