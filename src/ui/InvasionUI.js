/**
 * InvasionUI - 入侵界面（屏幕左侧）
 * 显示入侵信息，玩家选择军团出击
 */
import { store } from '../core/Store.js';
import { eventBus } from '../core/EventBus.js';
import { getArmyCombatPower, calcFormationGroups, getFormationStatusText } from '../utils/FormationUtils.js';

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
    /* 初始显示：无入侵状态 */
    this._refresh();
    /* 每 tick 检查入侵状态 */
    eventBus.on('tick', () => this._refresh());
  }

  _refresh() {
    const inv = store.getState('activeInvasion');
    this._onInvasionChange(inv);
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
    if (this._idleMsg) { this._idleMsg.style.display = 'block'; return; }
    this._armyList.innerHTML = '';
    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:12px;color:#4ecb71;padding:8px 0;';
    msg.textContent = '🛡️ 营地安全，暂无入侵';
    this._armyList.appendChild(msg);
    this._idleMsg = msg;
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
        const power = getArmyCombatPower(army);
        const groups = army.formationId ? calcFormationGroups(army.formationId, army) : 0;
        const status = army.formationId ? (groups > 0 ? '阵型×' + groups : '阵型未触发') : '';
        const btn = document.createElement('div');
        btn.className = 'invasion-army-btn';
        btn.textContent = army.name + ' (⚔️' + power + ' · ' + army.unitIds.length + '单位' + (status ? ' · ' + status : '') + ')';
        btn.title = army.formationId ? getFormationStatusText(army.formationId, army) : '';
        btn.addEventListener('click', () => {
          const result = this._invasionSystem.sendArmy(army);
          if (!result.ok) { alert(result.msg); return; }
          if (result.victory) alert('🎉 胜利！损失 ' + result.lost + ' 单位，剩余 ' + result.survived);
          else alert('💥 战败！入侵残余战斗力 ' + result.remainingInvasionPower);
        });
        this._armyList.appendChild(btn);
      });
    }
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
