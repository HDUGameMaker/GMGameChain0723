/**
 * planner-config-core.js — 基础设施：文件系统、状态、数据加载、保存、列表、辅助函数
 *
 * 包含: dirHandle, CONFIG_FILES, state, MAP_CELL_SIZE,
 *       File System Access API (openDB, storeDirHandle, restoreDirHandle, selectDir,
 *       updateDirUI, readFile, writeFile),
 *       loadAllData, init IIFE,
 *       currentData, currentFileKeys, itemDisplayName,
 *       resSelect, bldSelect, itemSelect, resSelectSub, itemSelectSub,
 *       markDirty, scheduleSave, doSave, updateSaveStatus,
 *       refreshList, selectItem,
 *       showToast
 *
 * 依赖: 无（最先加载）
 * 被所有其他 JS 文件依赖
 */

/* ═══════════════════════════════════════════
   File System Access API — 读写 config 目录
   ═══════════════════════════════════════════ */
let dirHandle = null;
const DB_NAME = 'gmgame-config-editor';
const DB_STORE = 'dir-handles';

// -- IndexedDB persistence for directory handle --
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeDirHandle() {
  if (!dirHandle) return;
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(dirHandle, 'configDir');
    await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
    db.close();
  } catch(e) { console.warn('Failed to store dir handle:', e); }
}

async function restoreDirHandle() {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readonly');
    const handle = await new Promise(r => {
      const req = tx.objectStore(DB_STORE).get('configDir');
      req.onsuccess = () => r(req.result);
      req.onerror = () => r(null);
    });
    db.close();
    if (!handle) return false;
    // Verify permission
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') {
      dirHandle = handle;
      return true;
    }
    if ((await handle.requestPermission(opts)) === 'granted') {
      dirHandle = handle;
      return true;
    }
    return false;
  } catch(e) { console.warn('Failed to restore dir handle:', e); return false; }
}
const CONFIG_FILES = {
  buildings:   { path: 'buildings.json',              dir: '' },
  resources:   { path: 'resources.json',              dir: '' },
  items:       { path: 'items.json',                  dir: '' },
  events_base: { path: 'events_base.json',            dir: 'events' },
  events_exp:  { path: 'events_expedition.json',      dir: 'events' },
  regions:     { path: 'regions.json',                dir: 'expeditions' },
  exp_global:  { path: 'expedition_global.json',      dir: 'expeditions' },
  base_map:    { path: 'base_map.json',               dir: 'maps' },
  adjacency_bonuses: { path: 'adjacency-bonuses.json', dir: '' },
};

async function selectDir() {
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await storeDirHandle();
    updateDirUI();
    showToast('目录已连接，可以自动保存', 'success');
    await loadAllData();
  } catch(e) {
    if (e.name !== 'AbortError') showToast('目录选择失败: ' + e.message, 'error');
  }
}

function updateDirUI() {
  const connected = !!dirHandle;
  document.getElementById('btnSelectDir').textContent = connected ? '📁 已连接' : '📁 选择目录';
  const btn = document.getElementById('btnSelectDir');
  if (connected) { btn.classList.add('btn-primary'); }
  else { btn.classList.remove('btn-primary'); }
  const banner = document.getElementById('dirBanner');
  if (connected) {
    banner.className = 'dir-banner connected';
    banner.innerHTML = '<span class="msg">✅ 已连接 — 自动保存中</span>';
    setTimeout(() => { banner.classList.add('hidden'); }, 3000);
  } else {
    banner.className = 'dir-banner';
    banner.innerHTML = '<span class="msg">⚠️ 尚未连接 config 目录 — 点击右侧按钮选择项目的 config/ 文件夹，即可自动保存修改</span><button onclick="selectDir()">📁 选择 config 目录</button>';
  }
}

async function readFile(fileKey) {
  const cfg = CONFIG_FILES[fileKey];
  // Try File System Access API first
  if (dirHandle) {
    try {
      let d = dirHandle;
      if (cfg.dir) {
        const subdirs = cfg.dir.split('/');
        for (const sd of subdirs) d = await d.getDirectoryHandle(sd);
      }
      const fh = await d.getFileHandle(cfg.path);
      const file = await fh.getFile();
      return await file.text();
    } catch(e) { /* fall through to fetch */ }
  }
  // Fallback: fetch from server
  const url = cfg.dir ? `config/${cfg.dir}/${cfg.path}` : `config/${cfg.path}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} loading ${url}`);
  return await resp.text();
}

async function writeFile(fileKey, content) {
  if (!dirHandle) throw new Error('未连接目录');
  const cfg = CONFIG_FILES[fileKey];
  let d = dirHandle;
  if (cfg.dir) {
    const subdirs = cfg.dir.split('/');
    for (const sd of subdirs) d = await d.getDirectoryHandle(sd);
  }
  const fh = await d.getFileHandle(cfg.path, { create: false });
  const writable = await fh.createWritable();
  await writable.write(content);
  await writable.close();
}

/* ═══════════════════════════════════════════
   State
   ═══════════════════════════════════════════ */
const state = {
  tab: 'buildings',
  autoSave: true,
  data: {},           // { buildings: [...], resources: [...], ... }
  selectedIdx: -1,
  dirtyFiles: new Set(),
  saveTimer: null,
  undoStack: [],
  redoStack: [],
  eventTypeFilter: 'all',  // 'all' | 'base' | 'expedition'

  // Map Canvas editor state
  mapEditorMode: 'brush',        // 'brush' | 'building' | 'entrance' | 'rectangle' | 'fill' | 'eraser' | 'select'
  mapEditorBrush: 'G',           // selected ground type char
  mapEditorBuilding: null,       // selected building ID for placement
  mapEditorSelectedBuilding: -1, // index in initialBuildings being dragged
  mapEditorDragging: false,
  mapEditorDragTarget: null,     // 'move' for building/entrance
  mapEditorSelectedEntrance: -1, // 当前选中的入口索引（在 entrances 数组中）
  mapHoverCol: -1,               // current hover tile col
  mapHoverRow: -1,               // current hover tile row
  mapRectStartCol: -1,           // rectangle tool drag start col
  mapRectStartRow: -1,           // rectangle tool drag start row

  // Area selection & move state
  mapSelectStartCol: -1,         // select tool drag start col
  mapSelectStartRow: -1,         // select tool drag start row
  mapSelectEndCol: -1,           // selection bounds (normalized)
  mapSelectEndRow: -1,
  mapSelectActive: false,        // whether a selection rectangle is active
  mapSelectMoving: false,        // whether currently dragging the selection to move
  mapSelectMoveStartCol: -1,     // where the move drag started (top-left of selection)
  mapSelectMoveStartRow: -1,
  mapSelectSnapshot: null,       // snapshot for move: { grid: string[][], buildings: [...] }

  // Canvas viewport state
  canvasScale: 1.0,
  canvasOffsetX: 0,
  canvasOffsetY: 0,
  canvasPanning: false,
  canvasPanStartX: 0,
  canvasPanStartY: 0,
};
const MAP_CELL_SIZE = 28; // default tile size on canvas at 100% zoom

/* ═══════════════════════════════════════════
   Data loading
   ═══════════════════════════════════════════ */
async function loadAllData() {
  try {
    const [buildings, resources, items, eventsBase, eventsExp, regions, expGlobal, baseMap, adjacencyBonuses] =
      await Promise.all([
        readFile('buildings'), readFile('resources'), readFile('items'),
        readFile('events_base'), readFile('events_exp'),
        readFile('regions'), readFile('exp_global'), readFile('base_map'),
        readFile('adjacency_bonuses').catch(() => '[]'),
      ]);
    state.data.buildings = JSON.parse(buildings);
    state.data.resources = JSON.parse(resources);
    state.data.items = JSON.parse(items);
    const eb = JSON.parse(eventsBase);
    const ee = JSON.parse(eventsExp);
    state.data.events = [...eb, ...ee];
    state.data.events_base_file = eb;
    state.data.events_exp_file = ee;
    state.eventFileSource = new Map();
    eb.forEach(e => state.eventFileSource.set(e.id, 'base'));
    ee.forEach(e => state.eventFileSource.set(e.id, 'expedition'));
    state.data.regions = JSON.parse(regions);
    state.data.exp_global = JSON.parse(expGlobal);
    state.data.base_map = JSON.parse(baseMap);
    state.data.adjacency_bonuses = JSON.parse(adjacencyBonuses);
    refreshList();
  } catch(e) {
    showToast('数据加载失败: ' + e.message, 'error');
    console.error(e);
  }
}

// Initial load: restore handle from IndexedDB, then load data
(async function init() {
  const restored = await restoreDirHandle();
  if (restored) updateDirUI();
  await loadAllData();
})();

/* ═══════════════════════════════════════════
   Current tab data access
   ═══════════════════════════════════════════ */
function currentData() {
  switch(state.tab) {
    case 'buildings': return state.data.buildings;
    case 'resources': return state.data.resources;
    case 'items':     return state.data.items;
    case 'events':    return state.data.events;
    case 'expeditions': return state.data.regions;
    case 'map':       return [state.data.base_map]; // 单例包装为数组
    case 'analysis':  return []; // 只读分析，无编辑数据
    case 'adjacency': return state.data.adjacency_bonuses;
    default: return [];
  }
}

function currentFileKeys() {
  switch(state.tab) {
    case 'buildings': return ['buildings'];
    case 'resources': return ['resources'];
    case 'items':     return ['items'];
    case 'events':    return ['events_base', 'events_exp'];
    case 'expeditions': return ['regions', 'exp_global'];
    case 'map':       return ['base_map'];
    case 'analysis':  return []; // 只读，无文件
    case 'adjacency': return ['adjacency_bonuses'];
    default: return [];
  }
}

function itemDisplayName(item) {
  return item.name || item.id || (item.gridWidth ? `地图 (${item.gridWidth}×${item.gridHeight})` : '(未命名)');
}

// -- Dropdown helpers for reference fields --
function resSelect(name, val, nullable) {
  let opts = (state.data.resources||[]).map(r => `<option value="${r.id}" ${val===r.id?'selected':''}>${r.name}</option>`).join('');
  if (nullable) opts = '<option value="">(无)</option>' + opts;
  return `<select id="f_${name}" data-field="${name}">${opts}</select>`;
}
function bldSelect(name, val, nullable) {
  let opts = (state.data.buildings||[]).map(b => `<option value="${b.id}" ${val===b.id?'selected':''}>${b.name}</option>`).join('');
  if (nullable) opts = '<option value="">(无)</option>' + opts;
  return `<select id="f_${name}" data-field="${name}">${opts}</select>`;
}
function itemSelect(name, val, nullable) {
  let opts = (state.data.items||[]).map(it => `<option value="${it.id}" ${val===it.id?'selected':''}>${it.name}</option>`).join('');
  if (nullable) opts = '<option value="">(无)</option>' + opts;
  return `<select id="f_${name}" data-field="${name}">${opts}</select>`;
}
function resSelectSub(idx, val) {
  const opts = (state.data.resources||[]).map(r => `<option value="${r.id}" ${val===r.id?'selected':''}>${r.name}</option>`).join('');
  return `<select data-subidx="${idx}" data-key="resourceId"><option value="">--</option>${opts}</select>`;
}
function itemSelectSub(idx, val) {
  const opts = (state.data.items||[]).map(it => `<option value="${it.id}" ${val===it.id?'selected':''}>${it.name}</option>`).join('');
  return `<select data-subidx="${idx}" data-key="itemId"><option value="">--</option>${opts}</select>`;
}

/* ═══════════════════════════════════════════
   Save
   ═══════════════════════════════════════════ */
function markDirty() {
  state.dirtyFiles.add(state.tab);
  if (state.autoSave) scheduleSave();
  updateSaveStatus();
}

function scheduleSave() {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  document.getElementById('saveStatus').className = 'status pending';
  document.getElementById('saveStatus').innerHTML = '<span class="dot"></span>保存中...';
  state.saveTimer = setTimeout(() => doSave(), 1000);
}

async function doSave() {
  try {
    const keys = currentFileKeys();
    // For events, split back to base vs expedition files
    if (state.tab === 'events') {
      const allEvents = state.data.events;
      const baseEvents = allEvents.filter(e => state.eventFileSource.get(e.id) === 'base');
      const expEvents = allEvents.filter(e => state.eventFileSource.get(e.id) !== 'base');
      await writeFile('events_base', JSON.stringify(baseEvents, null, 2));
      await writeFile('events_exp', JSON.stringify(expEvents, null, 2));
    } else if (state.tab === 'expeditions') {
      await writeFile('regions', JSON.stringify(state.data.regions, null, 2));
      await writeFile('exp_global', JSON.stringify(state.data.exp_global, null, 2));
    } else if (state.tab === 'map') {
      await writeFile('base_map', JSON.stringify(state.data.base_map, null, 2));
    } else {
      const key = keys[0];
      await writeFile(key, JSON.stringify(currentData(), null, 2));
    }
    state.dirtyFiles.delete(state.tab);
    updateSaveStatus();
  } catch(e) {
    document.getElementById('saveStatus').className = 'status error';
    document.getElementById('saveStatus').innerHTML = '<span class="dot"></span>保存失败';
    showToast('保存失败: ' + e.message, 'error');
  }
}

function updateSaveStatus() {
  const el = document.getElementById('saveStatus');
  if (state.dirtyFiles.size === 0) {
    el.className = 'status saved';
    el.innerHTML = '<span class="dot"></span>已保存';
  }
}

/* ═══════════════════════════════════════════
   List & Selection
   ═══════════════════════════════════════════ */
function refreshList() {
  const data = currentData();
  const body = document.getElementById('listBody');
  const search = (document.getElementById('searchInput').value || '').toLowerCase();

  let filtered = data;
  if (search && data) {
    filtered = data.filter(item =>
      (item.name || '').toLowerCase().includes(search) ||
      (item.id || '').toLowerCase().includes(search)
    );
  }
  // Event type filter
  if (state.tab === 'events' && state.eventTypeFilter !== 'all' && state.eventFileSource && data) {
    filtered = filtered.filter(item =>
      state.eventFileSource.get(item.id) === state.eventTypeFilter
    );
  }

  if (!data || data.length === 0) {
    body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">暂无数据</div>';
    document.getElementById('bottomLeft').textContent = '共 0 项';
    document.getElementById('itemCount').textContent = '';
    return;
  }

  body.innerHTML = filtered.map((item, i) => {
    const origIdx = data.indexOf(item);
    const active = origIdx === state.selectedIdx ? ' active' : '';
    let badge = '';
    if (state.tab === 'events' && state.eventFileSource) {
      const src = state.eventFileSource.get(item.id);
      if (src === 'base') badge = '<span class="event-badge base">🏠 基地</span>';
      else if (src === 'expedition') badge = '<span class="event-badge expedition">🗺️ 探险</span>';
    }
    return `<div class="list-item${active}" data-idx="${origIdx}">
      <div><div class="name">${itemDisplayName(item)}${badge}</div><div class="id">${item.id || ''}</div></div>
    </div>`;
  }).join('');

  document.getElementById('bottomLeft').textContent = `共 ${data.length} 项` + (search ? `（筛选后 ${filtered.length} 项）` : '');
  document.getElementById('itemCount').textContent = `${data.length} 项`;

  // Click handlers
  body.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', () => selectItem(parseInt(el.dataset.idx)));
  });
}

function selectItem(idx) {
  state.selectedIdx = idx;
  refreshList();
  renderDetail();
}

/* ═══════════════════════════════════════════
   Toast
   ═══════════════════════════════════════════ */
function showToast(msg, type) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
