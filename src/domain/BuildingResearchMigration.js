const LEGACY_RESEARCH_MAP = Object.freeze({
  bt_logging: { tech: 'tech_primitive_3' },
  bt_mining: { tech: 'tech_primitive_1' },
  bt_farming: { civic: 'civic_primitive_5' },
  bt_minting: { civic: 'civic_primitive_6' },
  bt_logging_t2: { tech: 'tech_classical_5' },
  bt_mining_t2: { tech: 'tech_classical_1' },
  bt_farming_t2: { civic: 'civic_classical_4' },
  bt_minting_t2: { civic: 'civic_classical_8' },
  bt_industry: { tech: 'tech_modern_7' },
  bt_efficiency: { civic: 'civic_modern_5' },
  bt_terraforming: { tech: 'tech_exploration_8' }
});

export function migrateLegacyBuildingResearch(saveData = {}) {
  const result = structuredClone(saveData);
  result.tech ||= {};
  result.culture ||= {};
  const remapTech = id => id?.replace(/^tech_ancient_/, 'tech_classical_')
    ?.replace(/^tech_early_modern_/, 'tech_modern_');
  const remapCivic = id => id?.replace(/^civic_ancient_/, 'civic_classical_')
    ?.replace(/^civic_early_modern_/, 'civic_modern_');
  const tech = new Set((result.tech.researched || []).map(remapTech));
  const civics = new Set((result.culture.researched || []).map(remapCivic));
  for (const id of result.buildingTech?.unlockedNodes || []) {
    const mapped = LEGACY_RESEARCH_MAP[id];
    if (mapped?.tech) tech.add(mapped.tech);
    if (mapped?.civic) civics.add(mapped.civic);
  }
  result.tech.researched = [...tech];
  result.culture.researched = [...civics];
  return result;
}
