/**
 * training-panel.js - 军事训练面板
 * 消耗资源训练军事单位（受军营士兵上限约束）
 */
import { eventBus } from '../../core/EventBus.js';
import { evaluateTrainingEligibility } from '../../systems/TrainingRules.js';

function _store() { return window.__game?.store; }
function _cfg() { return window.__game?.configRegistry?.get('enemies')?.units || []; }
function _resource() { return window.__game?.systems?.resource; }
function _building() { return window.__game?.systems?.building; }
function _avail() { return window.__game?.systems?.army?.getAvailableUnits?.() || {}; }
function _saveAvail(av) {
  window.__game?.systems?.army?.setAvailableUnits?.(av);
}
function _techSystem() { return window.__game?.systems?.tech; }
function _eraSystem() { return window.__game?.systems?.era; }
function _populationSystem() { return window.__game?.systems?.population; }
function _activeBuildingIds() {
  return (_building()?.buildings || []).filter(building => building.status === 'active').map(building => building.buildingId);
}
function unitEraOrder(unit) {
  if (!unit?.eraId) return 0;
  return window.__game?.configRegistry?.getHistoricalContent?.().eras?.find(era => era.id === unit.eraId)?.order ?? 0;
}
const BRANCH_ORDER = ['infantry', 'anti_cavalry', 'ranged', 'archer', 'cavalry', 'siege', 'artillery', 'special', 'air', 'navy'];
const COUNTER_NAMES = {
  infantry: '步兵', light_infantry: '轻步兵', heavy_infantry: '重步兵', light: '轻装单位', melee: '近战单位',
  ranged: '远程部队', archer: '弓弩兵', spear: '长兵器部队', cavalry: '骑兵', mounted: '骑乘单位', armored: '装甲单位',
  armor_piercing: '穿甲部队', siege: '攻城器械', artillery: '炮兵', building: '建筑', fortification: '防御工事', clustered: '密集阵形',
  fire: '火攻', mobile: '机动部队', air: '空中单位', anti_air: '防空单位', gunpowder: '火器部队', support: '支援单位',
  transport: '运输单位', vessel: '舰艇', naval_light: '轻型舰艇', naval_medium: '中型舰艇', naval_heavy: '重型舰艇',
  naval_transport: '运输舰', naval_raider: '袭扰舰', naval_swarm: '舰群', fire_ship: '火攻舰'
};
const formatCounterTags = tags => (tags || []).map(tag => COUNTER_NAMES[tag] || tag).join(' / ') || '无';
function _hasNavalFacility() {
  return (_building()?.buildings || []).some(building => {
    if (building.status !== 'active') return false;
    const config = window.__game?.configRegistry?.getBuilding(building.buildingId);
    return config?.tags?.some(tag => ['naval_facility', 'naval'].includes(tag)) || config?.uniqueFunction?.trainsBranches?.includes('navy');
  });
}

/** 士兵总数 / 容纳上限（上限来自军营的 soldierCapacity） */
function _soldierStats() {
  const bs = _building();
  if (!bs) return { count: 0, cap: 0 };
  return { count: bs.getTotalSoldierCount(), cap: bs.getTotalSoldierCapacity() };
}

/** 检查单位是否已解锁（配置 unlocked=true 或 被科技解锁） */
function _isUnitUnlocked(u) {
  if (u.unlocked !== false) return true;
  const tech = _techSystem();
  return tech && tech.isUnitUnlockedByTech ? tech.isUnitUnlockedByTech(u.id) : false;
}

export function renderTrainingPanel(data, body, pm) {
  body.innerHTML = '';
  body.style.cssText = 'padding:20px 24px;max-height:70vh;overflow-y:auto;';

  const allUnits = _cfg();
  const eraSystem = _eraSystem();
  const currentEra = eraSystem?.getCurrentEra?.();
  const selectedEraId = data?.eraId || currentEra?.id;
  const units = allUnits
    .filter(unit => !unit.eraId || unit.eraId === selectedEraId)
    .sort((a, b) => (BRANCH_ORDER.indexOf(a.branch) - BRANCH_ORDER.indexOf(b.branch)) || (a.combatPower || 0) - (b.combatPower || 0));
  const resourceSys = _resource();
  const soldier = _soldierStats();

  /* 头部 */
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
  header.innerHTML = '<span style="font-size:18px;font-weight:700;color:#ececf0;">🏋️ 军事训练</span>';
  const researchBtn = document.createElement('button');
  researchBtn.textContent = '兵种研发';
  researchBtn.style.cssText = 'padding:7px 14px;border:none;border-radius:6px;background:rgba(91,141,239,0.18);color:#8fb1ff;cursor:pointer;font-size:12px;font-weight:600;';
  researchBtn.addEventListener('click', () => pm.open('unit_research', {}));
  header.appendChild(researchBtn);
  body.appendChild(header);

  const eraTabs = document.createElement('div');
  eraTabs.style.cssText = 'display:flex;gap:6px;overflow-x:auto;margin-bottom:12px;padding-bottom:3px;';
  for (const era of window.__game?.configRegistry?.getHistoricalContent?.().eras || []) {
    const tab = document.createElement('button');
    const locked = currentEra && era.order > currentEra.order;
    tab.textContent = `${locked ? '🔒 ' : ''}${era.name}`;
    tab.style.cssText = `white-space:nowrap;padding:6px 10px;border:1px solid ${era.id === selectedEraId ? '#a8874d' : '#444'};border-radius:6px;background:${era.id === selectedEraId ? '#514021' : '#272a31'};color:${locked ? '#777' : '#ddd'};cursor:pointer;`;
    tab.addEventListener('click', () => renderTrainingPanel({ ...data, eraId: era.id }, body, pm));
    eraTabs.appendChild(tab);
  }
  body.appendChild(eraTabs);

  /* 士兵上限信息栏 */
  const soldierBar = document.createElement('div');
  const atCap = soldier.count >= soldier.cap && soldier.cap > 0;
  soldierBar.style.cssText = 'display:flex;gap:16px;margin-bottom:14px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06);font-size:13px;';
  soldierBar.innerHTML = '<span style="color:' + (atCap ? '#ff6b6b' : '#4ecb71') + ';">⚔️ 士兵: ' + soldier.count + '/' + soldier.cap + '</span>' +
    (soldier.cap <= 0 ? '<span style="color:#f0a040;">（建造军营以解锁训练）</span>' : (atCap ? '<span style="color:#f0a040;">（已达上限，建造/升级军营）</span>' : ''));
  body.appendChild(soldierBar);

  if (units.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:40px;color:#808098;font-size:14px;';
    empty.innerHTML = '没有可训练的单位';
    body.appendChild(empty);
    return;
  }

  let currentBranch = null;
  const branchNames = {
    infantry: '近战步兵', ranged: '远程部队', archer: '远程部队',
    anti_cavalry: '反骑兵', cavalry: '骑兵', siege: '工程与攻城', artillery: '工程与攻城',
    special: '特殊部队', air: '特殊部队', navy: '海军', other: '辅助部队'
  };
  units.forEach(u => {
    if ((u.branch || 'other') !== currentBranch) {
      currentBranch = u.branch || 'other';
      const branchTitle = document.createElement('div');
      branchTitle.textContent = branchNames[currentBranch] || currentBranch;
      branchTitle.style.cssText = 'margin:14px 0 8px;font-size:14px;color:#d3b56f;font-weight:700;border-bottom:1px solid rgba(211,181,111,.25);padding-bottom:5px;';
      body.appendChild(branchTitle);
    }
    const card = document.createElement('div');
    card.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.08);margin-bottom:10px;padding:14px;';
    if (!_isUnitUnlocked(u)) { card.style.opacity = '0.5'; }

    /* 名称 & 属性 */
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:14px;margin-bottom:10px;';
    top.innerHTML = '<div style="position:relative;flex:0 0 112px;width:112px;height:112px;overflow:hidden;border-radius:11px;background:radial-gradient(circle at 50% 35%,rgba(214,176,103,.17),rgba(13,17,24,.92));border:1px solid rgba(214,176,103,.28)">' +
      '<img data-testid="unit-card-art" src="' + (u.cardArt || u.icon) + '" alt="' + u.name + ' 招募立绘" loading="lazy" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 7px 7px rgba(0,0,0,.5))">' +
      '<img src="' + u.icon + '" alt="" style="position:absolute;right:6px;bottom:6px;width:28px;height:28px;object-fit:contain;border-radius:6px;background:rgba(8,12,18,.88);border:1px solid rgba(255,255,255,.22);padding:3px"></div>' +
      '<div style="min-width:0"><span style="display:block;font-size:16px;font-weight:700;color:#ececf0;margin-bottom:6px;">' + (_isUnitUnlocked(u) ? '' : '🔒 ') + u.name + '</span>' +
      '<span style="display:block;font-size:12px;color:#808098;line-height:1.7;">' + ((u.domain === 'naval') ? '海军' : '陆军') + '<br>⚔️ 战力 ' + u.combatPower + ' · 指挥点 ' + (u.commandPoints||1) + '</span></div>';
    card.appendChild(top);

    const counters = document.createElement('div');
    counters.style.cssText = 'font-size:10px;color:#8fa5c6;margin:-4px 0 9px;';
    counters.textContent = `克制：${formatCounterTags(u.strongAgainst)}　受制：${formatCounterTags(u.weakAgainst)}`;
    card.appendChild(counters);

    /* 未解锁提示 */
    if (!_isUnitUnlocked(u)) {
      const lockMsg = document.createElement('div');
      lockMsg.style.cssText = 'font-size:11px;color:#f0a040;margin-bottom:8px;';
      lockMsg.textContent = '🔒 需要在「兵种研发」中完成专项研发';
      card.appendChild(lockMsg);
    }

    /* 消耗资源列表 */
    const costs = u.cost || [];
    const costHtml = costs.map(c => {
      const rConfig = (window.__game?.configRegistry?.get('resources') || []).find(r => r.id === c.resourceId);
      const rName = rConfig ? rConfig.name : c.resourceId;
      return '<span style="background:rgba(255,255,255,0.04);padding:2px 8px;border-radius:4px;font-size:12px;">' + rName + ': ' + c.amount + '</span>';
    }).join(' ');
    if (costHtml) {
      const costRow = document.createElement('div');
      costRow.style.cssText = 'font-size:12px;color:#a0a0ba;margin-bottom:10px;';
      costRow.innerHTML = '消耗: ' + costHtml;
      card.appendChild(costRow);
    }

    /* 训练按钮 */
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;align-items:center;';

    const availCount = _avail()[u.id] || 0;
    const countLabel = document.createElement('span');
    countLabel.style.cssText = 'font-size:12px;color:#808098;';
    countLabel.textContent = '已训练: ' + availCount;
    btnRow.appendChild(countLabel);

    const eligibility = evaluateTrainingEligibility({
      unit: u,
      canAfford: resourceSys ? resourceSys.canAfford(costs) : false,
      soldierCount: soldier.count,
      soldierCap: soldier.cap,
      isUnlocked: _isUnitUnlocked(u),
      hasNavalFacility: _hasNavalFacility(),
      currentEraOrder: currentEra?.order ?? 0,
      unitEraOrder: unitEraOrder(u),
      activeBuildingIds: _activeBuildingIds(),
      selectedCivilizationId: eraSystem?.getSelectedCivilization?.()?.id || null,
      availablePopulation: _populationSystem()?.getAvailableWorkers?.() ?? 0
    });
    const canTrain = eligibility.ok;

    const trainBtn = document.createElement('button');
    trainBtn.textContent = '训练 x1';
    trainBtn.style.cssText = 'padding:6px 16px;border:none;border-radius:6px;background:' + (canTrain ? 'rgba(78,203,113,0.2)' : 'rgba(128,128,152,0.15)') + ';color:' + (canTrain ? '#4ecb71' : '#808098') + ';cursor:' + (canTrain ? 'pointer' : 'default') + ';font-size:12px;font-weight:600;';
    trainBtn.addEventListener('mouseenter', () => { if (canTrain) trainBtn.style.background = 'rgba(78,203,113,0.35)'; });
    trainBtn.addEventListener('mouseleave', () => { if (canTrain) trainBtn.style.background = 'rgba(78,203,113,0.2)'; });
    trainBtn.addEventListener('click', () => {
      const s = _soldierStats(); // 重新读取，避免连点失同步
      const current = evaluateTrainingEligibility({
        unit: u,
        canAfford: resourceSys ? resourceSys.canAfford(costs) : false,
        soldierCount: s.count,
        soldierCap: s.cap,
        isUnlocked: _isUnitUnlocked(u),
        hasNavalFacility: _hasNavalFacility(),
        currentEraOrder: currentEra?.order ?? 0,
        unitEraOrder: unitEraOrder(u),
        activeBuildingIds: _activeBuildingIds(),
        selectedCivilizationId: eraSystem?.getSelectedCivilization?.()?.id || null,
        availablePopulation: _populationSystem()?.getAvailableWorkers?.() ?? 0
      });
      if (!current.ok) {
        pm.alert('训练失败：' + current.reasons.join('，'));
        return;
      }
      if (resourceSys) resourceSys.consumeAll(costs);
      const av = { ..._avail() };
      av[u.id] = (av[u.id] || 0) + 1;
      _saveAvail(av);
      /* 刷新面板让士兵数实时更新 */
      renderTrainingPanel(data, body, pm);
    });
    btnRow.appendChild(trainBtn);

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = '遣散 x1';
    const canDismiss = availCount > 0 && _isUnitUnlocked(u);
    dismissBtn.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:' + (canDismiss ? 'rgba(240,160,64,0.16)' : 'rgba(128,128,152,0.12)') + ';color:' + (canDismiss ? '#f0a040' : '#808098') + ';cursor:' + (canDismiss ? 'pointer' : 'default') + ';font-size:12px;font-weight:600;';
    dismissBtn.title = '遣散后释放士兵名额';
    dismissBtn.addEventListener('mouseenter', () => { if (canDismiss) dismissBtn.style.background = 'rgba(240,160,64,0.28)'; });
    dismissBtn.addEventListener('mouseleave', () => { if (canDismiss) dismissBtn.style.background = 'rgba(240,160,64,0.16)'; });
    dismissBtn.addEventListener('click', () => {
      if (!canDismiss) return;
      const av = { ..._avail() };
      av[u.id] = Math.max(0, (av[u.id] || 0) - 1);
      _saveAvail(av);
      renderTrainingPanel(data, body, pm);
    });
    btnRow.appendChild(dismissBtn);
    card.appendChild(btnRow);

    body.appendChild(card);
  });
}
