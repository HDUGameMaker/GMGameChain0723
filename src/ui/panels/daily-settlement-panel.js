function game() { return window.__game; }

export function renderDailySettlementPanel(data, body, pm) {
  const eventSystem = game()?.systems?.event;
  const events = eventSystem?.getSettlementEvents?.() || [];
  body.style.cssText = 'padding:22px 26px;max-height:76vh;overflow-y:auto;min-width:min(720px,86vw);';
  body.innerHTML = `<div style="text-align:center;margin-bottom:18px"><div style="font-size:24px;font-weight:800;color:#f2d28f">第 ${data.day} 日结算</div><div style="font-size:12px;color:#9298a8;margin-top:5px">游戏已暂停，确认后进入下一日</div></div>`;

  const stats = document.createElement('div');
  stats.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px;';
  stats.innerHTML = `<div style="padding:14px;border-radius:10px;background:rgba(220,90,90,.08);text-align:center">⚔️ 击败敌人<br><b style="font-size:22px;color:#e99393">${data.enemiesDefeated || 0}</b></div>`;
  body.appendChild(stats);

  const resourceTitle = document.createElement('div');
  resourceTitle.style.cssText = 'font-weight:700;color:#e7d7aa;margin:12px 0 8px;';
  resourceTitle.textContent = '今日物资净变化';
  body.appendChild(resourceTitle);
  const resources = document.createElement('div');
  resources.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px;';
  if (!data.resourceChanges?.length) resources.innerHTML = '<div style="color:#808695;padding:10px">今日物资没有变化</div>';
  for (const item of data.resourceChanges || []) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;padding:9px 11px;border-radius:8px;background:rgba(255,255,255,.04);';
    row.innerHTML = `<span>${item.icon ? `<img src="${item.icon}" alt="" style="width:18px;height:18px;vertical-align:middle;object-fit:contain">` : '📦'} ${item.name}</span><b style="color:${item.amount > 0 ? '#69d58b' : '#ef8585'}">${item.amount > 0 ? '+' : ''}${item.amount}</b>`;
    resources.appendChild(row);
  }
  body.appendChild(resources);

  const eventTitle = document.createElement('div');
  eventTitle.style.cssText = 'font-weight:700;color:#e7d7aa;margin:18px 0 8px;';
  eventTitle.textContent = `今日特殊事件（${events.length}）`;
  body.appendChild(eventTitle);
  if (!events.length) body.insertAdjacentHTML('beforeend', '<div style="padding:12px;color:#808695;background:rgba(255,255,255,.03);border-radius:8px">今日没有特殊事件。</div>');
  for (const evt of events) {
    const card = document.createElement('div');
    card.style.cssText = 'display:flex;align-items:center;gap:10px;padding:11px 13px;margin-bottom:7px;border:1px solid rgba(214,168,75,.2);border-radius:9px;background:rgba(214,168,75,.06);';
    card.innerHTML = `<div style="flex:1"><b style="color:#eee">${evt.name}</b><div style="font-size:11px;color:#9da3b2;margin-top:3px">${evt.description || ''}</div></div>`;
    const handle = document.createElement('button');
    handle.textContent = '处理';
    handle.addEventListener('click', () => eventSystem.openSettlementEvent(evt.id, pm));
    const skip = document.createElement('button');
    skip.textContent = '不处理';
    skip.addEventListener('click', () => { eventSystem.skipSettlementEvent(evt.id); renderDailySettlementPanel(data, body, pm); });
    for (const button of [handle, skip]) button.style.cssText = 'padding:7px 12px;border:1px solid #6c6048;border-radius:7px;background:#3b3428;color:#eee;cursor:pointer;';
    card.append(handle, skip);
    body.appendChild(card);
  }

  const finish = document.createElement('button');
  finish.textContent = events.length ? '跳过剩余事件并进入下一日' : '进入下一日';
  finish.style.cssText = 'display:block;width:100%;margin-top:18px;padding:12px;border:1px solid #8d7445;border-radius:9px;background:#57431f;color:#ffe4a7;font-weight:700;cursor:pointer;';
  finish.addEventListener('click', () => { for (const evt of eventSystem?.getSettlementEvents?.() || []) eventSystem.skipSettlementEvent(evt.id); pm.close(); });
  body.appendChild(finish);
}
