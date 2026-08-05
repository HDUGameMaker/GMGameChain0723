import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createResourceNodeHoverDetails,
  getBuildingResourceNodeRequirement,
  getResourceNodeTypePresentation
} from '../../src/domain/ResourceNodePresentation.js';

const definitions = {
  wood: { name: '木材点', color: '#3f8f4f', icon: '🌲' },
  luxury: { name: '奢侈品产地', color: '#b36bd4', icon: '◆' }
};

test('resource node presentation exposes translated names and configured colors', () => {
  assert.deepEqual(getResourceNodeTypePresentation('wood', definitions), {
    type: 'wood', name: '木材点', color: '#3f8f4f', icon: '🌲'
  });
  assert.deepEqual(getBuildingResourceNodeRequirement({ requiredResourceNode: 'wood' }, definitions), {
    type: 'wood', name: '木材点', color: '#3f8f4f', icon: '🌲', text: '必须覆盖空闲的木材点建造'
  });
});

test('resource node hover names normal and luxury deposits and reports development', () => {
  assert.deepEqual(createResourceNodeHoverDetails({ type: 'wood', rarity: 'common' }, definitions, []), {
    title: '木材点', subtitle: '资源点', color: '#3f8f4f',
    lines: ['状态：可开发', '需要对应的资源采集建筑覆盖此格建造']
  });
  assert.equal(createResourceNodeHoverDetails({ type: 'luxury', luxuryId: 'silk', developedByBuildingId: 'b1' }, definitions, [{ id: 'silk', name: '丝绸产地' }]).title, '丝绸产地');
});
