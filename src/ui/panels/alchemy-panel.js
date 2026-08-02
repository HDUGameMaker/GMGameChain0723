/**
 * alchemy-panel.js - 炼金子菜单（法术工坊）
 * 生产消耗品法术 + 查看法术库存 + 触发施法。
 * 旧酿造/药水/盐/Magnum Opus UI 已休眠（代码保留），本面板为炼金重定位后的主界面。
 * 渲染函数签名: renderAlchemyPanel(data, bodyElement, popupManager)
 */
import { configRegistry } from '../../core/ConfigRegistry.js';

let _styleInjected = false;
function _injectStyles() {
  if (_styleInjected) return;
  _styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .alchemy-spell-container { display:flex; flex-direction:column; gap:12px; color:#d0d0d0; font-size:13px; max-height:560px; overflow-y:auto; padding-right:4px; }
    .alchemy-section { background:rgba(255,255,255,0.04); border-radius:8px; padding:10px 12px; }
    .alchemy-section h3 { margin:0 0 8px 0; font-size:13px; color:#9b8cff; border-bottom:1px solid rgba(155,140,255,0.2); padding-bottom:4px; }
    .alchemy-tree-bar { display:flex; align-items:center; gap:10px; }
    .alchemy-btn { padding:8px 14px; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; transition:all 0.2s; }
    .alchemy-btn.primary { background:#9b59b6; color:#fff; }
    .alchemy-btn.primary:hover { background:#8e44ad; }
    .alchemy-btn.primary:disabled { background:#555; color:#999; cursor:not-allowed; }
    .alchemy-btn.secondary { background:rgba(255,255,255,0.08); color:#ccc; border:1px solid rgba(255,255,255,0.15); }
    .alchemy-btn.secondary:hover { background:rgba(255,255,255,0.12); }
    .alchemy-btn.cast { background:rgba(51,224,255,0.18); color:#33e0ff; border:1px solid rgba(51,224,255,0.4); }
    .alchemy-btn.cast:hover { background:rgba(51,224,255,0.3); }
    .alchemy-btn.cast:disabled { background:rgba(128,128,152,0.12); color:#808098; border-color:transparent; cursor:not-allowed; }
    .spell-card { padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:8px; margin-bottom:8px; display:flex; flex-direction:column; gap:6px; }
    .spell-card .spell-head { display:flex; justify-content:space-between; align-items:center; }
    .spell-card .spell-name { font-weight:600; font-size:14px; }
    .spell-card .spell-type { font-size:10px; padding:1px 6px; border-radius:4px; }
    .spell-card .spell-type.buff { background:rgba(51,224,255,0.15); color:#33e0ff; }
    .spell-card .spell-type.debuff { background:rgba(255,85,85,0.15); color:#ff7777; }
    .spell-card .spell-desc { font-size:11px; color:#999; line-height:1.4; }
    .spell-card .spell-cost { font-size:11px; color:#f0a040; }
    .spell-card .spell-foot { display:flex; justify-content:space-between; align-items:center; }
    .spell-empty { text-align:center; color:#666; font-size:12px; padding:16px; }
  `;
  document.head.appendChild(style);
}

function _resName(id) {
  const r = configRegistry.getResource(id);
  return r ? r.name : id;
}

function _costText(cost) {
  return (cost || []).map(c => `${_resName(c.resourceId)}×${c.amount}`).join('  ');
}

/**
 * @param {Object} data - { alchemySystem, spellSystem }
 * @param {HTMLElement} body
 * @param {Object} pm - PopupManager
 */
export function renderAlchemyPanel(data, body, pm) {
  _injectStyles();
  const sys = data.spellSystem;
  if (!sys) { body.innerHTML = '<p style="color:#e74c3c">法术系统未就绪</p>'; return; }

  const container = document.createElement('div');
  container.className = 'alchemy-spell-container';

  // ===== 顶部：炼金树入口 =====
  const treeBar = document.createElement('div');
  treeBar.className = 'alchemy-section alchemy-tree-bar';
  const unlockedCount = sys.getUnlockedNodes().length;
  const totalCount = sys.getSpellTree().length;
  treeBar.innerHTML = `
    <span style="font-weight:600;color:#9b8cff;">🌳 炼金法术树</span>
    <span style="font-size:12px;color:#aaa;">已解锁 ${unlockedCount}/${totalCount}</span>
    <span style="flex:1"></span>`;
  const treeBtn = document.createElement('button');
  treeBtn.className = 'alchemy-btn secondary';
  treeBtn.textContent = '查看炼金树';
  treeBtn.addEventListener('click', () => pm.push('spell_tree', { spellSystem: sys }));
  treeBar.appendChild(treeBtn);
  container.appendChild(treeBar);

  // ===== 法术生产 =====
  const craftSection = document.createElement('div');
  craftSection.className = 'alchemy-section';
  craftSection.innerHTML = '<h3>🜂 法术生产（消耗四资源炼成消耗品）</h3>';

  const craftable = sys.getCraftableSpells();
  if (craftable.length === 0) {
    craftSection.innerHTML += '<div class="spell-empty">尚未解锁任何法术，请先在炼金树解锁节点</div>';
  } else {
    for (const spell of craftable) {
      const canAfford = sys.canAffordSpell(spell);
      const card = document.createElement('div');
      card.className = 'spell-card';
      card.innerHTML = `
        <div class="spell-head">
          <span class="spell-name">${spell.name}</span>
          <span class="spell-type ${spell.type}">${spell.type === 'buff' ? '增益' : '减益'}</span>
        </div>
        <div class="spell-desc">${spell.description}</div>
        <div class="spell-foot">
          <span class="spell-cost">${_costText(spell.craftCost)} → ${spell.chargesPerCraft || 1} 次</span>
          <button class="alchemy-btn primary" ${canAfford ? '' : 'disabled'}>生产</button>
        </div>`;
      const btn = card.querySelector('button');
      btn.addEventListener('click', () => {
        const r = sys.craftSpell(spell.id);
        if (!r.valid) pm.alert('生产失败: ' + r.reason);
        pm.refresh(data);
      });
      craftSection.appendChild(card);
    }
  }
  container.appendChild(craftSection);

  // ===== 法术库存（消耗品） =====
  const invSection = document.createElement('div');
  invSection.className = 'alchemy-section';
  const inventory = sys.getInventory();
  invSection.innerHTML = `<h3>🧴 法术库存（${inventory.length}）</h3>`;
  if (inventory.length === 0) {
    invSection.innerHTML += '<div class="spell-empty">暂无法术消耗品，生产一些吧</div>';
  } else {
    for (const inst of inventory) {
      const def = inst.def;
      const card = document.createElement('div');
      card.className = 'spell-card';
      const isCasting = sys.isCastingMode() && sys.getActiveSpell()?.instanceId === inst.instanceId;
      card.innerHTML = `
        <div class="spell-head">
          <span class="spell-name">${inst.name}</span>
          <span class="spell-type ${def?.type || 'buff'}">${def?.type === 'debuff' ? '减益' : '增益'} · 充能 ×${inst.charges}</span>
        </div>
        <div class="spell-desc">${def?.description || ''}</div>
        <div class="spell-foot">
          <span style="font-size:11px;color:#888;">${isCasting ? '施法中…点地图释放' : '点击施法后于地图选点'}</span>
          <button class="alchemy-btn cast" ${inst.charges > 0 ? '' : 'disabled'}>${isCasting ? '取消施法' : '施法'}</button>
        </div>`;
      const btn = card.querySelector('button');
      btn.addEventListener('click', () => {
        if (isCasting) {
          sys.exitCastingMode();
          pm.refresh(data);
        } else {
          if (sys.enterCastingMode(inst.instanceId)) {
            // 关闭面板回到地图，玩家点地图释放；充能>0 时施法模式保持，可连点连放
            pm.close();
          }
        }
      });
      invSection.appendChild(card);
    }
  }
  container.appendChild(invSection);

  // ===== 活跃法术区域 =====
  const zones = sys.getActiveZones();
  if (zones.length > 0) {
    const zoneSection = document.createElement('div');
    zoneSection.className = 'alchemy-section';
    zoneSection.innerHTML = '<h3>✨ 生效中的法术</h3>';
    for (const z of zones) {
      const row = document.createElement('div');
      row.style.cssText = 'font-size:11px;color:#bbb;padding:2px 0;';
      const tag = z.type === 'buff' ? '增益' : '减益';
      row.textContent = `${z.name}（${tag}）· 剩余 ${z.ticksRemaining} tick` + (z.radius > 0 ? ` · ${z.radius}格半径` : ' · 全域');
      zoneSection.appendChild(row);
    }
    container.appendChild(zoneSection);
  }

  body.appendChild(container);
}
