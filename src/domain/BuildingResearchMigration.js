const LEGACY_RESEARCH_MAP = Object.freeze({
  bt_logging: { tech: 'tech_primitive_3' },
  bt_mining: { tech: 'tech_primitive_1' },
  bt_farming: { civic: 'civic_primitive_5' },
  bt_minting: { civic: 'civic_primitive_6' },
  bt_logging_t2: { tech: 'tech_ancient_5' },
  bt_mining_t2: { tech: 'tech_ancient_1' },
  bt_farming_t2: { civic: 'civic_ancient_4' },
  bt_minting_t2: { civic: 'civic_ancient_8' },
  bt_industry: { tech: 'tech_early_modern_7' },
  bt_efficiency: { civic: 'civic_early_modern_5' },
  bt_terraforming: { tech: 'tech_exploration_8' }
});

export function migrateLegacyBuildingResearch(saveData = {}) {
  const result = structuredClone(saveData);
  result.tech ||= {};
  result.culture ||= {};
  const tech = new Set(result.tech.researched || []);
  const civics = new Set(result.culture.researched || []);
  for (const id of result.buildingTech?.unlockedNodes || []) {
    const mapped = LEGACY_RESEARCH_MAP[id];
    if (mapped?.tech) tech.add(mapped.tech);
    if (mapped?.civic) civics.add(mapped.civic);
  }
  result.tech.researched = [...tech];
  result.culture.researched = [...civics];
  return result;
}
