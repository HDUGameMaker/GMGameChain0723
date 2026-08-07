/**
 * QuestSystem - 任务系统 v2
 * 快照机制：任务接取后只统计新动作，计算增量
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

const STRATEGIC_EVENTS = [
  'wildSiteBattleResolved', 'armyBattleResolved', 'outpostBattleResolved',
  'diplomacyAction', 'luxuryGifted', 'colonyEstablished', 'heroRecruited',
  'heroAssigned', 'techResearched', 'cultureResearched', 'eraAdvanced', 'dayEnd'
];

export class QuestSystem {
  constructor() {
    this._quests = [];
    this._activeIndex = -1;
    this._completed = new Set();
    this._buildingSystem = null;
    this._enabled = false;
    this._strategicChapters = [];
    this._strategicChapterIndex = 0;
    this._strategicStageIndex = 0;
    this._strategicProgress = 0;
    this._awaitingOutcome = false;
    this._worldConsequences = [];
    this._pendingConsequences = [];
    this._consequenceHistory = [];
    this._snapshot = {}; // 任务激活时的基线数据

    eventBus.on('buildingComplete', payload => this._onAction('build_building', payload));
    eventBus.on('workerChanged', payload => this._onAction('assign_worker', payload));
    eventBus.on('workersAutoFilled', () => this._onAction('fill_workers'));
    eventBus.on('populationRecruited', payload => this._onAction('recruit_population', payload));
    eventBus.on('unitTrained', payload => this._onAction('train_units', payload));
    eventBus.on('armyDeployed', payload => this._onAction('assemble_army', payload));
    eventBus.on('buildingMoved', () => this._onAction('move_building'));
    eventBus.on('expeditionComplete', () => this._onAction('complete_expedition'));
    eventBus.on('moveModeChanged', () => this._onAction('toggle_mode'));
    eventBus.on('fullscreenToggled', () => this._onAction('toggle_fullscreen'));
    eventBus.on('techResearched', () => this._onAction('research_tech'));
    eventBus.on('cultureResearched', () => this._onAction('research_culture'));
    for (const eventName of STRATEGIC_EVENTS) {
      eventBus.on(eventName, payload => this._onStrategicEvent(eventName, payload));
    }
    eventBus.on('dayStart', ({ day } = {}) => this._processConsequences(day || store.getState('timeDay') || 1));
  }

  setBuildingSystem(bs) { this._buildingSystem = bs; }

  init() {
    const questsData = configRegistry.get('quests');
    this._quests = questsData?.tutorial || [];
    this._strategicChapters = configRegistry.get('strategicQuests')?.chapters || [];
    console.log('[QuestSystem] Loaded', this._quests.length, 'tutorial quests');
  }

  isEnabled() { return this._enabled; }
  enable() { this._enabled = true; this._startNextQuest(); }
  disable() { this._enabled = false; this._activeIndex = -1; this._snapshot = {}; this._notify(); }
  toggle() { if (this._enabled) this.disable(); else this.enable(); }

  getActiveQuest() {
    if (!this._enabled) return null;
    if (this._activeIndex >= 0 && this._activeIndex < this._quests.length) {
      const q = this._quests[this._activeIndex];
      return { ...q, category: 'tutorial', progress: this._getProgress(q) };
    }
    return this.getStrategicQuest();
  }

  getStrategicQuest() {
    const cursor = this._getStrategicCursor();
    if (!cursor) return null;
    const { chapter, stage } = cursor;
    return {
      ...stage,
      category: 'strategic',
      chapterId: chapter.id,
      chapterName: chapter.name,
      chapterDescription: chapter.description || '',
      progress: { current: this._strategicProgress, target: stage.count || 1 },
      awaitingOutcome: this._awaitingOutcome,
      outcomes: this._awaitingOutcome ? (stage.outcomes || []) : [],
      consequences: this.getWorldConsequences(),
      pendingConsequences: this.getPendingConsequences(),
      consequenceHistory: this.getConsequenceHistory()
    };
  }

  getWorldConsequences() { return structuredClone(this._worldConsequences); }
  getPendingConsequences() { return structuredClone(this._pendingConsequences); }
  getConsequenceHistory() { return structuredClone(this._consequenceHistory); }

  enqueueConsequence(consequence) {
    if (!consequence?.id || !Number.isFinite(consequence.dueDay)) return { ok: false, reason: 'invalid_consequence' };
    if (this._pendingConsequences.some(item => item.id === consequence.id) || this._consequenceHistory.some(item => item.id === consequence.id)) {
      return { ok: false, reason: 'duplicate_consequence' };
    }
    this._pendingConsequences.push(structuredClone(consequence));
    this._pendingConsequences.sort((left, right) => left.dueDay - right.dueDay || left.id.localeCompare(right.id));
    this._notify();
    return { ok: true };
  }

  chooseStrategicOutcome(outcomeId) {
    const cursor = this._getStrategicCursor();
    if (!cursor || !this._awaitingOutcome) return { ok: false, reason: 'no_outcome_pending' };
    const outcome = (cursor.stage.outcomes || []).find(candidate => candidate.id === outcomeId);
    if (!outcome) return { ok: false, reason: 'unknown_outcome' };
    this._worldConsequences.push({
      chapterId: cursor.chapter.id,
      stageId: cursor.stage.id,
      outcomeId: outcome.id,
      name: outcome.name,
      effects: structuredClone(outcome.effects || {})
    });
    if (outcome.delayed) {
      this.enqueueConsequence({
        id: `${cursor.chapter.id}:${cursor.stage.id}:${outcome.id}`,
        dueDay: (store.getState('timeDay') || 1) + outcome.delayed.days,
        sourceId: cursor.stage.id,
        name: outcome.delayed.name,
        effects: structuredClone(outcome.delayed.effects || {})
      });
    }
    this._publishConsequences();
    eventBus.emit('strategicOutcomeChosen', {
      chapterId: cursor.chapter.id, stageId: cursor.stage.id, outcomeId: outcome.id,
      effects: structuredClone(outcome.effects || {})
    });
    this._advanceStrategicStage();
    return { ok: true, consequence: this._worldConsequences.at(-1) };
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
      buildingCounts: this._countBuildingsById(),
      expeditionCount: store.getState('questExpeditionCount') || 0,
      moveCount: 0, removeRoadCount: 0,
      modeToggleCount: 0, fullscreenCount: 0,
      pauseCount: 0, lightViewCount: 0, popClickCount: 0,
      techCount: 0, cultureCount: 0,
      recruitedPopulation: 0, trainedUnits: {}, assembledArmies: 0,
      fillWorkerCount: 0
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
    const next = this.getActiveQuest();
    if (next) eventBus.emit('questNewActive', { quest: next });
  }

  _getStrategicCursor() {
    const chapter = this._strategicChapters[this._strategicChapterIndex];
    const stage = chapter?.stages?.[this._strategicStageIndex];
    return chapter && stage ? { chapter, stage } : null;
  }

  _matchesWhere(payload, where = {}) {
    return Object.entries(where).every(([key, expected]) => payload?.[key] === expected);
  }

  _onStrategicEvent(eventName, payload) {
    if (!this._enabled || this._awaitingOutcome) return;
    const cursor = this._getStrategicCursor();
    if (!cursor || cursor.stage.event !== eventName || !this._matchesWhere(payload, cursor.stage.where)) return;
    this._strategicProgress += 1;
    if (this._strategicProgress >= (cursor.stage.count || 1)) {
      if (cursor.stage.outcomes?.length) {
        this._awaitingOutcome = true;
        eventBus.emit('questOutcomeRequired', { quest: this.getStrategicQuest() });
      } else {
        eventBus.emit('questCompleted', { questId: cursor.stage.id, name: cursor.stage.name, chapterId: cursor.chapter.id });
        this._advanceStrategicStage();
        return;
      }
    }
    this._notify();
  }

  _advanceStrategicStage() {
    const chapter = this._strategicChapters[this._strategicChapterIndex];
    this._strategicStageIndex += 1;
    if (!chapter || this._strategicStageIndex >= (chapter.stages || []).length) {
      this._strategicChapterIndex += 1;
      this._strategicStageIndex = 0;
    }
    this._strategicProgress = 0;
    this._awaitingOutcome = false;
    const next = this.getStrategicQuest();
    this._notify();
    if (next) eventBus.emit('questNewActive', { quest: next });
    else eventBus.emit('strategicCampaignCompleted', { consequences: this.getWorldConsequences() });
  }

  _publishConsequences() {
    const modifiers = {};
    for (const consequence of this._worldConsequences) {
      for (const [key, value] of Object.entries(consequence.effects || {})) {
        if (key.endsWith('Mul')) modifiers[key] = (modifiers[key] ?? 1) * value;
        else modifiers[key] = (modifiers[key] || 0) + value;
      }
    }
    store.setState({
      worldConsequences: this.getWorldConsequences(),
      worldConsequenceModifiers: modifiers,
      questVersion: Date.now()
    });
  }

  _processConsequences(day) {
    if (!Number.isFinite(day)) return;
    const due = this._pendingConsequences.filter(item => item.dueDay <= day);
    if (!due.length) return;
    const dueIds = new Set(due.map(item => item.id));
    this._pendingConsequences = this._pendingConsequences.filter(item => !dueIds.has(item.id));
    for (const item of due) {
      this._worldConsequences.push({
        chapterId: 'delayed', stageId: item.sourceId, outcomeId: item.id,
        name: item.name, effects: structuredClone(item.effects || {})
      });
      this._consequenceHistory.push({ ...structuredClone(item), firedDay: day });
      eventBus.emit('questConsequenceFired', { ...structuredClone(item), firedDay: day });
    }
    this._publishConsequences();
    this._notify();
  }

  _getProgress(q) {
    if (!this._snapshot) return { current: 0, target: 1 };
    const s = this._snapshot;
    switch (q.type) {
      case 'build_specific': {
        const current = this._countBuildingsById()[q.target.buildingId] || 0;
        const baseline = s.buildingCounts?.[q.target.buildingId] || 0;
        return { current: Math.max(0, current - baseline), target: q.target.count || 1 };
      }
      case 'assign_worker': {
        const current = (this._buildingSystem?.buildings || []).filter(building => building.buildingId === q.target.buildingId && building.status === 'active').reduce((sum, building) => sum + (building.currentWorkers || 0), 0);
        return { current, target: q.target.count || 1 };
      }
      case 'recruit_population': return { current: s.recruitedPopulation || 0, target: q.target.count || 1 };
      case 'fill_workers': return { current: s.fillWorkerCount || 0, target: q.target.count || 1 };
      case 'train_units': return { current: s.trainedUnits?.[q.target.unitId] || 0, target: q.target.count || 1 };
      case 'assemble_army': return { current: s.assembledArmies || 0, target: q.target.count || 1 };
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
        if (sub.toggle_fullscreen) { cur += Math.min(s.fullscreenCount, 1); tgt += 1; }
        if (sub.click_population) { cur += Math.min(s.popClickCount, 1); tgt += 1; }
        return { current: cur, target: tgt };
      }
      case 'move_building':
        return { current: s.moveCount, target: q.target.count };
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

  _onAction(type, payload = {}) {
    if (!this._enabled || this._activeIndex < 0) return;
    // 更新快照计数（总是更新，无论是否当前任务类型）
    if (type === 'move_building') this._snapshot.moveCount++;
    else if (type === 'toggle_mode') this._snapshot.modeToggleCount++;
    else if (type === 'toggle_fullscreen') this._snapshot.fullscreenCount++;
    else if (type === 'toggle_pause') this._snapshot.pauseCount++;
    else if (type === 'view_light') this._snapshot.lightViewCount++;
    else if (type === 'click_population') this._snapshot.popClickCount++;
    else if (type === 'research_tech') this._snapshot.techCount++;
    else if (type === 'research_culture') this._snapshot.cultureCount++;
    else if (type === 'recruit_population') this._snapshot.recruitedPopulation += Math.max(1, Number(payload.amount) || 1);
    else if (type === 'fill_workers') this._snapshot.fillWorkerCount = (this._snapshot.fillWorkerCount || 0) + 1;
    else if (type === 'train_units' && payload.unitId) this._snapshot.trainedUnits[payload.unitId] = (this._snapshot.trainedUnits[payload.unitId] || 0) + Math.max(1, Number(payload.amount) || 1);
    else if (type === 'assemble_army' && (payload.unitCount || 0) >= (this._quests[this._activeIndex]?.target?.minUnits || 1)) this._snapshot.assembledArmies++;
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
      snapshot: this._snapshot,
      strategic: {
        chapterIndex: this._strategicChapterIndex,
        stageIndex: this._strategicStageIndex,
        progress: this._strategicProgress,
        awaitingOutcome: this._awaitingOutcome,
        consequences: this.getWorldConsequences(),
        pendingConsequences: this.getPendingConsequences(),
        consequenceHistory: this.getConsequenceHistory()
      }
    };
  }

  restoreState(state) {
    if (!state) return;
    this._enabled = state.enabled ?? false;
    this._activeIndex = state.activeIndex ?? -1;
    this._completed = new Set(state.completed || []);
    this._snapshot = state.snapshot || {};
    this._strategicChapterIndex = Math.max(0, state.strategic?.chapterIndex || 0);
    this._strategicStageIndex = Math.max(0, state.strategic?.stageIndex || 0);
    this._strategicProgress = Math.max(0, state.strategic?.progress || 0);
    this._awaitingOutcome = Boolean(state.strategic?.awaitingOutcome);
    this._worldConsequences = structuredClone(state.strategic?.consequences || []);
    this._pendingConsequences = structuredClone(state.strategic?.pendingConsequences || []);
    this._consequenceHistory = structuredClone(state.strategic?.consequenceHistory || []);
    this._publishConsequences();
    store.setState({ questExpeditionCount: state.expeditionCount || 0 });
    const active = this._quests[this._activeIndex];
    if (this._enabled && active && this._checkCompletion(active)) {
      this._completeQuest();
      return;
    }
    this._notify();
  }
}
