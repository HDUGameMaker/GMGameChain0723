/**
 * alchemy-panel.js - 炼金主界面面板
 * 渲染函数签名: renderAlchemyPanel(data, bodyElement, popupManager)
 */
import { configRegistry } from '../../core/ConfigRegistry.js';

// CSS 通过 body 中的 <style> 注入一次
let _styleInjected = false;
function _injectStyles() {
  if (_styleInjected) return;
  _styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .alchemy-container { display:flex; gap:12px; height:480px; color:#d0d0d0; font-size:13px; }
    .alchemy-section { background:rgba(255,255,255,0.04); border-radius:8px; padding:10px; overflow-y:auto; }
    .alchemy-section h3 { margin:0 0 8px 0; font-size:13px; color:#aaa; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; }
    .alchemy-left { width:180px; flex-shrink:0; }
    .alchemy-center { flex:1; display:flex; flex-direction:column; gap:8px; }
    .alchemy-right { width:200px; flex-shrink:0; display:flex; flex-direction:column; gap:8px; }

    .alchemy-base-option { padding:8px; border:1px solid rgba(255,255,255,0.15); border-radius:6px; margin-bottom:6px; cursor:pointer; transition:all 0.2s; }
    .alchemy-base-option:hover { background:rgba(255,255,255,0.06); }
    .alchemy-base-option.selected { border-color:#9b59b6; background:rgba(155,89,182,0.15); }
    .alchemy-base-option.locked { opacity:0.4; cursor:not-allowed; }
    .alchemy-base-option .base-name { font-weight:bold; }
    .alchemy-base-option .base-desc { font-size:11px; color:#999; margin-top:2px; }

    .alchemy-material-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
    .alchemy-material-card { padding:6px; border:1px solid rgba(255,255,255,0.1); border-radius:6px; cursor:pointer; text-align:center; transition:all 0.2s; position:relative; }
    .alchemy-material-card:hover { background:rgba(255,255,255,0.06); }
    .alchemy-material-card.selected { border-color:#f39c12; background:rgba(243,156,18,0.1); }
    .alchemy-material-card.insufficient { opacity:0.35; cursor:not-allowed; }
    .alchemy-material-card .mat-name { font-size:11px; font-weight:bold; margin-bottom:2px; }
    .alchemy-material-card .mat-stock { font-size:10px; color:#999; }
    .alchemy-material-card .mat-element { font-size:10px; }
    .alchemy-material-card .mat-rarity { position:absolute; top:3px; right:4px; font-size:9px; }
    .alchemy-element-filter { display:flex; gap:4px; margin-bottom:8px; flex-wrap:wrap; }
    .alchemy-element-filter button { padding:2px 8px; border:1px solid rgba(255,255,255,0.15); border-radius:4px; background:transparent; color:#aaa; cursor:pointer; font-size:11px; }
    .alchemy-element-filter button.active { background:rgba(255,255,255,0.1); color:#fff; }

    .alchemy-selected-materials { display:flex; gap:6px; min-height:36px; flex-wrap:wrap; align-items:center; padding:4px; background:rgba(0,0,0,0.2); border-radius:6px; }
    .alchemy-selected-mat { padding:3px 8px; background:rgba(243,156,18,0.15); border:1px solid rgba(243,156,18,0.3); border-radius:4px; font-size:11px; display:flex; align-items:center; gap:6px; }
    .alchemy-selected-mat .remove-mat { cursor:pointer; color:#e74c3c; font-weight:bold; }
    .alchemy-selected-mat .grind-slider { width:50px; }
    .alchemy-empty-hint { font-size:11px; color:#666; }

    .alchemy-process-options { display:flex; gap:6px; margin-top:4px; }
    .alchemy-process-btn { flex:1; padding:6px; border:1px solid rgba(255,255,255,0.15); border-radius:6px; background:transparent; color:#ccc; cursor:pointer; text-align:center; font-size:12px; transition:all 0.2s; }
    .alchemy-process-btn:hover { background:rgba(255,255,255,0.06); }
    .alchemy-process-btn.selected { border-color:#3498db; background:rgba(52,152,219,0.15); color:#3498db; }

    .alchemy-brew-status { flex:1; }
    .alchemy-brew-status .stat-row { display:flex; justify-content:space-between; padding:3px 0; font-size:11px; border-bottom:1px solid rgba(255,255,255,0.05); }
    .alchemy-brew-status .stat-label { color:#999; }
    .alchemy-brew-status .stat-value { color:#ddd; }
    .alchemy-brew-progress { margin-top:8px; }
    .alchemy-brew-progress .progress-bar-bg { height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden; }
    .alchemy-brew-progress .progress-bar-fill { height:100%; background:linear-gradient(90deg,#9b59b6,#3498db); border-radius:4px; transition:width 0.3s; }
    .alchemy-brew-progress .progress-text { font-size:10px; color:#999; margin-top:2px; text-align:center; }

    .alchemy-action-bar { display:flex; gap:6px; margin-top:auto; padding-top:8px; }
    .alchemy-btn { flex:1; padding:8px; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:bold; transition:all 0.2s; }
    .alchemy-btn.primary { background:#9b59b6; color:#fff; }
    .alchemy-btn.primary:hover { background:#8e44ad; }
    .alchemy-btn.primary:disabled { background:#555; color:#999; cursor:not-allowed; }
    .alchemy-btn.secondary { background:rgba(255,255,255,0.08); color:#ccc; border:1px solid rgba(255,255,255,0.15); }
    .alchemy-btn.secondary:hover { background:rgba(255,255,255,0.12); }
    .alchemy-btn.danger { background:rgba(231,76,60,0.15); color:#e74c3c; border:1px solid rgba(231,76,60,0.3); }
    .alchemy-btn.danger:hover { background:rgba(231,76,60,0.25); }

    .alchemy-level-info { font-size:12px; margin-bottom:8px; color:#aaa; }
    .alchemy-level-info strong { color:#f39c12; }
    .alchemy-level-xp-bar { height:4px; background:rgba(255,255,255,0.1); border-radius:2px; margin:4px 0; overflow:hidden; }
    .alchemy-level-xp-fill { height:100%; background:#f39c12; border-radius:2px; }

    .alchemy-recipe-list-item { padding:5px 8px; border:1px solid rgba(255,255,255,0.1); border-radius:4px; margin-bottom:3px; cursor:pointer; font-size:11px; transition:all 0.1s; }
    .alchemy-recipe-list-item:hover { background:rgba(255,255,255,0.05); }
    .alchemy-recipe-list-item.selected { border-color:#9b59b6; background:rgba(155,89,182,0.1); }
  `;
  document.head.appendChild(style);
}

/**
 * @param {Object} data - { alchemySystem }
 * @param {HTMLElement} body
 * @param {Object} pm - PopupManager
 */
export function renderAlchemyPanel(data, body, pm) {
  _injectStyles();
  const sys = data.alchemySystem;
  if (!sys) { body.innerHTML = '<p style="color:#e74c3c">炼金系统未就绪</p>'; return; }

  const level = sys.getLevel();
  const xp = sys.getXP();
  const xpToNext = sys.getXPToNext();
  const brewingState = sys.getBrewingState();
  const magnumOpus = sys.getMagnumOpusStage();
  const salts = sys.getSalts();
  const materialStock = sys.getMaterialStock();
  const availableBases = sys.getAvailableBases();
  const availableRecipes = sys.getAvailableRecipes();
  const activeEffects = sys.getActiveEffects();

  // 读取当前选中状态（如果有酿造进行中则不可修改）
  const isBrewing = brewingState !== null;

  const container = document.createElement('div');
  container.className = 'alchemy-container';

  // ===== 左侧：基底选择 =====
  const left = document.createElement('div');
  left.className = 'alchemy-section alchemy-left';
  left.innerHTML = '<h3>🧪 基底</h3>';

  const allBases = sys._getBases();
  const selectedBase = body._alchemySelectedBase || (allBases.length > 0 ? allBases[0].id : null);
  if (!body._alchemySelectedBase && allBases.length > 0) body._alchemySelectedBase = allBases[0].id;

  for (const base of allBases) {
    const unlocked = base.unlockLevel <= level;
    const selected = body._alchemySelectedBase === base.id;
    const div = document.createElement('div');
    div.className = 'alchemy-base-option' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked');
    div.innerHTML = `
      <div class="base-name">${base.name}</div>
      <div class="base-desc">${base.description}</div>
      <div style="font-size:10px;color:#666;margin-top:3px;">
        ${unlocked ? '已解锁' : '需要炼金等级 ' + base.unlockLevel}
        ${unlocked && base.cost ? ' | 消耗: ' + base.cost.map(c => c.amount + c.resourceId).join(',') : ''}
      </div>
    `;
    if (unlocked && !isBrewing) {
      div.addEventListener('click', () => {
        body._alchemySelectedBase = base.id;
        pm.refresh(data);
      });
    }
    left.appendChild(div);
  }

  // ===== 中部：材料区 + 配方列表 =====
  const center = document.createElement('div');
  center.className = 'alchemy-center';

  // 材料区
  const matSection = document.createElement('div');
  matSection.className = 'alchemy-section';
  matSection.style.flex = '1';

  // 元素筛选
  const elements = ['all', 'fire', 'water', 'earth', 'wind', 'void'];
  const elementNames = { all: '全部', fire: '🔥火', water: '💧水', earth: '🌍土', wind: '💨风', void: '🌑虚空' };
  const elementFilter = document.createElement('div');
  elementFilter.className = 'alchemy-element-filter';
  const currentFilter = body._alchemyElementFilter || 'all';
  for (const el of elements) {
    const btn = document.createElement('button');
    btn.textContent = elementNames[el];
    if (el === currentFilter) btn.classList.add('active');
    btn.addEventListener('click', () => {
      body._alchemyElementFilter = el;
      pm.refresh(data);
    });
    elementFilter.appendChild(btn);
  }
  matSection.appendChild(elementFilter);

  // 材料网格
  const grid = document.createElement('div');
  grid.className = 'alchemy-material-grid';
  const filteredMaterials = currentFilter === 'all'
    ? materialStock
    : materialStock.filter(m => m.element === currentFilter);

  body._alchemySelectedMaterials = body._alchemySelectedMaterials || [];
  const maxMats = sys._getGlobal().maxMaterialsPerBrew || 5;

  for (const mat of filteredMaterials) {
    const isSelected = body._alchemySelectedMaterials.includes(mat.id);
    const canSelect = mat.stock > 0 && !isBrewing;
    const card = document.createElement('div');
    card.className = 'alchemy-material-card' + (isSelected ? ' selected' : '') + (!canSelect && !isSelected ? ' insufficient' : '');
    card.innerHTML = `
      <div class="mat-rarity" style="color:${mat.rarity === 'legendary' ? '#f1c40f' : mat.rarity === 'rare' ? '#3498db' : mat.rarity === 'uncommon' ? '#2ecc71' : '#999'}">${mat.rarity === 'legendary' ? '★' : mat.rarity === 'rare' ? '◆' : mat.rarity === 'uncommon' ? '◇' : ''}</div>
      <div class="mat-element">${elementNames[mat.element] || mat.element}</div>
      <div class="mat-name">${mat.name}</div>
      <div class="mat-stock">库存: ${mat.stock} | 效力:${mat.potency}</div>
    `;
    if (canSelect && body._alchemySelectedMaterials.length < maxMats) {
      card.addEventListener('click', () => {
        if (!body._alchemySelectedMaterials.includes(mat.id)) {
          body._alchemySelectedMaterials.push(mat.id);
          // 自动设置研磨
          if (!body._alchemyGrindLevels) body._alchemyGrindLevels = {};
          if (!(mat.id in body._alchemyGrindLevels)) body._alchemyGrindLevels[mat.id] = 0;
          pm.refresh(data);
        }
      });
    }
    grid.appendChild(card);
  }
  matSection.appendChild(grid);

  // 已选材料栏（带研磨滑块）
  const selectedBar = document.createElement('div');
  selectedBar.className = 'alchemy-selected-materials';
  body._alchemyGrindLevels = body._alchemyGrindLevels || {};

  if (body._alchemySelectedMaterials.length === 0) {
    selectedBar.innerHTML = '<span class="alchemy-empty-hint">点击材料添加到坩埚（最多' + maxMats + '种）</span>';
  } else {
    for (const mid of body._alchemySelectedMaterials) {
      const mat = materialStock.find(m => m.id === mid);
      if (!mat) continue;
      const grind = body._alchemyGrindLevels[mid] || 0;
      const wrap = document.createElement('div');
      wrap.className = 'alchemy-selected-mat';
      wrap.innerHTML = `
        <span>${mat.name}</span>
        <input type="range" class="grind-slider" min="0" max="100" value="${grind}" ${isBrewing ? 'disabled' : ''}>
        <span style="font-size:10px;color:#f39c12;min-width:24px">${grind}%</span>
        <span class="remove-mat" ${isBrewing ? 'style="display:none"' : ''}>×</span>
      `;
      if (!isBrewing) {
        wrap.querySelector('.remove-mat').addEventListener('click', () => {
          body._alchemySelectedMaterials = body._alchemySelectedMaterials.filter(id => id !== mid);
          delete body._alchemyGrindLevels[mid];
          pm.refresh(data);
        });
        wrap.querySelector('.grind-slider').addEventListener('input', (e) => {
          body._alchemyGrindLevels[mid] = parseInt(e.target.value);
          wrap.querySelector('span:last-of-type').previousElementSibling.textContent = e.target.value + '%';
        });
      }
      selectedBar.appendChild(wrap);
    }
  }
  matSection.appendChild(selectedBar);

  // 加工方式选择
  body._alchemyProcessType = body._alchemyProcessType || 'heat';
  const currentBase = allBases.find(b => b.id === body._alchemySelectedBase);
  const processSection = document.createElement('div');
  processSection.style.marginTop = '8px';
  const procTypes = sys._getProcessingTypes();
  const procDiv = document.createElement('div');
  procDiv.className = 'alchemy-process-options';
  for (const [pid, pcfg] of Object.entries(procTypes)) {
    const baseProcessTypes = currentBase && (currentBase.compatibleProcessTypes || currentBase.processTypes);
    const compatible = !!(baseProcessTypes && baseProcessTypes.includes(pid));
    const btn = document.createElement('button');
    btn.className = 'alchemy-process-btn' + (body._alchemyProcessType === pid ? ' selected' : '');
    btn.textContent = pcfg.name + (compatible ? '' : ' (不兼容)');
    btn.title = pcfg.description;
    if (!isBrewing && compatible) {
      btn.addEventListener('click', () => {
        body._alchemyProcessType = pid;
        pm.refresh(data);
      });
    }
    if (!compatible) btn.style.opacity = '0.4';
    procDiv.appendChild(btn);
  }
  processSection.appendChild(procDiv);
  matSection.appendChild(processSection);

  center.appendChild(matSection);

  // 已知配方选择
  const recipeSection = document.createElement('div');
  recipeSection.className = 'alchemy-section';
  recipeSection.style.maxHeight = '140px';
  recipeSection.innerHTML = '<h3>📜 已知配方</h3>';
  const baseRecipes = availableRecipes.filter(r => r.base === body._alchemySelectedBase);
  for (const recipe of baseRecipes.slice(0, 8)) {
    const isSelected = body._alchemySelectedRecipe === recipe.id;
    const div = document.createElement('div');
    div.className = 'alchemy-recipe-list-item' + (isSelected ? ' selected' : '');
    div.textContent = `${recipe.name} (Lv${recipe.requiredLevel}) — ${recipe.materials.map(mid => {
      const m = materialStock.find(x => x.id === mid);
      return m ? m.name : mid;
    }).join(' + ')}`;
    div.addEventListener('click', () => {
      if (isBrewing) return;
      body._alchemySelectedRecipe = isSelected ? null : recipe.id;
      if (recipe.id) {
        body._alchemySelectedMaterials = [...recipe.materials];
        body._alchemyGrindLevels = {};
        for (const mid of recipe.materials) body._alchemyGrindLevels[mid] = 0;
        body._alchemyProcessType = recipe.processType;
      }
      pm.refresh(data);
    });
    recipeSection.appendChild(div);
  }
  center.appendChild(recipeSection);

  // ===== 右侧：状态 + 操作 =====
  const right = document.createElement('div');
  right.className = 'alchemy-right';

  // 等级信息
  const levelInfo = document.createElement('div');
  levelInfo.className = 'alchemy-section';
  const xpPercent = xpToNext > 0 ? Math.min(100, (xp / xpToNext) * 100) : 100;
  levelInfo.innerHTML = `
    <div class="alchemy-level-info">炼金等级: <strong>${level}/10</strong></div>
    <div class="alchemy-level-xp-bar"><div class="alchemy-level-xp-fill" style="width:${xpPercent}%"></div></div>
    <div style="font-size:10px;color:#888;text-align:right;">XP: ${xp}/${xpToNext}</div>
    <div style="font-size:10px;color:#666;margin-top:4px;">伟大工作: ${magnumOpus === 'none' ? '未开始' : magnumOpus}</div>
    <div style="font-size:10px;color:#666;">发现配方: ${sys.getDiscoveredRecipes().length} 个</div>
    <div style="font-size:10px;color:#666;">激活药效: ${activeEffects.length} 个</div>
  `;
  right.appendChild(levelInfo);

  // 酿造状态
  const brewStatus = document.createElement('div');
  brewStatus.className = 'alchemy-section alchemy-brew-status';
  if (isBrewing) {
    const recipeName = brewingState.recipeId
      ? (configRegistry.getAlchemyRecipe(brewingState.recipeId) || {}).name || brewingState.recipeId
      : '自由实验';
    const progress = Math.round((brewingState.ticksElapsed / brewingState.totalTicks) * 100);
    const successPct = Math.round(brewingState.successChance * 100);
    brewStatus.innerHTML = `
      <h3>⚗️ 酿造中...</h3>
      <div class="alchemy-brew-progress">
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${progress}%"></div></div>
        <div class="progress-text">${brewingState.ticksElapsed}/${brewingState.totalTicks} ticks (${progress}%)</div>
      </div>
      <div style="margin-top:8px;">
        <div class="stat-row"><span class="stat-label">配方</span><span class="stat-value">${recipeName}</span></div>
        <div class="stat-row"><span class="stat-label">基底</span><span class="stat-value">${brewingState.baseId}</span></div>
        <div class="stat-row"><span class="stat-label">成功率</span><span class="stat-value" style="color:${successPct > 70 ? '#2ecc71' : successPct > 40 ? '#f39c12' : '#e74c3c'}">${successPct}%</span></div>
      </div>
      <button class="alchemy-btn danger" style="width:100%;margin-top:8px;" id="alchemy-cancel-btn">取消酿造 (返还50%材料)</button>
    `;
  } else {
    const selectedCount = body._alchemySelectedMaterials.length;
    const canBrew = selectedCount >= 2 && body._alchemySelectedBase && body._alchemyProcessType;
    brewStatus.innerHTML = `
      <h3>⚗️ 准备酿造</h3>
      <div style="margin-top:8px;">
        <div class="stat-row"><span class="stat-label">已选材料</span><span class="stat-value">${selectedCount}/${maxMats}</span></div>
        <div class="stat-row"><span class="stat-label">基底</span><span class="stat-value">${body._alchemySelectedBase || '未选择'}</span></div>
        <div class="stat-row"><span class="stat-label">加工方式</span><span class="stat-value">${body._alchemyProcessType || '未选择'}</span></div>
        ${body._alchemySelectedRecipe ? '<div class="stat-row"><span class="stat-label">配方</span><span class="stat-value">' + (configRegistry.getAlchemyRecipe(body._alchemySelectedRecipe) || {}).name + '</span></div>' : ''}
      </div>
      ${!canBrew && selectedCount < 2 ? '<p style="font-size:11px;color:#e74c3c;margin-top:8px;">至少需要2种材料</p>' : ''}
    `;
  }
  right.appendChild(brewStatus);

  // 盐库存
  const saltSection = document.createElement('div');
  saltSection.className = 'alchemy-section';
  saltSection.style.maxHeight = '100px';
  saltSection.innerHTML = '<h3>🧂 炼金盐</h3>';
  const saltConfigs = sys._getSalts();
  for (const sc of saltConfigs) {
    const hasSalt = (salts[sc.id.replace('_salt', '')] || 0) > 0;
    const div = document.createElement('div');
    div.style.cssText = 'font-size:10px;padding:2px 0;color:' + (hasSalt ? '#f39c12' : '#666') + ';';
    div.textContent = `${sc.name}: ${hasSalt ? '✓ (' + (salts[sc.id.replace('_salt', '')] || 0) + '粒)' : '未获得'}`;
    saltSection.appendChild(div);
  }
  right.appendChild(saltSection);

  // 操作按钮
  const actionBar = document.createElement('div');
  actionBar.className = 'alchemy-action-bar';

  if (isBrewing) {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'alchemy-btn danger';
    cancelBtn.textContent = '取消酿造';
    cancelBtn.addEventListener('click', () => {
      const result = sys.cancelBrewing();
      if (result.valid) {
        body._alchemySelectedMaterials = [];
        body._alchemyGrindLevels = {};
        body._alchemySelectedRecipe = null;
      }
      pm.refresh(data);
    });
    actionBar.appendChild(cancelBtn);
  } else {
    // 实验按钮
    const experimentBtn = document.createElement('button');
    experimentBtn.className = 'alchemy-btn primary';
    experimentBtn.textContent = '🔮 自由实验';
    experimentBtn.disabled = body._alchemySelectedMaterials.length < 2;
    experimentBtn.addEventListener('click', () => {
      const result = sys.experiment(
        body._alchemySelectedBase,
        [...body._alchemySelectedMaterials],
        body._alchemyProcessType,
        body._alchemyGrindLevels || {}
      );
      if (result.valid) {
        body._alchemySelectedMaterials = [];
        body._alchemyGrindLevels = {};
        body._alchemySelectedRecipe = null;
        pm.refresh(data);
      } else {
        alert('实验失败: ' + result.reason);
      }
    });
    actionBar.appendChild(experimentBtn);

    // 按配方酿造按钮
    const craftBtn = document.createElement('button');
    craftBtn.className = 'alchemy-btn secondary';
    craftBtn.textContent = '📋 按配方酿造';
    craftBtn.disabled = !body._alchemySelectedRecipe;
    craftBtn.addEventListener('click', () => {
      if (!body._alchemySelectedRecipe) return;
      const result = sys.craftRecipe(body._alchemySelectedRecipe, body._alchemyGrindLevels || {});
      if (result.valid) {
        body._alchemySelectedMaterials = [];
        body._alchemyGrindLevels = {};
        body._alchemySelectedRecipe = null;
        pm.refresh(data);
      } else {
        alert('酿造失败: ' + result.reason);
      }
    });
    actionBar.appendChild(craftBtn);
  }

  // 药剂库存按钮
  const invBtn = document.createElement('button');
  invBtn.className = 'alchemy-btn secondary';
  invBtn.textContent = '🧴 药剂库存';
  invBtn.addEventListener('click', () => {
    pm.push('potion_inventory', { alchemySystem: sys });
  });
  actionBar.appendChild(invBtn);

  right.appendChild(actionBar);

  container.appendChild(left);
  container.appendChild(center);
  container.appendChild(right);
  body.appendChild(container);

  // 取消酿造事件绑定
  setTimeout(() => {
    const cancelBtn = body.querySelector('#alchemy-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        sys.cancelBrewing();
        body._alchemySelectedMaterials = [];
        body._alchemyGrindLevels = {};
        body._alchemySelectedRecipe = null;
        pm.refresh(data);
      });
    }
  }, 10);
}
