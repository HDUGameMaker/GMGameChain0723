import { calculateCombatStrength } from '../../domain/CombatStrength.js';

export function renderEnemyDetailPanel(data, body) {
  const enemy = data?.enemy || {};
  const rows = [
    ['综合战力', enemy.combatStrength ?? calculateCombatStrength(enemy)],
    ['势力', enemy.faction || enemy.factionName || '敌对势力'],
    ['攻击力', enemy.attack ?? enemy.strength ?? 0],
    ['生命值', `${enemy.hp ?? enemy.maxHp ?? enemy.strength ?? 0}/${enemy.maxHp ?? enemy.hp ?? enemy.strength ?? 0}`],
    ['攻击范围', enemy.attackRange ?? 1],
    ['速度', enemy.speed ?? 1],
    ['CP', enemy.cp ?? 1]
  ];
  body.innerHTML = '';
  body.style.cssText = 'padding:22px 26px;min-width:340px;';
  const card = document.createElement('div');
  card.style.cssText = 'padding:18px;border:1px solid rgba(211,92,92,.45);border-radius:12px;background:rgba(70,24,28,.24);color:#ececf0;';
  card.innerHTML = `<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px"><img src="${enemy.icon || ''}" alt="" style="width:64px;height:64px;object-fit:contain" onerror="this.style.display='none'"><div><div style="font-size:20px;font-weight:700;color:#ffb0a8">${enemy.name || '敌方部队'}</div><div style="font-size:12px;color:#b99494">位置 ${data?.gridX ?? enemy.gridX ?? enemy.x ?? '-'},${data?.gridY ?? enemy.gridY ?? enemy.y ?? '-'}</div></div></div>`;
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;padding:8px 4px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;';
    row.innerHTML = `<span style="color:#aaa">${label}</span><b>${value}</b>`;
    card.appendChild(row);
  }
  body.appendChild(card);
}
