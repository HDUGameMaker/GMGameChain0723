import { store } from '../../core/Store.js';

const EFFECT_NAMES = {
  army_speed: '军队机动', regional_production: '区域增产', instant_resource: '紧急征收',
  research_speed: '科技研究', civic_speed: '人文发展', repair: '紧急修缮',
  enemy_naval_debuff: '海上压制', enemy_power_debuff: '敌军削弱',
  freeze_enemy_countdown: '延缓推进', defense_buff: '防御加固', food_consume: '配给制度',
  trade_value: '贸易增益', relation_gain: '外交行动', satisfaction: '民生安抚',
  restore_units: '老兵归队', naval_vision: '海岸侦察', anti_siege: '反攻城',
  enemy_supply: '断绝补给', build_speed: '公共工程', trade_route: '商队收益',
  morale: '士气鼓舞', reveal_map: '地形勘察'
};

export function renderStrategyCardsPanel(_data, body, pm) {
  const system = window.__game?.systems?.strategy;
  if (!system) {
    body.innerHTML = '<div style="padding:36px;color:#8d93a7">策略系统尚未加载。</div>';
    return;
  }
  body.style.cssText = 'padding:20px 24px;max-height:72vh;overflow:auto;';
  const active = system.getActiveEffects();
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px">
      <div><b style="font-size:20px;color:#f2e7c5">📜 历史策略</b><div style="font-size:12px;color:#9298aa;margin-top:5px">通过任务、事件、英雄与时代星获得。卡牌使用后消耗，并按规则进入冷却。</div></div>
      <div style="font-size:12px;color:#c7b37a">生效中 ${active.length}</div>
    </div>`;

  if (active.length) {
    const strip = document.createElement('div');
    strip.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px;';
    for (const effect of active) {
      const strategy = system.getStrategy(effect.strategyId);
      const chip = document.createElement('span');
      chip.style.cssText = 'padding:6px 9px;border-radius:999px;background:rgba(73,135,99,.18);border:1px solid rgba(92,182,123,.32);font-size:11px;color:#8ee0a8;';
      chip.textContent = `${strategy?.name || effect.strategyId} · ${effect.remainingTicks ? `${effect.remainingTicks}刻` : `${effect.remainingDays}天`}`;
      strip.appendChild(chip);
    }
    body.appendChild(strip);
  }

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:10px;';
  for (const strategy of system.getStrategies()) {
    const count = system.getCardCount(strategy.id);
    const cooldown = (store.getState('strategyCooldowns') || {})[strategy.id] || 0;
    const card = document.createElement('div');
    card.style.cssText = `padding:12px;border-radius:9px;border:1px solid ${count ? 'rgba(204,177,104,.36)' : 'rgba(255,255,255,.08)'};background:${count ? 'rgba(123,91,31,.10)' : 'rgba(255,255,255,.025)'};`;
    card.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center"><img src="${strategy.icon}" alt="" style="width:38px;height:38px;border-radius:7px;background:#24283a"><div><b style="color:#ece8dd">${strategy.name}</b><div style="font-size:10px;color:#b9a86c">${EFFECT_NAMES[strategy.effectType] || strategy.effectType} · ${strategy.rarity}</div></div><strong style="margin-left:auto;color:${count ? '#f4d27b' : '#686d7d'}">×${count}</strong></div>
      <div style="font-size:11px;line-height:1.5;color:#9ea5b7;margin-top:8px">${strategy.description}</div>
      <div style="font-size:10px;color:#758098;margin-top:7px">${cooldown ? `冷却还剩 ${cooldown} 天` : '可以执行'}</div>`;
    const button = document.createElement('button');
    const availability = system.canPlay(strategy.id);
    button.textContent = availability.ok ? '执行策略' : availability.reason;
    button.disabled = !availability.ok;
    button.style.cssText = `width:100%;margin-top:8px;padding:7px;border:0;border-radius:6px;background:${availability.ok ? '#775b26' : '#343747'};color:${availability.ok ? '#ffe5a0' : '#777d8e'};cursor:${availability.ok ? 'pointer' : 'default'};`;
    button.addEventListener('click', () => {
      const result = system.play(strategy.id);
      if (!result.ok) pm.alert(result.reason);
      renderStrategyCardsPanel({}, body, pm);
    });
    card.appendChild(button);
    grid.appendChild(card);
  }
  body.appendChild(grid);
}
