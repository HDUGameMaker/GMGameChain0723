/**
 * culture-tree-panel.js - 人文政策树面板
 * 与科技树相同的树状结构模板，支持政策卡激活/取消 + 政体选定（不可逆）
 * 数据源：config/culture.json + CultureSystem
 */
import { configRegistry } from '../../core/ConfigRegistry.js';
import { eventBus } from '../../core/EventBus.js';

export function renderCultureTreePanel(data, body, pm) {
  const cs = pm._cultureSystem;
  if (!cs) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">人文系统未加载</div>';
    return;
  }

  const all = cs._getAll();
  if (!all || all.length === 0) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 40px;text-align:center;">
        <div style="font-size:64px;margin-bottom:16px;">📜</div>
        <div style="font-size:20px;font-weight:600;color:#ececf0;margin-bottom:8px;">人文树</div>
        <div style="font-size:14px;color:#6a6a82;max-width:400px;">未加载 culture.json 配置。</div>
      </div>`;
    return;
  }

  const researched = cs.getResearched();
  const current = cs.getCurrentResearch();
  const available = cs.getAvailable().map(c => c.id);
  const activated = cs.getActivatedPolicies();
  const government = cs.getGovernment();

  function getResName(id) {
    const r = configRegistry.getResource(id);
    return r ? r.name : id;
  }

  const NODE_W = 220;
  const NODE_H = 120;
  const GAP_X = 30;
  const GAP_Y = 70;

  const positions = {};
  for (const c of all) {
    const x = (c.pos?.x ?? 0) * (NODE_W + GAP_X);
    const y = c.tier * (NODE_H + GAP_Y);
    positions[c.id] = { x, y };
  }

  let maxX = 0, maxY = 0;
  for (const p of Object.values(positions)) {
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  }
  maxX += 40;
  maxY += 40;

  const edges = [];
  for (const c of all) {
    if (c.prerequisites && c.prerequisites.length > 0) {
      for (const preId of c.prerequisites) edges.push({ from: preId, to: c.id });
    }
  }

  const svgWidth = Math.max(maxX + 40, 1400);
  let html = `<div style="display:flex;justify-content:center;padding:16px;">`;
  html += `<svg viewBox="0 0 ${svgWidth} ${maxY}" style="width:100%;height:auto;max-width:100%;">`;

  // 连线
  for (const edge of edges) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) continue;
    const x1 = from.x + NODE_W / 2, y1 = from.y + NODE_H;
    const x2 = to.x + NODE_W / 2, y2 = to.y;
    const fromResearched = researched.includes(edge.from);
    const strokeColor = fromResearched ? '#4ecb71' : '#4a4a6a';
    const strokeWidth = fromResearched ? 2.5 : 1.5;
    html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.6" />`;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowSize = 6;
    const ax = x2 - arrowSize * 0.5 * Math.cos(angle);
    const ay = y2 - arrowSize * 0.5 * Math.sin(angle);
    html += `<polygon points="${ax},${ay} ${ax - arrowSize * Math.cos(angle - 0.4)},${ay - arrowSize * Math.sin(angle - 0.4)} ${ax - arrowSize * Math.cos(angle + 0.4)},${ay - arrowSize * Math.sin(angle + 0.4)}" fill="${strokeColor}" opacity="0.6" />`;
  }

  // 节点
  for (const c of all) {
    const pos = positions[c.id];
    if (!pos) continue;

    const isDone = researched.includes(c.id);
    const isCurrent = current && current.id === c.id;
    const isAvail = available.includes(c.id);
    const isLocked = !isDone && !isAvail && !isCurrent;
    const isGov = c.policyType === 'government';
    const isActivated = activated.includes(c.id);
    const isGovSelected = isGov && government === c.id;
    const govAlreadyChosen = isGov && government && !isGovSelected;

    let bgC, borderC, txtC;
    if (isGovSelected) { bgC = 'rgba(255,107,107,0.18)'; borderC = '#ff6b6b'; }
    else if (isActivated) { bgC = 'rgba(91,141,239,0.2)'; borderC = '#5b8def'; }
    else if (isDone) { bgC = 'rgba(78,203,113,0.2)'; borderC = '#4ecb71'; }
    else if (isCurrent) { bgC = 'rgba(91,141,239,0.2)'; borderC = '#5b8def'; }
    else if (isAvail) { bgC = 'rgba(78,203,113,0.08)'; borderC = 'rgba(78,203,113,0.4)'; }
    else { bgC = 'rgba(255,255,255,0.03)'; borderC = '#3a3a5a'; }
    txtC = isLocked ? '#6a6a82' : '#ececf0';

    let costStr = '';
    if (c.cost && c.cost.length > 0 && !isDone) {
      costStr = c.cost.map(x => `${getResName(x.resourceId)} ${x.amount}`).join(' ');
    }

    const canClickResearch = isAvail && !isCurrent && !govAlreadyChosen;
    const canToggleActivate = isDone && !isGov; // 政策卡可激活/取消
    const cursor = (canClickResearch || canToggleActivate) ? 'pointer' : 'default';

    const typeLabel = isGov ? '🏛️ 政体' : '📜 政策';

    html += `<foreignObject x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="
        width:100%;height:100%;
        background:${bgC}; border:2px solid ${borderC}; border-radius:10px;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        cursor:${cursor}; box-sizing:border-box; padding:4px;
        transition:border-color 0.2s,background 0.2s;
      " data-id="${c.id}"
         data-research="${canClickResearch}"
         data-activate="${isDone && !isGov && !isActivated}"
         data-deactivate="${isActivated && c.tier !== 0}">`;

    html += `<div style="font-size:11px;color:#808098;margin-bottom:1px;">${typeLabel}</div>`;
    html += `<div style="font-size:16px;font-weight:600;color:${txtC};text-align:center;line-height:1.2;">${c.name}</div>`;

    if (isGovSelected) {
      html += `<div style="font-size:12px;color:#ff6b6b;margin-top:2px;">✓ 已选定政体</div>`;
    } else if (isActivated) {
      html += `<div style="font-size:12px;color:#5b8def;margin-top:2px;">🔵 已激活（点击取消）</div>`;
    } else if (isDone && !isGov) {
      html += `<div style="font-size:12px;color:#4ecb71;margin-top:2px;">✓ 已解锁（点击激活）</div>`;
    } else if (isCurrent) {
      const pct = Math.round((current.progressTicks / c.researchTime) * 100);
      html += `<div style="width:90%;margin-top:4px;">
        <div style="height:5px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:#5b8def;border-radius:2px;"></div>
        </div>
        <div style="font-size:12px;color:#5b8def;text-align:center;">${Math.floor(current.progressTicks)}/${c.researchTime}</div>
      </div>`;
    } else if (govAlreadyChosen) {
      html += `<div style="font-size:12px;color:#6a6a82;margin-top:2px;">已选其他政体</div>`;
    } else if (costStr && !isLocked) {
      html += `<div style="font-size:12px;color:#f0a040;text-align:center;margin-top:2px;line-height:1.3;">${costStr}</div>`;
      if (c.researchTime > 0) html += `<div style="font-size:12px;color:#808098;">⏱${c.researchTime}tick</div>`;
    } else if (isLocked && c.researchTime > 0) {
      html += `<div style="font-size:12px;color:#6a6a82;">⏱${c.researchTime}tick</div>`;
    }

    // 效果简述
    if (c.description) {
      const descColor = isLocked ? '#5a5a72' : '#9aa';
      html += `<div style="font-size:11px;color:${descColor};text-align:center;margin-top:2px;line-height:1.2;">${c.description}</div>`;
    }

    html += `</div></foreignObject>`;
  }

  html += `</svg></div>`;

  // 说明栏
  html += `<div style="padding:0 16px 16px;font-size:12px;color:#808098;line-height:1.6;">
    <b style="color:#ececf0;">说明：</b>📜政策卡解锁后可激活/取消（切换冷却 3 游戏日，基础政策不可取消）；
    🏛️政体选定后<b style="color:#ff6b6b;">不可更改</b>。蓝色=已激活，绿色=已解锁，红色=已选定政体。
  </div>`;

  body.innerHTML = html;

  // 点击：研究
  body.querySelectorAll('[data-research="true"]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const r = cs.startResearch(id);
      if (!r) {
        const check = cs.canStartResearch(id);
        eventBusEmit(pm, check.reason || '无法研究');
        return;
      }
      pm.close();
      pm.open('culture_tree', {});
    });
  });

  // 点击：激活政策卡
  body.querySelectorAll('[data-activate="true"]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const r = cs.activatePolicy(id);
      if (!r.valid) { eventBusEmit(pm, r.reason); return; }
      pm.close();
      pm.open('culture_tree', {});
    });
  });

  // 点击：取消激活政策卡
  body.querySelectorAll('[data-deactivate="true"]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const r = cs.deactivatePolicy(id);
      if (!r.valid) { eventBusEmit(pm, r.reason); return; }
      pm.close();
      pm.open('culture_tree', {});
    });
  });
}

// 简易 toast 提示（复用 combatBroadcast 渠道，由 MessageLog 显示）
function eventBusEmit(pm, msg) {
  eventBus.emit('combatBroadcast', { message: `📜 ${msg}` });
}
