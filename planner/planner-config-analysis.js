/**
 * planner-config-analysis.js — 数值分析面板与 SVG 图表渲染
 *
 * 包含: VIZ 配色主题, getUpgradeChains, getCumulativeCosts, getResourceFlow,
 *       getRegionYieldSummary, getEquipmentEffects, svgBarChart,
 *       svgGroupedBarChart, renderAnalysisPanel
 *
 * 依赖: planner-config-core.js (state)
 * 被 planner-config-actions.js (switchTab → renderAnalysisPanel) 调用
 */

/* ═══════════════════════════════════════════
   数值分析 — 数据提取 & 图表渲染
   ═══════════════════════════════════════════ */

// -- 配色（dataviz 暗色主题） --
const VIZ = {
  surface: '#1a1a19',
  surfaceHex: '1a1a19',
  primary: '#ffffff',
  secondary: '#c3c2b7',
  muted: '#898781',
  gridline: '#2c2c2a',
  baseline: '#383835',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#9085e9', '#e66767'],
  // 资源专属色映射
  resColor: { wood: '#8b9a6b', plank: '#c4a45a', stone: '#9e9e9e', coal: '#555555', iron_ore: '#b87351', iron_ingot: '#6e7f8d' }
};

// -- 数据提取 --

function getUpgradeChains(buildings) {
  const byId = {};
  buildings.forEach(b => byId[b.id] = b);
  const roots = buildings.filter(b => !b.upgradesFrom && b.upgradesTo);
  const chains = [];
  roots.forEach(root => {
    const chain = [root];
    let current = root;
    while (current.upgradesTo && byId[current.upgradesTo]) {
      current = byId[current.upgradesTo];
      chain.push(current);
    }
    if (chain.length >= 2) chains.push(chain);
  });
  return chains;
}

function getCumulativeCosts(chain) {
  // 合并升级成本：每层建筑包含 buildCost + 上一层建筑的累计
  const result = [];
  const totals = {}; // resourceId → accumulated amount
  chain.forEach((b, i) => {
    // 第一层用 buildCost，后续用 upgradeCost
    const costs = i === 0 ? (b.buildCost || []) : (b.upgradeCost || []);
    costs.forEach(c => {
      totals[c.resourceId] = (totals[c.resourceId] || 0) + c.amount;
    });
    result.push({
      buildingId: b.id,
      buildingName: b.name,
      tier: i,
      costs: { ...totals } // 快照
    });
  });
  return result;
}

function getResourceFlow(buildings, resources) {
  const flows = [];
  buildings.forEach(b => {
    if (!b.production || !b.production.input || b.production.input.length === 0) return;
    const inputs = b.production.input.map(c => {
      const res = resources.find(r => r.id === c.resourceId);
      return { id: c.resourceId, name: res ? res.name : c.resourceId, amount: c.amount };
    });
    const outputs = (b.production.output || []).map(c => {
      const res = resources.find(r => r.id === c.resourceId);
      return { id: c.resourceId, name: res ? res.name : c.resourceId, amount: c.amount };
    });
    flows.push({ building: b, inputs, outputs, perWorker: b.production.perWorker, maxWorkers: b.maxWorkers });
  });
  return flows;
}

function getRegionYieldSummary(regions) {
  return regions.map(r => {
    const periods = ['morning', 'afternoon', 'evening', 'night'];
    const periodLabels = ['上午', '下午', '傍晚', '夜晚'];
    const yields = periods.map((p, i) => {
      const y = r.baseYields?.[p] || {};
      const total = Object.values(y).reduce((a, b) => a + b, 0);
      return { period: p, label: periodLabels[i], yields: y, total };
    });
    const bestPeriod = yields.reduce((best, y) => y.total > best.total ? y : best, yields[0]);
    return { id: r.id, name: r.name, yields, bestPeriod, totalDaily: yields.reduce((s, y) => s + y.total, 0) };
  });
}

function getEquipmentEffects(items) {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    unique: item.unique,
    consumable: item.consumable,
    capacityCost: item.capacityCost,
    effects: (item.expeditionEffects || []).map(e => {
      let desc = '';
      if (e.type === 'yield_multiplier') desc = `产出 ×${e.value}${e.regions ? '（' + e.regions.join('、') + '）' : ''}`;
      else if (e.type === 'yield_flat_bonus') desc = `${e.resourceId || ''} 固定 +${e.value}${e.regions ? '（' + e.regions.join('、') + '）' : ''}`;
      else if (e.type === 'resource_capacity_bonus') desc = `资源容量 +${e.value}`;
      else if (e.type === 'backpack_capacity_bonus') desc = `背包容量 +${e.value}`;
      else desc = `${e.type}: ${e.value}`;
      return { ...e, desc };
    })
  }));
}

// -- SVG 辅助 --

function svgBarChart({ width, height, data, categories, getValue, getLabel, getCategory, catColors, title, margin = { top: 30, right: 20, bottom: 40, left: 120 } }) {
  const W = width, H = height;
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;

  // 计算每个条目的各分类值（堆叠）
  const stacks = data.map((d, i) => {
    let cumulative = 0;
    return {
      label: getLabel(d, i),
      segments: categories.map(cat => {
        const val = getValue(d, cat);
        const y0 = cumulative;
        cumulative += val;
        return { cat, val, y0, y1: cumulative };
      }),
      total: cumulative
    };
  });

  const maxTotal = Math.max(...stacks.map(s => s.total), 1);
  const barH = Math.min(22, Math.floor((plotH - (data.length - 1) * 2) / data.length));
  const totalBarsH = data.length * barH + (data.length - 1) * 2;
  const startY = (plotH - totalBarsH) / 2;

  const xScale = (v) => (v / maxTotal) * plotW;
  const catColorsMap = catColors || {};

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${VIZ.surface}" rx="6"/>
    <text x="${margin.left}" y="${margin.top - 10}" fill="${VIZ.secondary}" font-size="12" font-weight="600">${title}</text>`;

  // Y 轴标签
  stacks.forEach((s, i) => {
    const y = margin.top + startY + i * (barH + 2) + barH / 2;
    svg += `<text x="${margin.left - 8}" y="${y}" fill="${VIZ.secondary}" font-size="11" text-anchor="end" dominant-baseline="central">${s.label}</text>`;
  });

  // X 轴
  const xAxisY = margin.top + plotH + 6;
  svg += `<line x1="${margin.left}" y1="${xAxisY}" x2="${margin.left + plotW}" y2="${xAxisY}" stroke="${VIZ.baseline}" stroke-width="1"/>`;
  // 刻度
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const v = (maxTotal / tickCount) * i;
    const x = margin.left + xScale(v);
    svg += `<line x1="${x}" y1="${xAxisY}" x2="${x}" y2="${xAxisY + 4}" stroke="${VIZ.baseline}" stroke-width="1"/>`;
    svg += `<text x="${x}" y="${xAxisY + 16}" fill="${VIZ.muted}" font-size="10" text-anchor="middle">${Math.round(v)}</text>`;
  }

  // 堆叠柱
  stacks.forEach((s, i) => {
    const barY = margin.top + startY + i * (barH + 2);
    s.segments.forEach(seg => {
      if (seg.val <= 0) return;
      const x = margin.left + xScale(seg.y0);
      const w = xScale(seg.val);
      const color = catColorsMap[seg.cat] || VIZ.series[categories.indexOf(seg.cat) % VIZ.series.length] || '#888';
      const rx = 3;
      svg += `<rect x="${x}" y="${barY}" width="${Math.max(w, 0.5)}" height="${barH}" fill="${color}" rx="${rx}"/>`;
    });
  });

  // 图例
  const legendY = H - 10;
  let legendX = margin.left;
  categories.forEach((cat, ci) => {
    const color = catColorsMap[cat] || VIZ.series[ci % VIZ.series.length] || '#888';
    svg += `<rect x="${legendX}" y="${legendY - 8}" width="10" height="10" fill="${color}" rx="2"/>`;
    svg += `<text x="${legendX + 14}" y="${legendY}" fill="${VIZ.secondary}" font-size="10" dominant-baseline="central">${cat}</text>`;
    legendX += (cat.length * 7 + 30);
  });

  svg += '</svg>';
  return svg;
}

function svgGroupedBarChart({ width, height, groups, groupLabels, series, seriesLabels, getValue, title, margin = { top: 36, right: 20, bottom: 50, left: 50 } }) {
  const W = width, H = height;
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;

  const nGroups = groups.length;
  const nSeries = series.length;
  const totalSlotW = plotW / nGroups;
  const barW = Math.min(20, Math.floor((totalSlotW - 12) / nSeries));
  const gap = 2;
  const groupGap = totalSlotW - nSeries * barW - (nSeries - 1) * gap;

  const allValues = [];
  groups.forEach(g => series.forEach(s => allValues.push(getValue(g, s))));
  const maxVal = Math.max(...allValues, 1);

  const yScale = (v) => plotH - (v / maxVal) * plotH;

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${VIZ.surface}" rx="6"/>
    <text x="${margin.left}" y="${margin.top - 10}" fill="${VIZ.secondary}" font-size="12" font-weight="600">${title}</text>`;

  // Y 轴网格和刻度
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const v = (maxVal / yTicks) * i;
    const y = margin.top + yScale(v);
    svg += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="${VIZ.gridline}" stroke-width="1"/>`;
    svg += `<text x="${margin.left - 6}" y="${y}" fill="${VIZ.muted}" font-size="10" text-anchor="end" dominant-baseline="central">${Math.round(v)}</text>`;
  }

  // X 轴
  const xAxisY = margin.top + plotH + 2;
  svg += `<line x1="${margin.left}" y1="${xAxisY}" x2="${margin.left + plotW}" y2="${xAxisY}" stroke="${VIZ.baseline}" stroke-width="1"/>`;

  // 柱
  groups.forEach((g, gi) => {
    const groupX = margin.left + gi * totalSlotW + groupGap / 2;
    // 组标签
    const labelX = groupX + (nSeries * barW + (nSeries - 1) * gap) / 2;
    svg += `<text x="${labelX}" y="${xAxisY + 16}" fill="${VIZ.secondary}" font-size="10" text-anchor="middle">${groupLabels[gi]}</text>`;

    series.forEach((s, si) => {
      const val = getValue(g, s);
      const x = groupX + si * (barW + gap);
      const barH = plotH - yScale(val);
      const y = margin.top + yScale(val);
      const color = VIZ.series[si % VIZ.series.length];
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 0.5)}" fill="${color}" rx="3"/>`;
    });
  });

  // 图例
  let legendX = margin.left;
  const legendY = H - 12;
  series.forEach((s, si) => {
    const color = VIZ.series[si % VIZ.series.length];
    const label = seriesLabels[si] || s;
    svg += `<rect x="${legendX}" y="${legendY - 8}" width="10" height="10" fill="${color}" rx="2"/>`;
    svg += `<text x="${legendX + 14}" y="${legendY}" fill="${VIZ.secondary}" font-size="10" dominant-baseline="central">${label}</text>`;
    legendX += (label.length * 7 + 30);
  });

  svg += '</svg>';
  return svg;
}

// -- 主渲染 --

function renderAnalysisPanel() {
  const buildings = state.data.buildings || [];
  const resources = state.data.resources || [];
  const items = state.data.items || [];
  const regions = state.data.regions || [];
  const expGlobal = state.data.exp_global || {};
  const theMap = state.data.base_map || {};

  const resName = (id) => { const r = resources.find(x => x.id === id); return r ? r.name : id; };
  const resEmoji = (id) => ({ wood: '🪵', plank: '📐', stone: '🪨', iron_ore: '⛏️', coal: '⚫', iron_ingot: '🔩' })[id] || '📦';

  const chains = getUpgradeChains(buildings);
  const flowData = getResourceFlow(buildings, resources);
  const regionSummary = getRegionYieldSummary(regions);
  const equipData = getEquipmentEffects(items);

  let html = '<div style="padding:20px;overflow-y:auto;max-height:calc(100vh - 220px)">';

  // ═══════════════ 区块 1: 建筑升级成本 ═══════════════
  html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:20px">';
  html += '<h3 style="margin:0 0 16px;font-size:15px;color:var(--fg)">📈 建筑升级成本分析</h3>';

  if (chains.length === 0) {
    html += '<p style="color:var(--muted);font-size:13px">未找到升级链（需要建筑配置 upgradesFrom / upgradesTo 关系）</p>';
  } else {
    chains.forEach((chain, ci) => {
      const cumul = getCumulativeCosts(chain);
      // 收集所有涉及到的资源ID
      const allResIds = new Set();
      cumul.forEach(t => Object.keys(t.costs).forEach(k => allResIds.add(k)));
      const resIds = [...allResIds];

      // 准备堆叠柱状图数据
      const chartData = cumul.map(t => ({
        label: t.buildingName,
        costs: t.costs
      }));

      // 用简单表格替代复杂SVG堆叠柱
      html += `<div style="margin-bottom:${ci < chains.length - 1 ? '24' : '0'}px">`;
      html += `<div style="font-size:13px;font-weight:600;color:var(--fg);margin-bottom:10px">${chain.map(b => b.name).join(' → ')}</div>`;

      // 表格
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
      html += '<thead><tr style="border-bottom:1px solid var(--border)">';
      html += '<th style="text-align:left;padding:6px 8px;color:var(--muted);font-weight:500">建筑</th>';
      resIds.forEach(rid => {
        html += `<th style="text-align:right;padding:6px 8px;color:var(--muted);font-weight:500">${resEmoji(rid)} ${resName(rid)}</th>`;
      });
      html += '<th style="text-align:right;padding:6px 8px;color:var(--muted);font-weight:500">总消耗(折算原木)</th>';
      html += '</tr></thead><tbody>';

      cumul.forEach((t, i) => {
        html += '<tr style="border-bottom:1px solid var(--border)">';
        html += `<td style="padding:6px 8px;color:var(--fg);font-weight:500">${i === 0 ? '🏗️ 建造 ' : '⬆️ 升级至 '}${t.buildingName}</td>`;
        resIds.forEach(rid => {
          const v = t.costs[rid] || 0;
          html += `<td style="text-align:right;padding:6px 8px;color:${v > 0 ? 'var(--fg)' : 'var(--muted)'}">${v > 0 ? v : '-'}</td>`;
        });
        // 粗略折合（木板=4原木, 铁锭=8铁矿+1煤炭≈复杂，仅做参考）
        let woodEquiv = t.costs['wood'] || 0;
        woodEquiv += (t.costs['plank'] || 0) * 4;
        woodEquiv += (t.costs['stone'] || 0) * 0.5;
        woodEquiv += (t.costs['iron_ingot'] || 0) * 20;
        woodEquiv += (t.costs['coal'] || 0) * 3;
        woodEquiv += (t.costs['iron_ore'] || 0) * 2;
        html += `<td style="text-align:right;padding:6px 8px;color:var(--muted);font-size:11px">≈${Math.round(woodEquiv)}</td>`;
        html += '</tr>';
      });

      html += '</tbody></table></div>';
    });
  }
  html += '</div>';

  // ═══════════════ 区块 2: 资源生产链 ═══════════════
  html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:20px">';
  html += '<h3 style="margin:0 0 16px;font-size:15px;color:var(--fg)">🔗 资源生产链</h3>';

  if (flowData.length === 0) {
    html += '<p style="color:var(--muted);font-size:13px">未找到生产建筑配置</p>';
  } else {
    html += '<div style="display:flex;flex-wrap:wrap;gap:16px">';
    flowData.forEach(f => {
      const inStr = f.inputs.map(i => `${resEmoji(i.id)}${i.name} ×${i.amount}`).join(' + ');
      const outStr = f.outputs.map(o => `${resEmoji(o.id)}${o.name} ×${o.amount}`).join(' + ');
      const workerNote = f.perWorker ? `（每工人，最多 ${f.maxWorkers} 人）` : '';
      html += `<div style="flex:1;min-width:260px;padding:14px;background:rgba(0,0,0,0.03);border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:13px;font-weight:600;color:var(--fg);margin-bottom:8px">🏭 ${f.building.name}</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.8">
          <div>📥 ${inStr || '无'}</div>
          <div style="margin:4px 0;text-align:center;color:var(--accent);font-size:18px">⬇</div>
          <div>📤 ${outStr}</div>
          ${workerNote ? `<div style="margin-top:4px;font-size:11px;color:var(--muted)">👤 ${workerNote}</div>` : ''}
        </div>
      </div>`;
    });
    html += '</div>';
  }
  html += '</div>';

  // ═══════════════ 区块 3: 探险产出 ═══════════════
  html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:20px">';
  html += '<h3 style="margin:0 0 16px;font-size:15px;color:var(--fg)">🗺️ 探险产出对比</h3>';

  if (regionSummary.length === 0) {
    html += '<p style="color:var(--muted);font-size:13px">未找到区域配置</p>';
  } else {
    const allResourceIds = new Set();
    regionSummary.forEach(r => r.yields.forEach(y => Object.keys(y.yields).forEach(k => allResourceIds.add(k))));
    const resIdList = [...allResourceIds];
    const periods = ['morning', 'afternoon', 'evening', 'night'];
    const periodLabels = ['☀️ 上午', '🌤️ 下午', '🌅 傍晚', '🌙 夜晚'];

    // 产出热力表格
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="border-bottom:2px solid var(--border)"><th style="text-align:left;padding:6px 8px;color:var(--muted)">区域</th><th style="text-align:left;padding:6px 8px;color:var(--muted)">时段</th>';
    resIdList.forEach(rid => {
      html += `<th style="text-align:right;padding:6px 8px;color:var(--muted)">${resEmoji(rid)} ${resName(rid)}</th>`;
    });
    html += '<th style="text-align:right;padding:6px 8px;color:var(--muted)">合计</th></tr></thead><tbody>';

    regionSummary.forEach((r, ri) => {
      r.yields.forEach((y, yi) => {
        const bg = yi === 0 ? 'rgba(0,0,0,0.02)' : 'transparent';
        html += `<tr style="border-bottom:1px solid var(--border);background:${bg}">`;
        if (yi === 0) {
          html += `<td rowspan="4" style="padding:6px 8px;color:var(--fg);font-weight:600;vertical-align:middle;border-right:1px solid var(--border)">${r.name}</td>`;
        }
        html += `<td style="padding:6px 8px;color:var(--fg)">${periodLabels[yi]}</td>`;
        resIdList.forEach(rid => {
          const v = y.yields[rid] || 0;
          // 热力背景色
          const maxYield = Math.max(...resIdList.map(k => y.yields[k] || 0), 1);
          const intensity = maxYield > 0 ? (v / maxYield) : 0;
          const alpha = intensity * 0.15;
          html += `<td style="text-align:right;padding:6px 8px;color:var(--fg);background:${v > 0 ? `rgba(74,124,89,${alpha})` : 'transparent'}">${v > 0 ? v : '-'}</td>`;
        });
        html += `<td style="text-align:right;padding:6px 8px;color:var(--fg);font-weight:600">${y.total}</td>`;
        html += '</tr>';
      });
      // 日合计行
      html += `<tr style="border-bottom:2px solid var(--border);background:rgba(74,124,89,0.06)">`;
      html += `<td style="padding:6px 8px;color:var(--accent);font-weight:600" colspan="2">📊 ${r.name} 全日合计</td>`;
      resIdList.forEach(rid => {
        const dayTotal = r.yields.reduce((s, y) => s + (y.yields[rid] || 0), 0);
        html += `<td style="text-align:right;padding:6px 8px;color:var(--accent);font-weight:600">${dayTotal}</td>`;
      });
      html += `<td style="text-align:right;padding:6px 8px;color:var(--accent);font-weight:700">${r.totalDaily}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    // 附加: 基础参数
    html += `<div style="margin-top:12px;font-size:12px;color:var(--muted);display:flex;gap:24px;flex-wrap:wrap">
      <span>📦 基础背包容量: <b style="color:var(--fg)">${expGlobal.baseBackpackCapacity || 10}</b></span>
      <span>📊 基础资源容量: <b style="color:var(--fg)">${expGlobal.baseResourceCapacity || 100}</b></span>
      <span>🔢 最大阶段数: <b style="color:var(--fg)">${expGlobal.expeditionPeriods || 3}</b></span>
    </div>`;
  }
  html += '</div>';

  // ═══════════════ 区块 4: 装备收益 ═══════════════
  html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:20px">';
  html += '<h3 style="margin:0 0 16px;font-size:15px;color:var(--fg)">🎒 装备收益分析</h3>';

  if (equipData.length === 0) {
    html += '<p style="color:var(--muted);font-size:13px">未找到物品配置</p>';
  } else {
    html += '<div style="display:flex;flex-wrap:wrap;gap:12px">';
    equipData.forEach(eq => {
      const badge = eq.unique ? '<span style="font-size:10px;background:rgba(201,125,26,0.15);color:#b87a14;padding:1px 6px;border-radius:999px;margin-left:4px">唯一</span>' : '';
      const consumable = eq.consumable ? '<span style="font-size:10px;background:rgba(181,58,42,0.1);color:#b53a2a;padding:1px 6px;border-radius:999px;margin-left:4px">消耗品</span>' : '';
      html += `<div style="flex:1;min-width:220px;max-width:320px;padding:14px;background:rgba(0,0,0,0.03);border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:13px;font-weight:600;color:var(--fg);margin-bottom:6px">${eq.name}${badge}${consumable}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">📦 背包占用: ${eq.capacityCost}</div>`;
      eq.effects.forEach(e => {
        const icon = e.type === 'yield_multiplier' ? '✖️' : e.type === 'yield_flat_bonus' ? '➕' : e.type === 'resource_capacity_bonus' ? '📊' : '🎒';
        html += `<div style="font-size:12px;color:var(--fg);line-height:1.8">${icon} ${e.desc}</div>`;
      });
      html += '</div>';
    });
    html += '</div>';

    // 最佳组合计算: 对每个区域，展示叠加全部加成后的理论最大产出
    html += '<div style="margin-top:16px;padding:14px;background:rgba(74,124,89,0.06);border-radius:8px;border:1px solid rgba(74,124,89,0.15)">';
    html += '<div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:10px">✨ 理论最佳组合（叠加全部装备效果）</div>';

    regionSummary.forEach(r => {
      // 查找与此区域相关的倍率和固定加成
      let multiplier = 1.0;
      const flatBonuses = {};
      let capBonus = 0;

      equipData.forEach(eq => {
        eq.effects.forEach(e => {
          const applies = !e.regions || e.regions.length === 0 || e.regions.includes(r.id);
          if (!applies) return;
          if (e.type === 'yield_multiplier') multiplier *= e.value;
          else if (e.type === 'yield_flat_bonus') {
            flatBonuses[e.resourceId] = (flatBonuses[e.resourceId] || 0) + e.value;
          } else if (e.type === 'resource_capacity_bonus') capBonus += e.value;
        });
      });

      const baseTotal = r.totalDaily;
      // 粗略估算（假设各资源均匀分布）
      const totalFlatBonus = Object.values(flatBonuses).reduce((a, b) => a + b, 0) * 4; // 4 periods
      const adjusted = Math.round(baseTotal * multiplier + totalFlatBonus);
      const capTotal = (expGlobal.baseResourceCapacity || 100) + capBonus;

      html += `<div style="font-size:12px;color:var(--fg);margin-bottom:4px;line-height:1.8">
        <b>${r.name}</b>: 基础 ${baseTotal} → 加成后 ≈${adjusted}（倍率 ×${multiplier.toFixed(1)}${Object.keys(flatBonuses).length > 0 ? ', 固定+' + Object.values(flatBonuses).join('/') : ''}）${capBonus > 0 ? ' | 资源容量 ' + ((expGlobal.baseResourceCapacity || 100) + capBonus) : ''}
      </div>`;
    });
    html += '</div>';
  }
  html += '</div>';

  // 页脚: 数据概览
  html += `<div style="text-align:center;font-size:11px;color:var(--muted);padding:12px">
    基于 ${buildings.length} 个建筑 · ${resources.length} 种资源 · ${items.length} 件物品 · ${regions.length} 个区域 ｜ 仅供策划参考
  </div>`;

  html += '</div>';
  return html;
}
