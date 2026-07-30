/**
 * planner-config-adjacency.js — 建筑相邻加成配置编辑器
 *
 * 包含: renderAdjacencyForm, renderAdjacencyGraph, bindAdjacencyFormEvents,
 *       applyAdjacencyFieldChange, adjacencyCurrentData, adjacencyCurrentFileKeys
 *
 * 依赖: planner-config-core.js (state, currentData, resSelect*, bldSelect, itemSelect*, etc.)
 * 被 planner-config-render.js (renderDetail), planner-config-actions.js (switchTab, etc.) 调用
 */

/* ═══════════════════════════════════════════
   Data access helpers for adjacency tab
   ═══════════════════════════════════════════ */
function adjacencyCurrentData() {
  return state.data.adjacency_bonuses;
}

function adjacencyCurrentFileKeys() {
  return ['adjacency_bonuses'];
}

/* ═══════════════════════════════════════════
   Adjacency Form Rendering
   ═══════════════════════════════════════════ */
function renderAdjacencyForm(item) {
  let html = '<div class="form-row">';
  html += field('id', '规则ID', item.id, { placeholder: 'lumber_mill_near_logging_camp' });
  html += field('name', '显示名称', item.name, { placeholder: '木材处理厂·伐木协同' });
  html += '</div>';

  html += '<div class="form-row">';
  // sourceBuildingId dropdown
  html += '<div class="form-group"><label for="f_sourceBuildingId">受益建筑 (source)</label>';
  html += bldSelect('sourceBuildingId', item.sourceBuildingId, false);
  html += '<span style="font-size:11px;color:var(--muted);margin-top:2px">谁获得加成</span></div>';

  // targetBuildingId dropdown
  html += '<div class="form-group"><label for="f_targetBuildingId">提供建筑 (target)</label>';
  html += bldSelect('targetBuildingId', item.targetBuildingId, false);
  html += '<span style="font-size:11px;color:var(--muted);margin-top:2px">靠近谁才有加成</span></div>';
  html += '</div>';

  html += '<div class="form-row span-3">';
  html += field('maxDistance', '最大距离', item.maxDistance, { type: 'number', placeholder: '1' });
  html += field('effectType', '效果类型', item.effectType, {
    type: 'select',
    options: ['multiplier', 'flat'],
    optionLabels: { multiplier: '乘算 (×)', flat: '加算 (+)' }
  });
  html += field('effectValue', '效果数值', item.effectValue, { type: 'number', placeholder: '1.5', step: '0.1' });
  html += '</div>';

  html += '<div class="form-row">';
  html += field('applyToField', '作用于字段', item.applyToField, {
    type: 'select',
    options: ['production', 'foodCapacity', 'housingCapacity'],
    optionLabels: {
      production: '产出 (production)',
      foodCapacity: '食物产出 (foodCapacity)',
      housingCapacity: '住宅容量 (housingCapacity)'
    }
  });
  html += field('applyTo', '作用于资源', item.applyTo, {
    type: 'select',
    options: ['all', ...(state.data.resources || []).map(r => r.id)],
    optionLabels: Object.fromEntries([
      ['all', '全部产出'],
      ...(state.data.resources || []).map(r => [r.id, r.name])
    ])
  });
  html += '</div>';

  // Effect preview
  const bldNames = {};
  (state.data.buildings || []).forEach(b => { bldNames[b.id] = b.name || b.id; });
  const srcName = bldNames[item.sourceBuildingId] || item.sourceBuildingId || '?';
  const tgtName = bldNames[item.targetBuildingId] || item.targetBuildingId || '?';
  const effectDesc = item.effectType === 'multiplier'
    ? `产出 ×${item.effectValue}`
    : `产出 +${item.effectValue}`;
  const effectClass = (item.effectValue >= (item.effectType === 'multiplier' ? 1 : 0)) ? 'positive' : 'negative';
  html += `<div class="section-title">效果预览</div>`;
  html += `<div style="padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--border);font-size:13px;line-height:1.8">`;
  html += `<strong>${escapeHTML(srcName)}</strong> 靠近 <strong>${escapeHTML(tgtName)}</strong>（≤${item.maxDistance}格）时`;
  html += `<br>→ <span style="color:${effectClass === 'positive' ? 'var(--good)' : 'var(--bad)'};font-weight:600">${effectDesc}</span>`;
  html += `（作用于: ${item.applyToField === 'foodCapacity' ? '食物产出' : item.applyToField === 'housingCapacity' ? '住宅容量' : '生产产出'}${item.applyTo !== 'all' ? ' · ' + item.applyTo : ''}）`;
  html += `</div>`;

  return html;
}

/* ═══════════════════════════════════════════
   Persistent node positions (survive re-renders)
   ═══════════════════════════════════════════ */
const _adjNodePositions = {}; // { buildingId: { x, y } }

/* ═══════════════════════════════════════════
   SVG Node Graph — 建筑加成关系可视化
   ═══════════════════════════════════════════ */
function renderAdjacencyGraph() {
  const rules = adjacencyCurrentData() || [];
  if (rules.length === 0) return '<div style="padding:16px;text-align:center;color:var(--muted)">暂无加成规则，点击「+ 新增」创建第一条规则</div>';

  // Collect unique building IDs involved
  const buildingSet = new Set();
  rules.forEach(r => {
    buildingSet.add(r.sourceBuildingId);
    buildingSet.add(r.targetBuildingId);
  });

  const bldNames = {};
  (state.data.buildings || []).forEach(b => { bldNames[b.id] = b.name || b.id; });

  const buildings = [...buildingSet];

  // Layout: wider grid with more vertical spacing
  const cols = Math.min(buildings.length, 4);
  const rows = Math.ceil(buildings.length / cols);
  const cellW = 210;
  const cellH = 150;
  const padX = 70;
  const padY = 70;
  const svgW = cols * cellW + padX * 2;
  const svgH = Math.max(rows * cellH + padY * 2, 280);

  // Node positions (use custom positions if available)
  const nodePos = {};
  buildings.forEach((bid, i) => {
    if (_adjNodePositions[bid]) {
      // Use stored position, clamp to SVG bounds
      nodePos[bid] = {
        x: Math.max(padX, Math.min(svgW - padX, _adjNodePositions[bid].x)),
        y: Math.max(padY, Math.min(svgH - padY, _adjNodePositions[bid].y))
      };
    } else {
      const col = i % cols;
      const row = Math.floor(i / cols);
      nodePos[bid] = {
        x: padX + col * cellW + cellW / 2,
        y: padY + row * cellH + cellH / 2
      };
    }
  });

  // Build SVG with drag support
  let svg = `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="display:block;max-width:100%;height:auto;cursor:default" id="adjSvg">
    <defs>
    <marker id="arrowPos" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0,1 L9,5 L0,9 Z" fill="#4ecb71"/>
    </marker>
    <marker id="arrowNeg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0,1 L9,5 L0,9 Z" fill="#ff6b6b"/>
    </marker>
  </defs>`;

  // Draw edges
  rules.forEach(r => {
    if (!nodePos[r.sourceBuildingId] || !nodePos[r.targetBuildingId]) return;
    const sp = nodePos[r.sourceBuildingId];
    const tp = nodePos[r.targetBuildingId];

    // Calculate arrow endpoint (stop at node boundary)
    const dx = sp.x - tp.x;
    const dy = sp.y - tp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / (dist || 1);
    const ny = dy / (dist || 1);
    const nodeR = 62; // approximate node radius
    const sx = sp.x - nx * nodeR;
    const sy = sp.y - ny * nodeR;
    const ex = tp.x + nx * nodeR;
    const ey = tp.y + ny * nodeR;

    const isPositive = r.effectType === 'multiplier' ? r.effectValue >= 1 : r.effectValue >= 0;
    const color = isPositive ? '#4ecb71' : '#ff6b6b';
    const marker = isPositive ? 'url(#arrowPos)' : 'url(#arrowNeg)';
    const dash = r.maxDistance > 1 ? 'stroke-dasharray:6,4' : '';

    // Edge label
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const label = r.effectType === 'multiplier'
      ? `×${r.effectValue}`
      : `${r.effectValue >= 0 ? '+' : ''}${r.effectValue}`;

    svg += `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="2.5" ${dash} marker-end="${marker}" opacity="0.8"/>`;
    svg += `<rect x="${mx - 26}" y="${my - 12}" width="52" height="20" rx="5" fill="#1a1a2e" stroke="${color}" stroke-width="1.2" opacity="0.92"/>`;
    svg += `<text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="${color}" font-weight="600">d≤${r.maxDistance} ${label}</text>`;
  });

  // Draw nodes
  buildings.forEach(bid => {
    const p = nodePos[bid];
    const name = bldNames[bid] || bid;
    const isSelected = state.selectedIdx >= 0 && rules[state.selectedIdx] &&
      (rules[state.selectedIdx].sourceBuildingId === bid || rules[state.selectedIdx].targetBuildingId === bid);

    // Count rules involving this building for a small badge
    const ruleCount = rules.filter(r => r.sourceBuildingId === bid || r.targetBuildingId === bid).length;

    svg += `<g class="adj-node" data-bld="${escapeHTML(bid)}" data-x="${p.x}" data-y="${p.y}" style="cursor:grab">
      <rect x="${p.x - 60}" y="${p.y - 22}" width="120" height="44" rx="10"
            fill="#222238" stroke="${isSelected ? '#4ecb71' : '#3a3a55'}" stroke-width="${isSelected ? 3 : 2}"/>
      <text x="${p.x}" y="${p.y - 1}" text-anchor="middle" dominant-baseline="central"
            font-size="12" fill="#e0e0e8" font-weight="${isSelected ? 600 : 400}">${escapeHTML(name)}</text>
      <text x="${p.x}" y="${p.y + 13}" text-anchor="middle" dominant-baseline="central"
            font-size="10" fill="#6a6a88">${ruleCount}条规则</text>
    </g>`;
  });

  // Legend
  svg += `<line x1="20" y1="${svgH - 20}" x2="55" y2="${svgH - 20}" stroke="#4ecb71" stroke-width="2.5" marker-end="url(#arrowPos)"/>`;
  svg += `<text x="62" y="${svgH - 17}" font-size="11" fill="#808098">正加成</text>`;
  svg += `<line x1="118" y1="${svgH - 20}" x2="153" y2="${svgH - 20}" stroke="#ff6b6b" stroke-width="2.5" marker-end="url(#arrowNeg)"/>`;
  svg += `<text x="160" y="${svgH - 17}" font-size="11" fill="#808098">负加成</text>`;
  svg += `<text x="220" y="${svgH - 17}" font-size="11" fill="#808098">虚线 = 距离&gt;1</text>`;
  svg += `<text x="340" y="${svgH - 17}" font-size="10" fill="#5a5a77">💡 拖拽节点可自由排列</text>`;

  svg += `</svg>`;
  return svg;
}

/* ═══════════════════════════════════════════
   Adjacency Form Events
   ═══════════════════════════════════════════ */
function bindAdjacencyFormEvents() {
  const panel = document.getElementById('detailPanel');

  // Regular field changes
  panel.querySelectorAll('input[data-field], textarea[data-field], select[data-field]').forEach(el => {
    el.addEventListener('change', () => applyAdjacencyFieldChange(el));
    if (el.type !== 'checkbox') el.addEventListener('blur', () => applyAdjacencyFieldChange(el));
  });

  // Re-render preview when source/target/effectType changes
  const rebuildTriggers = ['f_sourceBuildingId', 'f_targetBuildingId', 'f_effectType', 'f_effectValue', 'f_applyToField', 'f_applyTo'];
  rebuildTriggers.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        applyAdjacencyFieldChange(el);
        // Re-render the form to update preview
        const data = adjacencyCurrentData();
        if (data && state.selectedIdx >= 0 && state.selectedIdx < data.length) {
          const item = data[state.selectedIdx];
          document.getElementById('detailPanel').innerHTML = renderAdjacencyForm(item) +
            '<div class="section-title">加成关系图</div>' +
            '<div class="event-graph" id="adjGraph">' + renderAdjacencyGraph() + '</div>';
          bindAdjacencyFormEvents();
          bindAdjacencyGraphEvents();
        }
      });
    }
  });

  // Graph SVG click events
  bindAdjacencyGraphEvents();
}

function bindAdjacencyGraphEvents() {
  const graph = document.getElementById('adjGraph');
  if (!graph) return;

  // Click: select the first rule involving this building
  graph.querySelectorAll('.adj-node').forEach(node => {
    node.addEventListener('click', () => {
      const bid = node.dataset.bld;
      const rules = adjacencyCurrentData();
      const idx = rules.findIndex(r => r.sourceBuildingId === bid || r.targetBuildingId === bid);
      if (idx >= 0) selectItem(idx);
    });

    // ── Drag support ──
    let dragging = null; // { node, startX, startY, origX, origY }
    let dragged = false;

    node.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // left button only
      e.preventDefault();
      const g = e.currentTarget;
      const origX = parseFloat(g.dataset.x);
      const origY = parseFloat(g.dataset.y);
      dragging = { node: g, startX: e.clientX, startY: e.clientY, origX, origY };
      dragged = false;
      g.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragged = true;

      const svgEl = graph.querySelector('svg');
      if (!svgEl) return;

      // Get SVG coordinate transform
      const pt = svgEl.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svgEl.getScreenCTM();
      if (!ctm) return;
      const svgPt = pt.matrixTransform(ctm.inverse());

      const newX = dragging.origX + (svgPt.x - dragging.origX);
      const newY = dragging.origY + (svgPt.y - dragging.origY);

      // Update rect and text positions
      const rect = dragging.node.querySelector('rect');
      const texts = dragging.node.querySelectorAll('text');
      if (rect) {
        rect.setAttribute('x', newX - 60);
        rect.setAttribute('y', newY - 22);
      }
      texts.forEach((t, i) => {
        if (i === 0) { t.setAttribute('x', newX); t.setAttribute('y', newY - 1); }
        if (i === 1) { t.setAttribute('x', newX); t.setAttribute('y', newY + 13); }
      });
      dragging.node.dataset.x = newX;
      dragging.node.dataset.y = newY;
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging.node.style.cursor = 'grab';
      if (dragged) {
        // Save position for this building
        const bid = dragging.node.dataset.bld;
        _adjNodePositions[bid] = {
          x: parseFloat(dragging.node.dataset.x),
          y: parseFloat(dragging.node.dataset.y)
        };
        // Re-render to update lines
        if (state.selectedIdx >= 0) {
          const data = adjacencyCurrentData();
          const item = data[state.selectedIdx];
          const detailPanel = document.getElementById('detailPanel');
          if (detailPanel && item) {
            detailPanel.innerHTML = renderAdjacencyForm(item) +
              '<div class="section-title">加成关系图</div>' +
              '<div class="event-graph" id="adjGraph">' + renderAdjacencyGraph() + '</div>';
            bindAdjacencyFormEvents();
            bindAdjacencyGraphEvents();
          }
        }
      }
      dragging = null;
      dragged = false;
    });
  });
}

function applyAdjacencyFieldChange(el) {
  if (state.selectedIdx < 0) return;
  const data = adjacencyCurrentData();
  if (!data || state.selectedIdx >= data.length) return;
  const item = data[state.selectedIdx];

  const fieldName = el.dataset.field;
  let value;

  if (el.type === 'checkbox') {
    value = el.checked;
  } else if (el.type === 'number' || el.type === 'select-one') {
    const numVal = Number(el.value);
    value = isNaN(numVal) ? el.value : numVal;
  } else {
    value = el.value;
  }

  item[fieldName] = value;
  markDirty();
}

/* ═══════════════════════════════════════════
   Default item for new adjacency rules
   ═══════════════════════════════════════════ */
function getAdjacencyDefaultItem() {
  return {
    id: 'new_adjacency_rule',
    name: '新增成规则',
    sourceBuildingId: (state.data.buildings && state.data.buildings.length > 0) ? state.data.buildings[0].id : '',
    targetBuildingId: (state.data.buildings && state.data.buildings.length > 0) ? state.data.buildings[0].id : '',
    maxDistance: 1,
    effectType: 'multiplier',
    effectValue: 1.5,
    applyToField: 'production',
    applyTo: 'all'
  };
}
