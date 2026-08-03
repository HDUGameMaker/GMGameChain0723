import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { EraSystem } from '../../src/systems/EraSystem.js';
import { renderEraCivilizationPanel } from '../../src/ui/panels/era-civilization-panel.js';

const root = resolve(import.meta.dirname, '../..');
const historicalContent = JSON.parse(readFileSync(resolve(root, 'config/historical_content.json'), 'utf8'));
const campaignProgression = JSON.parse(readFileSync(resolve(root, 'config/campaign-progression.json'), 'utf8'));

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.style = { cssText: '' };
    this.listeners = new Map();
    this.disabled = false;
    this.dataset = {};
    this._textContent = '';
    this._innerHTML = '';
  }
  set textContent(value) { this._textContent = String(value); }
  get textContent() { return this._textContent; }
  set innerHTML(value) { this._innerHTML = String(value); }
  get innerHTML() { return this._innerHTML; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
}

function walk(element) {
  return [element, ...element.children.flatMap(walk)];
}

function renderedText(element) {
  return walk(element).map(node => `${node.textContent} ${node.innerHTML}`).join(' ');
}

test.afterEach(() => {
  delete globalThis.document;
  delete globalThis.window;
});

test('era panel visibly lists all next-era conditions and era-star sources', () => {
  eventBus.clear();
  configRegistry._configs = { historicalContent, campaignProgression };
  const era = new EraSystem();
  era.setTechSystem({ getEraProgress: () => 0.25, getResearched: () => [] });
  era.setCultureSystem({ getEraProgress: () => 0.5, getResearched: () => [] });
  era.initNew();

  globalThis.document = { createElement: tagName => new FakeElement(tagName) };
  globalThis.window = {
    __game: {
      systems: {
        era,
        tech: { getEraProgress: () => 0.25 },
        culture: { getEraProgress: () => 0.5 }
      }
    }
  };
  const body = new FakeElement('body');
  renderEraCivilizationPanel({ eraSystem: era }, body, { alert() {}, refresh() {} });
  const text = renderedText(body);
  assert.match(text, /进入上古时代的条件/);
  assert.match(text, /选择本时代文明/);
  assert.match(text, /科技树 25% \/ 70%/);
  assert.match(text, /人文树 50% \/ 70%/);
  assert.match(text, /时代星 0 \/ 5/);
  assert.match(text, /时代星获取方式/);
  assert.match(text, /建成当代文明特色建筑.*3 星/);
});
