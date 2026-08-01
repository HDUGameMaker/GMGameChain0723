/**
 * EventSystem - 事件系统
 * 管理事件触发、条件检查、效果执行、分支叙事
 *
 * 全局概率机制：
 * - 每 tick 掷一次全局骰子（eventTriggerChance），通过后从所有可用事件中随机选一个触发
 * - 事件之间设有最小间隔（eventMinInterval），避免连续触发
 * - 链式专用事件（空条件 + probability=1）不参与随机抽取，只能通过 trigger_event / schedule_event 触发
 *
 * 延迟触发：
 * - schedule_event 效果可将事件延迟 N 天后触发
 * - 适用于"旅人离开 → 2天后回归"这类叙事
 *
 * 事件处理队列：
 * - 事件触发后先进队列，在队列中逐个处理
 * - 处理事件期间时间暂停，新事件不会触发
 * - 事件链（trigger_event）也进入队列顺序处理
 * - 队列清空后自动恢复时间流逝
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class EventSystem {
  constructor(popupManager) {
    this._popupManager = popupManager || null;
    this._events = [];
    this._triggerCounts = {};     // { eventId: count }
    this._cooldowns = {};         // { eventId: remainingTicks }
    this._resourceSystem = null;
    this._itemSystem = null;
    this._buildingSystem = null;
    this._timeSystem = null;
    this._gameLoop = null;
    this._alchemySystem = null;

    // === 全局概率参数 ===
    this._eventTriggerChance = 0.25;  // 每 tick 触发事件的全局概率
    this._eventMinInterval = 4;       // 事件最小间隔 tick 数
    this._globalEventCooldown = 0;    // 全局事件冷却剩余 tick

    // === 事件处理队列 ===
    this._eventQueue = [];          // 待处理事件数组
    this._isProcessing = false;     // 是否正在处理事件
    this._currentEvent = null;      // 当前打开但尚未选择的事件
    this._currentEventHandled = false;
    this._deferredEvents = [];      // 玩家关闭后稍后处理的事件

    // === 延迟事件 ===
    this._pendingEvents = [];       // { eventId, triggerDay, triggerPeriodIndex }

    // 注册效果处理器
    this._effectHandlers = {};
    this._registerBuiltinEffects();

    // 订阅 tick
    eventBus.on('tick', (data) => this.onTick(data));
    eventBus.on('periodEnd', (data) => this._onPeriodEnd(data));

    // 订阅弹窗关闭（驱动队列处理）
    eventBus.on('popupClosed', () => this._onPopupClosed());
  }

  setSystems({ resource, item, building, time, gameLoop, alchemy }) {
    this._resourceSystem = resource;
    this._itemSystem = item;
    this._buildingSystem = building;
    this._timeSystem = time;
    this._gameLoop = gameLoop;
    this._alchemySystem = alchemy || null;

    // 从全局配置读取事件参数
    const globalConfig = configRegistry.get('global');
    if (globalConfig) {
      if (globalConfig.eventTriggerChance !== undefined) {
        this._eventTriggerChance = globalConfig.eventTriggerChance;
      }
      if (globalConfig.eventMinInterval !== undefined) {
        this._eventMinInterval = globalConfig.eventMinInterval;
      }
    }
  }

  initNew() {
    this._events = configRegistry.getAllEvents();
    this._triggerCounts = {};
    this._cooldowns = {};
    this._eventQueue = [];
    this._isProcessing = false;
    this._currentEvent = null;
    this._currentEventHandled = false;
    this._globalEventCooldown = 0;
    this._pendingEvents = [];
    this._deferredEvents = [];
    this._updateDeferredStore();
  }

  _registerBuiltinEffects() {
    this.registerEffect('add_resource', (params) => {
      if (this._resourceSystem) {
        this._resourceSystem.addClamped(params.resourceId, params.amount);
      }
    });

    this.registerEffect('consume_resource', (params) => {
      if (this._resourceSystem) {
        if (!this._resourceSystem.hasEnough(params.resourceId, params.amount)) {
          console.warn(`[EventSystem] consume_resource failed: not enough ${params.resourceId} (need ${params.amount})`);
          return;
        }
        this._resourceSystem.tryConsume(params.resourceId, params.amount);
      }
    });

    this.registerEffect('obtain_item', (params) => {
      if (this._itemSystem) {
        this._itemSystem.obtain(params.itemId);
      }
    });

    this.registerEffect('add_material', (params) => {
      if (this._alchemySystem) {
        this._alchemySystem.addMaterial(params.materialId, params.amount || 1);
      }
    });

    this.registerEffect('consume_item', (params) => {
      if (this._itemSystem) {
        // 找到第一个匹配的实例并失去
        const instances = this._itemSystem.getOwnedInstances();
        const target = instances.find(i => i.itemId === params.itemId && !i.inExpedition);
        if (target) {
          this._itemSystem.lose(target.instanceId);
        }
      }
    });

    this.registerEffect('unlock_building', (params) => {
      // 建筑解锁逻辑（预留）
      console.log(`[Event] unlock_building: ${params.buildingId}`);
    });

    this.registerEffect('trigger_event', (params) => {
      // 链式触发：进入队列而不是直接打开弹窗
      this._triggerEventDirect(params.eventId);
    });

    this.registerEffect('schedule_event', (params) => {
      // 延迟触发：N 天后触发目标事件
      this._scheduleEvent(params.eventId, params.delayDays || 1);
    });

    this.registerEffect('log', (params) => {
      console.log(`[Event Log] ${params.message}`);
    });
  }

  registerEffect(type, handler) {
    this._effectHandlers[type] = handler;
  }

  // ===== Tick 处理 =====

  onTick(data) {
    // 如果事件队列正在处理中，不触发新事件
    if (this._isProcessing || this._eventQueue.length > 0) return;

    // 减少各事件冷却（后台也正常推进）
    for (const [eventId, remaining] of Object.entries(this._cooldowns)) {
      if (remaining > 0) {
        this._cooldowns[eventId]--;
        if (this._cooldowns[eventId] <= 0) delete this._cooldowns[eventId];
      }
    }

    // 检查到期的延迟事件（后台也正常触发）
    this._checkPendingEvents(data);

    // 全局事件间隔冷却（后台也正常推进）
    if (this._globalEventCooldown > 0) {
      this._globalEventCooldown--;
      return;
    }

    // 页面不可见时（切到后台标签页），跳过随机事件触发
    // 冷却和延迟事件正常推进，但不会弹出新事件打扰用户
    if (this._gameLoop && !this._gameLoop.isPageVisible()) {
      return;
    }

    // === 全局概率系统 ===
    // 每 tick 只掷一次全局骰子
    const roll = Math.random();
    if (roll >= this._eventTriggerChance) return;

    // 收集候选事件（排除链式专用事件）
    const candidates = this._collectCandidates(data);
    if (candidates.length === 0) return;

    // 加权随机选择一个触发
    const evt = this._weightedRandomPick(candidates);
    if (evt) {
      console.log(`[EventSystem] Global roll passed (${roll.toFixed(3)} < ${this._eventTriggerChance}), picked "${evt.name}" from ${candidates.length} candidates`);
      this._triggerEvent(evt);

      // 设置全局事件冷却
      this._globalEventCooldown = this._eventMinInterval;
    }
  }

  /**
   * 判断事件是否为「链式专用」—— 只能通过 trigger_event / schedule_event 触发
   * 条件：所有触发条件字段为空 AND probability === 1
   * 这类事件不参与 tick 随机抽取
   */
  _isChainOnly(evt) {
    const cond = evt.triggerConditions;
    if (!cond) return false;

    const hasTimeCond = cond.timePeriods && cond.timePeriods.length > 0;
    const hasItemCond = cond.requiredItems && cond.requiredItems.length > 0;
    const hasBuildingCond = cond.requiredBuildings && cond.requiredBuildings.length > 0;
    const hasRegionCond = cond.regions && cond.regions.length > 0;
    const hasCarriedCond = cond.requiredCarriedItems && cond.requiredCarriedItems.length > 0;

    // 所有触发条件都为空，且 probability 为 1 → 链式专用
    return !hasTimeCond && !hasItemCond && !hasBuildingCond
        && !hasRegionCond && !hasCarriedCond && evt.probability === 1;
  }

  _collectCandidates(data) {
    const candidates = [];
    const currentPeriod = data.period;

    for (const evt of this._events) {
      // 跳过探险事件（有非空 regions 字段的）
      if (evt.triggerConditions && evt.triggerConditions.regions && evt.triggerConditions.regions.length > 0) continue;

      // 跳过链式专用事件（空条件 + probability=1），它们只能通过 trigger_event 触发
      if (this._isChainOnly(evt)) continue;

      // maxTriggers 检查
      if (evt.maxTriggers !== null && evt.maxTriggers !== undefined) {
        if ((this._triggerCounts[evt.id] || 0) >= evt.maxTriggers) continue;
      }

      // 冷却检查
      if (this._cooldowns[evt.id] > 0) continue;

      // 失效条件检查
      if (this._checkInvalidation(evt)) continue;

      // 触发条件检查
      if (this._checkTriggerConditions(evt, currentPeriod)) {
        candidates.push(evt);
      }
    }

    return candidates;
  }

  /**
   * 加权随机选择
   * 事件的 probability 字段作为权重，默认权重 1
   */
  _weightedRandomPick(candidates) {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // 计算总权重
    const weights = candidates.map(e => Math.max(0, e.probability || 1));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    if (totalWeight <= 0) {
      // 所有权重为 0，均匀随机
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    let roll = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i];
    }

    return candidates[candidates.length - 1];
  }

  _checkTriggerConditions(evt, currentPeriod) {
    const cond = evt.triggerConditions;
    if (!cond) return true;

    // timePeriods: OR（满足任一即通过），空=任意
    if (cond.timePeriods && cond.timePeriods.length > 0) {
      if (!cond.timePeriods.includes(currentPeriod)) return false;
    }

    // requiredItems: AND（必须全部持有）
    if (cond.requiredItems && cond.requiredItems.length > 0) {
      for (const itemId of cond.requiredItems) {
        if (!this._itemSystem || !this._itemSystem.isOwned(itemId)) return false;
      }
    }

    // requiredBuildings: AND（必须全部存在）
    if (cond.requiredBuildings && cond.requiredBuildings.length > 0) {
      for (const buildingId of cond.requiredBuildings) {
        if (!this._buildingSystem || !this._buildingSystem.hasBuilding(buildingId)) return false;
      }
    }

    return true;
  }

  _checkInvalidation(evt) {
    const cond = evt.invalidationConditions;
    if (!cond) return false;

    // 失效条件各字段间 OR 关系

    // timePeriods: 处于任一时段即失效
    if (cond.timePeriods && cond.timePeriods.length > 0) {
      const currentPeriod = this._timeSystem ? this._timeSystem.currentPeriod : '';
      if (cond.timePeriods.includes(currentPeriod)) return true;
    }

    // requiredItems: 持有任一即失效
    if (cond.requiredItems && cond.requiredItems.length > 0) {
      for (const itemId of cond.requiredItems) {
        if (this._itemSystem && this._itemSystem.isOwned(itemId)) return true;
      }
    }

    // requiredBuildings: 存在任一即失效
    if (cond.requiredBuildings && cond.requiredBuildings.length > 0) {
      for (const buildingId of cond.requiredBuildings) {
        if (this._buildingSystem && this._buildingSystem.hasBuilding(buildingId)) return true;
      }
    }

    return false;
  }

  // ===== 延迟事件 =====

  /**
   * 将事件加入延迟队列
   * @param {string} eventId - 目标事件 ID
   * @param {number} delayDays - 延迟天数
   */
  _scheduleEvent(eventId, delayDays) {
    if (!this._timeSystem) {
      console.warn('[EventSystem] Cannot schedule event: TimeSystem not available');
      return;
    }

    const currentDay = this._timeSystem.day;
    const currentPeriodIndex = this._timeSystem.periodIndex;
    const triggerDay = currentDay + delayDays;

    this._pendingEvents.push({
      eventId,
      triggerDay,
      // 在同一天的第 0 个 period（morning）触发，或者保持当前 period
      triggerPeriodIndex: currentPeriodIndex
    });

    console.log(`[EventSystem] Scheduled event "${eventId}" for day ${triggerDay} (current: day ${currentDay}, ${delayDays} day(s) later)`);
  }

  /**
   * 每 tick 检查是否有到期的延迟事件
   */
  _checkPendingEvents(data) {
    if (this._pendingEvents.length === 0) return;
    if (!this._timeSystem) return;

    const currentDay = this._timeSystem.day;
    const triggered = [];

    for (let i = this._pendingEvents.length - 1; i >= 0; i--) {
      const pending = this._pendingEvents[i];
      if (currentDay >= pending.triggerDay) {
        console.log(`[EventSystem] Pending event "${pending.eventId}" is due (day ${currentDay} >= ${pending.triggerDay})`);
        triggered.push(pending.eventId);
        this._pendingEvents.splice(i, 1);
      }
    }

    // 触发到期的延迟事件（通过 _triggerEventDirect 跳过条件检查）
    for (const eventId of triggered) {
      this._triggerEventDirect(eventId);
    }
  }

  // ===== 事件触发 → 进入队列 =====

  _triggerEvent(evt) {
    this._triggerCounts[evt.id] = (this._triggerCounts[evt.id] || 0) + 1;
    if (evt.cooldownTicks > 0) {
      this._cooldowns[evt.id] = evt.cooldownTicks;
    }
    this._enqueueEvent(evt);
    eventBus.emit('eventTriggered', { eventId: evt.id, name: evt.name });
  }

  _triggerEventDirect(eventId) {
    // trigger_event / schedule_event 效果：跳过条件检查直接触发
    const evt = this._events.find(e => e.id === eventId);
    if (!evt) {
      console.warn(`[EventSystem] Event not found: ${eventId}`);
      return;
    }

    // 检查 maxTriggers
    if (evt.maxTriggers !== null && evt.maxTriggers !== undefined) {
      if ((this._triggerCounts[evt.id] || 0) >= evt.maxTriggers) {
        console.log(`[EventSystem] Event "${evt.name}" maxTriggers reached, skipping`);
        return;
      }
    }

    // 记录触发计数和冷却
    this._triggerCounts[evt.id] = (this._triggerCounts[evt.id] || 0) + 1;
    if (evt.cooldownTicks > 0) {
      this._cooldowns[evt.id] = evt.cooldownTicks;
    }

    // 进入事件队列
    this._enqueueEvent(evt);
  }

  // ===== 事件队列管理 =====

  /**
   * 将事件加入处理队列
   * @param {object} evt - 事件配置对象
   */
  _enqueueEvent(evt) {
    // 避免队列中已存在相同事件
    if (this._eventQueue.some(e => e.id === evt.id)) {
      console.log(`[EventSystem] Event "${evt.name}" already in queue, skipping duplicate`);
      return;
    }

    console.log(`[EventSystem] Enqueued event: "${evt.name}" (queue size: ${this._eventQueue.length + 1})`);
    this._eventQueue.push(evt);

    // 如果当前没有在处理事件，立即开始处理
    if (!this._isProcessing) {
      this._processNextEvent();
    }
  }

  /**
   * 处理队列中的下一个事件
   * 会自动暂停时间，打开事件弹窗
   */
  _processNextEvent() {
    if (this._eventQueue.length === 0) {
      // 队列为空，结束处理，恢复时间
      this._isProcessing = false;
      this._currentEvent = null;
      this._currentEventHandled = false;
      console.log('[EventSystem] Event queue empty, resuming time');
      return;
    }

    this._isProcessing = true;
    const evt = this._eventQueue.shift();
    this._currentEvent = evt;
    this._currentEventHandled = false;

    console.log(`[EventSystem] Processing event: "${evt.name}" (remaining in queue: ${this._eventQueue.length})`);

    // 执行弹出时效果（在弹窗打开前执行）
    if (evt.effects && evt.effects.length > 0) {
      this._executeEffects(evt.effects);
    }

    // 打开事件弹窗（_show() 会通过 _isBlocking() 自动暂停时间）
    this._popupManager.open('event', { event: evt, source: 'eventSystem' });
  }

  /**
   * 弹窗关闭时的回调
   * 如果队列中还有事件，处理下一个；否则结束处理
   */
  _onPopupClosed() {
    if (this._currentEvent && !this._currentEventHandled) {
      this._deferEvent(this._currentEvent);
    }
    this._currentEvent = null;
    this._currentEventHandled = false;

    if (this._eventQueue.length > 0) {
      // 还有待处理事件，继续处理下一个
      this._processNextEvent();
    } else {
      // 队列为空，结束处理
      this._isProcessing = false;
      console.log('[EventSystem] Event processing complete');
    }
  }

  // ===== 效果执行 =====

  /**
   * 执行选项效果列表（由 event-panel 调用）
   * @returns {boolean} 是否包含 trigger_event（链式触发）
   */
  executeOptionEffects(effects) {
    this._currentEventHandled = true;
    if (!effects || effects.length === 0) return false;

    let hasTriggerOrSchedule = false;
    for (const effect of effects) {
      if (effect.type === 'trigger_event' || effect.type === 'schedule_event') {
        hasTriggerOrSchedule = true;
        // 链式/延迟事件通过效果处理器入队
        this._executeEffect(effect);
      } else {
        this._executeEffect(effect);
      }
    }

    // 如果有链式事件或延迟事件，关闭当前弹窗
    if (hasTriggerOrSchedule) {
      this._popupManager.close();
    }

    return hasTriggerOrSchedule;
  }

  chooseOption(eventId, optionIndex) {
    const evt = this._findEventInDeferred(eventId) || (this._currentEvent?.id === eventId ? this._currentEvent : null);
    if (!evt) return { ok: false, reason: '事件不存在或已处理' };
    const option = evt.options?.[optionIndex];
    if (!option) return { ok: false, reason: '选项不存在' };
    if (!this.canAffordOption(option.effects)) return { ok: false, reason: '资源不足，无法选择' };

    this._currentEventHandled = true;
    this._removeDeferredEvent(eventId);
    const hasTrigger = this.executeOptionEffects(option.effects);
    return { ok: true, hasTrigger };
  }

  openDeferredEvent(eventId) {
    const evt = this._findEventInDeferred(eventId);
    if (!evt || !this._popupManager) return false;
    this._currentEvent = evt;
    this._currentEventHandled = false;
    this._removeDeferredEvent(eventId);
    this._popupManager.open('event', { event: evt, source: 'eventSystem', deferred: true });
    return true;
  }

  resolveDefaultOption(eventId) {
    const evt = this._findEventInDeferred(eventId);
    if (!evt) return false;
    const idx = this._getDefaultOptionIndex(evt);
    const result = this.chooseOption(eventId, idx);
    if (!result.ok) {
      console.warn(`[EventSystem] Default option failed for "${evt.name}": ${result.reason}`);
      this._removeDeferredEvent(eventId);
    }
    return result.ok;
  }

  _onPeriodEnd(data) {
    if (!this._timeSystem || this._deferredEvents.length === 0) return;
    const periods = this._timeSystem.PERIOD_NAMES || [];
    const lastPeriod = periods[periods.length - 1];
    if (data?.period !== lastPeriod) return;

    const dueEvents = [...this._deferredEvents];
    for (const evt of dueEvents) {
      this.resolveDefaultOption(evt.id);
    }
  }

  _deferEvent(evt) {
    if (!evt || this._deferredEvents.some(e => e.id === evt.id)) return;
    this._deferredEvents.push(evt);
    this._updateDeferredStore();
    eventBus.emit('eventDeferred', { eventId: evt.id, name: evt.name });
  }

  _findEventInDeferred(eventId) {
    return this._deferredEvents.find(e => e.id === eventId) || null;
  }

  _removeDeferredEvent(eventId) {
    const before = this._deferredEvents.length;
    this._deferredEvents = this._deferredEvents.filter(e => e.id !== eventId);
    if (this._deferredEvents.length !== before) this._updateDeferredStore();
  }

  _getDefaultOptionIndex(evt) {
    const options = evt.options || [];
    if (options.length === 0) return -1;
    const configured = Number.isInteger(evt.defaultOptionIndex) ? evt.defaultOptionIndex : parseInt(evt.defaultOptionIndex, 10);
    if (!Number.isNaN(configured) && configured >= 0 && configured < options.length) return configured;
    return 0;
  }

  _updateDeferredStore() {
    store.setState({
      deferredEvents: this._deferredEvents.map(evt => ({
        id: evt.id,
        name: evt.name,
        description: evt.description || '',
        defaultOptionIndex: this._getDefaultOptionIndex(evt)
      }))
    });
  }

  _executeEffects(effects) {
    for (const effect of effects) {
      this._executeEffect(effect);
    }
  }

  _executeEffect(effect) {
    const handler = this._effectHandlers[effect.type];
    if (handler) {
      handler(effect);
    } else {
      console.warn(`[EventSystem] Unknown effect type: ${effect.type}`);
    }
  }

  // ===== 供外部系统调用 =====

  /**
   * 检查选项效果中的消费是否可负担（供面板调用）
   */
  canAffordOption(effects) {
    if (!effects || effects.length === 0) return true;
    if (!this._resourceSystem) return true;

    for (const effect of effects) {
      if (effect.type === 'consume_resource') {
        if (!this._resourceSystem.hasEnough(effect.resourceId, effect.amount)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * 判断当前是否有事件正在处理或排队中
   */
  hasPendingEvents() {
    return this._isProcessing || this._eventQueue.length > 0 || this._deferredEvents.length > 0;
  }

  /**
   * 强制清空事件队列（用于紧急情况）
   */
  clearQueue() {
    this._eventQueue = [];
    this._isProcessing = false;
    this._currentEvent = null;
    this._currentEventHandled = false;
    this._deferredEvents = [];
    this._updateDeferredStore();
  }

  /**
   * 通过事件 ID 直接触发事件（公开接口）
   * 跳过条件检查，用于地图标记点击等外部触发
   * @param {string} eventId
   */
  triggerEventById(eventId) {
    this._triggerEventDirect(eventId);
  }

  // ===== 存档接口 =====

  getSaveState() {
    return {
      triggerCounts: { ...this._triggerCounts },
      cooldowns: { ...this._cooldowns },
      globalEventCooldown: this._globalEventCooldown,
      pendingEvents: this._pendingEvents.map(p => ({ ...p })),
      deferredEvents: this._deferredEvents.map(e => ({ ...e }))
    };
  }

  restoreState(state) {
    if (!state) return;
    this._events = configRegistry.getAllEvents();
    this._triggerCounts = state.triggerCounts || {};
    this._cooldowns = state.cooldowns || {};
    this._globalEventCooldown = state.globalEventCooldown || 0;
    this._pendingEvents = (state.pendingEvents || []).map(p => ({ ...p }));
    this._deferredEvents = (state.deferredEvents || []).map(e => ({ ...e }));
    this._eventQueue = [];
    this._isProcessing = false;
    this._currentEvent = null;
    this._currentEventHandled = false;
    this._updateDeferredStore();
  }
}
