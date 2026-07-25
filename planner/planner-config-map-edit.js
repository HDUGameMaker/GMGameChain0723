/**
 * planner-config-map-edit.js — 地图编辑器交互、工具、撤销
 *
 * 包含: initMapCanvasEvents, setTile, floodFill, previewFloodFill,
 *       applyRectangle, handleEraserClick,
 *       clearMapSelection, getSelectionBounds, isInsideSelection,
 *       takeSelectionSnapshot, handleSelectDown, handleSelectMove,
 *       handleSelectUp, applySelectionMove,
 *       pushUndo, performUndo, performRedo,
 *       findBuildingAt, validateBuildingPlacement,
 *       handleBuildingClick, moveBuildingTo, removeBuilding,
 *       handleEntranceDown, handleEntranceDrag,
 *       syncEntranceToForm, syncBuildingsToForm,
 *       setMapEditorMode, switchMapMode,
 *       adjustGridForResize, generateRandomMap
 *
 * 依赖: planner-config-core.js, planner-config-map-draw.js
 * 被 planner-config-main.js (快捷键), planner-config-forms.js (bindFormEvents) 调用
 */

/* -- Canvas mouse event handlers -- */
let _mapMouseDown = false;
let _mapLastPaintedTile = null;

function initMapCanvasEvents() {
  const canvas = document.getElementById('mapCanvas');
  if (!canvas || canvas._eventsInit) return;
  canvas._eventsInit = true;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      // Middle mouse: start panning
      state.canvasPanning = true;
      state.canvasPanStartX = e.clientX - state.canvasOffsetX;
      state.canvasPanStartY = e.clientY - state.canvasOffsetY;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    _mapMouseDown = true;
    const { col, row } = canvasToTile(e, canvas);
    _mapLastPaintedTile = { col, row };

    switch (state.mapEditorMode) {
      case 'brush':
        pushUndo();
        setTile(col, row, state.mapEditorBrush);
        drawMapCanvas();
        break;
      case 'rectangle':
        state.mapRectStartCol = col;
        state.mapRectStartRow = row;
        pushUndo();
        break;
      case 'fill':
        {
          pushUndo();
          const mapData = state.data.base_map;
          const tChar = (mapData.grid[row] || '')[col];
          const chg = floodFill(col, row, tChar, state.mapEditorBrush);
          if (chg > 0) markDirty();
          drawMapCanvas();
        }
        break;
      case 'eraser':
        handleEraserClick(col, row);
        break;
      case 'building':
        handleBuildingClick(col, row);
        break;
      case 'entrance':
        handleEntranceDown(col, row, e);
        break;
      case 'select':
        handleSelectDown(col, row);
        break;
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const { col, row } = canvasToTile(e, canvas);

    // Track hover position
    if (state.mapHoverCol !== col || state.mapHoverRow !== row) {
      state.mapHoverCol = col;
      state.mapHoverRow = row;
      // Redraw on hover change for preview updates
      if (!_mapMouseDown && !state.canvasPanning) {
        drawMapCanvas();
      }
    }

    // Panning
    if (state.canvasPanning) {
      state.canvasOffsetX = e.clientX - state.canvasPanStartX;
      state.canvasOffsetY = e.clientY - state.canvasPanStartY;
      drawMapCanvas();
      return;
    }

    // Brush drag-paint
    if (_mapMouseDown && state.mapEditorMode === 'brush') {
      if (!_mapLastPaintedTile || _mapLastPaintedTile.col !== col || _mapLastPaintedTile.row !== row) {
        setTile(col, row, state.mapEditorBrush);
        _mapLastPaintedTile = { col, row };
        drawMapCanvas();
      }
    }

    // Rectangle drag-paint (preview only, applied on mouseup)
    if (_mapMouseDown && state.mapEditorMode === 'rectangle') {
      drawMapCanvas();
    }

    // Eraser drag-paint
    if (_mapMouseDown && state.mapEditorMode === 'eraser') {
      if (!_mapLastPaintedTile || _mapLastPaintedTile.col !== col || _mapLastPaintedTile.row !== row) {
        setTile(col, row, 'G');
        _mapLastPaintedTile = { col, row };
        drawMapCanvas();
      }
    }

    // Entrance drag
    if (_mapMouseDown && state.mapEditorMode === 'entrance' && state.mapEditorDragTarget) {
      handleEntranceDrag(col, row);
      drawMapCanvas();
    }

    // Building drag
    if (_mapMouseDown && state.mapEditorMode === 'building' && state.mapEditorSelectedBuilding >= 0 && state.mapEditorDragTarget === 'move') {
      moveBuildingTo(col, row);
      drawMapCanvas();
    }

    // Select mode drag (define selection or move)
    if (_mapMouseDown && state.mapEditorMode === 'select') {
      handleSelectMove(col, row);
    }

    // Update status bar
    updateMapStatus(col, row);
  });

  canvas.addEventListener('mouseup', (e) => {
    _mapMouseDown = false;
    _mapLastPaintedTile = null;

    if (state.mapEditorMode === 'brush' && state.mapEditorDragging) {
      state.mapEditorDragging = false;
      markDirty();
    }
    if (state.mapEditorMode === 'rectangle' && state.mapRectStartCol >= 0) {
      const c1 = state.mapRectStartCol, r1 = state.mapRectStartRow;
      const { col: c2, row: r2 } = canvasToTile(e, canvas);
      const chg = applyRectangle(c1, r1, c2, r2, state.mapEditorBrush);
      if (chg > 0) markDirty();
      state.mapRectStartCol = -1;
      state.mapRectStartRow = -1;
      drawMapCanvas();
    }
    if (state.mapEditorMode === 'entrance' && state.mapEditorDragTarget) {
      state.mapEditorDragTarget = null;
      markDirty();
      syncEntranceToForm();
    }
    if (state.mapEditorMode === 'building' && state.mapEditorDragTarget === 'move') {
      state.mapEditorDragTarget = null;
      markDirty();
      syncBuildingsToForm();
    }
    if (state.mapEditorMode === 'select') {
      const { col, row } = canvasToTile(e, canvas);
      handleSelectUp(col, row);
    }
  });

  canvas.addEventListener('mouseleave', () => {
    _mapMouseDown = false;
    _mapLastPaintedTile = null;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.25, Math.min(4.0, state.canvasScale * zoomFactor));

    // Zoom toward cursor
    const scaleChange = newScale / state.canvasScale;
    state.canvasOffsetX = mx - scaleChange * (mx - state.canvasOffsetX);
    state.canvasOffsetY = my - scaleChange * (my - state.canvasOffsetY);
    state.canvasScale = newScale;

    drawMapCanvas();
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state.mapEditorMode === 'building') {
      const { col, row } = canvasToTile(e, canvas);
      const idx = findBuildingAt(col, row);
      if (idx >= 0) {
        removeBuilding(idx);
      }
    }
  });

  // Global mouseup to stop panning
  window.addEventListener('mouseup', () => {
    if (state.canvasPanning) {
      state.canvasPanning = false;
      const canvas = document.getElementById('mapCanvas');
      if (canvas) canvas.style.cursor = 'crosshair';
    }
    if ((state.mapEditorMode === 'brush' || state.mapEditorMode === 'eraser') && state.mapEditorDragging) {
      state.mapEditorDragging = false;
      markDirty();
    }
  });
}

/* -- Tile painting -- */
function setTile(col, row, char) {
  const m = state.data.base_map;
  if (col < 0 || col >= m.gridWidth || row < 0 || row >= m.gridHeight) return;
  const line = m.grid[row];
  if (!line || line.length <= col) return;
  if (line[col] !== char) {
    m.grid[row] = line.substring(0, col) + char + line.substring(col + 1);
    state.mapEditorDragging = true;
    if (!_mapMouseDown) markDirty(); // single click
  }
}

/* -- Flood fill (4-directional BFS) -- */
function floodFill(col, row, targetChar, replaceChar) {
  const m = state.data.base_map;
  if (col < 0 || col >= m.gridWidth || row < 0 || row >= m.gridHeight) return 0;
  if (targetChar === replaceChar) return 0;
  const visited = new Set();
  const queue = [[col, row]];
  visited.add(col + ',' + row);
  let changed = 0;
  while (queue.length > 0) {
    const [c, r] = queue.shift();
    if ((m.grid[r] || '')[c] !== targetChar) continue;
    m.grid[r] = m.grid[r].substring(0, c) + replaceChar + m.grid[r].substring(c + 1);
    changed++;
    for (const [nc, nr] of [[c-1,r],[c+1,r],[c,r-1],[c,r+1]]) {
      const key = nc + ',' + nr;
      if (nc >= 0 && nc < m.gridWidth && nr >= 0 && nr < m.gridHeight && !visited.has(key)) {
        visited.add(key);
        queue.push([nc, nr]);
      }
    }
  }
  return changed;
}

function previewFloodFill(col, row, targetChar) {
  const m = state.data.base_map;
  const result = new Set();
  const visited = new Set();
  const queue = [[col, row]];
  visited.add(col + ',' + row);
  while (queue.length > 0) {
    const [c, r] = queue.shift();
    if ((m.grid[r] || '')[c] !== targetChar) continue;
    result.add(c + ',' + r);
    for (const [nc, nr] of [[c-1,r],[c+1,r],[c,r-1],[c,r+1]]) {
      const key = nc + ',' + nr;
      if (nc >= 0 && nc < m.gridWidth && nr >= 0 && nr < m.gridHeight && !visited.has(key)) {
        visited.add(key);
        queue.push([nc, nr]);
      }
    }
  }
  return result;
}

function applyRectangle(c1, r1, c2, r2, char) {
  const m = state.data.base_map;
  const minC = Math.max(0, Math.min(c1, c2));
  const maxC = Math.min(m.gridWidth - 1, Math.max(c1, c2));
  const minR = Math.max(0, Math.min(r1, r2));
  const maxR = Math.min(m.gridHeight - 1, Math.max(r1, r2));
  let changed = 0;
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if ((m.grid[r] || '')[c] !== char) {
        m.grid[r] = m.grid[r].substring(0, c) + char + m.grid[r].substring(c + 1);
        changed++;
      }
    }
  }
  return changed;
}

/* -- Eraser -- */
function handleEraserClick(col, row) {
  const m = state.data.base_map;
  // Check if on a building first
  const existingIdx = findBuildingAt(col, row);
  if (existingIdx >= 0) {
    // removeBuilding already calls pushUndo()
    removeBuilding(existingIdx);
    return;
  }
  // Otherwise erase terrain to grass
  pushUndo();
  setTile(col, row, 'G');
  drawMapCanvas();
}

/* -- Area selection & move -- */
function clearMapSelection() {
  state.mapSelectStartCol = -1;
  state.mapSelectStartRow = -1;
  state.mapSelectEndCol = -1;
  state.mapSelectEndRow = -1;
  state.mapSelectActive = false;
  state.mapSelectMoving = false;
  state.mapSelectSnapshot = null;
}

function getSelectionBounds() {
  // Returns normalized { minCol, minRow, maxCol, maxRow } or null
  if (!state.mapSelectActive) return null;
  const c1 = state.mapSelectStartCol, r1 = state.mapSelectStartRow;
  const c2 = state.mapSelectEndCol, r2 = state.mapSelectEndRow;
  if (c1 < 0 || c2 < 0) return null;
  return {
    minCol: Math.min(c1, c2), maxCol: Math.max(c1, c2),
    minRow: Math.min(r1, r2), maxRow: Math.max(r1, r2)
  };
}

function isInsideSelection(col, row) {
  const b = getSelectionBounds();
  if (!b) return false;
  return col >= b.minCol && col <= b.maxCol && row >= b.minRow && row <= b.maxRow;
}

function takeSelectionSnapshot() {
  const b = getSelectionBounds();
  if (!b) return null;
  const m = state.data.base_map;
  const w = b.maxCol - b.minCol + 1;
  const h = b.maxRow - b.minRow + 1;
  // Copy terrain rows as arrays of chars
  const grid = [];
  for (let r = b.minRow; r <= b.maxRow; r++) {
    const line = m.grid[r] || '';
    grid.push(line.substring(b.minCol, b.maxCol + 1));
  }
  // Copy buildings that fall entirely within the selection
  const buildings = [];
  (m.initialBuildings || []).forEach((bld, idx) => {
    const cfg = (state.data.buildings || []).find(bc => bc.id === bld.buildingId);
    const fw = (cfg && cfg.footprint) ? cfg.footprint.width : 1;
    const fh = (cfg && cfg.footprint) ? cfg.footprint.height : 1;
    const inSel = bld.gridX >= b.minCol && (bld.gridX + fw - 1) <= b.maxCol
               && bld.gridY >= b.minRow && (bld.gridY + fh - 1) <= b.maxRow;
    if (inSel) {
      buildings.push({
        idx: idx,
        buildingId: bld.buildingId,
        gridX: bld.gridX,
        gridY: bld.gridY
      });
    }
  });
  return { grid, buildings, bounds: b, width: w, height: h };
}

function handleSelectDown(col, row) {
  const m = state.data.base_map;
  if (col < 0 || col >= m.gridWidth || row < 0 || row >= m.gridHeight) return;

  if (state.mapSelectActive && isInsideSelection(col, row)) {
    // Start moving the selection (pushUndo deferred to applySelectionMove)
    state.mapSelectMoving = true;
    const b = getSelectionBounds();
    state.mapSelectMoveStartCol = b.minCol;
    state.mapSelectMoveStartRow = b.minRow;
    state.mapSelectSnapshot = takeSelectionSnapshot();
  } else if (state.mapSelectActive) {
    // Clicked outside — clear selection
    clearMapSelection();
    drawMapCanvas();
  } else {
    // Start drag-select
    state.mapSelectStartCol = col;
    state.mapSelectStartRow = row;
    state.mapSelectEndCol = -1;
    state.mapSelectEndRow = -1;
  }
}

function handleSelectMove(col, row) {
  if (state.mapSelectMoving && state.mapSelectSnapshot) {
    // Just redraw for preview — actual move applied on mouseup
    drawMapCanvas();
  } else if (state.mapSelectStartCol >= 0 && !state.mapSelectActive) {
    // Dragging to define selection — update end point
    if (state.mapSelectEndCol !== col || state.mapSelectEndRow !== row) {
      state.mapSelectEndCol = col;
      state.mapSelectEndRow = row;
      drawMapCanvas();
    }
  }
}

function handleSelectUp(col, row) {
  if (state.mapSelectMoving && state.mapSelectSnapshot) {
    // Apply the move
    applySelectionMove(col, row);
    state.mapSelectMoving = false;
    state.mapSelectSnapshot = null;
    state.mapSelectMoveStartCol = -1;
    state.mapSelectMoveStartRow = -1;
    markDirty();
    syncBuildingsToForm();
    drawMapCanvas();
  } else if (state.mapSelectStartCol >= 0 && !state.mapSelectActive) {
    // Finalize selection
    const m = state.data.base_map;
    const c = Math.max(0, Math.min(m.gridWidth - 1, col));
    const r = Math.max(0, Math.min(m.gridHeight - 1, row));
    state.mapSelectEndCol = c;
    state.mapSelectEndRow = r;
    state.mapSelectActive = true;
    // Update cursor for active selection
    const canvas = document.getElementById('mapCanvas');
    if (canvas) canvas.style.cursor = 'move';
    drawMapCanvas();
  }
}

function applySelectionMove(targetCol, targetRow) {
  const snap = state.mapSelectSnapshot;
  if (!snap) return;
  const m = state.data.base_map;
  const b = snap.bounds;
  const origMinCol = state.mapSelectMoveStartCol;
  const origMinRow = state.mapSelectMoveStartRow;
  const dCol = targetCol - origMinCol;
  const dRow = targetRow - origMinRow;

  if (dCol === 0 && dRow === 0) return; // no move

  pushUndo();

  const newMinCol = origMinCol + dCol;
  const newMinRow = origMinRow + dRow;

  // Clamp to map bounds
  const clampedMinCol = Math.max(0, Math.min(m.gridWidth - snap.width, newMinCol));
  const clampedMinRow = Math.max(0, Math.min(m.gridHeight - snap.height, newMinRow));
  const clampedDCol = clampedMinCol - origMinCol;
  const clampedDRow = clampedMinRow - origMinRow;

  // Phase 1: Clear original area to 'G' (only where we're actually moving FROM)
  for (let r = b.minRow; r <= b.maxRow; r++) {
    const line = m.grid[r];
    if (!line) continue;
    let newLine = line;
    for (let c = b.minCol; c <= b.maxCol; c++) {
      newLine = newLine.substring(0, c) + 'G' + newLine.substring(c + 1);
    }
    m.grid[r] = newLine;
  }

  // Phase 2: Write snapshot terrain to new location
  for (let i = 0; i < snap.grid.length; i++) {
    const srcRow = b.minRow + i;
    const dstRow = srcRow + clampedDRow;
    if (dstRow < 0 || dstRow >= m.gridHeight) continue;
    let line = m.grid[dstRow];
    if (!line) continue;
    const srcLine = snap.grid[i];
    for (let j = 0; j < srcLine.length; j++) {
      const dstCol = b.minCol + j + clampedDCol;
      if (dstCol < 0 || dstCol >= m.gridWidth) continue;
      line = line.substring(0, dstCol) + srcLine[j] + line.substring(dstCol + 1);
    }
    m.grid[dstRow] = line;
  }

  // Phase 3: Move buildings
  if (snap.buildings.length > 0) {
    // Remove old building entries (in reverse index order)
    const sortedByIndex = [...snap.buildings].sort((a, b) => b.idx - a.idx);
    sortedByIndex.forEach(sb => {
      m.initialBuildings.splice(sb.idx, 1);
    });
    // Re-add at new positions
    snap.buildings.forEach(sb => {
      const newBld = {
        buildingId: sb.buildingId,
        gridX: sb.gridX + clampedDCol,
        gridY: sb.gridY + clampedDRow
      };
      m.initialBuildings.push(newBld);
    });
  }

  // Update selection bounds to new location
  state.mapSelectStartCol = b.minCol + clampedDCol;
  state.mapSelectStartRow = b.minRow + clampedDRow;
  state.mapSelectEndCol = b.maxCol + clampedDCol;
  state.mapSelectEndRow = b.maxRow + clampedDRow;
}

/* -- Building placement -- */
/* -- Undo/Redo -- */
function pushUndo() {
  const m = state.data.base_map;
  const snapshot = {
    grid: (m.grid || []).slice(),
    initialBuildings: JSON.parse(JSON.stringify(m.initialBuildings || [])),
    expeditionEntrances: m.expeditionEntrances ? JSON.parse(JSON.stringify(m.expeditionEntrances)) : []
  };
  state.undoStack.push(snapshot);
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
}

function performUndo() {
  if (state.undoStack.length === 0) return;
  const m = state.data.base_map;
  const current = {
    grid: (m.grid || []).slice(),
    initialBuildings: JSON.parse(JSON.stringify(m.initialBuildings || [])),
    expeditionEntrances: m.expeditionEntrances ? JSON.parse(JSON.stringify(m.expeditionEntrances)) : []
  };
  state.redoStack.push(current);
  if (state.redoStack.length > 50) state.redoStack.shift();
  const snap = state.undoStack.pop();
  m.grid = snap.grid;
  m.initialBuildings = snap.initialBuildings;
  m.expeditionEntrances = snap.expeditionEntrances;
  state.mapEditorSelectedBuilding = -1;
  state.mapEditorSelectedEntrance = -1;
  state.mapEditorDragTarget = null;
  markDirty();
  syncBuildingsToForm();
  syncEntranceToForm();
  drawMapCanvas();
  showToast('已撤销', 'success');
}

function performRedo() {
  if (state.redoStack.length === 0) return;
  const m = state.data.base_map;
  const current = {
    grid: (m.grid || []).slice(),
    initialBuildings: JSON.parse(JSON.stringify(m.initialBuildings || [])),
    expeditionEntrances: m.expeditionEntrances ? JSON.parse(JSON.stringify(m.expeditionEntrances)) : []
  };
  state.undoStack.push(current);
  if (state.undoStack.length > 50) state.undoStack.shift();
  const snap = state.redoStack.pop();
  m.grid = snap.grid;
  m.initialBuildings = snap.initialBuildings;
  m.expeditionEntrances = snap.expeditionEntrances;
  state.mapEditorSelectedBuilding = -1;
  state.mapEditorSelectedEntrance = -1;
  state.mapEditorDragTarget = null;
  markDirty();
  syncBuildingsToForm();
  syncEntranceToForm();
  drawMapCanvas();
  showToast('已重做', 'success');
}

function findBuildingAt(col, row) {
  const m = state.data.base_map;
  const buildings = m.initialBuildings || [];
  for (let i = buildings.length - 1; i >= 0; i--) {
    const b = buildings[i];
    const bCfg = (state.data.buildings || []).find(bld => bld.id === b.buildingId);
    const fp = bCfg?.footprint || { width: 1, height: 1 };
    if (col >= b.gridX && col < b.gridX + fp.width && row >= b.gridY && row < b.gridY + fp.height) {
      return i;
    }
  }
  return -1;
}

function validateBuildingPlacement(col, row, buildingId) {
  const m = state.data.base_map;
  const bCfg = (state.data.buildings || []).find(bld => bld.id === buildingId);
  if (!bCfg) return { valid: false, reason: '未知建筑类型' };

  const fp = bCfg.footprint || { width: 1, height: 1 };

  // Check bounds
  if (col < 0 || row < 0 || col + fp.width > m.gridWidth || row + fp.height > m.gridHeight) {
    return { valid: false, reason: '超出地图边界' };
  }

  // Check ground types
  for (let r = row; r < row + fp.height; r++) {
    const line = m.grid[r];
    if (!line) return { valid: false, reason: '超出地图边界' };
    for (let c = col; c < col + fp.width; c++) {
      const ch = line[c];
      const gt = m.groundTypes?.[ch];
      if (!gt) return { valid: false, reason: `未知地形 '${ch}'` };
      if (gt.buildable === false) {
        return { valid: false, reason: `地形 ${gt.name} 不可建造` };
      }
      if (bCfg.allowedGrounds && bCfg.allowedGrounds.length > 0 && !bCfg.allowedGrounds.includes(ch)) {
        return { valid: false, reason: `建筑不允许在地形 ${gt.name}(${ch}) 上` };
      }
    }
  }

  // Check overlap with other buildings
  const buildings = m.initialBuildings || [];
  for (let i = 0; i < buildings.length; i++) {
    const ob = buildings[i];
    const obCfg = (state.data.buildings || []).find(bld => bld.id === ob.buildingId);
    const ofp = obCfg?.footprint || { width: 1, height: 1 };
    if (!(col + fp.width <= ob.gridX || ob.gridX + ofp.width <= col ||
          row + fp.height <= ob.gridY || ob.gridY + ofp.height <= row)) {
      return { valid: false, reason: `与已有建筑 ${obCfg?.name || ob.buildingId} 重叠` };
    }
  }

  // Check maxCount
  if (bCfg.maxCount != null) {
    const count = buildings.filter(b => b.buildingId === buildingId).length;
    if (count >= bCfg.maxCount) {
      return { valid: false, reason: `建筑数量已达上限 (${bCfg.maxCount})` };
    }
  }

  return { valid: true, reason: '' };
}

function handleBuildingClick(col, row) {
  const m = state.data.base_map;
  const existingIdx = findBuildingAt(col, row);

  if (existingIdx >= 0) {
    // Select existing building for drag
    pushUndo();
    state.mapEditorSelectedBuilding = existingIdx;
    state.mapEditorDragTarget = 'move';
    drawMapCanvas();
  } else if (state.mapEditorBuilding) {
    // Place new building
    const result = validateBuildingPlacement(col, row, state.mapEditorBuilding);
    if (result.valid) {
      pushUndo();
      m.initialBuildings = m.initialBuildings || [];
      m.initialBuildings.push({ buildingId: state.mapEditorBuilding, gridX: col, gridY: row });
      state.mapEditorSelectedBuilding = m.initialBuildings.length - 1;
      markDirty();
      syncBuildingsToForm();
      drawMapCanvas();
      const bCfg = (state.data.buildings || []).find(bld => bld.id === state.mapEditorBuilding);
      showToast(`已放置 ${bCfg?.name || state.mapEditorBuilding}`, 'success');
    } else {
      showToast(result.reason, 'error');
    }
  }
}

function moveBuildingTo(col, row) {
  const m = state.data.base_map;
  const idx = state.mapEditorSelectedBuilding;
  if (idx < 0 || idx >= (m.initialBuildings || []).length) return;

  const b = m.initialBuildings[idx];
  b.gridX = col;
  b.gridY = row;
}

function removeBuilding(idx) {
  const m = state.data.base_map;
  if (idx < 0 || idx >= (m.initialBuildings || []).length) return;
  pushUndo();
  m.initialBuildings.splice(idx, 1);
  if (state.mapEditorSelectedBuilding === idx) state.mapEditorSelectedBuilding = -1;
  if (state.mapEditorSelectedBuilding > idx) state.mapEditorSelectedBuilding--;
  markDirty();
  syncBuildingsToForm();
  drawMapCanvas();
  showToast('已删除建筑', 'success');
}

/* -- Entrance editing -- */
// state.mapEditorSelectedEntrance 存储在 state 对象中（planner-config-core.js），跨文件共享

function handleEntranceDown(col, row, e) {
  const m = state.data.base_map;
  if (!m.expeditionEntrances) m.expeditionEntrances = [];

  // 检查是否右键（删除）
  if (e && e.button === 2) {
    const foundIdx = findEntranceAt(col, row);
    if (foundIdx >= 0) {
      e.preventDefault();
      pushUndo();
      m.expeditionEntrances.splice(foundIdx, 1);
      state.mapEditorSelectedEntrance = -1;
      markDirty();
      renderDetail();
      drawMapCanvas();
    }
    return;
  }

  // 检查是否点击已有入口 → 开始移动
  const clickedIdx = findEntranceAt(col, row);
  if (clickedIdx >= 0) {
    pushUndo();
    state.mapEditorSelectedEntrance = clickedIdx;
    state.mapEditorDragTarget = 'move';
    return;
  }

  // 点击空位 → 新建入口
  pushUndo();
  const newId = 'entrance_' + Date.now();
  m.expeditionEntrances.push({
    id: newId,
    name: '新入口',
    gridX: col,
    gridY: row,
    regionIds: []
  });
  state.mapEditorSelectedEntrance = m.expeditionEntrances.length - 1;
  markDirty();
  renderDetail();
  drawMapCanvas();
}

function handleEntranceDrag(col, row) {
  const m = state.data.base_map;
  if (!m.expeditionEntrances) return;
  if (state.mapEditorDragTarget !== 'move' || state.mapEditorSelectedEntrance < 0) return;

  const ent = m.expeditionEntrances[state.mapEditorSelectedEntrance];
  if (!ent) return;
  ent.gridX = Math.max(0, Math.min(col, m.gridWidth - 1));
  ent.gridY = Math.max(0, Math.min(row, m.gridHeight - 1));
}

function findEntranceAt(col, row) {
  const entrances = state.data.base_map.expeditionEntrances;
  if (!entrances) return -1;
  for (let i = 0; i < entrances.length; i++) {
    const e = entrances[i];
    if (e.gridX === col && e.gridY === row) return i;
  }
  return -1;
}

function syncEntranceToForm() {
  renderDetail();
}

function syncBuildingsToForm() {
  // Re-render the sub-list to sync
  const m = state.data.base_map;
  const sl = document.getElementById('sl_initBuildings');
  if (!sl) return;
  // Trigger form re-render by calling renderDetail
  // But that would lose canvas state... Instead, update inline
  const rows = sl.querySelectorAll('.sub-row');
  const buildings = m.initialBuildings || [];
  rows.forEach((row, i) => {
    if (i < buildings.length) {
      const bIdInput = row.querySelector('[data-key="buildingId"]');
      const xInput = row.querySelector('[data-key="gridX"]');
      const yInput = row.querySelector('[data-key="gridY"]');
      if (bIdInput) bIdInput.value = buildings[i].buildingId || '';
      if (xInput) xInput.value = buildings[i].gridX || 0;
      if (yInput) yInput.value = buildings[i].gridY || 0;
    }
  });
}

function setMapEditorMode(mode) {
  // Clear selection state when leaving select mode
  if (state.mapEditorMode === 'select' && mode !== 'select') {
    clearMapSelection();
  }
  state.mapEditorMode = mode;
  state.mapEditorSelectedBuilding = -1;
  state.mapEditorSelectedEntrance = -1;
  state.mapEditorDragTarget = null;

  // Update button active states
  document.querySelectorAll('.map-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });

  // Show/hide building selector
  const bldSel = document.getElementById('mapBuildingSelector');
  if (bldSel) bldSel.style.display = mode === 'building' ? 'block' : 'none';

  // Show/hide building hint
  const bldHint = document.getElementById('mapBuildingHint');
  if (bldHint) bldHint.style.display = mode === 'building' ? 'block' : 'none';

  // Update canvas cursor
  const canvas = document.getElementById('mapCanvas');
  if (canvas) {
    canvas.style.cursor = mode === 'select' && state.mapSelectActive ? 'move' : 'crosshair';
  }

  drawMapCanvas();
}

function switchMapMode() {
  if (state.tab !== 'map') return;
  if (state.mapEditorMode === 'building') setMapEditorMode('entrance');
  else if (state.mapEditorMode === 'entrance') setMapEditorMode('brush');
  else setMapEditorMode('building');
}

/* -- Grid resize helper -- */
function adjustGridForResize() {
  const m = state.data.base_map;
  const grid = m.grid || [];
  const defaultChar = 'G';

  // Adjust rows
  while (grid.length < m.gridHeight) {
    grid.push(defaultChar.repeat(m.gridWidth));
  }
  while (grid.length > m.gridHeight) {
    grid.pop();
  }
  // Adjust columns in each row
  for (let i = 0; i < grid.length; i++) {
    while (grid[i].length < m.gridWidth) {
      grid[i] += defaultChar;
    }
    if (grid[i].length > m.gridWidth) {
      grid[i] = grid[i].substring(0, m.gridWidth);
    }
  }
  m.grid = grid;
}

/* -- Random map generation -- */
function generateRandomMap(width, height) {
  const grid = [];
  const setG = (c, r, ch) => { grid[r] = grid[r].substring(0, c) + ch + grid[r].substring(c + 1); };
  const getG = (c, r) => (grid[r] || '')[c] || 'G';

  // 1. Initialize all to grass
  for (let r = 0; r < height; r++) grid.push('G'.repeat(width));

  // 2. Mountain clusters via random walk
  const numMountains = Math.floor(width * height / 400);
  for (let mi = 0; mi < numMountains; mi++) {
    let x = Math.floor(Math.random() * width * 0.6 + width * 0.2);
    let y = Math.floor(Math.random() * height * 0.6 + height * 0.2);
    const steps = 15 + Math.floor(Math.random() * 35);
    for (let s = 0; s < steps; s++) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        setG(x, y, 'M');
        for (const [dx, dy] of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && Math.random() < 0.25) {
            if (getG(nx, ny) === 'G') setG(nx, ny, 'R');
          }
        }
      }
      x += Math.floor(Math.random() * 3) - 1;
      y += Math.floor(Math.random() * 3) - 1;
    }
  }

  // 3. Rivers flowing from mountains
  const numRivers = 3 + Math.floor(Math.random() * 4);
  for (let ri = 0; ri < numRivers; ri++) {
    const mTiles = [];
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++)
        if (grid[r][c] === 'M') mTiles.push([c, r]);
    if (mTiles.length === 0) break;
    let [x, y] = mTiles[Math.floor(Math.random() * mTiles.length)];
    const maxSteps = Math.floor(width * height / 40);
    for (let s = 0; s < maxSteps; s++) {
      if (x < 0 || x >= width || y < 0 || y >= height) break;
      if (getG(x, y) !== 'W' && getG(x, y) !== 'M') setG(x, y, 'W');
      if (Math.random() < 0.3) {
        for (const [dx, dy] of [[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && getG(nx, ny) !== 'W' && getG(nx, ny) !== 'M')
            setG(nx, ny, 'W');
        }
      }
      const edgeDist = Math.min(x, width - 1 - x, y, height - 1 - y);
      if (edgeDist <= 3) {
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && getG(nx, ny) !== 'W' && getG(nx, ny) !== 'M')
              setG(nx, ny, 'D');
          }
        break;
      }
      x += Math.floor(Math.random() * 3) - 1;
      y += Math.floor(Math.random() * 3) - 1;
    }
  }

  // 4. Forest patches near water and at edges
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (getG(c, r) !== 'G') continue;
      let nearWater = false;
      const nearEdge = Math.min(c, width - 1 - c, r, height - 1 - r) <= 8;
      for (const [dx, dy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nc = c + dx, nr = r + dy;
        if (nc >= 0 && nc < width && nr >= 0 && nr < height && getG(nc, nr) === 'W') {
          nearWater = true; break;
        }
      }
      if ((nearWater || nearEdge) && Math.random() < 0.35) {
        setG(c, r, 'F');
      }
    }
  }

  // 5. Dirt transitions along forest edges
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (getG(c, r) !== 'F') continue;
      for (const [dx, dy] of [[1,0],[0,1],[-1,0],[0,-1]]) {
        const nc = c + dx, nr = r + dy;
        if (nc >= 0 && nc < width && nr >= 0 && nr < height && getG(nc, nr) === 'G' && Math.random() < 0.2) {
          setG(nc, nr, 'D');
        }
      }
    }
  }

  return grid;
}
