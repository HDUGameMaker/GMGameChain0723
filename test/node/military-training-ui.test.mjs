import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { renderArmyPanel } from '../../src/ui/panels/army-panel.js';
import { renderBuildingDetailPanel } from '../../src/ui/panels/building-detail-panel.js';
import { renderTrainingPanel } from '../../src/ui/panels/training-panel.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.style = { cssText: '' };
    this.listeners = new Map();
    this.dataset = {};
    this.disabled = false;
    this._innerHTML = '';
    this._textContent = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this.children = [];
  }
  get innerHTML() { return this._innerHTML; }
  set textContent(value) { this._textContent = String(value); }
  get textContent() { return this._textContent; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) {
    for (const child of children) this.children.push(child instanceof FakeElement ? child : new FakeText(child));
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  querySelector() { return null; }
  click() { if (!this.disabled) this.listeners.get('click')?.({ currentTarget: this, stopPropagation() {} }); }
}

class FakeText extends FakeElement {
  constructor(value) { super('#text'); this.textContent = value; }
}

function walk(element) {
  return [element, ...element.children.flatMap(walk)];
}

function renderedText(element) {
  return walk(element).map(node => `${node.textContent} ${node.innerHTML}`).join(' ');
}

function setupDom() {
  globalThis.document = {
    createElement: tagName => new FakeElement(tagName)
  };
}

function setupTrainingGame() {
  const unit = {
    id: 'primitive_infantry_1', name: '氏族战士', branch: 'infantry', domain: 'land', eraId: 'primitive',
    populationRequired: 1, combatPower: 4, commandPoints: 1, unlocked: true, cost: []
  };
  const configs = [
    {
      id: 'work_shed', name: '军营', description: '训练步兵', category: 'military', eraId: 'primitive',
      maxWorkers: 0, production: null, synthesisRecipes: [], upgradesTo: null,
      uniqueFunction: { trainsBranches: ['infantry'] }, tags: ['barracks']
    },
    {
      id: 'warehouse', name: '大本营', description: '行政建筑', category: 'administration', eraId: 'primitive',
      maxWorkers: 0, production: null, synthesisRecipes: [], upgradesTo: null, uniqueFunction: {}
    }
  ];
  configRegistry._configs = {
    buildings: configs,
    enemies: { units: [unit], formations: [] },
    resources: [],
    historicalContent: { eras: [{ id: 'primitive', name: '原始时代', order: 0 }] }
  };
  const calls = { get: [], train: [], push: [], reserveSets: [] };
  const building = {
    buildings: [
      { buildingId: 'work_shed', status: 'active', currentWorkers: 0 },
      { buildingId: 'warehouse', status: 'active', currentWorkers: 0 }
    ],
    getTotalSoldierCount: () => 0,
    getTotalSoldierCapacity: () => 3,
    getUnlockStatus: () => ({ unlocked: true, conditions: [] }),
    getFarmOperation: () => null,
    getAdjacencyBonuses: () => []
  };
  const army = {
    getTrainableUnitsAt: buildingIndex => {
      calls.get.push(buildingIndex);
      return buildingIndex === 0 ? [unit] : [];
    },
    canTrainUnitAt: (buildingIndex, unitId) => ({ ok: buildingIndex === 0 && unitId === unit.id, unit }),
    trainUnitAt: (buildingIndex, unitId) => {
      calls.train.push([buildingIndex, unitId]);
      return { ok: true, reserve: 1 };
    },
    getAvailableUnits: () => ({}),
    getArmies: () => [],
    getArmyCapacity: () => 2,
    getCommandPointLimit: () => 20,
    setAvailableUnits: units => calls.reserveSets.push(units),
    getTactics: () => []
  };
  globalThis.window = {
    __game: {
      configRegistry,
      store: { getState: () => 0, setState() {} },
      systems: {
        building,
        army,
        resource: { canAfford: () => true },
        population: { current: 12, getAvailableWorkers: () => 12, getHousingCapacity: () => 20 },
        tech: { isUnitUnlockedByTech: () => true },
        era: { getCurrentEra: () => ({ id: 'primitive', order: 0 }), getSelectedCivilization: () => null },
        culture: { isFormationUnlockedByCulture: () => false }
      }
    }
  };
  return { calls };
}

test.afterEach(() => {
  delete globalThis.document;
  delete globalThis.window;
});

test('training panel rejects missing and invalid building indices', () => {
  setupDom();
  const { calls } = setupTrainingGame();
  const missingBody = new FakeElement('body');
  renderTrainingPanel({}, missingBody, { open() {}, alert() {} });
  const invalidBody = new FakeElement('body');
  renderTrainingPanel({ buildingIndex: 99 }, invalidBody, { open() {}, alert() {} });

  assert.deepEqual(calls.get, []);
  assert.equal(walk(missingBody).some(node => node.dataset.testid?.startsWith('train-unit-')), false);
  assert.equal(walk(invalidBody).some(node => node.dataset.testid?.startsWith('train-unit-')), false);
  assert.match(renderedText(missingBody), /训练建筑无效/);
  assert.match(renderedText(invalidBody), /训练建筑无效/);
});

test('training panel renders only system-filtered units with stable test ids and delegates training', () => {
  setupDom();
  const { calls } = setupTrainingGame();
  const body = new FakeElement('body');
  renderTrainingPanel({ buildingIndex: 0 }, body, { open() {}, alert: message => assert.fail(message) });

  const buttons = walk(body).filter(node => node.dataset.testid?.startsWith('train-unit-'));
  assert.deepEqual(buttons.map(button => button.dataset.testid), ['train-unit-primitive_infantry_1']);
  buttons[0].click();
  assert.deepEqual(calls.train, [[0, 'primitive_infantry_1']]);
});

test('only compatible building details expose the building-scoped training entry', () => {
  setupDom();
  const { calls } = setupTrainingGame();
  const pm = {
    push: (panel, data) => calls.push.push([panel, data]),
    refresh() {},
    alert() {},
    close() {}
  };

  const trainingBody = new FakeElement('body');
  renderBuildingDetailPanel({ buildingIndex: 0 }, trainingBody, pm);
  const entry = walk(trainingBody).find(node => node.dataset.testid === 'open-building-training');
  assert.ok(entry);
  entry.click();
  assert.deepEqual(calls.push, [['training_panel', { buildingIndex: 0 }]]);

  const warehouseBody = new FakeElement('body');
  renderBuildingDetailPanel({ buildingIndex: 1 }, warehouseBody, pm);
  assert.equal(walk(warehouseBody).some(node => node.dataset.testid === 'open-building-training'), false);
});

test('opening army management with no reserves does not grant free units', () => {
  setupDom();
  const { calls } = setupTrainingGame();
  renderArmyPanel({}, new FakeElement('body'), { alert() {} });
  assert.deepEqual(calls.reserveSets, []);
});

test('global HUD markup has no training entry', () => {
  const html = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8');
  assert.doesNotMatch(html, /id=["']btn-training["']/);
});
