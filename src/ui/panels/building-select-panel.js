/**
 * building-select-panel - 建筑选择面板
 * 使用统一设计系统
 */
import { configRegistry } from '../../core/ConfigRegistry.js';
import { eventBus } from '../../core/EventBus.js';

export function renderBuildingSelectPanel(data, body, pm) {
  const game = window.__game;
  if (!game) return;

  const buildings = configRegistry.get('buildings') || [];
  const resourceSystem = game.systems.resource;
  const buildingSystem = game.systems.building;

  // 过滤可建造的建筑（排除 initialBuilding 和 upgradesFrom 的建筑）
  const buildable = buildings.filter(b => {
    if (b.upgradesFrom) return false; // 升级目标不直接建造
    // maxCount 检查
    if (b.maxCount !== null && b.maxCount !== undefined) {
      if (buildingSystem.getBuildingCount(b.id) >= b.maxCount) return false;
    }
    return true;
  });

  if (buildable.length === 0) {
    body.innerHTML = '<p style="color:#888;text-align:center;padding:24px;font-size:14px;">暂无可建造的建筑</p>';
    return;
  }

  // 顶部提示
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:12px;color:#888;margin-bottom:12px;text-align:center;';
  hint.textContent = '选择建筑后点击地图放置';
  body.appendChild(hint);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  for (const b of buildable) {
    const canAfford = resourceSystem.canAfford(b.buildCost || []);
    const card = document.createElement('div');
    card.style.cssText = `
      padding: 14px;
      border-radius: 12px;
      cursor: ${canAfford ? 'pointer' : 'default'};
      background: ${canAfford ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)'};
      border: 1px solid ${canAfford ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'};
      opacity: ${canAfford ? '1' : '0.45'};
      transition: background 0.2s, border-color 0.2s, transform 0.1s;
      display: flex;
      align-items: center;
      gap: 12px;
    `;

    // 建筑图标
    const iconEl = document.createElement('div');
    iconEl.style.cssText = `
      width: 44px; height: 44px;
      border-radius: 10px;
      background: ${canAfford ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'};
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; flex-shrink: 0;
    `;
    iconEl.textContent = b.icon || '🏠';

    // 建筑信息
    const infoEl = document.createElement('div');
    infoEl.style.cssText = 'flex:1;min-width:0;';

    const costText = (b.buildCost || [])
      .map(c => {
        const rCfg = configRegistry.getResource(c.resourceId);
        return `${rCfg ? rCfg.name : c.resourceId}×${c.amount}`;
      }).join('  ');

    const tags = [];
    if (b.maxWorkers) tags.push(`👷 ${b.maxWorkers}`);
    if (b.housingCapacity) tags.push(`🏠 +${b.housingCapacity}`);
    if (b.foodCapacity) tags.push(`🍞 +${b.foodCapacity}`);

    infoEl.innerHTML = `
      <div style="font-weight:600;color:#ececf0;font-size:14px;margin-bottom:3px;">
        ${b.name}
        <span style="font-size:11px;color:#888;margin-left:6px;font-weight:400;">${b.footprint.width}×${b.footprint.height}</span>
      </div>
      <div style="font-size:12px;color:#888;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.description || ''}</div>
      <div style="font-size:12px;color:${canAfford ? '#4ecb71' : '#ff6b6b'};font-weight:500;">${costText || '免费'}</div>
      ${tags.length > 0 ? `<div style="font-size:11px;color:#a0a0ba;margin-top:3px;display:flex;gap:8px;">${tags.map(t => `<span>${t}</span>`).join('')}</div>` : ''}
    `;

    card.appendChild(iconEl);
    card.appendChild(infoEl);

    if (canAfford) {
      card.addEventListener('click', () => {
        pm.close();
        buildingSystem.enterPlacingMode(b.id);
      });
      card.addEventListener('mouseenter', () => {
        card.style.background = 'rgba(255,255,255,0.12)';
        card.style.borderColor = 'rgba(255,255,255,0.2)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.background = 'rgba(255,255,255,0.06)';
        card.style.borderColor = 'rgba(255,255,255,0.1)';
      });
      card.addEventListener('mousedown', () => {
        card.style.transform = 'scale(0.98)';
      });
      card.addEventListener('mouseup', () => {
        card.style.transform = 'scale(1)';
      });
    }

    list.appendChild(card);
  }

  body.appendChild(list);
}
