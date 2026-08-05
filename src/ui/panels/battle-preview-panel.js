const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const hpPercent = model => Math.max(0, Math.min(100, (Number(model.hp) || 0) / Math.max(1, Number(model.maxHp) || 1) * 100));

function unitCard(model, side) {
  const art = model.portrait || model.heroPortrait || model.heroIcon || model.icon || '';
  const percent = hpPercent(model);
  return `<div class="battle-unit battle-unit--${side}">
    <div class="battle-art"><div class="battle-particles"></div>${art ? `<img src="${safe(art)}" alt="">` : `<span>${side === 'enemy' ? '⚔️' : '🛡️'}</span>`}</div>
    <b class="battle-name">${model.isBuilding ? '🏛️ ' : ''}${safe(model.name || (side === 'enemy' ? '敌方军队' : '玩家军队'))}</b>
    <div class="battle-health"><div class="battle-health-track"><div class="battle-health-ghost" style="width:${percent}%"></div><div class="battle-health-current" style="width:${percent}%"></div><div class="battle-damage-label"></div></div><strong><i data-hp>${model.hp}</i> / ${model.maxHp}</strong></div>
    <div class="battle-stats">${model.isBuilding ? '<span>建筑不会反击</span>' : `<span>⚔ ${model.attack}</span><span>👟 ${model.speed}</span><span>🏹 ${model.attackRange}</span><span>🔷 CP ${model.cp || 1}</span>`}</div>
  </div>`;
}

function burstParticles(unitEl) {
  const layer = unitEl.querySelector('.battle-particles');
  for (let index = 0; index < 22; index += 1) {
    const particle = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const distance = 55 + Math.random() * 120;
    const size = 4 + Math.random() * 8;
    particle.style.cssText = `position:absolute;left:50%;top:48%;width:${size}px;height:${size}px;border-radius:${Math.random() > .45 ? '50%' : '2px'};background:${Math.random() > .35 ? '#f04444' : '#9b1018'};box-shadow:0 0 8px #ff3535;z-index:8;pointer-events:none;`;
    layer.appendChild(particle);
    particle.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px),calc(-50% + ${Math.sin(angle) * distance + 55}px)) scale(.2)`, opacity: 0 }
    ], { duration: 420 + Math.random() * 300, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' }).finished.finally(() => particle.remove());
  }
}

function burstHealingParticles(unitEl) {
  const layer = unitEl.querySelector('.battle-particles');
  for (let index = 0; index < 18; index += 1) {
    const particle = document.createElement('i');
    const x = -70 + Math.random() * 140, y = 35 + Math.random() * 90;
    particle.style.cssText = 'position:absolute;left:50%;top:68%;width:7px;height:7px;border-radius:50%;background:#62ef8a;box-shadow:0 0 10px #31d86a;z-index:8;pointer-events:none;';
    layer.appendChild(particle);
    particle.animate([{ transform:`translate(${x}px,${y}px) scale(.3)`, opacity:0 },{ opacity:1, offset:.25 },{ transform:`translate(${x * .35}px,${-90 - Math.random() * 70}px) scale(1.2)`, opacity:0 }], { duration:650 + Math.random() * 450, easing:'ease-out', fill:'forwards' }).finished.finally(() => particle.remove());
  }
}

async function animateHealing(unitEl, model, amount) {
  if (model.hp <= 0 || amount <= 0 || model.hp >= model.maxHp) return;
  const oldHp = model.hp;
  model.hp = Math.min(model.maxHp, oldHp + amount);
  const percent = hpPercent(model);
  const current = unitEl.querySelector('.battle-health-current');
  const ghost = unitEl.querySelector('.battle-health-ghost');
  ghost.style.background = 'linear-gradient(90deg,#36a95d,#8af0a8)';
  ghost.style.width = `${percent}%`;
  burstHealingParticles(unitEl);
  unitEl.querySelector('[data-hp]').textContent = model.hp;
  await unitEl.animate([{ transform:'scale(1)' },{ transform:'scale(1.075)', offset:.5 },{ transform:'scale(1)' }], { duration:460, easing:'ease-in-out' }).finished;
  current.style.transition = 'width 520ms ease-out';
  current.style.width = `${percent}%`;
  await sleep(540);
}

async function animateDamage(unitEl, defender, damage) {
  const oldHp = defender.hp;
  defender.hp = Math.max(0, oldHp - damage);
  const percent = hpPercent(defender);
  const current = unitEl.querySelector('.battle-health-current');
  const ghost = unitEl.querySelector('.battle-health-ghost');
  const label = unitEl.querySelector('.battle-damage-label');
  unitEl.querySelector('[data-hp]').textContent = defender.hp;
  current.style.transition = 'width 130ms ease-out';
  current.style.width = `${percent}%`;
  label.textContent = `-${oldHp - defender.hp}`;
  label.classList.remove('active');
  void label.offsetWidth;
  label.classList.add('active');
  burstParticles(unitEl);
  unitEl.animate([
    { transform: 'translateX(0)' }, { transform: 'translateX(-15px)' },
    { transform: 'translateX(13px)' }, { transform: 'translateX(-9px)' },
    { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }
  ], { duration: 330, easing: 'ease-out' });
  await sleep(210);
  ghost.style.transition = 'width 430ms cubic-bezier(.2,.75,.25,1)';
  ghost.style.width = `${percent}%`;
  await sleep(450);
}

export function renderBattlePreviewPanel(data, body, pm) {
  const enemy = { hp: 1, maxHp: 1, attack: 1, speed: 1, attackRange: 1, ...(data.enemy || {}) };
  const player = { hp: 1, maxHp: 1, attack: 1, speed: 1, attackRange: 1, ...(data.player || {}) };
  body.style.cssText = 'padding:14px 20px;min-height:min(790px,82vh);overflow:hidden;background:radial-gradient(circle at center,#293044,#0d1018 72%);';
  body.innerHTML = `<style>
    .battle-stage{height:100%;display:grid;grid-template-columns:minmax(300px,1fr) minmax(120px,.22fr) minmax(300px,1fr);align-items:center;gap:16px}.battle-unit{position:relative;text-align:center;color:#f2f3f7;min-width:0}.battle-art{position:relative;height:min(59vh,570px);display:flex;align-items:flex-end;justify-content:center;margin-bottom:10px}.battle-art img{width:auto;max-width:100%;height:100%;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 10px 18px rgba(0,0,0,.62))}.battle-art>span{font-size:150px}.battle-particles{position:absolute;inset:0;overflow:visible;pointer-events:none}.battle-name{display:block;font-size:clamp(17px,1.2vw,24px);margin-bottom:9px}.battle-health{display:grid;grid-template-columns:minmax(120px,1fr) auto;align-items:center;gap:10px;width:min(520px,96%);margin:0 auto}.battle-health-track{height:22px;position:relative;overflow:visible;border:2px solid #10131a;border-radius:6px;background:#242630;box-shadow:inset 0 2px 5px #090a0d}.battle-health-ghost,.battle-health-current{position:absolute;left:0;top:0;bottom:0;border-radius:4px}.battle-health-ghost{background:linear-gradient(90deg,#d27724,#ffd56a);z-index:1}.battle-health-current{background:linear-gradient(90deg,#8f1722,#ed3e4c);z-index:2}.battle-health strong{min-width:86px;text-align:left;font-size:15px;color:#f3e8e9}.battle-health i{font-style:normal}.battle-damage-label{position:absolute;right:4px;top:-7px;z-index:4;color:#fff1b0;font-size:18px;font-weight:900;opacity:0;text-shadow:0 2px 4px #690000}.battle-damage-label.active{animation:battleDamageFloat .7s ease-out}.battle-stats{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin-top:10px}.battle-stats span{padding:7px 12px;border-radius:7px;background:#191d28;border:1px solid #3d4558}.battle-center{text-align:center;color:#e8ca85}.battle-actions{display:flex;flex-direction:column;gap:12px}.battle-actions button{padding:12px 8px;border-radius:8px;border:1px solid #756038;background:#4b3b20;color:#f5dfaa;font-weight:700;cursor:pointer}.battle-actions button:last-child{background:#8a2930;border-color:#c7555d;color:#fff}.battle-result{min-height:28px;font-size:20px;font-weight:800;margin-bottom:14px}@keyframes battleDamageFloat{0%{opacity:0;transform:translateY(4px) scale(.7)}20%{opacity:1;transform:translateY(-10px) scale(1.15)}75%{opacity:1}100%{opacity:0;transform:translateY(-34px)}}
    @media(max-width:900px){.battle-stage{grid-template-columns:1fr 100px 1fr;gap:7px}.battle-art{height:min(48vh,390px)}.battle-health{grid-template-columns:1fr}.battle-health strong{text-align:center}.battle-art>span{font-size:90px}}
  </style><div class="battle-stage">${unitCard(enemy, 'enemy')}<div class="battle-center"><div class="battle-result">战斗预估</div><div class="battle-actions"><button data-skip>跳过战斗动画</button><button data-watch>观看战斗</button></div></div>${unitCard(player, 'player')}</div>`;
  const enemyEl = body.querySelector('.battle-unit--enemy');
  const playerEl = body.querySelector('.battle-unit--player');
  const resultEl = body.querySelector('.battle-result');
  const actions = body.querySelector('.battle-actions');
  let finished = false;
  const finish = async (watch = false) => {
    if (finished) return;
    finished = true;
    actions.querySelectorAll('button').forEach(button => { button.disabled = true; });
    if (watch) {
      const distance = Math.max(1, Number(data.distance) || 1);
      const playerCan = distance <= player.attackRange, enemyCan = distance <= enemy.attackRange;
      const order = playerCan && enemyCan ? (enemy.speed > player.speed ? [[enemy, player, enemyEl, playerEl], [player, enemy, playerEl, enemyEl]] : [[player, enemy, playerEl, enemyEl], [enemy, player, enemyEl, playerEl]]) : (playerCan ? [[player, enemy, playerEl, enemyEl]] : [[enemy, player, enemyEl, playerEl]]);
      if (playerCan && enemyCan && player.speed - enemy.speed >= 2) order.push([player, enemy, playerEl, enemyEl]);
      else if (playerCan && enemyCan && enemy.speed - player.speed >= 2) order.push([enemy, player, enemyEl, playerEl]);
      for (const [attacker, defender, attackerEl, defenderEl] of order) {
        if (attacker.hp <= 0 || defender.hp <= 0) break;
        const direction = attackerEl === enemyEl ? 1 : -1;
        await attackerEl.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${direction * 46}%) scale(1.035)`, offset: .58 }, { transform: 'translateX(0)' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished;
        await animateDamage(defenderEl, defender, attacker.attack);
        if (defender.hp <= 0) await defenderEl.animate([{ opacity: 1, filter: 'grayscale(0)' }, { opacity: 0, filter: 'grayscale(1)' }], { duration: 720, fill: 'forwards' }).finished;
      }
      await animateHealing(enemyEl, enemy, Number(enemy.healingAfterBattle) || 0);
      await animateHealing(playerEl, player, Number(player.healingAfterBattle) || 0);
      resultEl.textContent = '战斗结束';
      await sleep(700);
    }
    const resolved = await data.resolveBattle?.();
    data._resolvePreview?.(resolved);
    pm.close();
  };
  body.querySelector('[data-skip]').onclick = () => finish(false);
  body.querySelector('[data-watch]').onclick = () => finish(true);
}
