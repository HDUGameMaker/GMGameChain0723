const FALLBACKS = Object.freeze({
  wood: { name: '木材点', color: '#3f8f4f' },
  stone: { name: '石料点', color: '#8d929d' },
  food: { name: '食物点', color: '#d5a83f' },
  gold: { name: '黄金点', color: '#e2bd36' },
  luxury: { name: '奢侈品产地', color: '#b36bd4' }
});

export function getResourceNodeTypePresentation(type, definitions = {}) {
  const definition = definitions[type] || FALLBACKS[type] || {};
  return { type, name: definition.name || `资源点（${type || '未知'}）`, color: definition.color || '#8fb7c5', icon: definition.icon || '◆' };
}

export function createResourceNodeHoverDetails(node, definitions = {}, luxuries = []) {
  if (!node) return null;
  const base = getResourceNodeTypePresentation(node.type, definitions);
  const luxury = node.luxuryId ? luxuries.find(item => item.id === node.luxuryId) : null;
  const lines = [node.developedByBuildingId ? '状态：已开发' : '状态：可开发'];
  if (node.rarity === 'rare' && Number.isFinite(node.remaining)) lines.push(`剩余储量：${node.remaining}/${node.capacity}`);
  if (node.type === 'luxury') lines.push(`该产地最多可采集2个${luxury?.name || '对应奢侈品'}，采尽后资源点消失`);
  lines.push('需要对应的资源采集建筑覆盖此格建造');
  return { title: luxury?.name || base.name, subtitle: '资源点', lines, color: base.color };
}

export function getBuildingResourceNodeRequirement(building, definitions = {}) {
  if (!building?.requiredResourceNode) return null;
  const presentation = getResourceNodeTypePresentation(building.requiredResourceNode, definitions);
  return { ...presentation, text: `必须覆盖空闲的${presentation.name}建造` };
}
