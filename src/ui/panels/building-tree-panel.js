/**
 * building-tree-panel.js - 建筑科技树面板
 * 沿用科技树/炼金树 SVG 画法：tier 纵排 + pos.x 横排 + prerequisites 连线
 * 数据驱动：building_tech.json -> nodes
 */
import { configRegistry } from '../../core/ConfigRegistry.js';

export function renderBuildingTreePanel(data, body, pm) {
  const sys = data.buildingTechSystem;
  if (!sys) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">建筑科技系统未加载</div>';
    return;
  }

  const allNodes = sys.getNodes();
  const unlocked = new Set(sys.getUnlockedNodes());

  function getResName(id) {
    const r = configRegistry.getResource(id);
    return r ? r.name : id;
  }

  function effectText(node) {
    const eff = node.effect || {};
    const parts = [];
    if (eff.productionMul) parts.push(`全场产出 ×${eff.productionMul}`);
    if (eff.resourceProductionMul) {
      for (const [res, mul] of Object.entries(eff.resourceProductionMul)) {
        parts.push(`${getResName(res)} ×${mul}`);
      }
    }
    if (node.unlocksBuilding) {
      const b = configRegistry.getBuilding(node.unlocksBuilding);
      parts.push(`解锁：${b ? b.name : node.unlocksBuilding}`);
    }
    if (node.special === 'remove_terrain_restriction') parts.push('资源建筑地形限制解除');
    return parts.join(' · ') || node.description;
  }

  const NODE_W = 230;
  const NODE_H = 120;
  const GAP_X = 32;
  const GAP_Y = 76;

  const positions = {};
  for (const n of allNodes) {
    const x = (n.pos?.x ?? 0) * (NODE_W + GAP_X);
    const y = (n.tier || 0) * (NODE_H + GAP_Y);
    positions[n.id] = { x, y };
  }

  let maxX = 0, maxY = 0;
  for (const p of Object.values(positions)) {
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  }
  maxX += 40;
  maxY += 40;

  const edges = [];
  for (const n of allNodes) {
    for (const preId of (Array.isArray(n.prerequisites) ? n.prerequisites : [])) {
      edges.push({ from: preId, to: n.id });
    }
  }

  const svgWidth = Math.max(maxX + 40, 1200);

  let html = `<div style="display:flex;justify-content:center;padding:16px;">`;
  html += `<svg viewBox="0 0 ${svgWidth} ${maxY}" style="width:100%;height:auto;max-width:100%;">`;

  // 连线
  for (const edge of edges) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) continue;
    const x1 = from.x + NODE_W / 2, y1 = from.y + NODE_H;
    const x2 = to.x + NODE_W / 2, y2 = to.y;
    const fromDone = unlocked.has(edge.from);
    const strokeColor = fromDone ? '#ffcc44' : '#4a4a6a';
    const strokeWidth = fromDone ? 2.5 : 1.5;
    html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.6" />`;
  }

  // 节点
  for (const n of allNodes) {
    const pos = positions[n.id];
    if (!pos) continue;

    const isDone = unlocked.has(n.id);
    const prereqs = Array.isArray(n.prerequisites) ? n.prerequisites : [];
    const prereqMet = prereqs.every(p => unlocked.has(p));
    const isAvail = !isDone && prereqMet;
    const isLocked = !isDone && !isAvail;

    let bgC, borderC, txtC;
    if (isDone) { bgC = 'rgba(255,204,68,0.18)'; borderC = '#ffcc44'; }
    else if (isAvail) { bgC = 'rgba(255,204,68,0.08)'; borderC = 'rgba(255,204,68,0.4)'; }
    else { bgC = 'rgba(255,255,255,0.03)'; borderC = '#3a3a5a'; }
    txtC = isLocked ? '#6a6a82' : '#ececf0';

    const costStr = (n.cost || []).map(c => `${getResName(c.resourceId)} ${c.amount}`).join(' ');
    const canAfford = sys.canAffordNode(n);
    const cursor = isAvail ? 'pointer' : 'default';

    html += `<foreignObject x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="
        width:100%;height:100%;
        background:${bgC}; border:2px solid ${borderC}; border-radius:10px;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        cursor:${cursor}; box-sizing:border-box; padding:4px;
      " data-node-id="${n.id}" data-available="${isAvail}">
        <div style="font-size:16px;font-weight:600;color:${txtC};text-align:center;line-height:1.3;">${n.name}</div>`;

    if (isDone) {
      html += `<div style="font-size:12px;color:#ffcc44;margin-top:2px;">✓ 已解锁</div>`;
    } else if (isAvail) {
      html += `<div style="font-size:11px;color:#f0a040;text-align:center;margin-top:2px;line-height:1.3;">${costStr}</div>`;
      html += `<div style="font-size:11px;color:${canAfford ? '#aaa' : '#e74c3c'};">${canAfford ? '点击解锁' : '资源不足'}</div>`;
    } else {
      html += `<div style="font-size:11px;color:#6a6a82;text-align:center;margin-top:2px;">需前置节点</div>`;
    }

    html += `<div style="font-size:11px;color:${isLocked ? '#5a5a72' : '#ffcc88'};text-align:center;margin-top:2px;line-height:1.2;">🏗️ ${effectText(n)}</div>`;

    html += `</div></foreignObject>`;
  }

  html += `</svg></div>`;

  // 已解锁效果汇总
  const descParts = [];
  for (const n of allNodes) {
    if (!unlocked.has(n.id)) continue;
    descParts.push(`<b style="color:#ffcc88">${n.name}</b>: ${effectText(n)}`);
  }
  if (descParts.length) {
    html += `<div style="padding:0 20px 16px;color:#bbb;font-size:12px;line-height:1.6;">
      <div style="color:#888;margin-bottom:6px;">已生效加成：</div>${descParts.join('<br>')}</div>`;
  }

  body.innerHTML = html;

  body.querySelectorAll('[data-available="true"]').forEach(el => {
    el.addEventListener('click', () => {
      const nodeId = el.dataset.nodeId;
      if (sys.unlockNode(nodeId)) {
        pm.refresh(data);
      }
    });
  });
}
