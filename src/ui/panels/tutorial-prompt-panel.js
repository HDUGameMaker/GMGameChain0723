/**
 * tutorial-prompt-panel - 新存档的新手教程启用询问
 */
export function renderTutorialPromptPanel(data, body, pm) {
  const questSystem = data?.questSystem || window.__game?.systems?.quest;

  body.style.cssText = 'padding:28px 24px;display:flex;justify-content:center;';

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:16px;width:min(480px,100%);margin:0 auto;';

  const intro = document.createElement('div');
  intro.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  const title = document.createElement('div');
  title.textContent = '是否开启新手教程？';
  title.style.cssText = 'font-size:20px;font-weight:700;color:#ececf0;line-height:1.35;';

  const desc = document.createElement('div');
  desc.textContent = '教程会用任务面板引导基础建设、道路和资源操作。跳过后仍可在设置中重新启动。';
  desc.style.cssText = 'font-size:13px;color:#a0a0ba;line-height:1.8;';

  intro.appendChild(title);
  intro.appendChild(desc);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:4px;';

  const skipBtn = document.createElement('button');
  skipBtn.textContent = '暂时跳过';
  skipBtn.style.cssText = [
    'padding:10px 18px;border-radius:8px;border:1px solid rgba(255,255,255,0.12)',
    'background:rgba(255,255,255,0.06);color:#c8c8d6;font-size:14px;font-weight:600',
    'cursor:pointer;font-family:inherit;min-width:104px;'
  ].join(';');

  const startBtn = document.createElement('button');
  startBtn.textContent = '开启教程';
  startBtn.style.cssText = [
    'padding:10px 20px;border-radius:8px;border:1px solid rgba(91,141,239,0.42)',
    'background:rgba(91,141,239,0.2);color:#7ea4ff;font-size:14px;font-weight:700',
    'cursor:pointer;font-family:inherit;min-width:104px;'
  ].join(';');

  skipBtn.addEventListener('click', () => pm.close());

  startBtn.addEventListener('click', () => {
    if (!questSystem) {
      pm.close();
      return;
    }

    questSystem.enable();
    const quest = questSystem.getActiveQuest();
    pm.close();

    if (quest) {
      setTimeout(() => pm.open('quest_panel', { quest, blocking: true }), 200);
    }
  });

  btnRow.appendChild(skipBtn);
  btnRow.appendChild(startBtn);

  container.appendChild(intro);
  container.appendChild(btnRow);
  body.appendChild(container);
}
