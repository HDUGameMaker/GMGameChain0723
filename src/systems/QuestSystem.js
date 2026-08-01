/**
 * QuestSystem - 任务系统 v2
 * 快照机制：任务接取后只统计新动作，计算增量
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class QuestSystem {
  constructor() {
    this._quests = [];
    this._activeIndex = -1;
    this._completed = new Set();
    this._buildingSystem = null;
    this._roadSystem = null;
    this._enabled = false;
    this._snapshot = {}; // 任务激活时的基线数据

    eventBus.on('roadBuilt', ({ constructing }) => {
      if (!constructing) this._onAction('build_road');
    });
    eventBus.on('buildingComplete', () => this._onAction('build_building'));
    eventBus.on('buildingMoved', () => this._onAction('move_building'));
    eventBus.on('roadRemoved', () => this._onAction('remove_road'));
    eventBus.on('expeditionComplete', () => this._onAction('complete_expedition'));
    eventBus.on('moveModeChanged', () => this._onAction('toggle_mode'));
    eventBus.on('fullscreenToggled', () => this._onAction('toggle_fullscreen'));
    eventBus.on('techResearched', () => this._onAction('research_tech'));
    eventBus.on('cultureResearched', () => this._onAction('research_culture'));
  }

  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setRoadSystem(rs) { this._roadSystem = rs; }

  init() {
    const questsData = configRegistry.get('quests');
    this._quests = questsData?.tutorial || [];
    console.log('[QuestSystem] Loaded', this._quests.length, 'tutorial quests');
  }

  isEnabled() { return this._enabled; }
  enable() { this._enabled = true; this._startNextQuest(); }
  disable() { this._enabled = false; this._activeIndex = -1; this._snapshot = {}; this._notify(); }
  toggle() { if (this._enabled) this.disable(); else this.enable(); }

  getActiveQuest() {
    if (!this._enabled || this._activeIndex < 0 || this._activeIndex >= this._quests.length) return null;
    const q = this._quests[this._activeIndex];
    const progress = this._getProgress(q);
    return { ...q, progress };
  }

  /** 记录动作（非当前任务类型则忽略） */
  onPlayerAction(type) { this._onAction(type); }

  _startNextQuest() {
    if (!this._enabled) return;
    for (let i = 0; i < this._quests.length; i++) {
      if (!this._completed.has(this._quests[i].id)) {
        this._activeIndex = i;
        this._takeSnapshot();
        if (this._checkCompletion(this._quests[i])) {
          this._completeQuest();
          return;
        }
        this._notify();
        return;
      }
    }
    this._activeIndex = -1;
    this._snapshot = {};
    this._notify();
  }

  /** 记录任务激活时的基线 */
  _takeSnapshot() {
    this._snapshot = {
      roadCount: this._countCompletedRoads(),
      buildingCounts: this._countBuildingsById(),
      expeditionCount: store.getState('questExpeditionCount') || 0,
      moveCount: 0, removeRoadCount: 0,
      modeToggleCount: 0, fullscreenCount: 0,
      pauseCount: 0, lightViewCount: 0, popClickCount: 0,
      techCount: 0, cultureCount: 0
    };
  }

  _countBuildingsById() {
    const counts = {};
    if (this._buildingSystem) {
      for (const b of this._buildingSystem.buildings) {
        if (b.status === 'active') {
          counts[b.buildingId] = (counts[b.buildingId] || 0) + 1;
        }
      }
    }
    return counts;
  }

  _countCompletedRoads() {
    if (!this._roadSystem) return 0;
    let c = 0;
    for (const r of this._roadSystem.getAllStates()) {
      if (r.buildProgress === null) c++;
    }
    return c;
  }

  _listBuiltBuildingIds() {
    if (!this._buildingSystem) return [];
    return this._buildingSystem.buildings
      .filter(b => b.status === 'active')
      .map(b => b.buildingId);
  }

  _completeQuest() {
    if (this._activeIndex < 0) return;
    const q = this._quests[this._activeIndex];
    this._completed.add(q.id);
    eventBus.emit('questCompleted', { questId: q.id, name: q.name });
    this._startNextQuest();
    if (this._activeIndex >= 0) {
      const next = this._quests[this._activeIndex];
      eventBus.emit('questNewActive', { quest: { ...next, progress: this._getProgress(next) } });
    }
  }

  _getProgress(q) {
    if (!this._snapshot) return { current: 0, target: 1 };
    const s = this._snapshot;
    switch (q.type) {
      case 'build_road':
        return { current: this._countCompletedRoads() - s.roadCount, target: q.target.count };
      case 'build_building': {
        const cur = this._countBuildingsById();
        let c = 0;
        for (const bid of q.target.buildings) {
          if ((cur[bid] || 0) > 0) c++;
        }
        return { current: c, target: q.target.buildings.length };
      }
      case 'complete_expedition': {
        const cur = (store.getState('questExpeditionCount') || 0) - s.expeditionCount;
        return { current: cur, target: q.target.count };
      }
      case 'shortcuts': {
        const sub = q.target;
        let cur = 0, tgt = 0;
        if (sub.toggle_mode) { cur += Math.min(s.modeToggleCount, 1); tgt += 1; }
        if (sub.toggle_pause) { cur += Math.min(s.pauseCount, 1); tgt += 1; }
        if (sub.view_light) { cur += Math.min(s.lightViewCount, 1); tgt += 1; }
        return { current: cur, target: tgt };
      }
      case 'features': {
        const sub = q.target;
        let cur = 0, tgt = 0;
        if (sub.move_building) { cur += Math.min(s.moveCount, 1); tgt += 1; }
        if (sub.remove_road) { cur += Math.min(s.removeRoadCount, 1); tgt += 1; }
        if (sub.toggle_fullscreen) { cur += Math.min(s.fullscreenCount, 1); tgt += 1; }
        if (sub.click_population) { cur += Math.min(s.popClickCount, 1); tgt += 1; }
        return { current: cur, target: tgt };
      }
      case 'move_building':
        return { current: s.moveCount, target: q.target.count };
      case 'remove_road':
        return { current: s.removeRoadCount, target: q.target.count };
      case 'toggle_mode':
        return { current: s.modeToggleCount, target: q.target.count };
      case 'toggle_pause':
        return { current: s.pauseCount, target: q.target.count };
      case 'view_light':
        return { current: s.lightViewCount, target: q.target.count };
      case 'toggle_fullscreen':
        return { current: s.fullscreenCount, target: q.target.count };
      case 'click_population':
        return { current: s.popClickCount, target: q.target.count };
      case 'research_tech':
        return { current: s.techCount, target: q.target.count };
      case 'research_culture':
        return { current: s.cultureCount, target: q.target.count };
      default:
        return { current: 0, target: 1 };
    }
  }

  _onAction(type) {
    if (!this._enabled || this._activeIndex < 0) return;
    // 更新快照计数（总是更新，无论是否当前任务类型）
    if (type === 'move_building') this._snapshot.moveCount++;
    else if (type === 'remove_road') this._snapshot.removeRoadCount++;
    else if (type === 'toggle_mode') this._snapshot.modeToggleCount++;
    else if (type === 'toggle_fullscreen') this._snapshot.fullscreenCount++;
    else if (type === 'toggle_pause') this._snapshot.pauseCount++;
    else if (type === 'view_light') this._snapshot.lightViewCount++;
    else if (type === 'click_population') this._snapshot.popClickCount++;
    else if (type === 'research_tech') this._snapshot.techCount++;
    else if (type === 'research_culture') this._snapshot.cultureCount++;
    else if (type === 'complete_expedition') {
      let cur = (store.getState('questExpeditionCount') || 0) + 1;
      store.setState({ questExpeditionCount: cur });
    }

    // 检查是否完成
    const q = this._quests[this._activeIndex];
    if (this._checkCompletion(q)) {
      this._completeQuest();
    } else {
      this._notify();
    }
  }

  _checkCompletion(q) {
    const p = this._getProgress(q);
    return p.current >= p.target;
  }

  _notify() {
    store.setState({ questVersion: Date.now() });
    const active = this.getActiveQuest();
    eventBus.emit('questUpdated', { quest: active });
  }

  getState() {
    return {
      enabled: this._enabled,
      activeIndex: this._activeIndex,
      completed: [...this._completed],
      expeditionCount: store.getState('questExpeditionCount') || 0,
      snapshot: this._snapshot
    };
  }

  restoreState(state) {
    if (!state) return;
    this._enabled = state.enabled ?? false;
    this._activeIndex = state.activeIndex ?? -1;
    this._completed = new Set(state.completed || []);
    this._snapshot = state.snapshot || {};
    store.setState({ questExpeditionCount: state.expeditionCount || 0 });
    const active = this._quests[this._activeIndex];
    if (this._enabled && active && this._checkCompletion(active)) {
      this._completeQuest();
      return;
    }
    this._notify();
  }
}
