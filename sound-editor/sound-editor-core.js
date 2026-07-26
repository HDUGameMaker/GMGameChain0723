/**
 * sound-editor-core.js — 音效编辑器基础设施
 *
 * 包含函数: init(), loadAllData(), doSave(), previewAudio(), showToast()
 *           selectDir(), updateDirUI(), markDirty(), refreshList(), selectItem()
 *           currentData(), currentFileKeys(), itemDisplayName(), checkFileExists()
 * 全局变量: state, CONFIG_FILES, KNOWN_GAME_EVENTS
 * 依赖: 无（最先加载，含自执行 init IIFE）
 */

// ==================== 已知游戏事件列表 ====================
const KNOWN_GAME_EVENTS = [
  { event: 'buildingPlaced',          desc: '建筑放置完成' },
  { event: 'buildingComplete',        desc: '建筑建造完成' },
  { event: 'buildingUpgraded',        desc: '建筑升级完成' },
  { event: 'buildingClicked',         desc: '点击建筑' },
  { event: 'buildingDemolished',      desc: '建筑被拆除' },
  { event: 'buildingMoved',           desc: '建筑被移动' },
  { event: 'workerChanged',           desc: '工人分配变更' },
  { event: 'resourceChanged',         desc: '资源数量变化' },
  { event: 'itemObtained',            desc: '获得物品' },
  { event: 'itemLost',                desc: '失去物品' },
  { event: 'itemsChanged',            desc: '物品列表变化' },
  { event: 'torchLit',                desc: '火把点燃' },
  { event: 'torchExtinguished',       desc: '火把熄灭' },
  { event: 'torchUpgraded',           desc: '火把升级完成' },
  { event: 'torchUpgradeStarted',     desc: '火把开始升级' },
  { event: 'torchFuelAdded',          desc: '火把添加燃料' },
  { event: 'torchStateChanged',       desc: '火把状态变化' },
  { event: 'torchClicked',            desc: '点击火把' },
  { event: 'expeditionStarted',       desc: '探险出发' },
  { event: 'expeditionComplete',      desc: '探险归来' },
  { event: 'expeditionEntranceClicked', desc: '点击探险入口' },
  { event: 'synthesisStarted',        desc: '合成开始' },
  { event: 'synthesisComplete',       desc: '合成完成' },
  { event: 'periodChange',            desc: '时段切换（早/午/晚/夜）' },
  { event: 'periodEnd',               desc: '时段结束' },
  { event: 'dayStart',                desc: '新一天开始' },
  { event: 'tick',                    desc: '游戏 Tick 结算（每40秒）' },
  { event: 'populationChanged',       desc: '人口数量变化' },
  { event: 'gamePaused',              desc: '游戏暂停' },
  { event: 'gameResumed',             desc: '游戏恢复' },
  { event: 'pageVisibilityChange',    desc: '页面可见性变化（切换标签页）' },
  { event: 'popupClosed',              desc: '弹窗关闭' },
  { event: 'audioSettingsChanged',     desc: '音频设置变更' }
];

// ==================== Tab 配置 ====================
const tabTitles = {
  bgm: '背景音乐',
  sfx: '音效',
  bindings: 'SFX 事件绑定',
  bgmbindings: 'BGM 事件绑定',
  buildingBindings: '建筑音效绑定',
  itemBindings: '物品合成音效',
  settings: '全局设置'
};

const tabFiles = {
  bgm: 'config/sound.json → bgm[]',
  sfx: 'config/sound.json → sfx[]',
  bindings: 'config/sound.json → eventBindings[]',
  bgmbindings: 'config/sound.json → bgmBindings[]',
  buildingBindings: 'config/sound.json → buildingSoundBindings',
  itemBindings: 'config/sound.json → itemSoundBindings',
  settings: 'config/sound.json (根级字段)'
};

// 建筑音效事件类型
const BUILDING_SOUND_EVENTS = [
  { key: 'click', name: '点击' },
  { key: 'buildStart', name: '开始建造' },
  { key: 'buildComplete', name: '建造完成' },
  { key: 'demolish', name: '拆除' },
  { key: 'upgrade', name: '升级' },
  { key: 'move', name: '移动' }
];

// 物品合成音效事件类型
const ITEM_SOUND_EVENTS = [
  { key: 'synthesisStart', name: '开始合成' },
  { key: 'synthesisComplete', name: '合成完成' }
];

// 从事件绑定中排除的建筑相关事件（已移到建筑音效绑定）
const BUILDING_EVENTS_TO_EXCLUDE = [
  'buildingPlaced',
  'buildingComplete',
  'buildingUpgraded',
  'buildingClicked',
  'buildingDemolished',
  'buildingMoved'
];

// 从事件绑定中排除的合成相关事件（已移到物品合成音效绑定）
const SYNTHESIS_EVENTS_TO_EXCLUDE = [
  'synthesisStarted',
  'synthesisComplete'
];

// ==================== File System Access API ====================
let dirHandle = null;
const DB_NAME = 'gmgame-sound-editor';
const DB_STORE = 'dir-handles';

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
  } catch (e) { console.warn('Failed to store dir handle:', e); }
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
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') {
      dirHandle = handle; return true;
    }
    if ((await handle.requestPermission(opts)) === 'granted') {
      dirHandle = handle; return true;
    }
    return false;
  } catch (e) { console.warn('Failed to restore dir handle:', e); return false; }
}

// ==================== CONFIG_FILES 注册 ====================
const CONFIG_FILES = {
  sound: { path: 'sound.json', dir: '' },
  buildings: { path: 'buildings.json', dir: '' },
  items: { path: 'items.json', dir: '' }
};

// ==================== State ====================
const state = {
  tab: 'bgm',
  autoSave: true,
  data: null,
  buildings: null,
  items: null,
  selectedIdx: -1,
  selectedBuilding: 'default',
  selectedItem: 'default',
  dirtyFiles: new Set(),
  saveTimer: null
};

// ==================== 目录选择 ====================
async function selectDir() {
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await storeDirHandle();
    updateDirUI();
    showToast('目录已连接，可以自动保存', 'success');
    await loadAllData();
  } catch (e) {
    if (e.name !== 'AbortError') showToast('目录选择失败: ' + e.message, 'error');
  }
}

function updateDirUI() {
  const el = document.getElementById('fileStatus');
  if (el) {
    el.textContent = dirHandle ? '📂 目录已连接' : '📂 未连接目录';
  }
}

// ==================== 文件读写 ====================
async function readFile(fileKey) {
  const cfg = CONFIG_FILES[fileKey];
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
    } catch (e) { /* fall through to fetch */ }
  }
  const url = cfg.dir ? `../config/${cfg.dir}/${cfg.path}` : `../config/${cfg.path}`;
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

// ==================== 数据加载 ====================
async function loadAllData() {
  try {
    const soundText = await readFile('sound');
    state.data = JSON.parse(soundText);
    
    // 加载 buildings.json 获取所有建筑 ID
    try {
      const buildingsText = await readFile('buildings');
      state.buildings = JSON.parse(buildingsText);
      // 确保每个建筑都有音效绑定配置
      ensureAllBuildingsHaveSoundBindings();
    } catch (e) {
      console.warn('[SoundEditor] Failed to load buildings.json:', e.message);
      state.buildings = [];
    }
    
    // 加载 items.json 获取所有物品 ID
    try {
      const itemsText = await readFile('items');
      state.items = JSON.parse(itemsText);
      // 确保每个物品都有合成音效绑定配置
      ensureAllItemsHaveSoundBindings();
    } catch (e) {
      console.warn('[SoundEditor] Failed to load items.json:', e.message);
      state.items = [];
    }
    
    state.dirtyFiles.clear();
    refreshList();
    updateSaveStatus();
    console.log('[SoundEditor] Data loaded');
  } catch (e) {
    showToast('数据加载失败: ' + e.message, 'error');
    console.error(e);
  }
}

// 确保所有建筑都有音效绑定配置
function ensureAllBuildingsHaveSoundBindings() {
  if (!state.data.buildingSoundBindings) {
    state.data.buildingSoundBindings = {};
  }
  
  // 默认配置
  const defaultConfig = {
    click: 'sfx_click',
    buildStart: 'sfx_build',
    buildComplete: 'sfx_complete',
    demolish: 'sfx_demolish',
    upgrade: 'sfx_upgrade',
    move: null
  };
  
  if (!state.data.buildingSoundBindings.default) {
    state.data.buildingSoundBindings.default = { ...defaultConfig };
  } else {
    // 补全默认配置中缺失的字段
    for (const key of Object.keys(defaultConfig)) {
      if (state.data.buildingSoundBindings.default[key] === undefined) {
        state.data.buildingSoundBindings.default[key] = defaultConfig[key];
      }
    }
  }
  
  // 为每个建筑添加配置（如果不存在）或补全缺失的字段
  if (Array.isArray(state.buildings)) {
    for (const building of state.buildings) {
      const buildingId = building.id;
      if (!buildingId) continue;
      
      if (!state.data.buildingSoundBindings[buildingId]) {
        // 默认使用默认配置的拷贝
        state.data.buildingSoundBindings[buildingId] = { ...state.data.buildingSoundBindings.default };
      } else {
        // 补全缺失的字段
        for (const key of Object.keys(defaultConfig)) {
          if (state.data.buildingSoundBindings[buildingId][key] === undefined) {
            state.data.buildingSoundBindings[buildingId][key] = state.data.buildingSoundBindings.default[key];
          }
        }
      }
    }
  }
}

// 确保所有物品都有合成音效绑定配置
function ensureAllItemsHaveSoundBindings() {
  if (!state.data.itemSoundBindings) {
    state.data.itemSoundBindings = {};
  }
  
  // 默认配置
  const defaultConfig = {
    synthesisStart: 'sfx_build',
    synthesisComplete: 'sfx_complete'
  };
  
  if (!state.data.itemSoundBindings.default) {
    state.data.itemSoundBindings.default = { ...defaultConfig };
  } else {
    // 补全默认配置中缺失的字段
    for (const key of Object.keys(defaultConfig)) {
      if (state.data.itemSoundBindings.default[key] === undefined) {
        state.data.itemSoundBindings.default[key] = defaultConfig[key];
      }
    }
  }
  
  // 为每个物品添加配置（如果不存在）或补全缺失的字段
  if (Array.isArray(state.items)) {
    for (const item of state.items) {
      const itemId = item.id;
      if (!itemId) continue;
      
      if (!state.data.itemSoundBindings[itemId]) {
        // 默认使用默认配置的拷贝
        state.data.itemSoundBindings[itemId] = { ...state.data.itemSoundBindings.default };
      } else {
        // 补全缺失的字段
        for (const key of Object.keys(defaultConfig)) {
          if (state.data.itemSoundBindings[itemId][key] === undefined) {
            state.data.itemSoundBindings[itemId][key] = state.data.itemSoundBindings.default[key];
          }
        }
      }
    }
  }
}

// ==================== 当前 tab 数据 ====================
function currentData() {
  if (!state.data) return null;
  switch (state.tab) {
    case 'bgm': return state.data.bgm;
    case 'sfx': return state.data.sfx;
    case 'bindings': return state.data.eventBindings;
    case 'bgmbindings':
      if (!state.data.bgmBindings) state.data.bgmBindings = [];
      return state.data.bgmBindings;
    case 'buildingBindings':
      if (!state.data.buildingSoundBindings) state.data.buildingSoundBindings = { default: {} };
      return state.data.buildingSoundBindings;
    case 'itemBindings':
      if (!state.data.itemSoundBindings) state.data.itemSoundBindings = { default: {} };
      return state.data.itemSoundBindings;
    case 'settings': return null;
    default: return null;
  }
}

function currentFileKeys() {
  return ['sound'];
}

function itemDisplayName(item) {
  if (!item) return '(无)';
  return item.name || item.id || '(未命名)';
}

// ==================== 列表刷新 ====================
function refreshList() {
  const body = document.getElementById('listBody');
  const countEl = document.getElementById('itemCount');
  if (!body) return;

  const data = currentData();
  const tab = state.tab;
  const sortField = document.getElementById('sortField')?.value || 'name';
  const sortOrder = document.getElementById('sortOrder')?.value || 'asc';

  // 设置 tab 不在列表中显示
  const listPanel = document.getElementById('listPanel');
  if (tab === 'settings') {
    listPanel.style.display = 'none';
    document.getElementById('detailPanel').style.flex = '1';
    if (countEl) countEl.textContent = '';
    return;
  }
  listPanel.style.display = '';
  document.getElementById('detailPanel').style.flex = '';

  // 建筑音效绑定是对象，需要特殊处理
  if (tab === 'buildingBindings') {
    let html = '';
    
    // 先显示默认配置
    const defaultActiveClass = 'default' === state.selectedBuilding ? ' active' : '';
    html += `<div class="list-item${defaultActiveClass}" data-building="default">
      ⚙️ 默认配置
    </div>`;
    
    // 显示所有建筑
    let buildingCount = 0;
    if (Array.isArray(state.buildings)) {
      for (const building of state.buildings) {
        const buildingId = building.id;
        if (!buildingId) continue;
        buildingCount++;
        const buildingName = building.name || buildingId;
        const activeClass = buildingId === state.selectedBuilding ? ' active' : '';
        html += `<div class="list-item${activeClass}" data-building="${buildingId}">
          🏠 ${escapeHTML(buildingName)}<span class="iid">(${buildingId})</span>
        </div>`;
      }
    }
    
    body.innerHTML = html || '<div class="empty-state">📭 暂无数据</div>';
    if (countEl) countEl.textContent = (buildingCount + 1) + ' 项';
    
    // 列表项点击事件
    body.querySelectorAll('.list-item').forEach(el => {
      el.addEventListener('click', () => {
        const buildingId = el.dataset.building;
        state.selectedBuilding = buildingId;
        refreshList();
        renderDetail();
      });
    });
    return;
  }

  // 物品合成音效绑定是对象，需要特殊处理
  if (tab === 'itemBindings') {
    let html = '';
    
    // 先显示默认配置
    const defaultActiveClass = 'default' === state.selectedItem ? ' active' : '';
    html += `<div class="list-item${defaultActiveClass}" data-item="default">
      ⚙️ 默认配置
    </div>`;
    
    // 显示所有物品
    let itemCount = 0;
    if (Array.isArray(state.items)) {
      for (const item of state.items) {
        const itemId = item.id;
        if (!itemId) continue;
        itemCount++;
        const itemName = item.name || itemId;
        const activeClass = itemId === state.selectedItem ? ' active' : '';
        html += `<div class="list-item${activeClass}" data-item="${itemId}">
          🎒 ${escapeHTML(itemName)}<span class="iid">(${itemId})</span>
        </div>`;
      }
    }
    
    body.innerHTML = html || '<div class="empty-state">📭 暂无数据</div>';
    if (countEl) countEl.textContent = (itemCount + 1) + ' 项';
    
    // 列表项点击事件
    body.querySelectorAll('.list-item').forEach(el => {
      el.addEventListener('click', () => {
        const itemId = el.dataset.item;
        state.selectedItem = itemId;
        refreshList();
        renderDetail();
      });
    });
    return;
  }

  if (!data || !Array.isArray(data)) {
    body.innerHTML = '<div class="empty-state">📭 暂无数据</div>';
    if (countEl) countEl.textContent = '0 项';
    return;
  }

  if (countEl) countEl.textContent = data.length + ' 项';

  // 排序数据（bindings 使用 KNOWN_GAME_EVENTS 顺序，不排序）
  let sortedData = data;
  if (sortField !== 'order' && tab !== 'bindings') {
    sortedData = [...data].sort((a, b) => {
      const va = a[sortField] || '';
      const vb = b[sortField] || '';
      const cmp = String(va).localeCompare(String(vb), 'zh-CN');
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }

  let html = '';
  if (tab === 'bindings') {
    // 事件绑定列表显示所有 KNOWN_GAME_EVENTS
    for (const evt of KNOWN_GAME_EVENTS) {
      const binding = data.find(b => b.event === evt.event);
      const soundId = binding ? binding.sound : null;
      const soundName = soundId ? (getSFXName(soundId) || soundId) : '(无)';
      const activeClass = (state.selectedIdx >= 0 && data[state.selectedIdx]?.event === evt.event) ? ' active' : '';
      html += `<div class="list-item${activeClass}" data-idx="${data.findIndex(b => b.event === evt.event)}" data-event="${evt.event}">
        <span style="font-family:ui-monospace,monospace;font-size:12px;">${evt.event}</span>
        <span class="iid">→ ${soundName}</span>
      </div>`;
    }
  } else if (tab === 'bgmbindings') {
    // BGM 绑定列表：常规 CRUD 列表
    for (let i = 0; i < sortedData.length; i++) {
      const item = sortedData[i];
      const origIdx = data.indexOf(item);
      const activeClass = origIdx === state.selectedIdx ? ' active' : '';
      const bgmName = item.bgm ? (getBGMName(item.bgm) || item.bgm) : '(无)';
      const periodsStr = item.periods && item.periods.length ? ' [' + item.periods.join(',') + ']' : '';
      html += `<div class="list-item${activeClass}" data-idx="${origIdx}">
        🎵 ${escapeHTML(item.event)}${periodsStr}
        <span class="iid">→ ${escapeHTML(bgmName)}</span>
      </div>`;
    }
  } else {
    // BGM/SFX 普通列表
    for (let i = 0; i < sortedData.length; i++) {
      const item = sortedData[i];
      const origIdx = data.indexOf(item);
      const activeClass = origIdx === state.selectedIdx ? ' active' : '';
      const icon = tab === 'bgm' ? '🎵' : '🔔';
      html += `<div class="list-item${activeClass}" data-idx="${origIdx}">
        ${icon} ${escapeHTML(itemDisplayName(item))}
        <span class="iid">${escapeHTML(item.id || '')}</span>
      </div>`;
    }
  }
  body.innerHTML = html || '<div class="empty-state">📭 暂无数据</div>';

  // 列表项点击事件（buildingBindings 在前面已单独处理）
  body.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', () => {
      if (tab === 'bindings') {
        const evt = el.dataset.event;
        const data = currentData();
        const idx = data ? data.findIndex(b => b.event === evt) : -1;
        selectItem(idx >= 0 ? idx : -1);
      } else {
        const idx = parseInt(el.dataset.idx);
        selectItem(idx);
      }
    });
  });
}

function selectItem(idx) {
  state.selectedIdx = idx;
  refreshList();
  renderDetail();
}

function getSFXName(id) {
  if (!state.data || !Array.isArray(state.data.sfx)) return null;
  const sfx = state.data.sfx.find(s => s.id === id);
  return sfx ? sfx.name : null;
}

function getBGMName(id) {
  if (!state.data || !Array.isArray(state.data.bgm)) return null;
  const bgm = state.data.bgm.find(b => b.id === id);
  return bgm ? bgm.name : null;
}

// ==================== 保存 ====================
function markDirty() {
  state.dirtyFiles.add(state.tab);
  if (state.autoSave && dirHandle) scheduleSave();
  updateSaveStatus();
}

function scheduleSave() {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  const statusEl = document.getElementById('saveStatus');
  if (statusEl) {
    statusEl.className = 'status pending';
    statusEl.innerHTML = '<span class="dot"></span>保存中...';
  }
  state.saveTimer = setTimeout(() => doSave(), 1000);
}

async function doSave() {
  try {
    await writeFile('sound', JSON.stringify(state.data, null, 2));
    state.dirtyFiles.clear();
    updateSaveStatus();
    
    // 通知游戏热更新（通过 localStorage）
    notifyGameHotReload();
  } catch (e) {
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) {
      statusEl.className = 'status error';
      statusEl.innerHTML = '<span class="dot"></span>保存失败';
    }
    showToast('保存失败: ' + e.message, 'error');
  }
}

// 通知游戏热更新配置
function notifyGameHotReload() {
  // 使用 localStorage 发送热更新信号
  localStorage.setItem('gmgame_sound_reload', Date.now().toString());
  showToast('配置已保存，游戏将自动刷新', 'success');
  
  // 清理旧信号
  setTimeout(() => {
    localStorage.removeItem('gmgame_sound_reload');
  }, 5000);
}

function updateSaveStatus() {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  if (!dirHandle) {
    el.className = 'status pending';
    el.innerHTML = '<span class="dot"></span>请先连接目录';
  } else if (state.dirtyFiles.size > 0) {
    el.className = 'status pending';
    el.innerHTML = '<span class="dot"></span>未保存';
  } else {
    el.className = 'status saved';
    el.innerHTML = '<span class="dot"></span>已保存 ✓';
  }
}

// ==================== 音频预览 ====================
let _previewAudio = null;
let _previewButton = null;

// 更新预览按钮图标状态
function updatePreviewButtonIcon(button, isPlaying) {
  if (!button) return;
  if (isPlaying) {
    button.textContent = '⏸';
    button.classList.add('playing');
  } else {
    button.textContent = '▶';
    button.classList.remove('playing');
  }
}

// 重置所有预览按钮状态
function resetAllPreviewButtons() {
  document.querySelectorAll('.btn-preview').forEach(b => updatePreviewButtonIcon(b, false));
}

function previewAudio(filePath) {
  if (_previewAudio) {
    _previewAudio.pause();
    _previewAudio = null;
    resetAllPreviewButtons();
  }

  if (!filePath) return;

  _previewAudio = new Audio(resolveAssetPath(filePath));
  _previewAudio.volume = 0.5;
  _previewAudio.play().catch(() => showToast('无法预览音频文件', 'error'));

  _previewAudio.addEventListener('ended', () => {
    _previewAudio = null;
    resetAllPreviewButtons();
  });
}

function stopPreview() {
  if (_previewAudio) {
    _previewAudio.pause();
    _previewAudio = null;
  }
  resetAllPreviewButtons();
}

// 单击预览/暂停切换
function togglePreviewAudio(filePath, button) {
  // 如果正在播放且是同一按钮，暂停
  if (_previewAudio && _previewButton === button) {
    _previewAudio.pause();
    _previewAudio = null;
    updatePreviewButtonIcon(button, false);
    _previewButton = null;
    return;
  }

  // 停止之前的预览
  if (_previewButton) {
    updatePreviewButtonIcon(_previewButton, false);
  }

  // 开始新预览
  if (!filePath) return;

  _previewAudio = new Audio(resolveAssetPath(filePath));
  _previewAudio.volume = 0.5;
  _previewAudio.play().catch(() => showToast('无法预览音频文件', 'error'));

  _previewAudio.addEventListener('ended', () => {
    _previewAudio = null;
    updatePreviewButtonIcon(button, false);
    _previewButton = null;
  });

  updatePreviewButtonIcon(button, true);
  _previewButton = button;
}

// 还原建筑音效为默认
function restoreBuildingSoundToDefault(buildingId) {
  if (!confirm(`确定要将建筑 "${buildingId}" 的音效还原为默认配置吗？`)) return;
  if (state.data.buildingSoundBindings && state.data.buildingSoundBindings.default) {
    state.data.buildingSoundBindings[buildingId] = { ...state.data.buildingSoundBindings.default };
    markDirty();
    refreshList();
    renderDetail();
  }
}

// ==================== 路径规范化 ====================
// 当前页面位于 editor/ 目录下，需要为 assets/ 开头的路径添加 ../ 前缀
function resolveAssetPath(path) {
  if (!path) return path;
  if (path.startsWith('assets/') || path.startsWith('config/')) {
    return '../' + path;
  }
  return path;
}

// ==================== 文件检测 ====================
async function checkFileExists(path) {
  try {
    const resp = await fetch(resolveAssetPath(path), { method: 'HEAD', cache: 'no-cache' });
    return resp.ok;
  } catch (e) { return false; }
}

// ==================== 工具函数 ====================
function escapeHTML(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, type) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ==================== 自执行初始化 ====================
(async function init() {
  const restored = await restoreDirHandle();
  updateDirUI();
  if (restored) {
    await loadAllData();
    updateSaveStatus();
  } else {
    // 即使没有目录也尝试从 fetch 加载
    await loadAllData();
    updateSaveStatus();
  }
})();
