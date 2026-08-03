function el(tag, className, text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function renderEraCivilizationPanel(data, body, pm) {
  const system = data?.eraSystem || window.__game?.systems?.era;
  if (!system) {
    body.textContent = '时代系统尚未初始化';
    return;
  }

  const era = system.getCurrentEra();
  const selected = system.getSelectedCivilization();
  const stars = system.getEraStars();
  const techProgress = window.__game?.systems?.tech?.getEraProgress?.(era.id) || 0;
  const civicProgress = window.__game?.systems?.culture?.getEraProgress?.(era.id) || 0;
  const container = el('div', 'era-civilization-panel');
  container.style.cssText = 'display:flex;flex-direction:column;gap:14px;color:#ece6d8;';

  const header = el('section', 'era-summary');
  header.style.cssText = 'padding:14px;border:1px solid rgba(196,163,92,.4);border-radius:12px;background:linear-gradient(135deg,rgba(64,48,29,.9),rgba(25,29,38,.95));';
  header.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;">
      <img src="${era.icon}" alt="${era.name}" style="width:50px;height:50px;object-fit:contain" onerror="this.style.display='none'">
      <div><div style="font-size:20px;color:#e6c675;font-weight:700">${era.name}</div><div style="font-size:12px;color:#aaa">${era.timeline}</div></div>
    </div>
    <div style="margin-top:10px;font-size:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      <span>时代星：${stars.total}</span><span>科技：${Math.round(techProgress * 100)}%</span><span>人文：${Math.round(civicProgress * 100)}%</span>
    </div>`;
  container.appendChild(header);

  if (selected) {
    const current = el('div', 'selected-civilization');
    current.style.cssText = 'padding:12px;border-left:3px solid #d4ad56;background:rgba(212,173,86,.08);';
    current.innerHTML = `<b>本时代文明：${selected.name}</b><br><span style="font-size:12px;color:#bbb">遗产「${selected.legacy.name}」永久保留；时代特色「${selected.trait.name}」在本时代生效。</span>`;
    container.appendChild(current);
  } else {
    const prompt = el('div', '', '选择本时代文明。选择后不可更改，但其遗产会永久保留到后续时代。');
    prompt.style.cssText = 'font-size:12px;color:#d7c59a;';
    container.appendChild(prompt);
  }

  const guidance = system.getAdvancementRequirements?.();
  if (guidance?.finalEra) {
    const finalNotice = el('section', 'era-requirements', '已进入最终时代：现代时代没有下一时代晋升条件。');
    finalNotice.style.cssText = 'padding:12px;border:1px solid rgba(121,216,155,.4);border-radius:10px;background:rgba(121,216,155,.08);font-size:13px;color:#9de0b4;';
    container.appendChild(finalNotice);
  } else if (guidance?.nextEra) {
    const requirementSection = el('section', 'era-requirements');
    requirementSection.dataset.testid = 'era-advancement-requirements';
    requirementSection.style.cssText = 'padding:13px;border:1px solid rgba(212,173,86,.38);border-radius:10px;background:rgba(12,16,23,.7);';
    const title = el('div', '', `进入${guidance.nextEra.name}的条件`);
    title.style.cssText = 'font-size:14px;font-weight:700;color:#e6c675;margin-bottom:9px;';
    requirementSection.appendChild(title);
    for (const requirement of guidance.requirements) {
      const row = el('div', 'era-requirement-row');
      row.style.cssText = `display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:12px;color:${requirement.complete ? '#79d89b' : '#e8b0a0'};`;
      let progress = requirement.complete ? '已完成' : '未完成';
      if (requirement.id === 'civilization') progress = requirement.current || '未选择';
      if (requirement.id === 'technology' || requirement.id === 'civics') {
        progress = `${Math.round(requirement.current * 100)}% / ${Math.round(requirement.required * 100)}%`;
      }
      if (requirement.id === 'stars') progress = `${requirement.current} / ${requirement.required}`;
      row.textContent = `${requirement.complete ? '✓' : '○'} ${requirement.label} ${progress}`;
      requirementSection.appendChild(row);
    }

    const sourceTitle = el('div', '', '时代星获取方式');
    sourceTitle.style.cssText = 'font-size:12px;font-weight:700;color:#cdbb91;margin:10px 0 4px;';
    requirementSection.appendChild(sourceTitle);
    const sourceList = el('div', 'era-star-sources');
    sourceList.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:3px 12px;font-size:11px;color:#9faabd;';
    for (const source of guidance.starSources) {
      sourceList.appendChild(el('span', '', `${source.label}：${source.amount} 星`));
    }
    requirementSection.appendChild(sourceList);
    container.appendChild(requirementSection);
  }

  const grid = el('div', 'civilization-grid');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;';
  for (const civ of system.getAvailableCivilizations()) {
    const uniqueUnit = system.getUnit?.(civ.uniqueUnitId);
    const card = el('article', 'civilization-card');
    card.style.cssText = `padding:12px;border:1px solid ${selected?.id === civ.id ? '#d8b55f' : 'rgba(255,255,255,.14)'};border-radius:10px;background:rgba(15,18,25,.78);`;
    card.innerHTML = `
      <div style="display:flex;gap:9px;align-items:center"><img src="${civ.icon}" alt="${civ.name}" style="width:40px;height:40px" onerror="this.style.visibility='hidden'"><b style="font-size:15px">${civ.name}</b></div>
      <div style="font-size:11px;color:#cdbb91;margin-top:7px">永久遗产：${civ.legacy.name}</div>
      <div style="font-size:11px;color:#aaa">${civ.legacy.description}</div>
      <div style="font-size:11px;color:#cdbb91;margin-top:5px">时代特色：${civ.trait.name}</div>
      <div style="font-size:11px;color:#aaa">特色单位：${uniqueUnit?.name || '待解锁'} · 特色建筑：${civ.uniqueBuilding.name}</div>`;
    if (!selected) {
      const button = el('button', '', `选择 ${civ.name}`);
      button.style.cssText = 'margin-top:10px;width:100%;padding:7px;border:1px solid #b18a42;border-radius:7px;background:#59431f;color:#f7e4b2;cursor:pointer;';
      button.addEventListener('click', () => {
        const result = system.selectCivilization(civ.id);
        if (!result.ok) pm.alert(result.reason);
        pm.refresh({ eraSystem: system });
      });
      card.appendChild(button);
    }
    grid.appendChild(card);
  }
  container.appendChild(grid);

  const advance = el('button', 'era-advance-btn', guidance?.nextEra ? `进入${guidance.nextEra.name}` : '已是最终时代');
  const check = system.canAdvance();
  advance.disabled = !check.ok;
  advance.title = check.ok ? '满足时代推进条件' : check.reason;
  advance.style.cssText = `padding:11px;border-radius:9px;border:1px solid #c9a653;background:${check.ok ? '#765824' : '#333'};color:${check.ok ? '#fff0c2' : '#888'};cursor:${check.ok ? 'pointer' : 'not-allowed'};`;
  advance.addEventListener('click', () => {
    const result = system.advanceEra();
    if (!result.ok) pm.alert(result.reason);
    pm.refresh({ eraSystem: system });
  });
  container.appendChild(advance);

  body.replaceChildren(container);
}
