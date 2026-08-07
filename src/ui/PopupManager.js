/**
 * PopupManager - 弹窗系统
 * 统一外壳 + 导航栈 + 待显示队列 + 注册式面板渲染函数
 *
 * 弹窗请求统一走“待显示队列”：open() 只向队尾追加请求，
 * 当前无弹窗时立即展示，有弹窗时等待其关闭后再按入队顺序展示。
 * 避免多个来源（每日结算 / 赫斯提亚登场 / 奢侈品解锁 / 战斗预览……）
 * 同时调用 open() 互相冲掉对方的弹窗。
 * push()/pop() 仍是弹窗内部的导航栈，用于面板间的钻取与返回。
 */
import { eventBus } from '../core/EventBus.js';
import { renderTutorialPromptPanel } from './panels/tutorial-prompt-panel.js';
import { renderSaveRecoveryPanel } from './panels/save-recovery-panel.js';
import { renderBattlePreviewPanel } from './panels/battle-preview-panel.js';

// 阻塞时间的面板类型
const SYSTEM_DIALOG_TYPE = '_system_dialog';
const BLOCKING_TYPES = ['event', 'daily_settlement', 'expedition_prep', 'game_over', 'tutorial_prompt', 'battle_preview', 'hestia_arrival', 'feature_unlock', SYSTEM_DIALOG_TYPE];

export class PopupManager {
  constructor(gameLoop, techSystem, cultureSystem, combatSystem) {
    this._gameLoop = gameLoop;
    this._techSystem = techSystem || null;
    this._cultureSystem = cultureSystem || null;
    this._combatSystem = combatSystem || null;
    this._stack = [];
    this._pendingQueue = []; // 待显示队列：所有“打开弹窗”请求先入队，串行展示
    this._closing = false;   // 关闭流程中暂不排空，popupClosed 回调里新请求先入队
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
   * 打开面板（入队）
   *
   * 所有“打开弹窗”请求统一进入待显示队列：当前无弹窗时立即展示；
   * 已有弹窗时等待其关闭后再按入队顺序展示，互不冲掉。
   */
  open(type, data) {
    this._pendingQueue.push({ type, data });
    this._drainQueue();
  }

  /**
   * 排空待显示队列：仅在没有弹窗展示时，按入队顺序取下一个请求展示
   */
  _drainQueue() {
    if (this._isOpen || this._closing) return;
    if (this._pendingQueue.length === 0) return;
    const req = this._pendingQueue.shift();
    this._stack = [{ type: req.type, data: req.data }];
    this._show();
    this._render();
  }

  /**
   * 队列条目是否为阻塞弹窗（与 _isBlocking 相同的判定，作用于尚未展示的请求）
   */
  _isRequestBlocking(req) {
    if (req.data?.blocking === true) return true;
    if (req.data?.blocking === false) return false;
    return BLOCKING_TYPES.includes(req.type);
  }

  openArmyDetail(armyId) {
    this.open('army_panel', { armyId });
  }

  previewBattle(data) {
    return new Promise(resolve => this.open('battle_preview', { ...data, _resolvePreview: resolve }));
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
    // 栈为空（如主界面按钮直接调 push）时退化为 open：push 只渲染不显示，
    // 空栈直接压栈会导致弹窗内容渲染但 overlay 不可见
    if (this._stack.length === 0) {
      this.open(type, data);
      return;
    }
    this._stack.push({ type, data });
    this._render();
  }

  /**
   * 返回上一层
   */
  pop() {
    const current = this._stack[this._stack.length - 1];
    if (current?.type === SYSTEM_DIALOG_TYPE) {
      this._resolveSystemDialog(this._getDialogCancelValue(current.data));
      return;
    }
    if (this._stack.length <= 1) {
      this.close();
      return;
    }
    this._stack.pop();
    this._render();
  }

  /**
   * 关闭弹窗
   * @param {{force?: boolean}} [options] force 允许程序化强制关闭
   * 不可关闭面板（game_over / hestia_arrival / nonClosable）只拦截玩家操作，
   * 面板自身流程（如赫斯提亚剧情结束时链入下一个弹窗）需要 force 关闭
   */
  close({ force = false } = {}) {
    const current = this._stack[this._stack.length - 1];
    if (!force && (current?.type === 'game_over' || current?.type === 'hestia_arrival' || current?.data?.nonClosable)) return;
    if (current?.type === SYSTEM_DIALOG_TYPE) {
      this._resolveSystemDialog(this._getDialogCancelValue(current.data));
      return;
    }
    this._closeAll();
  }

  _closeAll() {
    // 清理详情面板的序列帧动画定时器
    this._cleanupAnimations();
    this._stack = [];
    this._isOpen = false;
    this._currentType = null;
    this.overlay.classList.remove('active');
    this.body.innerHTML = '';
    this.footer.style.display = 'none';
    this.footer.innerHTML = '';

    // 通知弹窗已关闭（EventSystem 用此事件驱动队列处理）；
    // 关闭期间回调可能再次请求弹窗：先入队，待关闭完成后统一排空
    this._closing = true;
    eventBus.emit('popupClosed');
    this._closing = false;

    // 恢复游戏时间；若队列中下一个请求是阻塞弹窗则保持暂停（避免 BGM 淡入淡出抖动）
    const nextBlocking = this._pendingQueue.length > 0 && this._isRequestBlocking(this._pendingQueue[0]);
    if (this._gameLoop.isPaused() && !nextBlocking) {
      this._gameLoop.resume();
    }

    // 展示下一个待显示弹窗（阻塞弹窗会通过 _show 重新暂停）
    this._drainQueue();
  }

  alert(message, options = {}) {
    return this._openSystemDialog({
      mode: 'alert',
      title: options.title || '提示',
      message,
      okText: options.okText || '确定',
      blocking: options.blocking !== false
    });
  }

  confirm(message, options = {}) {
    return this._openSystemDialog({
      mode: 'confirm',
      title: options.title || '确认操作',
      message,
      okText: options.okText || '确定',
      cancelText: options.cancelText || '取消',
      blocking: options.blocking !== false
    });
  }

  prompt(message, defaultValue = '', options = {}) {
    return this._openSystemDialog({
      mode: 'prompt',
      title: options.title || '输入',
      message,
      defaultValue,
      okText: options.okText || '确定',
      cancelText: options.cancelText || '取消',
      blocking: options.blocking !== false
    });
  }

  _openSystemDialog(data) {
    return new Promise((resolve) => {
      const dialogData = { ...data, _resolve: resolve };
      if (this._isOpen && this._stack.length > 0) {
        this._stack.push({ type: SYSTEM_DIALOG_TYPE, data: dialogData });
        this._render();
      } else {
        this._pendingQueue.push({ type: SYSTEM_DIALOG_TYPE, data: dialogData });
        this._drainQueue();
      }
    });
  }

  _resolveSystemDialog(value) {
    const current = this._stack[this._stack.length - 1];
    if (current?.type !== SYSTEM_DIALOG_TYPE) return;

    const resolve = current.data?._resolve;
    this._cleanupAnimations();
    this._stack.pop();

    if (this._stack.length === 0) {
      this._isOpen = false;
      this._currentType = null;
      this.overlay.classList.remove('active');
      this.body.innerHTML = '';
      this.footer.style.display = 'none';
      this.footer.innerHTML = '';
      this._closing = true;
      eventBus.emit('popupClosed');
      this._closing = false;
      const nextBlocking = this._pendingQueue.length > 0 && this._isRequestBlocking(this._pendingQueue[0]);
      if (this._gameLoop.isPaused() && !nextBlocking) this._gameLoop.resume();
      this._drainQueue();
    } else {
      this._render();
    }

    if (typeof resolve === 'function') resolve(value);
  }

  _getDialogCancelValue(data) {
    if (data?.mode === 'confirm') return false;
    if (data?.mode === 'prompt') return null;
    return true;
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
      if (el._popupCleanup && typeof el._popupCleanup === 'function') {
        el._popupCleanup();
        el._popupCleanup = null;
      }
    }
  }

  _show() {
    this._isOpen = true;
    this.overlay.classList.add('active');

    // 阻塞弹窗暂停游戏；若已处于暂停（前一个阻塞弹窗刚关闭、队列中仍有阻塞弹窗），
    // 不重复计数，保证 _pauseCount 只在 0/1 之间变化
    if (this._isBlocking() && !this._gameLoop.isPaused()) {
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
    this.container.dataset.popupType = current.type;
    const renderFn = this._panels[current.type];

    // 更新标题和返回按钮
    this.backBtn.style.display = this._stack.length > 1 && current.type !== SYSTEM_DIALOG_TYPE ? 'flex' : 'none';
    this.closeBtn.style.display = ['game_over', 'battle_preview'].includes(current.type) ? 'none' : 'flex';
    this.titleEl.textContent = this._getTitle(current.type, current.data);

    // 清理旧面板的动画定时器，然后清空 body
    this._cleanupAnimations();
    this.body.innerHTML = '';
    this.body.style.cssText = '';
    this.footer.innerHTML = '';
    this.footer.style.display = 'none';

    if (renderFn) {
      renderFn(current.data, this.body, this);
    } else if (current.type === SYSTEM_DIALOG_TYPE) {
      this._renderSystemDialog(current.data);
    } else {
      this.body.innerHTML = `<p style="color:#999">未知面板类型: ${current.type}</p>`;
    }
  }

  _renderSystemDialog(data) {
    this.body.style.cssText = 'padding:28px 24px;display:flex;justify-content:center;';

    const container = document.createElement('div');
    container.style.cssText = 'width:min(520px,100%);display:flex;flex-direction:column;gap:16px;';

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:14px;color:#d8d8e4;line-height:1.7;white-space:pre-line;text-align:center;';
    msg.textContent = data.message || '';
    container.appendChild(msg);

    let input = null;
    if (data.mode === 'prompt') {
      input = document.createElement('input');
      input.type = 'text';
      input.value = data.defaultValue || '';
      input.style.cssText = [
        'width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px',
        'border:1px solid rgba(255,255,255,0.16);background:rgba(0,0,0,0.22)',
        'color:#ececf0;font-size:14px;font-family:inherit;outline:none'
      ].join(';');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._resolveSystemDialog(input.value);
        if (e.key === 'Escape') this._resolveSystemDialog(null);
      });
      container.appendChild(input);
      setTimeout(() => input.focus(), 0);
    }

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;justify-content:center;';

    if (data.mode !== 'alert') {
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = data.cancelText || '取消';
      cancelBtn.style.cssText = 'min-width:96px;padding:9px 18px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;background:rgba(255,255,255,0.06);color:#c8c8d6;cursor:pointer;font-family:inherit;';
      cancelBtn.addEventListener('click', () => this._resolveSystemDialog(this._getDialogCancelValue(data)));
      actions.appendChild(cancelBtn);
    }

    const okBtn = document.createElement('button');
    okBtn.textContent = data.okText || '确定';
    okBtn.style.cssText = 'min-width:96px;padding:9px 18px;border:1px solid rgba(91,141,239,0.35);border-radius:8px;background:rgba(91,141,239,0.22);color:#dfe8ff;cursor:pointer;font-weight:600;font-family:inherit;';
    okBtn.addEventListener('click', () => {
      if (data.mode === 'confirm') this._resolveSystemDialog(true);
      else if (data.mode === 'prompt') this._resolveSystemDialog(input ? input.value : '');
      else this._resolveSystemDialog(true);
    });
    actions.appendChild(okBtn);
    container.appendChild(actions);

    this.body.appendChild(container);
  }

  _getTitle(type, data) {
    const titles = {
      'building_select': '选择建筑',
      'building_detail': '建筑详情',
      'event': data && data.event ? data.event.name : '事件',
      'warehouse': '大本营',
      'settings': '设置',
      'expedition_prep': '探险准备',
      'expedition_detail': '探险详情',
      'item_detail': '物品详情',
      'torch_detail': '火把详情',
      'game_over': '游戏结束',
      'objective': '战役目标',
      'tech_tree': '科技树',
      'culture_tree': '人文树',
      'military_tradition': '军事传统',
      'unit_research': '兵种研发',
      'outpost_diplomacy': data?.outpostName || '据点外交',
      'tavern_heroes': '历史英雄酒馆',
      'hero_roster': '英雄名册',
      'hero_interaction': data?.heroName || '英雄互动',
      'daily_settlement': `第 ${data?.day || ''} 日结算`,
      'era_civilization': '时代与文明',
      'development_details': '发展详情',
      'luxury_trade': '奢侈品',
      'economic_orders': '农业总览',
      'commercial': '城市商业',
      'trade': '城邦贸易',
      'commerce': '城邦贸易',
      'world_factions': '世界势力与野外目标',
      'save_recovery': '存档恢复',
      'tutorial_prompt': '新手教程',
      'quest_panel': '任务',
      'army_panel': '军团详情',
      'enemy_detail': '敌人详情',
      'battle_preview': '战斗预估',
      'training_panel': '兵种训练',
      'feature_unlock': data?.title || '新系统解锁'
    };
    if (type === SYSTEM_DIALOG_TYPE) return data?.title || '提示';
    return titles[type] || '';
  }

  _isBlocking() {
    // 优先检查栈顶（_stack 在 _show() 之前已被设置），
    // 回退到 _currentType（兼容 _render() 中的 push 场景）
    const current = this._stack.length > 0
      ? this._stack[this._stack.length - 1]
      : null;
    if (current?.data?.blocking === true) return true;
    if (current?.data?.blocking === false) return false;

    const type = this._stack.length > 0
      ? current.type
      : this._currentType;
    return type && BLOCKING_TYPES.includes(type);
  }

  /**
   * 注册内置面板
   */
  _registerBuiltinPanels() {
    this.register('battle_preview', renderBattlePreviewPanel);
    this.register('tutorial_prompt', renderTutorialPromptPanel);
    this.register('save_recovery', renderSaveRecoveryPanel);
    import('./panels/feature-unlock-panel.js').then(m => {
      this.register('feature_unlock', m.renderFeatureUnlockPanel);
      this.register('hestia_arrival', m.renderHestiaArrivalPanel);
    });

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
    import('./panels/daily-settlement-panel.js').then(m => {
      this.register('daily_settlement', m.renderDailySettlementPanel);
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
    import('./panels/objective-panel.js').then(m => {
      this.register('objective', m.renderObjectivePanel);
    });
    import('./panels/tech-tree-panel.js').then(m => {
      this.register('tech_tree', m.renderTechTreePanel);
    });
    import('./panels/culture-tree-panel.js').then(m => {
      this.register('culture_tree', m.renderCultureTreePanel);
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
    import('./panels/enemy-detail-panel.js').then(m => {
      this.register('enemy_detail', m.renderEnemyDetailPanel);
    });
    import('./panels/unit-research-panel.js').then(m => {
      this.register('unit_research', m.renderUnitResearchPanel);
    });
    import('./panels/doctrine-panel.js').then(m => {
      this.register('doctrine_panel', m.renderDoctrinePanel);
      this.register('military_tradition', m.renderMilitaryTraditionPanel);
    });
    import('./panels/outpost-diplomacy-panel.js').then(m => {
      this.register('outpost_diplomacy', m.renderOutpostDiplomacyPanel);
    });
    import('./panels/tavern-heroes-panel.js').then(m => {
      this.register('tavern_heroes', m.renderTavernHeroesPanel);
    });
    import('./panels/hero-social-panel.js').then(m => {
      this.register('hero_roster', m.renderHeroRosterPanel);
      this.register('hero_interaction', m.renderHeroInteractionPanel);
    });
    import('./panels/era-civilization-panel.js').then(m => {
      this.register('era_civilization', m.renderEraCivilizationPanel);
    });
    import('./panels/development-details-panel.js').then(m => {
      this.register('development_details', m.renderDevelopmentDetailsPanel);
    });
    import('./panels/luxury-trade-panel.js').then(m => {
      this.register('luxury_trade', m.renderLuxuryTradePanel);
    });
    import('./panels/economic-orders-panel.js').then(m => {
      this.register('economic_orders', m.renderEconomicOrdersPanel);
    });
    import('./panels/commercial-overview-panel.js').then(m => {
      this.register('commercial', m.renderCommercialOverviewPanel);
    });
    import('./panels/trade-panel.js').then(m => {
      this.register('trade', m.renderTradePanel);
      this.register('commerce', m.renderTradePanel);
    });
    import('./panels/world-factions-panel.js').then(m => {
      this.register('world_factions', m.renderWorldFactionsPanel);
    });
  }
}
