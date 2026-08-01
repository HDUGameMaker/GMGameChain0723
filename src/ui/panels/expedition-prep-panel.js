/**
 * expedition-prep-panel - 探险准备面板
 * 支持 1-3 个阶段（必须从第一个开始连续选择，不允许空隙）
 */
import { configRegistry } from '../../core/ConfigRegistry.js';
import { eventBus } from '../../core/EventBus.js';

export function renderExpeditionPrepPanel(data, body, pm) {
  const game = window.__game;
  if (!game) return;

  const expeditionSystem = game.systems.expedition;
  const itemSystem = game.systems.item;
  const populationSystem = game.systems.population;
  const expConfig = expeditionSystem.getExpeditionConfig();
  const entrance = data.entrance; // 入口数据（含 id, name, regionIds）

  // 状态
  const MAX_STAGES = expConfig.expeditionPeriods; // 最大阶段数（3）
  let selectedRegions = new Array(MAX_STAGES).fill(null); // [regionId | null, ...]
  let focusSlot = 0; // 当前焦点栏位
  // 从上次探险记录中恢复装备选择
  let equippedInstanceIds = new Set(itemSystem.getEquippedInstances().map(i => i.instanceId));

  /**
   * 紧凑化区域选择（去掉末尾 null），用于预览产出
   */
  function compactRegions(regions) {
    const result = [...regions];
    while (result.length > 0 && result[result.length - 1] === null) {
      result.pop();
    }
    return result;
  }

  /**
   * 判断选择是否有效：至少选1个，无空隙
   */
  function isValidSelection(regions) {
    const compacted = compactRegions(regions);
    if (compacted.length === 0) return false;
    // 检查空隙
    let seenNull = false;
    for (const id of regions) {
      if (id !== null && seenNull) return false;
      if (id === null) seenNull = true;
    }
    return true;
  }

  // 时段映射表
  const ALL_PERIOD_KEYS = ['morning', 'afternoon', 'evening', 'night'];
  const ALL_PERIOD_LABELS = ['上午', '下午', '傍晚', '夜晚'];
  const ALL_PERIOD_ICONS = ['☀️', '🌤️', '🌅', '🌙'];

  function getCurrentPeriodIndex() {
    const timeSystem = game.systems.time;
    return timeSystem ? timeSystem.periodIndex : 0;
  }

  function getPhaseLabels() {
    const base = getCurrentPeriodIndex();
    const labels = [];
    const icons = [];
    for (let i = 0; i < MAX_STAGES; i++) {
      const idx = (base + i) % 4;
      labels.push(ALL_PERIOD_LABELS[idx]);
      icons.push(ALL_PERIOD_ICONS[idx]);
    }
    return { labels, icons };
  }

  // 获取当前焦点栏位对应时段的产出（用于区域卡片上直观展示）
  function getFocusPeriodKey() {
    return ALL_PERIOD_KEYS[(getCurrentPeriodIndex() + focusSlot) % 4];
  }

  function formatYields(region) {
    const periodKey = getFocusPeriodKey();
    const yields = region.baseYields[periodKey];
    if (!yields) return '';
    return Object.entries(yields).map(([resId, amt]) => {
      const cfg = configRegistry.getResource(resId);
      return `${cfg ? cfg.name : resId} ${amt}`;
    }).join(' · ');
  }

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  function render() {
    container.innerHTML = '';

    // === 时段区域选择 ===
    const { labels: periodNames, icons: periodIcons } = getPhaseLabels();

    // 提示文字
    const hintDiv = document.createElement('div');
    hintDiv.style.cssText = 'font-size:12px;color:#888;text-align:center;margin-bottom:2px;';
    const compacted = compactRegions(selectedRegions);
    let hintText = entrance ? `探索入口: ${entrance.name}` : '';
    if (compacted.length === 0) {
      hintText += hintText ? ' | 请至少选择第一个阶段的探索区域' : '请至少选择第一个阶段的探索区域';
    } else {
      hintText += hintText ? ` | 已选择 ${compacted.length}/${MAX_STAGES} 个阶段` : `已选择 ${compacted.length}/${MAX_STAGES} 个阶段`;
    }
    hintDiv.textContent = hintText;
    container.appendChild(hintDiv);

    const slotSection = document.createElement('div');
    slotSection.style.cssText = 'display:flex;gap:8px;justify-content:center;';

    for (let i = 0; i < MAX_STAGES; i++) {
      const slot = document.createElement('div');
      const isSelected = selectedRegions[i] !== null;
      const isFocused = focusSlot === i;
      const isDisabled = i > 0 && selectedRegions[i - 1] === null; // 前一阶段未选，当前不可选

      slot.style.cssText = `
        flex:1; padding:10px; border-radius:10px; text-align:center;
        transition: all 0.2s;
        background: ${isFocused ? 'rgba(100,180,255,0.2)' : 'rgba(255,255,255,0.05)'};
        border: 2px solid ${isFocused ? 'rgba(100,180,255,0.6)' : 'rgba(255,255,255,0.1)'};
        opacity: ${isDisabled ? '0.35' : '1'};
      `;

      const regionName = isSelected
        ? (configRegistry.getRegion(selectedRegions[i])?.name || '')
        : (i === 0 ? '(必选)' : '(可选)');

      const requiredBadge = i === 0
        ? '<span style="font-size:10px;color:#f80;margin-left:2px;">*</span>'
        : '';

      slot.innerHTML = `
        <div style="font-size:12px;color:#aaa;">${periodIcons[i]} ${periodNames[i]}${requiredBadge}</div>
        <div style="font-size:13px;color:#fff;margin-top:4px;">${regionName}</div>
        ${isSelected && i > 0 ? '<div style="font-size:10px;color:#888;margin-top:2px;">点击清除</div>' : ''}
      `;

      if (!isDisabled) {
        slot.style.cursor = isSelected && i > 0 ? 'pointer' : 'pointer';
        slot.addEventListener('click', () => {
          if (isSelected && i > 0) {
            // 点击已选中的可选阶段 → 清除该阶段及之后所有选择
            selectedRegions[i] = null;
            // 清除后续阶段
            for (let j = i + 1; j < MAX_STAGES; j++) {
              selectedRegions[j] = null;
            }
            focusSlot = i;
          } else if (!isSelected) {
            focusSlot = i;
          }
          render();
        });
      }

      slotSection.appendChild(slot);
    }
    container.appendChild(slotSection);

    // === 可选区域 ===
    const currentSelection = selectedRegions[focusSlot];
    const canSelectHere = focusSlot === 0 || selectedRegions[focusSlot - 1] !== null;

    const focusPeriodLabel = ALL_PERIOD_LABELS[(getCurrentPeriodIndex() + focusSlot) % 4];
    const regionsSection = document.createElement('div');
    if (canSelectHere) {
      regionsSection.innerHTML = `<div style="font-size:13px;color:#aaa;margin-bottom:8px;">选择区域 (${focusPeriodLabel}时段产出):</div>`;
    } else {
      regionsSection.innerHTML = '<div style="font-size:13px;color:#f88;margin-bottom:8px;">⚠ 请先选择上一阶段的区域</div>';
    }
    const regionGrid = document.createElement('div');
    regionGrid.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

    const availableRegions = expeditionSystem.getAvailableRegions(entrance?.regionIds);
    for (const { region, unlocked, unlockHint } of availableRegions) {
      const card = document.createElement('div');
      // 仅检查当前焦点槽位（允许同一区域出现在不同阶段）
      const isInCurrentSlot = selectedRegions[focusSlot] === region.id;
      // 查找该区域已在哪些其他槽位中被选中（用于视觉提示）
      const selectedSlots = [];
      for (let s = 0; s < MAX_STAGES; s++) {
        if (selectedRegions[s] === region.id) selectedSlots.push(s);
      }
      const isSelectedElsewhere = selectedSlots.length > 0 && !isInCurrentSlot;

      // 视觉样式：当前槽位、其他槽位、未选择 三种状态
      let bg, border, badgeHtml = '';
      if (isInCurrentSlot) {
        bg = 'rgba(100,255,150,0.2)';
        border = 'rgba(100,255,150,0.5)';
        badgeHtml = '<div style="font-size:10px;color:#8f8;margin-top:2px;">当前阶段</div>';
      } else if (isSelectedElsewhere) {
        bg = 'rgba(100,200,255,0.12)';
        border = 'rgba(100,200,255,0.3)';
        const stageNames = periodNames;
        const slotLabels = selectedSlots.map(s => stageNames[s]).join(',');
        badgeHtml = `<div style="font-size:10px;color:#8cf;margin-top:2px;">已选: ${slotLabels}</div>`;
      } else {
        bg = unlocked ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)';
        border = unlocked ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
      }

      card.style.cssText = `
        padding:10px 14px; border-radius:8px;
        cursor: ${unlocked && canSelectHere ? 'pointer' : 'default'};
        background: ${bg};
        border: 1px solid ${border};
        opacity: ${unlocked && canSelectHere ? '1' : '0.5'}; min-width:80px; text-align:center;
      `;
      card.innerHTML = `
        <div style="font-size:13px;color:#fff;font-weight:600;">${region.name}</div>
        ${unlocked ? `<div style="font-size:11px;color:#8f8;margin-top:3px;line-height:1.4;">${formatYields(region)}</div>` : ''}
        ${unlocked && region.workerCost ? `<div style="font-size:10px;color:#f8a040;margin-top:2px;">👥 ${region.workerCost}人</div>` : ''}
        ${badgeHtml}
        ${!unlocked ? `<div style="font-size:10px;color:#f88;margin-top:2px;">🔒 ${unlockHint}</div>` : ''}
      `;
      if (unlocked && canSelectHere) {
        card.addEventListener('click', () => {
          if (isInCurrentSlot) {
            // 点击当前槽位已选中的区域 → 取消当前槽位及之后的选择
            selectedRegions[focusSlot] = null;
            for (let j = focusSlot + 1; j < MAX_STAGES; j++) {
              selectedRegions[j] = null;
            }
          } else {
            // 添加到当前槽位（允许同一区域出现在多个阶段）
            selectedRegions[focusSlot] = region.id;
            // 自动推进到下一个空栏位
            const nextEmpty = selectedRegions.findIndex((r, idx) => idx > focusSlot && r === null);
            if (nextEmpty >= 0) focusSlot = nextEmpty;
          }
          render();
        });
      }
      regionGrid.appendChild(card);
    }
    regionsSection.appendChild(regionGrid);
    container.appendChild(regionsSection);

    // === 产出预览 ===
    const filledRegions = compactRegions(selectedRegions);
    if (filledRegions.length > 0) {
      const yields = expeditionSystem.getExpectedYields(
        [...selectedRegions],
        [...equippedInstanceIds]
      );
      const yieldEntries = Object.entries(yields);
      const yieldText = yieldEntries.length > 0
        ? yieldEntries.map(([id, amt]) => {
            const cfg = configRegistry.getResource(id);
            return `${cfg ? cfg.name : id}: ${amt}`;
          }).join('  ')
        : '无产出';

      const previewDiv = document.createElement('div');
      previewDiv.style.cssText = 'font-size:12px;color:#8f8;padding:8px;background:rgba(255,255,255,0.05);border-radius:8px;';
      previewDiv.textContent = `预计产出(${filledRegions.length}/${MAX_STAGES}阶段): ${yieldText}`;
      container.appendChild(previewDiv);

      // 工人消耗汇总
      const totalWorkers = expeditionSystem.getTotalWorkerCost(filledRegions);
      const availableWorkers = populationSystem ? populationSystem.getAvailableWorkers() : 0;
      const workerDiv = document.createElement('div');
      const workersOK = totalWorkers <= availableWorkers;
      workerDiv.style.cssText = `font-size:12px;padding:8px;border-radius:8px;background:rgba(255,255,255,0.05);color:${workersOK ? '#aaa' : '#f66'};`;
      workerDiv.textContent = workersOK
        ? `👥 所需工人: ${totalWorkers}人 (可用: ${availableWorkers}人)`
        : `⚠ 所需工人: ${totalWorkers}人 (可用: ${availableWorkers}人) — 工人不足！`;
      container.appendChild(workerDiv);
    }

    // === 物品选择 ===
    const itemSection = document.createElement('div');
    itemSection.innerHTML = '<div style="font-size:13px;color:#aaa;margin-bottom:8px;">携带物品:</div>';

    const allItems = itemSystem.getOwnedInstances().filter(i => !i.inExpedition);
    const backpackCapacity = expConfig.baseBackpackCapacity;
    let usedCapacity = 0;
    for (const id of equippedInstanceIds) {
      const item = allItems.find(i => i.instanceId === id);
      if (item) usedCapacity += item.capacityCost;
    }

    const capDiv = document.createElement('div');
    capDiv.style.cssText = 'font-size:12px;color:#aaa;margin-bottom:6px;';
    capDiv.textContent = `背包容量: ${usedCapacity} / ${backpackCapacity}`;
    itemSection.appendChild(capDiv);

    for (const item of allItems) {
      const isEquipped = equippedInstanceIds.has(item.instanceId);
      const canEquip = isEquipped || (usedCapacity + item.capacityCost <= backpackCapacity);

      const row = document.createElement('div');
      row.style.cssText = `
        display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:4px;
        border-radius:6px;background:rgba(255,255,255,0.03);
        opacity:${canEquip ? '1' : '0.4'};cursor:${canEquip ? 'pointer' : 'default'};
      `;
      const effectText = (item.expeditionEffects || []).map(e => {
        if (e.type === 'yield_multiplier') return `产出×${e.value}`;
        if (e.type === 'yield_flat_bonus') return `+${e.value}`;
        if (e.type === 'resource_capacity_bonus') return `资源容量+${e.value}`;
        if (e.type === 'backpack_capacity_bonus') return `背包+${e.value}`;
        return '';
      }).join(', ') || '无加成';

      row.innerHTML = `
        <span style="font-size:14px;">${isEquipped ? '☑' : '☐'}</span>
        <span style="font-size:13px;color:#fff;flex:1;">${item.name}</span>
        <span style="font-size:11px;color:#aaa;">容量${item.capacityCost} | ${effectText}</span>
      `;

      if (canEquip) {
        row.addEventListener('click', () => {
          if (isEquipped) {
            equippedInstanceIds.delete(item.instanceId);
            itemSystem.unequip(item.instanceId);
          } else {
            equippedInstanceIds.add(item.instanceId);
            itemSystem.equip(item.instanceId);
          }
          render();
        });
      }
      itemSection.appendChild(row);
    }
    container.appendChild(itemSection);

    // === 底部按钮 ===
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;';

    const clearBtn = document.createElement('button');
    clearBtn.textContent = '清空全部';
    clearBtn.style.cssText = 'flex:1;padding:10px;border:none;border-radius:8px;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;font-size:13px;';
    clearBtn.addEventListener('click', () => {
      for (const id of equippedInstanceIds) {
        itemSystem.unequip(id);
      }
      selectedRegions = new Array(MAX_STAGES).fill(null);
      equippedInstanceIds.clear();
      focusSlot = 0;
      render();
    });

    const startBtn = document.createElement('button');
    const selectionValid = isValidSelection(selectedRegions);
    const stageCount = compactRegions(selectedRegions).length;

    // 检查各项条件
    let canStart = selectionValid && stageCount > 0;
    let buttonLabel;
    if (!selectionValid) {
      buttonLabel = stageCount === 0 ? '请选择至少一个区域' : '区域选择有空隙';
    } else {
      // 进一步校验（工人等）
      const check = expeditionSystem.canStartExpedition(selectedRegions, [...equippedInstanceIds]);
      if (!check.valid) {
        canStart = false;
        buttonLabel = check.reason;
      } else {
        buttonLabel = stageCount === MAX_STAGES ? '确认出发' : `确认出发 (${stageCount}阶段)`;
      }
    }

    startBtn.textContent = buttonLabel;
    startBtn.style.cssText = `flex:2;padding:10px;border:none;border-radius:8px;background:${canStart ? '#4a9' : '#555'};color:#fff;cursor:${canStart ? 'pointer' : 'default'};font-size:14px;font-weight:bold;`;
    if (canStart) {
      startBtn.addEventListener('click', () => {
        // 物品已在勾选时即时 equip，无需重复操作
        const success = expeditionSystem.startExpedition(selectedRegions, [...equippedInstanceIds]);
        if (success) {
          pm.close();
        } else {
          pm.alert('出发失败，请检查条件');
        }
      });
    }

    btnRow.appendChild(clearBtn);
    btnRow.appendChild(startBtn);
    container.appendChild(btnRow);
  }

  render();
  body.appendChild(container);

  // 监听时段变化，实时更新阶段名称
  const onPeriodChange = () => render();
  eventBus.on('periodChange', onPeriodChange);

  // 面板关闭/刷新时由 PopupManager 统一调用清理
  container._popupCleanup = () => {
    eventBus.off('periodChange', onPeriodChange);
  };
}
