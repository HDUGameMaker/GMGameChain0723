const RESOURCE_NAMES = { wood: '木材', stone: '石头', food: '食物', gold: '黄金' };

function recipeText(definition) {
  const side = items => (items || []).map(item => `${RESOURCE_NAMES[item.resourceId] || item.resourceId} ${item.amount}`).join(' + ');
  return `${side(definition?.input)} → ${side(definition?.output)}`;
}

function actionButton(label, handler, disabled = false) {
  const button = document.createElement('button');
  button.textContent = label;
  button.disabled = disabled;
  button.style.cssText = `padding:7px 10px;border:1px solid ${disabled ? '#42454d' : '#8ca0c0'};border-radius:6px;background:${disabled ? '#292b30' : '#334967'};color:${disabled ? '#676b73' : '#eef4ff'};cursor:${disabled ? 'not-allowed' : 'pointer'};`;
  if (!disabled) button.addEventListener('click', handler);
  return button;
}

function recipeSelect(definitions) {
  const select = document.createElement('select');
  select.style.cssText = 'width:100%;padding:8px;border:1px solid #566379;border-radius:6px;background:#202938;color:#edf2f7;';
  for (const definition of definitions) {
    const option = document.createElement('option');
    option.value = definition.id;
    option.textContent = `${definition.name}｜${recipeText(definition)}`;
    select.appendChild(option);
  }
  return select;
}

export function renderTradePanel(data, body, pm) {
  const commerce = window.__game?.systems?.commerce;
  const diplomacy = window.__game?.systems?.diplomacy;
  if (!commerce || !diplomacy) return;
  const definitions = commerce.getDefinitions();
  const friendly = diplomacy.getVisibleOutposts().filter(outpost => ['friendly', 'allied'].includes(diplomacy.getOutpostState(outpost.id)?.status));
  body.style.cssText = 'padding:20px 24px;max-height:74vh;overflow:auto;color:#e5e9f0;';
  body.innerHTML = '<div style="margin-bottom:15px"><b style="font-size:18px;color:#e7ca83">城邦贸易与资源加工</b><div style="font-size:11px;color:#9ba6b5;margin-top:3px">贸易只处理与其他地区的路线、资源交换、容量和停滞风险；城市内部商业请使用“商业”入口。</div></div>';

  const controls = document.createElement('div');
  controls.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:17px;';
  const tradeCard = document.createElement('section');
  tradeCard.style.cssText = 'padding:12px;border:1px solid #4d596c;border-radius:9px;background:rgba(255,255,255,.035);display:flex;flex-direction:column;gap:8px;';
  const outpostSelect = document.createElement('select');
  outpostSelect.style.cssText = 'width:100%;padding:8px;border:1px solid #566379;border-radius:6px;background:#202938;color:#edf2f7;';
  if (!friendly.length) outpostSelect.innerHTML = '<option value="">暂无友好城邦</option>';
  for (const outpost of friendly) {
    const option = document.createElement('option');
    option.value = outpost.id;
    option.textContent = `${outpost.name}（${diplomacy.getOutpostState(outpost.id).status}）`;
    outpostSelect.appendChild(option);
  }
  const tradeRecipe = recipeSelect(definitions.tradeRoutes);
  tradeCard.innerHTML = `<b>建立城邦贸易路线</b><span style="font-size:11px;color:#aab4c2">容量 ${commerce.getTradeRoutes().length}/${commerce.getRouteCapacity()}；需友好或同盟关系</span>`;
  tradeCard.append(outpostSelect, tradeRecipe, actionButton('建立每日贸易', () => {
    const result = commerce.createTradeRoute(outpostSelect.value, tradeRecipe.value);
    if (!result.ok) pm.alert({ relation_too_low: '城邦关系未达到友好', route_capacity_full: '贸易容量已满', unknown_route: '请选择有效的友好城邦' }[result.reason] || result.reason);
    else pm.refresh();
  }, !friendly.length || commerce.getTradeRoutes().length >= commerce.getRouteCapacity()));
  controls.appendChild(tradeCard);

  const conversionCard = document.createElement('section');
  conversionCard.style.cssText = tradeCard.style.cssText;
  const conversionRecipe = recipeSelect(definitions.conversionOrders);
  conversionCard.innerHTML = `<b>安排本地加工</b><span style="font-size:11px;color:#aab4c2">加工 ${commerce.getConversionOrders().length}/${commerce.getConversionCapacity()}；每天自动执行一次</span>`;
  conversionCard.append(conversionRecipe, actionButton('启用转换', () => {
    const result = commerce.createConversionOrder(conversionRecipe.value);
    if (!result.ok) pm.alert(result.reason === 'conversion_capacity_full' ? '需要更多奢侈品工坊，或先撤销现有转换' : result.reason);
    else pm.refresh();
  }, commerce.getConversionOrders().length >= commerce.getConversionCapacity()));
  controls.appendChild(conversionCard);
  body.appendChild(controls);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  const records = [...commerce.getTradeRoutes().map(item => ({ ...item, kind: 'route' })), ...commerce.getConversionOrders().map(item => ({ ...item, kind: 'conversion' }))];
  if (!records.length) list.innerHTML = '<div style="padding:20px;text-align:center;border:1px dashed #4b5360;border-radius:8px;color:#7f8997">还没有自动贸易或加工任务。</div>';
  for (const record of records) {
    const row = document.createElement('article');
    row.style.cssText = 'display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;padding:11px 13px;border:1px solid #465165;border-radius:8px;background:rgba(15,22,34,.66);';
    const outpost = record.kind === 'route' ? diplomacy.getOutpost(record.outpostId) : null;
    row.innerHTML = `<div><b>${record.kind === 'route' ? '🛒' : '🏭'} ${record.definition?.name || record.recipeId}</b><span style="font-size:10px;color:#8da0b8;margin-left:8px">${outpost ? outpost.name : '本地加工'}</span><div style="font-size:11px;color:#b6c0cd;margin-top:4px">${recipeText(record.definition)} · 已完成 ${record.completedCycles} 次${record.stalledDays ? ` · 停滞 ${record.stalledDays} 天` : ''}</div></div>`;
    row.appendChild(actionButton('撤销', () => {
      if (record.kind === 'route') commerce.removeTradeRoute(record.id);
      else commerce.removeConversionOrder(record.id);
      pm.refresh();
    }));
    list.appendChild(row);
  }
  body.appendChild(list);
}
