import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class EraSystem {
  constructor() {
    this._currentEraIndex = 0;
    this._selectedByEra = {};
    this._legacyCivilizationIds = [];
    this._starsByEra = {};
    this._progressionMilestoneIds = new Set();
    this._techSystem = null;
    this._cultureSystem = null;
    this._buildingSystem = null;
    eventBus.on('techResearched', () => this.reconcileProgressionMilestones());
    eventBus.on('cultureResearched', () => this.reconcileProgressionMilestones());
    eventBus.on('buildingComplete', () => this.reconcileProgressionMilestones());
  }

  setTechSystem(system) { this._techSystem = system; }
  setCultureSystem(system) { this._cultureSystem = system; }
  setBuildingSystem(system) { this._buildingSystem = system; }

  _content() { return configRegistry.getHistoricalContent(); }
  getEras() { return this._content().eras || []; }
  getCivilizations() { return this._content().civilizations || []; }
  getUnit(unitId) { return (this._content().units || []).find(unit => unit.id === unitId) || null; }
  getBuilding(buildingId) { return (this._content().buildings || []).find(building => building.id === buildingId) || null; }
  getEraUnlockedBuildings(eraId = this.getCurrentEra()?.id) {
    return (this._content().buildings || [])
      .filter(building => building.eraId === eraId && !building.civilizationId)
      .sort((left, right) => String(left.category || '').localeCompare(String(right.category || '')) || String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN'));
  }

  initNew() {
    this._currentEraIndex = 0;
    this._selectedByEra = {};
    this._legacyCivilizationIds = [];
    this._starsByEra = {};
    this._progressionMilestoneIds = new Set();
    this._updateStore();
  }

  getCurrentEra() {
    const eras = this.getEras();
    return eras[this._currentEraIndex] || eras[0] || null;
  }

  getAvailableCivilizations() {
    const eraId = this.getCurrentEra()?.id;
    return this.getCivilizations().filter(civ => civ.eraId === eraId);
  }

  getSelectedCivilization(eraId = this.getCurrentEra()?.id) {
    const id = this._selectedByEra[eraId];
    return id ? this.getCivilizations().find(civ => civ.id === id) || null : null;
  }

  getCivilizationForEra(eraId) { return this.getSelectedCivilization(eraId); }

  getEffectiveResearchNode(kind, node) {
    if (!node?.eraId) return node;
    const civilization = this.getCivilizationForEra(node.eraId);
    if (!civilization) return node;
    const replacement = kind === 'tech' ? civilization.technologyReplacement : civilization.civicReplacement;
    if (!replacement || replacement.replaces !== node.id) return node;
    return {
      ...node,
      name: replacement.name,
      description: `${replacement.name}是${civilization.name}对“${node.name}”的特色发展路线。${node.description || ''}`,
      effects: { ...(node.effects || {}), ...(replacement.effects || {}) },
      civilizationId: civilization.id,
      originalName: node.name,
      replacement: true
    };
  }

  selectCivilization(civilizationId) {
    const era = this.getCurrentEra();
    const civilization = this.getCivilizations().find(civ => civ.id === civilizationId);
    if (!era || !civilization || civilization.eraId !== era.id) return { ok: false, reason: '只能选择当前时代的文明' };
    if (this._selectedByEra[era.id]) return { ok: false, reason: '本时代已经选择文明' };
    this._selectedByEra[era.id] = civilization.id;
    if (!this._legacyCivilizationIds.includes(civilization.id)) this._legacyCivilizationIds.push(civilization.id);
    this._updateStore();
    eventBus.emit('civilizationSelected', { eraId: era.id, civilizationId });
    this.reconcileProgressionMilestones();
    return { ok: true, civilization };
  }

  getLegacyCivilizationIds() { return [...this._legacyCivilizationIds]; }

  getBonuses() {
    const result = {};
    const selected = this.getSelectedCivilization();
    const legacyCivs = this._legacyCivilizationIds
      .map(id => this.getCivilizations().find(civ => civ.id === id))
      .filter(Boolean);
    const sources = [
      ...legacyCivs.map(civ => civ.legacy?.effects || {}),
      selected?.trait?.effects || {}
    ];
    for (const effects of sources) {
      for (const [key, value] of Object.entries(effects)) {
        if (typeof value !== 'number') continue;
        if (key.endsWith('Mul')) result[key] = (result[key] ?? 1) + (value - 1);
        else result[key] = (result[key] || 0) + value;
      }
    }
    return result;
  }

  addEraStars(category, amount = 1) {
    if (!category || !Number.isFinite(amount) || amount <= 0) return false;
    const eraId = this.getCurrentEra()?.id;
    if (!eraId) return false;
    if (!this._starsByEra[eraId]) this._starsByEra[eraId] = {};
    this._starsByEra[eraId][category] = (this._starsByEra[eraId][category] || 0) + Math.floor(amount);
    this._updateStore();
    return true;
  }

  getEraStars(eraId = this.getCurrentEra()?.id) {
    const categories = this._starsByEra[eraId] || {};
    return { categories: { ...categories }, total: Object.values(categories).reduce((sum, value) => sum + value, 0) };
  }

  _progressionConfig() {
    return configRegistry.get('campaignProgression')?.eraStars || {
      researchCompletionThreshold: 0.7,
      awards: {
        civilizationSelected: { category: 'civilization', amount: 1 },
        technologyResearched: { category: 'science', amount: 1 },
        civicResearched: { category: 'culture', amount: 1 },
        technologyThreshold: { category: 'science', amount: 2 },
        civicThreshold: { category: 'culture', amount: 2 },
        uniqueBuildingCompleted: { category: 'growth', amount: 3 }
      }
    };
  }

  _awardMilestone(eraId, milestoneId, award) {
    if (!eraId || !milestoneId || !award?.category || !(award.amount > 0)) return false;
    const scopedId = `${eraId}:${milestoneId}`;
    if (this._progressionMilestoneIds.has(scopedId)) return false;
    this._progressionMilestoneIds.add(scopedId);
    if (!this._starsByEra[eraId]) this._starsByEra[eraId] = {};
    this._starsByEra[eraId][award.category] = (this._starsByEra[eraId][award.category] || 0) + Math.floor(award.amount);
    return true;
  }

  /**
   * Convert campaign accomplishments into era stars. Reconciliation makes
   * event delivery, browser reloads and older saves converge on the same result
   * without awarding an accomplishment twice.
   */
  reconcileProgressionMilestones() {
    const era = this.getCurrentEra();
    if (!era) return false;
    const config = this._progressionConfig();
    const awards = config.awards || {};
    let changed = false;
    const selected = this.getSelectedCivilization(era.id);
    if (selected) {
      changed = this._awardMilestone(era.id, `civilization:${selected.id}`, awards.civilizationSelected) || changed;
    }

    const techIds = new Set(this._techSystem?.getResearched?.() || []);
    for (const tech of this._content().techs || []) {
      if (tech.eraId === era.id && techIds.has(tech.id)) {
        changed = this._awardMilestone(era.id, `technology:${tech.id}`, awards.technologyResearched) || changed;
      }
    }
    const civicIds = new Set(this._cultureSystem?.getResearched?.() || []);
    for (const civic of this._content().civics || []) {
      if (civic.eraId === era.id && civicIds.has(civic.id)) {
        changed = this._awardMilestone(era.id, `civic:${civic.id}`, awards.civicResearched) || changed;
      }
    }

    const threshold = config.researchCompletionThreshold ?? era.researchCompletionRequired ?? 0.7;
    if ((this._techSystem?.getEraProgress?.(era.id) ?? 0) >= threshold) {
      changed = this._awardMilestone(era.id, 'technology-threshold', awards.technologyThreshold) || changed;
    }
    if ((this._cultureSystem?.getEraProgress?.(era.id) ?? 0) >= threshold) {
      changed = this._awardMilestone(era.id, 'civic-threshold', awards.civicThreshold) || changed;
    }

    const landmarkId = selected?.uniqueBuilding?.id;
    const landmarkBuilt = landmarkId && (this._buildingSystem?.buildings || [])
      .some(building => building.buildingId === landmarkId && building.status === 'active');
    if (landmarkBuilt) {
      changed = this._awardMilestone(era.id, `unique-building:${landmarkId}`, awards.uniqueBuildingCompleted) || changed;
    }
    if (changed) this._updateStore();
    return changed;
  }

  getAdvancementRequirements() {
    const era = this.getCurrentEra();
    const eras = this.getEras();
    const nextEra = eras[this._currentEraIndex + 1] || null;
    if (!era || !nextEra) {
      return { currentEra: era, nextEra: null, finalEra: true, requirements: [], starSources: [] };
    }

    this.reconcileProgressionMilestones();
    const selected = this.getSelectedCivilization(era.id);
    const requiredCompletion = era.researchCompletionRequired
      ?? this._content().eraSettings?.researchCompletionRequired
      ?? 0.7;
    const techProgress = this._techSystem?.getEraProgress?.(era.id) ?? 0;
    const civicProgress = this._cultureSystem?.getEraProgress?.(era.id) ?? 0;
    const stars = this.getEraStars(era.id).total;
    const requiredStars = nextEra.starRequirement || 0;
    const awards = this._progressionConfig().awards || {};

    return {
      currentEra: era,
      nextEra,
      finalEra: false,
      requirements: [
        {
          id: 'civilization', label: '选择本时代文明',
          current: selected?.name || null, required: true, complete: Boolean(selected)
        },
        {
          id: 'technology', label: '科技树',
          current: techProgress, required: requiredCompletion, complete: techProgress >= requiredCompletion
        },
        {
          id: 'civics', label: '人文树',
          current: civicProgress, required: requiredCompletion, complete: civicProgress >= requiredCompletion
        },
        {
          id: 'stars', label: '时代星',
          current: stars, required: requiredStars, complete: stars >= requiredStars
        }
      ],
      starSources: [
        { id: 'civilization', label: '选择当代文明', amount: awards.civilizationSelected?.amount || 0 },
        { id: 'technology', label: '每完成一项当代科技', amount: awards.technologyResearched?.amount || 0 },
        { id: 'civic', label: '每完成一项当代人文', amount: awards.civicResearched?.amount || 0 },
        { id: 'technology-threshold', label: '科技树达到 70%', amount: awards.technologyThreshold?.amount || 0 },
        { id: 'civic-threshold', label: '人文树达到 70%', amount: awards.civicThreshold?.amount || 0 },
        { id: 'unique-building', label: '建成当代文明特色建筑', amount: awards.uniqueBuildingCompleted?.amount || 0 }
      ]
    };
  }

  canAdvance() {
    const era = this.getCurrentEra();
    const eras = this.getEras();
    if (!era) return { ok: false, reason: '时代配置不存在' };
    if (this._currentEraIndex >= eras.length - 1) return { ok: false, reason: '已经进入最终时代' };
    if (!this._selectedByEra[era.id]) return { ok: false, reason: '必须先选择本时代文明' };
    this.reconcileProgressionMilestones();
    const requiredCompletion = era.researchCompletionRequired ?? this._content().eraSettings?.researchCompletionRequired ?? 0.7;
    const techProgress = this._techSystem?.getEraProgress?.(era.id) ?? 0;
    const civicProgress = this._cultureSystem?.getEraProgress?.(era.id) ?? 0;
    if (techProgress < requiredCompletion || civicProgress < requiredCompletion) {
      return { ok: false, reason: `科技树和人文树均需完成至少 ${Math.round(requiredCompletion * 100)}%` };
    }
    const requiredStars = eras[this._currentEraIndex + 1]?.starRequirement || 0;
    const stars = this.getEraStars(era.id).total;
    if (stars < requiredStars) return { ok: false, reason: `时代星不足（${stars}/${requiredStars}）` };
    return { ok: true, requiredStars, techProgress, civicProgress };
  }

  advanceEra() {
    const check = this.canAdvance();
    if (!check.ok) return check;
    const previousEra = this.getCurrentEra();
    this._currentEraIndex += 1;
    const era = this.getCurrentEra();
    this._updateStore();
    const unlockedBuildings = this.getEraUnlockedBuildings(era.id);
    eventBus.emit('eraAdvanced', { previousEraId: previousEra.id, eraId: era.id, unlockedBuildings });
    eventBus.emit('combatBroadcast', { message: `🏛️ 文明进入${era.name}` });
    return { ok: true, era, unlockedBuildings };
  }

  _updateStore() {
    const era = this.getCurrentEra();
    const selected = this.getSelectedCivilization();
    store.setState({
      eraCurrentId: era?.id || null,
      eraCurrentIndex: this._currentEraIndex,
      eraSelectedCivilization: selected?.id || null,
      eraLegacyCivilizations: [...this._legacyCivilizationIds],
      eraStars: this.getEraStars(era?.id)
    });
  }

  getState() {
    return {
      currentEraIndex: this._currentEraIndex,
      selectedByEra: { ...this._selectedByEra },
      legacyCivilizationIds: [...this._legacyCivilizationIds],
      starsByEra: JSON.parse(JSON.stringify(this._starsByEra)),
      progressionMilestoneIds: [...this._progressionMilestoneIds]
    };
  }

  restoreState(state) {
    if (!state) return this.initNew();
    const eras = this.getEras();
    this._currentEraIndex = Math.max(0, Math.min(eras.length - 1, state.currentEraIndex || 0));
    const civIds = new Set(this.getCivilizations().map(civ => civ.id));
    this._selectedByEra = Object.fromEntries(Object.entries(state.selectedByEra || {}).filter(([, id]) => civIds.has(id)));
    this._legacyCivilizationIds = [...new Set(state.legacyCivilizationIds || [])].filter(id => civIds.has(id));
    this._starsByEra = state.starsByEra && typeof state.starsByEra === 'object' ? JSON.parse(JSON.stringify(state.starsByEra)) : {};
    this._progressionMilestoneIds = new Set(state.progressionMilestoneIds || []);
    this.reconcileProgressionMilestones();
    this._updateStore();
  }
}
