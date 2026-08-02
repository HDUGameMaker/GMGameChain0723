import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class HeroSystem {
  constructor() {
    this._availableIds = [];
    this._recruited = {};
    this._lastRefreshDay = 0;
    this._buildingSystem = null;
    this._resourceSystem = null;
    this._cultureSystem = null;
    this._eraSystem = null;
    eventBus.on('dayStart', ({ day } = {}) => this._onDayStart(day || 1));
  }

  setSystems(systems = {}) {
    if (systems.building) this._buildingSystem = systems.building;
    if (systems.resource) this._resourceSystem = systems.resource;
    if (systems.culture) this._cultureSystem = systems.culture;
    if (systems.era) this._eraSystem = systems.era;
  }

  get _settings() {
    const integration = configRegistry.get('eaIntegration') || {};
    return integration.heroSettings || {};
  }

  getAllHeroes() {
    const integration = configRegistry.get('eaIntegration') || {};
    const historical = configRegistry.getHistoricalContent();
    const eras = historical.eras || [];
    const eraNames = Object.fromEntries(eras.map(era => [era.id, era.name]));
    const legacyEraIds = {
      sun_tzu: 'ancient', zhuge_liang: 'classical', yue_fei: 'medieval', zheng_he: 'exploration',
      li_shizhen: 'exploration', shen_kuo: 'medieval', zhang_heng: 'classical', hua_mulan: 'medieval',
      saladin: 'medieval', hannibal: 'classical', leonardo: 'exploration', joan_of_arc: 'medieval'
    };
    const normalize = hero => {
      const heroClass = hero.heroClass || (['commander', 'admiral', 'strategist'].includes(hero.role) ? 'military' : 'civil');
      const assignmentTargets = hero.assignmentTargets || (heroClass === 'military' ? ['army'] : this._civilTargets(hero.role));
      return {
        ...hero,
        eraId: hero.eraId || legacyEraIds[hero.id] || 'ancient',
        heroClass,
        assignmentTargets,
        title: hero.title || (heroClass === 'military' ? '历史武将' : '历史文臣'),
        description: hero.description || `${hero.name}可在酒馆招募并为文明提供长期支持。`,
        skills: hero.skills?.length ? hero.skills : [{
          id: `${hero.id}_signature`, name: hero.skillName || this._roleName(hero.role),
          description: hero.skillDescription || `${this._roleName(hero.role)}专长会在任命期间持续生效。`,
          trigger: heroClass === 'military' ? 'battle_phase' : 'assignment_tick', effects: hero.bonuses || {}
        }],
        icon: hero.iconAsset || (String(hero.icon || '').includes('/') ? hero.icon : `assets/historical-icons/heroes/${hero.id}.svg`),
        cost: hero.cost || hero.recruitCost || []
      };
    };
    const base = (integration.heroes || []).map(normalize);
    const ids = new Set(base.map(hero => hero.id));
    const additions = (historical.heroes || []).filter(hero => !ids.has(hero.id)).map(hero => normalize({
      ...hero,
      era: eraNames[hero.eraId] || hero.eraId,
      title: hero.title || this._roleName(hero.role),
      inspirationCost: hero.inspirationCost || 0,
      cost: hero.cost || hero.recruitCost || []
    }));
    return [...base, ...additions];
  }

  _civilTargets(role) {
    return {
      scholar: ['academy', 'library'], engineer: ['engineers_guild', 'building'], diplomat: ['embassy', 'diplomatic_mission'],
      explorer: ['settlement', 'trade_route'], physician: ['settlement', 'hospital'], governor: ['settlement', 'council_hall']
    }[role] || ['settlement', 'council_hall'];
  }

  _roleName(role) {
    return { commander: '统帅', admiral: '海军统帅', strategist: '军事家', diplomat: '外交家', engineer: '工程师', explorer: '探险家', physician: '医师', scholar: '学者', governor: '总督' }[role] || role;
  }

  getHero(id) { return this.getAllHeroes().find(hero => hero.id === id) || null; }

  initNew() {
    this._availableIds = [];
    this._recruited = {};
    this._refreshOffers(store.getState('timeDay') || 1);
    this._notify();
  }

  _eligibleHeroes() {
    const historical = configRegistry.getHistoricalContent();
    const eraOrder = Object.fromEntries((historical.eras || []).map(era => [era.id, era.order]));
    const currentOrder = this._eraSystem?.getCurrentEra?.()?.order ?? 0;
    return this.getAllHeroes().filter(hero => {
      if (this._recruited[hero.id]) return false;
      return !hero.eraId || (eraOrder[hero.eraId] ?? 0) <= currentOrder;
    }).sort((left, right) => {
      const leftOrder = left.eraId ? (eraOrder[left.eraId] ?? -1) : -1;
      const rightOrder = right.eraId ? (eraOrder[right.eraId] ?? -1) : -1;
      return Math.abs(currentOrder - leftOrder) - Math.abs(currentOrder - rightOrder);
    });
  }

  _refreshOffers(day) {
    const pool = this._eligibleHeroes();
    const count = Math.min(this._settings.offerCount || 4, pool.length);
    const offset = pool.length ? ((day * 3) % pool.length) : 0;
    this._availableIds = Array.from({ length: count }, (_, index) => pool[(offset + index) % pool.length].id);
    this._lastRefreshDay = day;
  }

  _onDayStart(day) {
    const recovered = this.recoverInjuredHeroes(day);
    const refreshDays = this._settings.refreshDays || 3;
    if (day - this._lastRefreshDay >= refreshDays) {
      this._refreshOffers(day);
      eventBus.emit('combatBroadcast', { message: '🍺 酒馆来了一批新的历史人物。' });
      this._notify();
    } else if (recovered) this._notify();
  }

  hasActiveTavern() {
    return (this._buildingSystem?.buildings || []).some(building =>
      ['tavern', 'tavern_hall'].includes(building.buildingId) && building.status === 'active');
  }

  getAvailableHeroes() { return this._availableIds.map(id => this.getHero(id)).filter(Boolean); }
  getRecruitableHeroes() { return this._eligibleHeroes(); }
  getMilitaryHeroes() { return this.getAllHeroes().filter(hero => hero.heroClass === 'military'); }
  getCivilHeroes() { return this.getAllHeroes().filter(hero => hero.heroClass === 'civil'); }
  getRecruitedHeroes() {
    const day = store.getState('timeDay') || 1;
    return Object.values(this._recruited).map(entry => ({
      ...this.getHero(entry.heroId),
      ...entry,
      status: entry.injuredUntilDay && day < entry.injuredUntilDay ? 'injured' : 'active'
    }));
  }

  recruitHero(id) {
    const hero = this.getHero(id);
    if (!hero || !this._availableIds.includes(id)) return { ok: false, reason: '该人物当前不在酒馆' };
    if (!this.hasActiveTavern()) return { ok: false, reason: '需要先建造并启用酒馆' };
    if ((store.getState('inspiration') || 0) < (hero.inspirationCost || 0)) return { ok: false, reason: '人文影响力不足' };
    if (hero.cost?.length && (!this._resourceSystem || !this._resourceSystem.canAfford(hero.cost))) return { ok: false, reason: '招募资源不足' };
    if (hero.cost?.length) this._resourceSystem.consumeAll(hero.cost);
    store.setState({ inspiration: Math.max(0, (store.getState('inspiration') || 0) - (hero.inspirationCost || 0)) });
    this._recruited[id] = { heroId: id, recruitedDay: store.getState('timeDay') || 1, assignment: null, injuredUntilDay: null };
    this._availableIds = this._availableIds.filter(heroId => heroId !== id);
    this._notify();
    eventBus.emit('heroRecruited', { heroId: id, name: hero.name });
    eventBus.emit('combatBroadcast', { message: `🏛️ ${hero.name} 已加入你的文明。` });
    return { ok: true };
  }

  getAssignmentLimit() { return (this._settings.baseAssignmentSlots || 2) + (this._cultureSystem?.getHeroSlotsBonus?.() || 0); }

  assignHero(id, assignment) {
    const entry = this._recruited[id];
    if (!entry) return { ok: false, reason: '人物尚未招募' };
    const hero = this.getHero(id);
    const assignmentType = typeof assignment === 'string' ? assignment : assignment?.type;
    const isArmyAssignment = assignmentType === 'army';
    if (assignment && hero?.heroClass === 'military' && !isArmyAssignment) return { ok: false, reason: '武将只能任命到军团' };
    if (assignment && hero?.heroClass === 'civil' && isArmyAssignment) return { ok: false, reason: '文臣不能带领军团' };
    const activeCount = Object.values(this._recruited).filter(hero => hero.assignment && hero.heroId !== id).length;
    if (assignment && activeCount >= this.getAssignmentLimit()) return { ok: false, reason: '人物任命席位已满' };
    entry.assignment = assignment || null;
    this._notify();
    return { ok: true };
  }

  injureHero(id, currentDay = store.getState('timeDay') || 1) {
    const entry = this._recruited[id];
    const hero = this.getHero(id);
    if (!entry || !hero) return { ok: false, reason: '人物尚未招募' };
    entry.injuredUntilDay = currentDay + (hero.recoveryDays || 3);
    this._notify();
    eventBus.emit('heroInjured', { heroId: id, injuredUntilDay: entry.injuredUntilDay });
    return { ok: true, injuredUntilDay: entry.injuredUntilDay };
  }

  recoverInjuredHeroes(day = store.getState('timeDay') || 1) {
    let recovered = false;
    for (const entry of Object.values(this._recruited)) {
      if (entry.injuredUntilDay && day >= entry.injuredUntilDay) {
        entry.injuredUntilDay = null;
        recovered = true;
        eventBus.emit('heroRecovered', { heroId: entry.heroId });
      }
    }
    if (recovered) this._notify();
    return recovered;
  }

  getBonuses() {
    const result = {};
    const day = store.getState('timeDay') || 1;
    for (const entry of Object.values(this._recruited)) {
      if (!entry.assignment || (entry.injuredUntilDay && day < entry.injuredUntilDay)) continue;
      const bonuses = this.getHero(entry.heroId)?.bonuses || {};
      for (const [key, value] of Object.entries(bonuses)) {
        if (key.endsWith('Mul')) result[key] = (result[key] || 1) * value;
        else result[key] = (result[key] || 0) + value;
      }
    }
    return result;
  }

  _notify() {
    store.setState({
      heroAvailable: [...this._availableIds],
      heroes: structuredClone(this._recruited),
      heroVersion: (store.getState('heroVersion') || 0) + 1
    });
  }

  getState() {
    return { availableIds: [...this._availableIds], recruited: structuredClone(this._recruited), lastRefreshDay: this._lastRefreshDay };
  }

  restoreState(state) {
    this._availableIds = (state?.availableIds || []).filter(id => this.getHero(id));
    this._recruited = structuredClone(state?.recruited || {});
    this._lastRefreshDay = state?.lastRefreshDay || 0;
    if (this._availableIds.length === 0) this._refreshOffers(store.getState('timeDay') || 1);
    this.recoverInjuredHeroes(store.getState('timeDay') || 1);
    this._notify();
  }
}
