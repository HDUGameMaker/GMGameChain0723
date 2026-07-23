/**
 * settings-panel - 设置面板
 * 使用统一设计系统
 */
import { SaveManager } from '../../core/SaveManager.js';

export function renderSettingsPanel(data, body, pm) {
  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  // ===== 存档信息 =====
  const saveSection = document.createElement('div');
  saveSection.style.cssText = 'padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.05);';
  saveSection.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#ececf0;margin-bottom:8px;letter-spacing:0.01em;">💾 存档状态</div>
    <div style="font-size:13px;color:#4ecb71;font-weight:500;">正常运行中</div>
    <div style="font-size:12px;color:#888;margin-top:4px;">每个时段结束后自动保存</div>
  `;
  container.appendChild(saveSection);

  // ===== 操作说明 =====
  const helpSection = document.createElement('div');
  helpSection.style.cssText = 'padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.05);';
  helpSection.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#ececf0;margin-bottom:8px;letter-spacing:0.01em;">📖 快捷操作</div>
    <div style="font-size:12px;color:#a0a0ba;line-height:1.8;">
      <div>🏗️ <b style="color:#ececf0;">建造</b> — 选择建筑后点击地图放置</div>
      <div>⏩ <b style="color:#ececf0;">加速</b> — 切换 1× / 2× / 4× 速度</div>
      <div>⏸ <b style="color:#ececf0;">暂停</b> — 暂停/恢复时间流逝</div>
      <div>🔍 <b style="color:#ececf0;">探险</b> — 点击地图上的探险入口</div>
    </div>
  `;
  container.appendChild(helpSection);

  // ===== 重置存档 =====
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '🗑️ 重置全部存档';
  resetBtn.style.cssText = `
    width:100%; padding:12px 16px; border:1px solid rgba(255,107,107,0.2);
    border-radius:10px; background:rgba(255,107,107,0.1);
    color:#ff6b6b; font-size:14px; font-weight:500; cursor:pointer;
    font-family:inherit; transition:background 0.2s;
  `;
  resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'rgba(255,107,107,0.2)'; });
  resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'rgba(255,107,107,0.1)'; });
  resetBtn.addEventListener('click', async () => {
    if (confirm('确定要重置所有进度吗？此操作不可撤销。')) {
      const game = window.__game;
      if (game) game._resetting = true;
      await SaveManager.reset();
      location.reload();
    }
  });
  container.appendChild(resetBtn);

  // ===== 关闭 =====
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  closeBtn.style.cssText = 'width:100%;padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.06);color:#ececf0;cursor:pointer;font-size:14px;font-weight:500;font-family:inherit;transition:background 0.2s;';
  closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = 'rgba(255,255,255,0.12)'; });
  closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'rgba(255,255,255,0.06)'; });
  closeBtn.addEventListener('click', () => pm.close());
  container.appendChild(closeBtn);

  body.appendChild(container);
}
