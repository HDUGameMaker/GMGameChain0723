/**
 * event-panel - 事件弹窗面板
 * 使用统一设计系统的样式
 */

export function renderEventPanel(data, body, pm) {
  const game = window.__game;
  if (!game) return;

  const evt = data.event;
  if (!evt) return;
  const managedByEventSystem = data.source === 'eventSystem';

  if (evt.kind === 'colony_offer') {
    renderColonyOfferPanel(evt, body, pm);
    return;
  }

  if (evt.kind === 'colony_invasion') {
    renderColonyInvasionPanel(evt, body, pm);
    return;
  }

  body.style.cssText = 'padding:28px 24px;display:flex;justify-content:center;';

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;width:min(640px,100%);margin:0 auto;';

  // === 事件标题 ===
  const header = document.createElement('div');
  header.className = 'event-panel-header';

  const nameEl = document.createElement('div');
  nameEl.className = 'event-panel-name';
  nameEl.textContent = evt.name;
  header.appendChild(nameEl);

  // 装饰分割线
  const divider = document.createElement('div');
  divider.className = 'event-panel-divider';
  header.appendChild(divider);

  container.appendChild(header);

  // === 事件配图（如果有） ===
  if (evt.image) {
    const img = document.createElement('div');
    img.style.cssText = `
      width:100%; height:120px;
      background: rgba(255,255,255,0.03);
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      color: #555; font-size: 13px;
      margin-bottom: 16px;
      border: 1px solid rgba(255,255,255,0.05);
    `;
    img.textContent = '[事件配图]';
    container.appendChild(img);
  }

  // === 事件描述 ===
  const desc = document.createElement('div');
  desc.className = 'event-description';
  desc.textContent = evt.description;
  container.appendChild(desc);

  // === 选项按钮 ===
  const optionsDiv = document.createElement('div');
  optionsDiv.style.cssText = 'display:flex;flex-direction:column;';

  for (const option of (evt.options || [])) {
    const optionIndex = (evt.options || []).indexOf(option);
    const canAfford = game.systems.event.canAffordOption(option.effects);
    const btn = document.createElement('button');
    btn.className = 'event-option-btn';
    btn.textContent = option.text;

    if (!canAfford) {
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
      btn.title = '资源不足，无法选择';
    }

    btn.addEventListener('click', () => {
      if (!canAfford) return;
      const result = managedByEventSystem
        ? game.systems.event.chooseOption(evt.id, optionIndex)
        : { ok: true, hasTrigger: game.systems.event.executeOptionEffects(option.effects) };
      if (!result.ok) {
        pm.alert(result.reason || '无法选择该选项');
        return;
      }
      const hasTrigger = result.hasTrigger;
      if (!hasTrigger) data.fromSettlement ? pm.pop() : pm.close();
    });
    optionsDiv.appendChild(btn);
  }

  if (managedByEventSystem && !data.fromSettlement) {
    const laterBtn = document.createElement('button');
    laterBtn.className = 'event-option-btn';
    laterBtn.textContent = '稍后处理';
    laterBtn.style.background = 'rgba(255,255,255,0.06)';
    laterBtn.style.color = '#a0a0ba';
    laterBtn.addEventListener('click', () => pm.close());
    optionsDiv.appendChild(laterBtn);
  }

  container.appendChild(optionsDiv);
  body.appendChild(container);
}

function renderBaseEventFrame(evt, body) {
  body.style.cssText = 'padding:28px 24px;display:flex;justify-content:center;';

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;width:min(680px,100%);margin:0 auto;';

  const header = document.createElement('div');
  header.className = 'event-panel-header';
  const nameEl = document.createElement('div');
  nameEl.className = 'event-panel-name';
  nameEl.textContent = evt.name;
  header.appendChild(nameEl);
  const divider = document.createElement('div');
  divider.className = 'event-panel-divider';
  header.appendChild(divider);
  container.appendChild(header);

  const desc = document.createElement('div');
  desc.className = 'event-description';
  desc.textContent = evt.description;
  container.appendChild(desc);

  body.appendChild(container);
  return container;
}

function renderColonyOfferPanel(evt, body, pm) {
  const game = window.__game;
  const colonySystem = game?.systems?.colony;
  const store = game?.store;
  if (!colonySystem || !store) return;

  const container = renderBaseEventFrame(evt, body);
  const info = document.createElement('div');
  info.style.cssText = 'font-size:12px;color:#a0a0ba;margin-bottom:12px;padding:10px 12px;background:rgba(91,141,239,0.08);border:1px solid rgba(91,141,239,0.18);border-radius:8px;line-height:1.5;';
  info.textContent = '原住民战力 ' + evt.nativePower + '。每日收益：' + colonySystem.getIncomeText(evt.dailyIncome) + '。陆军按标准战力进攻，海军按 2 倍战力进攻；占领后陆军全损，海军损失一半，损失战力转化为殖民地永久防御。';
  container.appendChild(info);

  const optionsDiv = document.createElement('div');
  optionsDiv.style.cssText = 'display:flex;flex-direction:column;';
  const armies = store.getState('armies') || [];
  const viableArmies = armies.filter(a => (a.unitIds || []).length > 0);

  if (viableArmies.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:12px;color:#808098;padding:10px 0;';
    empty.textContent = '暂无可派遣军团。';
    optionsDiv.appendChild(empty);
  } else {
    viableArmies.forEach((army) => {
      const preview = colonySystem.getArmyPreview(army, 'attack');
      const btn = document.createElement('button');
      btn.className = 'event-option-btn';
      btn.textContent = army.name + ' 进攻（战力 ' + preview.power + '，预计损失 ' + preview.lostCount + ' 单位，防御 +' + preview.defenseGain + '）';
      if (preview.power < evt.nativePower) {
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
        btn.title = '战力不足';
      }
      btn.addEventListener('click', async () => {
        if (preview.power < evt.nativePower) return;
        const result = colonySystem.attackColony(evt.colonyId, army.id);
        if (!result.ok) { pm.alert(result.msg); return; }
        await pm.alert('占领成功：' + result.colony + '。损失 ' + result.lostCount + ' 单位，殖民地防御 +' + result.defenseGain + '。');
        pm.close();
      });
      optionsDiv.appendChild(btn);
    });
  }

  const declineBtn = document.createElement('button');
  declineBtn.className = 'event-option-btn';
  declineBtn.textContent = '暂不扩张';
  declineBtn.addEventListener('click', () => {
    colonySystem.declineColony(evt.colonyId);
    pm.close();
  });
  optionsDiv.appendChild(declineBtn);

  container.appendChild(optionsDiv);
}

function renderColonyInvasionPanel(evt, body, pm) {
  const game = window.__game;
  const colonySystem = game?.systems?.colony;
  const store = game?.store;
  if (!colonySystem || !store) return;

  const colony = colonySystem.getColony(evt.colonyId);
  const container = renderBaseEventFrame(evt, body);
  const info = document.createElement('div');
  const baseDefense = colony?.defense || 0;
  info.style.cssText = 'font-size:12px;color:#a0a0ba;margin-bottom:12px;padding:10px 12px;background:rgba(240,160,64,0.08);border:1px solid rgba(240,160,64,0.18);border-radius:8px;line-height:1.5;';
  info.textContent = '入侵战力 ' + evt.invasionPower + '，殖民地基础防御 ' + baseDefense + '。若总防御不足，殖民地会失去控制。';
  container.appendChild(info);

  const optionsDiv = document.createElement('div');
  optionsDiv.style.cssText = 'display:flex;flex-direction:column;';

  const autoBtn = document.createElement('button');
  autoBtn.className = 'event-option-btn';
  autoBtn.textContent = '依靠殖民地守军抵抗（总防御 ' + baseDefense + '）';
  autoBtn.addEventListener('click', async () => {
    const result = colonySystem.resolveColonyInvasion(evt.colonyId);
    if (!result.ok) { pm.alert(result.msg); return; }
    await pm.alert(result.victory ? '殖民地守住了。剩余防御 ' + result.remainingDefense + '。' : '殖民地沦陷。');
    pm.close();
  });
  optionsDiv.appendChild(autoBtn);

  (store.getState('armies') || []).filter(a => (a.unitIds || []).length > 0).forEach((army) => {
    const preview = colonySystem.getArmyPreview(army, 'defense');
    const btn = document.createElement('button');
    btn.className = 'event-option-btn';
    btn.textContent = army.name + ' 增援（军团战力 ' + preview.power + '，总防御 ' + (baseDefense + preview.power) + '）';
    btn.addEventListener('click', async () => {
      const result = colonySystem.resolveColonyInvasion(evt.colonyId, army.id);
      if (!result.ok) { pm.alert(result.msg); return; }
      await pm.alert(result.victory ? '增援成功，殖民地守住了。剩余防御 ' + result.remainingDefense + '。' : '增援不足，殖民地沦陷。');
      pm.close();
    });
    optionsDiv.appendChild(btn);
  });

  container.appendChild(optionsDiv);
}
