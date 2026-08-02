/**
 * training-panel.js - 军事训练面板
 * 消耗资源训练军事单位（受军营士兵上限约束）
 */
import { eventBus } from '../../core/EventBus.js';

function _store() { return window.__game?.store; }
function _cfg() { return window.__game?.configRegistry?.get('enemies')?.units || []; }
function _resource() { return window.__game?.systems?.resource; }
function _building() { return window.__game?.systems?.building; }
function _avail() { return _store()?.getState('availableUnits') || {}; }
function _saveAvail(av) {
  const version = (_store()?.getState('armyVersion') || 0) + 1;
  _store()?.setState({ availableUnits: { ...av }, armyVersion: version });
  eventBus.emit('armyChanged', { reason: 'training', version });
}
function _techSystem() { return window.__game?.systems?.tech; }

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

  const units = _cfg();
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

  units.forEach(u => {
    const card = document.createElement('div');
    card.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.08);margin-bottom:10px;padding:14px;';
    if (!_isUnitUnlocked(u)) { card.style.opacity = '0.5'; }

    /* 名称 & 属性 */
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:10px;';
    top.innerHTML = '<span style="font-size:15px;font-weight:600;color:#ececf0;">' + (_isUnitUnlocked(u) ? '' : '🔒 ') + u.name + '</span>' +
      '<span style="font-size:12px;color:#808098;">' + ((u.domain === 'naval') ? '海军' : '陆军') + ' · ⚔️' + u.combatPower + ' · CP' + (u.commandPoints||1) + '</span>';
    card.appendChild(top);

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

    const canAfford = resourceSys ? resourceSys.canAfford(costs) : false;
    const hasCapacity = soldier.count < soldier.cap;
    const canTrain = canAfford && hasCapacity;

    const trainBtn = document.createElement('button');
    trainBtn.textContent = '训练 x1';
    trainBtn.style.cssText = 'padding:6px 16px;border:none;border-radius:6px;background:' + (canTrain ? 'rgba(78,203,113,0.2)' : 'rgba(128,128,152,0.15)') + ';color:' + (canTrain ? '#4ecb71' : '#808098') + ';cursor:' + (canTrain ? 'pointer' : 'default') + ';font-size:12px;font-weight:600;';
    trainBtn.addEventListener('mouseenter', () => { if (canTrain) trainBtn.style.background = 'rgba(78,203,113,0.35)'; });
    trainBtn.addEventListener('mouseleave', () => { if (canTrain) trainBtn.style.background = 'rgba(78,203,113,0.2)'; });
    trainBtn.addEventListener('click', () => {
      const s = _soldierStats(); // 重新读取，避免连点失同步
      const afford = resourceSys ? resourceSys.canAfford(costs) : false;
      const room = s.count < s.cap;
      if (!afford || !room) {
        let msg = '训练失败：';
        const reasons = [];
        if (!afford) reasons.push('资源不足');
        if (!room) reasons.push('士兵已达上限 ' + s.cap + '（建造/升级军营）');
        pm.alert(msg + reasons.join('，'));
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
