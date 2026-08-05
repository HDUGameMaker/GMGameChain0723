import { configRegistry } from '../core/ConfigRegistry.js';
import { classifyArmyInteractionTarget } from '../domain/ArmyInteractionTarget.js';

const REASON_MESSAGES = Object.freeze({
  unknown_army: '未找到可操作的军团。',
  army_garrisoned: '驻防中的军团需要先离开驻地。',
  invalid_target: '目标地点无效。',
  tile_occupied_by_building: '军团不能与普通建筑重合。',
  incompatible_terrain: '军团与目标地形不兼容。',
  no_path: '无法到达目标格，路径可能被阻挡。',
  invalid_garrison: '该驻防建筑无效或尚未投入使用。',
  land_army_required: '只有陆军可以进入该驻防建筑。',
  not_a_fortification: '该建筑不能驻防军团。',
  garrison_too_far: '军团必须位于建筑相邻格才能进入驻防。',
  garrison_full: '该建筑的驻军已满。',
  army_unavailable: '该军团当前无法参与交互。',
  unknown_site: '野外目标已不存在。',
  site_inactive: '该野外目标已被清剿。',
  blocked_building: '军团不能与普通建筑重合。',
  army_power_insufficient: '该军团战力不足，无法击败此目标。',
  enemy_unavailable: '敌方目标已经不存在。',
  target_out_of_range: '目标超出军团攻击距离。',
  insufficient_cp: '军团CP不足，需要等待下一个tick恢复。',
  unknown_ruin: '遗迹已经不存在。',
  ruin_guards_remaining: '必须先击败该遗迹的全部守卫。',
  stele_too_far: '军团必须移动到石碑相邻地格才能激活。',
  stele_already_activated: '这座石碑已经激活。',
  teleport_source_too_far: '军团必须靠近另一座已激活石碑才能进行传送。',
  teleport_destination_blocked: '目标石碑周围没有可供军团落脚的地格。'
});

export function getArmyInteractionReasonMessage(reason) {
  return REASON_MESSAGES[reason] || (typeof reason === 'string' && /[\u3400-\u9fff]/u.test(reason)
    ? reason
    : `军团交互失败：${reason || '未知原因'}`);
}

export class ArmyInteractionSystem {
  constructor(systems = {}) {
    this.setSystems(systems);
  }

  setSystems({ army, building, wildSites, diplomacy, combat, enemyExpansion, ruins, popupManager } = {}) {
    this._army = army || null;
    this._building = building || null;
    this._wildSites = wildSites || null;
    this._diplomacy = diplomacy || null;
    this._combat = combat || null;
    this._enemyExpansion = enemyExpansion || null;
    this._ruins = ruins || null;
    this._popupManager = popupManager || null;
  }

  _context(gridX, gridY) {
    const combatEnemies = (this._combat?.getAllEnemies?.() || []).map(enemy => ({ ...enemy, source: 'combat' }));
    const expansionEnemies = (this._enemyExpansion?.getAllCells?.() || []).map(enemy => ({ ...enemy, source: 'expansion' }));
    const garrisonEnemies = this._diplomacy?.getGarrisonArmies?.() || [];
    const ruinGuards = (this._ruins?.getGuards?.() || []).map(enemy => ({ ...enemy, source: 'ruin_guard' }));
    return {
      gridX,
      gridY,
      armies: this._army?.getArmies?.() || [],
      buildings: this._building?.buildings || [],
      wildSites: this._wildSites?.getVisibleSites?.() || [],
      cityStates: this._diplomacy?.getVisibleOutposts?.() || [],
      enemies: [...combatEnemies, ...expansionEnemies, ...garrisonEnemies, ...ruinGuards],
      ruins: this._ruins?.getRuins?.() || [],
      getBuildingConfig: buildingId => this._building?.getBuildingConfig?.(buildingId) || configRegistry.getBuilding?.(buildingId)
    };
  }

  async _alertFailure(result) {
    if (!result?.ok) await this._popupManager?.alert?.(getArmyInteractionReasonMessage(result?.reason));
    return result;
  }

  async _confirm(message, title) {
    if (!this._popupManager?.confirm) return true;
    return this._popupManager.confirm(message, { title, okText: '确认', cancelText: '取消' });
  }

  async _showBattleRewards(result, title = '战利品结算') {
    if (!result?.victory && !result?.enemyDefeated && !result?.destroyed) return;
    const rewards = result.materialDrops || result.rewards || [];
    const rows = rewards.filter(reward => Number(reward?.amount) > 0).map(reward => {
      const resourceId = reward.resourceId || reward.id;
      return `${configRegistry.getResource(resourceId)?.name || resourceId} ×${reward.amount}`;
    });
    const luxuryId = result.luxuryDrop;
    if (luxuryId) {
      const luxury = (configRegistry.getHistoricalContent?.().luxuries || []).find(item => item.id === luxuryId);
      rows.push(`${luxury?.name || luxuryId} ×1`);
    }
    await this._popupManager?.alert?.(rows.length ? `获得：\n${rows.map(row => `• ${row}`).join('\n')}` : '本次战斗没有获得可存入仓库的物资。', {
      title,
      okText: '收下战利品'
    });
  }

  async request({ armyId, gridX, gridY, target = null } = {}) {
    const army = this._army?.getArmy?.(armyId)
      || this._army?.getArmies?.().find(item => item.id === armyId);
    if (!army || (army.ownerId && army.ownerId !== 'player')) {
      return this._alertFailure({ ok: false, reason: 'unknown_army' });
    }

    const classified = target || classifyArmyInteractionTarget(this._context(gridX, gridY));
    if (classified.kind === 'move') {
      return this._alertFailure(this._army.issueMoveOrder(armyId, classified.gridX, classified.gridY));
    }
    if (classified.kind === 'blocked_building') {
      return this._alertFailure({ ok: false, reason: 'blocked_building' });
    }

    const labels = {
      wild_site: classified.site?.name || '野外目标',
      city_state: classified.cityState?.name || '城邦',
      enemy: classified.enemy?.name || '敌对目标',
      garrison: classified.buildingConfig?.name || '防御建筑',
      ruin_stele: classified.ruin?.name || '遗迹石碑'
    };
    const verbs = { wild_site: '进攻', city_state: '进攻', enemy: '交战', garrison: '进入驻防', ruin_stele: classified.ruin?.activated ? '传送至' : '激活' };
    if (['wild_site', 'city_state', 'enemy'].includes(classified.kind) && this._army?.canAttackTarget) {
      const rangeCheck = this._army.canAttackTarget(armyId, classified.gridX, classified.gridY);
      if (!rangeCheck.ok) {
        if (classified.kind === 'enemy' && rangeCheck.reason === 'target_out_of_range') {
          const moveResult = this._army.issueMoveOrder?.(armyId, classified.gridX, classified.gridY)
            || { ok: false, reason: 'no_path' };
          return this._alertFailure(moveResult.ok
            ? { ...moveResult, movingTowardEnemy: true, target: classified }
            : moveResult);
        }
        return this._alertFailure(rangeCheck);
      }
    }
    const confirmed = await this._confirm(`是否让该军团${verbs[classified.kind] || '交互'}${labels[classified.kind] || '目标'}？`, '军团行动确认');
    if (!confirmed) return { ok: false, reason: 'cancelled', target: classified };

    let result;
    if (classified.kind === 'wild_site') {
      const enemyModel = this._wildSites?.getSiteCombatProfile?.(classified.siteId) || classified.site || {};
      const playerStats = this._army.getArmyStats?.(armyId) || {};
      const playerModel = { ...army, ...playerStats, portrait: army.heroPortrait || army.heroIcon || army.icon };
      const resolveBattle = () => this._wildSites?.attackWithArmy?.(classified.siteId, armyId) || { ok: false, reason: 'unknown_site' };
      result = this._popupManager?.previewBattle
        ? await this._popupManager.previewBattle({ enemy: enemyModel, player: playerModel, distance: Math.abs(army.gridX - classified.gridX) + Math.abs(army.gridY - classified.gridY), resolveBattle })
        : resolveBattle();
      await this._showBattleRewards(result, `${classified.site?.name || '野外据点'}战利品`);
    } else if (classified.kind === 'city_state') {
      const state = this._diplomacy?.getOutpostState?.(classified.cityStateId) || {};
      const defense = this._diplomacy?.getOutpostDefense?.(classified.cityStateId) || state.maxHp || 1;
      const enemyModel = {
        name: classified.cityState?.name || '敌对城邦', faction: '敌对城邦',
        icon: classified.cityState?.icon || '', hp: Math.max(1, Number(state.hp) || defense), maxHp: Math.max(1, Number(state.maxHp) || defense),
        attack: Math.max(1, Math.round(defense * 0.25)), speed: 1, attackRange: 1, cp: 1
      };
      const playerStats = this._army.getArmyStats?.(armyId) || {};
      const playerModel = { ...army, ...playerStats, portrait: army.heroPortrait || army.heroIcon || army.icon };
      const resolveBattle = () => this._diplomacy?.attackOutpost?.(classified.cityStateId, {
        power: this._army.getArmyPower?.(armyId) || 0,
        armyId
      }) || { ok: false, reason: 'unknown_city_state' };
      result = this._popupManager?.previewBattle
        ? await this._popupManager.previewBattle({ enemy: enemyModel, player: playerModel, distance: Math.abs(army.gridX - classified.gridX) + Math.abs(army.gridY - classified.gridY), resolveBattle })
        : resolveBattle();
      await this._showBattleRewards(result, `${classified.cityState?.name || '城邦'}征服战利品`);
    } else if (classified.kind === 'garrison') {
      result = this._army.garrisonArmy?.(armyId, classified.buildingIndex) || { ok: false, reason: 'invalid_garrison' };
    } else if (classified.kind === 'ruin_stele') {
      result = this._ruins?.activateStele?.(classified.ruinId, armyId) || { ok: false, reason: 'unknown_ruin' };
    } else if (classified.kind === 'enemy') {
      const resolveBattle = () => {
        if (classified.enemyArmyId) return this._army.resolveEngagement?.(armyId, classified.enemyArmyId);
        if (classified.source === 'combat') return this._combat?.attackEnemyWithArmy?.(classified.enemy.id, armyId) || { ok: false, reason: 'enemy_unavailable' };
        if (classified.source === 'ruin_guard') return this._ruins?.attackGuardWithArmy?.(classified.enemy.id, armyId) || { ok: false, reason: 'enemy_unavailable' };
        if (classified.source === 'expansion') return this._enemyExpansion?.clearEnemyCellWithArmy?.(classified.gridX, classified.gridY, armyId) || { ok: false, reason: 'enemy_unavailable' };
        if (classified.source === 'city_state_garrison') return this._diplomacy?.attackGarrison?.(classified.enemyId, armyId) || { ok: false, reason: 'enemy_unavailable' };
        return { ok: false, reason: 'enemy_unavailable' };
      };
      const playerStats = this._army.getArmyStats?.(armyId) || {};
      const playerModel = { ...army, ...playerStats, portrait: army.heroPortrait || army.heroIcon || army.icon };
      const enemyModel = { ...classified.enemy, hp: classified.enemy.hp ?? classified.enemy.maxHp ?? 1, maxHp: classified.enemy.maxHp ?? classified.enemy.hp ?? 1 };
      result = this._popupManager?.previewBattle
        ? await this._popupManager.previewBattle({ enemy: enemyModel, player: playerModel, distance: Math.abs(army.gridX - classified.gridX) + Math.abs(army.gridY - classified.gridY), resolveBattle })
        : resolveBattle();
      if (result && result.ok == null) result = { ok: true, ...result };
      if (classified.source === 'combat') await this._showBattleRewards(result, `${classified.enemy?.name || '野怪'}战利品`);
    } else {
      result = { ok: false, reason: 'invalid_target' };
    }
    return this._alertFailure(result);
  }
}
