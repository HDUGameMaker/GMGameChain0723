import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class HeroSystem {
  constructor() {
    this._availableIds = [];
    this._recruited = {};
    this._lastRefreshDay = 0;
    this._buildingSystem = null;
    this._resourceSystem = null;
    this._cultureSystem = null;
    this._eraSystem = null;
    this._systemUnlocked = false;
    this._arrivalPending = false;
    this._tickCounter = 0;
    eventBus.on('dayStart', ({ day } = {}) => this._onDayStart(day || 1));
    eventBus.on('tick', () => { this._tickCounter += 1; this.recoverInjuredHeroesByTick(); });
    eventBus.on('dailySettlementOpened', ({ day } = {}) => {
      if (!this._systemUnlocked && !this._arrivalPending && this.hasActiveTavern()) {
        this._arrivalPending = true;
        eventBus.emit('hestiaArrivalRequested', { day: day || 1, heroId: 'Hestia' });
      }
    });
  }

  setSystems(systems = {}) {
    if (systems.building) this._buildingSystem = systems.building;
    if (systems.resource) this._resourceSystem = systems.resource;
    if (systems.culture) this._cultureSystem = systems.culture;
    if (systems.era) this._eraSystem = systems.era;
  }

  get _settings() {
    const integration = configRegistry.get('eaIntegration') || {};
    return integration.heroSettings || {};
  }

  getAllHeroes() {
    const integration = configRegistry.get('eaIntegration') || {};
    const historical = configRegistry.getHistoricalContent();
    const eras = historical.eras || [];
    const eraNames = Object.fromEntries(eras.map(era => [era.id, era.name]));
    const legacyEraIds = {
      sun_tzu: 'classical', zhuge_liang: 'classical', yue_fei: 'medieval', zheng_he: 'exploration',
      li_shizhen: 'exploration', shen_kuo: 'medieval', zhang_heng: 'classical', hua_mulan: 'medieval',
      saladin: 'medieval', hannibal: 'classical', leonardo: 'exploration', joan_of_arc: 'medieval'
    };
    const normalize = hero => {
      const heroClass = hero.heroClass || (['commander', 'admiral', 'strategist'].includes(hero.role) ? 'military' : 'civil');
      const assignmentTargets = hero.assignmentTargets || (heroClass === 'military' ? ['army'] : this._civilTargets(hero.role));
      return {
        ...hero,
        eraId: hero.eraId === 'ancient' ? 'classical'
          : hero.eraId === 'early_modern' ? 'modern'
            : (hero.eraId || legacyEraIds[hero.id] || 'classical'),
        heroClass,
        assignmentTargets,
        title: hero.title || (heroClass === 'military' ? '历史武将' : '历史文臣'),
        description: hero.description || `${hero.name}可在酒馆招募并为文明提供长期支持。`,
        skills: hero.skills?.length ? hero.skills : [{
          id: `${hero.id}_signature`, name: hero.skillName || this._roleName(hero.role),
          description: hero.skillDescription || `${this._roleName(hero.role)}专长会在任命期间持续生效。`,
          trigger: heroClass === 'military' ? 'battle_phase' : 'assignment_tick', unlockLevel: 1, effects: {}
        }],
        icon: hero.iconAsset || (String(hero.icon || '').includes('/') ? hero.icon : `assets/historical-icons/heroes/${hero.id}.svg`),
        portrait: hero.portrait || `assets/hero-portraits/${hero.id}.png`,
        cost: hero.cost || hero.recruitCost || [],
        initialAffinityLevel: Math.max(0, Math.min(10, Math.floor(hero.initialAffinityLevel || 0))),
        initialAffinityProgress: Math.max(0, Math.min(99, Math.floor(hero.initialAffinityProgress || 0))),
        unitStats: { hp: 10, attack: 2, speed: 1, attackRange: 1, ...(hero.unitStats || {}) },
        affinityGrowth: { hp: 1, attack: 0.2, speed: 0.02, attackRange: 0, ...(hero.affinityGrowth || {}) },
        specialEffects: Array.isArray(hero.specialEffects) ? hero.specialEffects : [],
        activeSkill: hero.activeSkill || { id: `${hero.id}_active`, name: '待配置主动技能', description: '主动技能接口已预留。', basePower: 0, affinityPowerPerLevel: 0 },
        dialogueDocument: (() => {
          const document = hero.dialogueDocument || { start: 'intro', nodes: [{ id: 'intro', speaker: 'hero', text: `我是${hero.name}。`, end: true }] };
          if (Array.isArray(document.daily)) return document;
          return { daily: [{ id: 'legacy_daily', ...document }], affinityDaily: {}, affinitySpecial: {} };
        })()
      };
    };
    const base = (integration.heroes || []).map(normalize);
    const ids = new Set(base.map(hero => hero.id));
    const additions = (historical.heroes || []).filter(hero => !ids.has(hero.id)).map(hero => normalize({
      ...hero,
      era: eraNames[hero.eraId] || hero.eraId,
      title: hero.title || this._roleName(hero.role),
      inspirationCost: hero.inspirationCost || 0,
      cost: hero.cost || hero.recruitCost || []
    }));
    const roster = [...base, ...additions];
    return roster.map((hero, index) => {
      const partner = roster[index % 2 === 0 ? index + 1 : index - 1] || roster[(index + 1) % roster.length];
      const skills = [...(hero.skills || [])].map((skill, skillIndex) => ({
        ...skill,
        unlockLevel: skill.unlockLevel || (skillIndex === 0 ? 1 : 2)
      }));
      if (skills.length < 2) {
        skills.push({
          id: `${hero.id}_mastery`, name: '文明传承',
          description: `${hero.name}在长期任命中将经验传给继任者。`,
          trigger: 'assignment_tick', unlockLevel: 2,
          effects: hero.heroClass === 'military' ? { combatPowerMul: 1.02 } : { productionMul: 1.02 }
        });
      }
      return {
        ...hero,
        skills,
        relationshipTags: hero.relationshipTags?.length >= 2 ? hero.relationshipTags : [`era:${hero.eraId}`, `role:${hero.role}`],
        combinations: hero.combinations?.length ? hero.combinations : [{
          id: `pair_${[hero.id, partner.id].sort().join('_')}`,
          heroIds: [hero.id, partner.id],
          name: `${hero.name}与${partner.name}`,
          description: '两位历史人物同时任命时激活协同。',
          effects: hero.heroClass === 'military' || partner.heroClass === 'military'
            ? { combatPowerMul: 1.03 }
            : { productionMul: 1.03 }
        }]
      };
    });
  }

  _civilTargets(role) {
    return {
      scholar: ['academy', 'library'], engineer: ['engineers_guild', 'building'], diplomat: ['embassy', 'diplomatic_mission'],
      explorer: ['settlement', 'trade_route'], physician: ['settlement', 'hospital'], governor: ['settlement', 'council_hall']
    }[role] || ['settlement', 'council_hall'];
  }

  _roleName(role) {
    return { commander: '统帅', admiral: '海军统帅', strategist: '军事家', diplomat: '外交家', engineer: '工程师', explorer: '探险家', physician: '医师', scholar: '学者', governor: '总督' }[role] || role;
  }

  getHero(id) { return this.getAllHeroes().find(hero => hero.id === id) || null; }

  initNew() {
    this._availableIds = [];
    this._recruited = {};
    this._systemUnlocked = false;
    this._arrivalPending = false;
    this._refreshOffers(store.getState('timeDay') || 1);
    for (const hero of this.getAllHeroes().filter(candidate => candidate.defaultSpawn && candidate.id !== 'Hestia')) {
      this._recruited[hero.id] = this._createRecruitedEntry(hero, true);
      this._availableIds = this._availableIds.filter(id => id !== hero.id);
    }
    this._notify();
  }

  _createRecruitedEntry(hero, defaultSpawn = false) {
    return {
      heroId: hero.id,
      recruitedDay: store.getState('timeDay') || 1,
      assignment: null,
      injuredUntilDay: null,
      level: 1,
      experience: 0,
      affinityLevel: hero.initialAffinityLevel || 0,
      affinityProgress: hero.initialAffinityProgress || 0,
      dialogueProgress: { lastDailyDay: 0, seenLevelDaily: {}, seenSpecialLevels: [], pendingSpecialLevels: [] },
      defaultSpawn
    };
  }

  _eligibleHeroes() {
    const historical = configRegistry.getHistoricalContent();
    const eraOrder = Object.fromEntries((historical.eras || []).map(era => [era.id, era.order]));
    const currentOrder = this._eraSystem?.getCurrentEra?.()?.order ?? 0;
    return this.getAllHeroes().filter(hero => {
      if (hero.id === 'Hestia' && !this._systemUnlocked) return false;
      if (this._recruited[hero.id]) return false;
      return !hero.eraId || (eraOrder[hero.eraId] ?? 0) <= currentOrder;
    }).sort((left, right) => {
      const leftOrder = left.eraId ? (eraOrder[left.eraId] ?? -1) : -1;
      const rightOrder = right.eraId ? (eraOrder[right.eraId] ?? -1) : -1;
      return Math.abs(currentOrder - leftOrder) - Math.abs(currentOrder - rightOrder);
    });
  }

  _refreshOffers(day) {
    const pool = this._eligibleHeroes();
    const count = Math.min(this._settings.offerCount || 4, pool.length);
    const offset = pool.length ? ((day * 3) % pool.length) : 0;
    this._availableIds = Array.from({ length: count }, (_, index) => pool[(offset + index) % pool.length].id);
    this._lastRefreshDay = day;
  }

  _onDayStart(day) {
    const recovered = this.recoverInjuredHeroes(day);
    const refreshDays = this._settings.refreshDays || 3;
    if (day - this._lastRefreshDay >= refreshDays) {
      this._refreshOffers(day);
      eventBus.emit('combatBroadcast', { message: '🍺 酒馆来了一批新的历史人物。' });
      this._notify();
    } else if (recovered) this._notify();
  }

  hasActiveTavern() {
    return (this._buildingSystem?.buildings || []).some(building =>
      ['tavern', 'tavern_hall'].includes(building.buildingId) && building.status === 'active');
  }

  isSystemUnlocked() { return this._systemUnlocked; }

  completeHestiaArrival() {
    if (!this._recruited.Hestia) {
      const hero = this.getHero('Hestia');
      if (hero) this._recruited.Hestia = this._createRecruitedEntry(hero, true);
    }
    this._systemUnlocked = true;
    this._arrivalPending = false;
    this._notify();
    eventBus.emit('heroSystemUnlocked');
  }

  hasCompletedDailyToday(id, day = store.getState('timeDay') || 1) {
    const entry = this._recruited[id];
    return Boolean(entry && this._dialogueProgress(entry).lastDailyDay === day);
  }

  getAvailableHeroes() { return this._availableIds.map(id => this.getHero(id)).filter(Boolean); }
  getRecruitableHeroes() { return this._eligibleHeroes(); }
  getMilitaryHeroes() { return this.getAllHeroes().filter(hero => hero.heroClass === 'military'); }
  getCivilHeroes() { return this.getAllHeroes().filter(hero => hero.heroClass === 'civil'); }
  getRecruitedHeroes() {
    const day = store.getState('timeDay') || 1;
    const affinityLevelCap = this.getAffinityLevelCap();
    return Object.values(this._recruited).map(entry => {
      const hero = this.getHero(entry.heroId);
      const level = entry.level || 1;
      return {
        ...hero,
        ...entry,
        level,
        experience: entry.experience || 0,
        affinityLevel: Math.max(0, Math.min(10, entry.affinityLevel || 0)),
        affinityProgress: (entry.affinityLevel || 0) >= 10 ? 0 : Math.max(0, Math.min(99, entry.affinityProgress || 0)),
        affinityLevelCap,
        unlockedSkills: (hero?.skills || []).filter(skill => (skill.unlockLevel || 1) <= level),
        status: (entry.injuredUntilTick && this._tickCounter < entry.injuredUntilTick) || (entry.injuredUntilDay && day < entry.injuredUntilDay) ? 'injured' : 'active'
      };
    });
  }

  recruitHero(id) {
    const hero = this.getHero(id);
    if (!hero || !this._availableIds.includes(id)) return { ok: false, reason: '该人物当前不在酒馆' };
    if (!this.hasActiveTavern()) return { ok: false, reason: '需要先建造并启用酒馆' };
    if ((store.getState('inspiration') || 0) < (hero.inspirationCost || 0)) return { ok: false, reason: '人文影响力不足' };
    if (hero.cost?.length && (!this._resourceSystem || !this._resourceSystem.canAfford(hero.cost))) return { ok: false, reason: '招募资源不足' };
    if (hero.cost?.length) this._resourceSystem.consumeAll(hero.cost);
    store.setState({ inspiration: Math.max(0, (store.getState('inspiration') || 0) - (hero.inspirationCost || 0)) });
    this._recruited[id] = this._createRecruitedEntry(hero, false);
    this._availableIds = this._availableIds.filter(heroId => heroId !== id);
    this._notify();
    eventBus.emit('heroRecruited', { heroId: id, name: hero.name });
    eventBus.emit('combatBroadcast', { message: `🏛️ ${hero.name} 已加入你的文明。` });
    return { ok: true };
  }

  getAssignmentLimit() {
    const legacySlots = store.getState('worldConsequenceModifiers')?.heroAssignmentSlots || 0;
    return (this._settings.baseAssignmentSlots || 2) + (this._cultureSystem?.getHeroSlotsBonus?.() || 0) + legacySlots;
  }

  assignHero(id, assignment) {
    const entry = this._recruited[id];
    if (!entry) return { ok: false, reason: '人物尚未招募' };
    const hero = this.getHero(id);
    const assignmentType = typeof assignment === 'string' ? assignment : assignment?.type;
    const isArmyAssignment = assignmentType === 'army';
    if (assignment && hero?.heroClass === 'military' && !isArmyAssignment) return { ok: false, reason: '武将只能任命到军团' };
    if (assignment && hero?.heroClass === 'civil' && isArmyAssignment) return { ok: false, reason: '文臣不能带领军团' };
    const activeCount = Object.values(this._recruited).filter(hero => hero.assignment && hero.heroId !== id).length;
    if (assignment && activeCount >= this.getAssignmentLimit()) return { ok: false, reason: '人物任命席位已满' };
    entry.assignment = assignment || null;
    this._notify();
    if (assignment) eventBus.emit('heroAssigned', { heroId: id, assignment: structuredClone(assignment) });
    return { ok: true };
  }

  grantExperience(id, amount) {
    const entry = this._recruited[id];
    if (!entry) return { ok: false, reason: 'hero_not_recruited' };
    let experience = (entry.experience || 0) + Math.max(0, Math.floor(amount || 0));
    let level = entry.level || 1;
    while (experience >= 100 && level < 10) {
      experience -= 100;
      level += 1;
      eventBus.emit('heroLeveled', { heroId: id, level });
    }
    entry.level = level;
    entry.experience = experience;
    this._notify();
    return { ok: true, level, experience };
  }

  adjustAffinity(id, amount) {
    const entry = this._recruited[id];
    if (!entry) return { ok: false, reason: 'hero_not_recruited' };
    const levelCap = this.getAffinityLevelCap();
    const totalCap = levelCap * 100;
    const currentTotal = Math.max(0, Math.min(totalCap, (entry.affinityLevel || 0) * 100 + (entry.affinityProgress || 0)));
    const total = Math.max(0, Math.min(totalCap, currentTotal + Math.trunc(Number(amount) || 0)));
    const previousLevel = entry.affinityLevel || 0;
    entry.affinityLevel = total >= totalCap ? levelCap : Math.floor(total / 100);
    entry.affinityProgress = total >= totalCap ? 0 : total % 100;
    entry.dialogueProgress ||= { lastDailyDay: 0, seenLevelDaily: {}, seenSpecialLevels: [], pendingSpecialLevels: [] };
    entry.dialogueProgress.pendingSpecialLevels ||= [];
    for (let level = previousLevel + 1; level <= entry.affinityLevel; level += 1) {
      if (!entry.dialogueProgress.pendingSpecialLevels.includes(level)) entry.dialogueProgress.pendingSpecialLevels.push(level);
    }
    this._notify();
    eventBus.emit('heroAffinityChanged', { heroId: id, level: entry.affinityLevel, progress: entry.affinityProgress, amount: total - currentTotal });
    return { ok: true, level: entry.affinityLevel, progress: entry.affinityProgress };
  }

  getAffinityLevelCap() {
    const order = Math.max(0, Math.floor(Number(this._eraSystem?.getCurrentEra?.()?.order) || 0));
    return [3, 5, 7, 9, 10][Math.min(4, order)];
  }

  increaseAffinityLevel(id) {
    const entry = this._recruited[id];
    if (!entry) return { ok: false, reason: '英雄尚未加入' };
    if ((entry.affinityLevel || 0) >= this.getAffinityLevelCap()) return { ok: false, reason: '当前时代的好感等级已达上限' };
    return this.adjustAffinity(id, 100 - (entry.affinityProgress || 0));
  }

  _dialogueProgress(entry) {
    entry.dialogueProgress ||= {};
    entry.dialogueProgress.lastDailyDay = Math.max(0, Math.floor(entry.dialogueProgress.lastDailyDay || 0));
    entry.dialogueProgress.seenLevelDaily ||= {};
    entry.dialogueProgress.seenSpecialLevels ||= [];
    entry.dialogueProgress.pendingSpecialLevels ||= [];
    return entry.dialogueProgress;
  }

  beginDialogue(id, day = store.getState('timeDay') || 1) {
    const hero = this.getHero(id), entry = this._recruited[id];
    if (!hero || !entry) return { ok: false, reason: '英雄尚未加入' };
    const document = hero.dialogueDocument || {};
    const progress = this._dialogueProgress(entry);
    const specials = document.affinitySpecial || {};
    const pendingLevel = progress.pendingSpecialLevels.find(level => specials[level] && !progress.seenSpecialLevels.includes(level));
    if (pendingLevel) return { ok: true, kind: 'special', level: pendingLevel, conversation: structuredClone(specials[pendingLevel]) };
    if (progress.lastDailyDay === day) return { ok: false, reason: '今天已经进行过日常对话' };
    const level = entry.affinityLevel || 0;
    const levelPool = document.affinityDaily?.[level] || [];
    const seen = new Set(progress.seenLevelDaily[level] || []);
    const exclusive = levelPool.find(conversation => !seen.has(conversation.id));
    const basePool = document.daily || [];
    const conversation = exclusive || basePool[(day + basePool.length + Object.values(progress.seenLevelDaily).flat().length) % Math.max(1, basePool.length)];
    if (!conversation) return { ok: false, reason: '尚未配置可用的日常对话' };
    return { ok: true, kind: 'daily', level, levelExclusive: Boolean(exclusive), conversation: structuredClone(conversation) };
  }

  beginHint(id) {
    const entry = this._recruited[id];
    if (!entry) return { ok: false, reason: '英雄尚未加入' };
    const hints = [
      '什么，你想渡过河流？或许到了古典时代，你们就能找到建造桥梁的方法。',
      '那些奇怪的石碑同样来自异界。激活它们，或许能获得超越自然法则的力量。',
      '东方的黑暗造物并非这个世界的生命。集结足够多的满编军团后，再尝试靠近它。',
      '驻军会追击进入视野的目标。利用射程与速度，把它们从防御设施旁引开。',
      '重复的奢侈品不会让效果叠加。不过……如果你愿意，我可以替你保管一份。',
      '想增加军队战斗力？不妨去攻打远处的城邦获取稀有资源，或许那些能提升你的战斗力。',
      '让军队靠近那些奇怪的石碑，然后选择远方另一个激活的石碑，就能传送。'
    ];
    const progress = this._dialogueProgress(entry);
    const index = progress.hintCursor || 0;
    progress.hintCursor = (index + 1) % hints.length;
    this._notify();
    return { ok: true, kind: 'hint', level: entry.affinityLevel || 0, conversation: { id: `hestia_hint_${index}`, start: 'hint', nodes: [{ id: 'hint', speaker: 'hero', text: hints[index], end: true }] } };
  }

  completeDialogue(id, session, day = store.getState('timeDay') || 1) {
    const entry = this._recruited[id];
    if (!entry || !session?.conversation?.id) return { ok: false, reason: '对话状态无效' };
    const progress = this._dialogueProgress(entry);
    if (session.kind === 'special') {
      if (!progress.seenSpecialLevels.includes(session.level)) progress.seenSpecialLevels.push(session.level);
      progress.pendingSpecialLevels = progress.pendingSpecialLevels.filter(level => level !== session.level);
      this._notify();
      return { ok: true, affinity: 0, special: true };
    }
    if (session.kind === 'hint') return { ok: true, affinity: 0, hint: true };
    if (progress.lastDailyDay === day) return { ok: false, reason: '今天已经进行过日常对话' };
    progress.lastDailyDay = day;
    if (session.levelExclusive) {
      progress.seenLevelDaily[session.level] ||= [];
      if (!progress.seenLevelDaily[session.level].includes(session.conversation.id)) progress.seenLevelDaily[session.level].push(session.conversation.id);
    }
    const result = this.adjustAffinity(id, 30);
    return { ...result, affinity: 30, daily: true };
  }

  getHeroAbilityProfile(id) {
    const hero = this.getHero(id);
    const entry = this._recruited[id];
    if (!hero || !entry) return null;
    const affinityLevel = Math.max(0, Math.min(10, entry.affinityLevel || 0));
    const progression = Array.isArray(hero.affinityStatProgression) ? hero.affinityStatProgression : null;
    const progressionBonus = { hp: 0, attack: 0, speed: 0, attackRange: 0 };
    if (progression) for (let level = 1; level <= affinityLevel; level += 1) {
      const gain = progression.find(tier => level >= tier.fromLevel && level <= tier.toLevel) || {};
      for (const key of Object.keys(progressionBonus)) progressionBonus[key] += Number(gain[key]) || 0;
    }
    const milestones = Array.isArray(hero.affinityMilestones) ? hero.affinityMilestones : [];
    for (const milestone of milestones.filter(item => affinityLevel >= item.level)) {
      progressionBonus.speed += Number(milestone.personalSpeedBonus) || 0;
    }
    const stats = {};
    for (const key of ['hp', 'attack', 'speed', 'attackRange']) {
      const growth = progression ? progressionBonus[key] : (Number(hero.affinityGrowth?.[key]) || 0) * affinityLevel;
      const value = (Number(hero.unitStats?.[key]) || 0) + growth;
      stats[key] = key === 'attackRange' ? Math.floor(value) : Math.round(value * 100) / 100;
    }
    const activeLifeSteal = milestones.filter(item => affinityLevel >= item.level).reduce((sum, item) => sum + (Number(item.activeAttackLifeStealBonus) || 0), 0);
    const activeDamageBonus = milestones.filter(item => affinityLevel >= item.level).reduce((sum, item) => sum + (Number(item.activeSkillDamageMultiplierBonus) || 0), 0);
    const affinityEffects = [];
    if (activeLifeSteal > 0) affinityEffects.push({ id: 'affinity_active_lifesteal', description: `月光命中敌人后，军队恢复造成伤害的 ${Math.round(activeLifeSteal * 100)}% 生命值。` });
    if (affinityLevel >= 5) affinityEffects.push({ id: 'affinity_speed_5', description: '好感5级：赫斯提亚个人移动速度 +1。' });
    if (affinityLevel >= 9) affinityEffects.push({ id: 'affinity_speed_9', description: '好感9级：赫斯提亚个人移动速度再 +1。' });
    if (affinityLevel >= 10) affinityEffects.push({ id: 'affinity_active_damage_10', description: '好感10级：月光的伤害倍率额外 +100%。' });
    return {
      id: hero.id, name: hero.name, affinityLevel, affinityLevelCap: this.getAffinityLevelCap(), stats,
      specialEffects: [...structuredClone(hero.specialEffects || []), ...affinityEffects],
      activeSkill: {
        ...structuredClone(hero.activeSkill || {}),
        damageMultiplier: (Number(hero.activeSkill?.damageMultiplier) || 1) + activeDamageBonus,
        lifeSteal: activeLifeSteal,
        activeAttackLifeSteal: activeLifeSteal,
        power: Math.round(((Number(hero.activeSkill?.basePower) || 0) + (Number(hero.activeSkill?.affinityPowerPerLevel) || 0) * affinityLevel) * 100) / 100
      }
    };
  }

  injureHero(id, currentDay = store.getState('timeDay') || 1) {
    const entry = this._recruited[id];
    const hero = this.getHero(id);
    if (!entry || !hero) return { ok: false, reason: '人物尚未招募' };
    entry.injuredUntilDay = null;
    const recoveryTicks = Math.max(1, Math.floor(Number(hero.defeatRecoveryTicks) || 30));
    entry.injuredUntilTick = this._tickCounter + recoveryTicks;
    this._notify();
    eventBus.emit('heroInjured', { heroId: id, injuredUntilTick: entry.injuredUntilTick, cooldownTicks: recoveryTicks });
    return { ok: true, injuredUntilTick: entry.injuredUntilTick, cooldownTicks: recoveryTicks };
  }

  recoverInjuredHeroesByTick() {
    let recovered = false;
    for (const entry of Object.values(this._recruited)) if (entry.injuredUntilTick && this._tickCounter >= entry.injuredUntilTick) {
      entry.injuredUntilTick = null; recovered = true; eventBus.emit('heroRecovered', { heroId: entry.heroId });
    }
    if (recovered) this._notify();
  }

  recoverInjuredHeroes(day = store.getState('timeDay') || 1) {
    let recovered = false;
    for (const entry of Object.values(this._recruited)) {
      if (entry.injuredUntilDay && day >= entry.injuredUntilDay) {
        entry.injuredUntilDay = null;
        recovered = true;
        eventBus.emit('heroRecovered', { heroId: entry.heroId });
      }
    }
    if (recovered) this._notify();
    return recovered;
  }

  getBonuses() {
    const result = {};
    const day = store.getState('timeDay') || 1;
    for (const entry of Object.values(this._recruited)) {
      if (!entry.assignment || (entry.injuredUntilDay && day < entry.injuredUntilDay)) continue;
      const hero = this.getHero(entry.heroId);
      this._mergeEffects(result, hero?.bonuses || {});
      for (const skill of hero?.skills || []) {
        if ((skill.unlockLevel || 1) <= (entry.level || 1)) this._mergeEffects(result, skill.effects || {});
      }
    }
    for (const combination of this.getActiveCombinations()) this._mergeEffects(result, combination.effects || {});
    return result;
  }

  getActiveCombinations() {
    const day = store.getState('timeDay') || 1;
    const activeIds = new Set(Object.values(this._recruited)
      .filter(entry => entry.assignment && (!entry.injuredUntilDay || day >= entry.injuredUntilDay))
      .map(entry => entry.heroId));
    const combinations = new Map();
    for (const heroId of activeIds) {
      for (const combination of this.getHero(heroId)?.combinations || []) {
        if ((combination.heroIds || []).every(id => activeIds.has(id))) combinations.set(combination.id, combination);
      }
    }
    return [...combinations.values()].map(combination => structuredClone(combination));
  }

  _mergeEffects(target, effects) {
    for (const [key, value] of Object.entries(effects || {})) {
      if (key.endsWith('Mul')) target[key] = (target[key] || 1) * value;
      else target[key] = (target[key] || 0) + value;
    }
  }

  _notify() {
    store.setState({
      heroAvailable: [...this._availableIds],
      heroes: structuredClone(this._recruited),
      heroVersion: (store.getState('heroVersion') || 0) + 1
    });
  }

  getState() {
    return { availableIds: [...this._availableIds], recruited: structuredClone(this._recruited), lastRefreshDay: this._lastRefreshDay, systemUnlocked: this._systemUnlocked, arrivalPending: this._arrivalPending, tickCounter: this._tickCounter };
  }

  restoreState(state) {
    const affinityLevelCap = this.getAffinityLevelCap();
    this._availableIds = (state?.availableIds || []).filter(id => this.getHero(id));
    this._recruited = Object.fromEntries(Object.entries(state?.recruited || {}).map(([id, entry]) => [id, {
      ...structuredClone(entry),
      heroId: entry.heroId || id,
      level: Math.max(1, Math.min(10, Math.floor(entry.level || 1))),
      experience: Math.max(0, Math.floor(entry.experience || 0)),
      affinityLevel: Math.max(0, Math.min(affinityLevelCap, Math.floor(entry.affinityLevel || 0))),
      affinityProgress: Math.floor(entry.affinityLevel || 0) >= affinityLevelCap ? 0 : Math.max(0, Math.min(99, Math.floor(entry.affinityProgress || 0)))
    }]));
    for (const entry of Object.values(this._recruited)) this._dialogueProgress(entry);
    this._lastRefreshDay = state?.lastRefreshDay || 0;
    this._tickCounter = Math.max(0, Number(state?.tickCounter) || 0);
    this._systemUnlocked = Boolean(state?.systemUnlocked);
    if (!this._systemUnlocked) {
      delete this._recruited.Hestia;
      this._availableIds = this._availableIds.filter(id => id !== 'Hestia');
    }
    // 读档时若上次正停留在到访界面，允许下一次结算重新弹出，避免永久锁死。
    this._arrivalPending = false;
    if (this._availableIds.length === 0) this._refreshOffers(store.getState('timeDay') || 1);
    this.recoverInjuredHeroes(store.getState('timeDay') || 1);
    this._notify();
  }
}
