/**
 * torch-detail-panel - 火把详情面板
 * 使用统一设计系统
 */
import { configRegistry } from '../../core/ConfigRegistry.js';
import { eventBus } from '../../core/EventBus.js';


/* 通用区块容器 */
function section(label, icon) {
  const el = document.createElement('div');
  el.style.cssText = 'padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.05);margin-bottom:10px;';
  if (label) {
    const title = document.createElement('div');
    title.style.cssText = 'font-size:13px;font-weight:600;color:#ececf0;margin-bottom:10px;letter-spacing:0.01em;';
    title.textContent = `${icon || ''} ${label}`;
    el.appendChild(title);
  }
  return el;
}

/* 通用按钮 */
function actionButton(text, color, onClick) {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = `
    width:100%; padding:10px 16px; border:none; border-radius:10px;
    background: ${color}; color: #fff; cursor: pointer;
    font-size:14px; font-weight:600; font-family: inherit;
    transition: filter 0.2s, transform 0.1s;
  `;
  btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(1.15)'; });
  btn.addEventListener('mouseleave', () => { btn.style.filter = ''; });
  btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.97)'; });
  btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1)'; });
  btn.addEventListener('click', onClick);
  return btn;
}

/* 信息行 */
function infoRow(label, value, valueColor) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;';
  row.innerHTML = `
    <span style="color:#a0a0ba;">${label}</span>
    <span style="color:${valueColor || '#ececf0'};font-weight:500;">${value}</span>
  `;
  return row;
}

export function renderTorchDetailPanel(data, body, pm) {
  const game = window.__game;
  if (!game) return;

  const torchIndex = data.torchIndex;
  const torchSystem = game.systems.torch;
  const resourceSystem = game.systems.resource;

  const torch = torchSystem.torches[torchIndex];
  if (!torch) {
    body.innerHTML = '<p style="color:#ff6b6b;text-align:center;padding:20px;">火把不存在</p>';
    return;
  }

  const config = torchSystem.getTorchConfig(torch.torchId);
  if (!config) {
    body.innerHTML = '<p style="color:#ff6b6b;text-align:center;padding:20px;">火把配置不存在</p>';
    return;
  }

  const isEternal = config.torchType === 'eternal';

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;';

  // ===== 火把头部 =====
  const headerSec = section('', '');
  headerSec.style.cssText += 'text-align:center;';

  const flameIcon = document.createElement('div');
  flameIcon.style.cssText = 'font-size:48px;margin-bottom:8px;';
  flameIcon.textContent = torch.lit ? '🔥' : '🕯️';
  headerSec.appendChild(flameIcon);

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:18px;font-weight:700;color:#ececf0;margin-bottom:2px;';
  nameEl.textContent = config.name;
  headerSec.appendChild(nameEl);

  const typeBadge = document.createElement('span');
  typeBadge.style.cssText = `
    display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:500;margin-top:4px;
    background:${isEternal ? 'rgba(255,170,51,0.15)' : 'rgba(255,136,0,0.15)'};
    color:${isEternal ? '#ffaa33' : '#ff8800'};
  `;
  typeBadge.textContent = isEternal ? '永恒之火' : (torch.lit ? '已点燃' : '未点燃');
  headerSec.appendChild(typeBadge);

  // 通过 BuildingSystem 查找对应建筑（用于判断建造/升级状态）
  const buildingSystem = game.systems.building;
  const buildingIndex = buildingSystem.buildings.findIndex(
    b => b.gridX === torch.gridX && b.gridY === torch.gridY
  );
  const building = buildingIndex >= 0 ? buildingSystem.buildings[buildingIndex] : null;
  const isConstructing = building && building.status === 'constructing';

  if (torch.upgrading || isConstructing) {
    const upgradingBadge = document.createElement('span');
    upgradingBadge.style.cssText = `
      display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:500;margin-top:4px;margin-left:6px;
      background:rgba(240,160,64,0.15);color:#f0a040;
    `;
    upgradingBadge.textContent = '升级中...';
    headerSec.appendChild(upgradingBadge);
  }

  container.appendChild(headerSec);

  // ===== 火把信息 =====
  const infoSec = section('火把信息', '📊');
  infoSec.appendChild(infoRow('类型', isEternal ? '永恒火把（无需燃料）' : '普通火把'));
  infoSec.appendChild(infoRow('照亮半径', `${config.radius} 格`));
  if (!isEternal && torch.lit) {
    infoSec.appendChild(infoRow('燃料消耗', `${config.coalPerPeriod} 煤炭 / 周期`));
    infoSec.appendChild(infoRow('剩余燃料', `${torch.fuel < Infinity ? Math.floor(torch.fuel) : '∞'}`, torch.fuel > 0 ? '#4ecb71' : '#ff6b6b'));
  }
  if (isConstructing && building) {
    const targetCfg = configRegistry.getBuilding(building.buildingId);
    const progress = building.buildProgress || 0;
    const total = targetCfg?.buildTime || config.buildTime || 1;
    infoSec.appendChild(infoRow('升级进度', `${progress}/${total}`, '#f0a040'));

    // 升级进度条
    const barContainer = document.createElement('div');
    barContainer.style.cssText = 'margin-top:8px;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;';
    const barFill = document.createElement('div');
    const pct = Math.min(progress / total, 1);
    barFill.style.cssText = `height:100%;width:${pct * 100}%;background:#f0a040;border-radius:3px;transition:width 0.3s;`;
    barContainer.appendChild(barFill);
    infoSec.appendChild(barContainer);
  }
  container.appendChild(infoSec);

  // ===== 操作区 =====
  const actionSec = section('操作', '⚡');

  // --- 未点燃的普通火把：点燃按钮 ---
  if (!isEternal && !torch.lit && !torch.upgrading) {
    const lightCost = config.lightCost || [];
    const costText = lightCost.map(c => {
      const resCfg = configRegistry.getResource(c.resourceId);
      return `${c.amount} ${resCfg?.name || c.resourceId}`;
    }).join(' + ');
    actionSec.appendChild(infoRow('点燃消耗', costText, '#f0a040'));

    const canAfford = resourceSystem.canAfford(lightCost);
    const lightBtn = actionButton(
      canAfford ? `🔥 点燃 (${costText})` : `🔥 点燃 (资源不足)`,
      canAfford ? '#f0a040' : '#555',
      () => {
        const result = torchSystem.lightTorch(torchIndex);
        if (result) {
          pm.close();
        } else {
          pm.alert('点燃失败：煤炭不足');
        }
      }
    );
    if (!canAfford) lightBtn.style.opacity = '0.5';
    actionSec.appendChild(lightBtn);
  }

  // --- 已点燃的普通火把：添加燃料 + 升级 ---
  if (!isEternal && torch.lit && !torch.upgrading) {
    const lightCost = config.lightCost || [];
    const fuelAmount = lightCost[0]?.amount || 5;
    const fuelBtn = actionButton(
      `⛽ 添加燃料 (+${fuelAmount} 煤炭)`,
      '#4ecb71',
      () => {
        const result = torchSystem.addFuel(torchIndex);
        if (result) {
          pm.refresh({ torchIndex });
        } else {
          pm.alert('添加燃料失败：煤炭不足');
        }
      }
    );
    actionSec.appendChild(fuelBtn);

    // 升级按钮（统一走 BuildingSystem.upgradeBuilding）
    if (config.upgradesTo && buildingIndex >= 0) {
      const targetCfg = configRegistry.getBuilding(config.upgradesTo);
      const check = buildingSystem.canUpgrade(buildingIndex);
      const costText = (check.cost || []).map(c => `${c.amount} ${c.resourceId}`).join(' + ');

      const upgradeBtn = actionButton(
        check.valid ? `⬆ 升级至 ${targetCfg?.name || config.upgradesTo} (${costText})` : `⬆ 升级 (${check.reason})`,
        check.valid ? '#7b5ea7' : '#555',
        () => {
          const result = buildingSystem.upgradeBuilding(buildingIndex);
          if (result) {
            pm.refresh({ torchIndex });
          } else {
            pm.alert('升级失败：资源不足');
          }
        }
      );
      if (!check.valid) upgradeBtn.style.opacity = '0.5';
      actionSec.appendChild(upgradeBtn);
    }
  }

  // --- 永恒火把：仅显示升级 ---
  if (isEternal && !torch.upgrading && config.upgradesTo && buildingIndex >= 0) {
    const targetCfg = configRegistry.getBuilding(config.upgradesTo);
    const check = buildingSystem.canUpgrade(buildingIndex);
    const costText = (check.cost || []).map(c => `${c.amount} ${c.resourceId}`).join(' + ');

    const upgradeBtn = actionButton(
      check.valid ? `⬆ 升级至 ${targetCfg?.name || config.upgradesTo} (${costText})` : `⬆ 升级 (${check.reason})`,
      check.valid ? '#7b5ea7' : '#555',
      () => {
        const result = buildingSystem.upgradeBuilding(buildingIndex);
        if (result) {
          pm.refresh({ torchIndex });
        } else {
          pm.alert('升级失败：资源不足');
        }
      }
    );
    if (!check.valid) upgradeBtn.style.opacity = '0.5';
    actionSec.appendChild(upgradeBtn);
  }

  // --- 永恒火把无操作 ---
  if (isEternal && !config.upgradesTo && !torch.upgrading) {
    const noAction = document.createElement('div');
    noAction.style.cssText = 'text-align:center;color:#a0a0ba;font-size:13px;padding:8px 0;';
    noAction.textContent = '永恒之火无需任何操作';
    actionSec.appendChild(noAction);
  }

  container.appendChild(actionSec);

  // ===== 拆除（仅可拆除的火把）=====
  if (config.demolishable !== false) {
    const demolishSec = section('拆除', '🗑️');
    const buildingSystem = game.systems.building;
    const demolishBtn = actionButton(
      '拆除火把',
      'rgba(255, 107, 107, 0.15)',
      async () => {
        // 在点击时重新查找 buildingIndex，避免渲染期间索引变动
        const idx = buildingSystem.buildings.findIndex(
          b => b.gridX === torch.gridX && b.gridY === torch.gridY && b.buildingId === torch.torchId
        );
        if (idx >= 0) {
          if (await pm.confirm('确定拆除此火把？此操作不可撤销。')) {
            buildingSystem.demolishBuilding(idx);
            pm.close();
          }
        }
      }
    );
    demolishBtn.style.color = '#ff6b6b';
    demolishSec.appendChild(demolishBtn);
    container.appendChild(demolishSec);
  }

  body.appendChild(container);
}
