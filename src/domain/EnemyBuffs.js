/**
 * EnemyBuffs - 敌人实例加成(与玩家侧 getBonuses 一致的"计算时叠加"风格)
 *
 * 敌人实例(城邦驻军 army / raid cell)保留 enemies.json 的基础数值,只挂 buff;
 * 所有读取战斗数值的入口(hp/maxHp/attack)都从"基础 × 加成"叠加后获取。
 * 加成可以小于 1:玩家战力弱时,进攻单位数值可以低于配置基础值。
 *
 * buff 类型:
 * - power_scale: { type, hpMul, attackMul } 按目标综合强度缩放生命/攻击
 *   (综合强度公式对 hp/attack 线性,同比例缩放误差 <10%,speed/range/cp 不缩放)
 */
export const POWER_SCALE = 'power_scale';

/** 玩家太弱时的最低缩放倍率(配置可覆盖,见 world-factions settings.powerScaleMin) */
export const DEFAULT_MIN_SCALE = 0.2;

/**
 * 生成 power_scale 加成:使基础单位(unit)的综合强度精确达到 targetStrength。
 * 综合强度 = (hp + 1.2×attack + 固定项) × 1.3,其中固定项 = (speed-1)×30 + (attackRange-1)×50;
 * 同比例缩放 hp/attack 时固定项不缩放,所以按"目标 - 固定项"反推倍率,误差为 0。
 * targetStrength 低于基础强度时倍率 < 1(敌人弱于配置基础值)。
 */
export function makePowerScaleBuff(targetStrength, unit = {}, minScale = DEFAULT_MIN_SCALE) {
  const hp = Math.max(0, Number(unit?.hp ?? unit?.maxHp) || 0);
  const attack = Math.max(0, Number(unit?.attack) || 0);
  const speed = Math.max(1, Number(unit?.speed) || 1);
  const attackRange = Math.max(1, Number(unit?.attackRange) || 1);
  const cp = Math.max(1, Number(unit?.cp) || 1);
  const fixedCore = ((speed - 1) * 30 + (attackRange - 1) * 50) * cp * 1.3;
  const variableCore = (hp + attack * 1.2) * cp * 1.3;
  const target = Math.max(0, Number(targetStrength) || 0);
  let factor = variableCore > 0 ? (target - fixedCore) / variableCore : 1;
  if (!Number.isFinite(factor) || factor < (Number(minScale) || DEFAULT_MIN_SCALE)) {
    factor = Number(minScale) || DEFAULT_MIN_SCALE;
  }
  return { type: POWER_SCALE, hpMul: factor, attackMul: factor };
}

/**
 * 叠加 buff 到基础值上。
 * @param {{hp:number, maxHp:number, attack:number}} base 基础(配置表)数值
 * @param {Array} buffs 实例挂载的 buff 列表
 * @returns {{maxHp:number, hp:number, attack:number}} 叠加后数值
 *   hp 按基础 hp/maxHp 比例保持(扣血比例不变)
 */
export function applyEnemyBuffs(base = {}, buffs = []) {
  let hpMul = 1;
  let attackMul = 1;
  for (const buff of buffs || []) {
    if (!buff || buff.type !== POWER_SCALE) continue;
    hpMul *= Number(buff.hpMul) || 1;
    attackMul *= Number(buff.attackMul) || 1;
  }
  const baseMax = Math.max(1, Number(base.maxHp ?? base.hp) || 1);
  const baseHp = Math.max(0, Number(base.hp) ?? baseMax);
  const hpRatio = baseHp > 0 ? baseHp / baseMax : 1;
  const maxHp = Math.max(1, Math.round(baseMax * hpMul));
  return {
    maxHp,
    hp: Math.max(0, Math.round(maxHp * hpRatio)),
    attack: Math.max(0, Math.round((Number(base.attack) || 0) * attackMul))
  };
}
