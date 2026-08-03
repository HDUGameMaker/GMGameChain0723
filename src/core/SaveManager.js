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
const STORAGE_LOCK_NAME = 'gmgc-v9-save-storage';
const FORBIDDEN_V9_KEYS = ['armies', 'availableUnits', 'tradeRoutes', 'factions'];

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalV9Violation(payload) {
  if (!isRecord(payload) || !Number.isInteger(payload.version) || payload.version !== 9) return 'version';
  if (FORBIDDEN_V9_KEYS.some(key => Object.hasOwn(payload, key))) return 'forbidden_mirror';

  const world = payload.world;
  if (!isRecord(world) || world.schemaVersion !== 1 || typeof world.source !== 'string' || !world.source
      || typeof world.mapId !== 'string' || !world.mapId) return 'world';

  const army = payload.armyState;
  if (!isRecord(army) || !Number.isInteger(army.nextId) || army.nextId <= 0
      || !Array.isArray(army.armies) || !isRecord(army.availableUnits) || !Array.isArray(army.battleHistory)) return 'armyState';
  if (Object.values(army.availableUnits).some(count => !Number.isInteger(count) || count < 0)) return 'armyState.availableUnits';
  if (army.armies.some(record => !isRecord(record) || typeof record.id !== 'string' || !record.id
      || typeof record.ownerId !== 'string' || !record.ownerId || !Array.isArray(record.unitIds))) return 'armyState.armies';

  const commerce = payload.commerce;
  if (!isRecord(commerce) || !Number.isInteger(commerce.nextId) || commerce.nextId <= 0
      || !Number.isInteger(commerce.lastProcessedDay) || commerce.lastProcessedDay < 0
      || !Array.isArray(commerce.routes) || !Array.isArray(commerce.conversions)) return 'commerce';
  const factions = commerce.factions;
  if (!isRecord(factions) || !isRecord(factions.states) || !isRecord(factions.relations)
      || !Number.isInteger(factions.lastSyncDay) || factions.lastSyncDay < 0) return 'commerce.factions';

  if (!Array.isArray(payload.buildings)) return 'buildings';
  const buildingIds = new Set();
  for (const building of payload.buildings) {
    if (!isRecord(building) || typeof building.instanceId !== 'string' || !/^building_\d+$/.test(building.instanceId)
        || buildingIds.has(building.instanceId) || typeof building.buildingId !== 'string' || !building.buildingId
        || !Number.isInteger(building.gridX) || !Number.isInteger(building.gridY)
        || building.gridX < 0 || building.gridY < 0 || building.gridX >= 512 || building.gridY >= 512
        || (building.cropId !== null && typeof building.cropId !== 'string')
        || (building.pendingCropId !== null && typeof building.pendingCropId !== 'string')
        || (building.resourceNodeId !== null && typeof building.resourceNodeId !== 'string')) return 'buildings.record';
    buildingIds.add(building.instanceId);
  }

  const resourceNodes = payload.resourceNodes;
  if (!isRecord(resourceNodes) || !Array.isArray(resourceNodes.nodes)) return 'resourceNodes';
  const nodeIds = new Set();
  for (const node of resourceNodes.nodes) {
    if (!isRecord(node) || typeof node.id !== 'string' || !node.id || nodeIds.has(node.id)
        || typeof node.type !== 'string' || !node.type
        || !Number.isInteger(node.gridX) || !Number.isInteger(node.gridY)
        || node.gridX < 0 || node.gridY < 0 || node.gridX >= 512 || node.gridY >= 512
        || (node.developedByBuildingId !== null && typeof node.developedByBuildingId !== 'string')) return 'resourceNodes.record';
    nodeIds.add(node.id);
  }

  const fog = payload.fogOfWar;
  if (!isRecord(fog) || !Number.isInteger(fog.width) || !Number.isInteger(fog.height)
      || fog.width <= 0 || fog.height <= 0 || fog.width > 512 || fog.height > 512
      || !Array.isArray(fog.exploredRle)
      || fog.exploredRle.some(run => !Number.isInteger(run) || run < 0)
      || fog.exploredRle.reduce((sum, run) => sum + run, 0) !== fog.width * fog.height) return 'fogOfWar';
  return null;
}

export class SaveManager {
  static CURRENT_VERSION = 9;
  static _db = null;
  static _nextEnvelopeSequence = 1;
  static _mutationQueue = Promise.resolve();

  static migrate(raw) {
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      canonicalizePayload(raw);
      if (!Number.isInteger(raw.version) || raw.version < 5 || raw.version > SaveManager.CURRENT_VERSION) return null;
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

      if (state.version === 9) SaveManager._normalizeV9OverhaulState(state);

      state.migrationHistory = [...new Set(history)];
      if (canonicalV9Violation(state)) return null;
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
      nextId: Number.isInteger(armyState.nextId) && armyState.nextId > 0 ? armyState.nextId : derivedNextId,
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
    const legacyCommerce = isRecord(state.tradeRoutes) ? state.tradeRoutes : {};
    const legacyFactions = isRecord(state.factions) ? state.factions : {};
    state.commerce = {
      nextId: Number.isInteger(legacyCommerce.nextId) && legacyCommerce.nextId > 0 ? legacyCommerce.nextId : 1,
      lastProcessedDay: Number.isInteger(legacyCommerce.lastProcessedDay) && legacyCommerce.lastProcessedDay >= 0
        ? legacyCommerce.lastProcessedDay : 0,
      routes: Array.isArray(legacyCommerce.routes) ? structuredClone(legacyCommerce.routes) : [],
      conversions: Array.isArray(legacyCommerce.conversions) ? structuredClone(legacyCommerce.conversions) : [],
      factions: {
        states: isRecord(legacyFactions.states) ? structuredClone(legacyFactions.states) : {},
        relations: isRecord(legacyFactions.relations) ? structuredClone(legacyFactions.relations) : {},
        lastSyncDay: Number.isInteger(legacyFactions.lastSyncDay) && legacyFactions.lastSyncDay >= 0
          ? legacyFactions.lastSyncDay : 0
      }
    };
    if (state.colony?.occupied && typeof state.colony.occupied === 'object') {
      for (const colony of Object.values(state.colony.occupied)) {
        if (colony && typeof colony === 'object') colony.legacyOffmap = true;
      }
    }
    SaveManager._removeV9Mirrors(state);
  }

  static _removeV9Mirrors(state) {
    delete state.armies;
    delete state.availableUnits;
    delete state.tradeRoutes;
    delete state.factions;
  }

  static _normalizeV9OverhaulState(state) {
    const farmIds = new Set(['farm', 'farm_t2', 'grain_farm']);
    state.buildings = (Array.isArray(state.buildings) ? state.buildings : []).map((building, index) => ({
      ...building,
      instanceId: building?.instanceId || `building_${index + 1}`,
      gridX: building?.gridX ?? 0,
      gridY: building?.gridY ?? 0,
      resourceNodeId: building?.resourceNodeId ?? null,
      cropId: building?.cropId ?? (farmIds.has(building?.buildingId) ? 'grain' : null),
      pendingCropId: building?.pendingCropId ?? null
    }));
    state.resourceNodes = isRecord(state.resourceNodes) && Array.isArray(state.resourceNodes.nodes)
      ? { ...state.resourceNodes, nodes: state.resourceNodes.nodes.map(node => ({
        ...node,
        rarity: node?.rarity === 'rare' ? 'rare' : 'common',
        capacity: node?.capacity ?? null,
        remaining: node?.remaining ?? null,
        recoveryDays: node?.recoveryDays ?? null,
        recoveryDay: node?.recoveryDay ?? null,
        developedByBuildingId: node?.developedByBuildingId ?? null,
        discovered: node?.discovered !== false
      })) }
      : { nodes: [] };
    state.fogOfWar = isRecord(state.fogOfWar)
      ? state.fogOfWar
      : { width: 384, height: 384, exploredRle: [384 * 384] };
  }

  static _assertCanonicalV9(payload) {
    canonicalizePayload(payload);
    const violation = canonicalV9Violation(payload);
    if (violation) throw new TypeError(`Canonical v9 schema violation: ${violation}`);
  }

  static async createEnvelope(payload) {
    const sequence = SaveManager._nextEnvelopeSequence;
    return SaveManager._createEnvelopeWithSequence(payload, sequence);
  }

  static async _createEnvelopeWithSequence(payload, sequence) {
    SaveManager._assertCanonicalV9(payload);
    const envelope = await createEnvelopeRecord(payload, { sequence });
    const verification = await SaveManager.verifyEnvelope(envelope);
    if (!verification.ok) throw new Error(`Created envelope failed verification: ${verification.reason}`);
    SaveManager._nextEnvelopeSequence = Math.max(SaveManager._nextEnvelopeSequence, sequence + 1);
    return envelope;
  }

  static async verifyEnvelope(envelope) {
    const verification = await verifyEnvelopeRecord(envelope);
    if (!verification.ok) return verification;
    return canonicalV9Violation(envelope.payload)
      ? { ok: false, reason: 'invalid_payload' }
      : verification;
  }

  static async _candidateEnvelope(candidate) {
    if (candidate?.format === 'gmgc-save-envelope') {
      const verification = await verifyEnvelopeRecord(candidate);
      if (!verification.ok) return null;
      const payload = SaveManager.migrate(candidate.payload);
      if (!payload) return null;
      return canonicalV9Violation(candidate.payload) ? SaveManager.createEnvelope(payload) : candidate;
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

  static _queueMutation(operation) {
    const queued = SaveManager._mutationQueue.then(operation, operation);
    SaveManager._mutationQueue = queued.catch(() => undefined);
    return queued;
  }

  static _withStorageLock(operation) {
    const locks = globalThis.navigator?.locks;
    return locks?.request
      ? locks.request(STORAGE_LOCK_NAME, { mode: 'exclusive' }, operation)
      : operation();
  }

  static async save(gameState) {
    const payload = SaveManager.migrate(gameState);
    if (!payload) return false;
    return SaveManager._queueMutation(() => SaveManager._withStorageLock(async () => {
      try {
        return await SaveManager._savePayload(payload);
      } catch (error) {
        console.error('[SaveManager] Save failed:', error);
        return false;
      }
    }));
  }

  static async _savePayload(payload) {
      const records = await SaveManager._readRecords([PRIMARY_KEY, ROLLBACK_KEY, EMERGENCY_KEY]);
      const primary = await SaveManager._candidateEnvelope(records[PRIMARY_KEY]);
      const rollback = await SaveManager._candidateEnvelope(records[ROLLBACK_KEY]);
      const storedEmergency = await SaveManager._candidateEnvelope(records[EMERGENCY_KEY]);
      const localEmergency = await SaveManager._candidateEnvelope(SaveManager._readLocalEmergency());
      const verified = [primary, rollback, storedEmergency, localEmergency].filter(Boolean);
      const sequence = verified.reduce((highest, item) => Math.max(highest, item.sequence), 0) + 1;
      const envelope = await SaveManager._createEnvelopeWithSequence(payload, sequence);
      const nextRollback = primary;
      const nextEmergency = rollback || storedEmergency || localEmergency;

      const db = await SaveManager._getDB();
      await new Promise((resolve, reject) => {
        let tx;
        let operationError = null;
        try {
          tx = db.transaction(STORE_NAME, 'readwrite');
          tx.oncomplete = resolve;
          tx.onabort = event => reject(operationError || tx.error || event.target.error || event);
          tx.onerror = () => {};
          const store = tx.objectStore(STORE_NAME);
          store.put(envelope, PRIMARY_KEY);
          if (nextRollback) store.put(nextRollback, ROLLBACK_KEY);
          else store.delete(ROLLBACK_KEY);
          if (nextEmergency) store.put(nextEmergency, EMERGENCY_KEY);
          else store.delete(EMERGENCY_KEY);
          store.delete(LEGACY_SAVE_KEY);
        } catch (error) {
          operationError = error;
          if (!tx) {
            reject(error);
            return;
          }
          try {
            tx.abort();
          } catch {
            reject(error);
          }
        }
      });

      if (nextEmergency) localStorage.setItem(LOCAL_EMERGENCY_KEY, JSON.stringify(nextEmergency));
      else localStorage.removeItem(LOCAL_EMERGENCY_KEY);
      return true;
  }

  static async hasSave() {
    const recovered = await SaveManager.loadRecoverable();
    return Boolean(recovered.payload);
  }

  static async reset() {
    return SaveManager._queueMutation(() => SaveManager._withStorageLock(async () => {
      try {
        localStorage.removeItem(LOCAL_EMERGENCY_KEY);
        const db = await SaveManager._getDB();
        await new Promise((resolve, reject) => {
          let tx;
          let operationError = null;
          try {
            tx = db.transaction(STORE_NAME, 'readwrite');
            tx.oncomplete = resolve;
            tx.onabort = event => reject(operationError || tx.error || event.target.error || event);
            tx.onerror = () => {};
            const store = tx.objectStore(STORE_NAME);
            for (const key of [PRIMARY_KEY, ROLLBACK_KEY, EMERGENCY_KEY, LEGACY_SAVE_KEY]) store.delete(key);
          } catch (error) {
            operationError = error;
            if (!tx) reject(error);
            else {
              try { tx.abort(); } catch { reject(error); }
            }
          }
        });
        SaveManager._nextEnvelopeSequence = 1;
        return true;
      } catch (error) {
        console.error('[SaveManager] Reset failed:', error);
        return false;
      }
    }));
  }
}
