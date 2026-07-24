/**
 * test-store.js — Store 响应式状态容器单元测试
 *
 * 覆盖 src/core/Store.js 全部方法：
 *   getState, setState, subscribe
 *
 * 使用独立的 Store 实例（非全局单例），确保测试隔离。
 *
 * 导出 run() 函数，返回 { name, passed, failed, total, results[] }
 */

import Store from '../../src/core/Store.js';

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
  // getState 初始状态
  // ============================
  {
    const store = new Store();
    test('新 Store getState() 返回空对象', JSON.stringify(store.getState()) === '{}',
      '{}', JSON.stringify(store.getState()));
    test('新 Store getState("key") 返回 undefined', store.getState('nonexistent') === undefined);
  }

  // ============================
  // setState + getState
  // ============================
  {
    const store = new Store();
    store.setState({ food: 100, wood: 50 });
    test('setState 后 getState("food")=100', store.getState('food') === 100, 100, store.getState('food'));
    test('setState 后 getState("wood")=50', store.getState('wood') === 50, 50, store.getState('wood'));
    test('setState 未设置的 key 仍是 undefined', store.getState('stone') === undefined);
  }

  // ============================
  // setState 浅合并
  // ============================
  {
    const store = new Store();
    store.setState({ a: 1, b: 2 });
    store.setState({ b: 3, c: 4 });
    test('浅合并: a 保持原值', store.getState('a') === 1, 1, store.getState('a'));
    test('浅合并: b 被更新', store.getState('b') === 3, 3, store.getState('b'));
    test('浅合并: c 被添加', store.getState('c') === 4, 4, store.getState('c'));
  }

  // ============================
  // getState() 返回副本
  // ============================
  {
    const store = new Store();
    store.setState({ x: 10 });
    const snapshot = store.getState();
    snapshot.x = 999; // 修改副本不应影响 store
    test('getState() 返回副本(修改不影响内部)', store.getState('x') === 10, 10, store.getState('x'));
  }

  // ============================
  // subscribe 基本订阅
  // ============================
  {
    const store = new Store();
    const calls = [];
    const unsub = store.subscribe('gold', (val) => calls.push(val));
    store.setState({ gold: 100 });
    test('subscribe: set 后收到新值', calls.length === 1 && calls[0] === 100,
      '100 (1 call)', `${calls[0]} (${calls.length} calls)`);

    store.setState({ gold: 100 }); // 相同值
    test('subscribe: set 相同值不触发通知', calls.length === 1, 1, calls.length);

    store.setState({ gold: 200 });
    test('subscribe: set 不同值触发通知', calls.length === 2 && calls[1] === 200,
      '200 (2 calls)', `${calls[1]} (${calls.length} calls)`);

    unsub();
    store.setState({ gold: 300 });
    test('subscribe: 取消后不再触发', calls.length === 2, 2, calls.length);
  }

  // ============================
  // subscribe '*' 通配符
  // ============================
  {
    const store = new Store();
    const calls = [];
    store.subscribe('*', (state) => calls.push({ ...state }));

    store.setState({ hp: 50 });
    test('通配符: setState 触发', calls.length === 1, 1, calls.length);
    test('通配符: 包含完整 state', calls[0]?.hp === 50);

    store.setState({ mp: 30 });
    test('通配符: 第二次 setState 也触发', calls.length === 2, 2, calls.length);
    test('通配符: state 累积存在', calls[1]?.hp === 50 && calls[1]?.mp === 30,
      'hp=50,mp=30', `hp=${calls[1]?.hp},mp=${calls[1]?.mp}`);
  }

  // ============================
  // 多个状态的 subscribe
  // ============================
  {
    const store = new Store();
    const foodLog = [];
    const woodLog = [];
    store.subscribe('food', v => foodLog.push(v));
    store.subscribe('wood', v => woodLog.push(v));

    store.setState({ food: 10 });
    test('多 subscribe: food 收到', foodLog.length === 1, 1, foodLog.length);
    test('多 subscribe: wood 未触发', woodLog.length === 0, 0, woodLog.length);

    store.setState({ wood: 5 });
    test('多 subscribe: wood 收到', woodLog.length === 1, 1, woodLog.length);
    test('多 subscribe: food 未重复触发', foodLog.length === 1, 1, foodLog.length);

    store.setState({ food: 20, wood: 10 });
    test('多 subscribe 同时更新: food 收到', foodLog.length === 2, 2, foodLog.length);
    test('多 subscribe 同时更新: wood 收到', woodLog.length === 2, 2, woodLog.length);
  }

  // ============================
  // subscribe 回调中抛错不阻塞其他订阅者
  // ============================
  {
    const store = new Store();
    let goodCalled = false;
    store.subscribe('bad', () => { throw new Error('故意的错误'); });
    store.subscribe('bad', () => { goodCalled = true; });

    let threw = false;
    try {
      store.setState({ bad: 1 });
    } catch (e) {
      threw = true;
    }
    test('subscribe 抛错不向外传播', !threw);
    test('subscribe 抛错后其他订阅者仍被调用', goodCalled);
  }

  return {
    name: 'Store',
    passed,
    failed,
    total: results.length,
    results
  };
}

export default { run };
