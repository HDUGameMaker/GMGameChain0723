/**
 * unit-research-panel.js - 兵种专项研发
 * 消耗四基础资源（wood/stone/food/gold）解锁兵种，解锁后可在训练面板生产。
 * 旧「灵感 + 科技前置」机制已废弃：科技树休眠，研发只看兵种链 + 四物资。
 */
import { configRegistry } from '../../core/ConfigRegistry.js';

function _tech() { return window.__game?.systems?.tech; }
function _resource() { return window.__game?.systems?.resource; }
function _combatConfig() { return configRegistry.get('enemies') || {}; }
function _units() { return _combatConfig().units || []; }

function _branchConfigs() {
  const configured = _combatConfig().unitBranches || [];
  if (configured.length > 0) return configured;
  const ids = [...new Set(_units().map(u => u.branch).filter(Boolean))];
  return ids.map((id, i) => ({ id, name: id, order: i + 1 }));
}
function _domainConfigs() {
  const configured = _combatConfig().unitDomains || [];
  if (configured.length > 0) return configured;
  const ids = [...new Set(_units().map(u => u.domain).filter(Boolean))];
  return ids.map(id => ({ id, name: id }));
}

function _branchLabel(branch) {
  return _branchConfigs().find(b => b.id === branch)?.name || branch;
}

function _domainLabel(domain) {
  return _domainConfigs().find(d => d.id === domain)?.name || domain || '';
}

function _unitName(id) {
  const unit = _units().find(u => u.id === id);
  return unit ? unit.name : id;
}

function _branchOrder(branch) {
  const cfg = _branchConfigs().find(b => b.id === branch);
  return Number.isFinite(cfg?.order) ? cfg.order : Number.MAX_SAFE_INTEGER;
}

function _resName(id) {
  const r = configRegistry.getResource(id);
  return r ? r.name : id;
}

/** 渲染四物资解锁成本 */
function _renderCost(unlockCost) {
  if (!Array.isArray(unlockCost) || unlockCost.length === 0) return '自动解锁';
  return unlockCost.map(c => _resName(c.resourceId) + ' ' + c.amount).join(' · ');
}

export function renderUnitResearchPanel(data, body, pm) {
  const techSystem = _tech();
  if (!techSystem) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:#808098;">科技系统未加载</div>';
    return;
  }

  body.innerHTML = '';
  body.style.cssText = 'padding:20px 24px;max-height:70vh;overflow-y:auto;';

  const resourceSys = _resource();
  const researched = techSystem.getUnitResearch();
  const units = _units()
    .filter(u => u.branch)
    .sort((a, b) => {
      const bo = _branchOrder(a.branch) - _branchOrder(b.branch);
      if (bo !== 0) return bo;
      return (a.tier || 0) - (b.tier || 0);
    });

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:12px;';
  header.innerHTML = '<div style="font-size:18px;font-weight:700;color:#ececf0;">⚔️ 兵种研发</div>' +
    '<div style="font-size:13px;color:#8fb1ff;">已解锁 ' + researched.length + ' / ' + units.length + '</div>';
  body.appendChild(header);

  const note = document.createElement('div');
  note.style.cssText = 'font-size:12px;color:#a0a0ba;line-height:1.5;margin-bottom:14px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;';
  note.textContent = '消耗四基础资源解锁兵种，解锁后即可在「军事训练」中生产。兵种按链路递进，需先研发前置兵种。';
  body.appendChild(note);

  const grouped = {};
  units.forEach(u => {
    if (!grouped[u.branch]) grouped[u.branch] = [];
    grouped[u.branch].push(u);
  });

  Object.entries(grouped).forEach(([branch, list]) => {
    const section = document.createElement('section');
    section.style.cssText = 'margin-bottom:16px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:14px;font-weight:700;color:#ececf0;margin-bottom:8px;';
    title.textContent = _branchLabel(branch);
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;';

    list.forEach(unit => {
      const done = researched.includes(unit.id);
      const check = techSystem.canResearchUnit(unit.id);
      const unitPrereqs = Array.isArray(unit.prerequisiteUnits) ? unit.prerequisiteUnits : [];
      const missingUnits = unitPrereqs.filter(id => !techSystem.isUnitUnlockedByTech(id));
      const unlockCost = Array.isArray(unit.unlockCost) ? unit.unlockCost : [];
      const isBase = unlockCost.length === 0; // 自动解锁（如 warrior）
      const canAfford = resourceSys ? resourceSys.canAfford(unlockCost) : false;
      const canClick = !done && check.valid;

      const card = document.createElement('div');
      const border = done ? '#4ecb71' : canClick ? '#5b8def' : 'rgba(255,255,255,0.08)';
      card.style.cssText = 'background:rgba(255,255,255,0.035);border:1px solid ' + border + ';border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:7px;min-height:150px;';

      const name = document.createElement('div');
      name.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';
      name.innerHTML = '<span style="font-size:14px;font-weight:700;color:' + (done ? '#4ecb71' : '#ececf0') + ';">' + (done ? '✅ ' : '') + unit.name + '</span>' +
        '<span style="font-size:11px;color:#808098;">' + (_domainLabel(unit.domain) || unit.domain) + ' T' + (unit.tier || 0) + '</span>';
      card.appendChild(name);

      const stats = document.createElement('div');
      stats.style.cssText = 'font-size:12px;color:#a0a0ba;line-height:1.4;';
      stats.textContent = '战力 ' + unit.combatPower + ' · CP ' + (unit.commandPoints || 1);
      card.appendChild(stats);

      const unitPrereq = document.createElement('div');
      unitPrereq.style.cssText = 'font-size:11px;color:' + (missingUnits.length ? '#f0a040' : '#808098') + ';line-height:1.4;min-height:18px;';
      unitPrereq.textContent = unitPrereqs.length ? ('兵种链: ' + unitPrereqs.map(_unitName).join(' / ')) : '兵种链: 起始兵种';
      card.appendChild(unitPrereq);

      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px;';
      const cost = document.createElement('span');
      const costColor = isBase ? '#808098' : (canAfford ? '#4ecb71' : '#f0a040');
      cost.style.cssText = 'font-size:12px;color:' + costColor + ';';
      cost.textContent = _renderCost(unlockCost);
      actionRow.appendChild(cost);

      const btn = document.createElement('button');
      btn.textContent = done ? '已完成'
        : (missingUnits.length ? '前置不足'
           : (isBase ? '已解锁' : (canAfford ? '研发' : '资源不足')));
      btn.style.cssText = 'padding:6px 12px;border:none;border-radius:6px;background:' + (canClick ? 'rgba(91,141,239,0.22)' : 'rgba(128,128,152,0.14)') + ';color:' + (canClick ? '#8fb1ff' : '#808098') + ';cursor:' + (canClick ? 'pointer' : 'default') + ';font-size:12px;font-weight:600;';
      btn.addEventListener('click', () => {
        if (!canClick) {
          if (done) return;
          pm.alert(check.reason || '暂不可研发');
          return;
        }
        if (techSystem.researchUnit(unit.id)) {
          renderUnitResearchPanel(data, body, pm);
        }
      });
      actionRow.appendChild(btn);
      card.appendChild(actionRow);

      grid.appendChild(card);
    });

    section.appendChild(grid);
    body.appendChild(section);
  });
}
