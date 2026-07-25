/**
 * planner-config-map-draw.js — 地图 Canvas 绘制管线
 *
 * 包含: getCanvasCtx, getEffectiveCellSize, canvasToTile,
 *       drawMapCanvas, drawTerrainTiles, drawGridLines, drawEntrance,
 *       drawBuildings, drawHoverPreview, drawSelectionOverlay,
 *       updateMapBuildingList, updateMapStatus,
 *       scheduleCanvasRedraw, initMapViewportResize
 *
 * 依赖: planner-config-core.js (state, MAP_CELL_SIZE)
 * 被 planner-config-map-edit.js, planner-config-render.js, planner-config-forms.js 调用
 */

/* ═══════════════════════════════════════════
   Canvas Map Editor — rendering & interaction
   ═══════════════════════════════════════════ */

function getCanvasCtx() {
  const canvas = document.getElementById('mapCanvas');
  if (!canvas) return null;
  return canvas.getContext('2d');
}

function getEffectiveCellSize() {
  return MAP_CELL_SIZE * state.canvasScale;
}

function canvasToTile(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  // Reverse the canvas transform chain: translate(ox,oy) * scale(zoom)
  // mouseCSS = logicalX * zoom + offsetX → logicalX = (mouseCSS - offsetX) / zoom
  const mx = ((e.clientX - rect.left) - state.canvasOffsetX) / state.canvasScale;
  const my = ((e.clientY - rect.top) - state.canvasOffsetY) / state.canvasScale;
  return {
    col: Math.floor(mx / MAP_CELL_SIZE),
    row: Math.floor(my / MAP_CELL_SIZE)
  };
}

function drawMapCanvas() {
  const canvas = document.getElementById('mapCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const m = state.data.base_map;
  const cellSize = getEffectiveCellSize();
  const dpr = window.devicePixelRatio || 1;
  const displayCols = m.viewportCols || m.gridWidth;
  const displayRows = m.viewportRows || m.gridHeight;
  const cssW = displayCols * MAP_CELL_SIZE;
  const cssH = displayRows * MAP_CELL_SIZE;

  // Update canvas size if viewport/grid dimensions changed
  if (Math.round(cssW * dpr) !== canvas.width || Math.round(cssH * dpr) !== canvas.height) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  // Apply viewport transform
  ctx.save();
  ctx.translate(state.canvasOffsetX, state.canvasOffsetY);
  ctx.scale(state.canvasScale, state.canvasScale);

  drawTerrainTiles(ctx, m, cellSize);
  drawGridLines(ctx, m, MAP_CELL_SIZE);
  drawEntrance(ctx, m, MAP_CELL_SIZE);
  drawBuildings(ctx, m, MAP_CELL_SIZE);
  drawHoverPreview(ctx, m, MAP_CELL_SIZE);

  ctx.restore(); // viewport transform
  ctx.restore(); // dpr

  // Sync building list
  updateMapBuildingList();
}

function drawTerrainTiles(ctx, m, cellSize) {
  // Viewport culling: only draw visible tiles
  const baseCell = MAP_CELL_SIZE;
  const displayCols = m.viewportCols || m.gridWidth;
  const displayRows = m.viewportRows || m.gridHeight;
  const vpLeft = -state.canvasOffsetX / state.canvasScale;
  const vpTop = -state.canvasOffsetY / state.canvasScale;
  const vpRight = vpLeft + (displayCols * MAP_CELL_SIZE) / state.canvasScale;
  const vpBottom = vpTop + (displayRows * MAP_CELL_SIZE) / state.canvasScale;

  const startCol = Math.max(0, Math.floor(vpLeft / baseCell));
  const endCol = Math.min(m.gridWidth - 1, Math.ceil(vpRight / baseCell));
  const startRow = Math.max(0, Math.floor(vpTop / baseCell));
  const endRow = Math.min(m.gridHeight - 1, Math.ceil(vpBottom / baseCell));

  for (let row = startRow; row <= endRow; row++) {
    const line = m.grid[row];
    if (!line) continue;
    for (let col = startCol; col <= endCol; col++) {
      const ch = line[col];
      const gt = m.groundTypes?.[ch];
      const color = gt?.colorHint || '#ff00ff';
      ctx.fillStyle = color;
      ctx.fillRect(col * baseCell, row * baseCell, baseCell, baseCell);
    }
  }
}

function drawGridLines(ctx, m, baseCell) {
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1 / state.canvasScale;

  // Only draw visible grid lines
  const displayCols = m.viewportCols || m.gridWidth;
  const displayRows = m.viewportRows || m.gridHeight;
  const vpLeft = -state.canvasOffsetX / state.canvasScale;
  const vpTop = -state.canvasOffsetY / state.canvasScale;
  const vpRight = vpLeft + (displayCols * MAP_CELL_SIZE) / state.canvasScale;
  const vpBottom = vpTop + (displayRows * MAP_CELL_SIZE) / state.canvasScale;

  const startCol = Math.max(0, Math.floor(vpLeft / baseCell));
  const endCol = Math.min(m.gridWidth, Math.ceil(vpRight / baseCell) + 1);
  const startRow = Math.max(0, Math.floor(vpTop / baseCell));
  const endRow = Math.min(m.gridHeight, Math.ceil(vpBottom / baseCell) + 1);

  ctx.beginPath();
  for (let col = startCol; col <= endCol; col++) {
    const x = col * baseCell + 0.5;
    ctx.moveTo(x, startRow * baseCell);
    ctx.lineTo(x, endRow * baseCell);
  }
  for (let row = startRow; row <= endRow; row++) {
    const y = row * baseCell + 0.5;
    ctx.moveTo(startCol * baseCell, y);
    ctx.lineTo(endCol * baseCell, y);
  }
  ctx.stroke();
}

function drawEntrance(ctx, m, baseCell) {
  const ee = m.expeditionEntrance;
  if (!ee || ee.gridX == null) return;
  const x = ee.gridX * baseCell;
  const y = ee.gridY * baseCell;
  const w = (ee.width || 1) * baseCell;
  const h = (ee.height || 1) * baseCell;

  // Fill
  ctx.fillStyle = 'rgba(240,160,64,0.12)';
  ctx.fillRect(x, y, w, h);

  // Dashed border
  ctx.strokeStyle = '#f0a040';
  ctx.lineWidth = 2 / state.canvasScale;
  ctx.setLineDash([6 / state.canvasScale, 3 / state.canvasScale]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // Label
  ctx.fillStyle = '#f0a040';
  ctx.font = `${Math.max(9, 11 / state.canvasScale)}px -apple-system, "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('🚪 探险入口', x + w / 2, y - 4 / state.canvasScale);

  // Corner handles in entrance mode
  if (state.mapEditorMode === 'entrance') {
    const hs = 8 / state.canvasScale;
    ctx.fillStyle = '#f0a040';
    [[x, y], [x + w - hs, y], [x, y + h - hs], [x + w - hs, y + h - hs]].forEach(([hx, hy]) => {
      ctx.fillRect(hx, hy, hs, hs);
    });
  }
}

function drawBuildings(ctx, m, baseCell) {
  const buildings = m.initialBuildings || [];
  buildings.forEach((b, i) => {
    const bCfg = (state.data.buildings || []).find(bld => bld.id === b.buildingId);
    const fp = bCfg?.footprint || { width: 1, height: 1 };
    const x = b.gridX * baseCell;
    const y = b.gridY * baseCell;
    const w = fp.width * baseCell;
    const h = fp.height * baseCell;

    // Fill
    if (bCfg?.isTorch) {
      const color = bCfg.colorHint || '#ffaa33';
      ctx.fillStyle = color + '55'; // alpha
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / state.canvasScale;
      ctx.strokeRect(x, y, w, h);
      // Glow effect
      ctx.fillStyle = color + '22';
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    } else {
      ctx.fillStyle = 'rgba(78,203,113,0.35)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(78,203,113,0.7)';
      ctx.lineWidth = 1.5 / state.canvasScale;
      ctx.strokeRect(x, y, w, h);
    }

    // Selection highlight
    if (i === state.mapEditorSelectedBuilding) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5 / state.canvasScale;
      ctx.setLineDash([4 / state.canvasScale, 2 / state.canvasScale]);
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
      ctx.setLineDash([]);
    }

    // Label
    const name = bCfg ? bCfg.name : b.buildingId;
    const fontSize = Math.max(8, Math.min(12, 11 / state.canvasScale));
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${fontSize}px -apple-system, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = name.length > 4 ? name.substring(0, 4) + '…' : name;
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.textBaseline = 'alphabetic';
  });
}

function drawHoverPreview(ctx, m, baseCell) {
  // Draw selection overlay first (always visible, even when cursor is off-grid)
  if (state.mapEditorMode === 'select') {
    drawSelectionOverlay(ctx, m, baseCell);
  }

  const col = state.mapHoverCol;
  const row = state.mapHoverRow;
  if (col < 0 || row < 0 || col >= m.gridWidth || row >= m.gridHeight) return;

  if (state.mapEditorMode === 'brush') {
    // Highlight tile under cursor
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2 / state.canvasScale;
    ctx.strokeRect(col * baseCell + 0.5, row * baseCell + 0.5, baseCell - 1, baseCell - 1);
    // Also show brush preview color
    const brushGt = m.groundTypes?.[state.mapEditorBrush];
    if (brushGt) {
      ctx.fillStyle = brushGt.colorHint + '44';
      ctx.fillRect(col * baseCell, row * baseCell, baseCell, baseCell);
    }
  } else if (state.mapEditorMode === 'rectangle') {
    // Rectangle drag preview
    if (_mapMouseDown && state.mapRectStartCol >= 0) {
      const c1 = state.mapRectStartCol, r1 = state.mapRectStartRow;
      const minC = Math.max(0, Math.min(c1, col)), maxC = Math.min(m.gridWidth - 1, Math.max(c1, col));
      const minR = Math.max(0, Math.min(r1, row)), maxR = Math.min(m.gridHeight - 1, Math.max(r1, row));
      const brushGt = m.groundTypes?.[state.mapEditorBrush];
      ctx.fillStyle = brushGt ? brushGt.colorHint + '55' : 'rgba(255,255,255,0.3)';
      ctx.fillRect(minC * baseCell, minR * baseCell, (maxC - minC + 1) * baseCell, (maxR - minR + 1) * baseCell);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2 / state.canvasScale;
      ctx.strokeRect(minC * baseCell + 0.5, minR * baseCell + 0.5, (maxC - minC + 1) * baseCell - 1, (maxR - minR + 1) * baseCell - 1);
    } else {
      // Not dragging: show single-tile cursor
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2 / state.canvasScale;
      ctx.strokeRect(col * baseCell + 0.5, row * baseCell + 0.5, baseCell - 1, baseCell - 1);
    }
  } else if (state.mapEditorMode === 'fill' && !_mapMouseDown) {
    // Fill preview: highlight the connected region
    const targetChar = (m.grid[row] || '')[col];
    if (targetChar && targetChar !== state.mapEditorBrush) {
      const previewTiles = previewFloodFill(col, row, targetChar);
      const brushGt = m.groundTypes?.[state.mapEditorBrush];
      ctx.fillStyle = (brushGt ? brushGt.colorHint : '#fff') + '44';
      previewTiles.forEach(key => {
        const [c, r] = key.split(',').map(Number);
        ctx.fillRect(c * baseCell, r * baseCell, baseCell, baseCell);
      });
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2 / state.canvasScale;
    ctx.strokeRect(col * baseCell + 0.5, row * baseCell + 0.5, baseCell - 1, baseCell - 1);
  } else if (state.mapEditorMode === 'eraser') {
    // Eraser preview: X mark + grass color highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2 / state.canvasScale;
    ctx.beginPath();
    ctx.moveTo(col * baseCell + 4, row * baseCell + 4);
    ctx.lineTo((col + 1) * baseCell - 4, (row + 1) * baseCell - 4);
    ctx.moveTo((col + 1) * baseCell - 4, row * baseCell + 4);
    ctx.lineTo(col * baseCell + 4, (row + 1) * baseCell - 4);
    ctx.stroke();
    const grassGt = m.groundTypes?.['G'];
    if (grassGt) {
      ctx.fillStyle = grassGt.colorHint + '44';
      ctx.fillRect(col * baseCell, row * baseCell, baseCell, baseCell);
    }
    // Also highlight if hovering over building
    const bldIdx = findBuildingAt(col, row);
    if (bldIdx >= 0) {
      ctx.strokeStyle = 'rgba(255,107,107,0.8)';
      ctx.lineWidth = 2 / state.canvasScale;
      const b = (m.initialBuildings || [])[bldIdx];
      const bCfg = (state.data.buildings || []).find(bld => bld.id === b.buildingId);
      const fp = bCfg?.footprint || { width: 1, height: 1 };
      ctx.strokeRect(b.gridX * baseCell + 0.5, b.gridY * baseCell + 0.5, fp.width * baseCell - 1, fp.height * baseCell - 1);
    }
  } else if (state.mapEditorMode === 'building' && state.mapEditorBuilding && !_mapMouseDown) {
    // Show footprint preview
    const bCfg = (state.data.buildings || []).find(bld => bld.id === state.mapEditorBuilding);
    if (!bCfg) return;
    const fp = bCfg.footprint || { width: 1, height: 1 };
    const result = validateBuildingPlacement(col, row, state.mapEditorBuilding);

    const x = col * baseCell;
    const y = row * baseCell;
    const w = fp.width * baseCell;
    const h = fp.height * baseCell;

    ctx.fillStyle = result.valid ? 'rgba(78,203,113,0.35)' : 'rgba(255,107,107,0.35)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = result.valid ? 'rgba(78,203,113,0.8)' : 'rgba(255,107,107,0.8)';
    ctx.lineWidth = 2 / state.canvasScale;
    ctx.strokeRect(x, y, w, h);
  }
}

/* -- Selection overlay drawing -- */
function drawSelectionOverlay(ctx, m, baseCell) {
  // Active selection: draw blue dashed border
  if (state.mapSelectActive) {
    const b = getSelectionBounds();
    if (b) {
      const x = b.minCol * baseCell;
      const y = b.minRow * baseCell;
      const w = (b.maxCol - b.minCol + 1) * baseCell;
      const h = (b.maxRow - b.minRow + 1) * baseCell;

      // Fill with subtle blue
      ctx.fillStyle = 'rgba(64,144,224,0.1)';
      ctx.fillRect(x, y, w, h);

      // Dashed border
      ctx.save();
      ctx.strokeStyle = 'rgba(64,144,224,0.8)';
      ctx.lineWidth = 2 / state.canvasScale;
      ctx.setLineDash([6 / state.canvasScale, 4 / state.canvasScale]);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.restore();

      // If moving, draw preview at target
      const hc = state.mapHoverCol, hr = state.mapHoverRow;
      if (state.mapSelectMoving && state.mapSelectSnapshot && hc >= 0 && hr >= 0) {
        const snap = state.mapSelectSnapshot;
        const origMinCol = state.mapSelectMoveStartCol;
        const origMinRow = state.mapSelectMoveStartRow;
        const dCol = hc - origMinCol;
        const dRow = hr - origMinRow;

        // Clamp to map bounds
        const newMinCol = Math.max(0, Math.min(m.gridWidth - snap.width, origMinCol + dCol));
        const newMinRow = Math.max(0, Math.min(m.gridHeight - snap.height, origMinRow + dRow));
        const clampedDCol = newMinCol - origMinCol;
        const clampedDRow = newMinRow - origMinRow;

        // Preview terrain at new location (semi-transparent)
        for (let i = 0; i < snap.grid.length; i++) {
          const dstRow = snap.bounds.minRow + i + clampedDRow;
          if (dstRow < 0 || dstRow >= m.gridHeight) continue;
          const srcLine = snap.grid[i];
          for (let j = 0; j < srcLine.length; j++) {
            const dstCol = snap.bounds.minCol + j + clampedDCol;
            if (dstCol < 0 || dstCol >= m.gridWidth) continue;
            const gt = m.groundTypes?.[srcLine[j]];
            if (gt) {
              ctx.fillStyle = gt.colorHint + '88';
              ctx.fillRect(dstCol * baseCell, dstRow * baseCell, baseCell, baseCell);
            }
          }
        }

        // Preview buildings at new location
        if (snap.buildings.length > 0) {
          snap.buildings.forEach(sb => {
            const bCfg = (state.data.buildings || []).find(bc => bc.id === sb.buildingId);
            const fp = bCfg?.footprint || { width: 1, height: 1 };
            const bx = (sb.gridX + clampedDCol) * baseCell;
            const by = (sb.gridY + clampedDRow) * baseCell;
            ctx.fillStyle = 'rgba(64,144,224,0.4)';
            ctx.fillRect(bx, by, fp.width * baseCell, fp.height * baseCell);
            ctx.strokeStyle = 'rgba(64,144,224,0.8)';
            ctx.lineWidth = 2 / state.canvasScale;
            ctx.strokeRect(bx, by, fp.width * baseCell, fp.height * baseCell);
          });
        }

        // Dashed outline at target
        ctx.save();
        ctx.strokeStyle = 'rgba(64,224,128,0.8)';
        ctx.lineWidth = 2 / state.canvasScale;
        ctx.setLineDash([6 / state.canvasScale, 4 / state.canvasScale]);
        ctx.strokeRect(newMinCol * baseCell + 0.5, newMinRow * baseCell + 0.5,
                       snap.width * baseCell - 1, snap.height * baseCell - 1);
        ctx.restore();
      }
    }
  } else if (state.mapSelectStartCol >= 0 && _mapMouseDown) {
    // Dragging to define selection
    const c1 = state.mapSelectStartCol, r1 = state.mapSelectStartRow;
    const hc = state.mapHoverCol, hr = state.mapHoverRow;
    const c2 = state.mapSelectEndCol >= 0 ? state.mapSelectEndCol : hc;
    const r2 = state.mapSelectEndRow >= 0 ? state.mapSelectEndRow : hr;
    const minC = Math.max(0, Math.min(c1, c2)), maxC = Math.min(m.gridWidth - 1, Math.max(c1, c2));
    const minR = Math.max(0, Math.min(r1, r2)), maxR = Math.min(m.gridHeight - 1, Math.max(r1, r2));

    ctx.fillStyle = 'rgba(64,144,224,0.15)';
    ctx.fillRect(minC * baseCell, minR * baseCell, (maxC - minC + 1) * baseCell, (maxR - minR + 1) * baseCell);

    ctx.save();
    ctx.strokeStyle = 'rgba(64,144,224,0.7)';
    ctx.lineWidth = 2 / state.canvasScale;
    ctx.setLineDash([6 / state.canvasScale, 4 / state.canvasScale]);
    ctx.strokeRect(minC * baseCell + 0.5, minR * baseCell + 0.5,
                   (maxC - minC + 1) * baseCell - 1, (maxR - minR + 1) * baseCell - 1);
    ctx.restore();
  } else if (state.mapHoverCol >= 0 && state.mapHoverRow >= 0) {
    // No selection yet, show cursor
    const hc = state.mapHoverCol, hr = state.mapHoverRow;
    ctx.strokeStyle = 'rgba(64,144,224,0.5)';
    ctx.lineWidth = 2 / state.canvasScale;
    ctx.setLineDash([4 / state.canvasScale, 4 / state.canvasScale]);
    ctx.strokeRect(hc * baseCell + 0.5, hr * baseCell + 0.5, baseCell - 1, baseCell - 1);
    ctx.setLineDash([]);
  }
}

/* -- Building list sync -- */
function updateMapBuildingList() {
  const list = document.getElementById('mapBuildingList');
  if (!list) return;
  const m = state.data.base_map;
  const buildings = m.initialBuildings || [];
  let html = '';
  buildings.forEach((b, i) => {
    const bCfg = (state.data.buildings || []).find(bld => bld.id === b.buildingId);
    const bName = bCfg ? bCfg.name : b.buildingId;
    const sel = i === state.mapEditorSelectedBuilding ? 'background:rgba(78,203,113,0.15);border-color:var(--accent)' : '';
    html += `<div class="map-bld-item" data-idx="${i}" style="padding:4px 6px;border:1px solid var(--border);border-radius:4px;margin-bottom:3px;cursor:pointer;font-size:11px;display:flex;justify-content:space-between;align-items:center;${sel}">
      <span>${bName}</span><span style="color:var(--muted)">(${b.gridX},${b.gridY})</span></div>`;
  });
  list.innerHTML = html || '<div style="color:var(--muted);font-size:11px;padding:4px">(无建筑)</div>';

  // Click handlers: select building on click
  list.querySelectorAll('.map-bld-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      state.mapEditorSelectedBuilding = idx;
      drawMapCanvas();
    });
  });
}

/* -- Status bar -- */
function updateMapStatus(col, row) {
  const el = document.getElementById('mapStatus');
  if (!el) return;
  const m = state.data.base_map;
  if (col < 0 || col >= m.gridWidth || row < 0 || row >= m.gridHeight) {
    el.textContent = '💡 点击画布操作 | B/V/E/R/F/X/S切换模式 | Ctrl+Z撤销 Ctrl+Y重做 | 滚轮缩放 中键平移';
    return;
  }
  const ch = m.grid[row]?.[col];
  const gt = m.groundTypes?.[ch];
  const gtName = gt ? gt.name : '未知';
  const modeLabel = { brush: '🖌️笔刷', rectangle: '◻矩形', fill: '▦填充', eraser: '🧹橡皮擦', building: '🏠建筑', entrance: '🚪入口', select: '🔲选区移动' }[state.mapEditorMode] || '';
  el.textContent = `📍 (${col}, ${row}) ${gtName} | ${modeLabel} | 缩放:${Math.round(state.canvasScale * 100)}%`;
}

/* -- Canvas redraw scheduling (debounced for form field changes) -- */
let _canvasRedrawTimer = null;
function scheduleCanvasRedraw() {
  if (_canvasRedrawTimer) clearTimeout(_canvasRedrawTimer);
  _canvasRedrawTimer = setTimeout(() => {
    drawMapCanvas();
    _canvasRedrawTimer = null;
  }, 50);
}

/* -- Resizable viewport -- */
let _viewportResizeObserver = null;
function initMapViewportResize() {
  const wrapper = document.getElementById('mapCanvasWrapper');
  if (!wrapper) return;

  // Disconnect previous observer (in case renderMapForm was re-invoked)
  if (_viewportResizeObserver) {
    _viewportResizeObserver.disconnect();
    _viewportResizeObserver = null;
  }

  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      const m = state.data.base_map;
      // Snap to tile grid
      const cols = Math.max(2, Math.min(m.gridWidth, Math.round(w / MAP_CELL_SIZE)));
      const rows = Math.max(2, Math.min(m.gridHeight, Math.round(h / MAP_CELL_SIZE)));
      const snappedW = cols * MAP_CELL_SIZE;
      const snappedH = rows * MAP_CELL_SIZE;

      if (m.viewportCols !== cols || m.viewportRows !== rows
          || Math.abs(parseInt(wrapper.style.width) - snappedW) > 1
          || Math.abs(parseInt(wrapper.style.height) - snappedH) > 1) {
        // Snap wrapper size
        wrapper.style.width = snappedW + 'px';
        wrapper.style.height = snappedH + 'px';
        m.viewportCols = cols;
        m.viewportRows = rows;
        // Sync form fields
        const fCols = document.getElementById('f_map_viewportCols');
        const fRows = document.getElementById('f_map_viewportRows');
        if (fCols) fCols.value = cols;
        if (fRows) fRows.value = rows;
        // Update canvas
        const canvas = document.getElementById('mapCanvas');
        if (canvas) {
          const dpr = window.devicePixelRatio || 1;
          canvas.style.width = snappedW + 'px';
          canvas.style.height = snappedH + 'px';
          canvas.width = Math.round(snappedW * dpr);
          canvas.height = Math.round(snappedH * dpr);
        }
        drawMapCanvas();
        markDirty();
      }
    }
  });
  ro.observe(wrapper);
  _viewportResizeObserver = ro;
}
