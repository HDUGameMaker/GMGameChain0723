/**
 * GameLoop - 游戏主循环
 * requestAnimationFrame 驱动，维护暂停状态
 */
import { eventBus } from './core/EventBus.js';

class GameLoop {
  constructor() {
    this._running = false;
    this._paused = false;
    this._pauseCount = 0; // 支持多层暂停（多个阻塞弹窗）
    this._lastTime = 0;
    this._rafId = null;
    this._updateFn = null;
    this._isPageVisible = true; // 页面是否可见（切标签页后为 false）

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
      const wasVisible = this._isPageVisible;
      this._isPageVisible = document.visibilityState === 'visible';
      if (wasVisible !== this._isPageVisible) {
        eventBus.emit('pageVisibilityChange', { visible: this._isPageVisible });
      }
    });
  }

  /**
   * 设置每帧更新函数
   * @param {Function} fn - (deltaSeconds) => void
   */
  setUpdateFunction(fn) {
    this._updateFn = fn;
  }

  /**
   * 启动主循环
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._loop(this._lastTime);
    console.log('[GameLoop] Started');
  }

  /**
   * 停止主循环
   */
  stop() {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * 暂停游戏逻辑（阻塞弹窗调用）
   * 支持多层暂停：多次 pause 需要相同次数的 resume 才恢复
   */
  pause() {
    this._pauseCount++;
    this._paused = true;
    eventBus.emit('gamePaused');
  }

  /**
   * 恢复游戏逻辑
   */
  resume() {
    this._pauseCount = Math.max(0, this._pauseCount - 1);
    if (this._pauseCount === 0) {
      this._paused = false;
      eventBus.emit('gameResumed');
    }
  }

  /**
   * 是否处于暂停状态
   */
  isPaused() {
    return this._paused;
  }

  /**
   * 页面是否可见（未切到后台标签页）
   */
  isPageVisible() {
    return this._isPageVisible;
  }

  /**
   * 主循环帧
   * @param {number} timestamp
   */
  _loop(timestamp) {
    if (!this._running) return;

    const delta = (timestamp - this._lastTime) / 1000; // 转为秒
    this._lastTime = timestamp;

    // 限制最大 delta 防止长时间离开后一次性处理过多 tick
    // 但允许足够的后台时间累积（30秒），确保切标签页后游戏时间仍推进
    const clampedDelta = Math.min(delta, 30);

    if (!this._paused && this._updateFn) {
      this._updateFn(clampedDelta);
    }

    // 渲染始终进行（即使暂停也渲染，只是不更新逻辑）
    eventBus.emit('render', clampedDelta);

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }
}

// 全局单例
export const gameLoop = new GameLoop();
export default GameLoop;
