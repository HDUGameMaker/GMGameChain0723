import { configRegistry } from '../../core/ConfigRegistry.js';

export function renderCultureTreePanel(data, body, pm) {
  const system = window.__game?.systems?.culture;
  const eraSystem = window.__game?.systems?.era;
  if (!system || !eraSystem) return;
  const content = configRegistry.getHistoricalContent();
  const eras = content.eras || [];
  const currentEra = eraSystem.getCurrentEra();
  const selectedEra = eras.find(era => era.id === data?.eraId) || currentEra;
  const points = system.getCivicPoints();
  const researched = new Set(system.getResearched());
  const current = system.getCurrentResearch();
  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:12px;color:#ece8dc;min-width:min(760px,85vw);';
  const top = document.createElement('div');
  top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(125,91,140,.14);border:1px solid rgba(184,133,199,.4);border-radius:10px;';
  top.innerHTML = `<div><b style="color:#dfb9e8">人文树 · ${selectedEra.name}</b><div style="font-size:11px;color:#999">制度、公共生活与文明认同</div></div><div style="font-size:16px">人文点：<b>${Math.floor(points)}</b></div>`;
  container.appendChild(top);
  const tabs = document.createElement('div');
  tabs.style.cssText = 'display:flex;gap:6px;overflow-x:auto;';
  for (const era of eras) {
    const tab = document.createElement('button');
    const locked = era.order > currentEra.order;
    tab.textContent = `${locked ? '🔒 ' : ''}${era.name}`;
    tab.style.cssText = `white-space:nowrap;padding:7px 10px;border-radius:7px;border:1px solid ${era.id === selectedEra.id ? '#ad79bb' : '#444'};background:${era.id === selectedEra.id ? '#54345d' : '#242730'};color:${locked ? '#777' : '#ddd'};cursor:pointer;`;
    tab.addEventListener('click', () => renderCultureTreePanel({ eraId: era.id }, body, pm));
    tabs.appendChild(tab);
  }
  container.appendChild(tabs);
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,minmax(145px,1fr));gap:10px;';
  for (const node of content.civics.filter(item => item.eraId === selectedEra.id)) {
    const done = researched.has(node.id);
    const active = current?.id === node.id;
    const can = system.canStartResearch(node.id);
    const card = document.createElement('article');
    card.style.cssText = `min-height:178px;padding:10px;border-radius:10px;border:1px solid ${done ? '#5ba66f' : active ? '#ac75bd' : '#474a54'};background:${done ? 'rgba(54,105,68,.18)' : 'rgba(18,21,29,.88)'};display:flex;flex-direction:column;gap:6px;`;
    card.innerHTML = `<img src="${node.icon}" alt="${node.name}" style="width:42px;height:42px;object-fit:contain;align-self:center" onerror="this.style.visibility='hidden'"><b style="text-align:center;color:${done ? '#8ed39c' : '#ead8ae'}">${node.name}</b><span style="font-size:10px;color:#8f93a0;text-align:center">${node.pointCost} 人文点 · ${node.researchTime} tick</span><span style="font-size:10px;color:#aaa;flex:1">${done ? '已研究完成' : active ? `研究中 ${Math.floor(current.progressTicks || 0)}/${node.researchTime}` : can.reason || '可以研究'}</span>`;
    if (!done && !active) {
      const button = document.createElement('button');
      button.textContent = '开始研究';
      button.disabled = !can.valid;
      button.style.cssText = `padding:6px;border-radius:6px;border:1px solid ${can.valid ? '#9d69aa' : '#444'};background:${can.valid ? '#4b2854' : '#2b2b2b'};color:${can.valid ? '#f0d1f6' : '#777'};cursor:${can.valid ? 'pointer' : 'not-allowed'};`;
      button.addEventListener('click', () => {
        if (!system.startResearch(node.id)) pm.alert(system.canStartResearch(node.id).reason);
        renderCultureTreePanel({ eraId: selectedEra.id }, body, pm);
      });
      card.appendChild(button);
    }
    grid.appendChild(card);
  }
  container.appendChild(grid);
  body.replaceChildren(container);
}
