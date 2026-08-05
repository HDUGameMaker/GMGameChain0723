function system() { return window.__game?.systems?.hero; }

const PIXEL_ART_STYLE = 'image-rendering:pixelated;image-rendering:crisp-edges;';

function fitPixelPortrait(image, frame) {
  const resize = () => {
    const sourceWidth = image.naturalWidth || 79;
    const sourceHeight = image.naturalHeight || 128;
    const availableWidth = Math.max(sourceWidth, frame.clientWidth - 16);
    const availableHeight = Math.max(sourceHeight, frame.clientHeight - 12);
    // 人物像优先占据左侧约 88% 宽度，并允许下半身少量超出后裁切。
    // 仍只采用整数倍缩放，避免像素画出现插值模糊。
    const widthScale = Math.floor((availableWidth * 0.88) / sourceWidth);
    const heightScale = Math.floor((availableHeight * 1.55) / sourceHeight);
    const integerScale = Math.max(1, Math.min(widthScale, heightScale));
    image.style.width = `${sourceWidth * integerScale}px`;
    image.style.height = `${sourceHeight * integerScale}px`;
  };
  image.addEventListener('load', resize, { once: true });
  if (image.complete) resize();
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    image._pixelPortraitObserver = observer;
  }
}

function hearts(level) {
  const value = Math.max(0, Math.min(10, Number(level) || 0));
  return `${'❤️'.repeat(value)}${'♡'.repeat(10 - value)}`;
}

function affinity(hero) {
  const level = hero.affinityLevel || 0;
  const cap = hero.affinityLevelCap || 10;
  return { level, cap, capped: level >= cap, progress: level >= cap ? 100 : (hero.affinityProgress || 0) };
}

export function renderHeroRosterPanel(data, body, pm) {
  body.innerHTML = '';
  body.style.cssText = 'padding:20px 24px;max-height:72vh;overflow-y:auto;min-width:min(720px,82vw);';
  const heroes = system()?.getRecruitedHeroes?.() || [];
  const heading = document.createElement('div');
  heading.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
  heading.innerHTML = `<b style="font-size:19px;color:#f2dfb0">英雄名册</b><span style="font-size:12px;color:#999">已加入 ${heroes.length} 位英雄</span>`;
  body.appendChild(heading);
  if (!heroes.length) {
    body.insertAdjacentHTML('beforeend', '<div style="padding:36px;text-align:center;color:#888">暂无已加入英雄。可在酒馆招募，或在策划编辑器勾选“开局默认生成”。</div>');
  }
  for (const hero of heroes) {
    const value = affinity(hero);
    const row = document.createElement('article');
    row.style.cssText = 'display:flex;align-items:center;gap:14px;padding:12px;margin-bottom:9px;border:1px solid rgba(231,190,112,.22);border-radius:10px;background:rgba(255,255,255,.035);';
    row.innerHTML = `<div style="width:79px;height:128px;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;border-radius:7px;background:#171a21"><img src="${hero.portrait || hero.icon || ''}" alt="" style="width:auto;height:auto;max-width:79px;max-height:128px;object-fit:contain;object-position:top;${PIXEL_ART_STYLE}" onerror="this.style.display='none'"></div><div style="flex:1"><b style="font-size:15px;color:#eee">${hero.name}</b><div style="font-size:12px;color:#d98792;margin-top:5px">好感 ${value.level}级　${hearts(value.level)}</div></div>`;
    const button = document.createElement('button');
    button.textContent = '交互';
    button.style.cssText = 'padding:8px 18px;border:1px solid #96743c;border-radius:7px;background:#4e3b1e;color:#ffe6aa;cursor:pointer;';
    button.addEventListener('click', () => pm.push('hero_interaction', { heroId: hero.id, heroName: hero.name }));
    row.appendChild(button);
    body.appendChild(row);
  }
  const tavern = document.createElement('button');
  tavern.textContent = '前往酒馆招募英雄';
  tavern.style.cssText = 'margin-top:10px;padding:8px 14px;border:1px solid #555;border-radius:7px;background:#292c35;color:#ccc;cursor:pointer;';
  tavern.addEventListener('click', () => pm.push('tavern_heroes', {}));
  body.appendChild(tavern);
}

function renderAbility(hero, target) {
  const profile = system()?.getHeroAbilityProfile?.(hero.id);
  if (!profile) return;
  const stats = profile.stats;
  target.innerHTML = `<div style="font-size:17px;font-weight:700;color:#efd394;margin-bottom:12px">${profile.name} · 能力</div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:13px"><div>❤️ 生命值 <b>${stats.hp}</b></div><div>⚔️ 攻击力 <b>${stats.attack}</b></div><div>👟 速度 <b>${stats.speed}</b></div><div>🎯 射程 <b>${stats.attackRange}</b></div></div><div style="margin-top:15px;color:#d4b86f;font-weight:700">特殊效果</div><div style="font-size:12px;color:#bbb;margin-top:5px">${profile.specialEffects.length ? profile.specialEffects.map(effect => effect.description || effect.name || effect.id).join('<br>') : '尚未配置（接口已预留）'}</div><div style="margin-top:15px;color:#d4b86f;font-weight:700">主动技能</div><div style="margin-top:5px"><b>${profile.activeSkill.name || '待配置主动技能'}</b><div style="font-size:12px;color:#bbb;margin-top:3px">${profile.activeSkill.description || '接口已预留'}${profile.activeSkill.power ? ` · 强度 ${profile.activeSkill.power}` : ''}</div></div>`;
}

function dialogueState(data, hero) {
  if (!data._dialogueSession) {
    const session = data.storyConversation
      ? { ok: true, kind: 'arrival', conversation: structuredClone(data.storyConversation) }
      : system()?.hasCompletedDailyToday?.(hero.id)
      ? system()?.beginHint?.(hero.id)
      : system()?.beginDialogue?.(hero.id);
    if (!session?.ok) return { unavailable: session?.reason || '当前没有可用对话' };
    const doc = session.conversation;
    data._dialogueSession = session;
    data._dialogue = { nodeId: doc.start, messages: [], choices: null, finished: false, completed: false };
  }
  return { doc: data._dialogueSession.conversation, state: data._dialogue, session: data._dialogueSession };
}

export function renderHeroInteractionPanel(data, body, pm) {
  const hero = system()?.getRecruitedHeroes?.().find(candidate => candidate.id === data?.heroId)
    || (data?.storyMode ? system()?.getHero?.(data?.heroId) : null);
  if (!hero) { body.innerHTML = '<div style="padding:30px;color:#e88">英雄不存在或尚未加入。</div>'; return; }
  body.innerHTML = '';
  body.style.cssText = 'padding:0;width:100%;min-width:0;height:min(720px,calc(85vh - 66px));min-height:min(560px,calc(85vh - 66px));overflow:hidden;';
  const layout = document.createElement('div');
  layout.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;height:100%;background:#171920;color:#eee;';
  const left = document.createElement('section');
  left.style.cssText = `display:grid;grid-template-rows:${data.storyMode ? '1fr' : '4fr 1fr'};min-height:0;border-right:1px solid #383b46;`;
  const portraitFrame = document.createElement('div');
  portraitFrame.style.cssText = 'min-height:0;background:#101219;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;padding:8px 8px 0;box-sizing:border-box;';
  const portrait = document.createElement('img');
  portrait.src = hero.portrait || hero.icon || '';
  portrait.alt = hero.name;
  portrait.style.cssText = `display:block;flex:none;object-fit:contain;object-position:center top;${PIXEL_ART_STYLE}`;
  portrait.addEventListener('error', () => { portrait.style.display = 'none'; });
  portraitFrame.appendChild(portrait);
  left.appendChild(portraitFrame);
  fitPixelPortrait(portrait, portraitFrame);
  const aff = affinity(hero);
  const affinityBox = document.createElement('div');
  affinityBox.style.cssText = 'padding:13px 16px;background:#211d24;';
  affinityBox.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:12px"><b>${hero.name} · 好感 ${aff.level}级</b><span>${aff.capped ? (aff.cap >= 10 ? 'MAX' : `时代上限 ${aff.cap}级`) : `${aff.progress}/100`}</span></div><div style="margin:7px 0;color:#e17482;font-size:14px;white-space:nowrap">${hearts(aff.level)}</div><div style="height:9px;background:#3a3035;border-radius:99px;overflow:hidden"><div style="height:100%;width:${aff.progress}%;background:linear-gradient(90deg,#d95d70,#ff9aaa)"></div></div>`;
  if (!data.storyMode) left.appendChild(affinityBox);
  const right = document.createElement('section');
  right.style.cssText = 'display:grid;grid-template-rows:minmax(0,1fr) auto;min-height:0;';
  const content = document.createElement('div');
  content.style.cssText = 'padding:18px;overflow-y:auto;background:#1c1f28;';
  const mode = data._mode || 'dialogue';
  if (mode === 'ability') renderAbility(hero, content);
  else if (mode === 'gift') {
    const luxury = window.__game?.systems?.luxury;
    const inventory = luxury?.getInventory?.() || {};
    content.innerHTML = '<div style="font-size:17px;font-weight:700;color:#efd394;margin-bottom:6px">赠送奢侈品</div><div style="font-size:11px;color:#aaa;margin-bottom:12px">每天最多赠送一次。仅可赠送重复份，首份会保留并继续提供唯一效果。每次好感度 +50。</div>';
    const list = document.createElement('div');
    list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:9px;';
    if (!luxury?.isSystemUnlocked?.()) list.innerHTML = '<div style="grid-column:1/-1;padding:38px;text-align:center;color:#9298a7">没有任何可以赠送的东西。首次获得奢侈品后会解锁赠礼。</div>';
    for (const item of luxury?.getLuxuries?.() || []) {
      const count = inventory[item.id] || 0;
      const check = luxury.canGiftToHero(item.id, hero.id);
      const card = document.createElement('button');
      card.disabled = !check.ok;
      card.style.cssText = `padding:10px;text-align:left;border:1px solid ${check.ok ? '#9b7a42' : '#41444d'};border-radius:8px;background:${check.ok ? '#3d321f' : '#272a31'};color:${check.ok ? '#f4dfae' : '#777'};cursor:${check.ok ? 'pointer' : 'not-allowed'};`;
      card.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><img src="${item.icon}" alt="" style="width:30px;height:30px"><b>${item.name}</b></div><div style="font-size:10px;margin-top:6px">持有 ${count} · 可赠送 ${Math.max(0, count - 1)}</div><div style="font-size:10px;margin-top:3px">${check.ok ? '赠送后好感度 +50' : check.reason}</div>`;
      card.addEventListener('click', () => {
        const result = luxury.giftToHero(item.id, hero.id);
        if (!result.ok) pm.alert(result.reason);
        else pm.alert(`已赠送${item.name}，${hero.name}好感度 +50`);
        renderHeroInteractionPanel(data, body, pm);
      });
      list.appendChild(card);
    }
    content.appendChild(list);
  }
  else {
    const dialogue = dialogueState(data, hero);
    if (dialogue.unavailable) {
      content.innerHTML = `<div style="padding:30px;text-align:center;color:#aaa">${dialogue.unavailable}</div>`;
      right.appendChild(content);
    } else {
    const { doc, state, session } = dialogue;
    if (session.kind === 'special') content.insertAdjacentHTML('beforeend', `<div style="margin-bottom:12px;padding:9px 11px;border:1px solid #d29b55;border-radius:8px;background:rgba(210,155,85,.12);color:#f2c982;font-size:12px">✦ 特殊对话 · 好感度 ${session.level} 级剧情（不占用今日对话次数，不增加好感度）</div>`);
    else if (session.levelExclusive) content.insertAdjacentHTML('beforeend', `<div style="margin-bottom:12px;padding:8px 10px;border:1px solid #7770a8;border-radius:8px;background:rgba(119,112,168,.12);color:#c9c4ef;font-size:11px">当前好感度等级的专属日常对话</div>`);
    for (const message of state.messages) {
      const bubble = document.createElement('div');
      const player = message.speaker === 'player';
      bubble.style.cssText = `max-width:78%;margin:8px 0 8px ${player ? 'auto' : '0'};padding:10px 13px;border-radius:${player ? '14px 14px 3px 14px' : '14px 14px 14px 3px'};background:${player ? '#386aa3' : '#343946'};line-height:1.5;font-size:13px;`;
      bubble.textContent = message.text;
      content.appendChild(bubble);
    }
    if (state.choices?.length) {
      const choices = document.createElement('div');
      choices.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;';
      for (const choice of state.choices.slice(0, 2)) {
        const button = document.createElement('button');
        button.textContent = `${choice.text}${session.kind === 'daily' ? '（好感 +30）' : ''}`;
        button.style.cssText = 'padding:9px;border:1px solid #68718a;border-radius:8px;background:#2d3444;color:#e8edf8;cursor:pointer;';
        button.addEventListener('click', () => {
          state.messages.push({ speaker: 'player', text: choice.text });
          state.nodeId = choice.next || doc.start;
          state.finished = !choice.next;
          state.choices = null;
          if (state.finished && !state.completed) {
            system()?.completeDialogue?.(hero.id, session);
            state.completed = true;
          }
          renderHeroInteractionPanel(data, body, pm);
        });
        choices.appendChild(button);
      }
      content.appendChild(choices);
    }
    const advance = document.createElement('button');
    advance.textContent = state.finished ? (session.kind === 'special' ? '继续查看可用对话' : '结束对话') : (state.messages.length ? '继续对话' : '开始对话');
    advance.disabled = Boolean(state.choices?.length);
    advance.style.cssText = 'display:block;margin:16px auto 0;padding:8px 18px;border:1px solid #8d764a;border-radius:8px;background:#493b24;color:#ffe2a1;cursor:pointer;';
    advance.addEventListener('click', () => {
      if (state.finished) {
        delete data._dialogue;
        delete data._dialogueSession;
        renderHeroInteractionPanel(data, body, pm);
        return;
      }
      const node = (doc.nodes || []).find(item => item.id === state.nodeId) || (doc.nodes || [])[0];
      if (!node) return;
      state.messages.push({ speaker: node.speaker || 'hero', text: node.text || '' });
      if (node.choices?.length) { state.choices = node.choices; state.nodeId = null; }
      else if (node.end || !node.next) {
        state.nodeId = null; state.finished = true;
        if (!state.completed) {
          if (session.kind === 'arrival') system()?.completeHestiaArrival?.();
          else system()?.completeDialogue?.(hero.id, session);
          state.completed = true;
        }
      }
      else state.nodeId = node.next;
      renderHeroInteractionPanel(data, body, pm);
    });
    content.appendChild(advance);
    if (data.storyMode) {
      advance.style.display = 'none';
      content.style.cursor = 'pointer';
      content.title = '左键点击推进对话';
      content.onclick = event => { if (event.target.closest?.('button')) return; advance.click(); };
      if (state.finished) {
        content.onclick = () => pm.open('feature_unlock', { blocking: true, icon: '🍺', title: '英雄系统', description: '主界面的英雄按钮已经解锁。你可以与赫斯提亚对话、查看能力，并在获得奢侈品后赠送礼物。\n\n🏆 胜利目标已更新：击败？？？' });
      }
    }
    }
  }
  right.appendChild(content);
  const actions = document.createElement('div');
  actions.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:13px;background:#15171e;border-top:1px solid #383b46;';
  const dialogueLabel = system()?.hasCompletedDailyToday?.(hero.id) ? '💡 获取提示' : '💬 对话';
  for (const [key, label] of [['dialogue',dialogueLabel],['gift','🎁 赠送礼物'],['ability','✨ 能力']]) {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.cssText = `padding:10px;border:1px solid ${mode === key ? '#c49b50' : '#4c5260'};border-radius:8px;background:${mode === key ? '#4d3c21' : '#292d37'};color:#eee;cursor:pointer;`;
    button.addEventListener('click', () => { data._mode = key; renderHeroInteractionPanel(data, body, pm); });
    actions.appendChild(button);
  }
  if (!data.storyMode) right.appendChild(actions);
  layout.append(left, right);
  body.appendChild(layout);
}
