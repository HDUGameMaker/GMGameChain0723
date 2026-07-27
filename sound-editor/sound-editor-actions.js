/**
 * sound-editor-actions.js — CRUD + Tab 切换 + 表单事件绑定
 *
 * 包含函数: addItem(), duplicateItem(), deleteItem(), getDefaultItem(),
 *           switchTab(), bindFormEvents(), applyFieldChange()
 * 依赖: sound-editor-core.js (state, currentData, markDirty, refreshList, selectItem, showToast)
 *        sound-editor-render.js (renderDetail)
 * 被 sound-editor-main.js 的事件监听调用
 */

// ==================== CRUD ====================
function addItem() {
  const data = currentData();
  if (!data) return;

  const newItem = getDefaultItem();
  data.push(newItem);
  state.selectedIdx = data.length - 1;
  markDirty();
  refreshList();
  renderDetail();
}

function duplicateItem() {
  const data = currentData();
  if (!data || state.selectedIdx < 0 || state.selectedIdx >= data.length) return;

  const item = data[state.selectedIdx];
  const clone = JSON.parse(JSON.stringify(item));
  clone.id = clone.id + '_copy';
  clone.name = (clone.name || '') + ' (副本)';
  data.push(clone);
  state.selectedIdx = data.length - 1;
  markDirty();
  refreshList();
  renderDetail();
}

function deleteItem() {
  const data = currentData();
  if (!data || state.selectedIdx < 0 || state.selectedIdx >= data.length) return;

  const item = data[state.selectedIdx];
  if (!confirm('确定要删除「' + itemDisplayName(item) + '」吗？此操作不可撤销。')) return;

  data.splice(state.selectedIdx, 1);
  if (state.selectedIdx >= data.length) state.selectedIdx = data.length - 1;
  markDirty();
  refreshList();
  renderDetail();
}

function getDefaultItem() {
  switch (state.tab) {
    case 'bgm':
      return {
        id: 'bgm_new',
        name: '新背景音乐',
        file: 'assets/audio/bgm/',
        volume: 1.0,
        loop: true
      };
    case 'sfx':
      return {
        id: 'sfx_new',
        name: '新音效',
        file: 'assets/audio/sfx/',
        volume: 0.8
      };
    case 'bgmbindings':
      return {
        event: '',
        bgm: '',
        periods: []
      };
    default:
      return {};
  }
}

// ==================== Tab 切换 ====================
function switchTab(tab) {
  stopPreview(); // 切换 tab 时停止预览

  state.tab = tab;
  state.selectedIdx = -1;

  // 更新侧栏
  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
  const target = document.querySelector(`[data-tab="${tab}"]`);
  if (target) target.classList.add('active');

  // 更新标题
  document.getElementById('tabTitle').textContent = `${tabTitles[tab]} — ${tabFiles[tab]}`;

  // 更新列表标题
  document.getElementById('listHeader').textContent = tabTitles[tab] + '列表';

  // 控制工具栏按钮
  const isSingleton = (tab === 'settings');
  const isBindings = (tab === 'bindings');
  const isBGMBindings = (tab === 'bgmbindings');
  ['btnAdd', 'btnDup', 'btnDel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = (isSingleton || isBindings) ? 'none' : '';
    }
  });

  // 设置 tab 隐藏列表
  const listPanel = document.getElementById('listPanel');

  refreshList();
  renderDetail();
}

// ==================== 表单事件绑定 ====================
function bindFormEvents() {
  const panel = document.getElementById('detailPanel');
  if (!panel) return;

  // 绑定文本/数字/下拉框的 change 事件
  panel.querySelectorAll('input[data-field]:not([type="range"]):not([type="checkbox"]), select[data-field]:not([data-event]), textarea[data-field]').forEach(el => {
    // 移除旧监听器(通过克隆节点)
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('change', () => applyFieldChange(clone));
    clone.addEventListener('blur', () => applyFieldChange(clone));
  });

  // 绑定 range 滑块的实时更新
  panel.querySelectorAll('input[type="range"][data-field]').forEach(el => {
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('input', () => {
      // 更新显示值
      const valSpan = clone.parentNode.querySelector('.val');
      if (valSpan) {
        valSpan.textContent = Math.round(parseFloat(clone.value) * 100) + '%';
      }
      applyFieldChange(clone);
    });
  });

  // 绑定 checkbox
  panel.querySelectorAll('input[type="checkbox"][data-field]').forEach(el => {
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('change', () => applyFieldChange(clone));
  });

  // 绑定 multi-select（periods 等）
  panel.querySelectorAll('select[multiple][data-field]').forEach(el => {
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('change', () => applyFieldChange(clone));
  });

  // 绑定事件绑定表的下拉框
  panel.querySelectorAll('select[data-event]').forEach(el => {
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('change', () => {
      const eventName = clone.dataset.event;
      const soundId = clone.value || null;

      if (!state.data.eventBindings) state.data.eventBindings = [];

      const existing = state.data.eventBindings.find(b => b.event === eventName);
      if (existing) {
        existing.sound = soundId;
      } else {
        state.data.eventBindings.push({ event: eventName, sound: soundId });
      }

      markDirty();
      refreshList();
    });
  });
}

function applyFieldChange(el) {
  if (state.tab === 'settings') {
    // 全局设置直接在 state.data 上修改
    const fieldName = el.dataset.field;
    let value = el.value;

    if (el.type === 'range' || el.type === 'number') {
      value = parseFloat(value);
    } else if (el.type === 'checkbox') {
      value = el.checked;
    } else if (el.multiple) {
      value = Array.from(el.selectedOptions).map(o => o.value);
    }

    state.data[fieldName] = value;
    markDirty();
    return;
  }

  // 列表项字段修改
  const data = currentData();
  if (!data || state.selectedIdx < 0 || state.selectedIdx >= data.length) return;

  const item = data[state.selectedIdx];
  const fieldName = el.dataset.field;
  let value = el.value;

  if (el.type === 'range' || el.type === 'number') {
    value = parseFloat(value);
  } else if (el.type === 'checkbox') {
    value = el.checked;
  } else if (el.multiple) {
    value = Array.from(el.selectedOptions).map(o => o.value);
  }

  // 支持嵌套字段（如 'labelLayout.offsetY'）
  const parts = fieldName.split('.');
  if (parts.length === 1) {
    item[fieldName] = value;
  } else {
    let obj = item;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
  }

  markDirty();
}
