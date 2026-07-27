/**
 * sound-editor-render.js — 音效编辑器表单渲染
 *
 * 包含函数: renderDetail(), renderBGMForm(), renderSFXForm(),
 *           renderBindingsForm(), renderSettingsForm(), field(), escapeHTML()
 * 依赖: sound-editor-core.js (state, currentData, getSFXName, previewAudio, checkFileExists, escapeHTML)
 * 被 sound-editor-actions.js 的 bindFormEvents() 调用
 */

// ==================== 表单字段辅助 ====================
function field(name, label, value, opts = {}) {
  const { type = 'text', placeholder = '', step, min, max, options, rows } = opts;
  const id = 'field-' + name.replace(/\./g, '-');
  let html = `<div class="form-group"><label for="${id}">${escapeHTML(label)}</label>`;

  if (type === 'select' && options) {
    html += `<select id="${id}" data-field="${name}">`;
    for (const opt of options) {
      const optVal = typeof opt === 'string' ? opt : opt.value;
      const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.value);
      const selected = optVal === value ? ' selected' : '';
      html += `<option value="${escapeHTML(optVal)}"${selected}>${escapeHTML(optLabel)}</option>`;
    }
    html += '</select>';
  } else if (type === 'textarea') {
    html += `<textarea id="${id}" data-field="${name}" rows="${rows || 3}" placeholder="${placeholder}">${escapeHTML(String(value ?? ''))}</textarea>`;
  } else if (type === 'range') {
    html += `<div class="range-with-val">
      <input type="range" id="${id}" data-field="${name}" value="${value ?? 0}" min="${min ?? 0}" max="${max ?? 1}" step="${step ?? 0.01}">
      <span class="val">${Math.round((value ?? 0) * 100)}%</span>
    </div>`;
  } else if (type === 'checkbox') {
    html += `<input type="checkbox" id="${id}" data-field="${name}" ${value ? 'checked' : ''} style="width:auto">`;
  } else {
    html += `<input type="${type}" id="${id}" data-field="${name}" value="${escapeHTML(String(value ?? ''))}" placeholder="${placeholder}"`;
    if (step !== undefined) html += ` step="${step}"`;
    if (min !== undefined) html += ` min="${min}"`;
    if (max !== undefined) html += ` max="${max}"`;
    html += '>';
  }
  html += '</div>';
  return html;
}

// ==================== BGM 表单 ====================
function renderBGMForm(item) {
  if (!item) return '<div class="empty-state">请在左侧列表选择一项</div>';

  let html = '<div style="max-width:600px">';
  html += `<h3 style="margin:0 0 16px;font-size:15px;font-weight:600;">🎵 ${escapeHTML(item.name || '新BGM')}</h3>`;

  html += field('id', 'ID', item.id, { placeholder: 'bgm_main' });
  html += field('name', '名称', item.name, { placeholder: '主界面背景音乐' });

  // 文件路径 + 预览按钮
  html += '<div class="form-group"><label>文件路径</label>';
  html += '<div style="display:flex;gap:8px;">';
  html += `<input type="text" id="field-file" data-field="file" value="${escapeHTML(item.file || '')}" placeholder="assets/audio/bgm/main.mp3" style="flex:1">`;
  html += `<button class="btn-preview" onclick="event.preventDefault();previewAudio(document.getElementById('field-file').value);this.classList.add('playing');return false;" title="预览">▶</button>`;
  html += `<button class="btn-secondary btn-sm" onclick="event.preventDefault();stopPreview();return false;" title="停止">⏹</button>`;
  html += '</div>';
  html += `<span class="missing-badge" id="bgm-missing-${escapeHTML(item.id)}" style="display:none">⚠ 文件不存在</span>`;
  html += '</div>';

  html += field('volume', '音量', item.volume ?? 1.0, { type: 'range', min: 0, max: 1, step: 0.05 });
  html += field('loop', '循环播放', item.loop !== false, { type: 'checkbox' });

  // 异步检查文件是否存在
  if (item.file) {
    setTimeout(async () => {
      const exists = await checkFileExists(item.file);
      const badge = document.getElementById('bgm-missing-' + item.id);
      if (badge && !exists) badge.style.display = 'inline';
    }, 100);
  }

  html += '</div>';
  return html;
}

// ==================== SFX 表单 ====================
function renderSFXForm(item) {
  if (!item) return '<div class="empty-state">请在左侧列表选择一项</div>';

  let html = '<div style="max-width:600px">';
  html += `<h3 style="margin:0 0 16px;font-size:15px;font-weight:600;">🔔 ${escapeHTML(item.name || '新SFX')}</h3>`;

  html += field('id', 'ID', item.id, { placeholder: 'sfx_build' });
  html += field('name', '名称', item.name, { placeholder: '建造音效' });

  // 文件路径 + 预览
  html += '<div class="form-group"><label>文件路径</label>';
  html += '<div style="display:flex;gap:8px;">';
  html += `<input type="text" id="field-file" data-field="file" value="${escapeHTML(item.file || '')}" placeholder="assets/audio/sfx/build.wav" style="flex:1">`;
  html += `<button class="btn-preview" onclick="event.preventDefault();previewAudio(document.getElementById('field-file').value);this.classList.add('playing');return false;" title="预览">▶</button>`;
  html += `<button class="btn-secondary btn-sm" onclick="event.preventDefault();stopPreview();return false;" title="停止">⏹</button>`;
  html += '</div>';
  html += `<span class="missing-badge" id="sfx-missing-${escapeHTML(item.id)}" style="display:none">⚠ 文件不存在</span>`;
  html += '</div>';

  html += field('volume', '音量', item.volume ?? 0.8, { type: 'range', min: 0, max: 1, step: 0.05 });

  if (item.file) {
    setTimeout(async () => {
      const exists = await checkFileExists(item.file);
      const badge = document.getElementById('sfx-missing-' + item.id);
      if (badge && !exists) badge.style.display = 'inline';
    }, 100);
  }

  html += '</div>';
  return html;
}

// ==================== 事件绑定表单 ====================
function renderBindingsForm() {
  if (!state.data || !Array.isArray(state.data.eventBindings)) {
    return '<div class="empty-state">⚠ 无法加载事件绑定数据</div>';
  }

  // 构建 SFX 选项列表
  const sfxOptions = [{ value: '', label: '(无)' }];
  if (state.data.sfx) {
    for (const sfx of state.data.sfx) {
      sfxOptions.push({ value: sfx.id, label: sfx.name + ' (' + sfx.id + ')' });
    }
  }

  let html = '<div style="max-width:700px">';
  html += '<h3 style="margin:0 0 16px;font-size:15px;font-weight:600;">🔗 游戏事件 → 音效绑定</h3>';
  html += '<p style="font-size:12px;color:var(--muted);margin-bottom:16px;">选择每个游戏事件触发时播放的音效。设为"(无)"则不播放音效。</p>';

  html += '<table class="bindings-table"><thead><tr><th>游戏事件</th><th>说明</th><th>绑定音效</th></tr></thead><tbody>';

  for (const evt of KNOWN_GAME_EVENTS) {
    const binding = state.data.eventBindings.find(b => b.event === evt.event);
    const currentSound = binding ? (binding.sound || '') : '';

    html += '<tr>';
    html += `<td><span class="event-name">${escapeHTML(evt.event)}</span></td>`;
    html += `<td><span style="font-size:12px;color:var(--fg)">${escapeHTML(evt.desc)}</span></td>`;
    html += '<td>';
    html += `<select data-field="binding" data-event="${escapeHTML(evt.event)}" style="width:100%">`;
    for (const opt of sfxOptions) {
      const selected = opt.value === currentSound ? ' selected' : '';
      html += `<option value="${escapeHTML(opt.value)}"${selected}>${escapeHTML(opt.label)}</option>`;
    }
    html += '</select>';
    html += '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  html += '</div>';
  return html;
}

// ==================== 全局设置表单 ====================
function renderSettingsForm() {
  if (!state.data) return '<div class="empty-state">⚠ 数据未加载</div>';

  let html = '<div style="max-width:500px">';
  html += '<h3 style="margin:0 0 16px;font-size:15px;font-weight:600;">⚙️ 全局音频设置</h3>';
  html += '<p style="font-size:12px;color:var(--muted);margin-bottom:16px;">这些默认值在新游戏启动时生效。已保存的存档会覆盖此处的音量设置。</p>';

  html += field('masterVolume', '主音量', state.data.masterVolume ?? 0.8, { type: 'range', min: 0, max: 1, step: 0.05 });

  html += field('bgmVolume', '背景音乐音量', state.data.bgmVolume ?? 0.7, { type: 'range', min: 0, max: 1, step: 0.05 });

  html += field('sfxVolume', '音效音量', state.data.sfxVolume ?? 0.8, { type: 'range', min: 0, max: 1, step: 0.05 });

  html += '</div>';
  return html;
}

// ==================== BGM 绑定表单 ====================
function renderBGMBindingsForm(item) {
  if (!item) return '<div class="empty-state">请在左侧列表选择一项</div>';

  // 构建 BGM 选项列表
  const bgmOptions = [{ value: '', label: '(不切换)' }];
  if (state.data && Array.isArray(state.data.bgm)) {
    for (const bgm of state.data.bgm) {
      bgmOptions.push({ value: bgm.id, label: bgm.name + ' (' + bgm.id + ')' });
    }
  }

  // 构建事件选项列表
  const eventOptions = KNOWN_GAME_EVENTS.map(e => ({ value: e.event, label: e.event + ' — ' + e.desc }));

  // 时段选项
  const periodOptions = [
    { value: 'morning', label: '早上 (morning)' },
    { value: 'afternoon', label: '下午 (afternoon)' },
    { value: 'evening', label: '傍晚 (evening)' },
    { value: 'night', label: '夜晚 (night)' }
  ];

  let html = '<div style="max-width:600px">';
  html += `<h3 style="margin:0 0 16px;font-size:15px;font-weight:600;">🎵 BGM 事件绑定</h3>`;
  html += '<p style="font-size:12px;color:var(--muted);margin-bottom:16px;">当游戏事件触发时，自动切换到指定的背景音乐。可选时段过滤。</p>';

  html += field('event', '游戏事件', item.event || '', { type: 'select', options: eventOptions, placeholder: '选择事件...' });

  html += field('bgm', '切换 BGM', item.bgm || '', { type: 'select', options: bgmOptions });

  // 时段过滤（仅 periodChange 事件有意义）
  html += '<div class="form-group"><label>时段限定（可选）</label>';
  html += '<p style="font-size:11px;color:var(--muted);margin-bottom:4px;">仅当事件为 periodChange 时有效。留空 = 所有时段均触发。按住 Ctrl 多选。</p>';
  const selectedPeriods = item.periods || [];
  html += '<select id="field-periods" data-field="periods" multiple style="width:100%;height:90px">';
  for (const p of periodOptions) {
    const sel = selectedPeriods.includes(p.value) ? ' selected' : '';
    html += `<option value="${escapeHTML(p.value)}"${sel}>${escapeHTML(p.label)}</option>`;
  }
  html += '</select>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ==================== renderDetail 调度器 ====================
function renderDetail() {
  const panel = document.getElementById('detailPanel');
  if (!panel) return;

  if (state.tab === 'settings') {
    panel.innerHTML = renderSettingsForm();
    if (typeof bindFormEvents === 'function') bindFormEvents();
    return;
  }

  if (state.tab === 'bindings') {
    panel.innerHTML = renderBindingsForm();
    if (typeof bindFormEvents === 'function') bindFormEvents();
    return;
  }

  if (state.tab === 'bgmbindings') {
    if (state.selectedIdx < 0) {
      panel.innerHTML = '<div class="empty-state">📂 请从左侧列表选择一项<br><span style="font-size:12px;color:var(--muted)">或点击 ＋ 新增</span></div>';
      return;
    }
    const data = currentData();
    if (!data || state.selectedIdx >= data.length) { panel.innerHTML = ''; return; }
    panel.innerHTML = renderBGMBindingsForm(data[state.selectedIdx]);
    if (typeof bindFormEvents === 'function') bindFormEvents();
    return;
  }

  if (state.selectedIdx < 0) {
    panel.innerHTML = '<div class="empty-state">📂 请从左侧列表选择一项<br><span style="font-size:12px;color:var(--muted)">或点击 ＋ 新增</span></div>';
    return;
  }

  const data = currentData();
  if (!data || state.selectedIdx >= data.length) {
    panel.innerHTML = '';
    return;
  }

  const item = data[state.selectedIdx];
  let html = '';
  switch (state.tab) {
    case 'bgm': html = renderBGMForm(item); break;
    case 'sfx': html = renderSFXForm(item); break;
    default: html = '';
  }

  panel.innerHTML = html;
  if (typeof bindFormEvents === 'function') bindFormEvents();
}
