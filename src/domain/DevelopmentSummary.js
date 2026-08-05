const finite = (value, fallback = 1) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function getDevelopmentSummary(systems = {}) {
  const era = systems.era?.getCurrentEra?.() || null;
  const civilization = systems.era?.getSelectedCivilization?.() || null;
  const population = systems.population?.getPopulationStats?.(systems.combat) || {};
  const culture = systems.culture?.getEffects?.() || {};
  const tech = systems.tech?.getEffects?.() || {};
  const hero = systems.hero?.getBonuses?.() || {};
  const luxury = systems.luxury?.getBonuses?.() || {};
  const army = systems.army?.getArmyStatMultipliers?.() || { attack: 1, hp: 1 };
  const eraBonuses = systems.era?.getBonuses?.() || {};
  const scienceIncome = systems.tech?.getPointIncomeBreakdown?.() || {};
  const civicIncome = systems.culture?.getPointIncomeBreakdown?.() || {};
  const production = resourceId => finite(systems.building?.getProductionMultiplier?.(resourceId));
  const resourceIds = ['wood', 'stone', 'food', 'gold'];

  return {
    eraName: era?.name || '尚未确定',
    civilizationName: civilization?.name || '尚未选择',
    population: finite(population.total ?? systems.population?.current, 0),
    housing: finite(population.housing ?? systems.population?.getHousingCapacity?.(), 0),
    multipliers: [
      { id: 'production', label: '资源产出速度', value: production(null) },
      ...resourceIds.map(id => ({ id: `production_${id}`, label: `${systems.resource?.getResourceName?.(id) || ({ wood: '木材', stone: '石材', food: '食物', gold: '黄金' })[id]}产出`, value: production(id) })),
      { id: 'research', label: '研究项目推进速度', value: finite(culture.researchSpeedMul) * finite(hero.researchSpeedMul) },
      { id: 'science', label: '科技点产出倍率', value: finite(eraBonuses.sciencePointMul) * finite(eraBonuses.civilizationYieldMul) * finite(luxury.sciencePointMul) },
      { id: 'culture', label: '人文点产出倍率', value: finite(eraBonuses.civicPointMul) * finite(eraBonuses.civilizationYieldMul) * finite(luxury.civicPointMul) },
      { id: 'army_attack', label: '军队攻击力', value: finite(army.attack) },
      { id: 'army_hp', label: '军队生命值', value: finite(army.hp) },
      { id: 'army_speed', label: '军队移动速度', value: finite(army.speed) },
      { id: 'growth', label: '人口增长速度', value: finite(systems.population?.getGrowthMultiplier?.(), finite(culture.growthMul) * finite(luxury.growthMul)) },
      { id: 'housing_mul', label: '人口容量', value: finite(luxury.housingCapacityMul) },
      { id: 'food_consume', label: '人口食物消耗', value: finite(culture.foodConsumeMul) * finite(luxury.foodConsumeMul) },
      { id: 'build_cost', label: '建筑建造成本', value: finite(culture.buildCostMul) * finite(hero.buildCostMul) * finite(luxury.buildCostMul) },
      { id: 'build_speed', label: '建筑建造速度', value: finite(tech.buildSpeedMul) * finite(culture.buildSpeedMul) * finite(eraBonuses.buildSpeedMul) * finite(hero.buildSpeedMul) },
      { id: 'storage', label: '资源储存容量', value: finite(systems.resource?.getStorageMultiplier?.()) },
      { id: 'building_hp', label: '建筑生命上限', value: finite(systems.building?.getBuildingHpMultiplier?.()) }
    ],
    metrics: [
      { id: 'satisfaction', label: '当前满意度', value: finite(population.satisfaction, 0), suffix: '' },
      { id: 'science_tick', label: '每时段科技点', value: finite(scienceIncome.total, 0), suffix: '' },
      { id: 'civic_tick', label: '每时段人文点', value: finite(civicIncome.total, 0), suffix: '' },
      { id: 'army_capacity', label: '军队数量上限', value: finite(systems.army?.getArmyCapacity?.(), 0), suffix: '' },
      { id: 'unit_capacity', label: '单支军队士兵上限', value: finite(systems.army?.getArmyUnitCapacity?.(), 0), suffix: '' },
      { id: 'soldier_capacity', label: '士兵总容量', value: finite(systems.building?.getTotalSoldierCapacity?.(), 0), suffix: '' },
      { id: 'food_capacity', label: '食物储备容量', value: finite(systems.building?.getTotalFoodCapacity?.(), 0), suffix: '' }
    ]
  };
}
