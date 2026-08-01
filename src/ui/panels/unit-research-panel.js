/**
 * unit-research-panel.js - 兵种专项研发
 * 普通科技提供前置条件，兵种研发消耗灵感并最终开放训练。
 */
import { store } from '../../core/Store.js';
import { configRegistry } from '../../core/ConfigRegistry.js';

function _tech() { return window.__game?.systems?.tech; }
function _combatConfig() { return configRegistry.get('enemies') || {}; }
function _units() { return _combatConfig().units || []; }
function _inspiration() { return store.getState('inspiration') || 0; }

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

function _techName(id) {
  const tech = _tech()?.getTech(id);
  return tech ? tech.name : id;
}

function _unitName(id) {
  const unit = _units().find(u => u.id === id);
  return unit ? unit.name : id;
}

function _branchOrder(branch) {
  const cfg = _branchConfigs().find(b => b.id === branch);
  return Number.isFinite(cfg?.order) ? cfg.order : Number.MAX_SAFE_INTEGER;
}

function _renderCost(cost) {
  return '💡 ' + (cost || 0);
}

export function renderUnitResearchPanel(data, body, pm) {
  const techSystem = _tech();
  if (!techSystem) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:#808098;">科技系统未加载</div>';
    return;
  }

  body.innerHTML = '';
  body.style.cssText = 'padding:20px 24px;max-height:70vh;overflow-y:auto;';

  const inspiration = _inspiration();
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
    '<div style="font-size:13px;color:#c98500;">💡 灵感: ' + inspiration + '</div>';
  body.appendChild(header);

  const note = document.createElement('div');
  note.style.cssText = 'font-size:12px;color:#a0a0ba;line-height:1.5;margin-bottom:14px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;';
  note.textContent = '普通科技只提供研发前置；完成兵种研发后，该单位才会出现在训练与编队中。海军不能防御陆地入侵，殖民地相关战斗可按规则调用海军战力。';
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
      const prereqs = Array.isArray(unit.prerequisiteTechs) ? unit.prerequisiteTechs : [];
      const unitPrereqs = Array.isArray(unit.prerequisiteUnits) ? unit.prerequisiteUnits : [];
      const missing = prereqs.filter(id => !techSystem.isResearched(id));
      const missingUnits = unitPrereqs.filter(id => !techSystem.isUnitUnlockedByTech(id));
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
      stats.textContent = '战力 ' + unit.combatPower + ' · CP ' + (unit.commandPoints || 1) + ' · 人口 ' + (unit.populationRequired || 1);
      card.appendChild(stats);

      const prereq = document.createElement('div');
      prereq.style.cssText = 'font-size:11px;color:' + (missing.length ? '#f0a040' : '#808098') + ';line-height:1.4;min-height:30px;';
      prereq.textContent = prereqs.length ? ('前置: ' + prereqs.map(_techName).join(' / ')) : '前置: 无';
      card.appendChild(prereq);

      const unitPrereq = document.createElement('div');
      unitPrereq.style.cssText = 'font-size:11px;color:' + (missingUnits.length ? '#f0a040' : '#808098') + ';line-height:1.4;min-height:18px;';
      unitPrereq.textContent = unitPrereqs.length ? ('兵种链: ' + unitPrereqs.map(_unitName).join(' / ')) : '兵种链: 起始兵种';
      card.appendChild(unitPrereq);

      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px;';
      const cost = document.createElement('span');
      cost.style.cssText = 'font-size:12px;color:' + (inspiration >= (unit.researchCost || 0) ? '#c98500' : '#f0a040') + ';';
      cost.textContent = _renderCost(unit.researchCost);
      actionRow.appendChild(cost);

      const btn = document.createElement('button');
      btn.textContent = done ? '已完成' : (missing.length ? '前置不足' : (inspiration < (unit.researchCost || 0) ? '灵感不足' : '研发'));
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
