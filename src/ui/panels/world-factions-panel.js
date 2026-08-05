const STATUS_NAME = { allied: '同盟', friendly: '友好', neutral: '中立', wary: '戒备', hostile: '敌对', defeated: '已征服' };

function smallButton(label, handler, color = '#416181') {
  const button = document.createElement('button');
  button.textContent = label;
  button.style.cssText = `padding:5px 9px;border:1px solid ${color};border-radius:5px;background:${color}55;color:#edf5ff;cursor:pointer;`;
  button.addEventListener('click', handler);
  return button;
}

export function renderWorldFactionsPanel(data, body, pm) {
  const diplomacy = window.__game?.systems?.diplomacy;
  const wild = window.__game?.systems?.wildSites;
  const armySystem = window.__game?.systems?.army;
  if (!diplomacy || !wild) return;
  body.style.cssText = 'padding:20px 24px;max-height:75vh;overflow:auto;color:#e7e9ee;';
  body.innerHTML = '<div style="font-size:11px;color:#9da7b5;margin-bottom:15px">所有城邦均为敌对势力。摧毁2×2大本营后可夺取城邦奢侈品，并解锁其资源点。</div>';

  const title = document.createElement('h3');
  title.textContent = `城邦势力（${diplomacy.getAllOutposts().length}）`;
  title.style.cssText = 'font-size:15px;color:#e0c27c;margin:0 0 9px;';
  body.appendChild(title);
  const cityGrid = document.createElement('div');
  cityGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:9px;margin-bottom:20px;';
  for (const outpost of diplomacy.getAllOutposts()) {
    const state = diplomacy.getOutpostState(outpost.id);
    const card = document.createElement('article');
    card.style.cssText = 'padding:11px;border:1px solid #465366;border-radius:8px;background:rgba(255,255,255,.035);';
    card.innerHTML = `<div><b>${outpost.icon || '🏘️'} ${outpost.name}</b><span style="float:right;font-size:10px;color:#9eb0c8">${STATUS_NAME[state.status] || state.status}</span></div><div style="font-size:10px;color:#aab3c0;line-height:1.5;margin:6px 0">${outpost.description}</div><div style="font-size:10px;color:#7f94ad">时代 ${state.currentEraId} · 发展级 ${state.developmentLevel} · 防御 ${diplomacy.getOutpostDefense(outpost.id)} · 领地 ${state.controlledCells.length}</div>`;
    cityGrid.appendChild(card);
  }
  body.appendChild(cityGrid);

  const wildTitle = document.createElement('h3');
  wildTitle.textContent = `野外营地、守军与海盗（${wild.getVisibleSites().length}/${wild.getSites().length} 活跃）`;
  wildTitle.style.cssText = title.style.cssText;
  body.appendChild(wildTitle);
  const armyList = armySystem?.getArmies?.().filter(army => army.unitIds?.length) || [];
  const wildGrid = document.createElement('div');
  wildGrid.style.cssText = cityGrid.style.cssText;
  for (const site of wild.getSites()) {
    const state = wild.getSiteState(site.id);
    const card = document.createElement('article');
    card.style.cssText = `padding:11px;border:1px solid ${state.active ? '#684e4e' : '#3c4542'};border-radius:8px;background:${state.active ? 'rgba(96,33,33,.12)' : 'rgba(30,50,42,.1)'};opacity:${state.active ? 1 : .65};`;
    card.innerHTML = `<div><b>${site.domain === 'naval' ? '🏴‍☠️' : '⛺'} ${site.name}</b><span style="float:right;font-size:10px;color:${state.active ? '#e09494' : '#75b493'}">${state.active ? `强度 ${wild.getSiteStrength(site.id)}` : '已清剿'}</span></div><div style="font-size:10px;color:#aeb4bc;margin:6px 0">${site.category} · 坐标 ${site.gridX},${site.gridY} · ${site.respawnDays}天后重现</div>`;
    if (state.active && armyList.length) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;';
      const select = document.createElement('select');
      select.style.cssText = 'flex:1;min-width:0;padding:5px;background:#27242a;color:#eee;border:1px solid #5c4e55;border-radius:5px;';
      for (const army of armyList) {
        const option = document.createElement('option');
        option.value = army.id;
        option.textContent = `${army.name}(${army.power})`;
        select.appendChild(option);
      }
      row.append(select, smallButton('出击', async () => {
        const result = wild.attackWithArmy(site.id, select.value);
        if (!result.ok) await pm.alert(result.reason);
        else await pm.alert(`${result.victory ? '清剿成功' : '进攻失败'}，军团伤亡 ${result.casualties || 0}`);
        renderWorldFactionsPanel(data, body, pm);
      }, '#884c4c'));
      card.appendChild(row);
    }
    wildGrid.appendChild(card);
  }
  body.appendChild(wildGrid);
}
