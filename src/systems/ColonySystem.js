/**
 * ColonySystem - 殖民地事件系统
 * 玩家军力/人口达到门槛后，随机发现殖民地；占领后记录永久防御值，并可能触发殖民地被入侵事件。
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { getArmyCombatPower } from '../utils/FormationUtils.js';

export class ColonySystem {
  constructor() {
    this._popupManager = null;
    this._populationSystem = null;
    this._resourceSystem = null;
    this._lastOfferDay = 0;
    this._lastInvasionDay = 0;
    this._nextOfferDay = 0;
    this._nextInvasionDay = 0;
    this._occupied = {};
    this._activeEvent = null;

    eventBus.on('dayStart', (data) => this._onDayStart(data));
  }

  setSystems({ popupManager, population, resource }) {
    this._popupManager = popupManager || null;
    this._populationSystem = population || null;
    this._resourceSystem = resource || null;
  }

  get _config() {
    return configRegistry.get('colonies') || {};
  }

  get _global() {
    return this._config.global || {};
  }

  get _colonies() {
    return this._config.colonies || [];
  }

  get _unitConfigs() {
    return configRegistry.get('enemies')?.units || [];
  }

  initNew() {
    this._lastOfferDay = 0;
    this._lastInvasionDay = 0;
    const day = store.getState('timeDay') || 1;
    this._nextOfferDay = this._scheduleDay(day, this._global.offerIntervalDays, 5, 8);
    this._nextInvasionDay = this._scheduleDay(day, this._global.invasionIntervalDays, 7, 12);
    this._occupied = {};
    this._activeEvent = null;
    this._updateStore();
  }

  _onDayStart(data) {
    const day = data?.day || store.getState('timeDay') || 1;
    this._grantDailyIncome(day);

    if (!this._popupManager || this._activeEvent) return;
    if (window.__game?.systems?.event?.hasPendingEvents?.()) return;

    if (day >= this._nextOfferDay && this._canOfferColony()) {
      if (Math.random() < (this._global.offerChanceOnCheck ?? 0.6)) {
        this._openColonyOffer(day);
      } else {
        this._nextOfferDay = this._scheduleDay(day, this._global.offerIntervalDays, 5, 8);
      }
      return;
    }

    if (day >= this._nextInvasionDay && this._canInvadeColony()) {
      if (Math.random() < (this._global.invasionChanceOnCheck ?? 0.35)) {
        this._openColonyInvasion(day);
      } else {
        this._nextInvasionDay = this._scheduleDay(day, this._global.invasionIntervalDays, 7, 12);
      }
    }
  }

  _canOfferColony() {
    if ((this._populationSystem?.current || 0) < (this._global.minPopulation ?? 12)) return false;
    if (this._getTotalArmyPower() < (this._global.minTotalArmyPower ?? 18)) return false;
    return this._colonies.some(c => !this._occupied[c.id]);
  }

  _canInvadeColony() {
    return Object.keys(this._occupied).length > 0;
  }

  _scheduleDay(fromDay, interval, fallbackMin, fallbackMax) {
    const min = Math.max(1, Math.floor(interval?.min ?? fallbackMin));
    const max = Math.max(min, Math.floor(interval?.max ?? fallbackMax));
    return fromDay + this._randomInt(min, max);
  }

  _randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _openColonyOffer(day) {
    const choices = this._colonies.filter(c => !this._occupied[c.id]);
    const colony = choices[Math.floor(Math.random() * choices.length)];
    if (!colony) return;

    const nativePower = this._rollNativePower(colony);
    this._lastOfferDay = day;
    this._nextOfferDay = this._scheduleDay(day, this._global.offerIntervalDays, 5, 8);
    this._activeEvent = { type: 'offer', colonyId: colony.id, nativePower };
    this._popupManager.open('event', {
      event: {
        id: 'colony_offer_' + colony.id,
        kind: 'colony_offer',
        name: '殖民地机会：' + colony.name,
        description: colony.description,
        colonyId: colony.id,
        nativePower,
        dailyIncome: this._normalizeIncome(colony.dailyIncome),
        options: []
      }
    });
  }

  _openColonyInvasion(day) {
    const occupied = Object.values(this._occupied);
    const colony = occupied[Math.floor(Math.random() * occupied.length)];
    if (!colony) return;

    const invasionPower = this._rollNativePower(colony);
    this._lastInvasionDay = day;
    this._nextInvasionDay = this._scheduleDay(day, this._global.invasionIntervalDays, 7, 12);
    this._activeEvent = { type: 'invasion', colonyId: colony.id, invasionPower };
    this._popupManager.open('event', {
      event: {
        id: 'colony_invasion_' + colony.id,
        kind: 'colony_invasion',
        name: '殖民地被入侵：' + colony.name,
        description: colony.name + '遭到周边部族和流寇袭击。殖民地现有防御会先参与抵抗，你也可以派军团增援。',
        colonyId: colony.id,
        invasionPower,
        options: []
      }
    });
  }

  _rollNativePower(colony = null) {
    const cfg = configRegistry.get('enemies')?.invasion || { baseA: 4, dayMulB: 2, daySqMulC: 0.18 };
    const day = store.getState('timeDay') || 1;
    const base = cfg.baseA + day * cfg.dayMulB + day * day * cfg.daySqMulC;
    const min = this._global.nativePowerMinMultiplier ?? 0.5;
    const max = this._global.nativePowerMaxMultiplier ?? 2;
    const mul = min + Math.random() * (max - min);
    return Math.max(1, Math.round(base * mul + this._getIncomePowerBonus(colony)));
  }

  _getTotalArmyPower() {
    const armies = store.getState('armies') || [];
    return armies.reduce((sum, army) => sum + getArmyCombatPower(army, { navalMultiplier: 2 }), 0);
  }

  getColony(colonyId) {
    const cfg = this._colonies.find(c => c.id === colonyId) || null;
    const state = this._occupied[colonyId] || null;
    return cfg ? { ...cfg, ...(state || {}) } : state;
  }

  getIncomeText(colonyOrIncome) {
    const income = this._normalizeIncome(colonyOrIncome?.dailyIncome || colonyOrIncome);
    const parts = [];
    if (income.population > 0) parts.push('人口 +' + income.population);
    for (const r of income.resources) {
      const name = configRegistry.getResource(r.resourceId)?.name || r.resourceId;
      parts.push(name + ' +' + r.amount);
    }
    return parts.length > 0 ? parts.join('，') : '无';
  }

  getArmyPreview(army, mode = 'attack') {
    const unitMap = this._buildUnitMap();
    const unitIds = (army?.unitIds || []).filter(uid => unitMap[uid]);
    const landIds = unitIds.filter(uid => (unitMap[uid].domain || 'land') === 'land');
    const navalIds = unitIds.filter(uid => unitMap[uid].domain === 'naval');
    const power = this._getColonyArmyPower(unitIds, army?.formationId);
    const lostIds = mode === 'attack'
      ? [...landIds, ...this._takeFirstHalf(navalIds, unitMap)]
      : [];
    const defenseGain = this._getEffectiveUnitPower(lostIds, unitMap);
    return {
      power,
      landCount: landIds.length,
      navalCount: navalIds.length,
      lostCount: lostIds.length,
      defenseGain
    };
  }

  attackColony(colonyId, armyId) {
    const event = this._activeEvent;
    if (!event || event.type !== 'offer' || event.colonyId !== colonyId) return { ok: false, msg: '殖民地事件已失效' };

    const colony = this._colonies.find(c => c.id === colonyId);
    const army = this._getArmyById(armyId);
    if (!colony || !army) return { ok: false, msg: '未找到目标或军团' };

    const preview = this.getArmyPreview(army, 'attack');
    if (preview.power < event.nativePower) {
      return { ok: false, msg: '军团战力不足，无法压制当地抵抗' };
    }

    const loss = this._applyOccupationLosses(army);
    this._occupied[colonyId] = {
      id: colony.id,
      name: colony.name,
      dailyIncome: this._normalizeIncome(colony.dailyIncome),
      defense: loss.defenseGain,
      occupiedDay: store.getState('timeDay') || 1
    };
    this._activeEvent = null;
    this._updateStore();
    eventBus.emit('combatBroadcast', { message: `🏴 占领 ${colony.name}，损失 ${loss.lostCount} 单位，殖民地防御 +${loss.defenseGain}` });
    return { ok: true, victory: true, colony: colony.name, ...loss };
  }

  declineColony(colonyId) {
    if (this._activeEvent?.colonyId === colonyId) this._activeEvent = null;
    this._updateStore();
    return { ok: true };
  }

  resolveColonyInvasion(colonyId, armyId = null) {
    const event = this._activeEvent;
    const colony = this._occupied[colonyId];
    if (!event || event.type !== 'invasion' || event.colonyId !== colonyId || !colony) {
      return { ok: false, msg: '殖民地入侵事件已失效' };
    }

    const army = armyId ? this._getArmyById(armyId) : null;
    const armyPower = army ? this.getArmyPreview(army, 'defense').power : 0;
    const totalDefense = (colony.defense || 0) + armyPower;
    if (totalDefense >= event.invasionPower) {
      const defenseLoss = Math.min(colony.defense || 0, Math.ceil(event.invasionPower * 0.35));
      colony.defense = Math.max(0, (colony.defense || 0) - defenseLoss);
      this._activeEvent = null;
      this._updateStore();
      eventBus.emit('combatBroadcast', { message: `🛡️ ${colony.name} 击退入侵，殖民地防御损耗 ${defenseLoss}` });
      return { ok: true, victory: true, defenseLoss, remainingDefense: colony.defense };
    }

    delete this._occupied[colonyId];
    this._activeEvent = null;
    this._updateStore();
    eventBus.emit('combatBroadcast', { message: `🔥 ${colony.name} 沦陷，殖民地失去控制` });
    return { ok: true, victory: false, lostColony: true };
  }

  _grantDailyIncome(day) {
    const occupied = Object.values(this._occupied);
    if (occupied.length === 0) return;

    let addedPopulation = 0;
    const addedResources = {};
    for (const colonyState of occupied) {
      const colony = this.getColony(colonyState.id);
      const income = this._normalizeIncome(colony?.dailyIncome);
      if (income.population > 0 && this._populationSystem) {
        this._populationSystem.current += income.population;
        addedPopulation += income.population;
      }
      if (this._resourceSystem) {
        for (const r of income.resources) {
          const actual = this._resourceSystem.addClamped(r.resourceId, r.amount);
          if (actual > 0) addedResources[r.resourceId] = (addedResources[r.resourceId] || 0) + actual;
        }
      }
    }

    if (addedPopulation > 0 && this._populationSystem) {
      this._populationSystem.refresh();
      eventBus.emit('populationChanged', { current: this._populationSystem.current, direction: 'colony_income', gained: addedPopulation });
    }

    const resourceParts = Object.entries(addedResources).map(([id, amount]) => {
      const name = configRegistry.getResource(id)?.name || id;
      return name + ' +' + amount;
    });
    const parts = [];
    if (addedPopulation > 0) parts.push('人口 +' + addedPopulation);
    parts.push(...resourceParts);
    if (parts.length > 0) {
      eventBus.emit('combatBroadcast', { message: `🏴 殖民地每日收益：${parts.join('，')}` });
    }
  }

  _normalizeIncome(income) {
    const src = income || {};
    return {
      population: Math.max(0, Math.floor(src.population || 0)),
      resources: (src.resources || [])
        .filter(r => r && r.resourceId && (r.amount || 0) > 0)
        .map(r => ({ resourceId: r.resourceId, amount: Math.floor(r.amount) }))
    };
  }

  _getIncomePowerBonus(colony) {
    const income = this._normalizeIncome(colony?.dailyIncome);
    const popWeight = this._global.populationIncomePowerWeight ?? 8;
    const resWeight = this._global.resourceIncomePowerWeight ?? 1.5;
    const resourceTotal = income.resources.reduce((sum, r) => sum + r.amount, 0);
    return Math.round(income.population * popWeight + resourceTotal * resWeight);
  }

  _applyOccupationLosses(army) {
    const unitMap = this._buildUnitMap();
    const landIds = (army.unitIds || []).filter(uid => (unitMap[uid]?.domain || 'land') === 'land');
    const navalIds = (army.unitIds || []).filter(uid => unitMap[uid]?.domain === 'naval');
    const lostIds = [...landIds, ...this._takeFirstHalf(navalIds, unitMap)];
    const lostSetCounts = this._counts(lostIds);
    const remaining = [];
    for (const uid of army.unitIds || []) {
      if ((lostSetCounts[uid] || 0) > 0) {
        lostSetCounts[uid]--;
      } else {
        remaining.push(uid);
      }
    }

    const armies = store.getState('armies') || [];
    const idx = armies.findIndex(a => a.id === army.id);
    if (idx >= 0) {
      armies[idx] = { ...armies[idx], unitIds: remaining };
      store.setState({ armies });
    }
    this._applyUnitDeaths(lostIds);

    return {
      lostCount: lostIds.length,
      defenseGain: this._getEffectiveUnitPower(lostIds, unitMap),
      remainingCount: remaining.length
    };
  }

  _getColonyArmyPower(unitIds, formationId) {
    const unitMap = this._buildUnitMap();
    const baseArmy = { unitIds, formationId };
    let power = getArmyCombatPower(baseArmy, { navalMultiplier: 2 });
    if (!isFinite(power)) power = 0;
    return power;
  }

  _getEffectiveUnitPower(unitIds, unitMap) {
    return unitIds.reduce((sum, uid) => {
      const unit = unitMap[uid];
      const multiplier = unit?.domain === 'naval' ? 2 : 1;
      return sum + (unit?.combatPower || 1) * multiplier;
    }, 0);
  }

  _takeFirstHalf(unitIds, unitMap) {
    const sorted = [...unitIds].sort((a, b) => (unitMap[a]?.weight || 100) - (unitMap[b]?.weight || 100));
    return sorted.slice(0, Math.ceil(sorted.length / 2));
  }

  _applyUnitDeaths(unitIds) {
    if (!unitIds || unitIds.length === 0) return;
    const popSys = this._populationSystem;
    if (!popSys) return;
    const loss = unitIds.reduce((sum, uid) => {
      const cfg = this._unitConfigs.find(u => u.id === uid);
      return sum + (cfg?.populationRequired || 1);
    }, 0);
    popSys.releaseFromConstruction(loss);
    popSys.current = Math.max(0, popSys.current - loss);
    popSys.refresh();
    eventBus.emit('populationChanged', { current: popSys.current, direction: 'colony_loss', lost: loss });
  }

  _getArmyById(armyId) {
    return (store.getState('armies') || []).find(a => a.id === armyId) || null;
  }

  _buildUnitMap() {
    const unitMap = {};
    this._unitConfigs.forEach(u => { unitMap[u.id] = u; });
    return unitMap;
  }

  _counts(ids) {
    const counts = {};
    for (const id of ids || []) counts[id] = (counts[id] || 0) + 1;
    return counts;
  }

  _updateStore() {
    store.setState({
      colonies: Object.values(this._occupied).map(c => ({ ...c, dailyIncome: this._normalizeIncome(c.dailyIncome) }))
    });
  }

  getState() {
    return {
      lastOfferDay: this._lastOfferDay,
      lastInvasionDay: this._lastInvasionDay,
      nextOfferDay: this._nextOfferDay,
      nextInvasionDay: this._nextInvasionDay,
      occupied: { ...this._occupied },
      activeEvent: this._activeEvent ? { ...this._activeEvent } : null
    };
  }

  restoreState(state) {
    if (!state) {
      this.initNew();
      return;
    }
    this._lastOfferDay = state.lastOfferDay || 0;
    this._lastInvasionDay = state.lastInvasionDay || 0;
    const day = store.getState('timeDay') || 1;
    this._nextOfferDay = state.nextOfferDay || this._scheduleDay(day, this._global.offerIntervalDays, 5, 8);
    this._nextInvasionDay = state.nextInvasionDay || this._scheduleDay(day, this._global.invasionIntervalDays, 7, 12);
    this._occupied = { ...(state.occupied || {}) };
    this._activeEvent = state.activeEvent ? { ...state.activeEvent } : null;
    this._updateStore();
  }
}
