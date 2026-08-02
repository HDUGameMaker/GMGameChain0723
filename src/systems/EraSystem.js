import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class EraSystem {
  constructor() {
    this._currentEraIndex = 0;
    this._selectedByEra = {};
    this._legacyCivilizationIds = [];
    this._starsByEra = {};
    this._techSystem = null;
    this._cultureSystem = null;
  }

  setTechSystem(system) { this._techSystem = system; }
  setCultureSystem(system) { this._cultureSystem = system; }

  _content() { return configRegistry.getHistoricalContent(); }
  getEras() { return this._content().eras || []; }
  getCivilizations() { return this._content().civilizations || []; }
  getUnit(unitId) { return (this._content().units || []).find(unit => unit.id === unitId) || null; }

  initNew() {
    this._currentEraIndex = 0;
    this._selectedByEra = {};
    this._legacyCivilizationIds = [];
    this._starsByEra = {};
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

  getSelectedCivilization() {
    const eraId = this.getCurrentEra()?.id;
    const id = this._selectedByEra[eraId];
    return id ? this.getCivilizations().find(civ => civ.id === id) || null : null;
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

  canAdvance() {
    const era = this.getCurrentEra();
    const eras = this.getEras();
    if (!era) return { ok: false, reason: '时代配置不存在' };
    if (this._currentEraIndex >= eras.length - 1) return { ok: false, reason: '已经进入最终时代' };
    if (!this._selectedByEra[era.id]) return { ok: false, reason: '必须先选择本时代文明' };
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
    eventBus.emit('eraAdvanced', { previousEraId: previousEra.id, eraId: era.id });
    eventBus.emit('combatBroadcast', { message: `🏛️ 文明进入${era.name}` });
    return { ok: true, era };
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
      starsByEra: JSON.parse(JSON.stringify(this._starsByEra))
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
    this._updateStore();
  }
}
