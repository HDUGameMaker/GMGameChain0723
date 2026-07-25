/**
 * planner-config-render.js — 表单渲染：renderDetail 调度器 + 6 个 Tab 的表单渲染函数
 *
 * 包含: renderDetail, field, subListEditor, escapeHTML,
 *       renderBuildingForm, renderResourceForm, renderItemForm,
 *       renderEventForm, renderRegionForm, renderMapForm
 *
 * 依赖: planner-config-core.js (state, currentData, resSelect*, bldSelect, itemSelect*)
 * 被 planner-config-forms.js (bindFormEvents), planner-config-main.js 调用
 */

/* ═══════════════════════════════════════════
   Detail rendering — per tab
   ═══════════════════════════════════════════ */
function renderDetail() {
  const panel = document.getElementById('detailPanel');
  // 分析页签在 switchTab 中直接渲染，此处跳过
  if (state.tab === 'analysis') return;
  if (state.selectedIdx < 0) {
    panel.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>从左侧列表选择一个项目进行编辑</p><p style="font-size:12px;margin-top:4px;opacity:0.6">或点击「+ 新增」创建新条目</p></div>`;
    return;
  }

  const data = currentData();
  if (!data || state.selectedIdx >= data.length) { panel.innerHTML = ''; return; }
  const item = data[state.selectedIdx];

  let html = '';
  switch(state.tab) {
    case 'buildings': html = renderBuildingForm(item); break;
    case 'resources': html = renderResourceForm(item); break;
    case 'items':     html = renderItemForm(item); break;
    case 'events':    html = renderEventForm(item); break;
    case 'expeditions': html = renderRegionForm(item); break;
    case 'map':       html = renderMapForm(); break;
    case 'analysis':  html = renderAnalysisPanel(); break;
  }
  panel.innerHTML = html;
  bindFormEvents();
}

function field(name, label, value, opts = {}) {
  const { type = 'text', placeholder = '', rows, options, optionLabels, full } = opts;
  const cls = full ? 'form-group full' : 'form-group';
  let input;
  if (type === 'textarea') {
    input = `<textarea id="f_${name}" data-field="${name}" rows="${rows || 2}" placeholder="${placeholder}">${escapeHTML(String(value ?? ''))}</textarea>`;
  } else if (type === 'checkbox') {
    input = `<input type="checkbox" id="f_${name}" data-field="${name}" ${value ? 'checked' : ''} />`;
  } else if (type === 'select' && options) {
    const labels = optionLabels || {};
    input = `<select id="f_${name}" data-field="${name}">${options.map(o => `<option value="${o}" ${String(value)===o?'selected':''}>${labels[o] || o}</option>`).join('')}</select>`;
  } else if (type === 'number') {
    input = `<input type="number" id="f_${name}" data-field="${name}" value="${value ?? 0}" placeholder="${placeholder}" />`;
  } else {
    input = `<input type="text" id="f_${name}" data-field="${name}" value="${escapeHTML(String(value ?? ''))}" placeholder="${placeholder}" />`;
  }
  return `<div class="${cls}"><label for="f_${name}">${label}</label>${input}</div>`;
}

function subListEditor(name, label, entries, entryTemplate, opts = {}) {
  const { columns = '1fr 1fr', headers } = opts;
  let html = `<div class="section-title">${label}</div>
    <div class="sub-list" id="sl_${name}">`;
  (entries || []).forEach((entry, i) => {
    html += `<div class="sub-row" data-subidx="${i}">${entryTemplate(entry, i)}<button class="btn-icon btn-sm sub-del" title="删除">×</button></div>`;
  });
  html += `<div class="add-row"><button class="btn-secondary btn-sm sub-add" data-sub="${name}">+ 添加</button></div>`;
  html += `</div>`;
  return html;
}

function escapeHTML(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderBuildingForm(b) {
  let html = '<div class="form-row span-3">';
  html += field('id', 'ID', b.id, { placeholder: 'work_shed' });
  html += field('name', '名称', b.name, { placeholder: '工棚' });
  html += field('icon', '图标', b.icon, { placeholder: 'icon_xxx.png' });
  html += '</div>';

  html += '<div class="form-row">';
  html += field('mapIcon', '地图精灵', b.mapIcon, { placeholder: 'assets/buildings/map_xxx.png', full: true });
  html += field('imageDetail', '详情图', b.imageDetail, { placeholder: 'assets/buildings/detail_xxx.png', full: true });
  html += '</div>';

  // mapIconLayout
  html += '<div class="section-title">精灵图布局 (mapIconLayout)</div>';
  html += '<div class="form-row span-3">';
  html += field('iconLayout_scaleX', '缩放X', b.mapIconLayout?.scaleX ?? 1.0, { type: 'number', step: '0.05' });
  html += field('iconLayout_scaleY', '缩放Y', b.mapIconLayout?.scaleY ?? 1.0, { type: 'number', step: '0.05' });
  html += '</div>';
  html += '<div class="form-row span-3">';
  html += field('iconLayout_offsetX', '水平偏移', b.mapIconLayout?.offsetX ?? 0, { type: 'number' });
  html += field('iconLayout_offsetY', '垂直偏移', b.mapIconLayout?.offsetY ?? 0, { type: 'number' });
  html += '</div>';

  // Animation config
  html += '<div class="section-title">序列帧动画 (animation)</div>';
  html += '<div class="form-row">';
  html += field('anim_spriteSheet', '精灵图路径', b.animation?.spriteSheet || '', { placeholder: 'assets/buildings/anim_xxx.png', full: true });
  html += '</div>';
  html += '<div class="form-row span-3">';
  html += field('anim_frameCount', '帧数', b.animation?.frameCount ?? 8, { type: 'number' });
  html += field('anim_fps', '播放帧率', b.animation?.fps ?? 8, { type: 'number' });
  html += field('anim_pingpong', '乒乓循环', b.animation?.pingpong ?? false, { type: 'checkbox' });
  html += '</div>';
  html += '<div class="form-row span-3">';
  html += field('anim_frameWidth', '单帧宽度(px)', b.animation?.frameWidth ?? '', { type: 'number', placeholder: '用于缩放计算' });
  html += field('anim_frameHeight', '单帧高度(px)', b.animation?.frameHeight ?? '', { type: 'number', placeholder: '用于缩放计算' });
  html += '</div>';
  html += '<p style="font-size:11px;color:var(--muted);margin-bottom:8px">💡 填写 spriteSheet 和 frameCount 即可启用地图动画。乒乓模式让动画往复播放，消除首尾帧跳跃。</p>';

  // Detail animation config
  html += '<div class="section-title">详情图动画 (detailAnimation)</div>';
  html += '<div class="form-row span-3">';
  html += field('danim_frameCount', '帧数', b.detailAnimation?.frameCount ?? '', { type: 'number', placeholder: '留空=静态图' });
  html += field('danim_fps', '播放帧率', b.detailAnimation?.fps ?? 6, { type: 'number' });
  html += field('danim_pingpong', '乒乓循环', b.detailAnimation?.pingpong ?? true, { type: 'checkbox' });
  html += '</div>';
  html += '<div class="form-row span-3">';
  html += field('danim_frameWidth', '单帧宽度(px)', b.detailAnimation?.frameWidth ?? 1024, { type: 'number' });
  html += field('danim_frameHeight', '单帧高度(px)', b.detailAnimation?.frameHeight ?? 1024, { type: 'number' });
  html += '</div>';
  html += '<p style="font-size:11px;color:var(--muted);margin-bottom:8px">💡 详情图动画使用 imageDetail 作为精灵图，通过 CSS background-position 驱动。填写帧数即可启用，不依赖 PixiJS。</p>';

  html += '<div class="form-group full"><label for="f_description">描述</label>';
  html += `<textarea id="f_description" data-field="description" rows="2">${escapeHTML(b.description || '')}</textarea></div>`;

  html += '<div class="form-row span-3">';
  html += field('footprintWidth', '占地宽', b.footprint?.width ?? 1, { type: 'number' });
  html += field('footprintHeight', '占地高', b.footprint?.height ?? 1, { type: 'number' });
  html += field('buildTime', '建造时间(轮)', b.buildTime ?? 1, { type: 'number' });
  html += '</div>';

  html += '<div class="form-row span-3">';
  html += field('housingCapacity', '人口容量', b.housingCapacity, { type: 'number', placeholder: '无' });
  html += field('foodCapacity', '食物容量', b.foodCapacity, { type: 'number', placeholder: '无' });
  html += field('maxWorkers', '最大工人', b.maxWorkers ?? 0, { type: 'number' });
  html += '</div>';

  html += '<div class="form-row span-3">';
  html += field('maxCount', '最大数量', b.maxCount, { type: 'number', placeholder: 'null=无限' });
  html += field('storageMultiplier', '存储倍率', b.storageMultiplier, { type: 'number', placeholder: '无' });
  html += '</div>';

  html += '<div class="form-row span-3">';
  html += field('upgradesFrom', '升级来源', b.upgradesFrom, { type: 'select', options: ['', ...state.data.buildings.map(bld => bld.id)], optionLabels: {'': '(无)', ...Object.fromEntries(state.data.buildings.map(bld => [bld.id, bld.name+' ('+bld.id+')']))} });
  html += field('upgradesTo', '升级目标', b.upgradesTo, { type: 'select', options: ['', ...state.data.buildings.map(bld => bld.id)], optionLabels: {'': '(无)', ...Object.fromEntries(state.data.buildings.map(bld => [bld.id, bld.name+' ('+bld.id+')']))} });
  html += field('allowedGrounds', '允许地形', (b.allowedGrounds || []).join(','), { placeholder: 'G,F' });
  html += '</div>';

  html += '<div class="form-row">';
  html += field('initialBuilding', '初始建筑', b.initialBuilding, { type: 'checkbox' });
  html += field('demolishable', '可拆除', b.demolishable !== false, { type: 'checkbox' });
  html += field('draggable', '可拖动', b.draggable !== false, { type: 'checkbox' });
  html += '</div>';

  // buildCost
  html += subListEditor('buildCost', '建造成本', b.buildCost || [], (c, i) =>
    `${resSelectSub(i, c.resourceId)}
     <input class="amount" data-subidx="${i}" data-key="amount" type="number" value="${c.amount||0}" placeholder="数量" />`
  );

  // upgradeCost
  if (b.upgradeCost) {
    html += subListEditor('upgradeCost', '升级成本', b.upgradeCost, (c, i) =>
      `${resSelectSub(i, c.resourceId)}
       <input class="amount" data-subidx="${i}" data-key="amount" type="number" value="${c.amount||0}" placeholder="数量" />`
    );
  }

  // Production
  if (b.production) {
    html += '<div class="section-title">生产配置</div>';
    html += `<div class="form-row">${field('prod_perWorker', '按工人', b.production.perWorker, { type: 'checkbox' })}</div>`;
    html += subListEditor('prodInput', '生产输入', b.production.input || [], (c, i) =>
      `${resSelectSub(i, c.resourceId)}
       <input class="amount" data-subidx="${i}" data-key="amount" type="number" value="${c.amount||0}" placeholder="数量" />`
    );
    html += subListEditor('prodOutput', '生产输出', b.production.output || [], (c, i) =>
      `${resSelectSub(i, c.resourceId)}
       <input class="amount" data-subidx="${i}" data-key="amount" type="number" value="${c.amount||0}" placeholder="数量" />`
    );
  }

  // Synthesis recipes
  if (b.synthesisRecipes && b.synthesisRecipes.length > 0) {
    html += '<div class="section-title">合成配方</div>';
    b.synthesisRecipes.forEach((r, ri) => {
      html += `<div style="border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:8px"><strong>${r.name || r.id}</strong>`;
      html += `<div class="form-row span-3">${field('recipe_'+ri+'_id', '配方ID', r.id)}${field('recipe_'+ri+'_workTicks', '工时', r.workTicks, {type:'number'})}
        <div class="form-group"><label>产出物品</label>${itemSelectSub(ri, r.output?.itemId || '')}</div></div>`;
      html += subListEditor('recipe_'+ri+'_cost', '资源消耗', r.resourceCost || [], (c, i) =>
        `${resSelectSub(i, c.resourceId)}
         <input class="amount" data-subidx="${i}" data-key="amount" type="number" value="${c.amount||0}" placeholder="数量" />`
      );
      html += '</div>';
    });
  }

  // labelLayout
  html += '<div class="section-title">标签布局</div>';
  html += '<div class="form-row span-3">';
  html += field('ll_nameOffsetY', '名称偏移Y', b.labelLayout?.nameOffsetY ?? 0, { type: 'number' });
  html += field('ll_progressBarOffsetY', '进度条偏移Y', b.labelLayout?.progressBarOffsetY ?? 0, { type: 'number' });
  html += field('ll_workersOffsetY', '工人偏移Y', b.labelLayout?.workersOffsetY ?? 0, { type: 'number' });
  html += '</div>';

  // --- 火把配置 ---
  html += '<div class="form-row">';
  html += '<div class="form-group"><label><input type="checkbox" id="f_isTorch" data-field="isTorch" ' + (b.isTorch ? 'checked' : '') + ' /> 是火把（照明建筑）</label></div>';
  html += '</div>';

  // 火把特有字段（默认隐藏，isTorch 勾选后显示）
  html += '<div id="torchFields" style="display:' + (b.isTorch ? 'block' : 'none') + ';">';

  html += '<div class="section-title">🔥 火把属性</div>';
  html += '<div class="form-row span-3">';
  html += field('torchType', '火把类型', b.torchType || 'normal', {
    type: 'select',
    options: ['normal', 'eternal'],
    optionLabels: { normal: '普通（需燃料）', eternal: '永恒（无需燃料）' }
  });
  html += field('radius', '照明半径(格)', b.radius ?? 3, { type: 'number' });
  html += field('coalPerPeriod', '每轮燃料消耗', b.coalPerPeriod ?? 0, { type: 'number' });
  html += '</div>';

  html += '<div class="form-row span-3">';
  html += field('coalBuffer', '初始燃料', b.coalBuffer ?? 0, { type: 'number' });
  html += '<div class="form-group"><label for="f_colorHint">火光颜色</label><input type="color" id="f_colorHint" data-field="colorHint" value="'
    + escapeHTML(b.colorHint || '#ff8800') + '" style="width:60px;height:32px;padding:2px" /></div>';
  html += '<div></div>';
  html += '</div>';

  // 点亮成本
  html += subListEditor('lightCost', '点亮成本', b.lightCost || [], function(c, i) {
    return '' + resSelectSub(i, c.resourceId)
      + '<input class="amount" data-subidx="' + i + '" data-key="amount" type="number" value="' + (c.amount || 0) + '" placeholder="数量" />';
  });

  html += '</div>'; // end torchFields

  return html;
}

function renderResourceForm(r) {
  let html = '<div class="form-row">';
  html += field('id', 'ID', r.id);
  html += field('name', '名称', r.name);
  html += '</div>';
  html += '<div class="form-row span-3">';
  html += field('initial', '初始值', r.initial, { type: 'number' });
  html += field('max', '上限', r.max, { type: 'number' });
  html += field('icon', '图标', r.icon, { placeholder: 'resource_xxx.png' });
  html += '</div>';
  html += '<div class="form-row">';
  html += field('showInHUD', 'HUD显示', r.showInHUD, { type: 'checkbox' });
  html += field('rare', '稀有', r.rare, { type: 'checkbox' });
  html += '</div>';
  return html;
}

function renderItemForm(item) {
  let html = '<div class="form-row span-3">';
  html += field('id', 'ID', item.id);
  html += field('name', '名称', item.name);
  html += field('icon', '图标', item.icon, { placeholder: 'item_xxx.png' });
  html += '</div>';
  html += '<div class="form-group full"><label for="f_description">描述</label>';
  html += `<textarea id="f_description" data-field="description" rows="2">${escapeHTML(item.description || '')}</textarea></div>`;
  html += '<div class="form-row span-3">';
  html += field('capacityCost', '容量消耗', item.capacityCost ?? 0, { type: 'number' });
  html += field('unique', '唯一', item.unique, { type: 'checkbox' });
  html += field('consumable', '消耗品', item.consumable, { type: 'checkbox' });
  html += '</div>';

  // expeditionEffects
  html += '<div class="section-title">探险效果</div>';
  html += `<div class="sub-list" id="sl_expEffects">`;
  (item.expeditionEffects || []).forEach((ef, i) => {
    html += `<div class="sub-row" data-subidx="${i}">
      <select data-subidx="${i}" data-key="type">
        <option value="resource_capacity_bonus" ${ef.type==='resource_capacity_bonus'?'selected':''}>资源容量加成</option>
        <option value="yield_multiplier" ${ef.type==='yield_multiplier'?'selected':''}>产出倍率</option>
        <option value="yield_flat_bonus" ${ef.type==='yield_flat_bonus'?'selected':''}>产出固定加成</option>
      </select>
      <input class="amount" data-subidx="${i}" data-key="value" type="number" value="${ef.value||0}" placeholder="值" step="0.1" />
      ${resSelectSub(i, ef.resourceId||'')}
      <input class="amount" data-subidx="${i}" data-key="regions" value="${(ef.regions||[]).join(',')}" placeholder="区域(逗号分隔)" />
      <button class="btn-icon btn-sm sub-del" title="删除">×</button>
    </div>`;
  });
  html += `<div class="add-row"><button class="btn-secondary btn-sm sub-add" data-sub="expEffects">+ 添加效果</button></div></div>`;
  return html;
}

function renderEventForm(ev) {
  let html = '<div class="form-row span-3">';
  html += field('id', 'ID', ev.id);
  html += field('name', '名称', ev.name);
  html += field('image', '图片', ev.image, { placeholder: 'event_xxx.png' });
  html += '</div>';
  html += '<div class="form-group full"><label for="f_description">描述</label>';
  html += `<textarea id="f_description" data-field="description" rows="3">${escapeHTML(ev.description || '')}</textarea></div>`;

  html += '<div class="form-row span-3">';
  html += field('priority', '优先级', ev.priority ?? 0, { type: 'number' });
  html += field('probability', '概率', ev.probability ?? 1, { type: 'number', placeholder: '0-1' });
  html += field('cooldownTicks', '冷却(轮)', ev.cooldownTicks ?? 0, { type: 'number' });
  html += '</div>';
  html += '<div class="form-row span-3">';
  html += field('mutexGroup', '互斥组', ev.mutexGroup, { placeholder: 'null=无' });
  html += field('maxTriggers', '最大触发次数', ev.maxTriggers, { type: 'number', placeholder: 'null=无限' });
  html += '</div>';

  // Trigger conditions
  html += '<div class="section-title">触发条件</div>';
  const tc = ev.triggerConditions || {};
  html += `<div class="form-group full"><label>时段（逗号分隔: morning,afternoon,evening,night）</label>
    <input type="text" id="f_tcPeriods" data-field="tcPeriods" value="${(tc.timePeriods||[]).join(',')}" /></div>`;
  html += '<div class="form-row">';
  html += field('tcItems', '需要物品(逗号分隔)', (tc.requiredItems||[]).join(','), { full: true });
  html += field('tcBuildings', '需要建筑(逗号分隔)', (tc.requiredBuildings||[]).join(','), { full: true });
  html += '</div>';
  // 探险事件专属触发条件
  html += '<div class="section-title" style="color:#b87a14">🗺️ 探险事件专属条件</div>';
  html += '<div class="form-row">';
  html += field('tcRegions', '区域限制(逗号分隔区域ID)', (tc.regions||[]).join(','), { full: true, placeholder: '留空=仅基地事件' });
  html += field('tcCarriedItems', '需携带物品(逗号分隔)', (tc.requiredCarriedItems||[]).join(','), { full: true, placeholder: '探险背包中必须携带的物品' });
  html += '</div>';

  // Invalidation conditions
  html += '<div class="section-title">失效条件</div>';
  const ic = ev.invalidationConditions || {};
  html += '<div class="form-row">';
  html += field('icItems', '需要物品(逗号分隔)', (ic.requiredItems||[]).join(','), { full: true });
  html += field('icBuildings', '需要建筑(逗号分隔)', (ic.requiredBuildings||[]).join(','), { full: true });
  html += '</div>';

  // Effects
  html += '<div class="section-title">事件效果</div>';
  html += subListEditor('effects', '效果列表', ev.effects || [], (ef, i) => {
    let typeOpts = ['add_resource','consume_resource','obtain_item','consume_item','unlock_building','trigger_event','schedule_event']
      .map(t => `<option value="${t}" ${ef.type===t?'selected':''}>${t}</option>`).join('');
    return `<select data-subidx="${i}" data-key="type" style="flex:1">${typeOpts}</select>
      ${resSelectSub(i, ef.resourceId||'')}
      <input class="amount" data-subidx="${i}" data-key="amount" type="number" value="${ef.amount||0}" placeholder="数量" />
      <input class="amount" data-subidx="${i}" data-key="eventId" value="${escapeHTML(ef.eventId||'')}" placeholder="事件ID" />
      <input class="amount" data-subidx="${i}" data-key="itemId" value="${escapeHTML(ef.itemId||'')}" placeholder="物品ID" />`;
  });

  // Options
  html += '<div class="section-title">选项</div>';
  (ev.options || []).forEach((opt, oi) => {
    html += `<div style="border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:8px">
      <div class="form-group full"><label>选项 ${oi+1} 文本</label>
      <input type="text" id="f_opt_${oi}_text" data-opt="${oi}" data-key="text" value="${escapeHTML(opt.text)}" /></div>`;
    html += subListEditor(`opt_${oi}_effects`, '效果', opt.effects || [], (ef, i) => {
      let typeOpts = ['add_resource','consume_resource','obtain_item','consume_item','unlock_building','trigger_event','schedule_event']
        .map(t => `<option value="${t}" ${ef.type===t?'selected':''}>${t}</option>`).join('');
      return `<select data-subidx="${i}" data-key="type" style="flex:1">${typeOpts}</select>
        ${resSelectSub(i, ef.resourceId||'')}
        <input class="amount" data-subidx="${i}" data-key="amount" type="number" value="${ef.amount||0}" placeholder="数量" />
        <input class="amount" data-subidx="${i}" data-key="eventId" value="${escapeHTML(ef.eventId||'')}" placeholder="事件ID" />`;
    });
    html += '</div>';
  });

  return html;
}

function renderRegionForm(r) {
  let html = '<div class="form-row span-3">';
  html += field('id', 'ID', r.id);
  html += field('name', '名称', r.name);
  html += field('image', '图片', r.image, { placeholder: 'region_xxx.png' });
  html += '</div>';
  html += '<div class="form-group full"><label for="f_description">描述</label>';
  html += `<textarea id="f_description" data-field="description" rows="2">${escapeHTML(r.description || '')}</textarea></div>`;

  // Unlock conditions
  html += '<div class="section-title">解锁条件</div>';
  html += subListEditor('unlockConditions', '条件列表 (type: item/building)', r.unlockConditions || [], (c, i) =>
    `<select data-subidx="${i}" data-key="type"><option value="item" ${c.type==='item'?'selected':''}>item</option><option value="building" ${c.type==='building'?'selected':''}>building</option></select>
     <input class="amount" data-subidx="${i}" data-key="itemId" value="${escapeHTML(c.itemId||'')}" placeholder="物品/建筑ID" />`
  );

  // Base yields
  html += '<div class="section-title">基础产出（每时段）</div>';
  const periods = ['morning','afternoon','evening','night'];
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<thead><tr><th>时段</th><th>原木</th><th>石头</th><th>煤炭</th><th>铁矿</th></tr></thead><tbody>';
  periods.forEach(p => {
    const y = r.baseYields?.[p] || {};
    html += `<tr>
      <td style="padding:4px 8px;font-weight:500">${p}</td>
      <td><input type="number" id="f_yield_${p}_wood" data-yield="${p}" data-res="wood" value="${y.wood??''}" placeholder="0" style="width:80px" /></td>
      <td><input type="number" id="f_yield_${p}_stone" data-yield="${p}" data-res="stone" value="${y.stone??''}" placeholder="0" style="width:80px" /></td>
      <td><input type="number" id="f_yield_${p}_coal" data-yield="${p}" data-res="coal" value="${y.coal??''}" placeholder="0" style="width:80px" /></td>
      <td><input type="number" id="f_yield_${p}_iron_ore" data-yield="${p}" data-res="iron_ore" value="${y.iron_ore??''}" placeholder="0" style="width:80px" /></td>
    </tr>`;
  });
  html += '</tbody></table></div>';

  return html;
}

function renderMapForm() {
  const m = state.data.base_map;
  let html = '<div class="section-title">地图参数</div>';
  html += '<div class="form-row span-3">';
  html += field('map_gridWidth', '宽(列)', m.gridWidth, { type: 'number' });
  html += field('map_gridHeight', '高(行)', m.gridHeight, { type: 'number' });
  html += field('map_tileSize', '格子大小', m.tileSize, { type: 'number' });
  html += '</div>';
  html += '<div class="form-row">';
  html += field('map_viewportCols', '视口列数', m.viewportCols ?? m.gridWidth, { type: 'number' });
  html += field('map_viewportRows', '视口行数', m.viewportRows ?? m.gridHeight, { type: 'number' });
  html += '<span style="font-size:11px;color:var(--muted);align-self:end;padding-bottom:8px">游戏中可见区域（格），设小可支撑大地图</span>';
  html += '</div>';

  // 初始相机位置（新游戏首次进入时使用，之后由存档覆盖）
  const ic = m.initialCamera || {};
  html += '<div class="section-title">初始相机位置</div>';
  html += '<div class="form-row span-3">';
  html += field('ic_gridX', '初始格子X', ic.gridX ?? Math.round(m.gridWidth / 2), { type: 'number' });
  html += field('ic_gridY', '初始格子Y', ic.gridY ?? Math.round(m.gridHeight / 2), { type: 'number' });
  html += field('ic_zoom', '初始缩放', ic.zoom ?? 1.0, { type: 'number', step: '0.1' });
  html += '</div>';
  html += '<span style="font-size:11px;color:var(--muted)">新游戏首次进入时相机中心所在的格子。后续由存档记录玩家最后位置。</span>';

  html += '<div class="section-title">地形类型</div>';
  Object.entries(m.groundTypes || {}).forEach(([key, gt]) => {
    html += `<div class="form-row span-3" style="margin-bottom:8px;padding:8px;border:1px solid var(--border);border-radius:6px">
      <div class="form-group"><label>代码</label><input type="text" value="${key}" readonly style="font-weight:600;background:var(--bg)" /></div>
      <div class="form-group"><label>名称</label><input type="text" id="f_gt_${key}_name" data-gt="${key}" data-key="name" value="${escapeHTML(gt.name)}" /></div>
      <div class="form-group"><label>颜色</label><input type="color" id="f_gt_${key}_color" data-gt="${key}" data-key="colorHint" value="${gt.colorHint}" style="width:60px;height:32px;padding:2px" /></div>
      <div class="form-group"><label>可建造</label><select id="f_gt_${key}_buildable" data-gt="${key}" data-key="buildable">
        <option value="true" ${gt.buildable===true?'selected':''}>是</option>
        <option value="false" ${gt.buildable===false?'selected':''}>否</option>
        <option value="restricted" ${gt.buildable==='restricted'?'selected':''}>限制</option>
      </select></div>
      <div class="form-group"><button class="btn-danger btn-sm" onclick="deleteGroundType('${key}')" title="删除此地形类型" style="margin-top:18px">🗑 删除</button></div>
    </div>`;
  });
  html += `<button class="btn-secondary btn-sm" onclick="addGroundType()" style="margin-top:6px">+ 添加地形类型</button>`;

  // Interactive Canvas map editor
  html += '<div class="section-title">地图编辑器</div>';
  html += '<div class="map-toolbar">';
  html += '<button class="btn-secondary btn-sm map-mode-btn active" data-mode="brush">🖌️ 笔刷</button>';
  html += '<button class="btn-secondary btn-sm map-mode-btn" data-mode="building">🏠 建筑</button>';
  html += '<button class="btn-secondary btn-sm map-mode-btn" data-mode="entrance">🚪 入口</button>';
  html += '<button class="btn-secondary btn-sm map-mode-btn" data-mode="rectangle">◻ 矩形</button>';
  html += '<button class="btn-secondary btn-sm map-mode-btn" data-mode="fill">▦ 填充</button>';
  html += '<button class="btn-secondary btn-sm map-mode-btn" data-mode="eraser">🧹 橡皮擦</button>';
  html += '<span class="sep" style="width:1px;height:16px;background:var(--border);margin:0 4px;display:inline-block"></span>';
  html += '<button class="btn-secondary btn-sm map-mode-btn" data-mode="select">🔲 选区移动</button>';
  html += '<button id="btnGenerateMap" class="btn-secondary btn-sm" style="margin-left:auto" title="生成100×100随机地图">🎲 生成100×100</button>';
  html += '<span style="margin-left:8px;font-size:11px;color:var(--muted)">滚轮缩放 | 中键平移 | B/V/E/R/F/X/S切换模式 | Ctrl+Z撤销 Ctrl+Y重做</span>';
  html += '</div>';
  html += '<div style="display:flex;gap:12px;align-items:flex-start;margin-top:8px">';

  // Terrain palette (visible in brush mode)
  html += '<div id="mapPalette" style="width:90px;flex-shrink:0">';
  html += '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">🎨 地形</div>';
  const groundChars = Object.keys(m.groundTypes || {});
  groundChars.forEach(ch => {
    const gt = m.groundTypes[ch];
    const active = ch === state.mapEditorBrush ? ' map-palette-swatch-active' : '';
    html += `<div class="map-palette-swatch${active}" data-ground="${ch}" title="${gt.name} (${ch})" style="background:${gt.colorHint};margin-bottom:4px">
      <span>${ch}</span></div>`;
  });
  html += '</div>';

  // Canvas — 尺寸基于视口配置而非全图大小，避免大地图撑爆布局
  const displayCols = m.viewportCols || m.gridWidth;
  const displayRows = m.viewportRows || m.gridHeight;
  const canvasW = displayCols * MAP_CELL_SIZE;
  const canvasH = displayRows * MAP_CELL_SIZE;
  html += `<div id="mapCanvasWrapper" style="width:${canvasW}px;height:${canvasH}px">
    <canvas id="mapCanvas" width="${Math.round(canvasW * (window.devicePixelRatio||1))}" height="${Math.round(canvasH * (window.devicePixelRatio||1))}"
      style="width:${canvasW}px;height:${canvasH}px;display:block;cursor:crosshair"></canvas>
    <div class="map-resize-hint" title="拖拽右下角调整视口大小">↕↔</div>
  </div>`;
  html += '<div style="margin-top:4px;font-size:11px;color:var(--muted)">💡 地图区域右下角可拖拽调整视口大小，也可在左侧"视口列数/行数"直接输入数值</div>';

  // Right panel: building selector (in building mode) + building list
  html += '<div id="mapRightPanel" style="width:180px;flex-shrink:0;font-size:12px">';
  html += '<div id="mapBuildingSelector" style="display:none">';
  html += '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">🏠 选择建筑</div>';
  html += '<select id="mapBldSelect" style="width:100%;margin-bottom:8px;font-size:12px"><option value="">-- 选择建筑 --</option>';
  (state.data.buildings || []).forEach(b => {
    const fp = b.footprint || { width: 1, height: 1 };
    html += `<option value="${b.id}" ${b.id === state.mapEditorBuilding ? 'selected' : ''}>${b.name} (${fp.width}×${fp.height})</option>`;
  });
  html += '</select></div>';
  html += '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">📋 已放置建筑</div>';
  html += '<div id="mapBuildingList" style="max-height:400px;overflow-y:auto">';
  (m.initialBuildings || []).forEach((b, i) => {
    const bCfg = (state.data.buildings || []).find(bld => bld.id === b.buildingId);
    const bName = bCfg ? bCfg.name : b.buildingId;
    html += `<div class="map-bld-item" data-idx="${i}" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;margin-bottom:3px;cursor:pointer;font-size:11px;display:flex;justify-content:space-between;align-items:center">
      <span>${bName}</span><span style="color:var(--muted)">(${b.gridX},${b.gridY})</span></div>`;
  });
  html += '</div></div>';

  html += '</div>'; // end flex row

  // Status bar
  html += '<div id="mapStatus" style="font-size:11px;color:var(--muted);margin-top:6px;min-height:18px">💡 点击画布绘制地形 | B/V/E/R/F/X/S切换模式 | Ctrl+Z撤销 Ctrl+Y重做 | 右下角拖拽调整视口</div>';
  html += '<div id="mapBuildingHint" style="display:none;font-size:11px;color:var(--warn);margin-top:4px;min-height:18px;background:rgba(240,160,64,0.06);padding:4px 10px;border-radius:4px;border:1px solid rgba(240,160,64,0.15)">💡 拖拽移动建筑 | 右键删除建筑 | Delete 删除选中建筑</div>';

  // Expedition entrance
  html += '<div class="section-title">探险入口</div>';
  const ee = m.expeditionEntrance || {};
  html += '<div class="form-row span-3">';
  html += field('ee_gridX', 'X', ee.gridX, { type: 'number' });
  html += field('ee_gridY', 'Y', ee.gridY, { type: 'number' });
  html += field('ee_width', '宽', ee.width, { type: 'number' });
  html += field('ee_height', '高', ee.height, { type: 'number' });
  html += '</div>';

  // Initial buildings
  html += '<div class="section-title">初始建筑</div>';
  html += subListEditor('initBuildings', '建筑列表', m.initialBuildings || [], (b, i) =>
    `<input data-subidx="${i}" data-key="buildingId" value="${escapeHTML(b.buildingId||'')}" placeholder="建筑ID" />
     <input class="amount" data-subidx="${i}" data-key="gridX" type="number" value="${b.gridX??0}" placeholder="X" />
     <input class="amount" data-subidx="${i}" data-key="gridY" type="number" value="${b.gridY??0}" placeholder="Y" />`
  );

  // Schedule canvas render & viewport resize init
  setTimeout(() => {
    drawMapCanvas();
    initMapViewportResize();
  }, 100);

  return html;
}
