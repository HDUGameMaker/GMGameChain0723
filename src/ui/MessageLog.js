/**
 * MessageLog - 资源播报系统
 * 左侧：资源类、建造类消息（获得XX资源，已建成XXX建筑）
 * 右侧：人口类、灾祸类消息（XXX加入了避难所，XXX因为食物短缺而死）
 * 每条消息保留3秒，两侧最多同时显示5条消息
 *
 * 广播开关：战斗广播(combat)控制右侧灾祸/战斗消息，资源广播(resource)控制左侧资源/建造消息。
 * 持久化于 localStorage('gmgc_broadcast')。
 */
import { eventBus } from '../core/EventBus.js';
import { configRegistry } from '../core/ConfigRegistry.js';

const BROADCAST_KEY = 'gmgc_broadcast';

export class MessageLog {
  constructor() {
    this.leftMessages = []; // 左侧：资源、建造
    this.rightMessages = []; // 右侧：人口、灾祸、战斗
    this.maxMessages = 5;
    this.messageDuration = 3000; // 3秒
    this._leftContainer = null;
    this._rightContainer = null;
    this._prevResourceValues = {}; // 追踪资源变化前的值
    // 广播开关：{combat, resource}
    this._settings = this._loadSettings();
  }

  /** 加载广播开关 */
  _loadSettings() {
    try {
      const raw = localStorage.getItem(BROADCAST_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        return {
          combat: obj.combat !== undefined ? !!obj.combat : true,
          resource: obj.resource !== undefined ? !!obj.resource : true
        };
      }
    } catch (e) { /* ignore */ }
    return { combat: true, resource: true };
  }

  /** 持久化广播开关 */
  saveSettings(settings) {
    this._settings = { ...this._settings, ...settings };
    try {
      localStorage.setItem(BROADCAST_KEY, JSON.stringify(this._settings));
    } catch (e) { /* ignore */ }
  }

  getSettings() { return { ...this._settings }; }
  isCombatEnabled() { return this._settings.combat; }
  isResourceEnabled() { return this._settings.resource; }

  init() {
    this._leftContainer = document.getElementById('msg-log-left');
    this._rightContainer = document.getElementById('msg-log-right');
    
    // 初始化资源前值
    const game = window.__game;
    if (game && game.systems && game.systems.resource) {
      const resources = game.systems.resource.getHUDResources();
      resources.forEach(r => {
        this._prevResourceValues[r.id] = r.current;
      });
    }
    
    this._bindEvents();
  }

  _bindEvents() {
    // 资源获得消息（只显示正增量）
    eventBus.on('resourceChanged', (data) => {
      const game = window.__game;
      if (game && game.systems && game.systems.resource) {
        const res = game.systems.resource.getHUDResources().find(r => r.id === data.id);
        if (!res) return;
        
        const prev = this._prevResourceValues[data.id] || 0;
        const delta = res.current - prev;
        
        // 只有正增量才显示消息
        if (delta > 0) {
          this.addLeft(`获得 ${res.name} +${delta}`);
        }
        
        // 更新前值
        this._prevResourceValues[data.id] = res.current;
      }
    });

    // 建筑建成消息
    eventBus.on('buildingComplete', (data) => {
      const building = data.building;
      const cfg = configRegistry.getBuilding(building.buildingId);
      if (cfg) {
        this.addLeft(`已建成 ${cfg.name}`);
      }
    });

    // 人口变化消息
    eventBus.on('populationChanged', (data) => {
      if (data.direction === 'grow') {
        // 遍历所有新居民，每人一条消息
        if (data.names && data.names.length > 0) {
          data.names.forEach(name => {
            this.addRight(`${name}加入了避难所`);
          });
        } else {
          this.addRight('新居民加入了避难所');
        }
      } else if (data.direction === 'starve') {
        // 遍历所有饿死的居民，每人一条消息
        if (data.names && data.names.length > 0) {
          data.names.forEach(name => {
            this.addRight(`${name}因为食物短缺而死亡`);
          });
        } else {
          this.addRight('居民因为食物短缺而死亡');
        }
      } else if (data.direction === 'decline') {
        // 遍历所有离开的居民，每人一条消息
        if (data.names && data.names.length > 0) {
          data.names.forEach(name => {
            this.addRight(`${name}因住房不足离开了`);
          });
        } else {
          this.addRight('居民因住房不足离开了');
        }
      } else if (data.direction === 'accident') {
        this.addRight(data.message || '居民意外死亡');
      }
    });

    // 战斗/灾祸广播（敌人刷新、攻击、击杀、装置损坏等）
    eventBus.on('combatBroadcast', (data) => {
      this.addRight(data.message || '');
    });
  }

  /**
   * 添加左侧消息（资源、建造）
   */
  addLeft(text) {
    this._addMessage(text, 'left');
  }

  /**
   * 添加右侧消息（人口、灾祸）
   */
  addRight(text) {
    this._addMessage(text, 'right');
  }

  _addMessage(text, side) {
    const container = side === 'left' ? this._leftContainer : this._rightContainer;
    const messages = side === 'left' ? this.leftMessages : this.rightMessages;

    if (!container) return;

    // 广播开关过滤：左侧(资源/建造)受 resource 开关，右侧(人口/灾祸/战斗)受 combat 开关
    if (side === 'left' && !this._settings.resource) return;
    if (side === 'right' && !this._settings.combat) return;

    // 创建消息元素
    const msgEl = document.createElement('div');
    msgEl.className = `msg-item ${side}`;
    msgEl.textContent = text;
    msgEl.title = text;

    // 存档故障信息包含精确的 $.field.path，必须完整展示并保留更久。
    const isDiagnostic = /自动存档失败/.test(text);
    if (isDiagnostic) msgEl.classList.add('diagnostic');

    // 添加到容器顶部
    container.insertBefore(msgEl, container.firstChild);

    // 添加到消息列表
    messages.unshift({
      element: msgEl,
      timeout: setTimeout(() => {
        this._removeMessage(msgEl, side);
      }, isDiagnostic ? Math.max(this.messageDuration, 12000) : this.messageDuration)
    });

    // 限制最大消息数
    if (messages.length > this.maxMessages) {
      const oldest = messages.pop();
      if (oldest) {
        clearTimeout(oldest.timeout);
        oldest.element.remove();
      }
    }

    // 入场动画
    if (window.gsap) {
      gsap.fromTo(msgEl,
        { opacity: 0, y: -10, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(1.5)' }
      );
    }
  }

  _removeMessage(element, side) {
    const messages = side === 'left' ? this.leftMessages : this.rightMessages;
    const index = messages.findIndex(m => m.element === element);
    if (index >= 0) {
      messages.splice(index, 1);
    }

    // 离场动画
    if (window.gsap) {
      gsap.to(element, {
        opacity: 0,
        y: side === 'left' ? -10 : 10,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => {
          element.remove();
        }
      });
    } else {
      element.remove();
    }
  }

  /**
   * 手动添加消息（用于外部调用）
   * @param {string} text - 消息内容
   * @param {string} type - 'resource' | 'building' | 'population' | 'disaster'
   */
  add(text, type) {
    if (type === 'resource' || type === 'building') {
      this.addLeft(text);
    } else {
      this.addRight(text);
    }
  }

  clear() {
    this._clearSide('left');
    this._clearSide('right');
  }

  _clearSide(side) {
    const container = side === 'left' ? this._leftContainer : this._rightContainer;
    const messages = side === 'left' ? this.leftMessages : this.rightMessages;

    messages.forEach(m => clearTimeout(m.timeout));
    messages.length = 0;
    if (container) {
      container.innerHTML = '';
    }
  }
}

// 全局单例
export const messageLog = new MessageLog();
