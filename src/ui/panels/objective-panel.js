/**
 * objective-panel - 战役目标面板
 * 正式呈现胜利 / 失败条件 + 实时进度。开局简报与随时查看共用同一渲染函数。
 * data.briefing = true 时为开局简报模式（带「战役开始」副标题与「开始征服」按钮）。
 */
export function renderObjectivePanel(data, body, pm) {
  const game = window.__game;
  if (!game) return;
  const systems = game.systems || {};
  const ts = systems.territory;
  const ee = systems.enemyExpansion;
  const time = systems.time;

  const isBriefing = !!data?.briefing;

  const total = ts ? ts.getClaimableCount() : 0;
  const owned = ts ? ts.getOwnedClaimableCount() : 0;
  const winThreshold = ts?._config?.winThreshold ?? 0.5;
  const winPct = total > 0 ? (owned / total) * 100 : 0;

  const enemyCount = ee ? ee.getCellCount() : 0;
  const failRatio = ee?._config?.failThresholdRatio ?? 0.5;
  const enemyPct = total > 0 ? (enemyCount / total) * 100 : 0;
  const day = time ? time.day : 1;
  const strength = ee ? ee.getStrengthForDay(day) : 0;
  const power = ee ? ee.getArmyPower() : 0;

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:16px;padding:4px 0;max-width:540px;margin:0 auto;';

  if (isBriefing) {
    const sub = document.createElement('div');
    sub.style.cssText = 'text-align:center;font-size:12px;color:#a0a0ba;letter-spacing:3px;margin-bottom:2px;';
    sub.textContent = '- 战役开始 -';
    container.appendChild(sub);
  }

  // 胜利条件卡
  container.appendChild(_card({
    icon: '🏆', title: '胜利条件', color: '#f0a040',
      desc: '用建筑与边境拓土控制超过半数的土地，即达成征服。',
    barColor: 'linear-gradient(90deg,#7c3aed,#cc88ff)',
    pct: winPct, current: owned, total,
    threshold: winThreshold, thresholdLabel: `目标 ${Math.round(winThreshold * 100)}%`,
    extra: null
  }));

  // 失败条件卡
  container.appendChild(_card({
    icon: '💀', title: '失败条件', color: '#ff6b6b',
    desc: '被敌人 x2 扩张占据超过半数的土地，或大本营被敌人占领，即告失败。',
    barColor: 'linear-gradient(90deg,#b91c1c,#ff6b6b)',
    pct: enemyPct, current: enemyCount, total,
    threshold: failRatio, thresholdLabel: `危险 ${Math.round(failRatio * 100)}%`,
    extra: `当日敌兵强度 ${strength} · 我方战力 ${power}`
  }));

  // 玩法脉络
  const flow = document.createElement('div');
  flow.style.cssText = 'padding:14px 16px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.06);font-size:13px;color:#a0a0ba;line-height:1.8;';
  flow.innerHTML = `
    <div style="color:#ececf0;font-weight:600;margin-bottom:6px;">玩法脉络</div>
        基建产金 → <b style="color:#cc88ff">边境拓土</b> / <b style="color:#4ecb71">招兵</b>清敌 → 控制半数土地获胜<br>
        <span style="color:#6a6a82;">核心成长：</span>🔬 科技树 · 🏛️ 人文树 · 🌳 建筑树 · 📜 历史策略
  `;
  container.appendChild(flow);

  // 简报模式：开始征服按钮
  if (isBriefing) {
    const btn = document.createElement('button');
    btn.textContent = '开始征服';
    btn.style.cssText = `
      margin-top:4px;padding:11px 32px;
      background:linear-gradient(135deg,#7c3aed,#aa55ff);
      color:#fff;border:none;border-radius:10px;
      font-size:15px;font-weight:700;cursor:pointer;letter-spacing:1px;
      box-shadow:0 4px 16px rgba(124,58,237,0.3);
      transition:transform 0.15s,box-shadow 0.15s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.03)';
      btn.style.boxShadow = '0 6px 24px rgba(124,58,237,0.42)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 16px rgba(124,58,237,0.3)';
    });
    btn.addEventListener('click', () => pm.close());
    container.appendChild(btn);
  }

  body.appendChild(container);
}

function _card({ icon, title, color, desc, barColor, pct, current, total, threshold, thresholdLabel, extra }) {
  const card = document.createElement('div');
  card.style.cssText = 'padding:16px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.06);';

  const head = document.createElement('div');
  head.style.cssText = `display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:${color};margin-bottom:8px;`;
  head.innerHTML = `<span style="font-size:18px;">${icon}</span><span>${title}</span>`;
  card.appendChild(head);

  const d = document.createElement('div');
  d.style.cssText = 'font-size:13px;color:#a0a0ba;line-height:1.6;margin-bottom:12px;';
  d.textContent = desc;
  card.appendChild(d);

  // 进度条 + 阈值标记线
  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'position:relative;width:100%;height:10px;background:rgba(255,255,255,0.08);border-radius:5px;';
  const fill = document.createElement('div');
  fill.style.cssText = `height:100%;width:${Math.min(100, pct).toFixed(1)}%;background:${barColor};border-radius:5px;transition:width 0.3s ease;`;
  barWrap.appendChild(fill);
  const mark = document.createElement('div');
  mark.style.cssText = `position:absolute;left:${Math.min(100, threshold * 100).toFixed(1)}%;top:-3px;bottom:-3px;width:2px;background:rgba(255,255,255,0.55);`;
  barWrap.appendChild(mark);
  card.appendChild(barWrap);

  const meta = document.createElement('div');
  meta.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;color:#888;margin-top:6px;';
  meta.innerHTML = `<span><b style="color:#ececf0;">${current}</b> / ${total}（${pct.toFixed(1)}%）</span><span>${thresholdLabel}</span>`;
  card.appendChild(meta);

  if (extra) {
    const e = document.createElement('div');
    e.style.cssText = 'font-size:12px;color:#6a6a82;margin-top:4px;';
    e.textContent = extra;
    card.appendChild(e);
  }

  return card;
}
