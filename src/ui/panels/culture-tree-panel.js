/**
 * culture-tree-panel.js - 人文树面板（框架预留）
 * 与科技树相同的树状结构模板，暂无具体功能
 */
export function renderCultureTreePanel(data, body, pm) {
  // 预留：人文树数据源
  const allCultures = []; // 后续从配置读取

  // 空状态占位
  if (!allCultures || allCultures.length === 0) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 40px;text-align:center;">
        <div style="font-size:64px;margin-bottom:16px;">📜</div>
        <div style="font-size:20px;font-weight:600;color:#ececf0;margin-bottom:8px;">人文树</div>
        <div style="font-size:14px;color:#6a6a82;max-width:400px;">
          政策、文化与信仰体系。<br>
          待后续版本开放。
        </div>
      </div>
    `;
    return;
  }

  // ==== 以下为预留框架代码，数据结构与科技树一致 ====

  // 按层级分组
  const tiers = {};
  const cultureMap = {};
  let maxTier = 0;
  for (const c of allCultures) {
    if (!tiers[c.tier]) tiers[c.tier] = [];
    tiers[c.tier].push(c);
    cultureMap[c.id] = c;
    maxTier = Math.max(maxTier, c.tier);
  }

  const NODE_W = 220;
  const NODE_H = 110;
  const GAP_X = 30;
  const GAP_Y = 70;

  // 计算位置
  const positions = {};
  for (const c of allCultures) {
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

  // 连线
  const edges = [];
  for (const c of allCultures) {
    if (c.prerequisites && c.prerequisites.length > 0) {
      for (const preId of c.prerequisites) {
        edges.push({ from: preId, to: c.id });
      }
    }
  }

  const svgWidth = Math.max(maxX + 40, 1400);

  let html = `<div style="display:flex;justify-content:center;padding:16px;">`;
  html += `<svg viewBox="0 0 ${svgWidth} ${maxY}" style="width:100%;height:auto;max-width:100%;">`;

  for (const edge of edges) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) continue;
    const x1 = from.x + NODE_W / 2;
    const y1 = from.y + NODE_H;
    const x2 = to.x + NODE_W / 2;
    const y2 = to.y;
    html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4a4a6a" stroke-width="1.5" opacity="0.4" />`;
  }

  for (const c of allCultures) {
    const pos = positions[c.id];
    if (!pos) continue;

    html += `<foreignObject x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="
        width:100%;height:100%;
        background:rgba(78,203,113,0.2); border:2px solid #4ecb71; border-radius:10px;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        box-sizing:border-box; padding:4px; opacity:0.6;
      ">
        <div style="font-size:17px;font-weight:600;color:#ececf0;text-align:center;line-height:1.3;">${c.name}</div>
        <div style="font-size:12px;color:#4ecb71;margin-top:2px;">✓ 已完成</div>
      </div></foreignObject>`;
  }

  html += `</svg></div>`;

  body.innerHTML = html;
}
