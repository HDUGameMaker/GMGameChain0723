/**
 * gameover-panel - 游戏结束弹窗面板
 * 当人口降至 2 以下时触发，显示统计和重新开始选项
 */
export function renderGameOverPanel(data, body, pm) {
  const game = window.__game;
  if (!game) return;

  const daysSurvived = data.day || (game.systems.time ? game.systems.time.day : '?');
  const population = data.population || 0;

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:8px 0;';

  // === 游戏结束标题 ===
  const icon = document.createElement('div');
  icon.style.cssText = 'font-size:48px;margin-bottom:12px;';
  icon.textContent = '💀';

  const title = document.createElement('div');
  title.style.cssText = `
    font-size: 22px; font-weight: 700; color: #ff6666;
    margin-bottom: 8px; letter-spacing: 2px;
  `;
  title.textContent = '游戏结束';

  const reason = document.createElement('div');
  reason.style.cssText = `
    font-size: 13px; color: #888; margin-bottom: 20px; text-align: center;
  `;
  if (population <= 0) {
    reason.textContent = '所有居民都已死亡，聚落覆灭了……';
  } else {
    reason.textContent = '聚落人口不足，失去了延续的希望……';
  }

  // === 分隔线 ===
  const divider = document.createElement('div');
  divider.style.cssText = `
    width: 80%; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
    margin-bottom: 20px;
  `;

  // === 统计信息 ===
  const stats = document.createElement('div');
  stats.style.cssText = `
    display: flex; flex-direction: column; gap: 8px;
    width: 100%; max-width: 240px; margin-bottom: 24px;
  `;

  const statItems = [
    { label: '存活天数', value: `Day ${daysSurvived}` },
    { label: '最终人口', value: `${population} 人` },
  ];

  // 获取建筑数量
  if (game.systems && game.systems.building) {
    const buildingCount = game.systems.building.buildings.filter(
      b => b.status === 'active'
    ).length;
    statItems.push({ label: '活跃建筑', value: `${buildingCount} 座` });
  }

  // 获取剩余食物
  if (game.systems && game.systems.resource) {
    const foodRemaining = game.systems.resource.getAmount('food');
    statItems.push({ label: '剩余食物', value: `${foodRemaining}` });
  }

  for (const item of statItems) {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex; justify-content: space-between;
      font-size: 14px; padding: 4px 0;
    `;
    row.innerHTML = `
      <span style="color:#888">${item.label}</span>
      <span style="color:#ccc;font-weight:600">${item.value}</span>
    `;
    stats.appendChild(row);
  }

  // === 返回主菜单按钮 ===
  const restartBtn = document.createElement('button');
  restartBtn.style.cssText = `
    padding: 10px 32px;
    background: linear-gradient(135deg, #cc4444, #aa2222);
    color: #fff; border: none; border-radius: 8px;
    font-size: 15px; font-weight: 600; cursor: pointer;
    letter-spacing: 1px;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 4px 16px rgba(204,68,68,0.25);
  `;
  restartBtn.textContent = '返回主菜单';
  restartBtn.addEventListener('mouseenter', () => {
    restartBtn.style.transform = 'scale(1.03)';
    restartBtn.style.boxShadow = '0 6px 24px rgba(204,68,68,0.35)';
  });
  restartBtn.addEventListener('mouseleave', () => {
    restartBtn.style.transform = 'scale(1)';
    restartBtn.style.boxShadow = '0 4px 16px rgba(204,68,68,0.25)';
  });
  restartBtn.addEventListener('click', () => {
    game.returnToMainMenu?.();
  });

  container.appendChild(icon);
  container.appendChild(title);
  container.appendChild(reason);
  container.appendChild(divider);
  container.appendChild(stats);
  container.appendChild(restartBtn);
  body.appendChild(container);
}
