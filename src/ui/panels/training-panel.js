/**
 * training-panel.js - 军事训练面板
 * 消耗资源和工人训练军事单位
 */

const DEFAULT_AVAIL = 10;

function _store() { return window.__game?.store; }
function _cfg() { return window.__game?.configRegistry?.get('enemies')?.units || []; }
function _resource() { return window.__game?.systems?.resource; }
function _population() { return window.__game?.systems?.population; }
function _avail() { return _store()?.getState('availableUnits') || {}; }
function _saveAvail(av) { _store()?.setState({ availableUnits: av }); }
function _techSystem() { return window.__game?.systems?.tech; }

/** 检查单位是否已解锁（配置 unlocked=true 或 被科技解锁） */
function _isUnitUnlocked(u) {
  if (u.unlocked !== false) return true;
  const tech = _techSystem();
  return tech && tech.isUnitUnlockedByTech ? tech.isUnitUnlockedByTech(u.id) : false;
}

export function renderTrainingPanel(data, body, pm) {
  body.innerHTML = '';
  body.style.cssText = 'padding:20px 24px;max-height:70vh;overflow-y:auto;';

  const units = _cfg();
  const resourceSys = _resource();
  const popSys = _population();
  const availWorkers = popSys ? popSys.getAvailableWorkers() : 0;

  /* 头部 */
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
  header.innerHTML = '<span style="font-size:18px;font-weight:700;color:#ececf0;">🏋️ 军事训练</span>';
  body.appendChild(header);

  /* 工人信息栏 */
  const workerBar = document.createElement('div');
  workerBar.style.cssText = 'display:flex;gap:16px;margin-bottom:14px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06);font-size:13px;';
  workerBar.innerHTML = '<span style="color:#4ecb71;">👷 可用工人: ' + availWorkers + '</span>';
  body.appendChild(workerBar);

  if (units.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:40px;color:#808098;font-size:14px;';
    empty.innerHTML = '没有可训练的单位';
    body.appendChild(empty);
    return;
  }

  units.forEach(u => {
    const card = document.createElement('div');
    card.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.08);margin-bottom:10px;padding:14px;';
    if (!_isUnitUnlocked(u)) { card.style.opacity = '0.5'; }

    /* 名称 & 属性 */
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:10px;';
    top.innerHTML = '<span style="font-size:15px;font-weight:600;color:#ececf0;">' + (_isUnitUnlocked(u) ? '' : '🔒 ') + u.name + '</span>' +
      '<span style="font-size:12px;color:#808098;">⚔️' + u.combatPower + ' · CP' + (u.commandPoints||1) + ' · 👷需求' + (u.populationRequired||0) + '</span>';
    card.appendChild(top);

    /* 未解锁提示 */
    if (!_isUnitUnlocked(u)) {
      const lockMsg = document.createElement('div');
      lockMsg.style.cssText = 'font-size:11px;color:#f0a040;margin-bottom:8px;';
      lockMsg.textContent = '🔒 需要研究对应科技解锁';
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

    const canAfford = resourceSys ? resourceSys.canAfford(costs) : false;
    const hasWorkers = (u.populationRequired || 0) <= availWorkers;
    const canTrain = canAfford && hasWorkers;

    const trainBtn = document.createElement('button');
    trainBtn.textContent = '训练 x1';
    trainBtn.style.cssText = 'padding:6px 16px;border:none;border-radius:6px;background:' + (canTrain ? 'rgba(78,203,113,0.2)' : 'rgba(128,128,152,0.15)') + ';color:' + (canTrain ? '#4ecb71' : '#808098') + ';cursor:' + (canTrain ? 'pointer' : 'default') + ';font-size:12px;font-weight:600;';
    trainBtn.addEventListener('mouseenter', () => { if (canTrain) trainBtn.style.background = 'rgba(78,203,113,0.35)'; });
    trainBtn.addEventListener('mouseleave', () => { if (canTrain) trainBtn.style.background = 'rgba(78,203,113,0.2)'; });
    trainBtn.addEventListener('click', () => {
      if (!canTrain) {
        let msg = '训练失败：';
        const reasons = [];
        if (!canAfford) reasons.push('资源不足');
        if (!hasWorkers) reasons.push('可用工人不足（需要' + (u.populationRequired||0) + '，可用' + availWorkers + '）');
        alert(msg + reasons.join('，'));
        return;
      }
      if (resourceSys) resourceSys.consumeAll(costs);
      /* 占用工人：人口变为受训部队，不再作为可用工人 */
      if (popSys && u.populationRequired) popSys.occupyForConstruction(u.populationRequired);
      const av = { ..._avail() };
      av[u.id] = (av[u.id] || 0) + 1;
      _saveAvail(av);
      /* 刷新面板让可用工人数实时更新 */
      renderTrainingPanel(data, body, pm);
    });
    btnRow.appendChild(trainBtn);
    card.appendChild(btnRow);

    body.appendChild(card);
  });
}
