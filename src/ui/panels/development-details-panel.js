import { getDevelopmentSummary } from '../../domain/DevelopmentSummary.js';

const formatMultiplier = value => `×${Number(value || 1).toFixed(2).replace(/\.00$/, '')}`;

export function renderDevelopmentDetailsPanel(data, body) {
  const summary = getDevelopmentSummary(window.__game?.systems || {});
  const cards = summary.multipliers.map(item => {
    const changed = Math.abs(item.value - 1) > 0.0001;
    const color = item.value > 1 ? '#78d69a' : item.value < 1 ? '#ef9a9a' : '#d8d8e5';
    return `<div style="background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <span style="color:#c8c8d5;font-size:13px;">${item.label}</span>
      <strong style="color:${color};font-size:17px;">${formatMultiplier(item.value)}</strong>
      ${changed ? `<span style="color:${color};font-size:11px;min-width:58px;text-align:right;">${item.value > 1 ? '+' : ''}${((item.value - 1) * 100).toFixed(1)}%</span>` : '<span style="color:#77778a;font-size:11px;min-width:58px;text-align:right;">基础值</span>'}
    </div>`;
  }).join('');
  const metrics = (summary.metrics || []).map(item => `<div style="background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:10px 12px;display:flex;justify-content:space-between;gap:10px"><span style="color:#aaaabd;font-size:12px">${item.label}</span><b style="color:#e9e9f2">${Number(item.value || 0).toFixed(2).replace(/\.00$/, '')}${item.suffix || ''}</b></div>`).join('');

  body.innerHTML = `<div style="max-width:860px;margin:0 auto;padding:8px 4px 24px;">
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:18px;">
      <div style="background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:14px;"><div style="color:#8f90a7;font-size:12px;">当前时代</div><div style="color:#f2d48a;font-size:18px;font-weight:700;margin-top:5px;">${summary.eraName}</div></div>
      <div style="background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:14px;"><div style="color:#8f90a7;font-size:12px;">当前文明</div><div style="color:#9cc7ff;font-size:18px;font-weight:700;margin-top:5px;">${summary.civilizationName}</div></div>
      <div style="background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:14px;"><div style="color:#8f90a7;font-size:12px;">当前人口</div><div style="color:#e9e9f2;font-size:18px;font-weight:700;margin-top:5px;">${summary.population} / ${summary.housing}</div></div>
    </div>
    <div style="color:#ececf3;font-size:15px;font-weight:700;margin:0 0 10px;">总加成乘数</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px;">${cards}</div>
    <div style="color:#ececf3;font-size:15px;font-weight:700;margin:18px 0 10px;">当前数值</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">${metrics}</div>
    <div style="color:#77778a;font-size:11px;margin-top:12px;line-height:1.6;">这里显示科技、人文、文明、英雄、奢侈品与已生效建筑等来源合并后的最终乘数。</div>
  </div>`;
}
