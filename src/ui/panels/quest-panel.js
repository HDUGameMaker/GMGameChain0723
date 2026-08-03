const EFFECT_NAMES = {
  colonyCompliancePerDay: '殖民地顺从度/日', colonyUnrestPerDay: '殖民地动荡/日',
  colonyIncomeMul: '殖民地产出', tradeValueMul: '贸易价值', diplomacyRelationMul: '外交关系',
  combatPowerMul: '军团战力', heroAssignmentSlots: '英雄任命席位', researchMul: '科研效率',
  cultureMul: '文化效率', resourceEfficiencyMul: '资源效率', productionMul: '生产效率'
};

const formatEffect = (key, value) => {
  if (key.endsWith('Mul')) return `${EFFECT_NAMES[key] || key} ${value >= 1 ? '+' : ''}${Math.round((value - 1) * 100)}%`;
  return `${EFFECT_NAMES[key] || key} ${value >= 0 ? '+' : ''}${value}`;
};

export function renderQuestPanel(data, body, pm) {
  const quest = data.quest;
  body.style.cssText = 'padding:20px 24px;max-height:72vh;overflow-y:auto;';
  if (!quest) {
    body.innerHTML = '<div style="text-align:center;color:#9aa0a8;padding:38px;">主线任务与新手任务均已完成。你的选择已经成为这个世界的历史。</div>';
    return;
  }

  const progress = quest.progress || { current: 0, target: 1 };
  const pct = Math.min(100, Math.round((progress.current / Math.max(1, progress.target)) * 100));
  const isStrategic = quest.category === 'strategic';
  const consequences = quest.consequences || [];
  const pendingConsequences = quest.pendingConsequences || [];
  body.innerHTML = `
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:16px;">
      <div style="font-size:38px;filter:drop-shadow(0 3px 8px rgba(0,0,0,.35));">${quest.icon || '📜'}</div>
      <div>
        <div style="font-size:11px;color:#c7a968;letter-spacing:.12em;text-transform:uppercase;">${isStrategic ? quest.chapterName : '新手任务'}</div>
        <div style="font-size:20px;font-weight:750;color:#f0eadf;">${quest.name}</div>
      </div>
    </div>
    <div style="background:linear-gradient(135deg,rgba(199,169,104,.10),rgba(80,96,128,.08));border:1px solid rgba(199,169,104,.2);border-radius:12px;padding:14px;margin-bottom:14px;">
      ${quest.chapterDescription ? `<div style="font-size:12px;color:#9fa7b3;margin-bottom:8px;">${quest.chapterDescription}</div>` : ''}
      <div style="font-size:13px;color:#d4d7dc;line-height:1.75;white-space:pre-wrap;">${quest.description || ''}</div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:#aeb4be;margin-bottom:6px;"><span>${quest.awaitingOutcome ? '等待你的决定' : '当前进度'}</span><b style="color:#d5bd7d;">${progress.current} / ${progress.target}</b></div>
    <div style="height:7px;background:rgba(255,255,255,.07);border-radius:5px;overflow:hidden;margin-bottom:16px;"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7f9bd7,#d5bd7d);transition:width .35s;"></div></div>
    ${quest.awaitingOutcome ? `<div style="font-size:12px;color:#d5bd7d;margin-bottom:9px;">这一决定会永久进入存档，并改变后续系统数值：</div><div id="quest-outcomes" style="display:grid;gap:9px;">${quest.outcomes.map(outcome => `
      <button data-outcome="${outcome.id}" style="text-align:left;padding:12px;border-radius:10px;border:1px solid rgba(213,189,125,.28);background:rgba(213,189,125,.07);color:#eee;cursor:pointer;font-family:inherit;">
        <b style="display:block;color:#f1dc9f;margin-bottom:4px;">${outcome.name}</b><span style="display:block;font-size:12px;color:#b7bdc6;line-height:1.55;">${outcome.description}</span><span style="display:block;font-size:11px;color:#82c9a2;margin-top:6px;">${Object.entries(outcome.effects || {}).map(([key, value]) => formatEffect(key, value)).join(' · ')}</span>
      </button>`).join('')}</div>` : ''}
    ${consequences.length ? `<div style="margin-top:18px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px;"><div style="font-size:11px;color:#8f98a6;margin-bottom:7px;">已经形成的长期后果</div>${consequences.map(item => `<div style="font-size:12px;color:#c7ccd3;margin:5px 0;">◆ ${item.name} <span style="color:#739c87;">${Object.entries(item.effects || {}).map(([key, value]) => formatEffect(key, value)).join(' · ')}</span></div>`).join('')}</div>` : ''}
    ${pendingConsequences.length ? `<div style="margin-top:12px;padding:10px;border-radius:8px;background:rgba(93,126,168,.09);border:1px solid rgba(93,126,168,.2)"><div style="font-size:11px;color:#9eb8d7;margin-bottom:5px;">等待兑现的后果</div>${pendingConsequences.map(item => `<div style="font-size:12px;color:#c7d1df;margin-top:4px;">◷ 第 ${item.dueDay} 天：${item.name}</div>`).join('')}</div>` : ''}
  `;

  for (const button of body.querySelectorAll('[data-outcome]')) {
    button.addEventListener('click', () => {
      const system = window.__game?.systems?.quest;
      const result = system?.chooseStrategicOutcome(button.dataset.outcome);
      if (!result?.ok) return;
      pm.close();
      const next = system.getActiveQuest();
      if (next) setTimeout(() => pm.open('quest_panel', { quest: next }), 120);
    });
  }
}
