/**
 * CheatManager — 开发者作弊系统
 * Konami 码 (↑↑↓↓←→←→) 激活，localStorage 持久化
 * 统一管理所有作弊功能的开关状态
 */
import { eventBus } from '../core/EventBus.js';

const KONAMI_SEQUENCE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'
];

const STORAGE_KEY = 'gmgc_cheat_enabled';

class CheatManager {
  constructor() {
    this._enabled = false;
    this._konamiProgress = 0;
    this._onKeyDown = this._onKeyDown.bind(this);

    // 从 localStorage 恢复状态
    try {
      this._enabled = localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      // ignore
    }

    // 全局键盘监听（始终激活，用于检测Konami码）
    window.addEventListener('keydown', this._onKeyDown);

    if (this._enabled) {
      console.log('[CheatManager] Cheat mode restored from previous session');
    }
  }

  isEnabled() {
    return this._enabled;
  }

  enable() {
    if (this._enabled) return;
    this._enabled = true;
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* ignore */ }
    eventBus.emit('cheatToggled', { enabled: true });
    this._showToast('🎮 作弊模式已激活');
    console.log('[CheatManager] Cheat mode enabled');
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    eventBus.emit('cheatToggled', { enabled: false });
    this._showToast('🔒 作弊模式已关闭');
    console.log('[CheatManager] Cheat mode disabled');
  }

  toggle() {
    if (this._enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /** Konami 码按键检测 */
  _onKeyDown(e) {
    // 如果已在输入框中，不触发
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }

    if (e.key === KONAMI_SEQUENCE[this._konamiProgress]) {
      this._konamiProgress++;
      if (this._konamiProgress >= KONAMI_SEQUENCE.length) {
        this._konamiProgress = 0;
        this.enable();
      }
    } else {
      // 不匹配则重置进度
      this._konamiProgress = 0;
      // 但当前按键可能是序列第一个，重新检查
      if (e.key === KONAMI_SEQUENCE[0]) {
        this._konamiProgress = 1;
      }
    }
  }

  /** 屏幕中央短暂 toast 提示 */
  _showToast(text) {
    const toast = document.createElement('div');
    toast.textContent = text;
    toast.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.85); color: #4ecb71;
      padding: 14px 28px; border-radius: 12px; font-size: 16px; font-weight: 600;
      z-index: 99999; pointer-events: none;
      border: 1px solid rgba(78,203,113,0.4);
      letter-spacing: 0.05em;
    `;
    document.body.appendChild(toast);

    if (window.gsap) {
      gsap.fromTo(toast, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
      gsap.to(toast, { opacity: 0, y: -20, duration: 0.4, delay: 1.5, ease: 'power2.in',
        onComplete: () => toast.remove() });
    } else {
      setTimeout(() => {
        toast.style.transition = 'opacity 0.4s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
      }, 1500);
    }
  }
}

export const cheatManager = new CheatManager();
export default CheatManager;
