/**
 * doctrine-panel.js - 文化面板（树状结构）
 * 类似科技树：按 tier 纵排，pos.x 决定横向位置
 */
import { store } from '../../core/Store.js';
import { eventBus } from '../../core/EventBus.js';
import { configRegistry } from '../../core/ConfigRegistry.js';
import { getFormationBonusText, getFormationRequirementText } from '../../utils/FormationUtils.js';

function _dcfg() { return configRegistry.get('doctrines') || []; }
function _researched() { return store.getState('doctrineResearched') || []; }
function _levels() { return store.getState('doctrineResearchLevels') || {}; }
function _inspiration() { return store.getState('inspiration') || 0; }
function _culture() { return window.__game?.systems?.culture; }
function _level(id) { return Math.max(0, _levels()[id] || 0); }
function _hasDoctrine(id) { return _researched().includes(id) || _level(id) > 0; }
function _costAmount(d) {
  var base = (d.cost && d.cost.length > 0) ? d.cost[0].amount : 0;
  if (!d.repeatable) return base;
  return base + _level(d.id) * (d.costGrowth || 0);
}

function _canResearch(d) {
  if (!d) return false;
  if (!d.repeatable && _hasDoctrine(d.id)) return false;
  var prereqs = d.prerequisites || [];
  for (var i = 0; i < prereqs.length; i++) {
    if (!_hasDoctrine(prereqs[i])) return false;
  }
  return true;
}

export function renderDoctrinePanel(data, body, pm) {
  body.innerHTML = '';
  body.style.cssText = 'padding:20px 24px;max-height:70vh;overflow-y:auto;';

  var doctrines = _dcfg();
  var researched = _researched();
  var inspiration = _inspiration();

  /* 头部 */
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  header.innerHTML = '<span style="font-size:18px;font-weight:700;color:#ececf0;">📜 文化</span>';
  var headerRight = document.createElement('div');
  headerRight.style.cssText = 'display:flex;align-items:center;gap:10px;';
  headerRight.innerHTML = '<span style="font-size:13px;color:#c98500;">💡 灵感: ' + inspiration + '</span>';
  if (researched.includes('order')) {
    var militaryBtn = document.createElement('button');
    militaryBtn.textContent = '军事传统';
    militaryBtn.style.cssText = 'padding:7px 12px;border:none;border-radius:6px;background:rgba(91,141,239,0.18);color:#8fb1ff;cursor:pointer;font-size:12px;font-weight:600;';
    militaryBtn.addEventListener('click', function() { pm.push('military_tradition', {}); });
    headerRight.appendChild(militaryBtn);
  }
  header.appendChild(headerRight);
  body.appendChild(header);

  if (doctrines.length === 0) {
    body.innerHTML += '<div style="text-align:center;padding:40px;color:#808098;">暂无文化信条配置</div>';
    return;
  }

  /* 按 tier 分组 */
  var tiers = {};
  var dMap = {};
  var maxTier = 0;
  doctrines.forEach(function(d) {
    if (!tiers[d.tier]) tiers[d.tier] = [];
    tiers[d.tier].push(d);
    dMap[d.id] = d;
    maxTier = Math.max(maxTier, d.tier);
  });

  /* 节点尺寸 */
  var NODE_W = 220;
  var NODE_H = 120;
  var GAP_X = 30;
  var GAP_Y = 60;

  /* 计算位置 */
  var positions = {};
  doctrines.forEach(function(d) {
    var x = (d.pos?.x ?? 0) * (NODE_W + GAP_X);
    var y = d.tier * (NODE_H + GAP_Y);
    positions[d.id] = { x: x, y: y };
  });

  /* 画布尺寸 */
  var maxX = 0, maxY = 0;
  Object.values(positions).forEach(function(p) {
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  });
  maxX += 40; maxY += 40;

  /* 收集连线 */
  var edges = [];
  doctrines.forEach(function(d) {
    (d.prerequisites || []).forEach(function(pid) {
      if (positions[pid] && positions[d.id]) edges.push({ from: pid, to: d.id });
    });
  });

  var svg = '<svg width="' + maxX + '" height="' + maxY + '" viewBox="0 0 ' + maxX + ' ' + maxY + '" style="display:block;max-width:100%;height:auto;min-height:300px;background:rgba(0,0,0,0.15);border-radius:10px;border:1px solid rgba(255,255,255,0.06);">';

  /* 连线 */
  edges.forEach(function(edge) {
    var from = positions[edge.from];
    var to = positions[edge.to];
    var fromResearched = _hasDoctrine(edge.from);
    var toResearched = _hasDoctrine(edge.to);
    var color = fromResearched ? '#4ecb71' : '#3a3a55';
    var x1 = from.x + NODE_W / 2;
    var y1 = from.y + NODE_H;
    var x2 = to.x + NODE_W / 2;
    var y2 = to.y;
    svg += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + color + '" stroke-width="1.5" fill="none" opacity="0.7"/>';
  });

  /* 节点 */
  doctrines.forEach(function(d) {
    var p = positions[d.id];
    var currentLevel = _level(d.id);
    var isResearched = _hasDoctrine(d.id);
    var canResearch = _canResearch(d);
    var costAmount = _costAmount(d);
    var canAfford = inspiration >= costAmount;
    var bg = isResearched ? 'rgba(78,203,113,0.12)' : canResearch ? 'rgba(91,141,239,0.10)' : 'rgba(255,255,255,0.03)';
    var border = isResearched ? '#4ecb71' : canResearch ? '#5b8def' : '#3a3a55';

    /* 效果预览文本 */
    var fx = [];
    if (d.commandPointsBonus) fx.push('CP+' + d.commandPointsBonus + (d.repeatable ? '/级' : ''));
    if (d.growthSpeedBonus) fx.push('人口+' + Math.round(d.growthSpeedBonus * 100) + '%');
    if (d.foodConsumeMul) fx.push('粮耗×' + d.foodConsumeMul);
    if (d.productionMul) fx.push('产出×' + d.productionMul);
    if (d.resourceProductionMul) {
      Object.entries(d.resourceProductionMul).forEach(function(entry) {
        var r = configRegistry.getResource(entry[0]);
        fx.push((r ? r.name : entry[0]) + '×' + entry[1]);
      });
    }
    if (d.meleeDamageMul || d.rangedDamageMul || d.unitHpMul) fx.push('军力提升');
    if (d.unlocks && d.unlocks.buildings && d.unlocks.buildings.length) fx.push('🏗' + d.unlocks.buildings.length);
    if (d.unlocks && d.unlocks.units && d.unlocks.units.length) fx.push('⚔' + d.unlocks.units.length);
    if (d.unlocks && d.unlocks.formations && d.unlocks.formations.length) fx.push('🔱' + d.unlocks.formations.length);

    svg += '<foreignObject x="' + p.x + '" y="' + p.y + '" width="' + NODE_W + '" height="' + NODE_H + '">';
    svg += '<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;box-sizing:border-box;padding:8px 10px;background:' + bg + ';border:2px solid ' + border + ';border-radius:8px;display:flex;flex-direction:column;gap:2px;overflow:hidden;">';
    svg += '<div style="font-size:12px;font-weight:600;color:' + (isResearched ? '#4ecb71' : '#ececf0') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (isResearched && !d.repeatable ? '✅ ' : '') + d.name + (d.repeatable ? ' Lv.' + currentLevel : '') + '</div>';
    svg += '<div style="font-size:10px;color:#808098;">T' + d.tier + ' · ⏱' + d.researchTime + '</div>';
    if (d.description) svg += '<div style="font-size:9px;color:#a0a0ba;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + d.description + '</div>';
    if (fx.length) svg += '<div style="font-size:9px;color:#5b8def;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + fx.join(' · ') + '</div>';
    svg += '<div style="font-size:10px;color:' + (canAfford || isResearched ? '#c98500' : '#f0a040') + ';">💡 ' + costAmount + (isResearched && !d.repeatable ? ' ✅已研究' : '') + '</div>';
    svg += '</div></foreignObject>';
  });

  svg += '</svg>';

  var container = document.createElement('div');
  container.style.cssText = 'overflow-x:auto;';
  container.innerHTML = svg;
  body.appendChild(container);

  /* 说明 */
  var note = document.createElement('div');
  note.style.cssText = 'font-size:11px;color:#808098;margin-top:10px;';
  note.innerHTML = '💡 每人每天产生 1 点灵感 · 点击已解锁节点可研究';
  body.appendChild(note);

  /* 节点点击：研究 */
  var nodeEls = container.querySelectorAll('foreignObject');
  doctrines.forEach(function(d, i) {
    var el = nodeEls[i];
    if (!el) return;
    var isResearched = _hasDoctrine(d.id);
    if (isResearched && !d.repeatable) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', function() {
      var canResearch = _canResearch(d);
      var costAmount = _costAmount(d);
      if (!canResearch) { pm.alert('前置未完成'); return; }
      if (inspiration < costAmount) { pm.alert('灵感不足（需要 ' + costAmount + '）'); return; }
      var cur = _researched();
      var nextState = { inspiration: _inspiration() - costAmount };
      if (d.repeatable) {
        var levels = { ..._levels() };
        levels[d.id] = _level(d.id) + 1;
        nextState.doctrineResearchLevels = levels;
        if (!cur.includes(d.id)) {
          cur.push(d.id);
          nextState.doctrineResearched = cur;
        }
      } else {
        cur.push(d.id);
        nextState.doctrineResearched = cur;
      }
      store.setState(nextState);
      eventBus.emit('cultureResearched', { id: d.id });
      eventBus.emit('combatBroadcast', { message: '📜 完成文化研究: ' + d.name + (d.repeatable ? ' Lv.' + _level(d.id) : '') });
      renderDoctrinePanel(data, body, pm);
    });
  });
}

export function renderMilitaryTraditionPanel(data, body, pm) {
  body.innerHTML = '';
  body.style.cssText = 'padding:20px 24px;max-height:70vh;overflow-y:auto;';

  var culture = _culture();
  if (!culture) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:#808098;">文化系统未加载</div>';
    return;
  }

  var formations = configRegistry.get('enemies')?.formations || [];
  var inspiration = _inspiration();
  var researched = culture.getFormationResearch ? culture.getFormationResearch() : [];

  var header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';
  header.innerHTML = '<span style="font-size:18px;font-weight:700;color:#ececf0;">📜 军事传统</span>' +
    '<span style="font-size:13px;color:#c98500;">💡 灵感: ' + inspiration + '</span>';
  body.appendChild(header);

  var note = document.createElement('div');
  note.style.cssText = 'font-size:12px;color:#a0a0ba;line-height:1.5;margin-bottom:14px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;';
  note.textContent = '阵型需要单独研发。每个阵型要求先研发其需求分支中的最低级兵种，然后消耗灵感完成军事传统。';
  body.appendChild(note);

  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;';

  formations.forEach(function(f) {
    var done = researched.includes(f.id) || f.unlocked === true;
    var check = culture.canResearchFormation ? culture.canResearchFormation(f.id) : { valid: false, reason: '不可研发' };
    var reqUnits = culture.getFormationRequirements ? culture.getFormationRequirements(f.id) : [];
    var unitResearch = store.getState('unitResearch') || [];
    var canClick = !done && check.valid;

    var card = document.createElement('div');
    card.style.cssText = 'background:rgba(255,255,255,0.035);border:1px solid ' + (done ? '#4ecb71' : canClick ? '#5b8def' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:7px;min-height:170px;';

    var title = document.createElement('div');
    title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';
    title.innerHTML = '<span style="font-size:14px;font-weight:700;color:' + (done ? '#4ecb71' : '#ececf0') + ';">' + (done ? '✅ ' : '') + f.name + '</span>' +
      '<span style="font-size:11px;color:#8fb1ff;">' + getFormationBonusText(f.id) + '</span>';
    card.appendChild(title);

    var req = document.createElement('div');
    req.style.cssText = 'font-size:11px;color:#5b8def;line-height:1.4;';
    req.textContent = '触发需求: ' + getFormationRequirementText(f.id);
    card.appendChild(req);

    var unitReq = document.createElement('div');
    unitReq.style.cssText = 'font-size:11px;color:#a0a0ba;line-height:1.45;';
    unitReq.innerHTML = '研发前置: ' + (reqUnits.length ? reqUnits.map(function(u) {
      var ok = unitResearch.includes(u.id);
      return '<span style="color:' + (ok ? '#4ecb71' : '#f0a040') + ';">' + (ok ? '✅' : '🔒') + u.name + '</span>';
    }).join(' / ') : '无');
    card.appendChild(unitReq);

    var desc = document.createElement('div');
    desc.style.cssText = 'font-size:11px;color:#808098;line-height:1.4;';
    desc.textContent = f.description || '';
    card.appendChild(desc);

    var action = document.createElement('div');
    action.style.cssText = 'margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:8px;';
    var cost = document.createElement('span');
    cost.style.cssText = 'font-size:12px;color:' + (inspiration >= (f.researchCost || 0) ? '#c98500' : '#f0a040') + ';';
    cost.textContent = '💡 ' + (f.researchCost || 0);
    action.appendChild(cost);

    var btn = document.createElement('button');
    btn.textContent = done ? '已完成' : (canClick ? '研发' : check.reason || '暂不可研发');
    btn.style.cssText = 'padding:6px 12px;border:none;border-radius:6px;background:' + (canClick ? 'rgba(91,141,239,0.22)' : 'rgba(128,128,152,0.14)') + ';color:' + (canClick ? '#8fb1ff' : '#808098') + ';cursor:' + (canClick ? 'pointer' : 'default') + ';font-size:12px;font-weight:600;';
    btn.addEventListener('click', function() {
      if (!canClick) {
        if (!done) pm.alert(check.reason || '暂不可研发');
        return;
      }
      if (culture.researchFormation(f.id)) renderMilitaryTraditionPanel(data, body, pm);
    });
    action.appendChild(btn);
    card.appendChild(action);

    grid.appendChild(card);
  });

  body.appendChild(grid);
}
