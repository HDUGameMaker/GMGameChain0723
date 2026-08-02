import { configRegistry } from '../../core/ConfigRegistry.js';

function renderTree({ body, pm, system, kind, eraId }) {
  const content = configRegistry.getHistoricalContent();
  const eras = content.eras || [];
  const currentEra = window.__game?.systems?.era?.getCurrentEra?.() || eras[0];
  const selectedEraId = eraId || currentEra?.id;
  const selectedEra = eras.find(era => era.id === selectedEraId) || currentEra;
  const nodes = (kind === 'tech' ? content.techs : content.civics).filter(node => node.eraId === selectedEra.id);
  const researched = new Set(kind === 'tech' ? system.getResearched() : system.getResearched());
  const current = system.getCurrentResearch();
  const points = kind === 'tech' ? system.getSciencePoints() : system.getCivicPoints();
  const pointName = kind === 'tech' ? '科技点' : '人文点';
  const currentOrder = currentEra?.order || 0;

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:12px;color:#ece8dc;min-width:min(760px,85vw);';
  const top = document.createElement('div');
  top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(151,120,59,.12);border:1px solid rgba(194,160,91,.35);border-radius:10px;';
  top.innerHTML = `<div><b style="color:#e4c276">${kind === 'tech' ? '科技树' : '人文树'} · ${selectedEra.name}</b><div style="font-size:11px;color:#999">${selectedEra.timeline}</div></div><div style="font-size:16px">${pointName}：<b>${Math.floor(points)}</b></div>`;
  container.appendChild(top);

  const tabs = document.createElement('div');
  tabs.style.cssText = 'display:flex;gap:6px;overflow-x:auto;padding-bottom:3px;';
  for (const era of eras) {
    const tab = document.createElement('button');
    const locked = era.order > currentOrder;
    tab.textContent = `${locked ? '🔒 ' : ''}${era.name}`;
    tab.style.cssText = `white-space:nowrap;padding:7px 10px;border-radius:7px;border:1px solid ${era.id === selectedEra.id ? '#caa65b' : '#444'};background:${era.id === selectedEra.id ? '#5d4724' : '#242730'};color:${locked ? '#777' : '#ddd'};cursor:pointer;`;
    tab.addEventListener('click', () => renderTree({ body, pm, system, kind, eraId: era.id }));
    tabs.appendChild(tab);
  }
  container.appendChild(tabs);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,minmax(145px,1fr));gap:10px;';
  for (const node of nodes) {
    const done = researched.has(node.id);
    const active = (kind === 'tech' ? current?.techId : current?.id) === node.id;
    const can = system.canStartResearch(node.id);
    const progress = active ? Math.floor(current.progressTicks || 0) : 0;
    const card = document.createElement('article');
    card.style.cssText = `min-height:178px;padding:10px;border-radius:10px;border:1px solid ${done ? '#5ba66f' : active ? '#5f91d4' : '#474a54'};background:${done ? 'rgba(54,105,68,.18)' : 'rgba(18,21,29,.88)'};display:flex;flex-direction:column;gap:6px;`;
    card.innerHTML = `
      <img src="${node.icon}" alt="${node.name}" style="width:42px;height:42px;object-fit:contain;align-self:center" onerror="this.style.visibility='hidden'">
      <b style="text-align:center;color:${done ? '#8ed39c' : '#ead8ae'}">${node.name}</b>
      <span style="font-size:10px;color:#8f93a0;text-align:center">${node.pointCost} ${pointName} · ${node.researchTime} tick</span>
      <span style="font-size:10px;color:#aaa;flex:1">${done ? '已研究完成' : active ? `研究中 ${progress}/${node.researchTime}` : can.reason || '可以研究'}</span>`;
    if (!done && !active) {
      const button = document.createElement('button');
      button.textContent = '开始研究';
      button.disabled = !can.valid;
      button.style.cssText = `padding:6px;border-radius:6px;border:1px solid ${can.valid ? '#b18b44' : '#444'};background:${can.valid ? '#563f1c' : '#2b2b2b'};color:${can.valid ? '#f5e1ad' : '#777'};cursor:${can.valid ? 'pointer' : 'not-allowed'};`;
      button.addEventListener('click', () => {
        if (!system.startResearch(node.id)) pm.alert(system.canStartResearch(node.id).reason);
        renderTree({ body, pm, system, kind, eraId: selectedEra.id });
      });
      card.appendChild(button);
    }
    grid.appendChild(card);
  }
  container.appendChild(grid);
  body.replaceChildren(container);
}

export function renderTechTreePanel(data, body, pm) {
  const system = window.__game?.systems?.tech;
  if (!system) return;
  renderTree({ body, pm, system, kind: 'tech', eraId: data?.eraId });
}
