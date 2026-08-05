/**
 * gameover-panel - 游戏结束弹窗面板
 * 胜利 / 失败结算：评级称号 + 占领度统计 + 重新开始
 */
export function renderGameOverPanel(data, body, pm) {
  const game = window.__game;
  if (!game) return;

  const systems = game.systems || {};
  const ts = systems.territory;
  const ee = systems.enemyExpansion;
  const bs = systems.building;
  const rs = systems.resource;

  const daysSurvived = data.day || (systems.time ? systems.time.day : '?');
  const soldierCount = bs ? bs.getTotalSoldierCount() : 0;

  const total = ts ? ts.getClaimableCount() : 0;
  const owned = ts ? ts.getOwnedClaimableCount() : 0;
  const winPct = total > 0 ? (owned / total) * 100 : 0;
  const totalCleared = ee ? ee.getTotalCleared() : 0;
  const buildingCount = bs ? bs.buildings.filter(b => b.status === 'active').length : 0;
  const gold = rs ? rs.getAmount('gold') : 0;
  const food = rs ? rs.getAmount('food') : 0;

  const isWin = !!data.win;

  // === 评级 / 称号 ===
  let icon, mainTitle, mainColor, subtitle;
  if (isWin) {
    icon = '🏆';
    mainTitle = data.reason === 'easternBossDefeated' ? '文明胜利' : '征服胜利';
    mainColor = '#ffcc44';
    if (daysSurvived <= 15) subtitle = '⚡ 极速征服者';
    else if (daysSurvived <= 30) subtitle = '👑 征服之王';
    else subtitle = '🛡️ 坚韧征服者';
  } else {
    icon = '💀';
    mainTitle = data.reason === 'hqLost' ? '大本营沦陷' : '领地沦陷';
    mainColor = '#ff6b6b';
    if (winPct >= 40) subtitle = '💔 功亏一篑';
    else if (winPct >= 20) subtitle = '⚔️ 顽强抵抗';
    else subtitle = '🌑 初尝败绩';
  }

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:8px 0;';

  // 标题
  const iconEl = document.createElement('div');
  iconEl.style.cssText = 'font-size:52px;margin-bottom:10px;';
  iconEl.textContent = icon;

  const titleEl = document.createElement('div');
  titleEl.style.cssText = `
    font-size:24px;font-weight:800;color:${mainColor};
    margin-bottom:6px;letter-spacing:2px;
  `;
  titleEl.textContent = mainTitle;

  const subtitleEl = document.createElement('div');
  subtitleEl.style.cssText = `font-size:14px;font-weight:600;color:${mainColor};opacity:0.85;margin-bottom:8px;letter-spacing:1px;`;
  subtitleEl.textContent = subtitle;

  const reason = document.createElement('div');
  reason.style.cssText = 'font-size:13px;color:#888;margin-bottom:18px;text-align:center;';
  if (isWin) {
    reason.textContent = data.reason === 'easternBossDefeated'
      ? '东方遗迹中的神秘黑暗造物已经被击败。你的文明摆脱了黑雾的威胁，得以强盛不衰。'
      : '建筑与边境拓土已经控制过半土地，你的文明完成了历史征服。';
  } else if (data.reason === 'hqLost') {
    reason.textContent = '大本营被敌人占领，指挥中心沦陷……';
  } else {
    reason.textContent = '营地沦陷……';
  }

  // 分隔线
  const divider = document.createElement('div');
  divider.style.cssText = `
    width:80%;height:1px;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent);
    margin-bottom:18px;
  `;

  // 统计
  const stats = document.createElement('div');
  stats.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;max-width:280px;margin-bottom:24px;';
  const statItems = [
    { label: '存活天数', value: `Day ${daysSurvived}` },
    { label: '我方占领', value: `${owned}/${total}（${winPct.toFixed(1)}%）` },
    { label: '累计清敌', value: `${totalCleared}` },
    { label: '活跃建筑', value: `${buildingCount} 座` },
    { label: '士兵', value: `${soldierCount}` },
    { label: '剩余黄金', value: `${gold}` },
    { label: '剩余食物', value: `${food}` },
  ];
  for (const item of statItems) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;font-size:14px;padding:4px 0;';
    row.innerHTML = `<span style="color:#888">${item.label}</span><span style="color:#ccc;font-weight:600">${item.value}</span>`;
    stats.appendChild(row);
  }

  // 重开按钮
  const restartBtn = document.createElement('button');
  const btnGrad = isWin
    ? 'linear-gradient(135deg,#caa233,#ffcc44)'
    : 'linear-gradient(135deg,#cc4444,#aa2222)';
  const btnShadow = isWin ? 'rgba(255,204,68,0.25)' : 'rgba(204,68,68,0.25)';
  const btnShadowH = isWin ? 'rgba(255,204,68,0.4)' : 'rgba(204,68,68,0.38)';
  restartBtn.style.cssText = `
    padding:11px 36px;
    background:${btnGrad};
    color:#1a1a2e;border:none;border-radius:10px;
    font-size:15px;font-weight:700;cursor:pointer;letter-spacing:1px;
    box-shadow:0 4px 16px ${btnShadow};
    transition:transform 0.15s,box-shadow 0.15s;
  `;
  restartBtn.textContent = isWin ? '再次征服' : '卷土重来';
  restartBtn.addEventListener('mouseenter', () => {
    restartBtn.style.transform = 'scale(1.03)';
    restartBtn.style.boxShadow = `0 6px 24px ${btnShadowH}`;
  });
  restartBtn.addEventListener('mouseleave', () => {
    restartBtn.style.transform = 'scale(1)';
    restartBtn.style.boxShadow = `0 4px 16px ${btnShadow}`;
  });
  restartBtn.addEventListener('click', () => {
    game.returnToMainMenu?.();
  });

  container.appendChild(iconEl);
  container.appendChild(titleEl);
  container.appendChild(subtitleEl);
  container.appendChild(reason);
  container.appendChild(divider);
  container.appendChild(stats);
  container.appendChild(restartBtn);
  body.appendChild(container);
}
