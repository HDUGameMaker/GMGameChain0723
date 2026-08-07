/**
 * BattleLogSystem - 战报系统
 * 记录所有战斗结算(自动/手动/敌军攻击),供玩家随时回看(类群星自动战斗结果可查)。
 * 与 MessageLog(即时广播流)并存:战报是结构化持久记录,可存档、可回看。
 */
import { store } from '../core/Store.js';
import { eventBus } from '../core/EventBus.js';

const PERIOD_NAMES_CN = { morning: '早晨', afternoon: '中午', evening: '傍晚', night: '夜晚' };
const MAX_RECORDS = 50;

export class BattleLogSystem {
  constructor() {
    this._records = [];
    this._nextId = 1;
  }

  initNew() {
    this._records = [];
    this._nextId = 1;
  }

  _timeLabel() {
    const state = store.getState();
    return `第 ${state.timeDay || 1} 天 · ${PERIOD_NAMES_CN[state.timePeriod] || state.timePeriod || ''}`;
  }

  /**
   * 记录一场战斗。attacker/defender: { name, type, summary, icon? }。
   * turns: [{ side: 'attacker'|'defender', damage, hpAfter, bonusStrike }]
   * result 为 attacker 视角:'victory'|'defeat'|'draw'
   */
  record({
    attacker = null,
    defender = null,
    initiator = 'player',
    auto = false,
    distance = null,
    firstStrike = null,
    turns = [],
    result = 'draw',
    casualties = null,
    rewards = [],
    luxuryDrop = null,
    hpRemaining = null
  } = {}) {
    const record = {
      id: `bl_${this._nextId++}`,
      timeLabel: this._timeLabel(),
      attacker: attacker ? { name: String(attacker.name || '未知'), type: String(attacker.type || ''), summary: String(attacker.summary || ''), icon: attacker.icon || '' } : null,
      defender: defender ? { name: String(defender.name || '未知'), type: String(defender.type || ''), summary: String(defender.summary || ''), icon: defender.icon || '' } : null,
      initiator: initiator === 'enemy' ? 'enemy' : 'player',
      auto: auto === true,
      distance: Number.isFinite(distance) ? distance : null,
      firstStrike: firstStrike || null,
      turns: Array.isArray(turns) ? turns.slice(-20).map(turn => ({
        side: turn.side === 'defender' ? 'defender' : 'attacker',
        damage: Math.max(0, Number(turn.damage) || 0),
        hpAfter: Math.max(0, Number(turn.hpAfter) || 0),
        bonusStrike: turn.bonusStrike === true
      })) : [],
      result: ['victory', 'defeat', 'draw'].includes(result) ? result : 'draw',
      casualties: casualties && typeof casualties === 'object'
        ? { attacker: Math.max(0, Math.floor(Number(casualties.attacker) || 0)), defender: Math.max(0, Math.floor(Number(casualties.defender) || 0)) }
        : null,
      rewards: Array.isArray(rewards) ? rewards.map(String) : [],
      luxuryDrop: luxuryDrop ? String(luxuryDrop) : null,
      hpRemaining: Number.isFinite(hpRemaining) ? Math.max(0, Math.round(hpRemaining * 100) / 100) : null
    };
    this._records.push(record);
    this._records = this._records.slice(-MAX_RECORDS);
    eventBus.emit('battleLogUpdated', { record });
    return record;
  }

  getRecords() { return structuredClone(this._records); }

  getState() {
    return { nextId: this._nextId, records: structuredClone(this._records) };
  }

  restoreState(state) {
    const records = Array.isArray(state?.records) ? state.records : [];
    this._records = records
      .filter(record => record && typeof record === 'object' && record.id)
      .map(record => ({
        id: String(record.id || `bl_${Math.floor(Number(record.id?.slice?.(3)) || 0)}`),
        timeLabel: String(record.timeLabel || ''),
        attacker: record.attacker && typeof record.attacker === 'object' ? { name: String(record.attacker.name || '未知'), type: String(record.attacker.type || ''), summary: String(record.attacker.summary || ''), icon: String(record.attacker.icon || '') } : null,
        defender: record.defender && typeof record.defender === 'object' ? { name: String(record.defender.name || '未知'), type: String(record.defender.type || ''), summary: String(record.defender.summary || ''), icon: String(record.defender.icon || '') } : null,
        initiator: record.initiator === 'enemy' ? 'enemy' : 'player',
        auto: record.auto === true,
        distance: Number.isFinite(Number(record.distance)) ? Number(record.distance) : null,
        firstStrike: record.firstStrike || null,
        turns: Array.isArray(record.turns) ? record.turns.slice(-20).map(turn => ({
          side: turn.side === 'defender' ? 'defender' : 'attacker',
          damage: Math.max(0, Number(turn.damage) || 0),
          hpAfter: Math.max(0, Number(turn.hpAfter) || 0),
          bonusStrike: turn.bonusStrike === true
        })) : [],
        result: ['victory', 'defeat', 'draw'].includes(record.result) ? record.result : 'draw',
        casualties: record.casualties && typeof record.casualties === 'object'
          ? { attacker: Math.max(0, Math.floor(Number(record.casualties.attacker) || 0)), defender: Math.max(0, Math.floor(Number(record.casualties.defender) || 0)) }
          : null,
        rewards: Array.isArray(record.rewards) ? record.rewards.map(String) : [],
        luxuryDrop: record.luxuryDrop ? String(record.luxuryDrop) : null,
        hpRemaining: Number.isFinite(Number(record.hpRemaining)) ? Math.max(0, Math.round(Number(record.hpRemaining) * 100) / 100) : null
      }))
      .slice(-MAX_RECORDS);
    this._nextId = Math.max(1, Math.floor(Number(state?.nextId) || 1));
  }
}
