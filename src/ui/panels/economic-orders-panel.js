const RESOURCE_NAMES = { wood: '木材', stone: '石头', food: '食物', gold: '黄金' };

function outputLabel(outputs = []) {
  if (!outputs.length) return '当前无产出';
  return outputs.map(output => `${RESOURCE_NAMES[output.resourceId] || output.resourceId} +${Number(output.amount.toFixed?.(2) ?? output.amount)}`).join(' · ');
}

function createCard() {
  const card = document.createElement('div');
  card.style.cssText = 'padding:12px 14px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.035);display:flex;gap:12px;align-items:center;';
  return card;
}

export function renderEconomicOrdersPanel(data, body, pm) {
  const game = window.__game;
  const buildingSystem = game?.systems?.building;
  const population = game?.systems?.population;
  const economy = game?.systems?.economyOrders;
  if (!buildingSystem || !population) return;

  body.innerHTML = '';
  const farms = buildingSystem.getFarmOperations?.() || [];
  const summary = document.createElement('div');
  summary.style.cssText = 'display:flex;justify-content:space-between;gap:16px;padding:12px 14px;margin-bottom:14px;border-radius:10px;background:rgba(121,216,155,.08);border:1px solid rgba(121,216,155,.18);font-size:12px;color:#b8c8df;';
  const assigned = farms.reduce((total, farm) => total + farm.workers, 0);
  summary.innerHTML = `<div><b style="color:#e8edf4">农业总览</b><br>这里仅汇总和定位；作物与人口只能在具体农田详情中调整。</div><div style="text-align:right">农田 <b style="color:#79d89b">${farms.length}</b><br>农业人口 ${assigned} · 空闲 ${population.getAvailableWorkers()}</div>`;
  body.appendChild(summary);

  const farmList = document.createElement('div');
  farmList.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  if (!farms.length) {
    farmList.innerHTML = '<div style="padding:18px;text-align:center;color:#8fa0b8;border:1px dashed rgba(255,255,255,.12);border-radius:10px;">尚未建造农田。请先从建造菜单的“农业”分类放置农田。</div>';
  }
  for (const farm of farms) {
    const building = buildingSystem.buildings[farm.buildingIndex];
    const card = createCard();
    const warning = !farm.cropId ? '未种植' : farm.workers <= 0 ? '缺少农业人口' : '';
    const pending = farm.pendingCropId
      ? farm.availableCrops.find(crop => crop.id === farm.pendingCropId)
      : null;
    card.innerHTML = `
      <div style="font-size:25px">${farm.crop?.icon || '🌱'}</div>
      <div style="flex:1;min-width:0">
        <b style="color:#e8edf4">${farm.crop?.name || '未种植'}农田</b>
        <span style="font-size:10px;color:#8494aa;margin-left:6px">(${building.gridX}, ${building.gridY})</span>
        <div style="font-size:11px;color:#aeb8c5;margin-top:4px">人口 ${farm.workers}/${farm.maxWorkers} · ${outputLabel(farm.outputs)}</div>
        ${pending ? `<div style="font-size:10px;color:#e3bd73;margin-top:3px">第 ${farm.pendingCropDay} 天改种 ${pending.name}</div>` : ''}
        ${warning ? `<div style="font-size:10px;color:#e79a9a;margin-top:3px">⚠ ${warning}</div>` : ''}
      </div>`;
    const locate = document.createElement('button');
    locate.textContent = '打开农田详情';
    locate.style.cssText = 'padding:7px 10px;border:1px solid rgba(121,216,155,.3);border-radius:8px;background:rgba(121,216,155,.12);color:#79d89b;cursor:pointer;font-family:inherit;';
    locate.addEventListener('click', () => pm.push('building_detail', { buildingIndex: farm.buildingIndex }));
    card.appendChild(locate);
    farmList.appendChild(card);
  }
  body.appendChild(farmList);

  const gatheringOrders = economy?.getOrders?.() || [];
  if (gatheringOrders.length) {
    const legacyTitle = document.createElement('div');
    legacyTitle.style.cssText = 'font-size:12px;font-weight:700;color:#d7c486;margin:18px 0 8px;';
    legacyTitle.textContent = '既有野外采集安排（只读）';
    body.appendChild(legacyTitle);
    for (const order of gatheringOrders) {
      const card = createCard();
      card.innerHTML = `<div style="font-size:22px">${order.definition?.icon || '🧺'}</div><div><b style="color:#e8edf4">${order.definition?.name || order.targetId}</b><div style="font-size:11px;color:#aeb8c5;margin-top:3px">人口 ${order.workers} · ${outputLabel((order.definition?.outputs || []).map(output => ({ ...output, amount: output.amount * order.workers })))}</div></div>`;
      body.appendChild(card);
    }
  }
}
