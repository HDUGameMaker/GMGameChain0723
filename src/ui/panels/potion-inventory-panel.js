/**
 * potion-inventory-panel.js - 药剂库存面板
 * 渲染函数签名: renderPotionInventoryPanel(data, bodyElement, popupManager)
 */
import { configRegistry } from '../../core/ConfigRegistry.js';

export function renderPotionInventoryPanel(data, body, pm) {
  const sys = data.alchemySystem;
  if (!sys || !sys._itemSystem) {
    body.innerHTML = '<p style="color:#e74c3c">系统未就绪</p>';
    return;
  }

  const container = document.createElement('div');
  container.style.cssText = 'color:#d0d0d0;font-size:13px;max-height:500px;overflow-y:auto;';

  // 标题区
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  header.innerHTML = `
    <h3 style="margin:0;color:#aaa;">🧴 药剂库存</h3>
    <span style="font-size:11px;color:#666;">激活效果: ${sys.getActiveEffects().length} 个</span>
  `;
  container.appendChild(header);

  // 激活效果区
  const effects = sys.getActiveEffects();
  if (effects.length > 0) {
    const effectSection = document.createElement('div');
    effectSection.style.cssText = 'background:rgba(155,89,182,0.08);border:1px solid rgba(155,89,182,0.2);border-radius:8px;padding:10px;margin-bottom:12px;';
    effectSection.innerHTML = '<h4 style="margin:0 0 6px 0;font-size:12px;color:#9b59b6;">⚡ 当前生效</h4>';
    for (const eff of effects) {
      const cfg = sys._getEffects().find(e => e.id === eff.effectId);
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;padding:2px 0;';
      div.innerHTML = `
        <span>${cfg ? cfg.name : eff.effectId} [${eff.quality}级]</span>
        <span style="color:#888;">剩余 ${eff.ticksRemaining} ticks</span>
      `;
      effectSection.appendChild(div);
    }
    container.appendChild(effectSection);
  }

  // 药剂列表
  const instances = sys._itemSystem.getOwnedInstances();

  const potionItems = instances.filter(i => {
    const cfg = configRegistry.getItem(i.itemId);
    return cfg && cfg.potionEffect;
  });

  const magnumOpusItems = instances.filter(i => {
    const cfg = configRegistry.getItem(i.itemId);
    return cfg && ['nigredo_substance', 'albedo_substance', 'citrinitas_substance', 'rubedo_substance', 'philosopher_stone'].includes(cfg.id);
  });

  if (potionItems.length === 0 && magnumOpusItems.length === 0) {
    container.innerHTML += '<p style="color:#666;text-align:center;padding:40px;">还没有炼金产物<br>去炼金面板制作一些吧！</p>';
    body.appendChild(container);
    return;
  }

  // 药剂列表
  if (potionItems.length > 0) {
    const listTitle = document.createElement('h4');
    listTitle.style.cssText = 'margin:0 0 6px 0;font-size:12px;color:#999;';
    listTitle.textContent = `药剂 (${potionItems.length})`;
    container.appendChild(listTitle);

    for (const inst of potionItems) {
      const cfg = configRegistry.getItem(inst.itemId);
      const effectCfg = cfg && cfg.potionEffect
        ? (sys._getEffects().find(e => e.id === cfg.potionEffect.id))
        : null;
      // 实例品质优先，其次模板品质
      const quality = (inst.metadata && inst.metadata.quality) || (cfg && cfg.potionEffect && cfg.potionEffect.quality) || 'I';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;margin-bottom:4px;transition:all 0.2s;';
      row.innerHTML = `
        <div style="flex:1;">
          <div style="font-weight:bold;font-size:12px;">${cfg ? cfg.name : inst.itemId}</div>
          <div style="font-size:10px;color:#888;">${effectCfg ? effectCfg.description : ''}</div>
          <div style="font-size:10px;color:${quality === 'III' ? '#f1c40f' : quality === 'II' ? '#2ecc71' : '#999'};">
            品质: ${quality} 级
            | 效果: ${effectCfg ? effectCfg.name : (cfg && cfg.potionEffect ? cfg.potionEffect.id : '?')}
          </div>
        </div>
        <button class="alchemy-use-btn" style="padding:6px 14px;background:#9b59b6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;margin-left:8px;">使用</button>
      `;

      const useBtn = row.querySelector('.alchemy-use-btn');
      useBtn.addEventListener('click', () => {
        const result = sys.usePotion(inst.instanceId);
        if (result.valid) {
          pm.refresh(data);
        } else {
          alert(result.reason);
        }
      });

      container.appendChild(row);
    }
  }

  // 伟大工作产物
  if (magnumOpusItems.length > 0) {
    const moTitle = document.createElement('h4');
    moTitle.style.cssText = 'margin:12px 0 6px 0;font-size:12px;color:#f1c40f;';
    moTitle.textContent = `🔮 伟大工作产物 (${magnumOpusItems.length})`;
    container.appendChild(moTitle);

    for (const inst of magnumOpusItems) {
      const cfg = configRegistry.getItem(inst.itemId);
      const row = document.createElement('div');
      row.style.cssText = 'padding:8px;border:1px solid rgba(241,196,15,0.2);border-radius:6px;margin-bottom:4px;background:rgba(241,196,15,0.04);';
      row.innerHTML = `
        <div style="font-weight:bold;color:#f1c40f;">${cfg ? cfg.name : inst.itemId}</div>
        <div style="font-size:10px;color:#999;">${cfg ? cfg.description : ''}</div>
      `;
      container.appendChild(row);
    }
  }

  // 炼金盐状态
  const salts = sys.getSalts();
  const saltConfigs = sys._getSalts();
  if (saltConfigs.length > 0) {
    const saltTitle = document.createElement('h4');
    saltTitle.style.cssText = 'margin:12px 0 6px 0;font-size:12px;color:#aaa;';
    saltTitle.textContent = '🧂 炼金盐库存';
    container.appendChild(saltTitle);

    const saltGrid = document.createElement('div');
    saltGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;';
    for (const sc of saltConfigs) {
      const key = sc.id.replace('_salt', '');
      const count = salts[key] || 0;
      const hasSalt = count > 0;
      const div = document.createElement('div');
      div.style.cssText = `padding:6px;border:1px solid rgba(255,255,255,${hasSalt ? '0.2' : '0.05'});border-radius:4px;text-align:center;font-size:10px;color:${hasSalt ? '#f39c12' : '#666'};`;
      div.innerHTML = `<div>${sc.name}</div><div>${hasSalt ? count + '粒' : '—'}</div><div style="font-size:9px;color:#888;">${sc.description}</div>`;
      saltGrid.appendChild(div);
    }
    container.appendChild(saltGrid);
  }

  body.appendChild(container);
}
