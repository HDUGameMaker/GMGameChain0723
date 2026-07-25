/**
 * planner-config-forms.js — 表单事件绑定和字段变更处理
 *
 * 包含: addGroundType, deleteGroundType, bindFormEvents,
 *       getItem, applyFieldChange, addSubEntry, removeSubEntry,
 *       applySubChange, applyYieldChange, applyGroundTypeChange, applyOptionChange
 *
 * 依赖: planner-config-core.js, planner-config-render.js, planner-config-map-draw.js,
 *       planner-config-map-edit.js
 * 被 planner-config-render.js (renderDetail → bindFormEvents) 调用
 */

/* ═══════════════════════════════════════════
   Form event binding
   ═══════════════════════════════════════════ */
function addGroundType() {
  // Prompt for a single-letter terrain key
  const key = prompt('请输入新地形类型的代码（单个大写字母，如 S、L）:');
  if (!key) return;
  const trimmed = key.trim().toUpperCase();
  if (trimmed.length !== 1 || !/^[A-Z]$/.test(trimmed)) {
    showToast('地形代码必须是单个大写字母（A-Z）', 'error');
    return;
  }
  if (state.data.base_map.groundTypes[trimmed]) {
    showToast('地形代码 "' + trimmed + '" 已存在', 'error');
    return;
  }
  state.data.base_map.groundTypes[trimmed] = {
    name: '新地形',
    buildable: true,
    colorHint: '#888888'
  };
  markDirty();
  renderDetail();
  showToast('已添加地形类型: ' + trimmed, 'success');
}

function deleteGroundType(key) {
  if (!confirm('确定要删除地形类型 "' + key + '" 吗？\n注意：地图网格中使用该代码的格子将失去颜色引用。')) return;
  delete state.data.base_map.groundTypes[key];
  markDirty();
  renderDetail();
  showToast('已删除地形类型: ' + key, 'success');
}

function bindFormEvents() {
  const panel = document.getElementById('detailPanel');

  // Regular field changes
  panel.querySelectorAll('input[data-field], textarea[data-field], select[data-field]').forEach(el => {
    el.addEventListener('change', () => applyFieldChange(el));
    if (el.type !== 'checkbox') el.addEventListener('blur', () => applyFieldChange(el));
  });

  // Sub-list add buttons
  panel.querySelectorAll('.sub-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const subName = btn.dataset.sub;
      addSubEntry(subName);
    });
  });
  // Sub-list delete buttons
  panel.querySelectorAll('.sub-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = btn.closest('.sub-row');
      const subIdx = parseInt(row.dataset.subidx);
      const subName = row.closest('.sub-list').id.replace('sl_', '');
      removeSubEntry(subName, subIdx);
    });
  });

  // Sub-list inline changes
  panel.querySelectorAll('.sub-row input, .sub-row select').forEach(el => {
    el.addEventListener('change', () => applySubChange(el));
    if (el.tagName === 'INPUT' && el.type !== 'checkbox') el.addEventListener('blur', () => applySubChange(el));
  });

  // Yield fields
  panel.querySelectorAll('[data-yield]').forEach(el => {
    el.addEventListener('change', () => applyYieldChange(el));
  });

  // Ground type fields
  panel.querySelectorAll('[data-gt]').forEach(el => {
    el.addEventListener('change', () => applyGroundTypeChange(el));
  });

  // Option text fields
  panel.querySelectorAll('[data-opt]').forEach(el => {
    el.addEventListener('change', () => applyOptionChange(el));
  });

  // Torch checkbox toggles torch fields visibility
  const isTorchCheckbox = document.getElementById('f_isTorch');
  const torchFields = document.getElementById('torchFields');
  if (isTorchCheckbox && torchFields) {
    isTorchCheckbox.addEventListener('change', function() {
      torchFields.style.display = this.checked ? 'block' : 'none';
    });
  }

  // Map editor: mode buttons
  panel.querySelectorAll('.map-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      setMapEditorMode(mode);
    });
  });

  // Map editor: terrain palette swatches
  panel.querySelectorAll('.map-palette-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const ch = swatch.dataset.ground;
      state.mapEditorBrush = ch;
      // Update active highlight
      panel.querySelectorAll('.map-palette-swatch').forEach(s => s.classList.remove('map-palette-swatch-active'));
      swatch.classList.add('map-palette-swatch-active');
      // Switch to brush if in non-terrain mode (building/entrance)
      if (state.mapEditorMode === 'building' || state.mapEditorMode === 'entrance') setMapEditorMode('brush');
    });
  });

  // Map editor: building selector
  const bldSelect = document.getElementById('mapBldSelect');
  if (bldSelect) {
    bldSelect.addEventListener('change', () => {
      state.mapEditorBuilding = bldSelect.value || null;
    });
  }

  // Generate random map button
  const genBtn = document.getElementById('btnGenerateMap');
  if (genBtn && !genBtn._bound) {
    genBtn._bound = true;
    genBtn.addEventListener('click', () => {
      if (!confirm('确定要生成新的100×100随机地图吗？当前地图将被覆盖。')) return;
      const m = state.data.base_map;
      pushUndo();
      m.gridWidth = 100;
      m.gridHeight = 100;
      m.grid = generateRandomMap(100, 100);
      m.initialBuildings = [];
      m.expeditionEntrances = [];
      state.mapEditorSelectedBuilding = -1;
      state.mapEditorDragTarget = null;
      state.canvasScale = 1.0;
      state.canvasOffsetX = 0;
      state.canvasOffsetY = 0;
      markDirty();
      renderDetail();
      drawMapCanvas();
      showToast('已生成100×100随机地图', 'success');
    });
  }

  // Init canvas events (once per render)
  setTimeout(initMapCanvasEvents, 50);
  // Redraw canvas
  setTimeout(drawMapCanvas, 100);
}

function getItem() {
  const data = currentData();
  if (!data || state.selectedIdx < 0 || state.selectedIdx >= data.length) return null;
  return data[state.selectedIdx];
}

function applyFieldChange(el) {
  const item = getItem();
  if (!item) return;
  const fieldName = el.dataset.field;
  let value = el.type === 'checkbox' ? el.checked : el.value;

  // Parse numbers
  if (el.type === 'number') value = value === '' ? null : parseFloat(value);

  // Handle nested fields
  if (fieldName === 'footprintWidth') {
    if (!item.footprint) item.footprint = { width: 1, height: 1 };
    item.footprint.width = parseInt(value) || 1;
  } else if (fieldName === 'footprintHeight') {
    if (!item.footprint) item.footprint = { width: 1, height: 1 };
    item.footprint.height = parseInt(value) || 1;
  } else if (fieldName === 'allowedGrounds') {
    item.allowedGrounds = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  } else if (fieldName === 'tcPeriods') {
    if (!item.triggerConditions) item.triggerConditions = {};
    item.triggerConditions.timePeriods = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  } else if (fieldName === 'tcItems') {
    if (!item.triggerConditions) item.triggerConditions = {};
    item.triggerConditions.requiredItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  } else if (fieldName === 'tcBuildings') {
    if (!item.triggerConditions) item.triggerConditions = {};
    item.triggerConditions.requiredBuildings = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  } else if (fieldName === 'tcRegions') {
    if (!item.triggerConditions) item.triggerConditions = {};
    item.triggerConditions.regions = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  } else if (fieldName === 'tcCarriedItems') {
    if (!item.triggerConditions) item.triggerConditions = {};
    item.triggerConditions.requiredCarriedItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  } else if (fieldName === 'icItems') {
    if (!item.invalidationConditions) item.invalidationConditions = {};
    item.invalidationConditions.requiredItems = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  } else if (fieldName === 'icBuildings') {
    if (!item.invalidationConditions) item.invalidationConditions = {};
    item.invalidationConditions.requiredBuildings = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  } else if (fieldName === 'll_nameOffsetY') {
    if (!item.labelLayout) item.labelLayout = {};
    item.labelLayout.nameOffsetY = parseInt(value) || 0;
  } else if (fieldName === 'll_progressBarOffsetY') {
    if (!item.labelLayout) item.labelLayout = {};
    item.labelLayout.progressBarOffsetY = parseInt(value) || 0;
  } else if (fieldName === 'll_workersOffsetY') {
    if (!item.labelLayout) item.labelLayout = {};
    item.labelLayout.workersOffsetY = parseInt(value) || 0;
  } else if (fieldName === 'iconLayout_scaleX') {
    if (!item.mapIconLayout) item.mapIconLayout = {};
    item.mapIconLayout.scaleX = parseFloat(value) || 1.0;
  } else if (fieldName === 'iconLayout_scaleY') {
    if (!item.mapIconLayout) item.mapIconLayout = {};
    item.mapIconLayout.scaleY = parseFloat(value) || 1.0;
  } else if (fieldName === 'iconLayout_offsetX') {
    if (!item.mapIconLayout) item.mapIconLayout = {};
    item.mapIconLayout.offsetX = parseInt(value) || 0;
  } else if (fieldName === 'iconLayout_offsetY') {
    if (!item.mapIconLayout) item.mapIconLayout = {};
    item.mapIconLayout.offsetY = parseInt(value) || 0;
  } else if (fieldName === 'anim_spriteSheet') {
    if (!item.animation) item.animation = {};
    item.animation.spriteSheet = value || '';
  } else if (fieldName === 'anim_frameCount') {
    if (!item.animation) item.animation = {};
    item.animation.frameCount = parseInt(value) || 8;
  } else if (fieldName === 'anim_fps') {
    if (!item.animation) item.animation = {};
    item.animation.fps = parseInt(value) || 8;
  } else if (fieldName === 'anim_pingpong') {
    if (!item.animation) item.animation = {};
    item.animation.pingpong = !!value;
  } else if (fieldName === 'anim_frameWidth') {
    if (!item.animation) item.animation = {};
    item.animation.frameWidth = value === '' ? undefined : (parseInt(value) || 0);
  } else if (fieldName === 'anim_frameHeight') {
    if (!item.animation) item.animation = {};
    item.animation.frameHeight = value === '' ? undefined : (parseInt(value) || 0);
  } else if (fieldName === 'danim_frameCount') {
    if (!item.detailAnimation) item.detailAnimation = {};
    item.detailAnimation.frameCount = value === '' ? undefined : (parseInt(value) || 0);
  } else if (fieldName === 'danim_fps') {
    if (!item.detailAnimation) item.detailAnimation = {};
    item.detailAnimation.fps = parseInt(value) || 6;
  } else if (fieldName === 'danim_pingpong') {
    if (!item.detailAnimation) item.detailAnimation = {};
    item.detailAnimation.pingpong = !!value;
  } else if (fieldName === 'danim_frameWidth') {
    if (!item.detailAnimation) item.detailAnimation = {};
    item.detailAnimation.frameWidth = value === '' ? undefined : (parseInt(value) || 0);
  } else if (fieldName === 'danim_frameHeight') {
    if (!item.detailAnimation) item.detailAnimation = {};
    item.detailAnimation.frameHeight = value === '' ? undefined : (parseInt(value) || 0);
  } else if (fieldName === 'prod_perWorker') {
    if (item.production) item.production.perWorker = !!value;
  } else if (fieldName === 'map_gridWidth') {
    const newW = parseInt(value) || 1;
    const oldW = state.data.base_map.gridWidth;
    state.data.base_map.gridWidth = newW;
    if (newW !== oldW) adjustGridForResize();
    scheduleCanvasRedraw();
  } else if (fieldName === 'map_gridHeight') {
    const newH = parseInt(value) || 1;
    const oldH = state.data.base_map.gridHeight;
    state.data.base_map.gridHeight = newH;
    if (newH !== oldH) adjustGridForResize();
    scheduleCanvasRedraw();
  } else if (fieldName === 'map_tileSize') {
    state.data.base_map.tileSize = parseInt(value) || 32;
  } else if (fieldName === 'map_viewportCols') {
    state.data.base_map.viewportCols = parseInt(value) || state.data.base_map.gridWidth;
  } else if (fieldName === 'map_viewportRows') {
    state.data.base_map.viewportRows = parseInt(value) || state.data.base_map.gridHeight;
  } else if (fieldName === 'ic_gridX') {
    if (!state.data.base_map.initialCamera) state.data.base_map.initialCamera = {};
    state.data.base_map.initialCamera.gridX = parseInt(value) || 0;
  } else if (fieldName === 'ic_gridY') {
    if (!state.data.base_map.initialCamera) state.data.base_map.initialCamera = {};
    state.data.base_map.initialCamera.gridY = parseInt(value) || 0;
  } else if (fieldName === 'ic_zoom') {
    if (!state.data.base_map.initialCamera) state.data.base_map.initialCamera = {};
    state.data.base_map.initialCamera.zoom = parseFloat(value) || 1.0;
  } else {
    item[fieldName] = value;
  }

  markDirty();
}

function addSubEntry(subName) {
  const item = getItem();
  if (!item) return;
  let newEntry = { resourceId: '', amount: 0 };
  if (subName === 'entrances') {
    newEntry = { id: 'new_entrance', name: '新入口', gridX: 0, gridY: 0, regionIds: [] };
  }

  // Resolve subName to the correct array on item
  let targetArray;
  switch(subName) {
    case 'buildCost': targetArray = item.buildCost; if (!targetArray) { item.buildCost = []; targetArray = item.buildCost; } break;
    case 'lightCost': targetArray = item.lightCost; if (!targetArray) { item.lightCost = []; targetArray = item.lightCost; } break;
    case 'upgradeCost': targetArray = item.upgradeCost; if (!targetArray) { item.upgradeCost = []; targetArray = item.upgradeCost; } break;
    case 'prodInput': if (item.production) { targetArray = item.production.input; if (!targetArray) { item.production.input = []; targetArray = item.production.input; } } break;
    case 'prodOutput': if (item.production) { targetArray = item.production.output; if (!targetArray) { item.production.output = []; targetArray = item.production.output; } } break;
    case 'expEffects': targetArray = item.expeditionEffects; if (!targetArray) { item.expeditionEffects = []; targetArray = item.expeditionEffects; } break;
    case 'effects': targetArray = item.effects; if (!targetArray) { item.effects = []; targetArray = item.effects; } break;
    case 'initBuildings': targetArray = state.data.base_map.initialBuildings; break;
    case 'entrances': targetArray = state.data.base_map.expeditionEntrances; if (!targetArray) { state.data.base_map.expeditionEntrances = []; targetArray = state.data.base_map.expeditionEntrances; } break;
    case 'unlockConditions': targetArray = item.unlockConditions; if (!targetArray) { item.unlockConditions = []; targetArray = item.unlockConditions; } break;
    default:
      // Check for recipe cost or option effects
      if (subName.startsWith('recipe_') && subName.endsWith('_cost')) {
        const ri = parseInt(subName.split('_')[1]);
        if (item.synthesisRecipes && item.synthesisRecipes[ri]) {
          targetArray = item.synthesisRecipes[ri].resourceCost;
        }
      } else if (subName.startsWith('opt_') && subName.endsWith('_effects')) {
        const oi = parseInt(subName.split('_')[1]);
        if (item.options && item.options[oi]) {
          targetArray = item.options[oi].effects;
        }
      }
  }

  if (targetArray) {
    targetArray.push({ ...newEntry });
    markDirty();
    renderDetail();
  }
}

function removeSubEntry(subName, idx) {
  const item = getItem();
  if (!item) return;
  let targetArray;
  switch(subName) {
    case 'buildCost': targetArray = item.buildCost; break;
    case 'lightCost': targetArray = item.lightCost; break;
    case 'upgradeCost': targetArray = item.upgradeCost; break;
    case 'prodInput': targetArray = item.production?.input; break;
    case 'prodOutput': targetArray = item.production?.output; break;
    case 'expEffects': targetArray = item.expeditionEffects; break;
    case 'effects': targetArray = item.effects; break;
    case 'initBuildings': targetArray = state.data.base_map.initialBuildings; break;
    case 'entrances': targetArray = state.data.base_map.expeditionEntrances; break;
    case 'unlockConditions': targetArray = item.unlockConditions; break;
    default:
      if (subName.startsWith('recipe_') && subName.endsWith('_cost')) {
        const ri = parseInt(subName.split('_')[1]);
        targetArray = item.synthesisRecipes?.[ri]?.resourceCost;
      } else if (subName.startsWith('opt_') && subName.endsWith('_effects')) {
        const oi = parseInt(subName.split('_')[1]);
        targetArray = item.options?.[oi]?.effects;
      }
  }
  if (targetArray && idx >= 0 && idx < targetArray.length) {
    targetArray.splice(idx, 1);
    markDirty();
    renderDetail();
  }
}

function applySubChange(el) {
  const row = el.closest('.sub-row');
  if (!row) return;
  const subIdx = parseInt(row.dataset.subidx);
  const key = el.dataset.key;
  const subName = row.closest('.sub-list').id.replace('sl_', '');

  let value = el.value;
  if (el.type === 'number') value = value === '' ? 0 : parseFloat(value);

  const item = getItem();
  if (!item) return;

  let targetArray;
  switch(subName) {
    case 'buildCost': targetArray = item.buildCost; break;
    case 'lightCost': targetArray = item.lightCost; break;
    case 'upgradeCost': targetArray = item.upgradeCost; break;
    case 'prodInput': targetArray = item.production?.input; break;
    case 'prodOutput': targetArray = item.production?.output; break;
    case 'expEffects': targetArray = item.expeditionEffects; break;
    case 'effects': targetArray = item.effects; break;
    case 'initBuildings': targetArray = state.data.base_map.initialBuildings; break;
    case 'entrances': targetArray = state.data.base_map.expeditionEntrances; break;
    case 'unlockConditions': targetArray = item.unlockConditions; break;
    default:
      if (subName.startsWith('recipe_') && subName.endsWith('_cost')) {
        const ri = parseInt(subName.split('_')[1]);
        targetArray = item.synthesisRecipes?.[ri]?.resourceCost;
      } else if (subName.startsWith('opt_') && subName.endsWith('_effects')) {
        const oi = parseInt(subName.split('_')[1]);
        targetArray = item.options?.[oi]?.effects;
      }
  }

  if (targetArray && subIdx >= 0 && subIdx < targetArray.length) {
    if ((key === 'regions' || key === 'regionIds') && typeof value === 'string') {
      targetArray[subIdx][key] = value.split(',').map(s => s.trim()).filter(Boolean);
    } else if (key === 'buildable') {
      if (value === 'true') targetArray[subIdx][key] = true;
      else if (value === 'false') targetArray[subIdx][key] = false;
      else targetArray[subIdx][key] = value;
    } else {
      targetArray[subIdx][key] = value;
    }
    markDirty();
  }
}

function applyYieldChange(el) {
  const period = el.dataset.yield;
  const res = el.dataset.res;
  let value = el.value === '' ? undefined : parseInt(el.value);
  const item = getItem();
  if (!item) return;
  if (!item.baseYields) item.baseYields = {};
  if (!item.baseYields[period]) item.baseYields[period] = {};
  if (value === undefined) {
    delete item.baseYields[period][res];
  } else {
    item.baseYields[period][res] = value;
  }
  markDirty();
}

function applyGroundTypeChange(el) {
  const gtKey = el.dataset.gt;
  const key = el.dataset.key;
  let value = el.value;
  if (key === 'buildable') {
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
  }
  state.data.base_map.groundTypes[gtKey][key] = value;
  markDirty();
  // Refresh canvas map
  if (key === 'colorHint' || key === 'name') drawMapCanvas();
}

function applyOptionChange(el) {
  const oi = parseInt(el.dataset.opt);
  const key = el.dataset.key;
  const item = getItem();
  if (!item || !item.options || !item.options[oi]) return;
  item.options[oi][key] = el.value;
  markDirty();
}
