export function evaluateTrainingEligibility({
  unit, canAfford, soldierCount, soldierCap, isUnlocked, hasNavalFacility,
  currentEraOrder = null, unitEraOrder = null, activeBuildingIds = null,
  selectedCivilizationId = null, legacyCivilizationIds = null, availablePopulation = null
}) {
  const failures = [];
  const reject = (code, message) => failures.push({ code, message });

  if (!canAfford) reject('insufficient_resources', '资源不足');
  if (soldierCount >= soldierCap) reject('soldier_capacity_full', `士兵已达上限 ${soldierCap}（建造或升级军营/港口）`);
  if (!isUnlocked) reject('unit_locked', '兵种尚未研发');
  if (unit?.domain === 'naval' && !hasNavalFacility) reject('naval_facility_required', '需要先建造并启用海军设施');
  if (currentEraOrder !== null && unitEraOrder !== null && unitEraOrder > currentEraOrder) {
    reject('era_locked', '尚未进入该兵种所属时代');
  }
  // Legacy callers may still validate the former global-building rule. Building-scoped
  // training performs its stronger branch check before calling this helper and omits it.
  if (Array.isArray(activeBuildingIds) && unit?.trainingBuildingId && !activeBuildingIds.includes(unit.trainingBuildingId)) {
    reject('training_building_required', `需要启用训练建筑：${unit.trainingBuildingId}`);
  }
  if (unit?.civilizationId) {
    // 归属文明 = 当前时代所选 + 历代已选(与建筑面板的文明可见性规则一致)
    const owned = new Set([...(legacyCivilizationIds || []), selectedCivilizationId].filter(Boolean));
    if (!owned.has(unit.civilizationId)) {
      reject('civilization_mismatch', '该特色兵种属于其他文明');
    }
  }
  if (availablePopulation !== null && availablePopulation < (unit?.populationRequired || 1)) {
    reject('insufficient_population', `空闲人口不足（需要 ${unit?.populationRequired || 1}）`);
  }
  return {
    ok: failures.length === 0,
    reasons: failures.map(failure => failure.message),
    reasonCodes: failures.map(failure => failure.code)
  };
}
