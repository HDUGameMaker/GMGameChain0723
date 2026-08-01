/**
 * expedition-detail-panel - 探险详情面板
 * 使用统一设计系统
 */
import { configRegistry } from '../../core/ConfigRegistry.js';
import { progressManager } from '../../utils/ProgressManager.js';

export function renderExpeditionDetailPanel(data, body, pm) {
  const game = window.__game;
  if (!game) return;

  const expeditionId = data?.expeditionId || null;
  const expedition = game.systems.expedition.getCurrentExpedition(expeditionId);
  if (!expedition) {
    body.innerHTML = '<p style="color:#888;text-align:center;padding:24px;font-size:14px;">当前没有进行中的探险</p>';
    return;
  }

  const expSystem = game.systems.expedition;
  const ticksPerPeriod = expSystem.getTicksPerPeriod ? expSystem.getTicksPerPeriod() : 3;
  const totalPeriods = expedition.regions.length;
  const totalTicks = totalPeriods * ticksPerPeriod;

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

  // ===== 进度卡片 =====
  const regionNames = expedition.regions.map(rId => {
    const r = configRegistry.getRegion(rId);
    return r ? r.name : rId;
  });

  const completedTicks = expedition.currentPeriodIndex * ticksPerPeriod + (expedition.ticksInCurrentPeriod || 0);
  const overallPct = Math.round((completedTicks / totalTicks) * 100);
  const periodTickPct = Math.round(((expedition.ticksInCurrentPeriod || 0) / ticksPerPeriod) * 100);

  const progressSection = document.createElement('div');
  progressSection.style.cssText = 'padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.05);';
  progressSection.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#ececf0;margin-bottom:10px;letter-spacing:0.01em;">🔍 探险进度</div>
    <div style="font-size:13px;color:#a0a0ba;margin-bottom:4px;">路线: <span style="color:#ececf0;">${regionNames.join(' → ')}</span></div>
    <div style="font-size:13px;color:#4ecb71;margin-bottom:10px;font-weight:500;">当前: 第 ${expedition.currentPeriodIndex + 1}/${totalPeriods} 阶段 · 已循环 ${expedition.cyclesCompleted || 0} 次</div>
    <div class="panel-progress-section" style="margin-bottom:8px;">
      <div class="panel-progress-label">总进度 <span class="overall-pct-label">${overallPct}%</span></div>
      <div class="progress-bar" style="height:7px;">
        <div class="progress-fill green overall-progress-fill" style="width:${overallPct}%"></div>
      </div>
    </div>
    <div class="panel-progress-section">
      <div class="panel-progress-label">当前阶段 <span class="period-pct-label">${periodTickPct}%</span></div>
      <div class="progress-bar" style="height:5px;">
        <div class="progress-fill blue period-tick-fill" style="width:${periodTickPct}%"></div>
      </div>
    </div>
  `;
  container.appendChild(progressSection);

  // 注册进度条
  const overallFill = progressSection.querySelector('.overall-progress-fill');
  const periodTickFill = progressSection.querySelector('.period-tick-fill');
  const overallPctLabel = progressSection.querySelector('.overall-pct-label');
  const periodPctLabel = progressSection.querySelector('.period-pct-label');

  if (overallFill) {
    progressManager.registerDiscrete(overallFill,
      () => {
        const exp = expSystem.getCurrentExpedition(expedition.id);
        return (exp && exp.status === 'active') ? exp.currentPeriodIndex * ticksPerPeriod + (exp.ticksInCurrentPeriod || 0) : 0;
      },
      () => totalTicks,
      { labelEl: overallPctLabel, formatLabel: (v) => `${Math.round(v * 100)}%` }
    );
  }
  if (periodTickFill) {
    progressManager.registerDiscrete(periodTickFill,
      () => {
        const exp = expSystem.getCurrentExpedition(expedition.id);
        return (exp && exp.status === 'active') ? (exp.ticksInCurrentPeriod || 0) : 0;
      },
      () => ticksPerPeriod,
      { labelEl: periodPctLabel, formatLabel: (v) => `${Math.round(v * 100)}%` }
    );
  }

  // ===== 已采集资源 =====
  const resourceSection = document.createElement('div');
  resourceSection.style.cssText = 'padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.05);';

  const poolTotal = Object.values(expedition.resourcePool).reduce((s, v) => s + v, 0);
  const resourceEntries = Object.entries(expedition.resourcePool);
  const resourceListHTML = resourceEntries.length > 0
    ? resourceEntries.map(([id, amt]) => {
        const cfg = configRegistry.getResource(id);
        return `<span>${cfg ? cfg.name : id}: <b style="color:#4ecb71">${amt}</b></span>`;
      }).join('<br>')
    : '<span style="color:#6a6a82;">暂无</span>';

  resourceSection.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#ececf0;margin-bottom:8px;letter-spacing:0.01em;">📦 已采集资源</div>
    <div style="font-size:13px;line-height:1.8;color:#a0a0ba;">${resourceListHTML}</div>
    <div style="font-size:12px;color:#888;margin-top:8px;">背包容量: ${poolTotal} / ${expedition.resourceCapacity}</div>
  `;
  container.appendChild(resourceSection);

  // ===== 丢弃信息 =====
  if (Object.keys(expedition.totalDiscarded).length > 0) {
    const discardSection = document.createElement('div');
    discardSection.style.cssText = 'padding:12px 14px;background:rgba(255,107,107,0.08);border-radius:10px;border:1px solid rgba(255,107,107,0.15);';
    discardSection.innerHTML = `
      <div style="font-size:12px;color:#ff6b6b;font-weight:500;">
        ⚠ 因容量不足损失: ${Object.entries(expedition.totalDiscarded).map(([id, amt]) => {
          const cfg = configRegistry.getResource(id);
          return `${cfg ? cfg.name : id} ×${amt}`;
        }).join(', ')}
      </div>
    `;
    container.appendChild(discardSection);
  }

  // ===== 操作按钮 =====
  const actionRow = document.createElement('div');
  actionRow.style.cssText = 'display:flex;gap:8px;';

  const recallBtn = document.createElement('button');
  recallBtn.textContent = '召回队伍';
  recallBtn.style.cssText = 'flex:1;padding:10px;border:1px solid rgba(255,107,107,0.25);border-radius:10px;background:rgba(255,107,107,0.12);color:#ff9a9a;cursor:pointer;font-size:14px;font-weight:500;font-family:inherit;transition:background 0.2s;';
  recallBtn.addEventListener('mouseenter', () => { recallBtn.style.background = 'rgba(255,107,107,0.2)'; });
  recallBtn.addEventListener('mouseleave', () => { recallBtn.style.background = 'rgba(255,107,107,0.12)'; });
  recallBtn.addEventListener('click', () => {
    const ok = expSystem.cancelExpedition(expedition.id);
    if (ok) pm.close();
  });
  actionRow.appendChild(recallBtn);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  closeBtn.style.cssText = 'flex:1;padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.06);color:#ececf0;cursor:pointer;font-size:14px;font-weight:500;font-family:inherit;transition:background 0.2s;';
  closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = 'rgba(255,255,255,0.12)'; });
  closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'rgba(255,255,255,0.06)'; });
  closeBtn.addEventListener('click', () => pm.close());
  actionRow.appendChild(closeBtn);
  container.appendChild(actionRow);

  body.appendChild(container);
}
