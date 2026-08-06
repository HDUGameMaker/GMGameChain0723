export function renderFeatureUnlockPanel(data, body, pm) {
  body.innerHTML = '';
  body.style.cssText = 'padding:34px;min-width:min(520px,80vw);text-align:center;background:radial-gradient(circle at 50% 0,#35304b,#171923 65%);';
  body.innerHTML = `<div style="font-size:42px;margin-bottom:12px">${data.icon || '✨'}</div><div style="font-size:12px;letter-spacing:4px;color:#d5b873">新系统解锁</div><h2 style="margin:10px 0;color:#fff">${data.title || ''}</h2><p style="color:#b9bdcb;line-height:1.7">${data.description || ''}</p>`;
  const button = document.createElement('button');
  button.textContent = '知道了';
  button.style.cssText = 'margin-top:18px;padding:10px 30px;border:1px solid #b8914d;border-radius:8px;background:#4b3a20;color:#ffe6ad;cursor:pointer;';
  button.addEventListener('click', () => pm.close());
  body.appendChild(button);
}

const ARRIVAL_LINES = [
  '你度过了再不过平常的一日，月色正暗。',
  '突然，银白色的丝线冲入了你的眼眶。那是月色，也是一位宛如月一般的少女。',
  '还未等你从惊讶中缓过来，少女先开口了。',
  '“你是这里的统治者吗？”',
  '“很远的东方，有不属于这个世界的黑暗造物。”',
  '“我来到这里，是为了消灭它。仅凭我做不到，所以……我需要与你们合作。”',
  '少女停顿片刻，安静地望向遥远的东方。',
  '“即使这件事，可能需要花上数千年。”'
];

export function renderHestiaArrivalPanel(data, body, pm) {
  data.index ||= 0;
  body.innerHTML = '';
  body.style.cssText = 'padding:0;width:min(980px,88vw);height:min(620px,78vh);overflow:hidden;';
  const current = ARRIVAL_LINES[Math.min(data.index, ARRIVAL_LINES.length - 1)];
  body.innerHTML = `<div style="display:grid;grid-template-columns:minmax(280px,42%) 1fr;height:100%;background:#151821"><div style="display:flex;align-items:flex-end;justify-content:center;overflow:hidden;background:radial-gradient(circle at 50% 35%,#28394b,#0d1118 66%)"><img src="assets/hero-portraits/Hestia.png" style="height:92%;width:auto;image-rendering:pixelated;image-rendering:crisp-edges" alt="赫斯提亚"></div><div style="display:flex;flex-direction:column;justify-content:center;padding:42px"><div style="color:#91bcd1;font-size:13px;margin-bottom:14px">无法跳过 · 特殊事件</div><div style="padding:18px 22px;border-radius:18px 18px 18px 4px;background:#303746;color:#f2f4f8;font-size:17px;line-height:1.8">${current}</div><button data-next style="align-self:flex-end;margin-top:24px;padding:10px 24px;border:1px solid #9a7d49;border-radius:8px;background:#49391f;color:#ffe3aa;cursor:pointer">${data.index >= ARRIVAL_LINES.length - 1 ? '接受合作' : '继续'}</button></div></div>`;
  body.querySelector('[data-next]').addEventListener('click', () => {
    if (data.index < ARRIVAL_LINES.length - 1) { data.index += 1; pm.refresh(data); return; }
    window.__game?.systems?.hero?.completeHestiaArrival?.();
    // 先入队再强制关闭当前剧情面板：关闭时队列排空会接着展示英雄系统解锁
    pm.open('feature_unlock', { blocking: true, icon: '🍺', title: '英雄系统', description: '主界面的英雄按钮已经解锁。你可以与赫斯提亚对话、查看能力，并在获得奢侈品后赠送礼物。\n\n🏆 胜利目标已更新：击败？？？' });
    pm.close({ force: true });
  });
}
