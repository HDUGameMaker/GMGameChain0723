/**
 * planner-config-actions.js — CRUD 操作 + Tab 切换
 *
 * 包含: addItem, duplicateItem, deleteItem, getDefaultItem, switchTab
 *
 * 依赖: planner-config-core.js, planner-config-render.js
 * 被 planner-config-main.js (event listeners) 调用
 */

/* ═══════════════════════════════════════════
   Toolbar actions
   ═══════════════════════════════════════════ */
function addItem() {
  const data = currentData();
  if (!data) return;
  const newItem = getDefaultItem();

  // For events, ask which file to save to
  if (state.tab === 'events') {
    const choice = prompt('请选择事件类型:\n\n  输入 1 → 🏠 基地事件 (存入 events_base.json)\n  输入 2 → 🗺️ 探险事件 (存入 events_expedition.json)\n\n默认: 基地事件', '1');
    const isBase = choice !== '2';
    newItem.id = isBase ? 'new_base_event' : 'new_expedition_event';
    newItem.name = isBase ? '新基地事件' : '新探险事件';
    data.push(newItem);
    if (!state.eventFileSource) state.eventFileSource = new Map();
    state.eventFileSource.set(newItem.id, isBase ? 'base' : 'expedition');
  } else {
    data.push(newItem);
  }

  state.selectedIdx = data.length - 1;
  markDirty();
  refreshList();
  renderDetail();
}

function duplicateItem() {
  if (state.selectedIdx < 0) return;
  const data = currentData();
  if (!data) return;
  const item = data[state.selectedIdx];
  const clone = JSON.parse(JSON.stringify(item));
  clone.id = clone.id + '_copy';
  clone.name = (clone.name || '') + ' (副本)';
  data.push(clone);
  // Inherit event file source
  if (state.tab === 'events' && state.eventFileSource) {
    const src = state.eventFileSource.get(item.id);
    if (src) state.eventFileSource.set(clone.id, src);
  }
  state.selectedIdx = data.length - 1;
  markDirty();
  refreshList();
  renderDetail();
}

function deleteItem() {
  if (state.selectedIdx < 0) return;
  const data = currentData();
  if (!data) return;
  const item = data[state.selectedIdx];
  if (!confirm(`确定要删除「${itemDisplayName(item)}」吗？此操作不可撤销。`)) return;
  // Clean up event file source tracking
  if (state.tab === 'events' && state.eventFileSource) {
    state.eventFileSource.delete(item.id);
  }
  data.splice(state.selectedIdx, 1);
  if (state.selectedIdx >= data.length) state.selectedIdx = data.length - 1;
  markDirty();
  refreshList();
  renderDetail();
}

function getDefaultItem() {
  switch(state.tab) {
    case 'buildings':
      return { id: 'new_building', name: '新建筑', description: '', icon: '', mapIcon: '', imageDetail: '', mapIconLayout: { scaleX: 1.0, scaleY: 1.0, offsetX: 0, offsetY: 0 }, animation: { spriteSheet: '', frameCount: 8, fps: 8, frameWidth: 256, frameHeight: 256, pingpong: false }, footprint: { width: 1, height: 1 }, maxCount: null, initialBuilding: false, housingCapacity: 0, foodCapacity: 0, maxWorkers: 0, buildCost: [], buildTime: 1, upgradesTo: null, production: null, synthesisRecipes: [], labelLayout: { nameOffsetY: 0, progressBarOffsetY: 0, workersOffsetY: 0 } };
    case 'resources':
      return { id: 'new_resource', name: '新资源', icon: '', initial: 0, max: 1000, rare: false, showInHUD: true };
    case 'items':
      return { id: 'new_item', name: '新物品', icon: '', description: '', unique: false, consumable: false, capacityCost: 1, expeditionEffects: [] };
    case 'events':
      return { id: 'new_event', name: '新事件', description: '', image: '', priority: 0, mutexGroup: null, cooldownTicks: 0, maxTriggers: 1, triggerConditions: { timePeriods: [], requiredItems: [], requiredBuildings: [] }, invalidationConditions: { timePeriods: [], requiredItems: [], requiredBuildings: [] }, probability: 1, effects: [], options: [] };
    case 'expeditions':
      return { id: 'new_region', name: '新区域', description: '', image: '', unlockConditions: [], baseYields: {} };
    default: return {};
  }
}

/* ═══════════════════════════════════════════
   Tab switching
   ═══════════════════════════════════════════ */
const tabTitles = {
  buildings: '建筑配置', resources: '资源配置', items: '物品配置',
  events: '事件配置', expeditions: '探险配置', map: '地图配置',
  analysis: '数值分析',
};
const tabFiles = {
  buildings: 'buildings.json', resources: 'resources.json', items: 'items.json',
  events: 'events_base.json + events_expedition.json', expeditions: 'regions.json + expedition_global.json', map: 'base_map.json',
  analysis: '自动分析（只读）',
};

function switchTab(tab) {
  state.tab = tab;
  state.selectedIdx = -1;
  state.eventTypeFilter = 'all';
  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  document.getElementById('tabTitle').textContent = `${tabTitles[tab]} — ${tabFiles[tab]}`;
  document.getElementById('listHeader').textContent = tabTitles[tab] + '列表';
  document.getElementById('searchInput').value = '';

  // Show/hide event type filter
  const filterGroup = document.getElementById('eventFilterGroup');
  filterGroup.style.display = (tab === 'events') ? 'flex' : 'none';
  if (tab === 'events') {
    document.querySelectorAll('#eventFilterGroup .filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#eventFilterGroup [data-filter="all"]')?.classList.add('active');
  }

  // 地图和分析是单例 → 隐藏左侧列表和增删按钮，detail 占满宽度
  const isSingleton = (tab === 'map' || tab === 'analysis');
  ['btnAdd','btnDup','btnDel','searchInput','itemCount','listHeader'].forEach(id => {
    document.getElementById(id).style.display = isSingleton ? 'none' : '';
  });
  document.querySelector('.list-panel').style.display = isSingleton ? 'none' : '';
  document.getElementById('detailPanel').style.flex = isSingleton ? '1' : '';

  refreshList();

  if (isSingleton) {
    if (tab === 'analysis') {
      // 分析页签：直接渲染面板（只读，不走编辑流程）
      document.getElementById('detailPanel').innerHTML = renderAnalysisPanel();
    } else {
      // 地图等单例：自动选中唯一项走正常编辑流程
      state.selectedIdx = 0;
      // Reset canvas viewport
      state.canvasScale = 1.0;
      state.canvasOffsetX = 0;
      state.canvasOffsetY = 0;
      state.mapEditorMode = 'brush';
      state.mapEditorSelectedBuilding = -1;
      state.mapEditorDragTarget = null;
      refreshList();
      renderDetail();
    }
  } else {
    document.getElementById('detailPanel').innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>从左侧列表选择一个项目进行编辑</p><p style="font-size:12px;margin-top:4px;opacity:0.6">或点击「+ 新增」创建新条目</p></div>`;
  }
}
