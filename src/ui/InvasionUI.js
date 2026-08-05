/**
 * InvasionUI - 入侵界面（屏幕左侧）
 * 显示入侵信息，玩家选择军团出击
 */
import { store } from '../core/Store.js';
import { eventBus } from '../core/EventBus.js';
import { configRegistry } from '../core/ConfigRegistry.js';
import { getArmyCombatPower, calcFormationGroups, getFormationStatusText } from '../utils/FormationUtils.js';

function showGameAlert(message) {
  const pm = window.__game?.popupManager;
  if (pm?.alert) return pm.alert(message);
  eventBus.emit('combatBroadcast', { message });
  return Promise.resolve(true);
}

export class InvasionUI {
  constructor(invasionSystem) {
    this._invasionSystem = invasionSystem;
    this._widget = document.getElementById('invasion-widget');
    this._powerEl = document.getElementById('invasion-power');
    this._armyList = document.getElementById('invasion-army-list');
    this._progressEl = document.getElementById('invasion-progress');
    this._timerEl = document.getElementById('invasion-timer');
    this._idleMsg = null;
    this._activeInvasion = null;
    this._tickListener = null;


    store.subscribe('activeInvasion', (inv) => this._onInvasionChange(inv));
    store.subscribe('armies', () => this._refreshArmyList());
    store.subscribe('availableUnits', () => this._refreshArmyList());
    store.subscribe('armyVersion', () => this._refreshArmyList());
    store.subscribe('cultureVersion', () => this._refreshArmyList());
    store.subscribe('unitResearch', () => this._refreshArmyList());
    store.subscribe('resourceVersion', () => this._refreshArmyList());
    store.subscribe('invasionNextDay', () => this._refreshIdleText());
    eventBus.on('armyChanged', () => this._refreshArmyList());
    /* 初始显示：无入侵状态 */
    this._refresh();
    /* 每 tick 检查入侵状态 */
    eventBus.on('tick', () => this._refresh());
  }

  _refresh() {
    const inv = store.getState('activeInvasion');
    this._onInvasionChange(inv);
  }

  _invasionConfig() {
    return configRegistry.get('enemies')?.invasion || {};
  }

  _cfgNumber(key, fallback) {
    const value = this._invasionConfig()[key];
    return Number.isFinite(value) ? value : fallback;
  }

  _cfgString(key, fallback) {
    const value = this._invasionConfig()[key];
    return typeof value === 'string' && value ? value : fallback;
  }

  _tributeResource() {
    const id = this._cfgString('tributeResourceId', 'food');
    const cfg = configRegistry.getResource(id);
    return { id, name: cfg?.name || id };
  }

  _refreshArmyList() {
    if (this._activeInvasion) {
      this._renderArmyList();
    }
  }

  _refreshIdleText() {
    if (!this._activeInvasion && this._idleMsg) {
      this._idleMsg.textContent = this._getIdleText();
    }
  }

  _onInvasionChange(inv) {
    if (inv && inv.combatPower) {
      this._activeInvasion = inv;
      this._showAlert(inv);
      this._startTickListener();
    } else {
      this._activeInvasion = null;
      this._showIdle();
      this._stopTickListener();
    }
  }

  /* ─── 倒计时进度条 ─── */
  _startTickListener() {
    this._stopTickListener();
    this._tickListener = () => this._updateProgress();
    eventBus.on('tick', this._tickListener);
    this._updateProgress();
  }

  _stopTickListener() {
    if (this._tickListener) {
      eventBus.off('tick', this._tickListener);
      this._tickListener = null;
    }
  }

  _updateProgress() {
    if (!this._progressEl || !this._timerEl || !this._activeInvasion) { this._refresh(); return; }

    const periodIdx = store.getState('timePeriodIndex') ?? 0;
    const timeTick = store.getState('timeTick') ?? 0;
    const TP = 3; const TOTAL = 4 * TP;

    // 24小时循环：从上次惩罚时间点到下次惩罚
    const progress = (periodIdx * TP + (timeTick % TP)) / TOTAL;
    const pct = Math.min(100, Math.round(progress * 100));
    const remainHours = Math.round((1 - progress) * 24);

    this._progressEl.style.width = pct + '%';
    this._timerEl.textContent = '⏳ 资源损失倒计时 ' + remainHours + '小时';
    this._timerEl.style.color = '#f0a040';
    if (pct > 80) this._progressEl.style.background = 'linear-gradient(90deg,#f0a040,#ff6b6b)';
    else if (pct > 50) this._progressEl.style.background = 'linear-gradient(90deg,#4ecb71,#f0a040)';
    else this._progressEl.style.background = 'linear-gradient(90deg,#4ecb71,#5b8def)';
  }

  _showIdle() {
    if (!this._widget) return;
    this._widget.classList.remove('active');
    this._widget.classList.remove('alarm');
    this._widget.classList.add('idle');
    this._powerEl.textContent = '暂无入侵';
    this._powerEl.style.color = '#4ecb71';
    if (this._timerEl) this._timerEl.textContent = '';
    if (this._progressEl) { this._progressEl.style.width = '0%'; }
    if (this._idleMsg && this._armyList.contains(this._idleMsg)) {
      this._idleMsg.style.display = 'block';
      this._idleMsg.textContent = this._getIdleText();
      return;
    }
    this._idleMsg = null;
    this._armyList.innerHTML = '';
    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:12px;color:#4ecb71;padding:8px 0;';
    msg.textContent = this._getIdleText();
    this._armyList.appendChild(msg);
    this._idleMsg = msg;
  }

  _getIdleText() {
    const day = store.getState('timeDay') || 1;
    const nextDay = store.getState('invasionNextDay') || 0;
    if (nextDay > day) return `🛡️ 暂时安全，下一波远古遗迹袭击将在第 ${nextDay} 日到达`;
    return '🛡️ 暂时安全，远古遗迹军队尚未出现';
  }

  _showAlert(inv) {
    if (!this._widget) return;
    this._widget.classList.add('active');
    this._widget.classList.remove('idle');
    this._widget.classList.add('alarm');
    this._powerEl.textContent = inv.combatPower;
    this._powerEl.style.color = '';
    if (this._progressEl) this._progressEl.style.width = '';
    if (this._timerEl) this._timerEl.textContent = '⏳ 资源损失倒计时...';
    this._renderArmyList();
  }

  _renderArmyList() {
    if (!this._armyList) return;
    this._armyList.innerHTML = '';
    this._renderTributeAction();
    const armies = store.getState('armies') || [];
    const hasArmies = armies.some(a => a.unitIds && a.unitIds.length > 0);
    if (!hasArmies) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:11px;color:#808098;padding:4px 0;';
      empty.textContent = '暂无可用军团';
      this._armyList.appendChild(empty);
    } else {
      armies.forEach((army) => {
        if (!army.unitIds || army.unitIds.length === 0) return;
        const defenseDomain = this._cfgString('landDefenseDomain', 'land');
        const domainCfg = (configRegistry.get('enemies')?.unitDomains || []).find(d => d.id === defenseDomain);
        const domainName = domainCfg?.name || defenseDomain;
        const power = getArmyCombatPower(army, { domain: defenseDomain });
        const totalPower = getArmyCombatPower(army);
        const navalOnly = power <= 0 && totalPower > 0;
        const groups = army.formationId ? calcFormationGroups(army.formationId, army) : 0;
        const status = army.formationId ? (groups > 0 ? '阵型×' + groups : '阵型未触发') : '';
        const btn = document.createElement('div');
        btn.className = 'invasion-army-btn';
        btn.textContent = army.name + ' (' + domainName + '⚔️' + power + (navalOnly ? ' · 不适用防御领域' : '') + ' · ' + army.unitIds.length + '单位' + (status ? ' · ' + status : '') + ')';
        btn.title = army.formationId ? getFormationStatusText(army.formationId, army) : '';
        btn.addEventListener('click', () => {
          const result = this._invasionSystem.sendArmy(army);
          if (!result.ok) { showGameAlert(result.msg); return; }
          if (result.victory) {
            showGameAlert('🎉 胜利！损失 ' + result.lost + ' 单位，剩余 ' + result.survived);
          } else if (result.draw) {
            showGameAlert('⚔️ 平局！全员倒下，' + result.reviveCount + ' 单位将在' + this._cfgNumber('reviveDelayDays', 3) + '日后复归，入侵已被阻止');
          } else {
            showGameAlert('💥 战败！损失 ' + result.lost + ' 单位，' + result.reviveCount + ' 单位将在' + this._cfgNumber('reviveDelayDays', 3) + '日后复归；入侵残余战斗力 ' + result.remainingInvasionPower);
          }
        });
        this._armyList.appendChild(btn);
      });
    }
  }

  _renderTributeAction() {
    if (!this._activeInvasion) return;
    const cost = Math.max(1, this._activeInvasion.tributeFoodCost || this._activeInvasion.combatPower || 1);
    const tribute = this._tributeResource();
    const current = window.__game?.systems?.resource?.getAmount(tribute.id) || 0;
    const canPay = current >= cost;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:8px;padding:8px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;background:rgba(255,255,255,0.035);display:flex;flex-direction:column;gap:6px;';

    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:11px;color:#a0a0ba;line-height:1.35;';
    const mul = this._activeInvasion.tributeMultiplier ? ` · ${this._activeInvasion.tributeMultiplier}倍战力` : '';
    meta.textContent = `上交${tribute.name}可使未来${this._cfgNumber('tributeProtectionDays', 7)}日内不触发入侵${mul}`;
    wrap.appendChild(meta);

    const btn = document.createElement('button');
    btn.textContent = `🌾 上交 ${cost} ${tribute.name}`;
    btn.disabled = !canPay;
    btn.style.cssText = 'padding:6px 10px;border:none;border-radius:6px;background:' + (canPay ? 'rgba(240,160,64,0.22)' : 'rgba(128,128,152,0.14)') + ';color:' + (canPay ? '#f0a040' : '#808098') + ';cursor:' + (canPay ? 'pointer' : 'default') + ';font-size:12px;font-weight:600;text-align:left;';
    btn.title = canPay ? `上交${tribute.name}，当前入侵撤退` : `${tribute.name}不足，当前 ${current}/${cost}`;
    btn.addEventListener('click', async () => {
      if (!canPay) {
        showGameAlert(`${tribute.name}不足（需要 ${cost}，当前 ${current}）`);
        return;
      }
      const pm = window.__game?.popupManager;
      if (pm?.confirm) {
        const ok = await pm.confirm(`上交 ${cost} ${tribute.name}换取 ${this._cfgNumber('tributeProtectionDays', 7)} 日免战？`);
        if (!ok) return;
      }
      const result = this._invasionSystem.payTribute();
      if (!result.ok) {
        showGameAlert(result.msg || '上交失败');
        return;
      }
      showGameAlert(`已上交 ${result.cost} ${tribute.name}，未来${result.protectedDays || this._cfgNumber('tributeProtectionDays', 7)}日内不会触发入侵`);
    });
    wrap.appendChild(btn);
    this._armyList.appendChild(wrap);
  }

  _show(inv) {
    if (!this._widget) return;
    this._powerEl.textContent = inv.combatPower;
    this._widget.classList.add('active');
  }

  _hide() {
    if (!this._widget) return;
    this._widget.classList.remove('active');
  }
}
