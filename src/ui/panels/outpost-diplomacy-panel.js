import { configRegistry } from '../../core/ConfigRegistry.js';
import { store } from '../../core/Store.js';
import { getArmyCombatPower } from '../../utils/FormationUtils.js';

const STATUS_LABELS = { hostile: '敌对', wary: '戒备', neutral: '中立', friendly: '友好', allied: '同盟', defeated: '已征服' };
const STATUS_COLORS = { hostile: '#e65d5d', wary: '#e39b48', neutral: '#a0a0ba', friendly: '#64c987', allied: '#5b8def', defeated: '#8d78b8' };

function formatCosts(costs = []) {
  return costs.map(cost => `${configRegistry.getResource(cost.resourceId)?.name || cost.resourceId} ${cost.amount}`).join('、');
}

export function renderOutpostDiplomacyPanel(data, body, pm) {
  const system = window.__game?.systems?.diplomacy;
  const outpost = system?.getOutpost(data.outpostId);
  const state = system?.getOutpostState(data.outpostId);
  if (!system || !outpost || !state) {
    body.innerHTML = '<div style="padding:36px;color:#808098;text-align:center;">据点数据不可用</div>';
    return;
  }

  body.style.cssText = 'padding:20px 24px;max-height:72vh;overflow:auto;';
  const color = STATUS_COLORS[state.status] || '#a0a0ba';
  const relationPct = Math.max(0, Math.min(100, (state.relation + 100) / 2));
  const enemies = configRegistry.get('enemies')?.enemies || [];
  const garrison = (outpost.garrison || []).map(entry => `${enemies.find(item => item.id === entry.enemyId)?.name || entry.enemyId}×${entry.count}`).join('、');

  body.innerHTML = `
    <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:16px;">
      <div style="font-size:42px;">${outpost.icon}</div>
      <div style="flex:1;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;"><b style="font-size:19px;color:#ececf0;">${outpost.name}</b><span style="color:${color};font-weight:700;">${STATUS_LABELS[state.status]} · ${state.relation}</span></div>
      <div style="font-size:12px;color:#a0a0ba;line-height:1.6;margin-top:5px;">${outpost.description}</div></div>
    </div>
    <div style="height:8px;border-radius:4px;background:linear-gradient(90deg,#d95757,#808098 50%,#5b8def);position:relative;margin-bottom:16px;"><span style="position:absolute;left:calc(${relationPct}% - 5px);top:-3px;width:10px;height:14px;border-radius:4px;background:#fff;box-shadow:0 0 5px #000;"></span></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;font-size:12px;color:#c8c8d6;">
      <div style="padding:9px;background:rgba(255,255,255,.04);border-radius:7px;">区域：${outpost.domain === 'naval' ? '水上' : '陆地'}</div>
      <div style="padding:9px;background:rgba(255,255,255,.04);border-radius:7px;">守军战力：${outpost.militaryStrength}</div>
      <div style="padding:9px;background:rgba(255,255,255,.04);border-radius:7px;">互动次数：${state.interactions || 0}</div>
    </div>
    <div style="font-size:12px;color:#a0a0ba;margin-bottom:14px;">驻军：${garrison || '无'}。该据点是固定 NPC，不复制玩家的科技、文化或建设流程。</div>
    <div id="outpost-actions" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px;"></div>`;

  const actions = configRegistry.get('eaIntegration')?.outpostActions || {};
  const available = new Set(system.getAvailableActions(outpost.id));
  const actionContainer = body.querySelector('#outpost-actions');
  for (const actionId of outpost.actions || []) {
    const action = actions[actionId];
    if (!action) continue;
    const button = document.createElement('button');
    button.disabled = !available.has(actionId) || state.status === 'defeated';
    button.style.cssText = `text-align:left;padding:11px;border-radius:8px;border:1px solid ${button.disabled ? '#3a3a55' : '#5b8def'};background:${button.disabled ? 'rgba(255,255,255,.025)' : 'rgba(91,141,239,.1)'};color:${button.disabled ? '#66667e' : '#dfe8ff'};cursor:${button.disabled ? 'default' : 'pointer'};`;
    button.innerHTML = `<b>${action.name}</b><div style="font-size:10px;line-height:1.4;margin-top:4px;">${action.description}</div><div style="font-size:10px;color:#d6a84b;margin-top:4px;">${formatCosts(action.cost) || '无消耗'} · 关系 ${action.relationDelta >= 0 ? '+' : ''}${action.relationDelta || 0}</div>`;
    button.addEventListener('click', () => {
      const result = system.performAction(outpost.id, actionId);
      if (!result.ok) pm.alert(result.reason);
      else renderOutpostDiplomacyPanel(data, body, pm);
    });
    actionContainer.appendChild(button);
  }

  const units = configRegistry.get('enemies')?.units || [];
  const eligible = (store.getState('armies') || []).map(army => {
    const unitIds = (army.unitIds || []).filter(id => (units.find(unit => unit.id === id)?.domain || 'land') === outpost.domain);
    return { army, power: unitIds.length ? getArmyCombatPower({ ...army, unitIds }, { domain: outpost.domain }) : 0 };
  }).sort((a, b) => b.power - a.power)[0];
  const attack = document.createElement('button');
  attack.disabled = state.status === 'defeated' || !eligible?.power;
  attack.style.cssText = `margin-top:16px;width:100%;padding:11px;border:none;border-radius:8px;background:${attack.disabled ? 'rgba(128,128,152,.12)' : 'rgba(220,74,74,.18)'};color:${attack.disabled ? '#707088' : '#ff8585'};cursor:${attack.disabled ? 'default' : 'pointer'};font-weight:700;`;
  attack.textContent = state.status === 'defeated' ? '据点已经被征服' : eligible?.power ? `进攻据点（最强可用军团 ${eligible.power} / 守军 ${outpost.militaryStrength}）` : `需要编成${outpost.domain === 'naval' ? '海军' : '陆军'}军团`;
  attack.addEventListener('click', () => {
    if (!eligible?.power) return;
    system.attackOutpost(outpost.id, { power: eligible.power, armyId: eligible.army.id });
    renderOutpostDiplomacyPanel(data, body, pm);
  });
  body.appendChild(attack);

  const tradeLuxury = document.createElement('button');
  tradeLuxury.style.cssText = 'margin-top:9px;width:100%;padding:10px;border:1px solid #aa8748;border-radius:8px;background:rgba(170,135,72,.14);color:#ead49d;cursor:pointer;font-weight:700;';
  tradeLuxury.textContent = '打开奢侈品贸易';
  tradeLuxury.addEventListener('click', () => pm.open('luxury_trade', { outpostId: outpost.id }));
  body.appendChild(tradeLuxury);
}
