export function evaluateTrainingEligibility({
  unit, canAfford, soldierCount, soldierCap, isUnlocked, hasNavalFacility,
  currentEraOrder = null, unitEraOrder = null, activeBuildingIds = null,
  selectedCivilizationId = null, availablePopulation = null
}) {
  const reasons = [];
  if (!canAfford) reasons.push('资源不足');
  if (soldierCount >= soldierCap) reasons.push(`士兵已达上限 ${soldierCap}（建造或升级军营/港口）`);
  if (!isUnlocked) reasons.push('兵种尚未研发');
  if (unit?.domain === 'naval' && !hasNavalFacility) reasons.push('需要先建造并启用海军设施');
  if (currentEraOrder !== null && unitEraOrder !== null && unitEraOrder > currentEraOrder) {
    reasons.push('尚未进入该兵种所属时代');
  }
  if (Array.isArray(activeBuildingIds) && unit?.trainingBuildingId && !activeBuildingIds.includes(unit.trainingBuildingId)) {
    reasons.push(`需要启用训练建筑：${unit.trainingBuildingId}`);
  }
  if (unit?.civilizationId && selectedCivilizationId !== unit.civilizationId) {
    reasons.push('该特色兵种属于其他文明');
  }
  if (availablePopulation !== null && availablePopulation < (unit?.populationRequired || 1)) {
    reasons.push(`空闲人口不足（需要 ${unit?.populationRequired || 1}）`);
  }
  return { ok: reasons.length === 0, reasons };
}
