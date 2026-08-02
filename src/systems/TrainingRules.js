export function evaluateTrainingEligibility({
  unit, canAfford, soldierCount, soldierCap, isUnlocked, hasNavalFacility
}) {
  const reasons = [];
  if (!canAfford) reasons.push('资源不足');
  if (soldierCount >= soldierCap) reasons.push(`士兵已达上限 ${soldierCap}（建造或升级军营/港口）`);
  if (!isUnlocked) reasons.push('兵种尚未研发');
  if (unit?.domain === 'naval' && !hasNavalFacility) reasons.push('需要先建造并启用海军设施');
  return { ok: reasons.length === 0, reasons };
}
