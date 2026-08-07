/**
 * gameTime.js - 游戏时间小工具
 * 帧级移动/战斗与 tick 共享同一时间源,避免各处硬编码 10 秒。
 */
import { configRegistry } from '../core/ConfigRegistry.js';

/** 一个逻辑 tick 的游戏秒数(默认 10,与 TimeSystem 同源) */
export function getTickInterval() {
  return configRegistry.get('global')?.TICK_INTERVAL || 10;
}
