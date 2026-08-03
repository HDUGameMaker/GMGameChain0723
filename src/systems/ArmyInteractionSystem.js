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
  blocked_building: '军团不能与普通建筑重合。'
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

  setSystems({ army, building, wildSites, diplomacy, combat, enemyExpansion, popupManager } = {}) {
    this._army = army || null;
    this._building = building || null;
    this._wildSites = wildSites || null;
    this._diplomacy = diplomacy || null;
    this._combat = combat || null;
    this._enemyExpansion = enemyExpansion || null;
    this._popupManager = popupManager || null;
  }

  _context(gridX, gridY) {
    const combatEnemies = (this._combat?.getAllEnemies?.() || []).map(enemy => ({ ...enemy, source: 'combat' }));
    const expansionEnemies = (this._enemyExpansion?.getAllCells?.() || []).map(enemy => ({ ...enemy, source: 'expansion' }));
    return {
      gridX,
      gridY,
      armies: this._army?.getArmies?.() || [],
      buildings: this._building?.buildings || [],
      wildSites: this._wildSites?.getVisibleSites?.() || [],
      cityStates: this._diplomacy?.getVisibleOutposts?.() || [],
      enemies: [...combatEnemies, ...expansionEnemies],
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
      garrison: classified.buildingConfig?.name || '防御建筑'
    };
    const verbs = { wild_site: '进攻', city_state: '进攻', enemy: '交战', garrison: '进入驻防' };
    const confirmed = await this._confirm(`是否让该军团${verbs[classified.kind] || '交互'}${labels[classified.kind] || '目标'}？`, '军团行动确认');
    if (!confirmed) return { ok: false, reason: 'cancelled', target: classified };

    let result;
    if (classified.kind === 'wild_site') {
      result = this._wildSites?.attackWithArmy?.(classified.siteId, armyId) || { ok: false, reason: 'unknown_site' };
    } else if (classified.kind === 'city_state') {
      result = this._diplomacy?.attackOutpost?.(classified.cityStateId, {
        power: this._army.getArmyPower?.(armyId) || 0,
        armyId
      }) || { ok: false, reason: 'unknown_city_state' };
    } else if (classified.kind === 'garrison') {
      result = this._army.garrisonArmy?.(armyId, classified.buildingIndex) || { ok: false, reason: 'invalid_garrison' };
    } else if (classified.kind === 'enemy') {
      if (classified.enemyArmyId) result = this._army.resolveEngagement?.(armyId, classified.enemyArmyId);
      else if (classified.source === 'expansion') result = { ok: this._enemyExpansion?.clearEnemyCell?.(classified.gridX, classified.gridY) === true, reason: 'enemy_unavailable' };
      else result = this._combat?.playerAttack?.(classified.gridX, classified.gridY) || { ok: false, reason: 'enemy_unavailable' };
      if (result && result.ok == null) result = { ok: true, ...result };
    } else {
      result = { ok: false, reason: 'invalid_target' };
    }
    return this._alertFailure(result);
  }
}
