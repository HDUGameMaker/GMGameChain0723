/**
 * CombatSystem - 战斗系统
 * 管理敌人 + 友方单位（战士/弓箭手）
 * 敌人HP=5，攻击力=1，建筑生命=(长+1)*(宽+1)，人生命=2，点击攻击力=1
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class CombatSystem {
  constructor() {
    this.enemies = [];
    /** @type {Array<{id: string, type: 'warrior'|'archer', gridX: number, gridY: number, hp: number, maxHp: number, attack: number, attackRange: number}>} */
    this.units = [];
    this._buildingSystem = null;
    this._populationSystem = null;
    this._resourceSystem = null;
    this._mapConfig = null;
    this._editMode = null;

    eventBus.on('tick', (data) => this._onTick(data));
    eventBus.on('dayStart', (data) => this._onDayStart(data));
    eventBus.on('periodChange', (data) => this._onPeriodChange(data));
  }

  // 配置读取
  get _enemyConfigs() { return configRegistry.get('enemies')?.enemies || []; }
  get _unitConfigs() { return configRegistry.get('enemies')?.units || []; }
  get _globalConfig() { return configRegistry.get('enemies')?.global || { humanHp: 2, clickAttack: 1 }; }
  get _humanHp() { return this._globalConfig.humanHp; }
  get _clickAttack() { return this._globalConfig.clickAttack; }

  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setPopulationSystem(ps) { this._populationSystem = ps; }
  setResourceSystem(rs) { this._resourceSystem = rs; }

  init() { this._mapConfig = configRegistry.get('map'); }

  enterPlaceEnemyMode(enemyId) { this._editMode = enemyId; store.setState({ combatPlaceMode: enemyId }); eventBus.emit('combatPlaceModeChanged', { enabled: true, enemyId }); }
  exitPlaceEnemyMode() { this._editMode = null; store.setState({ combatPlaceMode: false }); eventBus.emit('combatPlaceModeChanged', { enabled: false }); }
  isPlaceEnemyMode() { return this._editMode !== null; }
  getPlaceEnemyId() { return this._editMode; }

  getEnemyConfig(enemyId) { return this._enemyConfigs.find(e => e.id === enemyId) || null; }
  _getUnitConfig(type) { return this._unitConfigs.find(u => u.id === type) || null; }
  getAllEnemies() { return [...this.enemies]; }
  getAllUnits() { return [...this.units]; }
  getEnemyAt(gridX, gridY) { return this.enemies.find(e => e.gridX === gridX && e.gridY === gridY) || null; }
  getUnitAt(gridX, gridY) { return this.units.find(u => u.gridX === gridX && u.gridY === gridY) || null; }

  /** 建筑生命值 = (长+1)*(宽+1) */
  _getBuildingHp(buildingId) {
    const cfg = configRegistry.getBuilding(buildingId);
    if (!cfg) return 1;
    return (cfg.footprint.width + 1) * (cfg.footprint.height + 1);
  }

  /** 生成友方单位 */
  spawnUnit(type, nearGridX, nearGridY) {
    if (!this._mapConfig) return false;
    const unitConfig = this._getUnitConfig(type);
    if (!unitConfig) return false;

    // 在建筑附近找空地
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = nearGridX + dx;
        const y = nearGridY + dy;
        if (x < 0 || y < 0 || x >= this._mapConfig.gridWidth || y >= this._mapConfig.gridHeight) continue;
        if (this.getEnemyAt(x, y) || this.getUnitAt(x, y)) continue;
        let blocked = false;
        for (const b of this._buildingSystem.buildings) {
          const c = configRegistry.getBuilding(b.buildingId);
          if (!c) continue;
          if (x >= b.gridX && x < b.gridX + c.footprint.width && y >= b.gridY && y < b.gridY + c.footprint.height) { blocked = true; break; }
        }
        if (blocked) continue;
        this.units.push({
          id: 'unit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          type, gridX: x, gridY: y,
          hp: unitConfig.hp, maxHp: unitConfig.hp,
          attack: unitConfig.attack,
          attackRange: unitConfig.attackRange,
          attackCooldown: unitConfig.attackCooldown || 1,
          _cooldownTicks: 0
        });
        this._notify();
        eventBus.emit('unitSpawned', { type, gridX: x, gridY: y });
        return true;
      }
    }
    return false;
  }

  // ===== 自然生成敌方 =====
  _onDayStart(data) {
    for (const cfg of this._enemyConfigs) {
      if (data.day < (cfg.spawnConditions?.minDay || 1)) continue;
      if (Math.random() > 0.15) continue;
      const pos = this._findSpawnPosition();
      if (pos) this._spawnEnemyAt(cfg.id, pos.x, pos.y);
    }
  }

  _spawnEnemyAt(enemyId, gridX, gridY) {
    const cfg = this.getEnemyConfig(enemyId);
    if (!cfg) return false;
    if (this.getEnemyAt(gridX, gridY)) return false;
    for (const b of this._buildingSystem.buildings) {
      const c = configRegistry.getBuilding(b.buildingId);
      if (!c) continue;
      if (gridX >= b.gridX && gridX < b.gridX + c.footprint.width && gridY >= b.gridY && gridY < b.gridY + c.footprint.height) return false;
    }
    this.enemies.push({
      id: 'enemy_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      enemyId, gridX, gridY,
      hp: cfg.maxHp || 5, maxHp: cfg.maxHp || 5,
      spawnDay: store.getState('timeDay') || 1
    });
    this._notify();
    eventBus.emit('enemySpawned', { enemyId, gridX, gridY, name: cfg.name });
    this._broadcast(`⚠️ 发现 ${cfg.name}！`);
    return true;
  }

  _findSpawnPosition() {
    if (!this._mapConfig) return null;
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(Math.random() * this._mapConfig.gridWidth);
      const y = Math.floor(Math.random() * this._mapConfig.gridHeight);
      if (!this._mapConfig.grid[y]?.[x]) continue;
      let blocked = false;
      for (const b of this._buildingSystem.buildings) {
        const c = configRegistry.getBuilding(b.buildingId);
        if (!c) continue;
        if (x >= b.gridX && x < b.gridX + c.footprint.width && y >= b.gridY && y < b.gridY + c.footprint.height) { blocked = true; break; }
      }
      if (blocked) continue;
      if (this.getEnemyAt(x, y) || this.getUnitAt(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  // ===== 每tick AI：敌人+友方 =====
  _onTick(data) {
    let changed = false;

    // 友方单位：不自动移动，只攻击攻击范围内的敌人（由玩家拖动控制位置），有攻击间隔
    for (const unit of this.units) {
      if (unit._cooldownTicks > 0) {
        unit._cooldownTicks--;
        continue;
      }
      const nearestEnemy = this._findNearestEnemy(unit.gridX, unit.gridY);
      if (!nearestEnemy) continue;

      const dist = Math.abs(unit.gridX - nearestEnemy.gridX) + Math.abs(unit.gridY - nearestEnemy.gridY);

      if (dist <= unit.attackRange) {
        nearestEnemy.hp -= unit.attack;
        this._broadcast(`⚔️ ${unit.type === 'archer' ? '弓箭手' : '战士'} 攻击！${nearestEnemy.hp <= 0 ? '击杀敌人' : `敌人HP ${nearestEnemy.hp}`}`);
        if (nearestEnemy.hp <= 0) {
          const idx = this.enemies.indexOf(nearestEnemy);
          if (idx >= 0) this.enemies.splice(idx, 1);
          this._broadcast(`⚔️ 敌人被击杀！`);
        }
        unit._cooldownTicks = unit.attackCooldown;
        changed = true;
      }
    }

    // 敌方单位：优先攻击友方单位，其次建筑
    for (const enemy of this.enemies) {
      const cfg = this.getEnemyConfig(enemy.enemyId);
      if (!cfg) continue;

      // 先找最近的友方单位
      let nearestUnit = null, nearDist = Infinity;
      for (const unit of this.units) {
        const d = Math.abs(enemy.gridX - unit.gridX) + Math.abs(enemy.gridY - unit.gridY);
        if (d < nearDist) { nearDist = d; nearestUnit = unit; }
      }

      if (nearestUnit && nearDist <= 1) {
        // 攻击友方单位
        nearestUnit.hp -= cfg.attack || 1;
        this._broadcast(`💥 ${cfg.name} 攻击${nearestUnit.type === 'archer' ? '弓箭手' : '战士'}！`);
        if (nearestUnit.hp <= 0) {
          const idx = this.units.indexOf(nearestUnit);
          if (idx >= 0) this.units.splice(idx, 1);
          this._broadcast(`💀 单位阵亡！`);
        }
        changed = true;
      } else if (nearestUnit && nearDist > 1) {
        // 向友方单位移动
        if (this._moveGeneric(enemy, nearestUnit.gridX, nearestUnit.gridY)) changed = true;
      } else {
        // 没有友方单位 → 攻击建筑
        const target = this._findNearestTarget(enemy, cfg);
        if (!target) {
          if (this._moveGeneric(enemy, Math.floor(this._mapConfig.gridWidth/2), Math.floor(this._mapConfig.gridHeight/2))) changed = true;
          continue;
        }
        const dist = this._distToBuilding(enemy.gridX, enemy.gridY, target);
        if (dist <= 1) {
          this._doAttack(enemy, cfg, target);
        } else {
          const tCfg = configRegistry.getBuilding(target.buildingId);
          if (tCfg) {
            if (this._moveGeneric(enemy, target.gridX + Math.floor(tCfg.footprint.width/2), target.gridY + Math.floor(tCfg.footprint.height/2))) changed = true;
          }
        }
      }
    }

    // ===== 医疗站治疗 =====
    if (this._buildingSystem) {
      for (const b of this._buildingSystem.buildings) {
        if (b.buildingId !== 'medical_station' || b.status !== 'active') continue;
        const workers = b.currentWorkers || 0;
        if (workers <= 0) continue;

        // 找附近1格内的受伤单位
        const healTargets = [];
        for (const unit of this.units) {
          if (unit.hp >= unit.maxHp) continue;
          const dist = Math.abs(unit.gridX - b.gridX) + Math.abs(unit.gridY - b.gridY);
          if (dist <= 1) {
            healTargets.push(unit);
          }
        }

        // 最多治疗 workers 个
        const healCount = Math.min(healTargets.length, workers);
        for (let i = 0; i < healCount; i++) {
          healTargets[i].hp = Math.min(healTargets[i].hp + 1, healTargets[i].maxHp);
          changed = true;
        }
        if (healCount > 0) {
          this._broadcast(`💚 医疗站治疗了 ${healCount} 名士兵`);
        }
      }

      // ===== 维修站修复建筑 =====
      for (const b of this._buildingSystem.buildings) {
        if (b.buildingId !== 'repair_station' || b.status !== 'active') continue;
        const workers = b.currentWorkers || 0;
        if (workers <= 0) continue;

        // 找附近1格内受损伤的建筑
        const repairTargets = [];
        for (const building of this._buildingSystem.buildings) {
          if (building === b) continue; // 维修站自己
          if (!building._damage || building._damage <= 0) continue;
          const dist = Math.abs(building.gridX - b.gridX) + Math.abs(building.gridY - b.gridY);
          if (dist <= 1) {
            repairTargets.push(building);
          }
        }

        // 最多修复 workers 个
        const repairCount = Math.min(repairTargets.length, workers);
        for (let i = 0; i < repairCount; i++) {
          repairTargets[i]._damage = Math.max(0, repairTargets[i]._damage - 1);
          changed = true;
        }
        if (repairCount > 0) {
          this._broadcast(`🔧 维修站修复了 ${repairCount} 个建筑`);
        }
      }
    }

    if (changed) this._notify();
  }

  _findNearestEnemy(ex, ey) {
    let best = null, bestDist = Infinity;
    for (const e of this.enemies) {
      const d = Math.abs(ex - e.gridX) + Math.abs(ey - e.gridY);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  _findNearestTarget(enemy, cfg) {
    if (!this._buildingSystem) return null;
    const isWild = !enemy.enemyId.startsWith('robot');
    let best = null, bestDist = Infinity;
    for (const b of this._buildingSystem.buildings) {
      if (b.status !== 'active') continue;
      const bCfg = configRegistry.getBuilding(b.buildingId);
      if (!bCfg) continue;
      if (isWild && !bCfg.tags?.includes('dorm') && best) continue;
      const d = this._distToBuilding(enemy.gridX, enemy.gridY, b);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  _distToBuilding(ex, ey, building) {
    const cfg = configRegistry.getBuilding(building.buildingId);
    if (!cfg) return Infinity;
    const dx = Math.max(0, building.gridX - ex, ex - (building.gridX + cfg.footprint.width - 1));
    const dy = Math.max(0, building.gridY - ey, ey - (building.gridY + cfg.footprint.height - 1));
    return dx + dy;
  }

  /** 通用的移动函数（避开建筑、敌人、友方单位） */
  _moveGeneric(entity, tx, ty) {
    const dx = Math.sign(tx - entity.gridX);
    const dy = Math.sign(ty - entity.gridY);
    const choices = [];
    if (dx !== 0) choices.push({ gridX: entity.gridX + dx, gridY: entity.gridY });
    if (dy !== 0) choices.push({ gridX: entity.gridX, gridY: entity.gridY + dy });
    if (dx !== 0) choices.push({ gridX: entity.gridX + dx, gridY: entity.gridY + (dy || 1) });
    if (dy !== 0) choices.push({ gridX: entity.gridX + (dx || 1), gridY: entity.gridY + dy });
    choices.push({ gridX: entity.gridX + 1, gridY: entity.gridY }, { gridX: entity.gridX - 1, gridY: entity.gridY });
    choices.push({ gridX: entity.gridX, gridY: entity.gridY + 1 }, { gridX: entity.gridX, gridY: entity.gridY - 1 });

    for (const pos of choices) {
      if (pos.gridX < 0 || pos.gridY < 0) continue;
      if (!this._mapConfig) continue;
      if (pos.gridX >= this._mapConfig.gridWidth || pos.gridY >= this._mapConfig.gridHeight) continue;
      if (this.getEnemyAt(pos.gridX, pos.gridY) || this.getUnitAt(pos.gridX, pos.gridY)) continue;
      let blocked = false;
      for (const b of this._buildingSystem.buildings) {
        const c = configRegistry.getBuilding(b.buildingId);
        if (!c) continue;
        if (pos.gridX >= b.gridX && pos.gridX < b.gridX + c.footprint.width && pos.gridY >= b.gridY && pos.gridY < b.gridY + c.footprint.height) { blocked = true; break; }
      }
      if (blocked) continue;
      entity.gridX = pos.gridX;
      entity.gridY = pos.gridY;
      return true;
    }
    return false;
  }

  // ===== 攻击（敌人打建筑） =====
  _doAttack(enemy, cfg, targetBuilding) {
    const isRobot = enemy.enemyId.startsWith('robot');
    if (isRobot) {
      const hp = this._getBuildingHp(targetBuilding.buildingId);
      if (!targetBuilding._damage) targetBuilding._damage = 0;
      targetBuilding._damage += cfg.attack || 1;
      this._broadcast(`💥 ${cfg.name} 攻击建筑！(${targetBuilding._damage}/${hp})`);
      if (targetBuilding._damage >= hp) {
        const bCfg = configRegistry.getBuilding(targetBuilding.buildingId);
        const idx = this._buildingSystem.buildings.indexOf(targetBuilding);
        if (idx >= 0) {
          this._buildingSystem.demolishBuilding(idx, true);
          this._broadcast(`💥 ${cfg.name} 摧毁了 ${bCfg?.name || targetBuilding.buildingId}！`);
          eventBus.emit('populationChanged', { current: this._populationSystem.current, direction: 'enemy' });
        }
        targetBuilding._damage = 0;
      }
      if (targetBuilding.currentWorkers > 0) {
        targetBuilding.currentWorkers -= 1;
        this._broadcast(`💀 ${cfg.name} 袭击了建筑！1 名工人遇害`);
      }
      this._notify();
    } else {
      if (!targetBuilding._humanDamage) targetBuilding._humanDamage = 0;
      targetBuilding._humanDamage += cfg.attack || 1;
      if (targetBuilding._humanDamage >= 2) {
        targetBuilding._humanDamage = 0;
        this._populationSystem.current = Math.max(0, this._populationSystem.current - 1);
        this._populationSystem.refresh();
        this._broadcast(`💀 ${cfg.name} 袭击！损失 1 人口`);
      }
    }
    eventBus.emit('populationChanged', { current: this._populationSystem.current, direction: 'enemy' });
  }

  // ===== 玩家反击 =====
  playerAttack(gridX, gridY) {
    const idx = this.enemies.findIndex(e => e.gridX === gridX && e.gridY === gridY);
    if (idx === -1) return null;
    const enemy = this.enemies[idx];
    const cfg = this.getEnemyConfig(enemy.enemyId);
    if (!cfg) return null;
    enemy.hp -= this._clickAttack;
    if (enemy.hp <= 0) {
      this.enemies.splice(idx, 1);
      this._notify();
      this._broadcast(`⚔️ 成功击杀 ${cfg.name}！`);
      if (cfg.drops) {
        for (const drop of cfg.drops) {
          if (Math.random() < (drop.chance || 1)) {
            this._resourceSystem?.add(drop.resourceId, drop.amount);
            this._broadcast(`📦 获得 ${drop.resourceId} ×${drop.amount}`);
          }
        }
      }
      eventBus.emit('enemyKilled', { enemyId: enemy.enemyId, gridX, gridY });
      return { killed: true, enemyId: enemy.enemyId };
    } else {
      this._broadcast(`⚔️ 反击！${cfg.name} 剩余 HP ${enemy.hp}/${cfg.maxHp}`);
      this._notify();
      return { killed: false, enemyId: enemy.enemyId, hp: enemy.hp };
    }
  }

  // ===== 广播 =====
  _broadcast(msg) { eventBus.emit('combatBroadcast', { message: msg }); console.log('[Combat] ' + msg); }
  _notify() { if (!this._version) this._version = 0; store.setState({ combatVersion: ++this._version }); }
  _onPeriodChange(data) {}

  // ===== 存档 =====
  getState() { return { enemies: this.enemies.map(e => ({ ...e })), units: this.units.map(u => ({ ...u })) }; }
  restoreState(state) {
    if (!state?.enemies) { this.enemies = []; } else { this.enemies = state.enemies.map(e => ({ ...e })); }
    if (!state?.units) { this.units = []; } else { this.units = state.units.map(u => ({ ...u })); }
    this._notify();
  }
}
