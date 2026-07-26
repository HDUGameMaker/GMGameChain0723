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
  const isBuildingBindings = (tab === 'buildingBindings');
  ['btnAdd', 'btnDup', 'btnDel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = (isSingleton || isBindings || isBuildingBindings) ? 'none' : '';
    }
  });

  // 设置 tab 和 buildingBindings 隐藏列表
  const listPanel = document.getElementById('listPanel');
  if (tab === 'buildingBindings') {
    listPanel.style.display = '';
    document.getElementById('detailPanel').style.flex = '';
  }

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

  // 绑定建筑音效绑定的下拉框
  panel.querySelectorAll('select[data-building]').forEach(el => {
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('change', () => {
      const buildingId = clone.dataset.building;
      const soundKey = clone.dataset.soundKey;
      const soundId = clone.value || null;

      if (!state.data.buildingSoundBindings) state.data.buildingSoundBindings = { default: {} };
      if (!state.data.buildingSoundBindings[buildingId]) {
        state.data.buildingSoundBindings[buildingId] = {};
      }

      state.data.buildingSoundBindings[buildingId][soundKey] = soundId;
      markDirty();
    });
  });

  // 绑定物品合成音效绑定的下拉框
  panel.querySelectorAll('select[data-item]').forEach(el => {
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('change', () => {
      const itemId = clone.dataset.item;
      const soundKey = clone.dataset.soundKey;
      const soundId = clone.value || null;

      if (!state.data.itemSoundBindings) state.data.itemSoundBindings = { default: {} };
      if (!state.data.itemSoundBindings[itemId]) {
        state.data.itemSoundBindings[itemId] = {};
      }

      state.data.itemSoundBindings[itemId][soundKey] = soundId;
      markDirty();
    });
  });
}

// 删除建筑音效绑定
function removeBuildingSoundBinding(buildingId) {
  if (!confirm(`确定要删除建筑 "${buildingId}" 的自定义音效吗？`)) return;
  if (state.data.buildingSoundBindings && state.data.buildingSoundBindings[buildingId]) {
    delete state.data.buildingSoundBindings[buildingId];
    state.selectedBuilding = 'default';
    markDirty();
    refreshList();
    renderDetail();
  }
}

// 还原物品合成音效为默认
function restoreItemSoundToDefault(itemId) {
  if (!confirm(`确定要将物品 "${itemId}" 的合成音效还原为默认配置吗？`)) return;
  if (state.data.itemSoundBindings && state.data.itemSoundBindings.default) {
    state.data.itemSoundBindings[itemId] = { ...state.data.itemSoundBindings.default };
    markDirty();
    refreshList();
    renderDetail();
  }
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

// ==================== 动态预览函数 ====================

/**
 * 预览建筑音效（动态获取当前选中的音效）
 * @param {string} buildingId - 建筑 ID
 * @param {string} soundKey - 音效键（click, buildStart, buildComplete, demolish, upgrade, move）
 * @param {HTMLElement} btn - 预览按钮元素
 */
function previewBuildingSound(buildingId, soundKey, btn) {
  // 从 select 元素获取当前选中的音效 ID
  const selectEl = document.querySelector(`select[data-building="${buildingId}"][data-sound-key="${soundKey}"]`);
  if (!selectEl) {
    showToast('未找到音效选择器', 'error');
    return;
  }

  const soundId = selectEl.value;
  if (!soundId) {
    showToast('请先选择一个音效', 'warn');
    return;
  }

  // 根据音效 ID 查找文件路径
  const sfxConfig = state.data && state.data.sfx ? state.data.sfx.find(s => s.id === soundId) : null;
  if (!sfxConfig || !sfxConfig.file) {
    showToast('音效文件路径不存在', 'error');
    return;
  }

  togglePreviewAudio(sfxConfig.file, btn);
}

/**
 * 预览事件绑定音效（动态获取当前选中的音效）
 * @param {string} eventName - 事件名称
 * @param {HTMLElement} btn - 预览按钮元素
 */
function previewBindingSound(eventName, btn) {
  // 从 select 元素获取当前选中的音效 ID
  const selectEl = document.querySelector(`select[data-field="binding"][data-event="${eventName}"]`);
  if (!selectEl) {
    showToast('未找到音效选择器', 'error');
    return;
  }

  const soundId = selectEl.value;
  if (!soundId) {
    showToast('请先选择一个音效', 'warn');
    return;
  }

  // 根据音效 ID 查找文件路径
  const sfxConfig = state.data && state.data.sfx ? state.data.sfx.find(s => s.id === soundId) : null;
  if (!sfxConfig || !sfxConfig.file) {
    showToast('音效文件路径不存在', 'error');
    return;
  }

  togglePreviewAudio(sfxConfig.file, btn);
}

/**
 * 预览物品合成音效（动态获取当前选中的音效）
 * @param {string} itemId - 物品 ID
 * @param {string} soundKey - 音效键（synthesisStart, synthesisComplete）
 * @param {HTMLElement} btn - 预览按钮元素
 */
function previewItemSound(itemId, soundKey, btn) {
  // 从 select 元素获取当前选中的音效 ID
  const selectEl = document.querySelector(`select[data-item="${itemId}"][data-sound-key="${soundKey}"]`);
  if (!selectEl) {
    showToast('未找到音效选择器', 'error');
    return;
  }

  const soundId = selectEl.value;
  if (!soundId) {
    showToast('请先选择一个音效', 'warn');
    return;
  }

  // 根据音效 ID 查找文件路径
  const sfxConfig = state.data && state.data.sfx ? state.data.sfx.find(s => s.id === soundId) : null;
  if (!sfxConfig || !sfxConfig.file) {
    showToast('音效文件路径不存在', 'error');
    return;
  }

  togglePreviewAudio(sfxConfig.file, btn);
}
