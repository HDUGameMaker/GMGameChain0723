import { configRegistry } from '../../core/ConfigRegistry.js';
import { store } from '../../core/Store.js';

const ROLE_NAMES = { commander: '统帅', diplomat: '外交家', engineer: '工程师', explorer: '探险家', physician: '医师', scholar: '学者', governor: '总督' };
const ASSIGNMENTS = { governor: '城市治理', army: '军团', expedition: '探险队', diplomacy: '外交使团', research: '研究机构' };

function bonusText(bonuses = {}) {
  const names = { combatPowerMul: '军团战力', commandPointsBonus: '指挥点', researchSpeedMul: '研究速度', productionMul: '生产', unitHpMul: '部队生命', navalPowerMul: '海军战力', expeditionYieldMul: '探险收益', diplomacyRelationBonus: '外交关系', healingRateBonus: '恢复', growthMul: '人口增长', buildCostMul: '建造成本', siegePowerMul: '攻城战力', armySpeedMul: '机动' };
  return Object.entries(bonuses).map(([key, value]) => {
    const valueText = key.endsWith('Mul') ? `${value >= 1 ? '+' : ''}${Math.round((value - 1) * 100)}%` : `+${value}`;
    return `${names[key] || key}${valueText}`;
  }).join(' · ');
}

function portrait(hero) {
  return hero.icon?.includes('/')
    ? `<img src="${hero.icon}" alt="" style="width:42px;height:42px;border-radius:8px;background:#262a39">`
    : `<span style="font-size:32px">${hero.icon || '👤'}</span>`;
}

export function renderTavernHeroesPanel(data, body, pm) {
  const system = window.__game?.systems?.hero;
  if (!system) { body.innerHTML = '<div style="padding:40px;color:#808098">英雄系统尚未加载。</div>'; return; }
  body.style.cssText = 'padding:20px 24px;max-height:72vh;overflow:auto;';
  const inspiration = store.getState('inspiration') || 0;
  const recruited = system.getRecruitedHeroes();
  const assigned = recruited.filter(hero => hero.assignment).length;
  const refreshDays = configRegistry.get('eaIntegration')?.heroSettings?.refreshDays || 3;
  body.innerHTML = `<div style="display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:16px"><div><b style="font-size:19px;color:#ececf0">🍺 历史人物酒馆</b><div style="font-size:11px;color:#808098;margin-top:3px">访客每 ${refreshDays} 天轮换；人物受伤后会休养并自动回归</div></div><div style="font-size:12px;color:#d6a84b">人文影响力 ${inspiration}　任命 ${assigned}/${system.getAssignmentLimit()}</div></div>`;

  const offers = document.createElement('div');
  offers.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:9px;margin-bottom:20px;';
  for (const hero of system.getAvailableHeroes()) {
    const card = document.createElement('div');
    card.style.cssText = 'padding:12px;border:1px solid rgba(214,168,75,.3);border-radius:9px;background:rgba(214,168,75,.06);';
    const costs = (hero.cost || []).map(cost => `${configRegistry.getResource(cost.resourceId)?.name || cost.resourceId} ${cost.amount}`).join(' · ');
    card.innerHTML = `<div style="display:flex;gap:10px;align-items:center">${portrait(hero)}<div><b style="font-size:16px;color:#ececf0">${hero.name}</b><div style="font-size:10px;color:#d6a84b">${hero.era || '历史人物'} · ${ROLE_NAMES[hero.role] || hero.role}</div></div></div><div style="font-size:11px;color:#a0a0ba;line-height:1.45;margin-top:8px">${hero.description}</div><div style="font-size:10px;color:#64c987;margin-top:6px">${bonusText(hero.bonuses)}</div><div style="font-size:10px;color:#d6a84b;margin-top:5px">${hero.inspirationCost ? `人文影响力 ${hero.inspirationCost} · ` : ''}${costs}</div>`;
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
  if (!offers.children.length) offers.innerHTML = '<div style="color:#808098;font-size:12px">当前没有新的访客，请等待下一次轮换。</div>';
  body.appendChild(offers);

  const title = document.createElement('div');
  title.style.cssText = 'font-size:13px;font-weight:700;color:#c8c8d6;margin:10px 0;';
  title.textContent = '已招募人物';
  body.appendChild(title);
  for (const hero of recruited) {
    const injured = hero.status === 'injured';
    const row = document.createElement('div');
    row.style.cssText = `display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;margin-bottom:7px;border-radius:8px;background:${injured ? 'rgba(140,52,52,.10)' : 'rgba(255,255,255,.035)'};border:1px solid ${injured ? 'rgba(220,95,95,.25)' : 'rgba(255,255,255,.07)'};`;
    row.innerHTML = `<div style="display:flex;gap:9px;align-items:center">${portrait(hero)}<div><b style="color:#ececf0">${hero.name}</b>${injured ? `<span style="font-size:10px;color:#ef8b8b;margin-left:7px">休养至第 ${hero.injuredUntilDay} 天</span>` : ''}<div style="font-size:10px;color:#64c987;margin-top:3px">${bonusText(hero.bonuses)}</div></div></div>`;
    const select = document.createElement('select');
    select.disabled = injured;
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
  if (!recruited.length) body.insertAdjacentHTML('beforeend', '<div style="color:#808098;font-size:12px">尚未招募历史人物。</div>');
}
