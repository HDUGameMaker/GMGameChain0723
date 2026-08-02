const RESOURCE_NAMES = { wood: '木材', stone: '石材', food: '食物', gold: '黄金' };

function outputLabel(definition) {
  return (definition?.outputs || [])
    .map(output => `${RESOURCE_NAMES[output.resourceId] || output.resourceId} +${output.amount}/人/刻`)
    .join(' · ');
}

function makeButton(label, onClick, disabled = false) {
  const button = document.createElement('button');
  button.textContent = label;
  button.disabled = disabled;
  button.style.cssText = `padding:6px 10px;border:1px solid ${disabled ? '#444' : '#7d8da8'};border-radius:6px;background:${disabled ? '#292929' : '#314560'};color:${disabled ? '#666' : '#eef4ff'};cursor:${disabled ? 'not-allowed' : 'pointer'};`;
  if (!disabled) button.addEventListener('click', onClick);
  return button;
}

export function renderEconomicOrdersPanel(data, body, pm) {
  const system = window.__game?.systems?.economyOrders;
  const population = window.__game?.systems?.population;
  if (!system || !population) return;

  const definitions = system.getDefinitions();
  const stats = population.getPopulationStats(window.__game?.systems?.combat);
  body.style.cssText = 'padding:20px 24px;max-height:74vh;overflow:auto;color:#e7e7ed;';
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px">
      <div><b style="font-size:18px;color:#e7ca83">农业与地图采集</b><div style="font-size:11px;color:#9ca3af;margin-top:3px">作业与建筑共用人口；每个游戏刻按工人数自动产出</div></div>
      <div style="text-align:right;font-size:12px;color:#b8c8df">空闲人口 <b style="font-size:18px;color:#79d89b">${population.getAvailableWorkers()}</b><br>作业人口 ${system.getAssignedWorkers()} / 总人口 ${stats.total}</div>
    </div>`;

  const createSection = document.createElement('section');
  createSection.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:18px;';
  for (const [type, list, title] of [['crop', definitions.crops, '开辟农田'], ['gathering', definitions.gathering, '组织采集']]) {
    const card = document.createElement('div');
    card.style.cssText = 'padding:12px;border:1px solid #4a5260;border-radius:9px;background:rgba(255,255,255,.035);';
    const select = document.createElement('select');
    select.style.cssText = 'width:100%;margin:8px 0;padding:8px;border:1px solid #596678;border-radius:6px;background:#202938;color:#edf2f7;';
    for (const definition of list) {
      const option = document.createElement('option');
      option.value = definition.id;
      option.textContent = `${definition.icon || ''} ${definition.name} — ${outputLabel(definition)}`;
      select.appendChild(option);
    }
    card.innerHTML = `<b>${title}</b><div style="font-size:10px;color:#939baa;margin-top:3px">创建后再分配工人，可同时经营多种作物</div>`;
    card.appendChild(select);
    card.appendChild(makeButton('创建作业', () => {
      const result = system.createOrder({ type, targetId: select.value });
      if (!result.ok) pm.alert(`无法创建作业：${result.reason}`);
      pm.refresh();
    }, list.length === 0));
    createSection.appendChild(card);
  }
  body.appendChild(createSection);

  const orders = system.getOrders();
  const orderList = document.createElement('section');
  orderList.style.cssText = 'display:flex;flex-direction:column;gap:9px;';
  if (orders.length === 0) {
    orderList.innerHTML = '<div style="padding:22px;text-align:center;border:1px dashed #4a5260;border-radius:9px;color:#7f8792">尚未建立作业。选择一种农作物或采集任务开始经营。</div>';
  }
  for (const order of orders) {
    const definition = order.definition;
    const row = document.createElement('article');
    row.style.cssText = 'display:grid;grid-template-columns:minmax(190px,1fr) auto;gap:12px;align-items:center;padding:11px 13px;border:1px solid #485264;border-radius:8px;background:rgba(14,20,31,.65);';
    const luxuryProgress = definition?.luxury
      ? `<div style="font-size:10px;color:#c8a96c;margin-top:4px">${definition.luxury.id} 进度 ${order.luxuryProgress}/${definition.luxury.intervalWorkerTicks}</div>`
      : '';
    row.innerHTML = `<div><b>${definition?.icon || ''} ${definition?.name || order.targetId}</b><span style="font-size:10px;color:#8ea0b8;margin-left:8px">${order.type === 'crop' ? '农业' : '采集'}</span><div style="font-size:11px;color:#aeb8c5;margin-top:4px">${outputLabel(definition)}</div>${luxuryProgress}</div>`;
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;gap:7px;';
    controls.appendChild(makeButton('−', () => {
      system.assignWorkers(order.id, Math.max(0, order.workers - 1));
      pm.refresh();
    }, order.workers <= 0));
    const count = document.createElement('b');
    count.textContent = `${order.workers}/${definition?.maxWorkers || 0} 人`;
    count.style.cssText = 'min-width:58px;text-align:center;color:#dbe8ff;';
    controls.appendChild(count);
    controls.appendChild(makeButton('+', () => {
      const result = system.assignWorkers(order.id, order.workers + 1);
      if (!result.ok) pm.alert(result.reason === 'insufficient_workers' ? '没有空闲人口可分配' : '无法增加工人');
      else pm.refresh();
    }, order.workers >= (definition?.maxWorkers || 0) || population.getAvailableWorkers() <= 0));
    controls.appendChild(makeButton('撤销', () => {
      system.removeOrder(order.id);
      pm.refresh();
    }));
    row.appendChild(controls);
    orderList.appendChild(row);
  }
  body.appendChild(orderList);
}
