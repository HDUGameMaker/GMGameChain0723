/**
 * building-detail-panel - 建筑详情面板
 * 使用统一设计系统
 */
import { configRegistry } from '../../core/ConfigRegistry.js';
import { eventBus } from '../../core/EventBus.js';
import { progressManager } from '../../utils/ProgressManager.js';

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

function getResourceName(resourceId) {
  if (resourceId === 'inspiration' || resourceId === 'icon_inspiration') return '灵感';
  const cfg = configRegistry.getResource(resourceId);
  return cfg ? cfg.name : resourceId;
}

function formatResourceList(items, emptyText = '无') {
  if (!items || items.length === 0) return emptyText;
  return items.map(item => `${getResourceName(item.resourceId)}×${item.amount}`).join(' + ');
}

export function renderBuildingDetailPanel(data, body, pm) {
  const game = window.__game;
  if (!game) return;

  const buildingIndex = data.buildingIndex;
  const buildingSystem = game.systems.building;
  const resourceSystem = game.systems.resource;
  const populationSystem = game.systems.population;

  const building = buildingSystem.buildings[buildingIndex];
  if (!building) {
    body.innerHTML = '<p style="color:#ff6b6b;text-align:center;padding:20px;">建筑不存在</p>';
    return;
  }

  const config = configRegistry.getBuilding(building.buildingId);
  if (!config) return;

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;';

  // ===== 建筑头部 =====
  const buildCur = building.buildProgress ?? 0;
  const buildTotal = config.buildTime ?? 1;
  const statusText = building.status === 'constructing'
    ? `建造中 (${buildCur}/${buildTotal})`
    : '运行中';
  const statusColor = building.status === 'active' ? '#4ecb71' : '#f0a040';

  // ===== 详情大图（支持序列帧动画）=====
  if (config.imageDetail) {
    const animConfig = config.detailAnimation;
    if (animConfig && animConfig.frameCount >= 2) {
      // 序列帧动画模式（DOM background-position 驱动）
      const {
        frameCount = 4,
        fps = 6,
        frameWidth = 1024,
        frameHeight = 1024,
        pingpong = true
      } = animConfig;

      const imgWrap = document.createElement('div');
      imgWrap.style.cssText = 'text-align:center;margin-bottom:10px;';

      // 显示尺寸：宽最多280px，高按比例
      const displayW = 280;
      const displayH = Math.round(displayW * frameHeight / frameWidth);

      const sprite = document.createElement('div');
      sprite.style.cssText = [
        `width:${displayW}px`,
        `height:${displayH}px`,
        `background-image:url(${config.imageDetail})`,
        `background-size:${frameCount * 100}% 100%`,
        'background-repeat:no-repeat',
        'image-rendering:auto',
        'margin:0 auto',
        'border-radius:8px'
      ].join(';');

      let currentFrame = 0;
      let direction = 1;

      const updateFrame = () => {
        const pct = frameCount > 1
          ? (currentFrame / (frameCount - 1)) * 100
          : 0;
        sprite.style.backgroundPositionX = `${pct}%`;
      };
      updateFrame();

      const interval = setInterval(() => {
        if (pingpong) {
          if (currentFrame >= frameCount - 1) direction = -1;
          if (currentFrame <= 0) direction = 1;
          currentFrame += direction;
        } else {
          currentFrame = (currentFrame + 1) % frameCount;
        }
        updateFrame();
      }, 1000 / fps);

      // 挂载清理函数，弹窗关闭时调用
      imgWrap._animCleanup = () => clearInterval(interval);

      imgWrap.appendChild(sprite);
      container.appendChild(imgWrap);
    } else {
      // 静态图片模式（原有行为）
      const imgWrap = document.createElement('div');
      imgWrap.style.cssText = 'text-align:center;margin-bottom:10px;';
      const img = document.createElement('img');
      img.src = config.imageDetail;
      img.alt = config.name;
      img.style.cssText = 'width:100%;max-width:280px;border-radius:8px;display:block;margin:0 auto;';
      img.onerror = () => { img.style.display = 'none'; };
      imgWrap.appendChild(img);
      container.appendChild(imgWrap);
    }
  }

  const header = section('', '');
  header.style.textAlign = 'center';
  header.innerHTML = `
    <div style="font-size:18px;font-weight:700;color:#ececf0;letter-spacing:-0.01em;">${config.name}</div>
    <div style="font-size:13px;color:#a0a0ba;margin-top:4px;">${config.description || ''}${config.roadRequired ? '<br><span style="color:#f0a040;">🛤️ 道路依赖：必须紧邻道路</span>' : ''}</div>
    <div class="status-label" style="font-size:12px;color:${statusColor};margin-top:6px;font-weight:500;">${statusText}</div>
    ${building.status === 'constructing' ? `
      <div class="build-progress" style="margin-top:10px;">
        <div class="build-progress-fill" style="width:${(buildCur / buildTotal) * 100}%"></div>
      </div>
    ` : ''}
  `;
  container.appendChild(header);

  // 建造进度注册到统一进度管理器
  if (building.status === 'constructing') {
    const progressFill = header.querySelector('.build-progress-fill');
    const statusLabel = header.querySelector('.status-label');
    if (progressFill) {
      progressManager.registerDiscrete(
        progressFill,
        () => {
          const b = buildingSystem.buildings[buildingIndex];
          return (b && b.status === 'constructing') ? (b.buildProgress || 0) : 0;
        },
        () => config.buildTime,
        {
          labelEl: statusLabel,
          formatLabel: (v) => {
            const b = buildingSystem.buildings[buildingIndex];
            if (!b || b.status !== 'constructing') return '建造完成';
            return `建造中 (${b.buildProgress || 0}/${config.buildTime})`;
          }
        }
      );
    }
  }

  // ===== 工人分配 =====
  if (building.status === 'active' && config.maxWorkers && config.maxWorkers > 0) {
    const workerSection = section('工人分配', '👷');

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:16px;justify-content:center;';

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '−';
    removeBtn.style.cssText = 'width:40px;height:40px;border:1px solid rgba(255,100,100,0.3);border-radius:10px;background:rgba(255,100,100,0.15);color:#ff6b6b;font-size:20px;cursor:pointer;font-family:inherit;';
    removeBtn.addEventListener('click', () => {
      buildingSystem.removeWorker(buildingIndex);
      pm.refresh({ buildingIndex });
    });

    const count = document.createElement('span');
    count.style.cssText = 'font-size:16px;font-weight:600;color:#ececf0;min-width:60px;text-align:center;';
    count.textContent = `${building.currentWorkers} / ${config.maxWorkers}`;

    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.style.cssText = 'width:40px;height:40px;border:1px solid rgba(100,255,100,0.3);border-radius:10px;background:rgba(100,255,100,0.15);color:#4ecb71;font-size:20px;cursor:pointer;font-family:inherit;';
    addBtn.addEventListener('click', () => {
      buildingSystem.assignWorker(buildingIndex);
      pm.refresh({ buildingIndex });
    });

    row.appendChild(removeBtn);
    row.appendChild(count);
    row.appendChild(addBtn);
    workerSection.appendChild(row);

    const avail = document.createElement('div');
    avail.style.cssText = 'text-align:center;font-size:11px;color:#888;margin-top:6px;';
    avail.textContent = `可用工人: ${populationSystem.getAvailableWorkers()}`;
    workerSection.appendChild(avail);

    container.appendChild(workerSection);
  }

  // ===== 水力/风力装置（工厂类建筑） =====
  if (building.status === 'active' && config.maxWorkers && config.maxWorkers > 0 && config.production) {
    const attachmentType = buildingSystem.getAttachmentType(buildingIndex);
    const attachSection = section('装置', '⚙️');

    if (attachmentType) {
      const typeName = attachmentType === 'hydro' ? '水力' : '风力';
      attachSection.innerHTML += `
        <div style="font-size:13px;color:#4ecb71;margin-bottom:8px;text-align:center;">
          ✅ 已安装${typeName}机械装置
        </div>
      `;
      const uninstallBtn = actionButton('卸载装置', 'rgba(255,100,100,0.15)', () => {
        buildingSystem.uninstallAttachment(buildingIndex);
        pm.refresh({ buildingIndex });
      });
      uninstallBtn.style.color = '#ff6b6b';
      attachSection.appendChild(uninstallBtn);
    } else {
      const infoText = document.createElement('div');
      infoText.style.cssText = 'font-size:12px;color:#a0a0ba;margin-bottom:8px;text-align:center;';
      infoText.textContent = '装置可完全替代工人进行生产';
      attachSection.appendChild(infoText);

      const installHydroBtn = actionButton('加装水力装置（齿轮×20 木板×50 电子元件×10 钢锭×40）', 'rgba(78, 140, 255, 0.25)', () => {
        const result = buildingSystem.installAttachment(buildingIndex, 'hydro');
        if (result) pm.refresh({ buildingIndex });
      });
      // 检查能否安装，不能则置灰
      const hydroCheck = buildingSystem.canInstallAttachment(buildingIndex, 'hydro');
      if (!hydroCheck.valid) {
        installHydroBtn.style.opacity = '0.5';
        installHydroBtn.style.cursor = 'default';
        installHydroBtn.title = hydroCheck.reason;
      }
      attachSection.appendChild(installHydroBtn);

      const installWindBtn = actionButton('加装风力装置（齿轮×15 木板×75 电子元件×10 钢锭×35 毛皮×30）', 'rgba(78, 203, 113, 0.25)', () => {
        const result = buildingSystem.installAttachment(buildingIndex, 'wind');
        if (result) pm.refresh({ buildingIndex });
      });
      const windCheck = buildingSystem.canInstallAttachment(buildingIndex, 'wind');
      if (!windCheck.valid) {
        installWindBtn.style.opacity = '0.5';
        installWindBtn.style.cursor = 'default';
        installWindBtn.title = windCheck.reason;
      }
      installWindBtn.style.marginTop = '6px';
      attachSection.appendChild(installWindBtn);
    }

    container.appendChild(attachSection);
  }

  // ===== 生产信息 =====
  if (config.production) {
    const prodSection = section('生产', '⚙️');
    const preview = buildingSystem.getBuildingDailyProductionPreview(buildingIndex);
    const standardUnit = preview?.perWorker ? '/人' : '';
    const inputText = formatResourceList(preview?.inputStandard, '无');
    const outputText = formatResourceList(preview?.outputStandard, '无');
    const dailyInputText = formatResourceList(preview?.dailyInput, '无');
    const dailyOutputText = formatResourceList(preview?.dailyOutput, '无');
    const workerText = preview?.perWorker
      ? `当前 ${preview.currentWorkers} 人` + (preview.effectiveWorkers !== preview.currentWorkers ? `，有效 ${preview.effectiveWorkers} 人` : '')
      : '固定产出，不随工人数变化';
    const cycleText = preview?.cycle === 'day'
      ? '每日结算 1 次'
      : `每日折算 ${preview?.cyclesPerDay || 0} 次`;

    prodSection.innerHTML += `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
        <div style="font-size:12px;color:#a0a0ba;">消耗标准</div>
        <div style="font-size:12px;color:#ececf0;font-weight:500;">${inputText}${inputText === '无' ? '' : standardUnit}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
        <div style="font-size:12px;color:#a0a0ba;">产出标准</div>
        <div style="font-size:12px;color:#4ecb71;font-weight:500;">${outputText}${outputText === '无' ? '' : standardUnit}</div>
      </div>
      <div style="height:1px;background:rgba(255,255,255,0.06);margin:6px 0;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
        <div style="font-size:12px;color:#a0a0ba;">生产人力</div>
        <div style="font-size:12px;color:#ececf0;font-weight:500;">${workerText}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
        <div style="font-size:12px;color:#a0a0ba;">结算频率</div>
        <div style="font-size:12px;color:#ececf0;font-weight:500;">${cycleText}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
        <div style="font-size:12px;color:#a0a0ba;">每日消耗</div>
        <div style="font-size:12px;color:#ffb347;font-weight:600;">${dailyInputText}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
        <div style="font-size:12px;color:#a0a0ba;">每日最终产量</div>
        <div style="font-size:12px;color:#4ecb71;font-weight:700;">${dailyOutputText}</div>
      </div>
    `;
    container.appendChild(prodSection);
  }

  // ===== 相邻加成 =====
  if (building.status === 'active') {
    const bonuses = buildingSystem.getAdjacencyBonuses(buildingIndex);
    const providedBonuses = buildingSystem.getProvidedAdjacencyBonuses
      ? buildingSystem.getProvidedAdjacencyBonuses(buildingIndex)
      : [];
    if ((bonuses && bonuses.length > 0) || (providedBonuses && providedBonuses.length > 0)) {
      const adjSection = section('相邻加成', '🔗');

      for (const bonus of bonuses) {
        const color = bonus.isPositive ? '#4ecb71' : '#ff6b6b';
        const icon = bonus.isPositive ? '↑' : '↓';
        const row = document.createElement('div');
        row.style.cssText = `
          display:flex;justify-content:space-between;align-items:center;
          padding:6px 0;font-size:12px;
        `;
        row.innerHTML = `
          <span style="color:#a0a0ba;">${icon} 获得自 ${bonus.otherName}（${bonus.distance}格）</span>
          <span style="color:${color};font-weight:600;">${bonus.bonusDesc.split(': ')[1]}</span>
        `;
        adjSection.appendChild(row);
      }

      for (const bonus of providedBonuses) {
        const color = bonus.isPositive ? '#4ecb71' : '#ff6b6b';
        const icon = bonus.isPositive ? '↑' : '↓';
        const row = document.createElement('div');
        row.style.cssText = `
          display:flex;justify-content:space-between;align-items:center;
          padding:6px 0;font-size:12px;
        `;
        row.innerHTML = `
          <span style="color:#a0a0ba;">${icon} 提供给 ${bonus.otherName}（${bonus.distance}格）</span>
          <span style="color:${color};font-weight:600;">${bonus.bonusDesc.split(': ')[1]}</span>
        `;
        adjSection.appendChild(row);
      }

      container.appendChild(adjSection);
    }
  }

  // ===== 合成配方 =====
  if (config.synthesisRecipes && config.synthesisRecipes.length > 0 && building.status === 'active') {
    const synthSection = section('合成', '🔨');

    for (const recipe of config.synthesisRecipes) {
      const canSynth = buildingSystem.canSynthesize(buildingIndex, recipe.id);
      const costText = (recipe.resourceCost || []).map(c => {
        const r = configRegistry.getResource(c.resourceId);
        return `${r ? r.name : c.resourceId}×${c.amount}`;
      }).join('  ');

      const recipeDiv = document.createElement('div');
      recipeDiv.style.cssText = `
        padding:10px 12px; margin-bottom:6px; border-radius:8px;
        background: ${canSynth.valid ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'};
        border: 1px solid ${canSynth.valid ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'};
        opacity: ${canSynth.valid ? '1' : '0.5'};
        cursor: ${canSynth.valid ? 'pointer' : 'default'};
        transition: background 0.2s;
      `;
      recipeDiv.innerHTML = `
        <div style="font-weight:600;color:#ececf0;font-size:13px;margin-bottom:2px;">${recipe.name}</div>
        <div style="font-size:11px;color:#a0a0ba;">${costText} · ${recipe.workTicks} tick</div>
      `;

      if (canSynth.valid) {
        recipeDiv.addEventListener('click', () => {
          buildingSystem.startSynthesis(buildingIndex, recipe.id);
          pm.refresh({ buildingIndex });
        });
        recipeDiv.addEventListener('mouseenter', () => {
          recipeDiv.style.background = 'rgba(255,255,255,0.1)';
        });
        recipeDiv.addEventListener('mouseleave', () => {
          recipeDiv.style.background = 'rgba(255,255,255,0.05)';
        });
      }
      synthSection.appendChild(recipeDiv);
    }

    // 合成进度
    if (building.synthesisProgress) {
      const sp = building.synthesisProgress;
      const synthProgContainer = document.createElement('div');
      synthProgContainer.style.cssText = 'margin-top:8px;';
      synthProgContainer.innerHTML = `
        <div class="synth-label" style="font-size:11px;color:#f0a040;margin-bottom:4px;font-weight:500;">合成中: ${sp.progress}/${sp.total}</div>
        <div class="progress-bar" style="height:5px;">
          <div class="progress-fill amber synth-progress-fill" style="width:${(sp.progress / sp.total) * 100}%"></div>
        </div>
      `;
      synthSection.appendChild(synthProgContainer);

      const synthFill = synthProgContainer.querySelector('.synth-progress-fill');
      const synthLabel = synthProgContainer.querySelector('.synth-label');
      if (synthFill) {
        progressManager.registerDiscrete(
          synthFill,
          () => {
            const b = buildingSystem.buildings[buildingIndex];
            return (b && b.synthesisProgress) ? b.synthesisProgress.progress : 0;
          },
          () => sp.total,
          {
            labelEl: synthLabel,
            formatLabel: (v) => {
              const b = buildingSystem.buildings[buildingIndex];
              if (!b || !b.synthesisProgress) return '合成完成';
              return `合成中: ${b.synthesisProgress.progress}/${b.synthesisProgress.total}`;
            }
          }
        );
      }
    }

    container.appendChild(synthSection);
  }

  // ===== 升级 =====
  if (config.upgradesTo && building.status === 'active') {
    const upgradeCheck = buildingSystem.canUpgrade(buildingIndex);
    const targetConfig = configRegistry.getBuilding(config.upgradesTo);
    const upgradeSection = section('升级', '⬆️');

    const costText = (targetConfig?.upgradeCost || []).map(c => {
      const r = configRegistry.getResource(c.resourceId);
      return `${r ? r.name : c.resourceId}×${c.amount}`;
    }).join('  ');

    upgradeSection.innerHTML += `
      <div style="font-size:12px;color:#a0a0ba;margin-bottom:8px;">
        目标: <span style="color:#ececf0;">${targetConfig ? targetConfig.name : config.upgradesTo}</span>
      </div>
      <div style="font-size:12px;color:${upgradeCheck.valid ? '#4ecb71' : '#ff6b6b'};margin-bottom:10px;">
        消耗: ${costText}
      </div>
    `;

    const upgradeBtn = actionButton(
      '确认升级',
      upgradeCheck.valid ? 'rgba(78, 203, 113, 0.25)' : 'rgba(255,255,255,0.05)',
      () => {
        if (upgradeCheck.valid) {
          buildingSystem.upgradeBuilding(buildingIndex);
          pm.close();
        }
      }
    );
    if (!upgradeCheck.valid) {
      upgradeBtn.style.cursor = 'default';
      upgradeBtn.style.color = '#666';
    }
    upgradeSection.appendChild(upgradeBtn);
    container.appendChild(upgradeSection);
  }

  // ===== 军事设施：统一进入士兵容量/科技/海军设施训练面板，不占用工人 =====
  if ((config.tags?.includes('barracks') || config.tags?.includes('military') || config.tags?.includes('naval_facility')) && building.status === 'active') {
    const trainSection = section('训练', '⚔️');
    trainSection.appendChild(actionButton('打开军事训练', 'rgba(78, 203, 113, 0.25)', () => pm.push('training_panel', {})));
    container.appendChild(trainSection);
  }

  if (config.id === 'tavern' && building.status === 'active') {
    const tavernSection = section('传奇访客', '🍺');
    const info = document.createElement('div');
    info.style.cssText = 'font-size:12px;color:#a0a0ba;margin-bottom:10px;line-height:1.5;';
    info.textContent = '酒馆每隔数日刷新历史英雄。招募后可将其任命到议会、军团、远征或外交岗位。';
    tavernSection.appendChild(info);
    tavernSection.appendChild(actionButton('打开英雄酒馆', 'rgba(214,168,75,.24)', () => pm.push('tavern_heroes', {})));
    container.appendChild(tavernSection);
  }

  // ===== 移动 =====
  if (building.status === 'active' && config.draggable !== false) {
    const moveBtn = actionButton(
      '↔️ 移动建筑',
      'rgba(91, 141, 239, 0.12)',
      () => {
        const mr = window.__game?.mapRenderer;
        if (mr) {
          pm.close();
          setTimeout(() => mr.startBuildingMove(buildingIndex), 50);
        }
      }
    );
    moveBtn.style.marginTop = '4px';
    container.appendChild(moveBtn);
  }

  // ===== 拆除 =====
  // demolishable === false 的建筑（如仓库）不可拆除
  if (config.demolishable !== false) {
    const demolishBtn = actionButton(
      '🗑️ 拆除建筑',
      'rgba(255, 107, 107, 0.15)',
      async () => {
        if (await pm.confirm('确定拆除此建筑？此操作不可撤销。')) {
          buildingSystem.demolishBuilding(buildingIndex);
          pm.close();
        }
      }
    );
    demolishBtn.style.color = '#ff6b6b';
    demolishBtn.style.marginTop = '4px';
    container.appendChild(demolishBtn);
  }

  body.appendChild(container);
}
