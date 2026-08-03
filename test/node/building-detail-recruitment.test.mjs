import test from 'node:test';
import assert from 'node:assert/strict';

import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { renderBuildingDetailPanel } from '../../src/ui/panels/building-detail-panel.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.style = { cssText: '' };
    this.listeners = new Map();
    this.disabled = false;
    this._textContent = '';
    this._innerHTML = '';
  }

  set textContent(value) { this._textContent = String(value); }
  get textContent() { return this._textContent; }
  set innerHTML(value) { this._innerHTML = String(value); }
  get innerHTML() { return this._innerHTML; }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelector() {
    return null;
  }

  click() {
    if (!this.disabled) this.listeners.get('click')?.({ currentTarget: this });
  }
}

function walk(element) {
  return [element, ...element.children.flatMap(walk)];
}

function renderedText(element) {
  return walk(element).map(node => `${node.textContent} ${node.innerHTML}`).join(' ');
}

function createPanelScenario({ recruitment = true, canAfford = true, recruitResult = { ok: true, population: 13 } } = {}) {
  const buildingIndex = 7;
  const buildingConfig = {
    id: 'warehouse',
    name: '大本营',
    description: '核心指挥建筑',
    category: 'administration',
    eraId: 'primitive',
    maxWorkers: 0,
    production: null,
    synthesisRecipes: [],
    upgradesTo: null,
    draggable: false,
    demolishable: false,
    ...(recruitment ? {
      uniqueFunction: {
        workerRecruitment: {
          amount: 1,
          cost: [{ resourceId: 'food', amount: 20 }]
        }
      }
    } : {})
  };
  configRegistry._configs = {
    buildings: [buildingConfig],
    resources: [{ id: 'food', name: '食物' }]
  };

  const recruitmentCalls = [];
  const refreshCalls = [];
  const buildings = Array.from({ length: buildingIndex + 1 });
  buildings[buildingIndex] = { buildingId: 'warehouse', status: 'active', currentWorkers: 0 };
  const buildingSystem = {
    buildings,
    getUnlockStatus: () => ({ unlocked: true, conditions: [] }),
    getFarmOperation: () => null,
    getAdjacencyBonuses: () => [],
    recruitWorker: index => {
      recruitmentCalls.push(index);
      return recruitResult;
    }
  };
  const resourceSystem = { canAfford: () => canAfford };
  const populationSystem = {
    current: 12,
    getHousingCapacity: () => 20,
    getAvailableWorkers: () => 9
  };
  const pm = {
    refresh: data => refreshCalls.push(data),
    alert: () => assert.fail('successful recruitment must not alert')
  };

  const body = new FakeElement('body');
  globalThis.document = { createElement: tagName => new FakeElement(tagName) };
  globalThis.window = {
    __game: {
      systems: {
        building: buildingSystem,
        resource: resourceSystem,
        population: populationSystem
      }
    }
  };

  renderBuildingDetailPanel({ buildingIndex }, body, pm);
  return { body, buildingIndex, recruitmentCalls, refreshCalls };
}

test.afterEach(() => {
  delete globalThis.document;
  delete globalThis.window;
});

test('building detail hides worker recruitment without configured recruitment', () => {
  const { body } = createPanelScenario({ recruitment: false });
  assert.doesNotMatch(renderedText(body), /招募工人|招募 1 名工人/);
});

test('building detail renders recruitment state and refreshes the same building after success', () => {
  const { body, buildingIndex, recruitmentCalls, refreshCalls } = createPanelScenario();
  const text = renderedText(body);
  assert.match(text, /招募工人/);
  assert.match(text, /食物×20/);
  assert.match(text, /12 \/ 20/);
  assert.match(text, /可用工人<\/span><b[^>]*>9<\/b>/);

  const button = walk(body).find(element => element.tagName === 'button' && element.textContent === '招募 1 名工人');
  assert.ok(button);
  assert.equal(button.disabled, false);
  button.click();
  assert.deepEqual(recruitmentCalls, [buildingIndex]);
  assert.deepEqual(refreshCalls, [{ buildingIndex }]);
});

test('building detail disables recruitment and explains insufficient resources', () => {
  const { body } = createPanelScenario({ canAfford: false });
  const button = walk(body).find(element => element.tagName === 'button' && element.textContent === '招募 1 名工人');
  assert.ok(button);
  assert.equal(button.disabled, true);
  assert.match(renderedText(body), /资源不足/);
});
