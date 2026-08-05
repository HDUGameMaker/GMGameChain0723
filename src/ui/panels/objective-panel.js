export function renderObjectivePanel(data, body, pm) {
  const heroUnlocked = window.__game?.systems?.hero?.isSystemUnlocked?.();
  body.innerHTML = '';
  body.style.cssText = 'padding:8px 4px;min-width:min(560px,82vw);';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:grid;gap:14px;';
  if (data?.briefing) wrap.innerHTML = '<div style="text-align:center;color:#aaa;letter-spacing:4px">— 文明启程 —</div>';
  wrap.insertAdjacentHTML('beforeend', `<section style="padding:18px;border:1px solid rgba(240,180,80,.3);border-radius:12px;background:rgba(240,160,50,.06)"><b style="color:#f0b45a;font-size:17px">🏆 胜利目标</b><p style="color:#ddd">使你的文明强盛不衰。</p>${heroUnlocked ? '<p style="color:#e1c078;margin-bottom:0">新增目标：击败？？？</p>' : ''}</section><section style="padding:18px;border:1px solid rgba(255,90,90,.28);border-radius:12px;background:rgba(180,30,30,.07)"><b style="color:#ff7474;font-size:17px">💀 失败条件</b><p style="color:#ddd;margin-bottom:0">大本营被破坏。</p></section>`);
  if (data?.briefing) {
    const button = document.createElement('button'); button.textContent = '开始发展';
    button.style.cssText = 'padding:11px;border:1px solid #9a7435;border-radius:9px;background:#4c381c;color:#ffe5ad;cursor:pointer';
    button.onclick = () => pm.close(); wrap.appendChild(button);
  }
  body.appendChild(wrap);
}
