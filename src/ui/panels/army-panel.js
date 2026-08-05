/**
 * army-panel.js - 军队管理面板
 * 创建/编辑/删除部队，配置单位（含数量限制检查）
 */
import {
  calcFormationGroups,
  getFormationRequirementText,
  getFormationStatusText,
  getFormationBonusText
} from '../../utils/FormationUtils.js';
import { eventBus } from '../../core/EventBus.js';

function _cfg() { return window.__game?.configRegistry?.get('enemies')?.units || []; }
function _store() { return window.__game?.store; }
function _armySystem() { return window.__game?.systems?.army; }
function _armies() { return _armySystem()?.getArmies?.() || []; }
function _avail() { return _armySystem()?.getAvailableUnits?.() || {}; }

function _createArtImage(primary, fallback, { testid = '', cssText = '' } = {}) {
  const img = document.createElement('img');
  img.src = primary || fallback || '';
  img.alt = '';
  img.dataset.fallbackSrc = fallback || '';
  if (testid) img.dataset.testid = testid;
  img.style.cssText = cssText;
  img.addEventListener('error', () => {
    if (!img._fallbackApplied && fallback && primary !== fallback) {
      img._fallbackApplied = true;
      img.src = fallback;
      return;
    }
    img.style.display = 'none';
  });
  return img;
}

function _notifyArmyChanged(reason) {
  const version = (_store()?.getState('armyVersion') || 0) + 1;
  _store()?.setState({ armyVersion: version });
  eventBus.emit('armyChanged', { reason, version });
}

function _techSys() { return window.__game?.systems?.tech; }
function _formations() { return window.__game?.configRegistry?.get('enemies')?.formations || []; }

/** 检查单位是否已解锁（配置 unlocked=true 或 被科技解锁） */
function _isUnitUnlocked(unitId) {
  const u = _cfg().find(x => x.id === unitId);
  if (!u) return false;
  if (u.unlocked !== false) return true;
  const tech = _techSys();
  return tech && tech.isUnitUnlockedByTech ? tech.isUnitUnlockedByTech(unitId) : false;
}

/** 检查阵型是否已解锁 */
function _isFormationUnlocked(fId) {
  const f = _formations().find(x => x.id === fId);
  if (!f) return false;
  if (f.unlocked !== false) return true;
  var culture = window.__game?.systems?.culture;
  if (culture && culture.isFormationUnlockedByCulture && culture.isFormationUnlockedByCulture(fId)) return true;
  return false;
}

function getAvailCount(unitId) {
  const a = _avail();
  return a[unitId] || 0;
}

function addToArmy(armyId, uid) {
  return _armySystem()?.addUnit?.(armyId, uid, 1).ok === true;
}

function removeFromArmy(armyId, uid) {
  _armySystem()?.removeUnit?.(armyId, uid, 1);
}

function dismissFromArmy(armyId, uid) {
  return _armySystem()?.dismissUnit?.(armyId, uid, 1).ok === true;
}

function _renderAssemblyPanel(data, body, pm) {
  const buildingIndex = data.assemblyBuildingIndex;
  const building = window.__game?.systems?.building?.buildings?.[buildingIndex];
  const config = building ? window.__game?.configRegistry?.getBuilding?.(building.buildingId) : null;
  const assemblyDomains = config?.uniqueFunction?.armyAssemblyDomains || [];
  if (!building || building.status !== 'active' || building._invalid || assemblyDomains.length === 0) {
    const invalid = document.createElement('div');
    invalid.style.cssText = 'padding:32px;text-align:center;color:#ff8c8c;';
    invalid.textContent = '集结建筑无效或尚未投入使用。';
    body.appendChild(invalid);
    return;
  }

  const draft = data._assemblyDraft ||= {
    name: `第${_armies().length + 1}军团`,
    unitCounts: {}
  };
  const rerender = () => renderArmyPanel(data, body, pm);
  const reserves = _avail();
  const reserveUnits = _cfg().filter(unit => (reserves[unit.id] || 0) > 0);

  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom:16px;';
  header.innerHTML = `<div style="font-size:18px;font-weight:700;color:#ececf0;">⚔️ ${config.name || building.buildingId} · 军团集结</div><div style="font-size:12px;color:#9099aa;margin-top:5px;">军团将按 N、NE、E、SE、S、SW、W、NW 顺序部署到建筑完整占地外侧。</div>`;
  const headerArt = document.createElement('div');
  headerArt.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:10px;';
  headerArt.appendChild(_createArtImage(config.imageDetail, config.mapIcon, {
    testid: 'assembly-building-art',
    cssText: 'width:112px;height:72px;object-fit:cover;border-radius:8px;border:1px solid rgba(214,176,103,.28);'
  }));
  headerArt.appendChild(_createArtImage(config.mapIcon, config.imageDetail, {
    testid: 'assembly-map-icon',
    cssText: 'width:42px;height:42px;object-fit:contain;border-radius:7px;background:rgba(8,12,18,.88);padding:4px;'
  }));
  header.appendChild(headerArt);
  body.appendChild(header);

  const nameInput = document.createElement('input');
  nameInput.value = draft.name;
  nameInput.placeholder = '军团名称';
  nameInput.dataset.testid = 'army-name';
  nameInput.style.cssText = 'width:100%;box-sizing:border-box;margin-bottom:14px;padding:9px 11px;border:1px solid rgba(255,255,255,.15);border-radius:7px;background:#20242d;color:#ececf0;font-size:14px;';
  nameInput.addEventListener('input', event => { draft.name = event.currentTarget.value; });
  body.appendChild(nameInput);

  const reserveTitle = document.createElement('div');
  reserveTitle.style.cssText = 'font-size:13px;font-weight:700;color:#d6bb7a;margin-bottom:8px;';
  reserveTitle.textContent = '预备队编成';
  body.appendChild(reserveTitle);

  if (reserveUnits.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:18px;text-align:center;color:#8d94a3;background:rgba(255,255,255,.03);border-radius:8px;';
    empty.textContent = '当前没有可用于集结的预备队。请先在训练建筑中训练单位。';
    body.appendChild(empty);
  }

  for (const unit of reserveUnits) {
    const selected = draft.unitCounts[unit.id] || 0;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:9px;padding:9px 11px;margin-bottom:6px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);border-radius:8px;';
    row.appendChild(_createArtImage(unit.cardArt, unit.icon, {
      testid: `reserve-unit-art-${unit.id}`,
      cssText: 'width:46px;height:46px;object-fit:cover;border-radius:7px;background:#111722;'
    }));
    const details = document.createElement('div');
    details.style.cssText = 'flex:1;min-width:0;color:#e6e8ed;font-size:13px;';
    details.textContent = `${unit.icon || '⚔️'} ${unit.name} · ${unit.domain === 'naval' ? '海军' : '陆军'} · 预备 ${reserves[unit.id]}`;
    row.appendChild(details);

    const remove = document.createElement('button');
    remove.textContent = '−';
    remove.dataset.testid = `reserve-remove-${unit.id}`;
    remove.disabled = selected <= 0;
    remove.style.cssText = 'width:30px;height:28px;border:1px solid #815b5b;border-radius:5px;background:#4d2f32;color:#ffdede;cursor:pointer;';
    remove.addEventListener('click', () => {
      if (selected <= 1) delete draft.unitCounts[unit.id];
      else draft.unitCounts[unit.id] = selected - 1;
      rerender();
    });
    row.appendChild(remove);

    const count = document.createElement('span');
    count.style.cssText = 'min-width:24px;text-align:center;color:#ececf0;font-weight:700;';
    count.textContent = String(selected);
    row.appendChild(count);

    const add = document.createElement('button');
    add.textContent = '+';
    add.dataset.testid = `reserve-add-${unit.id}`;
    add.disabled = selected >= reserves[unit.id];
    add.style.cssText = 'width:30px;height:28px;border:1px solid #4c7d61;border-radius:5px;background:#294939;color:#d9ffe5;cursor:pointer;';
    add.addEventListener('click', () => {
      draft.unitCounts[unit.id] = selected + 1;
      rerender();
    });
    row.appendChild(add);
    body.appendChild(row);
  }

  const selectedEntries = Object.entries(draft.unitCounts).filter(([, count]) => count > 0);
  const selectedUnitCount = selectedEntries.reduce((sum, [, count]) => sum + count, 0);
  const selectedDomains = new Set(selectedEntries.map(([unitId]) => (
    _cfg().find(unit => unit.id === unitId)?.domain === 'naval' ? 'naval' : 'land'
  )));
  let warning = '';
  if (selectedEntries.length === 0) warning = '请至少选择一个预备队单位。';
  else if (selectedDomains.size !== 1 || !assemblyDomains.includes([...selectedDomains][0])) {
    warning = '部署域不匹配：同一军团必须全部属于该集结建筑支持的陆军或海军域。';
  } else if (_armies().length >= (_armySystem()?.getArmyCapacity?.() || 2)) warning = '军团数量已达上限。';
  else if (selectedUnitCount > (_armySystem()?.getArmyUnitCapacity?.() || 5)) warning = `单支军团最多编入 ${_armySystem()?.getArmyUnitCapacity?.() || 5} 名士兵。`;

  const preview = document.createElement('div');
  preview.style.cssText = 'margin-top:12px;padding:10px 12px;background:rgba(91,141,239,.08);border-radius:8px;color:#b9cae8;font-size:12px;';
  preview.textContent = `编成 ${selectedUnitCount} 单位（上限 ${_armySystem()?.getArmyUnitCapacity?.() || 5}）· ${assemblyDomains.includes('naval') ? '海军部署' : '陆军部署'}`;
  body.appendChild(preview);
  if (warning) {
    const warningElement = document.createElement('div');
    warningElement.style.cssText = 'margin-top:8px;color:#efa2a2;font-size:12px;';
    warningElement.textContent = warning;
    body.appendChild(warningElement);
  }

  const deploy = document.createElement('button');
  deploy.textContent = '部署军团';
  deploy.dataset.testid = 'deploy-army';
  deploy.disabled = Boolean(warning);
  deploy.style.cssText = 'width:100%;margin-top:14px;padding:11px;border:none;border-radius:8px;background:rgba(78,203,113,.28);color:#bff5ce;font-size:14px;font-weight:700;cursor:pointer;';
  deploy.addEventListener('click', () => {
    const result = _armySystem()?.deployArmyFromBuilding?.({
      buildingIndex,
      name: draft.name,
      unitCounts: { ...draft.unitCounts }
    });
    if (!result?.ok) {
      pm.alert({
        invalid_assembly_building: '集结建筑无效。',
        insufficient_reserve: '预备队数量不足。',
        mixed_unit_domains: '陆军与海军不能混编部署。',
        assembly_domain_not_supported: '该建筑不支持所选军种。',
        army_capacity_full: '军团数量已达上限。',
        no_deployment_tile: '建筑周围八个部署位置均不可用。'
      }[result?.reason] || result?.reason || '军团部署失败。');
      return;
    }
    pm.close?.();
  });
  body.appendChild(deploy);
}

export function renderArmyPanel(data, body, pm) {
  /* 清空 body —— 修复重复渲染 Bug */
  body.innerHTML = '';
  body.style.cssText = 'padding:20px 24px;max-height:70vh;overflow-y:auto;';

  if (Number.isInteger(data?.assemblyBuildingIndex)) {
    _renderAssemblyPanel(data, body, pm);
    return;
  }

  const allArmies = _armies();
  const armies = data?.armyId ? allArmies.filter(army => army.id === data.armyId) : allArmies;
  const unitMap = {};
  _cfg().forEach(u => unitMap[u.id] = u);

  /* 头部 */
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
  header.innerHTML = '<span style="font-size:18px;font-weight:700;color:#ececf0;">⚔️ 军队管理</span>';
  body.appendChild(header);

  const info = document.createElement('div');
  info.style.cssText = 'font-size:12px;color:#808098;margin-bottom:14px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;';
  info.textContent = '💡 军团 ' + allArmies.length + '/' + (_armySystem()?.getArmyCapacity?.() || 2) + '；军团属性由其中的兵种与领队英雄共同计算。';
  body.appendChild(info);
  const leaderGuide = document.createElement('div');
  leaderGuide.style.cssText = 'margin-bottom:14px;padding:12px 14px;border:1px solid #c09245;border-radius:9px;background:rgba(192,146,69,.12);color:#f1d69b;font-size:12px;line-height:1.7;';
  leaderGuide.innerHTML = '<b>⭐ 领队与CP提示</b><br>CP表示军团每个时段可进行的战斗行为数量。军团可以配备领队；对有领队的军团按中键准备主动技能，确认方向后按左键释放，再按中键取消。战斗时速度较快的一方先攻击；若速度高出对方至少2点，并在受到反击后仍然存活，将再攻击一次。军团生命归零后消失，领队返回历史酒馆休养。';
  body.appendChild(leaderGuide);

  /* 已解锁战阵介绍 */
  const unlockedFormations = _formations().filter(f => _isFormationUnlocked(f.id));
  if (unlockedFormations.length > 0) {
    const guide = document.createElement('div');
    guide.style.cssText = 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px 14px;margin-bottom:14px;';
    const guideTitle = document.createElement('div');
    guideTitle.style.cssText = 'font-size:13px;font-weight:600;color:#ececf0;margin-bottom:6px;';
    guideTitle.textContent = '📜 已解锁战阵';
    guide.appendChild(guideTitle);
    unlockedFormations.forEach((f, fi) => {
      const row = document.createElement('div');
      row.style.cssText = 'padding:8px 0;' + (fi === 0 ? '' : 'border-top:1px solid rgba(255,255,255,0.06);');
      const name = document.createElement('div');
      name.style.cssText = 'font-size:12px;font-weight:600;color:#ececf0;margin-bottom:2px;';
      name.textContent = f.name + '（' + getFormationBonusText(f.id) + '）';
      const req = document.createElement('div');
      req.style.cssText = 'font-size:11px;color:#5b8def;margin-bottom:2px;';
      req.textContent = '触发需求: ' + getFormationRequirementText(f.id);
      const desc = document.createElement('div');
      desc.style.cssText = 'font-size:11px;color:#a0a0ba;line-height:1.4;';
      desc.textContent = f.description || '数量不足不触发，数量翻倍则加成翻倍。';
      row.appendChild(name);
      row.appendChild(req);
      row.appendChild(desc);
      guide.appendChild(row);
    });
    body.appendChild(guide);
  }

  if (armies.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:40px;color:#808098;font-size:14px;';
    empty.textContent = '暂无已部署军团。请从具备集结功能的建筑开始组建。';
    body.appendChild(empty);
    return;
  }

  armies.forEach((army, ai) => {
    const card = document.createElement('div');
    card.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.08);margin-bottom:12px;overflow:hidden;';
    /* 头部行 */
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:14px 16px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.06);';
    const representative = (army.unitIds || []).map(id => unitMap[id]).filter(Boolean)
      .sort((left, right) => (right.commandPoints || 1) - (left.commandPoints || 1))[0];
    const armyArt = army.heroIcon || army.heroPortrait || representative?.cardArt || representative?.icon;
    const armyFallback = army.heroIcon ? (army.heroPortrait || representative?.icon) : representative?.icon;
    if (armyArt) row.appendChild(_createArtImage(armyArt, armyFallback, {
      testid: `army-card-art-${army.id}`,
      cssText: 'width:54px;height:54px;object-fit:cover;border-radius:8px;background:#111722;'
    }));
    const nameInput = document.createElement('input');
    nameInput.value = army.name;
    nameInput.style.cssText = 'flex:1;font-size:15px;font-weight:600;color:#ececf0;background:transparent;border:none;outline:none;padding:2px 0;min-width:0;';
    nameInput.addEventListener('change', () => {
      _armySystem()?.renameArmy?.(army.id, nameInput.value || '未命名');
    });
    row.appendChild(nameInput);

    /* 阵型选择 */
    const formationSelect = document.createElement('select');
    formationSelect.style.cssText = 'font-size:11px;padding:3px 6px;border-radius:5px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#e0e0e8;cursor:pointer;max-width:120px;';
    const formations = _formations().filter(f => _isFormationUnlocked(f.id));
    const noneOpt = document.createElement('option');
    noneOpt.value = ''; noneOpt.textContent = '无阵型';
    if (!army.formationId) noneOpt.selected = true;
    formationSelect.appendChild(noneOpt);
    formations.forEach(f => {
      const opt = document.createElement('option');
      const groups = calcFormationGroups(f.id, army);
      opt.value = f.id; opt.textContent = f.name + ' (' + getFormationBonusText(f.id, army) + ')' + (groups > 0 ? '' : ' · 未满足');
      opt.title = '需求: ' + getFormationRequirementText(f.id);
      if (army.formationId === f.id) opt.selected = true;
      formationSelect.appendChild(opt);
    });
    formationSelect.addEventListener('change', () => {
      _armySystem()?.setFormation?.(army.id, formationSelect.value || null);
      renderArmyPanel(data, body, pm);
    });
    row.appendChild(formationSelect);

    const tacticSelect = document.createElement('select');
    tacticSelect.style.cssText = formationSelect.style.cssText;
    tacticSelect.title = '固定军事策略会改变分阶段战斗中的优势环节';
    tacticSelect.innerHTML = '<option value="">默认策略</option>';
    for (const tactic of _armySystem()?.getTactics?.() || []) {
      const option = document.createElement('option');
      option.value = tactic.id;
      option.textContent = tactic.name;
      option.title = tactic.description;
      option.selected = army.tacticId === tactic.id;
      tacticSelect.appendChild(option);
    }
    tacticSelect.addEventListener('change', () => {
      _armySystem()?.setTactic?.(army.id, tacticSelect.value || null);
      renderArmyPanel(data, body, pm);
    });
    row.appendChild(tacticSelect);

    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑';
    delBtn.style.cssText = 'padding:4px 8px;border:none;border-radius:5px;background:rgba(255,107,107,0.15);color:#ff6b6b;cursor:pointer;font-size:14px;';
    delBtn.title = '删除部队';
    delBtn.addEventListener('mouseenter', () => delBtn.style.background = 'rgba(255,107,107,0.3)');
    delBtn.addEventListener('mouseleave', () => delBtn.style.background = 'rgba(255,107,107,0.15)');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!await pm.confirm('确认删除「' + army.name + '」？')) return;
      _armySystem()?.disbandArmy?.(army.id);
      renderArmyPanel(data, body, pm);
    });
    row.appendChild(delBtn);
    card.appendChild(row);

    const commandRow = document.createElement('div');
    commandRow.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:11px;color:#a0a0ba;';
    const commanderSelect = document.createElement('select');
    commanderSelect.style.cssText = 'padding:4px 7px;border-radius:5px;border:1px solid rgba(255,255,255,.12);background:#242938;color:#e7e7ed;';
    commanderSelect.innerHTML = '<option value="">不配置统帅</option>';
    const commanders = (window.__game?.systems?.hero?.getRecruitedHeroes?.() || []).filter(hero => (hero.role === 'commander' || hero.heroClass === 'military') && hero.status !== 'injured');
    const heroChangeStatus = _armySystem()?.getHeroChangeStatus?.(army.id) || { ok: true };
    commanderSelect.disabled = !heroChangeStatus.ok;
    commanderSelect.title = heroChangeStatus.ok ? '设置或更换统帅' : heroChangeStatus.reason;
    for (const hero of commanders) {
      const option = document.createElement('option');
      option.value = hero.heroId || hero.id;
      option.textContent = hero.name;
      option.selected = army.heroId === option.value;
      const assignmentStatus = _armySystem()?.canAssignHero?.(army.id, option.value) || { ok: true };
      if (!option.selected && !assignmentStatus.ok) {
        option.disabled = true;
        option.textContent += `（${assignmentStatus.reason}）`;
      }
      commanderSelect.appendChild(option);
    }
    commanderSelect.addEventListener('change', () => {
      const result = commanderSelect.value
        ? _armySystem()?.assignHero?.(army.id, commanderSelect.value)
        : { ok: _armySystem()?.unassignHero?.(army.id) };
      if (!result?.ok) pm.alert(result?.reason || '统帅任命失败');
      renderArmyPanel(data, body, pm);
    });
    commandRow.innerHTML = '<span>统帅</span>';
    commandRow.appendChild(commanderSelect);
    if (!heroChangeStatus.ok) {
      const lockReason = document.createElement('span');
      lockReason.style.cssText = 'color:#e6a16f;';
      lockReason.textContent = `🔒 ${heroChangeStatus.reason}`;
      commandRow.appendChild(lockReason);
    }
    const location = document.createElement('span');
    location.style.marginLeft = 'auto';
    location.textContent = `位置 ${army.gridX},${army.gridY}`;
    commandRow.appendChild(location);
    card.appendChild(commandRow);
    if (army.heroId === 'Hestia') {
      const skillRow = document.createElement('div');
      skillRow.style.cssText = 'padding:9px 16px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(126,174,226,.08);font-size:11px;color:#bcd9f4;';
      const skillCooldown = window.__game?.systems?.hero?.getHero?.('Hestia')?.activeSkill?.cooldownTicks || 12;
      skillRow.append(`🌙 月光 · 直线突刺4格 · 200%攻击伤害 · 1CP · 冷却 ${army.heroSkillCooldown || 0}/${skillCooldown}　`);
      for (const [direction, label] of [['up','↑'],['down','↓'],['left','←'],['right','→']]) {
        const button = document.createElement('button'); button.textContent = label;
        button.style.cssText = 'margin-left:5px;padding:3px 9px;border:1px solid #6589ab;border-radius:5px;background:#263e59;color:#e5f3ff;cursor:pointer';
        button.onclick = () => { const result = _armySystem()?.useHeroActiveSkill?.(army.id, direction); if (!result?.ok) pm.alert(result?.reason || '技能发动失败'); renderArmyPanel(data, body, pm); };
        skillRow.appendChild(button);
      }
      card.appendChild(skillRow);
    }

    const statsRow = document.createElement('div');
    statsRow.dataset.testid = `army-combat-stats-${army.id}`;
    statsRow.style.cssText = 'display:grid;grid-template-columns:repeat(4,minmax(80px,1fr));gap:6px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px;text-align:center;';
    statsRow.innerHTML = `<span>⚔️ 攻击 <b>${army.attack ?? 0}</b></span><span>❤️ 生命 <b>${army.hp ?? 0}/${army.maxHp ?? 0}</b></span><span>🎯 射程 <b>${army.attackRange ?? 0}</b></span><span>🔷 CP <b>${army.cp ?? 0}/${army.maxCp ?? 1}</b></span><span>👟 速度 <b>${army.speed ?? 0}</b></span>`;
    card.appendChild(statsRow);

    const movementRow = document.createElement('div');
    movementRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,.06);font-size:11px;color:#9ba7b8;';
    const coordinateInput = (value, label) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = value;
      input.title = label;
      input.style.cssText = 'width:58px;padding:4px 5px;border:1px solid #4d5666;border-radius:4px;background:#202531;color:#e8edf5;';
      return input;
    };
    const targetX = coordinateInput(army.gridX, '目标 X');
    const targetY = coordinateInput(army.gridY, '目标 Y');
    movementRow.append('目标格', targetX, targetY);
    const moveButton = document.createElement('button');
    moveButton.textContent = '下达移动';
    moveButton.style.cssText = 'padding:4px 8px;border:1px solid #58759a;border-radius:5px;background:#2c4565;color:#e4efff;cursor:pointer;';
    moveButton.addEventListener('click', () => {
      const result = _armySystem()?.issueMoveOrder?.(army.id, Number(targetX.value), Number(targetY.value));
      if (!result?.ok && result?.reason === 'tile_occupied_by_building') {
        pm.alert('目标格被建筑占用');
        return;
      }
      if (!result?.ok) pm.alert({ incompatible_terrain: '陆军不能直接进入水域；请先在港口登船。', no_path: '没有可通行路径', army_garrisoned: '请先撤出驻防' }[result?.reason] || result?.reason || '移动失败');
      else renderArmyPanel(data, body, pm);
    });
    movementRow.appendChild(moveButton);
    const embarkButton = document.createElement('button');
    embarkButton.textContent = army.embarked ? '登陆目标格' : '在港口登船';
    embarkButton.style.cssText = 'padding:4px 8px;border:1px solid #4b8594;border-radius:5px;background:#244d59;color:#dff8ff;cursor:pointer;';
    embarkButton.addEventListener('click', () => {
      const result = army.embarked
        ? _armySystem()?.disembarkArmy?.(army.id, Number(targetX.value), Number(targetY.value))
        : _armySystem()?.embarkArmy?.(army.id);
      if (!result?.ok) pm.alert({ harbor_required: '军团必须位于港口或其相邻格', landing_not_adjacent: '登陆格必须与舰队相邻', invalid_landing: '只能登陆陆地格', transport_capacity_full: '港口运输容量不足' }[result?.reason] || result?.reason || '操作失败');
      else renderArmyPanel(data, body, pm);
    });
    movementRow.appendChild(embarkButton);
    const fortifications = (window.__game?.systems?.building?.buildings || []).map((building, index) => ({ building, index, config: window.__game?.configRegistry?.getBuilding(building.buildingId) })).filter(item => item.building.status === 'active' && (item.config?.uniqueFunction?.garrisonCapacity || ['castle', 'fort', 'citadel'].includes(item.building.buildingId)));
    if (army.garrisonBuildingIndex != null) {
      const leaveButton = document.createElement('button');
      leaveButton.textContent = '撤出驻防';
      leaveButton.style.cssText = 'padding:4px 8px;border:1px solid #8c744c;border-radius:5px;background:#514123;color:#ffe8ba;cursor:pointer;';
      leaveButton.addEventListener('click', () => {
        const result = _armySystem()?.ungarrisonArmy?.(army.id);
        if (!result?.ok) pm.alert(result?.reason === 'no_ungarrison_tile' ? '要塞周围没有可用的撤出格' : result?.reason || '撤出驻防失败');
        else renderArmyPanel(data, body, pm);
      });
      movementRow.appendChild(leaveButton);
    } else if (fortifications.length) {
      const garrisonSelect = document.createElement('select');
      garrisonSelect.style.cssText = 'padding:4px 6px;border:1px solid #5b5360;border-radius:5px;background:#26232b;color:#ece6f0;';
      for (const item of fortifications) {
        const option = document.createElement('option');
        option.value = item.index;
        option.textContent = `${item.config?.name || item.building.buildingId}(${item.building.gridX},${item.building.gridY})`;
        garrisonSelect.appendChild(option);
      }
      const garrisonButton = document.createElement('button');
      garrisonButton.textContent = '进入驻防';
      garrisonButton.style.cssText = 'padding:4px 8px;border:1px solid #78628d;border-radius:5px;background:#49385a;color:#f1e1ff;cursor:pointer;';
      garrisonButton.addEventListener('click', () => {
        const result = _armySystem()?.garrisonArmy?.(army.id, Number(garrisonSelect.value));
        if (!result?.ok) pm.alert(result?.reason === 'garrison_too_far' ? '军团必须先移动到要塞相邻格' : result?.reason || '驻防失败');
        else renderArmyPanel(data, body, pm);
      });
      movementRow.append(garrisonSelect, garrisonButton);
    }
    card.appendChild(movementRow);

    if (army.formationId) {
      const status = document.createElement('div');
      status.style.cssText = 'font-size:11px;padding:6px 16px;border-top:1px solid rgba(255,255,255,0.06);';
      status.style.color = calcFormationGroups(army.formationId, army) > 0 ? '#4ecb71' : '#f0a040';
      status.textContent = getFormationStatusText(army.formationId, army);
      card.appendChild(status);
    }

    /* 单位列表 */
    const unitsBody = document.createElement('div');
    unitsBody.style.cssText = 'padding:12px 16px;';
    if (army.heroId) {
      const hero = (window.__game?.systems?.hero?.getRecruitedHeroes?.() || []).find(item => (item.heroId || item.id) === army.heroId);
      const heroStats = window.__game?.systems?.hero?.getHeroAbilityProfile?.(army.heroId)?.stats;
      if (hero && heroStats) {
        const heroRow = document.createElement('div');
        heroRow.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(214,168,75,.12);border:1px solid rgba(214,168,75,.28);border-radius:8px;margin-bottom:7px;';
        heroRow.appendChild(_createArtImage(hero.icon || hero.portrait, hero.portrait || '', { testid: `army-hero-art-${army.id}`, cssText: 'width:46px;height:46px;object-fit:cover;border-radius:8px;background:#111722;' }));
        const text = document.createElement('span');
        text.style.cssText = 'font-size:13px;color:#f2dfb0;flex:1;';
        text.textContent = `${hero.name}（领队单位 · 攻击 ${heroStats.attack} · 生命 ${heroStats.hp} · 射程 ${heroStats.attackRange} · 速度 ${heroStats.speed}）`;
        heroRow.appendChild(text);
        unitsBody.appendChild(heroRow);
      }
    }
    if ((!army.unitIds || army.unitIds.length === 0) && !army.heroId) {
      const emptyUnits = document.createElement('div');
      emptyUnits.style.cssText = 'font-size:12px;color:#808098;text-align:center;padding:8px;';
      emptyUnits.textContent = '尚未配置单位';
      unitsBody.appendChild(emptyUnits);
    } else {
      const counts = {};
      army.unitIds.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
      Object.entries(counts).forEach(([uid, cnt]) => {
        const u = unitMap[uid];
        const uRow = document.createElement('div');
        uRow.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 10px;background:rgba(91,141,239,0.06);border-radius:8px;margin-bottom:4px;';
        uRow.innerHTML = '<span style="font-size:13px;font-weight:500;color:#ececf0;flex:1;">' + (u ? u.name + '（攻击 ' + (u.attack ?? u.combatPower ?? 0) + ' · 生命 ' + (u.hp ?? 0) + ' · 射程 ' + (u.attackRange ?? 1) + ' · 速度 ' + (u.speed ?? 1) + '）' : uid) + '</span><span style="font-size:14px;font-weight:600;color:#a0a0ba;">×' + cnt + '</span>';
        if (u) uRow.appendChild(_createArtImage(u.cardArt, u.icon, {
          testid: `army-unit-art-${uid}`,
          cssText: 'width:42px;height:42px;object-fit:cover;border-radius:7px;background:#111722;'
        }));
        const removeOne = document.createElement('button');
        removeOne.textContent = '−';
        removeOne.style.cssText = 'padding:2px 8px;border:none;border-radius:4px;background:rgba(255,107,107,0.12);color:#ff6b6b;cursor:pointer;font-size:14px;';
        removeOne.title = '归还一个';
        removeOne.addEventListener('click', () => {
          removeFromArmy(army.id, uid);
          renderArmyPanel(data, body, pm);
        });
        uRow.appendChild(removeOne);
        const dismissOne = document.createElement('button');
        dismissOne.textContent = '遣散';
        dismissOne.style.cssText = 'padding:2px 8px;border:none;border-radius:4px;background:rgba(240,160,64,0.12);color:#f0a040;cursor:pointer;font-size:11px;';
        dismissOne.title = '遣散一个，释放士兵名额';
        dismissOne.addEventListener('click', () => {
          dismissFromArmy(army.id, uid);
          renderArmyPanel(data, body, pm);
        });
        uRow.appendChild(dismissOne);
        unitsBody.appendChild(uRow);
      });
      const clearBtn = document.createElement('button');
      clearBtn.textContent = '清空';
      clearBtn.style.cssText = 'padding:3px 10px;border:none;border-radius:4px;background:rgba(255,107,107,0.08);color:#ff6b6b;cursor:pointer;font-size:11px;margin-top:6px;';
      clearBtn.addEventListener('click', () => {
        _armySystem()?.clearArmy?.(army.id, true);
        renderArmyPanel(data, body, pm);
      });
      unitsBody.appendChild(clearBtn);
    }

    /* 添加单位按钮 */
    const addArea = document.createElement('div');
    addArea.style.cssText = 'border-top:1px solid rgba(255,255,255,0.06);padding:10px 16px;display:flex;flex-wrap:wrap;gap:6px;';
    {
     _cfg().filter(u => _isUnitUnlocked(u.id)).forEach(u => {
        const availCount = getAvailCount(u.id);
        const addBtn = document.createElement('button');
        addBtn.textContent = '+' + u.name;
        addBtn.style.cssText = 'padding:4px 10px;border:none;border-radius:5px;background:' + (availCount > 0 ? 'rgba(78,203,113,0.12)' : 'rgba(240,160,64,0.12)') + ';color:' + (availCount > 0 ? '#4ecb71' : '#f0a040') + ';cursor:pointer;font-size:11px;';
        addBtn.title = '可用: ' + availCount;
        addBtn.addEventListener('mouseenter', () => addBtn.style.background = availCount > 0 ? 'rgba(78,203,113,0.25)' : 'rgba(240,160,64,0.25)');
        addBtn.addEventListener('mouseleave', () => addBtn.style.background = availCount > 0 ? 'rgba(78,203,113,0.12)' : 'rgba(240,160,64,0.12)');
        addBtn.addEventListener('click', () => {
          if (availCount <= 0) {
            pm.alert('「' + u.name + '」数量不足，无法添加');
            return;
          }
          if (!addToArmy(army.id, u.id)) return;
          renderArmyPanel(data, body, pm);
        });
        addArea.appendChild(addBtn);
      });
    }
    card.appendChild(unitsBody);
    card.appendChild(addArea);
    body.appendChild(card);
  });
}
