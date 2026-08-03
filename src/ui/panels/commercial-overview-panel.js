import { configRegistry } from '../../core/ConfigRegistry.js';

export function renderCommercialOverviewPanel(data, body, pm) {
  const game = window.__game;
  const commercial = game?.systems?.commercialBuildings;
  const buildingSystem = game?.systems?.building;
  if (!commercial || !buildingSystem) return;

  const states = commercial.getBuildingStates();
  const effects = commercial.getEffects();
  body.innerHTML = `
    <div style="padding:12px 14px;margin-bottom:14px;border:1px solid rgba(222,184,105,.22);border-radius:10px;background:rgba(222,184,105,.07);font-size:12px;color:#b8c8df;line-height:1.6">
      <b style="color:#ead39a">城市商业</b><br>
      商业建筑至少分配 1 人才会产生黄金并启用唯一 Buff；更多人口只提高该建筑的黄金产出。人口请在具体建筑详情中调整。
    </div>`;

  const summary = document.createElement('div');
  summary.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;font-size:11px;color:#9fb0c6;';
  summary.innerHTML = `<span>营业建筑 ${states.filter(state => state.active).length}/${states.length}</span><span>·</span><span>每工作刻黄金 +${states.reduce((sum, state) => sum + state.goldPerTick, 0).toFixed(2)}</span><span>·</span><span>生效 Buff ${commercial.getActiveBuffs().length}</span>`;
  body.appendChild(summary);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  if (!states.length) list.innerHTML = '<div style="padding:18px;text-align:center;color:#8fa0b8;border:1px dashed rgba(255,255,255,.12);border-radius:10px;">尚未建造市场、商馆、钱庄或交易所。</div>';
  for (const state of states) {
    const building = buildingSystem.buildings[state.buildingIndex];
    const buildingConfig = configRegistry.getBuilding(building.buildingId);
    const row = document.createElement('div');
    row.style.cssText = 'padding:12px 14px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.035);display:flex;align-items:center;gap:12px;';
    row.innerHTML = `<div style="flex:1"><b style="color:#edf1f7">${buildingConfig?.name || building.buildingId}</b><span style="font-size:10px;color:#8393a8;margin-left:7px">(${building.gridX}, ${building.gridY})</span><div style="font-size:11px;color:#aeb8c5;margin-top:4px">人口 ${state.workers}/${buildingConfig?.maxWorkers || 0} · 黄金 +${state.goldPerTick.toFixed(2)}/工作刻</div><div style="font-size:11px;color:${state.active ? '#79d89b' : '#e79a9a'};margin-top:3px">${state.active ? `Buff 生效：${state.buff?.name || '无'}` : '未营业：至少需要 1 人'}</div></div>`;
    const open = document.createElement('button');
    open.textContent = '打开建筑详情';
    open.style.cssText = 'padding:7px 10px;border:1px solid rgba(222,184,105,.3);border-radius:8px;background:rgba(222,184,105,.12);color:#ead39a;cursor:pointer;font-family:inherit;';
    open.addEventListener('click', () => pm.push('building_detail', { buildingIndex: state.buildingIndex }));
    row.appendChild(open);
    list.appendChild(row);
  }
  body.appendChild(list);

  if (Object.keys(effects).length) {
    const effectLine = document.createElement('div');
    effectLine.style.cssText = 'margin-top:14px;padding:10px 12px;border-radius:8px;background:rgba(121,216,155,.06);font-size:11px;color:#9fb7a8;';
    effectLine.textContent = `当前商业 Buff 汇总：${Object.entries(effects).map(([key, value]) => `${key} ${value}`).join(' · ')}`;
    body.appendChild(effectLine);
  }
}
