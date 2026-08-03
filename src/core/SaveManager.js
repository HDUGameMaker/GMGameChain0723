import {
  canonicalizePayload,
  createEnvelopeRecord,
  verifyEnvelopeRecord
} from './SaveEnvelope.js';

const DB_NAME = 'GMGameChainDB';
const DB_VERSION = 1;
const STORE_NAME = 'saves';
const LEGACY_SAVE_KEY = 'currentSave';
const PRIMARY_KEY = 'primary';
const ROLLBACK_KEY = 'rollback';
const EMERGENCY_KEY = 'emergency';
const LOCAL_EMERGENCY_KEY = 'gmgc_emergency_save';

export class SaveManager {
  static CURRENT_VERSION = 9;
  static _db = null;
  static _nextEnvelopeSequence = 1;

  static migrate(raw) {
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      canonicalizePayload(raw);
      if (!Number.isFinite(raw.version) || raw.version < 5 || raw.version > SaveManager.CURRENT_VERSION) return null;
      const state = structuredClone(raw);
      const history = Array.isArray(state.migrationHistory) && state.migrationHistory.length > 0
        ? [...state.migrationHistory]
        : [state.version];

      if (state.version === 5) {
        state.territory ??= {};
        state.enemyExpansion ??= {};
        state.buildingTech ??= {};
        state.diplomacy ??= { states: {} };
        state.heroes ??= { availableIds: [], recruited: {}, lastRefreshDay: 0 };
        state.version = 6;
        history.push(6);
      }

      if (state.version === 6) {
        const defaults = {
          wood: { current: 200, max: 1000 },
          stone: { current: 150, max: 1000 },
          food: { current: 220, max: 1000 },
          gold: { current: 80, max: 1000 }
        };
        const previousResources = state.resources || {};
        state.resources = {};
        for (const id of ['wood', 'stone', 'food', 'gold']) {
          const saved = previousResources[id];
          state.resources[id] = saved && Number.isFinite(saved.current) && Number.isFinite(saved.max)
            ? { current: Math.max(0, saved.current), max: Math.max(1, saved.max) }
            : { ...defaults[id] };
        }
        state.resources.__storageMultiplier = Number.isFinite(previousResources.__storageMultiplier)
          ? previousResources.__storageMultiplier
          : 1;
        state.population = {
          current: 12,
          declineCountdown: 0,
          expeditionWorkers: 0,
          constructionWorkers: 0,
          satisfaction: 60,
          starvationDays: 0,
          ...(state.population || {})
        };
        if (Array.isArray(state.buildings)) {
          state.buildings = state.buildings.map(building => ({ assignedWorkers: 0, ...building }));
        }
        state.era ??= { currentEraId: 'ancient', selectedCivilizations: {}, legacyCivilizationIds: [], eraStars: {} };
        state.luxuries ??= { inventory: {}, deposits: [], discoveredDepositIds: [] };
        state.strategies ??= {
          cards: { forced_march: 1, harvest_drive: 1, fortify: 1 },
          cooldowns: {},
          activeEffects: []
        };
        state.territory ??= {};
        state.enemyExpansion ??= {};
        state.buildingTech ??= {};
        state.diplomacy ??= { states: {} };
        state.heroes ??= { availableIds: [], recruited: {}, lastRefreshDay: 0 };
        delete state.alchemy;
        delete state.spell;
        state.version = 7;
        history.push(7);
      }

      if (state.version === 7) {
        SaveManager._migrateEraStateToV8(state);
        state.version = 8;
        history.push(8);
      }

      if (state.version === 8) {
        SaveManager._applyV8Defaults(state);
        SaveManager._migrateV8ToV9(state);
        state.version = 9;
        history.push(9);
      }

      if (state.version === 9) SaveManager._canonicalizeV9(state);
      state.migrationHistory = [...new Set(history)];
      return state;
    } catch {
      return null;
    }
  }

  static _migrateEraStateToV8(state) {
    const eraMap = {
      ancient: 'primitive', classical: 'classical', medieval: 'medieval', exploration: 'exploration',
      industrial: 'early_modern', modern: 'modern', information: 'modern'
    };
    const previous = state.era || {};
    const remapRecord = (record = {}) => {
      const mapped = {};
      for (const [eraId, value] of Object.entries(record)) {
        const targetId = eraMap[eraId] || eraId;
        if (!(targetId in mapped) || eraId !== 'information') mapped[targetId] = value;
      }
      return mapped;
    };
    state.era = {
      ...previous,
      currentEraId: eraMap[previous.currentEraId] || previous.currentEraId || 'primitive',
      selectedCivilizations: remapRecord(previous.selectedCivilizations),
      legacyCivilizationIds: Array.isArray(previous.legacyCivilizationIds) ? previous.legacyCivilizationIds : [],
      eraStars: remapRecord(previous.eraStars)
    };
  }

  static _normalizeAvailableUnits(value) {
    const result = {};
    const entries = Array.isArray(value)
      ? value.map(item => [item?.unitId || item?.id, item?.count])
      : Object.entries(value && typeof value === 'object' ? value : {});
    for (const [unitId, rawCount] of entries) {
      if (!unitId) continue;
      const count = Math.max(0, Math.floor(Number(rawCount) || 0));
      result[unitId] = (result[unitId] || 0) + count;
    }
    return result;
  }

  static _normalizeArmyRecord(army, index) {
    const legacyIds = Array.isArray(army?.units)
      ? army.units.flatMap(item => {
          if (typeof item === 'string') return [item];
          const unitId = item?.unitId || item?.id;
          const count = Math.max(0, Math.floor(Number(item?.count) || 0));
          return unitId ? Array(count).fill(unitId) : [];
        })
      : [];
    return {
      ...army,
      id: String(army?.id || `army_${index + 1}`),
      ownerId: army?.ownerId || 'player',
      unitIds: Array.isArray(army?.unitIds) ? [...army.unitIds] : legacyIds
    };
  }

  static _normalizeArmyState(state) {
    const armyState = state.armyState && typeof state.armyState === 'object' ? state.armyState : {};
    const armies = (Array.isArray(armyState.armies) ? armyState.armies : state.armies || [])
      .map((army, index) => SaveManager._normalizeArmyRecord(army, index));
    const availableUnits = SaveManager._normalizeAvailableUnits(
      armyState.availableUnits === undefined ? state.availableUnits : armyState.availableUnits
    );
    const derivedNextId = armies.reduce((highest, army) => {
      const match = /^army_(\d+)$/.exec(army.id);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
    return {
      nextId: Number.isFinite(armyState.nextId) ? armyState.nextId : derivedNextId,
      armies,
      availableUnits,
      battleHistory: Array.isArray(armyState.battleHistory)
        ? [...armyState.battleHistory]
        : Array.isArray(state.battleHistory) ? [...state.battleHistory] : []
    };
  }

  static _applyV8Defaults(state) {
    const eraId = state.era?.currentEraId || 'primitive';
    state.armyState = SaveManager._normalizeArmyState(state);
    state.armies = state.armyState.armies.map(army => ({ ...army, unitIds: [...army.unitIds] }));
    state.availableUnits = { ...state.armyState.availableUnits };
    state.economicOrders = state.economicOrders && Array.isArray(state.economicOrders.orders)
      ? state.economicOrders : { nextId: 1, orders: [] };
    state.tradeRoutes = state.tradeRoutes && Array.isArray(state.tradeRoutes.routes)
      ? state.tradeRoutes : { nextId: 1, routes: [], conversionCounters: {} };
    state.factions = state.factions && typeof state.factions === 'object'
      ? state.factions : { states: {}, relations: {}, lastSyncDay: 0 };
    state.eraMusic = state.eraMusic && typeof state.eraMusic === 'object'
      ? state.eraMusic : { currentEraId: eraId, currentTrackId: null };
  }

  static _migrateV8ToV9(state) {
    state.world ??= { schemaVersion: 1, source: 'legacy_static', mapId: 'base_map_v1' };
    state.armyState = SaveManager._normalizeArmyState(state);
    const legacyCommerce = state.tradeRoutes && typeof state.tradeRoutes === 'object'
      ? structuredClone(state.tradeRoutes)
      : { nextId: 1, routes: [], conversionCounters: {} };
    state.commerce = { ...legacyCommerce, factions: structuredClone(state.factions || { states: {}, relations: {}, lastSyncDay: 0 }) };
    if (state.colony?.occupied && typeof state.colony.occupied === 'object') {
      for (const colony of Object.values(state.colony.occupied)) {
        if (colony && typeof colony === 'object') colony.legacyOffmap = true;
      }
    }
    SaveManager._removeV9Mirrors(state);
  }

  static _canonicalizeV9(state) {
    state.armyState = SaveManager._normalizeArmyState(state);
    if (!state.commerce || typeof state.commerce !== 'object' || Array.isArray(state.commerce)) {
      state.commerce = { nextId: 1, routes: [], conversions: [], factions: { states: {}, relations: {}, lastSyncDay: 0 } };
    } else if (!state.commerce.factions || typeof state.commerce.factions !== 'object') {
      state.commerce.factions = { states: {}, relations: {}, lastSyncDay: 0 };
    }
    state.world ??= { schemaVersion: 1, source: 'legacy_static', mapId: 'base_map_v1' };
    SaveManager._removeV9Mirrors(state);
  }

  static _removeV9Mirrors(state) {
    delete state.armies;
    delete state.availableUnits;
    delete state.tradeRoutes;
    delete state.factions;
  }

  static async createEnvelope(payload, options = {}) {
    canonicalizePayload(payload);
    if (!payload || payload.version !== SaveManager.CURRENT_VERSION) throw new TypeError('Envelope payload must be canonical v9');
    const requested = options.sequence;
    const sequence = requested === undefined ? SaveManager._nextEnvelopeSequence : requested;
    const envelope = await createEnvelopeRecord(payload, { sequence });
    const verification = await SaveManager.verifyEnvelope(envelope);
    if (!verification.ok) throw new Error(`Created envelope failed verification: ${verification.reason}`);
    SaveManager._nextEnvelopeSequence = Math.max(SaveManager._nextEnvelopeSequence, sequence + 1);
    return envelope;
  }

  static async verifyEnvelope(envelope) {
    return verifyEnvelopeRecord(envelope);
  }

  static async _candidateEnvelope(candidate) {
    if (candidate?.format === 'gmgc-save-envelope') {
      const verification = await SaveManager.verifyEnvelope(candidate);
      return verification.ok ? candidate : null;
    }
    const payload = SaveManager.migrate(candidate);
    return payload ? SaveManager.createEnvelope(payload) : null;
  }

  static async chooseRecovery(candidates = {}) {
    const warnings = [];
    for (const source of ['primary', 'rollback', 'emergency', 'import']) {
      const values = Array.isArray(candidates[source]) ? candidates[source] : [candidates[source]];
      let rejected = false;
      for (const candidate of values) {
        if (candidate === null || candidate === undefined) continue;
        const envelope = await SaveManager._candidateEnvelope(candidate);
        if (envelope) {
          if (rejected) warnings.push(`${source}_invalid`);
          return {
            source,
            envelope: structuredClone(envelope),
            payload: structuredClone(envelope.payload),
            warnings
          };
        }
        rejected = true;
      }
      if (rejected) warnings.push(`${source}_invalid`);
    }
    return { source: null, envelope: null, payload: null, warnings };
  }

  static async _getDB() {
    if (SaveManager._db) return SaveManager._db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = event => {
        SaveManager._db = event.target.result;
        resolve(SaveManager._db);
      };
      request.onerror = event => reject(event.target.error || event);
    });
  }

  static async _readRecords(keys) {
    const db = await SaveManager._getDB();
    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const result = {};
      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => { result[key] = request.result ?? null; };
        request.onerror = () => { result[key] = null; };
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => resolve(result);
    });
  }

  static _readLocalEmergency() {
    try {
      const raw = localStorage.getItem(LOCAL_EMERGENCY_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return { __corruptEmergency: true };
    }
  }

  static async loadRecoverable() {
    try {
      const records = await SaveManager._readRecords([PRIMARY_KEY, ROLLBACK_KEY, EMERGENCY_KEY, LEGACY_SAVE_KEY]);
      return SaveManager.chooseRecovery({
        primary: records[PRIMARY_KEY],
        rollback: records[ROLLBACK_KEY],
        emergency: [records[EMERGENCY_KEY], SaveManager._readLocalEmergency()],
        import: records[LEGACY_SAVE_KEY]
      });
    } catch {
      return SaveManager.chooseRecovery({ emergency: SaveManager._readLocalEmergency() });
    }
  }

  static async load() {
    const recovered = await SaveManager.loadRecoverable();
    return recovered.payload;
  }

  static async save(gameState) {
    try {
      const payload = SaveManager.migrate(gameState);
      if (!payload) return false;
      const records = await SaveManager._readRecords([PRIMARY_KEY, ROLLBACK_KEY, EMERGENCY_KEY]);
      const primary = await SaveManager._candidateEnvelope(records[PRIMARY_KEY]);
      const rollback = await SaveManager._candidateEnvelope(records[ROLLBACK_KEY]);
      const storedEmergency = await SaveManager._candidateEnvelope(records[EMERGENCY_KEY]);
      const localEmergency = await SaveManager._candidateEnvelope(SaveManager._readLocalEmergency());
      const verified = [primary, rollback, storedEmergency, localEmergency].filter(Boolean);
      const sequence = verified.reduce((highest, item) => Math.max(highest, item.sequence), 0) + 1;
      const envelope = await SaveManager.createEnvelope(payload, { sequence });
      const nextRollback = primary;
      const nextEmergency = rollback || storedEmergency || localEmergency;

      const db = await SaveManager._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(envelope, PRIMARY_KEY);
        if (nextRollback) store.put(nextRollback, ROLLBACK_KEY);
        else store.delete(ROLLBACK_KEY);
        if (nextEmergency) store.put(nextEmergency, EMERGENCY_KEY);
        else store.delete(EMERGENCY_KEY);
        store.delete(LEGACY_SAVE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = event => reject(event.target.error || event);
      });

      if (nextEmergency) localStorage.setItem(LOCAL_EMERGENCY_KEY, JSON.stringify(nextEmergency));
      else localStorage.removeItem(LOCAL_EMERGENCY_KEY);
      return true;
    } catch (error) {
      console.error('[SaveManager] Save failed:', error);
      return false;
    }
  }

  static async hasSave() {
    const recovered = await SaveManager.loadRecoverable();
    return Boolean(recovered.payload);
  }

  static async reset() {
    try {
      localStorage.removeItem(LOCAL_EMERGENCY_KEY);
      const db = await SaveManager._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const key of [PRIMARY_KEY, ROLLBACK_KEY, EMERGENCY_KEY, LEGACY_SAVE_KEY]) store.delete(key);
        tx.oncomplete = resolve;
        tx.onerror = event => reject(event.target.error || event);
      });
      SaveManager._nextEnvelopeSequence = 1;
      return true;
    } catch (error) {
      console.error('[SaveManager] Reset failed:', error);
      return false;
    }
  }
}
