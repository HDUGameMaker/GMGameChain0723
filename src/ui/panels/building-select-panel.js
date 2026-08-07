/**
 * building-select-panel - 建筑选择面板
 * 使用统一设计系统
 */
import { configRegistry } from '../../core/ConfigRegistry.js';
import { eventBus } from '../../core/EventBus.js';
import { BUILDING_CATEGORIES } from '../../domain/BuildingPresentation.js';
import { getBuildingPrimaryFunctionRows } from '../../domain/BuildingPresentation.js';
import { getBuildingResourceNodeRequirement } from '../../domain/ResourceNodePresentation.js';

export function isBuildingVisibleForEra(building, currentEra, eras = []) {
  if (!building?.eraId || !currentEra?.id) return true;
  const currentIndex = eras.findIndex(era => era.id === currentEra.id);
  const buildingIndex = eras.findIndex(era => era.id === building.eraId);
  return buildingIndex < 0 || (currentIndex >= 0 && buildingIndex <= currentIndex);
}

export function getBuildingCivilizationIds(building) {
  return [...new Set([
    building?.civilizationId,
    ...(building?.civilizationIds || []),
    ...(building?.unlockConditions || []).filter(condition => condition.type === 'civilization').map(condition => condition.civilizationId)
  ].filter(Boolean))];
}

export function isBuildingVisibleForCivilization(building, eraSystem) {
  const restrictedIds = getBuildingCivilizationIds(building);
  if (!restrictedIds.length) return true;
  const ownedIds = new Set([
    ...(eraSystem?.getLegacyCivilizationIds?.() || []),
    eraSystem?.getSelectedCivilization?.()?.id
  ].filter(Boolean));
  return restrictedIds.some(id => ownedIds.has(id));
}

export function renderBuildingSelectPanel(data, body, pm) {
  const game = window.__game;
  if (!game) return;

  /* 清空 body -- 修复升级上限后直接重渲染导致内容堆叠、UI 排布错乱 */
  body.innerHTML = '';

  const buildings = configRegistry.get('buildings') || [];
  const resourceSystem = game.systems.resource;
  const buildingSystem = game.systems.building;
  const eraSystem = game.systems.era;
  const eras = eraSystem?.getEras?.() || configRegistry.getHistoricalContent().eras || [];
  const currentEra = eraSystem?.getCurrentEra?.() || eras[0] || null;
  const resourceNodeDefinitions = configRegistry.get('resourceNodes')?.types || {};

  const newlyUnlocked = buildingSystem.getNewlyUnlocked();

  // 升级目标与地图专用建筑不进入建造菜单；未解锁建筑保留并显示原因。
  const buildable = buildings.filter(b => {
    if (!isBuildingVisibleForEra(b, currentEra, eras)) return false;
    if (!isBuildingVisibleForCivilization(b, eraSystem)) return false;
    if (b.upgradesFrom) return false; // 升级目标不直接建造
    if (!b.buildCost || b.buildCost.length === 0) return false; // 无建造成本 = 地图专用
    return true;
  });

  const categoryOrder = Object.keys(BUILDING_CATEGORIES);
  buildable.sort((a, b) => {
    const categoryDelta = categoryOrder.indexOf(a.category || 'administration')
      - categoryOrder.indexOf(b.category || 'administration');
    if (categoryDelta !== 0) return categoryDelta;
    const aNew = newlyUnlocked.includes(a.id) ? 1 : 0;
    const bNew = newlyUnlocked.includes(b.id) ? 1 : 0;
    return (bNew - aNew) || String(a.name).localeCompare(String(b.name), 'zh-CN');
  });

  // 分类筛选：默认「全部」= 分组展示全部；选中分类则只显示该类建筑
  const selectedCategory = data?.category || 'all';
  const availableCategories = [...new Set(buildable.map(b => b.category || 'administration'))]
    .sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b));
  const filtered = selectedCategory === 'all'
    ? buildable
    : buildable.filter(b => (b.category || 'administration') === selectedCategory);

  if (buildable.length === 0) {
    body.innerHTML = '<p style="color:#888;text-align:center;padding:24px;font-size:14px;">暂无可用建筑<br><span style="font-size:12px;">建造更多前置建筑以解锁</span></p>';
    return;
  }

  // 顶部提示
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:12px;color:#888;margin-bottom:12px;text-align:center;';
  hint.textContent = '选择建筑后点击地图放置';
  body.appendChild(hint);

  // 分类筛选栏
  const categoryTabs = document.createElement('div');
  categoryTabs.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;';
  const renderCategory = (catId, label) => {
    const tab = document.createElement('button');
    tab.textContent = label;
    tab.dataset.testid = `build-cat-${catId}`;
    tab.style.cssText = `white-space:nowrap;padding:5px 10px;border:1px solid ${selectedCategory === catId ? '#a8874d' : '#444'};border-radius:6px;background:${selectedCategory === catId ? '#514021' : '#272a31'};color:${selectedCategory === catId ? '#f0d9a8' : '#aaa'};cursor:pointer;font-size:12px;`;
    tab.addEventListener('click', () => renderBuildingSelectPanel({ ...data, category: catId }, body, pm));
    categoryTabs.appendChild(tab);
  };
  renderCategory('all', '全部');
  for (const catId of availableCategories) {
    renderCategory(catId, BUILDING_CATEGORIES[catId] || catId);
  }
  body.appendChild(categoryTabs);

  // 拓土与其建筑上限升级界面已移除。
  const territory = null;
  if (territory) {
    const cap = territory.getBuildingCap();
    const bCount = buildingSystem.buildings.length;
    const cost = territory.getCapUpgradeCost();
    const canUpgrade = resourceSystem.canAfford(cost);
    const costText = (cost || []).map(c => {
      const rCfg = configRegistry.getResource(c.resourceId);
      return `${rCfg ? rCfg.name : c.resourceId}×${c.amount}`;
    }).join('  ');
    const capBar = document.createElement('div');
    capBar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:12px;background:rgba(255,200,60,0.08);border:1px solid rgba(255,200,60,0.25);border-radius:8px;font-size:12px;color:#ccc;';
    const perLevel = territory.getCapUpgradeAmount();
    capBar.innerHTML = `<span style="font-weight:600;color:#ffcc44;">🏗️ 建筑上限</span><span>${bCount}/${cap}</span><span style="font-size:11px;color:#888;">每次升级 +${perLevel}</span><span style="flex:1"></span>`;
    const upBtn = document.createElement('button');
    upBtn.textContent = '升级上限 ' + (costText || '');
    upBtn.style.cssText = `padding:5px 12px;border:none;border-radius:6px;background:${canUpgrade ? 'rgba(255,200,60,0.22)' : 'rgba(128,128,152,0.15)'};color:${canUpgrade ? '#ffcc44' : '#808098'};cursor:${canUpgrade ? 'pointer' : 'default'};font-size:11px;font-weight:600;`;
    upBtn.addEventListener('click', () => { if (territory.upgradeBuildingCap()) renderBuildingSelectPanel(data, body, pm); });
    capBar.appendChild(upBtn);
    body.appendChild(capBar);
  }

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  let currentCategory = null;
  for (const b of filtered) {
    const categoryId = b.category || 'administration';
    if (categoryId !== currentCategory) {
      currentCategory = categoryId;
      const categoryTitle = document.createElement('div');
      categoryTitle.style.cssText = 'font-size:13px;font-weight:700;color:#d7c486;margin:12px 2px 2px;padding-bottom:6px;border-bottom:1px solid rgba(215,196,134,0.2);';
      categoryTitle.textContent = BUILDING_CATEGORIES[categoryId] || BUILDING_CATEGORIES.administration;
      list.appendChild(categoryTitle);
    }
    const isNew = newlyUnlocked.includes(b.id);
    const unlockStatus = buildingSystem.getUnlockStatus(b.id);
    const atCountLimit = b.maxCount !== null && b.maxCount !== undefined
      && buildingSystem.getBuildingCount(b.id) >= b.maxCount;
    const canAfford = resourceSystem.canAfford(b.buildCost || []);
    const canBuild = unlockStatus.unlocked && !atCountLimit && canAfford;
    const card = document.createElement('div');
    card.style.cssText = `
      padding: 14px;
      border-radius: 12px;
      cursor: ${canBuild ? 'pointer' : 'default'};
      background: ${canBuild ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)'};
      border: 1px solid ${isNew ? 'rgba(255,200,60,0.5)' : (canBuild ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)')};
      opacity: ${canBuild ? '1' : '0.68'};
      transition: background 0.2s, border-color 0.2s, transform 0.1s;
      display: flex;
      align-items: center;
      gap: 12px;
      position: relative;
    `;

    // 新解锁标记
    if (isNew) {
      const badge = document.createElement('div');
      badge.style.cssText = `
        position: absolute; top: -6px; right: -6px;
        background: #ffc83c; color: #1a1a2e;
        font-size: 10px; font-weight: 700;
        padding: 2px 8px; border-radius: 10px;
        letter-spacing: 0.5px;
      `;
      badge.textContent = '新';
      card.appendChild(badge);
    }

    // 建筑图标
    const iconEl = document.createElement('div');
    iconEl.style.cssText = `
      width: 44px; height: 44px;
      border-radius: 10px;
      background: ${canBuild ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'};
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; flex-shrink: 0;
    `;
    if (b.icon?.includes('/')) {
      const image = document.createElement('img');
      image.src = b.icon;
      image.alt = b.name;
      image.style.cssText = 'width:38px;height:38px;object-fit:contain;border-radius:8px;';
      iconEl.appendChild(image);
    } else {
      iconEl.textContent = b.icon || '🏠';
    }

    // 建筑信息
    const infoEl = document.createElement('div');
    infoEl.style.cssText = 'flex:1;min-width:0;';

    const costText = (b.buildCost || [])
      .map(c => {
        const rCfg = configRegistry.getResource(c.resourceId);
        return `${rCfg ? rCfg.name : c.resourceId}×${c.amount}`;
      }).join('  ');

    const tags = [];
    const civilizationIds = getBuildingCivilizationIds(b);
    const civilizationNames = civilizationIds.map(id => eraSystem?.getCivilizations?.().find(civilization => civilization.id === id)?.name || id);
    const primaryFunctions = getBuildingPrimaryFunctionRows(b, resourceId => configRegistry.getResource(resourceId)?.name || resourceId);
    const nodeRequirement = getBuildingResourceNodeRequirement(b, resourceNodeDefinitions);
    if (b.isTorch) tags.push('🔥 照明');
    if (b.maxWorkers) tags.push(`👷 ${b.maxWorkers}`);
    if (Number.isFinite(b.maxCount)) tags.push(`🏗️ 建造数量 ${buildingSystem.getBuildingCount(b.id)}/${b.maxCount}`);
    if (b.soldierCapacity) tags.push(`⚔️ +${b.soldierCapacity} 士兵`);
    if (b.foodCapacity) tags.push(`🍞 +${b.foodCapacity}/天/工人`);
    const lockReasons = unlockStatus.conditions.filter(condition => !condition.met).map(condition => condition.desc);
    if (atCountLimit) lockReasons.push(`已达数量上限 ${b.maxCount}`);

    infoEl.innerHTML = `
      <div style="font-weight:600;color:#ececf0;font-size:14px;margin-bottom:3px;">
        ${isNew ? '🆕 ' : ''}${b.name}
        <span style="font-size:11px;color:#888;margin-left:6px;font-weight:400;">${b.footprint.width}×${b.footprint.height}</span>
      </div>
      ${primaryFunctions.length ? `<div style="font-size:12px;color:#8ed6a5;font-weight:650;margin:5px 0;line-height:1.55;">主要功能：${primaryFunctions.join('；')}</div>` : ''}
      <div style="font-size:12px;color:#888;margin-bottom:4px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${b.description || ''}</div>
      ${civilizationNames.length ? `<div style="font-size:11px;color:#d8b86f;font-weight:700;margin:5px 0;">🏛️ 文明限定：${civilizationNames.join('、')}</div>` : ''}
      ${nodeRequirement ? `<div style="font-size:12px;color:${nodeRequirement.color};font-weight:700;margin:5px 0;">📍 ${nodeRequirement.text}</div>` : ''}
      <div style="font-size:12px;color:${canAfford ? '#4ecb71' : '#ff6b6b'};font-weight:500;">${costText || '免费'}</div>
      ${lockReasons.length ? `<div style="font-size:11px;color:#e79a9a;margin-top:5px;">🔒 ${lockReasons.join('；')}</div>` : ''}
      ${tags.length > 0 ? `<div style="font-size:11px;color:#a0a0ba;margin-top:3px;display:flex;gap:8px;">${tags.map(t => `<span>${t}</span>`).join('')}</div>` : ''}
    `;

    card.appendChild(iconEl);
    card.appendChild(infoEl);

    if (canBuild) {
      card.addEventListener('click', () => {
        buildingSystem.clearNewlyUnlocked();
        pm.close();
        buildingSystem.enterPlacingMode(b.id);
      });
      card.addEventListener('mouseenter', () => {
        card.style.background = 'rgba(255,255,255,0.12)';
        card.style.borderColor = isNew ? 'rgba(255,200,60,0.7)' : 'rgba(255,255,255,0.2)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.background = 'rgba(255,255,255,0.06)';
        card.style.borderColor = isNew ? 'rgba(255,200,60,0.5)' : 'rgba(255,255,255,0.1)';
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

  // 面板关闭/刷新时清除新解锁标记
  list._popupCleanup = () => {
    buildingSystem.clearNewlyUnlocked();
  };

  body.appendChild(list);
}
