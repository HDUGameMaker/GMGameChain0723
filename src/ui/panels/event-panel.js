/**
 * event-panel - 事件弹窗面板
 * 使用统一设计系统的样式
 */

export function renderEventPanel(data, body, pm) {
  const game = window.__game;
  if (!game) return;

  const evt = data.event;
  if (!evt) return;

  body.style.cssText = 'padding:28px 24px;display:flex;justify-content:center;';

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;width:min(640px,100%);margin:0 auto;';

  // === 事件标题 ===
  const header = document.createElement('div');
  header.className = 'event-panel-header';

  const nameEl = document.createElement('div');
  nameEl.className = 'event-panel-name';
  nameEl.textContent = evt.name;
  header.appendChild(nameEl);

  // 装饰分割线
  const divider = document.createElement('div');
  divider.className = 'event-panel-divider';
  header.appendChild(divider);

  container.appendChild(header);

  // === 事件配图（如果有） ===
  if (evt.image) {
    const img = document.createElement('div');
    img.style.cssText = `
      width:100%; height:120px;
      background: rgba(255,255,255,0.03);
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      color: #555; font-size: 13px;
      margin-bottom: 16px;
      border: 1px solid rgba(255,255,255,0.05);
    `;
    img.textContent = '[事件配图]';
    container.appendChild(img);
  }

  // === 事件描述 ===
  const desc = document.createElement('div');
  desc.className = 'event-description';
  desc.textContent = evt.description;
  container.appendChild(desc);

  // === 选项按钮 ===
  const optionsDiv = document.createElement('div');
  optionsDiv.style.cssText = 'display:flex;flex-direction:column;';

  for (const option of (evt.options || [])) {
    const canAfford = game.systems.event.canAffordOption(option.effects);
    const btn = document.createElement('button');
    btn.className = 'event-option-btn';
    btn.textContent = option.text;

    if (!canAfford) {
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
      btn.title = '资源不足，无法选择';
    }

    btn.addEventListener('click', () => {
      if (!canAfford) return;
      // 执行选项效果
      const hasTrigger = game.systems.event.executeOptionEffects(option.effects);
      if (!hasTrigger) {
        pm.close();
      }
    });
    optionsDiv.appendChild(btn);
  }

  container.appendChild(optionsDiv);
  body.appendChild(container);
}
