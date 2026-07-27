/**
 * tech-tree-panel.js - 科技树面板
 * 从下往上的树状结构，带前置连线
 * 数据驱动：techs.json 中每个节点的 pos 和 prerequisites 决定位置和连线
 */
import { configRegistry } from '../../core/ConfigRegistry.js';

export function renderTechTreePanel(data, body, pm) {
  const techSystem = pm._techSystem;
  if (!techSystem) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">科技系统未加载</div>';
    return;
  }

  const allTechs = techSystem._getAllTechs();
  const researched = techSystem.getResearched();
  const current = techSystem.getCurrentResearch();
  const available = techSystem.getAvailableTechs().map(t => t.id);

  // 按 tier 分组
  const tiers = {};
  const techMap = {};
  let maxTier = 0;
  for (const tech of allTechs) {
    if (!tiers[tech.tier]) tiers[tech.tier] = [];
    tiers[tech.tier].push(tech);
    techMap[tech.id] = tech;
    maxTier = Math.max(maxTier, tech.tier);
  }

  function getResName(id) {
    const r = configRegistry.getResource(id);
    return r ? r.name : id;
  }

  // 节点宽度
  const NODE_W = 220;
  const NODE_H = 110;
  const GAP_X = 30;
  const GAP_Y = 70;

  // 计算每个节点在树中的位置（按 tier 纵排，横排根据 pos.x）
  const positions = {};
  for (const tech of allTechs) {
    const x = (tech.pos?.x ?? 0) * (NODE_W + GAP_X);
    const y = tech.tier * (NODE_H + GAP_Y);
    positions[tech.id] = { x, y };
  }

  // 计算画布尺寸
  let maxX = 0;
  let maxY = 0;
  for (const p of Object.values(positions)) {
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  }
  maxX += 40;
  maxY += 40;

  // 收集所有连线（子 → 父）
  const edges = [];
  for (const tech of allTechs) {
    if (tech.prerequisites && tech.prerequisites.length > 0) {
      for (const preId of tech.prerequisites) {
        edges.push({ from: preId, to: tech.id });
      }
    }
  }

  const svgWidth = Math.max(maxX + 40, 1400);

  let html = `<div style="display:flex;justify-content:center;padding:16px;">`;
  html += `<svg viewBox="0 0 ${svgWidth} ${maxY}" style="width:100%;height:auto;max-width:100%;">`;

  // 先画连线（在节点下层）
  for (const edge of edges) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) continue;

    const x1 = from.x + NODE_W / 2;
    const y1 = from.y + NODE_H;
    const x2 = to.x + NODE_W / 2;
    const y2 = to.y;

    // 判断前置是否已研究（绿色连线）或未研究（灰色连线）
    const fromResearched = researched.includes(edge.from);
    const strokeColor = fromResearched ? '#4ecb71' : '#4a4a6a';
    const strokeWidth = fromResearched ? 2.5 : 1.5;

    html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.6" />`;

    // 箭头（小三角形）
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowSize = 6;
    const ax = x2 - arrowSize * 0.5 * Math.cos(angle);
    const ay = y2 - arrowSize * 0.5 * Math.sin(angle);
    html += `<polygon points="
      ${ax},${ay}
      ${ax - arrowSize * Math.cos(angle - 0.4)},${ay - arrowSize * Math.sin(angle - 0.4)}
      ${ax - arrowSize * Math.cos(angle + 0.4)},${ay - arrowSize * Math.sin(angle + 0.4)}
    " fill="${strokeColor}" opacity="0.6" />`;
  }

  // 再画节点
  for (const tech of allTechs) {
    const pos = positions[tech.id];
    if (!pos) continue;

    const isDone = researched.includes(tech.id);
    const isCurrent = current && current.techId === tech.id;
    const isAvail = available.includes(tech.id);
    const isLocked = !isDone && !isAvail && !isCurrent;

    let bgC, borderC, txtC;
    if (isDone) { bgC = 'rgba(78,203,113,0.2)'; borderC = '#4ecb71'; }
    else if (isCurrent) { bgC = 'rgba(91,141,239,0.2)'; borderC = '#5b8def'; }
    else if (isAvail) { bgC = 'rgba(78,203,113,0.08)'; borderC = 'rgba(78,203,113,0.4)'; }
    else { bgC = 'rgba(255,255,255,0.03)'; borderC = '#3a3a5a'; }
    txtC = isLocked ? '#6a6a82' : '#ececf0';

    // 消耗文字
    let costStr = '';
    if (tech.cost && tech.cost.length > 0 && !isDone) {
      costStr = tech.cost.map(c => `${getResName(c.resourceId)} ${c.amount}`).join(' ');
    }

    const clickable = isAvail && !isCurrent;
    const cursor = clickable ? 'pointer' : 'default';

    html += `<foreignObject x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="
        width:100%;height:100%;
        background:${bgC}; border:2px solid ${borderC}; border-radius:10px;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        cursor:${cursor}; box-sizing:border-box; padding:4px;
        transition:border-color 0.2s,background 0.2s;
      " data-tech-id="${tech.id}" data-available="${clickable}">

        <div style="font-size:17px;font-weight:600;color:${txtC};text-align:center;line-height:1.3;">${tech.name}</div>`;

    if (isDone) {
      html += `<div style="font-size:13px;color:#4ecb71;margin-top:2px;">✓ 已完成</div>`;
    } else if (isCurrent) {
      const pct = Math.round((current.progressTicks / tech.researchTime) * 100);
      html += `<div style="width:90%;margin-top:4px;">
        <div style="height:5px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:#5b8def;border-radius:2px;"></div>
        </div>
        <div style="font-size:12px;color:#5b8def;text-align:center;">${current.progressTicks}/${tech.researchTime}</div>
      </div>`;
    } else if (costStr && !isLocked) {
      html += `<div style="font-size:12px;color:#f0a040;text-align:center;margin-top:2px;line-height:1.3;">${costStr}</div>`;
      if (tech.researchTime > 0) {
        html += `<div style="font-size:12px;color:#808098;">⏱${tech.researchTime}tick</div>`;
      }
    } else if (isLocked && tech.researchTime > 0) {
      html += `<div style="font-size:12px;color:#6a6a82;">⏱${tech.researchTime}tick</div>`;
    }

    // 显示解锁内容
    let unlockText = '';
    if (tech.unlocks) {
      const parts = [];
      if (tech.unlocks.buildings && tech.unlocks.buildings.length > 0) {
        parts.push('🏗️' + tech.unlocks.buildings.map(id => {
          const b = configRegistry.getBuilding(id);
          return b ? b.name : id;
        }).join(' '));
      }
      if (tech.unlocks.items && tech.unlocks.items.length > 0) {
        parts.push('📦' + tech.unlocks.items.map(id => {
          const it = configRegistry.getItem(id);
          return it ? it.name : id;
        }).join(' '));
      }
      if (tech.unlocks.regions && tech.unlocks.regions.length > 0) {
        parts.push('🗺️' + tech.unlocks.regions.map(id => {
          const reg = configRegistry.getRegion(id);
          return reg ? reg.name : id;
        }).join(' '));
      }
      unlockText = parts.join(' ');
    }
    if (unlockText) {
      if (isLocked) {
        html += `<div style="font-size:12px;color:#5a5a72;text-align:center;margin-top:2px;line-height:1.3;">${unlockText}</div>`;
      } else {
        html += `<div style="font-size:12px;color:#808098;text-align:center;margin-top:2px;line-height:1.3;">${unlockText}</div>`;
      }
    }

    html += `</div></foreignObject>`;
  }

  html += `</svg></div>`;

  body.innerHTML = html;

  // 点击事件
  body.querySelectorAll('[data-available="true"]').forEach(el => {
    el.addEventListener('click', () => {
      const techId = el.dataset.techId;
      if (techSystem.startResearch(techId)) {
        pm.close();
        pm.open('tech_tree', {});
      }
    });
  });
}
