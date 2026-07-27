/**
 * tamed-pool-panel.js - 驯化池管理面板
 * 查看并部署已驯化的生物
 */

function section(label, icon) {
  const el = document.createElement('div');
  el.style.cssText = 'padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.06);margin-bottom:10px;';
  if (label) {
    const title = document.createElement('div');
    title.style.cssText = 'font-size:13px;font-weight:600;color:#ececf0;margin-bottom:10px;display:flex;align-items:center;gap:6px;';
    title.textContent = `${icon || ''} ${label}`;
    el.appendChild(title);
  }
  return el;
}

function creatureCard(creature, combatSystem, pm) {
  const card = document.createElement('div');
  card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;background:rgba(204,136,204,0.08);border-radius:10px;border:1px solid rgba(204,136,204,0.15);margin-bottom:8px;';

  // 图标
  const iconEl = document.createElement('span');
  iconEl.textContent = creature.icon || '🐾';
  iconEl.style.cssText = 'font-size:28px;flex-shrink:0;';
  card.appendChild(iconEl);

  // 信息
  const info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0;';
  info.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#ececf0;">${creature.name}</div>
    <div style="font-size:11px;color:#a0a0ba;margin-top:2px;">
      ❤️ HP ${creature.hp}/${creature.maxHp} · ⚔️ ATK ${creature.attack} · 🎯 射程 ${creature.attackRange}
    </div>
  `;
  card.appendChild(info);

  // 部署按钮
  const deployBtn = document.createElement('button');
  deployBtn.textContent = '部署';
  deployBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:8px;background:rgba(204,136,204,0.3);color:#fff;cursor:pointer;font-size:13px;font-weight:600;flex-shrink:0;transition:background 0.2s;';
  deployBtn.addEventListener('mouseenter', () => { deployBtn.style.background = 'rgba(204,136,204,0.5)'; });
  deployBtn.addEventListener('mouseleave', () => { deployBtn.style.background = 'rgba(204,136,204,0.3)'; });
  deployBtn.addEventListener('click', () => {
    combatSystem.enterDeployTamedMode(creature.id);
    pm.close();
  });
  card.appendChild(deployBtn);

  return card;
}

export function renderTamedPoolPanel(data, body, pm) {
  const combatSystem = data.combatSystem;
  if (!combatSystem) {
    body.innerHTML = '<div style="padding:20px;text-align:center;color:#a0a0ba;">战斗系统未初始化</div>';
    return;
  }

  body.innerHTML = '';

  const pool = combatSystem.getTamedPool();

  // 标题统计
  const header = document.createElement('div');
  header.style.cssText = 'text-align:center;margin-bottom:16px;';
  header.innerHTML = `
    <div style="font-size:15px;font-weight:600;color:#ececf0;">🐾 驯化池 · ${pool.length} 只生物</div>
    <div style="font-size:11px;color:#a0a0ba;margin-top:4px;">部署在营地（火把照明范围）内，为你而战</div>
  `;
  body.appendChild(header);

  if (pool.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:30px;color:#6a6a8a;';
    empty.innerHTML = '📭<br><span style="font-size:13px;">暂无驯化生物</span><br><span style="font-size:11px;color:#4a4a6a;">击杀敌人时有概率驯服</span>';
    body.appendChild(empty);
    return;
  }

  const listSection = section('可部署单位', '📋');
  for (const creature of pool) {
    listSection.appendChild(creatureCard(creature, combatSystem, pm));
  }
  body.appendChild(listSection);

  // 提示
  const tip = document.createElement('div');
  tip.style.cssText = 'text-align:center;font-size:11px;color:#6a6a8a;margin-top:8px;';
  tip.textContent = '点击「部署」后在地图上选择营地范围内的空地放置';
  body.appendChild(tip);
}
