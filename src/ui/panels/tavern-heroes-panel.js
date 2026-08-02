import { configRegistry } from '../../core/ConfigRegistry.js';
import { store } from '../../core/Store.js';

const ROLE_NAMES = { commander: '统帅', diplomat: '外交家', engineer: '工程师', explorer: '探险家', physician: '医师', scholar: '学者' };
const ASSIGNMENTS = { council: '议会', army: '军团', expedition: '远征', diplomacy: '外交' };

function bonusText(bonuses = {}) {
  const names = { combatPowerMul: '军团战力', commandPointsBonus: '指挥点', researchSpeedMul: '研究速度', productionMul: '生产', unitHpMul: '部队生命', navalPowerMul: '海军战力', expeditionYieldMul: '远征收益', diplomacyRelationBonus: '外交关系', healingRateBonus: '治疗', growthMul: '人口增长', buildCostMul: '建造成本', siegePowerMul: '攻城战力', armySpeedMul: '机动' };
  return Object.entries(bonuses).map(([key, value]) => {
    const valueText = key.endsWith('Mul') ? `${value >= 1 ? '+' : ''}${Math.round((value - 1) * 100)}%` : `+${value}`;
    return `${names[key] || key}${valueText}`;
  }).join(' · ');
}

export function renderTavernHeroesPanel(data, body, pm) {
  const system = window.__game?.systems?.hero;
  if (!system) { body.innerHTML = '<div style="padding:40px;color:#808098;">英雄系统未加载</div>'; return; }
  body.style.cssText = 'padding:20px 24px;max-height:72vh;overflow:auto;';
  const inspiration = store.getState('inspiration') || 0;
  const recruited = system.getRecruitedHeroes();
  const assigned = recruited.filter(hero => hero.assignment).length;
  const refreshDays = configRegistry.get('eaIntegration')?.heroSettings?.refreshDays || 3;
  body.innerHTML = `<div style="display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:16px;"><div><b style="font-size:19px;color:#ececf0;">🍺 历史英雄酒馆</b><div style="font-size:11px;color:#808098;margin-top:3px;">访客每 ${refreshDays} 日轮换</div></div><div style="font-size:12px;color:#d6a84b;">💡 ${inspiration}　任命 ${assigned}/${system.getAssignmentLimit()}</div></div>`;

  const offerTitle = document.createElement('div');
  offerTitle.style.cssText = 'font-size:13px;font-weight:700;color:#c8c8d6;margin:10px 0;';
  offerTitle.textContent = '当前访客';
  body.appendChild(offerTitle);
  const offers = document.createElement('div');
  offers.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:9px;margin-bottom:18px;';
  for (const hero of system.getAvailableHeroes()) {
    const card = document.createElement('div');
    card.style.cssText = 'padding:12px;border:1px solid rgba(214,168,75,.3);border-radius:9px;background:rgba(214,168,75,.06);';
    const costs = (hero.cost || []).map(cost => `${configRegistry.getResource(cost.resourceId)?.name || cost.resourceId} ${cost.amount}`).join('、');
    card.innerHTML = `<div style="font-size:16px;color:#ececf0;font-weight:700;">${hero.icon} ${hero.name} <small style="font-size:10px;color:#d6a84b;">${hero.title}</small></div><div style="font-size:10px;color:#8fb1ff;margin:4px 0;">${hero.era} · ${ROLE_NAMES[hero.role] || hero.role}</div><div style="font-size:11px;color:#a0a0ba;line-height:1.45;">${hero.description}</div><div style="font-size:10px;color:#64c987;margin-top:6px;">${bonusText(hero.bonuses)}</div><div style="font-size:10px;color:#d6a84b;margin-top:5px;">💡 ${hero.inspirationCost}${costs ? ' · ' + costs : ''}</div>`;
    const button = document.createElement('button');
    button.textContent = '招募';
    button.style.cssText = 'width:100%;margin-top:9px;padding:7px;border:none;border-radius:6px;background:rgba(214,168,75,.2);color:#f1cf7a;cursor:pointer;font-weight:700;';
    button.addEventListener('click', () => {
      const result = system.recruitHero(hero.id);
      if (!result.ok) pm.alert(result.reason);
      else renderTavernHeroesPanel(data, body, pm);
    });
    card.appendChild(button);
    offers.appendChild(card);
  }
  if (!offers.children.length) offers.innerHTML = '<div style="color:#808098;font-size:12px;">当前没有新的访客，等待下一次轮换。</div>';
  body.appendChild(offers);

  const rosterTitle = document.createElement('div');
  rosterTitle.style.cssText = 'font-size:13px;font-weight:700;color:#c8c8d6;margin:10px 0;';
  rosterTitle.textContent = '已招募英雄';
  body.appendChild(rosterTitle);
  for (const hero of recruited) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;margin-bottom:7px;border-radius:8px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);';
    row.innerHTML = `<div><b style="color:#ececf0;">${hero.icon} ${hero.name}</b><div style="font-size:10px;color:#64c987;margin-top:3px;">${bonusText(hero.bonuses)}</div></div>`;
    const select = document.createElement('select');
    select.style.cssText = 'padding:6px 8px;border-radius:6px;background:#25253a;color:#dfe8ff;border:1px solid #4a4a66;';
    select.innerHTML = '<option value="">未任命</option>' + Object.entries(ASSIGNMENTS).map(([id, name]) => `<option value="${id}" ${hero.assignment === id ? 'selected' : ''}>${name}</option>`).join('');
    select.addEventListener('change', () => {
      const result = system.assignHero(hero.id, select.value);
      if (!result.ok) pm.alert(result.reason);
      renderTavernHeroesPanel(data, body, pm);
    });
    row.appendChild(select);
    body.appendChild(row);
  }
  if (!recruited.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#808098;font-size:12px;';
    empty.textContent = '尚未招募英雄。';
    body.appendChild(empty);
  }
}
