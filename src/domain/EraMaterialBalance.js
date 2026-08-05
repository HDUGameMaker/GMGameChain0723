export const ERA_PROCESSING_STAGE_COUNT = 4;
export const ERA_PROCESSING_INPUTS = Object.freeze([4, 3, 4, 3]);
export const ERA_PROCESSING_OUTPUT = 2;

export function getRawMaterialEquivalent(stageCount = ERA_PROCESSING_STAGE_COUNT) {
  return ERA_PROCESSING_INPUTS.slice(0, stageCount)
    .reduce((equivalent, input) => equivalent * input / ERA_PROCESSING_OUTPUT, 1);
}

export function getProcessingWorkerTicksPerMaterial(stageCount = ERA_PROCESSING_STAGE_COUNT) {
  let workerTicks = 0;
  let requiredOutput = 1;
  for (let stage = stageCount - 1; stage >= 0; stage -= 1) {
    workerTicks += requiredOutput / ERA_PROCESSING_OUTPUT;
    requiredOutput *= ERA_PROCESSING_INPUTS[stage] / ERA_PROCESSING_OUTPUT;
  }
  return workerTicks;
}

export function estimateLateGameWoodBalance({
  resourceNodes = 50,
  workersPerNode = 1,
  baseWoodPerWorker = 4,
  productionMultiplier = 13.43,
  processorBuildings = 6,
  processorWorkers = 4,
  totalProcessingWorkers = 70,
  workTicksPerDay = 6,
  modernMaterialDemand = 1556
} = {}) {
  const rawWoodPerTick = resourceNodes * workersPerNode * baseWoodPerWorker * productionMultiplier;
  const rawEquivalentPerModernMaterial = getRawMaterialEquivalent();
  const rawLimitedModernPerTick = rawWoodPerTick / rawEquivalentPerModernMaterial;
  const processingLimitedModernPerTick = processorBuildings * processorWorkers * ERA_PROCESSING_OUTPUT;
  const processingWorkerTicksPerModernMaterial = getProcessingWorkerTicksPerMaterial();
  const laborLimitedModernPerTick = totalProcessingWorkers / processingWorkerTicksPerModernMaterial;
  const modernMaterialPerTick = Math.min(rawLimitedModernPerTick, processingLimitedModernPerTick, laborLimitedModernPerTick);
  return {
    rawWoodPerTick,
    rawEquivalentPerModernMaterial,
    rawLimitedModernPerTick,
    processingLimitedModernPerTick,
    processingWorkerTicksPerModernMaterial,
    laborLimitedModernPerTick,
    modernMaterialPerTick,
    ticksForModernDemand: modernMaterialDemand / modernMaterialPerTick,
    daysForModernDemand: modernMaterialDemand / modernMaterialPerTick / workTicksPerDay
  };
}
