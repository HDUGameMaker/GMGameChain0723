/**
 * planner-config-main.js — DOM 事件监听器 + 全局键盘快捷键 + 初始化
 *
 * 依赖: 所有其他 planner-config-*.js 文件（最后加载）
 */

/* ═══════════════════════════════════════════
   Event listeners
   ═══════════════════════════════════════════ */
document.querySelectorAll('.sidebar nav a').forEach(a => {
  a.addEventListener('click', () => switchTab(a.dataset.tab));
});

document.getElementById('btnSelectDir').addEventListener('click', selectDir);
document.getElementById('btnToggleAuto').addEventListener('click', function() {
  state.autoSave = !state.autoSave;
  this.textContent = state.autoSave ? '🔄 自动保存' : '💾 手动保存';
  document.getElementById('btnSave').style.display = state.autoSave ? 'none' : '';
  if (!state.autoSave && state.saveTimer) { clearTimeout(state.saveTimer); state.saveTimer = null; }
});

document.getElementById('btnSave').addEventListener('click', () => doSave());

document.getElementById('btnAdd').addEventListener('click', addItem);
document.getElementById('btnDup').addEventListener('click', duplicateItem);
document.getElementById('btnDel').addEventListener('click', deleteItem);
document.getElementById('searchInput').addEventListener('input', () => { state.selectedIdx = -1; refreshList(); document.getElementById('detailPanel').innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>搜索过滤中...</p></div>`; });

// Event type filter buttons (delegated on the filter group)
document.getElementById('eventFilterGroup').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  const filter = btn.dataset.filter;
  state.eventTypeFilter = filter;
  document.querySelectorAll('#eventFilterGroup .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.selectedIdx = -1;
  refreshList();
  document.getElementById('detailPanel').innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>类型筛选: ${filter === 'base' ? '🏠 基地事件' : filter === 'expedition' ? '🗺️ 探险事件' : '全部事件'}</p></div>`;
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (!state.autoSave) doSave();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (state.tab === 'map') performUndo();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    if (state.tab === 'map') performRedo();
  }

  // Map editor shortcuts (only when no input/textarea is focused)
  const tag = document.activeElement?.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && state.tab === 'map') {
    if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      setMapEditorMode('brush');
    } else if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      setMapEditorMode('building');
    } else if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      setMapEditorMode('entrance');
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      setMapEditorMode('rectangle');
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      setMapEditorMode('fill');
    } else if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      setMapEditorMode('eraser');
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      setMapEditorMode('select');
    } else if (e.key === 'Delete' && state.mapEditorSelectedBuilding >= 0) {
      e.preventDefault();
      removeBuilding(state.mapEditorSelectedBuilding);
    } else if (e.key === '0' && e.ctrlKey) {
      e.preventDefault();
      state.canvasScale = 1.0;
      state.canvasOffsetX = 0;
      state.canvasOffsetY = 0;
      drawMapCanvas();
    }
  }
});
