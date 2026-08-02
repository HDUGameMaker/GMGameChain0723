import { writeFileSync } from 'node:fs';

const eras = [
  ['ancient', ['丰收祭议', '河道改线', '部族迁徙', '兽群来临', '陶器集市', '边境烽烟']],
  ['classical', ['商路使团', '公民大会争辩', '粮仓火患', '新式方阵', '港湾税争', '异域香料']],
  ['medieval', ['行会请愿', '城墙修缮', '骑士比武', '典籍抄本', '海盗勒索', '黑麦歉收']],
  ['exploration', ['新航线传闻', '海图争夺', '远洋商社', '火器试验', '外交使节', '远洋风暴']],
  ['industrial', ['铁路选线', '工人请愿', '工厂事故', '电报网络', '煤价波动', '城市卫生']],
  ['modern', ['总动员令', '无线电广播', '装甲演习', '难民安置', '国际会议', '石油禁运']],
  ['information', ['卫星测绘', '网络舆情', '自动化浪潮', '全球供应链', '科研合作', '数据安全']]
];
const categories = ['agriculture', 'infrastructure', 'population', 'disaster', 'trade', 'military', 'diplomacy', 'civic', 'research', 'naval', 'luxury', 'city_state', 'public_order', 'exploration'];
const slug = value => value.normalize('NFKD').replace(/[^\p{Letter}\p{Number}]+/gu, '_').replace(/^_|_$/g, '') || 'event';

function specialEffect(category, index) {
  if (category === 'luxury') return { type: 'add_luxury', luxuryId: ['silk', 'spices', 'jade', 'pearls'][index % 4], amount: 1 };
  if (category === 'research') return { type: 'add_science', amount: 25 + index * 2 };
  if (category === 'civic' || category === 'public_order') return { type: 'add_civic', amount: 25 + index * 2 };
  if (category === 'military' || category === 'city_state') return { type: 'add_strategy_card', strategyId: ['fortify', 'forced_march', 'false_intelligence'][index % 3], amount: 1 };
  if (category === 'population') return { type: 'modify_satisfaction', amount: 6 };
  const resourceId = ['food', 'wood', 'stone', 'gold'][index % 4];
  return { type: 'add_resource', resourceId, amount: 30 + index * 3 };
}

const events = [];
eras.forEach(([eraId, names], eraIndex) => names.forEach((name, localIndex) => {
  const index = eraIndex * 6 + localIndex;
  const category = categories[index % categories.length];
  const id = `historical_${eraId}_${String(localIndex + 1).padStart(2, '0')}`;
  events.push({
    id,
    name,
    icon: `assets/historical-icons/events/${id}.svg`,
    description: `${name}正在影响城市。你需要在短期收益、长期秩序与时代发展之间作出取舍。`,
    category,
    priority: 3 + (index % 6),
    cooldownTicks: 24 + (index % 5) * 4,
    maxTriggers: 2,
    probability: 0.45 + (index % 4) * 0.1,
    triggerConditions: {
      timePeriods: [['morning'], ['afternoon'], ['evening']][index % 3],
      requiredItems: [],
      requiredBuildings: [],
      eraIds: [eraId],
      minDay: eraIndex * 12 + 1
    },
    effects: [],
    options: [
      {
        text: '组织力量积极应对',
        effects: [
          { type: 'consume_resource', resourceId: index % 2 ? 'gold' : 'food', amount: 12 + eraIndex * 4 },
          specialEffect(category, index)
        ]
      },
      {
        text: '保持克制，优先稳定',
        effects: [
          { type: 'add_resource', resourceId: ['wood', 'stone', 'food', 'gold'][index % 4], amount: 16 + eraIndex * 3 },
          { type: 'modify_satisfaction', amount: category === 'disaster' ? -4 : 2 }
        ]
      }
    ]
  });
}));

const target = new URL('../config/events/events_historical.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(events, null, 2)}\n`);
console.log(`Generated ${events.length} historical events at ${target.pathname}`);
