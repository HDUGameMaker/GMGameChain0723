/**
 * 资源成本着色工具:逐资源判断当前持有量,够=绿 #4ecb71,不够=红 #ff6b6b。
 * 用于建筑建造/升级/合成/招募、兵种训练等所有资源成本展示。
 */
export function formatCostHtml(cost, { resourceSystem, configRegistry, emptyText = '免费' } = {}) {
  if (!Array.isArray(cost) || cost.length === 0) return emptyText;
  return cost.map(c => {
    const rCfg = configRegistry?.getResource?.(c.resourceId);
    const name = rCfg?.name || c.resourceId;
    const need = Math.max(0, Math.floor(Number(c.amount) || 0));
    const have = Math.max(0, Math.floor(Number(resourceSystem?.getAmount?.(c.resourceId)) || 0));
    const color = have >= need ? '#4ecb71' : '#ff6b6b';
    return `<span style="color:${color}">${name}×${need}</span>`;
  }).join('  ');
}
