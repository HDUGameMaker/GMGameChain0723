function describeEffects(effects = {}) {
  return Object.entries(effects).map(([key, value]) => `${key} ${value}`).join(' · ');
}

export function renderLuxuryTradePanel(data, body, pm) {
  const system = window.__game?.systems?.luxury;
  if (!system) return;
  const inventory = system.getInventory();
  const outpostId = data?.outpostId || null;
  const outpost = outpostId ? window.__game?.systems?.diplomacy?.getOutpost?.(outpostId) : null;
  body.style.cssText = 'padding:20px 24px;max-height:74vh;overflow:auto;';
  body.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div><b style="font-size:18px;color:#e7ca83">奢侈品与贸易</b><div style="font-size:11px;color:#999">首份自动投入对应产业、军备或人才用途并激活帝国效果；重复份可贸易</div></div>${outpost ? `<span style="font-size:12px;color:#9fb6dc">贸易对象：${outpost.name}</span>` : ''}</div>`;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:10px;';
  for (const luxury of system.getLuxuries()) {
    const count = inventory[luxury.id] || 0;
    const card = document.createElement('article');
    card.style.cssText = `padding:11px;border:1px solid ${count ? '#a98a4d' : '#3d414a'};border-radius:9px;background:${count ? 'rgba(107,79,31,.14)' : 'rgba(255,255,255,.025)'};color:${count ? '#eee2c7' : '#777'};`;
    const application = luxury.application || {};
    card.innerHTML = `<div style="display:flex;align-items:center;gap:9px"><img src="${luxury.icon}" alt="${luxury.name}" style="width:38px;height:38px" onerror="this.style.visibility='hidden'"><div><b>${luxury.name}</b><div style="font-size:11px">持有 ${count} · 可贸易 ${Math.max(0, count - 1)}</div></div></div><div style="font-size:10px;line-height:1.45;margin-top:7px">满意度 +${luxury.satisfaction} · ${describeEffects(luxury.effects)}</div><div style="margin-top:7px;padding:6px 7px;border-radius:6px;background:rgba(231,202,131,.08);font-size:10px;line-height:1.45;color:${count ? '#d9c69d' : '#777'}"><b>实际用途 · ${application.targetName || '城市产业'}</b><br>${application.useDescription || luxury.description}</div>`;
    if (outpost) {
      const trade = document.createElement('button');
      const check = system.canTrade(luxury.id, 1, outpostId);
      trade.disabled = !check.ok;
      trade.textContent = check.ok ? `贸易 1 份（基础黄金 ${luxury.baseTradeValue}）` : check.reason;
      trade.style.cssText = `margin-top:8px;width:100%;padding:6px;border:1px solid ${check.ok ? '#8aa3cc' : '#444'};border-radius:6px;background:${check.ok ? '#2f4566' : '#2b2b2b'};color:${check.ok ? '#dbe8ff' : '#666'};cursor:${check.ok ? 'pointer' : 'not-allowed'};font-size:10px;`;
      trade.addEventListener('click', () => {
        const result = system.tradeWithOutpost(luxury.id, outpostId, 1);
        if (!result.ok) pm.alert(result.reason);
        renderLuxuryTradePanel(data, body, pm);
      });
      card.appendChild(trade);
    }
    grid.appendChild(card);
  }
  body.appendChild(grid);
}
