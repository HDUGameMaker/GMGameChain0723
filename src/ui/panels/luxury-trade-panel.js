const EFFECT_LABELS = {
  goldProductionMul: '黄金产出', civicPointMul: '人文点产出', sciencePointMul: '科技点产出',
  foodConsumeMul: '人口食物消耗', satisfactionBonus: '满意度', growthMul: '人口增长速度',
  housingCapacityMul: '人口容量',
  woodProductionMul: '原木产出', stoneProductionMul: '石头产出', foodProductionMul: '食物产出',
  buildCostMul: '建筑成本', armyHpMul: '军队生命值', armyAttackMul: '军队攻击力', armySpeedMul: '军队移动速度'
};

function formatEffect(key, value) {
  const label = EFFECT_LABELS[key] || key;
  if (key.endsWith('Mul')) {
    const percent = Math.round((value - 1) * 100);
    return `${label} ${percent >= 0 ? '+' : ''}${percent}%`;
  }
  return `${label} ${value >= 0 ? '+' : ''}${value}`;
}

function describeEffects(effects = {}) {
  return Object.entries(effects).map(([key, value]) => formatEffect(key, value)).join(' · ');
}

export function renderLuxuryTradePanel(data, body) {
  const system = window.__game?.systems?.luxury;
  if (!system) return;
  const inventory = system.getInventory();
  body.style.cssText = 'padding:20px 24px;max-height:74vh;overflow:auto;';
  body.innerHTML = '<div style="margin-bottom:14px"><b style="font-size:18px;color:#e7ca83">奢侈品</b><div style="font-size:11px;color:#aaa;margin-top:4px">持有首份即可激活效果；同种奢侈品的效果不会因持有多份而叠加。重复份可在英雄界面赠送。</div></div>';
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;';
  for (const luxury of system.getLuxuries()) {
    const count = inventory[luxury.id] || 0;
    const card = document.createElement('article');
    card.style.cssText = `padding:12px;border:1px solid ${count ? '#a98a4d' : '#3d414a'};border-radius:9px;background:${count ? 'rgba(107,79,31,.14)' : 'rgba(255,255,255,.025)'};color:${count ? '#eee2c7' : '#777'};`;
    const application = luxury.application || {};
    card.innerHTML = `<div style="display:flex;align-items:center;gap:9px"><img src="${luxury.icon}" alt="${luxury.name}" style="width:38px;height:38px" onerror="this.style.visibility='hidden'"><div><b>${luxury.name}</b><div style="font-size:11px">持有 ${count} · 可赠送 ${Math.max(0, count - 1)}</div></div></div><div style="font-size:11px;line-height:1.5;margin-top:8px;color:${count ? '#e5cf9c' : '#777'}">${describeEffects(luxury.effects)} · 满意度 +${luxury.satisfaction || 0}</div><div style="margin-top:7px;padding:7px;border-radius:6px;background:rgba(231,202,131,.08);font-size:10px;line-height:1.5"><b>用途：${application.targetName || '城市发展'}</b><br>${application.useDescription || luxury.description}</div><div style="font-size:10px;color:#c98b92;margin-top:7px">效果唯一：重复持有不叠加</div>`;
    grid.appendChild(card);
  }
  body.appendChild(grid);
}
