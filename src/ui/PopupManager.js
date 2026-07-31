/**
 * PopupManager - 弹窗系统
 * 统一外壳 + 导航栈 + 注册式面板渲染函数
 */
import { eventBus } from '../core/EventBus.js';
import { renderTutorialPromptPanel } from './panels/tutorial-prompt-panel.js';

// 阻塞时间的面板类型
const BLOCKING_TYPES = ['event', 'expedition_prep', 'game_over', 'tutorial_prompt'];

export class PopupManager {
  constructor(gameLoop, techSystem, cultureSystem, alchemySystem, combatSystem) {
    this._gameLoop = gameLoop;
    this._techSystem = techSystem || null;
    this._cultureSystem = cultureSystem || null;
    this._alchemySystem = alchemySystem || null;
    this._combatSystem = combatSystem || null;
    this._stack = [];
    this._panels = {}; // 注册的面板渲染函数
    this._isOpen = false;
    this._currentType = null;

    this._cacheDOM();
    this._bindEvents();
    this._registerBuiltinPanels();
  }

  _cacheDOM() {
    this.overlay = document.getElementById('popup-overlay');
    this.container = document.getElementById('popup-container');
    this.header = document.getElementById('popup-header');
    this.backBtn = document.getElementById('popup-back-btn');
    this.titleEl = document.getElementById('popup-title');
    this.closeBtn = document.getElementById('popup-close-btn');
    this.body = document.getElementById('popup-body');
    this.footer = document.getElementById('popup-footer');
  }

  _bindEvents() {
    this.closeBtn.addEventListener('click', () => this.close());
    this.backBtn.addEventListener('click', () => this.pop());

    // 点击遮罩关闭（仅非阻塞弹窗）
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay && !this._isBlocking()) {
        this.close();
      }
    });
  }

  /**
   * 注册面板渲染函数
   */
  register(type, renderFn) {
    this._panels[type] = renderFn;
  }

  /**
   * 打开面板（清空栈）
   */
  open(type, data) {
    this._stack = [{ type, data }];
    this._show();
    this._render();
  }

  /**
   * 原地刷新当前面板（不关闭、不播放动画，避免闪烁）
   */
  refresh(data) {
    if (this._stack.length === 0) return;
    if (data !== undefined) {
      this._stack[this._stack.length - 1].data = data;
    }
    this._render();
  }

  /**
   * 压入子面板
   */
  push(type, data) {
    this._stack.push({ type, data });
    this._render();
  }

  /**
   * 返回上一层
   */
  pop() {
    if (this._stack.length <= 1) {
      this.close();
      return;
    }
    this._stack.pop();
    this._render();
  }

  /**
   * 关闭弹窗
   */
  close() {
    // 清理详情面板的序列帧动画定时器
    this._cleanupAnimations();
    this._stack = [];
    this._isOpen = false;
    this._currentType = null;
    this.overlay.classList.remove('active');
    this.body.innerHTML = '';
    this.footer.style.display = 'none';
    this.footer.innerHTML = '';

    // 通知弹窗已关闭（EventSystem 用此事件驱动队列处理）
    eventBus.emit('popupClosed');

    // 恢复游戏时间（如果事件队列中还有待处理事件，EventSystem 会同步重新暂停）
    if (this._gameLoop.isPaused()) {
      this._gameLoop.resume();
    }
  }

  /**
   * 清理 body 中所有 _animCleanup 回调（序列帧动画定时器）
   */
  _cleanupAnimations() {
    const elements = this.body.querySelectorAll('*');
    for (const el of elements) {
      if (el._animCleanup && typeof el._animCleanup === 'function') {
        el._animCleanup();
        el._animCleanup = null;
      }
    }
  }

  _show() {
    this._isOpen = true;
    this.overlay.classList.add('active');

    // 阻塞弹窗暂停游戏
    if (this._isBlocking()) {
      this._gameLoop.pause();
    }

    // GSAP 动画 — 玻璃面板入场
    if (window.gsap) {
      gsap.fromTo(this.overlay,
        { opacity: 0 },
        { opacity: 1, duration: 0.2, ease: 'power2.out' }
      );
      gsap.fromTo(this.container,
        { scale: 0.92, opacity: 0, y: 8 },
        { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: 'back.out(1.4)' }
      );
    }
  }

  _render() {
    const current = this._stack[this._stack.length - 1];
    if (!current) return;

    this._currentType = current.type;
    const renderFn = this._panels[current.type];

    // 更新标题和返回按钮
    this.backBtn.style.display = this._stack.length > 1 ? 'flex' : 'none';
    this.titleEl.textContent = this._getTitle(current.type, current.data);

    // 清理旧面板的动画定时器，然后清空 body
    this._cleanupAnimations();
    this.body.innerHTML = '';
    this.body.style.cssText = '';
    this.footer.innerHTML = '';
    this.footer.style.display = 'none';

    if (renderFn) {
      renderFn(current.data, this.body, this);
    } else {
      this.body.innerHTML = `<p style="color:#999">未知面板类型: ${current.type}</p>`;
    }
  }

  _getTitle(type, data) {
    const titles = {
      'building_select': '选择建筑',
      'building_detail': '建筑详情',
      'event': data && data.event ? data.event.name : '事件',
      'warehouse': '仓库',
      'settings': '设置',
      'expedition_prep': '探险准备',
      'expedition_detail': '探险详情',
      'item_detail': '物品详情',
      'torch_detail': '火把详情',
      'game_over': '游戏结束',
      'tech_tree': '科技树',
      'culture_tree': '人文树',
      'military_tradition': '军事传统',
      'alchemy_lab': '炼金实验室',
      'potion_inventory': '药剂库存',
      'tamed_pool': '驯养管理',
      'unit_research': '兵种研发',
      'tutorial_prompt': '新手教程',
      'quest_panel': '任务'
    };
    return titles[type] || '';
  }

  _isBlocking() {
    // 优先检查栈顶（_stack 在 _show() 之前已被设置），
    // 回退到 _currentType（兼容 _render() 中的 push 场景）
    const current = this._stack.length > 0
      ? this._stack[this._stack.length - 1]
      : null;
    if (current?.data?.blocking === true) return true;

    const type = this._stack.length > 0
      ? current.type
      : this._currentType;
    return type && BLOCKING_TYPES.includes(type);
  }

  /**
   * 注册内置面板
   */
  _registerBuiltinPanels() {
    this.register('tutorial_prompt', renderTutorialPromptPanel);

    // 延迟导入避免循环依赖，使用动态注册
    import('./panels/building-select-panel.js').then(m => {
      this.register('building_select', m.renderBuildingSelectPanel);
    });
    import('./panels/building-detail-panel.js').then(m => {
      this.register('building_detail', m.renderBuildingDetailPanel);
    });
    import('./panels/event-panel.js').then(m => {
      this.register('event', m.renderEventPanel);
    });
    import('./panels/settings-panel.js').then(m => {
      this.register('settings', m.renderSettingsPanel);
    });
    import('./panels/expedition-prep-panel.js').then(m => {
      this.register('expedition_prep', m.renderExpeditionPrepPanel);
    });
    import('./panels/expedition-detail-panel.js').then(m => {
      this.register('expedition_detail', m.renderExpeditionDetailPanel);
    });
    import('./panels/torch-detail-panel.js').then(m => {
      this.register('torch_detail', m.renderTorchDetailPanel);
    });
    import('./panels/gameover-panel.js').then(m => {
      this.register('game_over', m.renderGameOverPanel);
    });
    import('./panels/tech-tree-panel.js').then(m => {
      this.register('tech_tree', m.renderTechTreePanel);
    });
    import('./panels/culture-tree-panel.js').then(m => {
      this.register('culture_tree', m.renderCultureTreePanel);
    });
    import('./panels/alchemy-panel.js').then(m => {
      this.register('alchemy_lab', (data, body, pm) => {
        m.renderAlchemyPanel({ ...data, alchemySystem: this._alchemySystem }, body, pm);
      });
    });
    import('./panels/potion-inventory-panel.js').then(m => {
      this.register('potion_inventory', (data, body, pm) => {
        m.renderPotionInventoryPanel({ ...data, alchemySystem: this._alchemySystem }, body, pm);
      });
    });
    import('./panels/tamed-pool-panel.js').then(m => {
      this.register('tamed_pool', (data, body, pm) => {
        m.renderTamedPoolPanel({ ...data, combatSystem: this._combatSystem }, body, pm);
      });
    });
    import('./panels/quest-panel.js').then(m => {
      this.register('quest_panel', m.renderQuestPanel);
    });
    import('./panels/army-panel.js').then(m => {
      this.register('army_panel', (data, body, pm) => {
        m.renderArmyPanel({ ...data, combatSystem: this._combatSystem }, body, pm);
      });
    });
    import('./panels/training-panel.js').then(m => {
      this.register('training_panel', m.renderTrainingPanel);
    });
    import('./panels/unit-research-panel.js').then(m => {
      this.register('unit_research', m.renderUnitResearchPanel);
    });
    import('./panels/doctrine-panel.js').then(m => {
      this.register('doctrine_panel', m.renderDoctrinePanel);
      this.register('military_tradition', m.renderMilitaryTraditionPanel);
    });
  }
}
