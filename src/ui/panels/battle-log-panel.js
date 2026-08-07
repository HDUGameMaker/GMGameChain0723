/**
 * battle-log-panel.js - 战报面板
 * 列出最近战斗(自动/手动/敌军攻击),点击条目展开回合明细。
 * 类似群星:自动战斗无需确认,战斗结果可随时回看。
 */
import { eventBus } from '../../core/EventBus.js';

const TYPE_NAMES = {
  player_army: '军团',
  army: '军团',
  enemy_cell: '敌军',
  garrison: '城邦驻军',
  combat_enemy: '野怪',
  ruin_guard: '遗迹守卫',
  city_state: '城邦'
};
const RESULT_BADGES = {
  victory: ['胜利', '#4ecb71'],
  defeat: ['战败', '#ef8b8b'],
  draw: ['平局', '#d6a84b']
};
const SIDE_NAMES = { attacker: '进攻方', defender: '防守方' };

function sideName(side) { return SIDE_NAMES[side] || side; }

function entryTitle(record) {
  const a = record.attacker?.name || '未知';
  const d = record.defender?.name || '未知';
  return `${a} ⚔ ${d}`;
}

function entrySub(record) {
  const parts = [];
  if (record.attacker) parts.push(TYPE_NAMES[record.attacker.type] || record.attacker.type || '');
  if (record.initiator === 'enemy') parts.push('敌军发起');
  if (record.auto) parts.push('自动');
  else parts.push('手动');
  if (Number.isFinite(record.distance)) parts.push(`距离 ${record.distance}`);
  if (record.firstStrike) parts.push(`先手 ${sideName(record.firstStrike)}`);
  return parts.filter(Boolean).join(' · ');
}

function renderDetail(record) {
  const lines = [];
  for (const turn of record.turns || []) {
    lines.push(`<div style="font-size:11px;color:#a0a0ba;margin-top:3px">　${sideName(turn.side)} 造成 ${Math.round(turn.damage)} 伤害${turn.bonusStrike ? ' <span style="color:#d6a84b">· 连击</span>' : ''}${Number.isFinite(turn.hpAfter) ? `　剩余 HP ${Math.round(turn.hpAfter)}` : ''}</div>`);
  }
  const cas = record.casualties;
  const casualties = cas && (cas.attacker > 0 || cas.defender > 0)
    ? `<div style="font-size:11px;color:#ef8b8b;margin-top:5px">　伤亡:进攻方 ${cas.attacker} · 防守方 ${cas.defender}</div>`
    : '';
  const rewards = (record.rewards?.length > 0)
    ? `<div style="font-size:11px;color:#64c987;margin-top:5px">　战利品:${record.rewards.join('、')}</div>`
    : '';
  const luxury = record.luxuryDrop
    ? `<div style="font-size:11px;color:#d6a84b;margin-top:3px">　掉落奢侈品:${record.luxuryDrop}</div>`
    : '';
  const hpRemaining = Number.isFinite(record.hpRemaining)
    ? `<div style="font-size:11px;color:#a0a0ba;margin-top:3px">　战后军团生命 ${Math.round(record.hpRemaining)}</div>`
    : '';
  if (!lines.length && !casualties && !rewards && !luxury && !hpRemaining) return '<div style="font-size:11px;color:#808098;margin-top:5px">　无详细回合记录</div>';
  return lines.join('') + casualties + rewards + luxury + hpRemaining;
}

export function renderBattleLogPanel(data, body, pm) {
  const system = data?.battleLog || window.__game?.systems?.battleLog;
  if (!system) {
    body.innerHTML = '<div style="padding:40px;color:#808098">战报系统尚未加载。</div>';
    return;
  }
  body.style.cssText = 'padding:20px 24px;max-height:72vh;overflow:auto;';

  const render = () => {
    const records = system.getRecords();
    const header = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div><b style="font-size:19px;color:#ececf0">📖 战报</b><div style="font-size:11px;color:#808098;margin-top:3px">自动战斗无需确认,战斗结果在此回看 · 最近 ${records.length} 条</div></div></div>`;
    body.innerHTML = header;
    if (!records.length) {
      body.insertAdjacentHTML('beforeend', '<div style="color:#808098;font-size:12px;padding:30px 0;text-align:center">暂无战斗记录。派遣军团在地图上与敌人交战后,这里会留下战报。</div>');
      return;
    }
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index];
      const [resultText, resultColor] = RESULT_BADGES[record.result] || ['未知', '#808098'];
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:7px;border-radius:8px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);overflow:hidden;';
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;';
      head.innerHTML = `<div style="display:flex;flex-direction:column;gap:2px;min-width:0"><div style="font-size:13px;color:#ececf0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${entryTitle(record)}</div><div style="font-size:10px;color:#808098">${record.timeLabel} · ${entrySub(record)}</div></div><div style="display:flex;align-items:center;gap:8px;flex-shrink:0"><span style="font-size:11px;font-weight:700;color:${resultColor}">${resultText}</span><span style="font-size:10px;color:#4a4a66">▾</span></div>`;
      const detail = document.createElement('div');
      detail.style.display = 'none';
      detail.style.cssText = 'padding:2px 12px 10px;border-top:1px solid rgba(255,255,255,.05);';
      detail.innerHTML = renderDetail(record);
      head.addEventListener('click', () => {
        detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
      });
      row.appendChild(head);
      row.appendChild(detail);
      body.appendChild(row);
    }
  };

  eventBus.on('battleLogUpdated', render);
  body._popupCleanup = () => eventBus.off('battleLogUpdated', render);
  render();
}
