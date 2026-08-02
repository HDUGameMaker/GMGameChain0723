/**
 * army-panel.js - 军队管理面板
 * 创建/编辑/删除部队，配置单位（含数量限制检查）
 */
import {
  calcFormationGroups,
  getFormationRequirementText,
  getFormationStatusText,
  getArmyCombatPower,
  getFormationBonusText
} from '../../utils/FormationUtils.js';
import { eventBus } from '../../core/EventBus.js';

function _getMaxCP() {
  return _armySystem()?.getCommandPointLimit?.() || 20;
}

function _cfg() { return window.__game?.configRegistry?.get('enemies')?.units || []; }
function _store() { return window.__game?.store; }
function _armySystem() { return window.__game?.systems?.army; }
function _armies() { return _armySystem()?.getArmies?.() || []; }
function _avail() { return _armySystem()?.getAvailableUnits?.() || {}; }

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

function calcCP(unitId) {
  const cfg = _cfg().find(u => u.id === unitId);
  return cfg ? (cfg.commandPoints || 1) : 1;
}

function getAvailCount(unitId) {
  const a = _avail();
  return a[unitId] || 0;
}

function addToArmy(armies, ai, uid) {
  return _armySystem()?.addUnit?.(armies[ai].id, uid, 1).ok === true;
}

function removeFromArmy(armies, ai, uid) {
  _armySystem()?.removeUnit?.(armies[ai].id, uid, 1);
}

function dismissFromArmy(armies, ai, uid) {
  return _armySystem()?.dismissUnit?.(armies[ai].id, uid, 1).ok === true;
}

export function renderArmyPanel(data, body, pm) {
  /* 清空 body —— 修复重复渲染 Bug */
  body.innerHTML = '';
  /* 初始化可用兵种数量（首次打开时给默认值） */
  const av = _avail();
  if (Object.keys(av).length === 0) {
    _cfg().filter(u => _isUnitUnlocked(u.id)).forEach(u => {
      av[u.id] = 1;
    });
    _armySystem()?.setAvailableUnits?.(av);
  }
  body.style.cssText = 'padding:20px 24px;max-height:70vh;overflow-y:auto;';

  const armies = _armies();
  const unitMap = {};
  _cfg().forEach(u => unitMap[u.id] = u);

  /* 头部 */
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
  header.innerHTML = '<span style="font-size:18px;font-weight:700;color:#ececf0;">⚔️ 军队管理</span>';
  const createBtn = document.createElement('button');
  createBtn.textContent = '+ 创建部队';
  createBtn.disabled = armies.length >= (_armySystem()?.getArmyCapacity?.() || 2);
  createBtn.style.cssText = 'padding:8px 18px;border:none;border-radius:8px;background:rgba(78,203,113,0.25);color:#4ecb71;cursor:pointer;font-size:13px;font-weight:600;';
  createBtn.addEventListener('mouseenter', () => createBtn.style.background = 'rgba(78,203,113,0.4)');
  createBtn.addEventListener('mouseleave', () => createBtn.style.background = 'rgba(78,203,113,0.25)');
  createBtn.addEventListener('click', () => {
    const n = _armies().length + 1;
    const result = _armySystem()?.createArmy?.('第' + n + '军团');
    if (!result?.ok) {
      pm.alert('军团数量已达上限，需要军事学院、城堡或谋略府提升上限。');
      return;
    }
    renderArmyPanel(data, body, pm);
  });
  header.appendChild(createBtn);
  body.appendChild(header);

  const info = document.createElement('div');
  info.style.cssText = 'font-size:12px;color:#808098;margin-bottom:14px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;';
  info.textContent = '💡 军团 ' + armies.length + '/' + (_armySystem()?.getArmyCapacity?.() || 2) + '；每军团指挥点上限 ' + _getMaxCP() + '。军事学院、城堡与谋略府可提高军团上限。';
  body.appendChild(info);

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
    empty.innerHTML = '暂无部队，点击上方「+ 创建部队」开始组建';
    body.appendChild(empty);
    return;
  }

  armies.forEach((army, ai) => {
    const card = document.createElement('div');
    card.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.08);margin-bottom:12px;overflow:hidden;';
    const usedCP = (army.unitIds || []).reduce((s, id) => s + calcCP(id), 0);
    const totalPower = getArmyCombatPower(army);

    /* 头部行 */
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:14px 16px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.06);';
    const nameInput = document.createElement('input');
    nameInput.value = army.name;
    nameInput.style.cssText = 'flex:1;font-size:15px;font-weight:600;color:#ececf0;background:transparent;border:none;outline:none;padding:2px 0;min-width:0;';
    nameInput.addEventListener('change', () => {
      _armySystem()?.renameArmy?.(army.id, nameInput.value || '未命名');
    });
    row.appendChild(nameInput);

    const cpRatio = usedCP / _getMaxCP();
    const cpColor = cpRatio > 1 ? '#ff6b6b' : cpRatio > 0.8 ? '#f0a040' : '#4ecb71';
    const cpLabel = document.createElement('span');
    cpLabel.style.cssText = 'font-size:12px;color:' + cpColor + ';font-weight:600;white-space:nowrap;';
    cpLabel.textContent = 'CP ' + usedCP + '/' + _getMaxCP();
    row.appendChild(cpLabel);

    const powerLabel = document.createElement('span');
    powerLabel.style.cssText = 'font-size:12px;color:#5b8def;font-weight:600;white-space:nowrap;';
    powerLabel.textContent = '⚔️ ' + totalPower;
    row.appendChild(powerLabel);

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
    for (const hero of commanders) {
      const option = document.createElement('option');
      option.value = hero.heroId || hero.id;
      option.textContent = hero.name;
      option.selected = army.heroId === option.value;
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
    const location = document.createElement('span');
    location.style.marginLeft = 'auto';
    location.textContent = `位置 ${army.gridX},${army.gridY} · 士气 ${army.morale}`;
    commandRow.appendChild(location);
    card.appendChild(commandRow);

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
    if (!army.unitIds || army.unitIds.length === 0) {
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
        uRow.innerHTML = '<span style="font-size:13px;font-weight:500;color:#ececf0;flex:1;">' + (u ? u.name + ' (⚔️' + u.combatPower + ' · CP' + (u.commandPoints||1) + ')' : uid) + '</span><span style="font-size:14px;font-weight:600;color:#a0a0ba;">×' + cnt + '</span>';
        const removeOne = document.createElement('button');
        removeOne.textContent = '−';
        removeOne.style.cssText = 'padding:2px 8px;border:none;border-radius:4px;background:rgba(255,107,107,0.12);color:#ff6b6b;cursor:pointer;font-size:14px;';
        removeOne.title = '归还一个';
        removeOne.addEventListener('click', () => {
          const a = _armies();
          removeFromArmy(a, ai, uid);
          renderArmyPanel(data, body, pm);
        });
        uRow.appendChild(removeOne);
        const dismissOne = document.createElement('button');
        dismissOne.textContent = '遣散';
        dismissOne.style.cssText = 'padding:2px 8px;border:none;border-radius:4px;background:rgba(240,160,64,0.12);color:#f0a040;cursor:pointer;font-size:11px;';
        dismissOne.title = '遣散一个，释放士兵名额';
        dismissOne.addEventListener('click', () => {
          const a = _armies();
          dismissFromArmy(a, ai, uid);
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
    if (usedCP >= _getMaxCP()) {
      const fullMsg = document.createElement('span');
      fullMsg.style.cssText = 'font-size:11px;color:#f0a040;';
      fullMsg.textContent = '指挥点已满，无法继续添加';
      addArea.appendChild(fullMsg);
    } else {
     _cfg().filter(u => _isUnitUnlocked(u.id) && usedCP + calcCP(u.id) <= _getMaxCP()).forEach(u => {
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
          const a = _armies();
          if (!addToArmy(a, ai, u.id)) return;
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
