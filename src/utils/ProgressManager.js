/**
 * ProgressManager - 统一进度条管理器
 * 单一 requestAnimationFrame 循环驱动所有已注册的进度条
 * 使用 TimeSystem 的 timeProgress (0-1) 在 tick 之间做平滑插值
 */
import { store } from '../core/Store.js';

class ProgressManager {
  constructor() {
    this._bars = [];      // { element, getBase, getNext, opts }
    this._running = false;
  }

  /**
   * 注册一个进度条
   * @param {HTMLElement} element - 进度条填充元素（div.progress-fill）
   * @param {Function} getBase - 返回当前 tick 的进度值 (0-1)
   * @param {Function} getNext - 返回下一个 tick 的进度值 (0-1)
   * @param {object} [opts] - 可选配置
   * @param {HTMLElement} [opts.labelEl] - 文字标签元素（可选）
   * @param {Function} [opts.formatLabel] - (smoothValue: 0-1) => string
   * @returns {Function} 取消注册的函数
   */
  register(element, getBase, getNext, opts = {}) {
    const entry = { element, getBase, getNext, opts };
    this._bars.push(entry);
    if (!this._running) {
      this._running = true;
      this._loop();
    }
    return () => this._unregister(entry);
  }

  /**
   * 简化注册：进度值由离散整数计算 (current / total)
   * 自动处理 tick 间平滑
   * @param {HTMLElement} element
   * @param {Function} getCurrent - 返回当前离散进度值 (整数)
   * @param {Function} getTotal - 返回总进度值 (整数)
   * @param {object} [opts]
   */
  registerDiscrete(element, getCurrent, getTotal, opts = {}) {
    const getBase = () => {
      const cur = getCurrent();
      const tot = getTotal();
      return tot > 0 ? cur / tot : 0;
    };
    const getNext = () => {
      const cur = getCurrent();
      const tot = getTotal();
      return tot > 0 ? (cur + 1) / tot : 0;
    };
    return this.register(element, getBase, getNext, opts);
  }

  /**
   * 回调模式注册：用于非 DOM 进度条（如 PIXI.Graphics）
   * @param {Function} getCurrent - 返回当前离散进度值
   * @param {Function} getTotal - 返回总进度值
   * @param {Function} redraw - (smoothValue: 0-1) => void，每帧调用
   * @param {object} [opts]
   * @returns {Function} 取消注册；返回的 entry 上可设 ._removed=true 标记移除
   */
  registerCallback(getCurrent, getTotal, redraw, opts = {}) {
    const getBase = () => {
      const cur = getCurrent();
      const tot = getTotal();
      return tot > 0 ? cur / tot : 0;
    };
    const getNext = () => {
      const cur = getCurrent();
      const tot = getTotal();
      return tot > 0 ? (cur + 1) / tot : 0;
    };
    const entry = { element: null, getBase, getNext, opts, isCallback: true, redraw, _removed: false };
    this._bars.push(entry);
    if (!this._running) {
      this._running = true;
      this._loop();
    }
    return () => {
      entry._removed = true;
    };
  }

  _loop() {
    // 清理已从 DOM 移除的进度条（DOM 类型）和已标记移除的回调类型
    this._bars = this._bars.filter(b => {
      if (b._removed) return false;
      if (b.element && !b.element.isConnected) return false;
      return true;
    });
    if (this._bars.length === 0) {
      this._running = false;
      return;
    }

    const t = store.getState('timeProgress') || 0;

    for (const bar of this._bars) {
      try {
        const base = Math.max(0, Math.min(1, bar.getBase()));
        const next = Math.max(0, Math.min(1, bar.getNext()));
        // 当进度已完成时（base >= 1），固定为100%，避免反复伸缩
        const smooth = base >= 1 ? 1 : (base + (next - base) * t);
        const pct = Math.min(smooth * 100, 100);

        if (bar.isCallback) {
          // 回调模式：由调用方自行重绘（用于 PIXI 等非 DOM 进度条）
          bar.redraw(smooth);
        } else {
          // DOM 模式：直接设置元素宽度
          bar.element.style.width = `${pct}%`;
        }

        if (bar.opts.labelEl && bar.opts.formatLabel) {
          bar.opts.labelEl.textContent = bar.opts.formatLabel(smooth);
        }
      } catch (e) {
        // 数据可能暂时不可用，跳过
      }
    }

    requestAnimationFrame(() => this._loop());
  }

  _unregister(entry) {
    this._bars = this._bars.filter(b => b !== entry);
  }

  /** 停止整个循环（游戏重置时调用） */
  stop() {
    this._running = false;
    this._bars = [];
  }
}

// 全局单例
export const progressManager = new ProgressManager();
export default ProgressManager;
