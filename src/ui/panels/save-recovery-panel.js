const SOURCE_LABELS = {
  primary: '主存档',
  rollback: '回滚存档',
  emergency: '紧急备份',
  import: '旧版存档'
};

export function renderSaveRecoveryPanel(data = {}, body, popupManager) {
  body.style.cssText = 'padding:24px;display:flex;justify-content:center;';
  const panel = document.createElement('section');
  panel.dataset.testid = 'save-recovery-panel';
  panel.style.cssText = 'width:min(560px,100%);display:flex;flex-direction:column;gap:14px;color:#e6e8f0;';

  const heading = document.createElement('h3');
  heading.style.cssText = 'margin:0;font-size:19px;color:#f3d58a;';
  heading.textContent = data.source
    ? `存档恢复完成：${SOURCE_LABELS[data.source] || data.source}`
    : '没有可安全恢复的存档';
  panel.appendChild(heading);

  const source = document.createElement('code');
  source.dataset.testid = 'save-recovery-source';
  source.style.cssText = 'font-size:13px;color:#9fc4ff;';
  source.textContent = data.source || 'none';
  panel.appendChild(source);

  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  if (warnings.length > 0) {
    const explanation = document.createElement('p');
    explanation.style.cssText = 'margin:0;color:#d9b8a2;line-height:1.6;';
    explanation.textContent = '以下候选存档未通过完整性检查，游戏已跳过它们：';
    panel.appendChild(explanation);
    const list = document.createElement('ul');
    list.style.cssText = 'margin:0;padding-left:22px;line-height:1.7;color:#f0c1b5;';
    for (const warning of warnings) {
      const item = document.createElement('li');
      item.dataset.testid = 'save-recovery-warning';
      item.textContent = warning;
      list.appendChild(item);
    }
    panel.appendChild(list);
  }

  const note = document.createElement('p');
  note.style.cssText = 'margin:0;color:#aeb4c4;font-size:13px;line-height:1.6;';
  note.textContent = '恢复提示不会暂停或延迟游戏初始化。';
  panel.appendChild(note);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '继续游戏';
  close.style.cssText = 'align-self:flex-end;padding:9px 18px;border:1px solid rgba(120,160,240,.4);border-radius:8px;background:rgba(80,120,210,.22);color:#edf3ff;cursor:pointer;';
  close.addEventListener('click', () => popupManager.close());
  panel.appendChild(close);
  body.appendChild(panel);
}
