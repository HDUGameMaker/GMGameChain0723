/**
 * Building-scoped military training panel.
 * Eligibility and training mutations belong to ArmySystem; this module only renders and delegates.
 */

function game() { return window.__game; }
function armySystem() { return game()?.systems?.army; }
function buildingSystem() { return game()?.systems?.building; }
function techSystem() { return game()?.systems?.tech; }
function eraSystem() { return game()?.systems?.era; }
function availableUnits() { return armySystem()?.getAvailableUnits?.() || {}; }

const BRANCH_ORDER = ['infantry', 'anti_cavalry', 'ranged', 'archer', 'cavalry', 'siege', 'artillery', 'special', 'air', 'navy'];
const BRANCH_NAMES = {
  infantry: '近战步兵', anti_cavalry: '反骑兵', ranged: '远程部队', archer: '远程部队',
  cavalry: '骑兵', siege: '工程与攻城', artillery: '工程与攻城', special: '特殊部队',
  air: '空军', navy: '海军', other: '辅助部队'
};
const COUNTER_NAMES = {
  infantry: '步兵', light_infantry: '轻步兵', heavy_infantry: '重步兵', light: '轻装单位', melee: '近战单位',
  ranged: '远程部队', archer: '弓弩兵', spear: '长兵器部队', cavalry: '骑兵', mounted: '骑乘单位', armored: '装甲单位',
  armor_piercing: '穿甲部队', siege: '攻城器械', artillery: '炮兵', building: '建筑', fortification: '防御工事', clustered: '密集阵形',
  fire: '火攻', mobile: '机动部队', air: '空中单位', anti_air: '防空单位', gunpowder: '火器部队', support: '支援单位',
  transport: '运输单位', vessel: '舰艇', naval_light: '轻型舰艇', naval_medium: '中型舰艇', naval_heavy: '重型舰艇',
  naval_transport: '运输舰', naval_raider: '袭扰舰', naval_swarm: '舰群', fire_ship: '火攻舰'
};

function isUnitUnlocked(unit) {
  return unit.unlocked !== false || techSystem()?.isUnitUnlockedByTech?.(unit.id) === true;
}

function soldierStats() {
  const buildings = buildingSystem();
  return {
    count: buildings?.getTotalSoldierCount?.() || 0,
    cap: buildings?.getTotalSoldierCapacity?.() || 0
  };
}

function renderInvalidContext(body) {
  const invalid = document.createElement('div');
  invalid.style.cssText = 'text-align:center;padding:40px;color:#ff6b6b;font-size:14px;';
  invalid.textContent = '训练建筑无效，请从可训练单位的建筑详情进入。';
  body.appendChild(invalid);
}

function getTrainingContext(data) {
  const buildingIndex = data?.buildingIndex;
  const building = Number.isInteger(buildingIndex) ? buildingSystem()?.buildings?.[buildingIndex] : null;
  const config = building ? game()?.configRegistry?.getBuilding?.(building.buildingId) : null;
  const branches = config?.uniqueFunction?.trainsBranches;
  if (!building || building.status !== 'active' || building._invalid
    || !Array.isArray(branches) || branches.length === 0) return null;
  return { buildingIndex, building, config };
}

function renderUnitCard(unit, context, body, pm, rerender) {
  const card = document.createElement('div');
  card.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.08);margin-bottom:10px;padding:14px;';
  if (!isUnitUnlocked(unit)) card.style.opacity = '0.5';

  const top = document.createElement('div');
  top.style.cssText = 'display:flex;align-items:center;gap:14px;margin-bottom:10px;';
  top.innerHTML = `<div style="position:relative;flex:0 0 112px;width:112px;height:112px;overflow:hidden;border-radius:11px;background:rgba(13,17,24,.92);border:1px solid rgba(214,176,103,.28)">
    <img data-testid="unit-card-art" data-fallback-src="${unit.icon || ''}" src="${unit.cardArt || unit.icon || ''}" alt="${unit.name} 招募立绘" loading="lazy" style="width:100%;height:100%;object-fit:contain">
    ${unit.icon ? `<img src="${unit.icon}" alt="" style="position:absolute;right:6px;bottom:6px;width:28px;height:28px;object-fit:contain;border-radius:6px;background:rgba(8,12,18,.88);padding:3px">` : ''}
  </div><div style="min-width:0"><span style="display:block;font-size:16px;font-weight:700;color:#ececf0;margin-bottom:6px;">${isUnitUnlocked(unit) ? '' : '🔒 '}${unit.name}</span>
  <span style="display:block;font-size:12px;color:#808098;line-height:1.7;">${unit.domain === 'naval' ? '海军' : '陆军'}<br>⚔️ 战力 ${unit.combatPower || 0} · 指挥点 ${unit.commandPoints || 1}</span></div>`;
  card.appendChild(top);
  const cardArt = top.querySelector?.('[data-testid="unit-card-art"]');
  cardArt?.addEventListener('error', () => {
    const fallback = cardArt.dataset.fallbackSrc;
    if (!cardArt.dataset.fallbackApplied && fallback) {
      cardArt.dataset.fallbackApplied = 'true';
      cardArt.src = fallback;
      return;
    }
    cardArt.style.display = 'none';
  });

  const counters = document.createElement('div');
  counters.style.cssText = 'font-size:10px;color:#8fa5c6;margin:-4px 0 9px;';
  const formatCounters = tags => (tags || []).map(tag => COUNTER_NAMES[tag] || tag).join(' / ') || '无';
  counters.textContent = `克制：${formatCounters(unit.strongAgainst)}　受制：${formatCounters(unit.weakAgainst)}`;
  card.appendChild(counters);

  if (!isUnitUnlocked(unit)) {
    const locked = document.createElement('div');
    locked.style.cssText = 'font-size:11px;color:#f0a040;margin-bottom:8px;';
    locked.textContent = '🔒 需要在「兵种研发」中完成专项研发';
    card.appendChild(locked);
  }

  const costs = unit.cost || [];
  if (costs.length > 0) {
    const costRow = document.createElement('div');
    costRow.style.cssText = 'font-size:12px;color:#a0a0ba;margin-bottom:10px;';
    costRow.textContent = `消耗：${costs.map(cost => {
      const resource = (game()?.configRegistry?.get('resources') || []).find(item => item.id === cost.resourceId);
      return `${resource?.name || cost.resourceId}×${cost.amount}`;
    }).join(' + ')}`;
    card.appendChild(costRow);
  }

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;';
  const reserve = availableUnits()[unit.id] || 0;
  const count = document.createElement('span');
  count.style.cssText = 'font-size:12px;color:#808098;';
  count.textContent = `已训练：${reserve}`;
  row.appendChild(count);

  const eligibility = armySystem()?.canTrainUnitAt?.(context.buildingIndex, unit.id) || { ok: false };
  const train = document.createElement('button');
  train.dataset.testid = `train-unit-${unit.id}`;
  train.textContent = '训练 x1';
  train.disabled = !eligibility.ok;
  train.title = eligibility.reasons?.join('；') || '';
  train.style.cssText = `padding:6px 16px;border:none;border-radius:6px;background:${eligibility.ok ? 'rgba(78,203,113,0.2)' : 'rgba(128,128,152,0.15)'};color:${eligibility.ok ? '#4ecb71' : '#808098'};cursor:${eligibility.ok ? 'pointer' : 'default'};font-size:12px;font-weight:600;`;
  train.addEventListener('click', () => {
    const result = armySystem()?.trainUnitAt?.(context.buildingIndex, unit.id) || { ok: false };
    if (!result.ok) {
      pm.alert(`训练失败：${result.reasons?.join('；') || result.reason || '未知原因'}`);
      return;
    }
    rerender();
  });
  row.appendChild(train);

  const dismiss = document.createElement('button');
  dismiss.textContent = '遣散 x1';
  dismiss.disabled = reserve <= 0;
  dismiss.style.cssText = `padding:6px 14px;border:none;border-radius:6px;background:${reserve > 0 ? 'rgba(240,160,64,0.16)' : 'rgba(128,128,152,0.12)'};color:${reserve > 0 ? '#f0a040' : '#808098'};cursor:${reserve > 0 ? 'pointer' : 'default'};font-size:12px;font-weight:600;`;
  dismiss.addEventListener('click', () => {
    if (reserve <= 0) return;
    const next = availableUnits();
    next[unit.id] = reserve - 1;
    armySystem()?.setAvailableUnits?.(next);
    rerender();
  });
  row.appendChild(dismiss);
  card.appendChild(row);
  body.appendChild(card);
}

export function renderTrainingPanel(data, body, pm) {
  body.innerHTML = '';
  body.style.cssText = 'padding:20px 24px;max-height:70vh;overflow-y:auto;';
  const context = getTrainingContext(data);
  if (!context) {
    renderInvalidContext(body);
    return;
  }

  const currentEra = eraSystem()?.getCurrentEra?.();
  const selectedEraId = data?.eraId || currentEra?.id;
  const units = (armySystem()?.getTrainableUnitsAt?.(context.buildingIndex) || [])
    .filter(unit => !unit.eraId || unit.eraId === selectedEraId)
    .sort((left, right) => (BRANCH_ORDER.indexOf(left.branch) - BRANCH_ORDER.indexOf(right.branch))
      || (left.combatPower || 0) - (right.combatPower || 0));
  const rerender = () => renderTrainingPanel(data, body, pm);

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
  header.innerHTML = `<span style="font-size:18px;font-weight:700;color:#ececf0;">⚔️ ${context.config.name} · 军事训练</span>`;
  const research = document.createElement('button');
  research.textContent = '兵种研发';
  research.style.cssText = 'padding:7px 14px;border:none;border-radius:6px;background:rgba(91,141,239,0.18);color:#8fb1ff;cursor:pointer;font-size:12px;font-weight:600;';
  research.addEventListener('click', () => pm.open('unit_research', {}));
  header.appendChild(research);
  body.appendChild(header);

  const tabs = document.createElement('div');
  tabs.style.cssText = 'display:flex;gap:6px;overflow-x:auto;margin-bottom:12px;padding-bottom:3px;';
  for (const era of game()?.configRegistry?.getHistoricalContent?.().eras || []) {
    const tab = document.createElement('button');
    const locked = currentEra && era.order > currentEra.order;
    tab.textContent = `${locked ? '🔒 ' : ''}${era.name}`;
    tab.style.cssText = `white-space:nowrap;padding:6px 10px;border:1px solid ${era.id === selectedEraId ? '#a8874d' : '#444'};border-radius:6px;background:${era.id === selectedEraId ? '#514021' : '#272a31'};color:${locked ? '#777' : '#ddd'};cursor:pointer;`;
    tab.addEventListener('click', () => renderTrainingPanel({ ...data, eraId: era.id }, body, pm));
    tabs.appendChild(tab);
  }
  body.appendChild(tabs);

  const soldier = soldierStats();
  const summary = document.createElement('div');
  summary.style.cssText = 'margin-bottom:14px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:13px;';
  summary.textContent = `⚔️ 士兵：${soldier.count}/${soldier.cap}`;
  body.appendChild(summary);

  if (units.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:40px;color:#808098;font-size:14px;';
    empty.textContent = '该建筑在所选时代没有可训练单位';
    body.appendChild(empty);
    return;
  }

  let branch = null;
  for (const unit of units) {
    if ((unit.branch || 'other') !== branch) {
      branch = unit.branch || 'other';
      const title = document.createElement('div');
      title.textContent = BRANCH_NAMES[branch] || branch;
      title.style.cssText = 'margin:14px 0 8px;font-size:14px;color:#d3b56f;font-weight:700;border-bottom:1px solid rgba(211,181,111,.25);padding-bottom:5px;';
      body.appendChild(title);
    }
    renderUnitCard(unit, context, body, pm, rerender);
  }
}
