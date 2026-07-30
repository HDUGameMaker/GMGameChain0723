/**
 * quest-panel - 任务面板
 * 显示当前活跃任务及进度
 */
export function renderQuestPanel(data, body, pm) {
  const quest = data.quest;
  body.style.cssText = 'padding:20px 24px;max-height:70vh;overflow-y:auto;';

  if (!quest) {
    body.innerHTML = '<div style="text-align:center;color:#888;padding:40px;">所有新手任务已完成！🎉</div>';
    return;
  }

  const progress = quest.progress || { current: 0, target: 1 };
  const pct = Math.min(100, Math.round((progress.current / progress.target) * 100));
  const complete = progress.current >= progress.target;

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:40px;margin-bottom:8px;">${quest.icon || '📋'}</div>
      <div style="font-size:20px;font-weight:700;color:#ececf0;letter-spacing:-0.01em;">${quest.name}</div>
      <div style="font-size:12px;color:#888;margin-top:2px;">新手任务${quest.id?.split('_').pop() || ''}</div>
    </div>

    <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="font-size:13px;color:#a0a0ba;line-height:1.8;white-space:pre-wrap;">${quest.description}</div>
    </div>

    <div style="background:rgba(91,141,239,0.06);border:1px solid rgba(91,141,239,0.15);border-radius:10px;padding:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:13px;color:#a0a0ba;">进度</span>
        <span style="font-size:14px;font-weight:600;color:${complete ? '#4ecb71' : '#5b8def'};">
          ${progress.current} / ${progress.target} ${complete ? '✓ 完成' : ''}
        </span>
      </div>
      <div style="width:100%;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${complete ? 'linear-gradient(90deg,#4ecb71,#3da85a)' : 'linear-gradient(90deg,#5b8def,#4060c0)'};border-radius:3px;transition:width 0.5s;"></div>
      </div>
    </div>

    ${complete ? `
    <div style="text-align:center;margin-top:14px;">
      <button id="quest-next-btn" style="padding:10px 28px;border-radius:20px;border:1px solid rgba(78,203,113,0.3);background:rgba(78,203,113,0.1);color:#4ecb71;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">
        继续下一个任务 →
      </button>
    </div>` : ''}
  `;

  if (complete) {
    const nextBtn = body.querySelector('#quest-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => pm.close());
    }
  }
}
