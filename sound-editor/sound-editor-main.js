/**
 * sound-editor-main.js — DOM 事件监听 + 键盘快捷键
 *
 * 包含: 所有事件监听器注册（侧栏 Tab 切换、顶栏按钮、工具栏操作、键盘快捷键）
 * 依赖: 所有上述文件（core + render + actions），最后加载
 */

// ==================== 侧栏 Tab 切换 ====================
document.querySelectorAll('.sidebar nav a').forEach(a => {
  a.addEventListener('click', () => switchTab(a.dataset.tab));
});

// ==================== 顶栏按钮 ====================
document.getElementById('btnSelectDir').addEventListener('click', selectDir);

document.getElementById('btnToggleAuto').addEventListener('click', function () {
  state.autoSave = !state.autoSave;
  this.textContent = state.autoSave ? '🔄 自动保存' : '💾 手动保存';

  const saveBtn = document.getElementById('btnSave');
  saveBtn.style.display = state.autoSave ? 'none' : '';

  if (!state.autoSave && state.saveTimer) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    updateSaveStatus();
  }
});

document.getElementById('btnSave').addEventListener('click', () => doSave());

// ==================== 工具栏按钮 ====================
document.getElementById('btnAdd').addEventListener('click', addItem);
document.getElementById('btnDup').addEventListener('click', duplicateItem);
document.getElementById('btnDel').addEventListener('click', deleteItem);

// ==================== 键盘快捷键 ====================
document.addEventListener('keydown', (e) => {
  // Ctrl+S: 手动保存
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (!state.autoSave) doSave();
  }

  // Ctrl+D: 复制
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault();
    const tab = state.tab;
    if (tab === 'bgm' || tab === 'sfx' || tab === 'bgmbindings') duplicateItem();
  }

  // Delete: 删除
  if (e.key === 'Delete') {
    const tab = state.tab;
    if (tab === 'bgm' || tab === 'sfx' || tab === 'bgmbindings') {
      e.preventDefault();
      deleteItem();
    }
  }

  // N: 新增
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
    const tab = state.tab;
    if (tab === 'bgm' || tab === 'sfx' || tab === 'bgmbindings') {
      // 确保焦点不在 input 上
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
      e.preventDefault();
      addItem();
    }
  }
});
