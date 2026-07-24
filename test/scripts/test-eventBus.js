/**
 * test-eventBus.js — EventBus 发布/订阅单元测试
 *
 * 覆盖 src/core/EventBus.js 全部方法：
 *   on, once, off, emit, clear
 *
 * 使用独立的 EventBus 实例（非全局单例），确保测试隔离。
 *
 * 导出 run() 函数，返回 { name, passed, failed, total, results[] }
 */

import EventBus from '../../src/core/EventBus.js';

function assert(description, condition, expected, actual) {
  const pass = condition;
  return {
    description,
    pass,
    expected: expected !== undefined ? String(expected) : 'truthy',
    actual: actual !== undefined ? String(actual) : String(condition)
  };
}

export function run() {
  const results = [];
  let passed = 0;
  let failed = 0;

  function test(description, condition, expected, actual) {
    const r = assert(description, condition, expected, actual);
    results.push(r);
    if (r.pass) passed++;
    else failed++;
  }

  // ============================
  // 基本 on/emit
  // ============================
  {
    const bus = new EventBus();
    let received = null;
    bus.on('test', (data) => { received = data; });
    bus.emit('test', { msg: 'hello' });
    test('on + emit: 订阅者收到数据', received !== null && received.msg === 'hello',
      'hello', received?.msg);
  }

  // ============================
  // 多个订阅者
  // ============================
  {
    const bus = new EventBus();
    let count = 0;
    bus.on('count', () => count++);
    bus.on('count', () => count++);
    bus.on('count', () => count++);
    bus.emit('count');
    test('多个订阅者: 3个订阅者都被调用', count === 3, 3, count);
  }

  // ============================
  // 无订阅者时 emit 不抛错
  // ============================
  {
    const bus = new EventBus();
    let threw = false;
    try {
      bus.emit('nonexistent', 42);
    } catch (e) {
      threw = true;
    }
    test('emit 无订阅者的事件不抛错', !threw);
  }

  // ============================
  // off 取消订阅
  // ============================
  {
    const bus = new EventBus();
    let count = 0;
    const cb = () => count++;
    bus.on('tick', cb);
    bus.emit('tick');
    test('off 前: 回调被调用', count === 1, 1, count);

    bus.off('tick', cb);
    bus.emit('tick');
    test('off 后: 回调不再被调用', count === 1, 1, count);
  }

  // ============================
  // off 不存在的回调不抛错
  // ============================
  {
    const bus = new EventBus();
    let threw = false;
    try {
      bus.off('none', () => {});
    } catch (e) {
      threw = true;
    }
    test('off 不存在的事件/回调不抛错', !threw);
  }

  // ============================
  // on 返回取消函数
  // ============================
  {
    const bus = new EventBus();
    let count = 0;
    const unsub = bus.on('tick', () => count++);
    bus.emit('tick');
    test('unsub 前: count=1', count === 1, 1, count);

    unsub();
    bus.emit('tick');
    test('unsub 后: count 仍是 1', count === 1, 1, count);
  }

  // ============================
  // once 只触发一次
  // ============================
  {
    const bus = new EventBus();
    let count = 0;
    bus.once('fire', () => count++);
    bus.emit('fire');
    bus.emit('fire');
    bus.emit('fire');
    test('once: 触发3次 emit 但只收到1次', count === 1, 1, count);
  }

  // ============================
  // once 不影响同事件的 on 订阅
  // ============================
  {
    const bus = new EventBus();
    let onceCount = 0;
    let onCount = 0;
    bus.once('fire', () => onceCount++);
    bus.on('fire', () => onCount++);
    bus.emit('fire');
    bus.emit('fire');
    test('once+on 混用: once=1 after 2 emits', onceCount === 1, 1, onceCount);
    test('once+on 混用: on=2 after 2 emits', onCount === 2, 2, onCount);
  }

  // ============================
  // clear 清除所有
  // ============================
  {
    const bus = new EventBus();
    let a = 0, b = 0;
    bus.on('evtA', () => a++);
    bus.on('evtB', () => b++);
    bus.clear();
    bus.emit('evtA');
    bus.emit('evtB');
    test('clear 后 evtA 不触发', a === 0, 0, a);
    test('clear 后 evtB 不触发', b === 0, 0, b);
  }

  // ============================
  // emit 传递多种数据类型
  // ============================
  {
    const bus = new EventBus();
    let received;

    bus.on('num', d => { received = d; });
    bus.emit('num', 42);
    test('emit 传递数字', received === 42, 42, received);

    bus.on('arr', d => { received = d; });
    bus.emit('arr', [1, 2, 3]);
    test('emit 传递数组', Array.isArray(received) && received.length === 3,
      '[1,2,3]', JSON.stringify(received));

    bus.on('nul', d => { received = d; });
    bus.emit('nul', null);
    test('emit 传递 null', received === null, 'null', String(received));
  }

  // ============================
  // 订阅者抛错不阻塞其他订阅者
  // ============================
  {
    const bus = new EventBus();
    let goodCalled = false;
    bus.on('bad', () => { throw new Error('故意的错误'); });
    bus.on('bad', () => { goodCalled = true; });
    // 应该不抛错
    let threw = false;
    try {
      bus.emit('bad');
    } catch (e) {
      threw = true;
    }
    test('订阅者抛错不向外传播', !threw);
    test('订阅者抛错后其他订阅者仍被调用', goodCalled);
  }

  return {
    name: 'EventBus',
    passed,
    failed,
    total: results.length,
    results
  };
}

export default { run };
