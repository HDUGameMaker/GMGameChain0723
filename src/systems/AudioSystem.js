/**
 * AudioSystem - 音效系统
 *
 * BGM: HTMLAudioElement 流式播放，支持淡入淡出切换
 * SFX: AudioContext + buffer pool，支持低延迟重叠播放
 * 事件绑定: 基于 config/sound.json 的 eventBindings 自动绑定游戏事件→音效
 *
 * 依赖: configRegistry, eventBus, store, gameLoop
 * 被 main.js 实例化和集成
 */

import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { gameLoop } from '../GameLoop.js';

export class AudioSystem {
  constructor() {
    this._audioContext = null;
    this._masterVolume = 0.8;
    this._bgmVolume = 0.7;
    this._sfxVolume = 0.8;
    this._muted = false;

    /** @type {object|null} sound.json 解析结果 */
    this._config = null;

    /** @type {{id: string, element: HTMLAudioElement}|null} */
    this._currentBGM = null;

    /** @type {{id: string, element: HTMLAudioElement}|null} 正在淡出的 BGM */
    this._crossfadeBGM = null;
    this._crossfadeTimer = null;

    /** @type {Object<string, AudioBuffer>} */
    this._sfxBuffers = {};

    /** @type {Object<string, Array<{source: AudioBufferSourceNode, gain: GainNode}>>} */
    this._sfxPools = {};

    /** @type {Object<string, HTMLAudioElement>} 预创建的 BGM 元素 */
    this._bgmElements = {};

    /** @type {boolean} BGM 在暂停前是否在播放 */
    this._wasPlayingBeforePause = false;

    /** @type {boolean} 用户手动静音标记（区别于 tab 隐藏自动静音） */
    this._userMuted = false;

    /** @type {boolean} tab 隐藏引起的静音 */
    this._visibilityMuted = false;

    this._initialized = false;

    // 注册暂停/恢复/可见性事件（构造时即注册，与 TorchSystem 模式一致）
    eventBus.on('gamePaused', () => this._onPause());
    eventBus.on('gameResumed', () => this._onResume());
    eventBus.on('pageVisibilityChange', ({ visible }) => this._onVisibility(visible));

    // 尝试在首次用户交互时恢复 AudioContext
    this._setupUserGestureResume();
  }

  /**
   * 初始化音频系统
   * 加载配置 → 创建 AudioContext → 预解码 SFX → 绑定游戏事件
   */
  async init() {
    try {
      this._config = configRegistry.get('sound');
      if (!this._config) {
        console.warn('[AudioSystem] No sound config found, audio disabled');
        return;
      }

      // 应用配置中的默认音量
      this._masterVolume = this._config.masterVolume ?? 0.8;
      this._bgmVolume = this._config.bgmVolume ?? 0.7;
      this._sfxVolume = this._config.sfxVolume ?? 0.8;

      // 创建 AudioContext
      try {
        this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('[AudioSystem] Web Audio API not supported, audio disabled');
        return;
      }

      // 预创建 BGM 元素
      if (Array.isArray(this._config.bgm)) {
        for (const bgm of this._config.bgm) {
          this._createBGMElement(bgm);
        }
      }

      // 预解码 SFX buffer
      if (Array.isArray(this._config.sfx)) {
        await this._preloadSFXBuffers(this._config.sfx);
      }

      // 绑定游戏事件 → SFX + BGM auto-play
      this._bindGameEvents();

      this._initialized = true;
      console.log('[AudioSystem] Initialized');
      // BGM 通过 _setupUserGestureResume() 在用户首次交互时启动
      // （浏览器自动播放策略要求用户手势后才能播放音频）
    } catch (e) {
      console.warn('[AudioSystem] Init failed:', e.message);
    }
  }

  // ==================== BGM ====================

  /**
   * 播放/切换背景音乐（带淡入淡出）
   * @param {string} id - BGM ID（对应 sound.json bgm[].id）
   */
  playBGM(id) {
    if (!this._initialized || this._muted) return;

    // 如果已经在播放同一首，跳过
    if (this._currentBGM && this._currentBGM.id === id) return;

    const bgmConfig = this._getBGMConfig(id);
    if (!bgmConfig) {
      console.warn(`[AudioSystem] BGM not found: ${id}`);
      return;
    }

    // 取消正在进行的淡出
    this._cancelCrossfade();

    // 如果有正在播放的 BGM，启动淡出
    if (this._currentBGM) {
      this._crossfadeBGM = this._currentBGM;
      this._fadeOut(this._crossfadeBGM.element, 500, () => {
        this._crossfadeBGM.element.pause();
        this._crossfadeBGM = null;
      });
    }

    // 获取或创建 HTMLAudioElement
    let element = this._bgmElements[id];
    if (!element) {
      element = this._createBGMElement(bgmConfig);
    }

    // 设置循环
    element.loop = bgmConfig.loop !== false;

    // 播放（从 0 音量开始淡入）
    this._applyBGMVolume(element, 0);
    element.currentTime = 0;
    element.play().catch(e => {
      // 浏览器可能阻止自动播放，静默处理
      console.debug('[AudioSystem] BGM play blocked:', e.message);
    });

    this._fadeIn(element, 500);

    this._currentBGM = { id, element };
    this._notifyChange();
  }

  /**
   * 停止背景音乐（淡出）
   */
  stopBGM() {
    if (!this._currentBGM) return;

    this._cancelCrossfade();

    const current = this._currentBGM;
    this._currentBGM = null;

    this._fadeOut(current.element, 500, () => {
      current.element.pause();
    });

    this._notifyChange();
  }

  // ==================== SFX ====================

  /**
   * 播放一次性音效（支持重叠播放）
   * @param {string} id - SFX ID（对应 sound.json sfx[].id）
   */
  playSFX(id) {
    if (!this._initialized || !this._audioContext || this._muted) return;
    if (this._sfxVolume <= 0) return;

    // 如果 AudioContext 被暂停，尝试恢复
    if (this._audioContext.state === 'suspended') {
      this._audioContext.resume().catch(() => {});
    }

    const buffer = this._sfxBuffers[id];
    if (!buffer) {
      // 静默忽略未加载的 SFX（不刷 warning，避免刷屏）
      return;
    }

    const sfxConfig = this._getSFXConfig(id);
    const configVol = sfxConfig ? (sfxConfig.volume ?? 0.8) : 0.8;

    try {
      const source = this._audioContext.createBufferSource();
      source.buffer = buffer;

      const gain = this._audioContext.createGain();
      const effectiveVol = configVol * this._sfxVolume * this._masterVolume;
      gain.gain.value = Math.max(0, Math.min(1, effectiveVol));

      source.connect(gain);
      gain.connect(this._audioContext.destination);

      // Buffer pool 管理
      if (!this._sfxPools[id]) {
        this._sfxPools[id] = [];
      }
      const pool = this._sfxPools[id];

      // 清理已结束的 source，并限制池大小
      const active = pool.filter(p => {
        try { return p.source.playbackState !== 3; } catch (e) { return false; }
      });
      this._sfxPools[id] = active;

      // 池上限 8 个
      if (active.length >= 8) {
        try { active[0].source.stop(); } catch (e) { /* ignore */ }
        active.shift();
      }

      source.onended = () => {
        const idx = this._sfxPools[id] ? this._sfxPools[id].findIndex(p => p.source === source) : -1;
        if (idx >= 0) this._sfxPools[id].splice(idx, 1);
      };

      this._sfxPools[id].push({ source, gain });
      source.start(0);
    } catch (e) {
      console.debug('[AudioSystem] SFX play error:', id, e.message);
    }
  }

  // ==================== 音量控制 ====================

  /**
   * 设置主音量
   * @param {number} v - 0~1
   */
  setMasterVolume(v) {
    this._masterVolume = Math.max(0, Math.min(1, v));
    if (this._currentBGM) {
      this._applyBGMVolume(this._currentBGM.element, this._getEffectiveBGMVolume());
    }
    this._notifyChange();
  }

  /**
   * 设置背景音乐音量
   * @param {number} v - 0~1
   */
  setBGMVolume(v) {
    this._bgmVolume = Math.max(0, Math.min(1, v));
    if (this._currentBGM) {
      this._applyBGMVolume(this._currentBGM.element, this._getEffectiveBGMVolume());
    }
    this._notifyChange();
  }

  /**
   * 设置音效音量
   * @param {number} v - 0~1
   */
  setSFXVolume(v) {
    this._sfxVolume = Math.max(0, Math.min(1, v));
    this._notifyChange();
  }

  /**
   * 获取主音量
   * @returns {number}
   */
  getMasterVolume() {
    return this._masterVolume;
  }

  /**
   * 获取 BGM 音量
   * @returns {number}
   */
  getBGMVolume() {
    return this._bgmVolume;
  }

  /**
   * 获取 SFX 音量
   * @returns {number}
   */
  getSFXVolume() {
    return this._sfxVolume;
  }

  /**
   * 切换静音状态
   */
  toggleMute() {
    this._muted = !this._muted;
    this._userMuted = this._muted;

    if (this._muted) {
      // 静音：暂停 BGM
      if (this._currentBGM) {
        this._currentBGM.element.pause();
      }
    } else {
      // 取消静音：恢复 BGM
      if (this._currentBGM && !gameLoop.isPaused()) {
        this._currentBGM.element.play().catch(() => {});
      }
    }

    this._notifyChange();
  }

  /**
   * 是否处于静音状态
   * @returns {boolean}
   */
  isMuted() {
    return this._muted;
  }

  // ==================== 存档 ====================

  /**
   * 获取存档状态（仅音量设置，不含运行时播放状态）
   * @returns {{musicVolume: number, sfxVolume: number, muted: boolean}}
   */
  getAllStates() {
    return {
      musicVolume: this._bgmVolume,
      sfxVolume: this._sfxVolume,
      muted: this._muted
    };
  }

  /**
   * 从存档恢复
   * @param {{musicVolume?: number, sfxVolume?: number, muted?: boolean}} state
   */
  restoreState(state) {
    if (!state) return;

    if (state.musicVolume !== undefined) {
      this._bgmVolume = Math.max(0, Math.min(1, state.musicVolume));
    }
    if (state.sfxVolume !== undefined) {
      this._sfxVolume = Math.max(0, Math.min(1, state.sfxVolume));
    }
    if (state.muted !== undefined) {
      this._muted = state.muted;
      this._userMuted = state.muted;
    }

    if (this._currentBGM) {
      this._applyBGMVolume(this._currentBGM.element, this._getEffectiveBGMVolume());
    }
    this._notifyChange();
  }

  // ==================== 内部方法 ====================

  /**
   * 获取建筑音效配置
   * @param {string} buildingId - 建筑 ID
   * @param {string} soundKey - 音效键（buildStart, buildComplete, demolish, upgrade, move）
   * @returns {string|null} SFX ID
   */
  _getBuildingSound(buildingId, soundKey) {
    if (!this._config || !this._config.buildingSoundBindings) return null;
    
    // 优先使用建筑特定音效
    if (this._config.buildingSoundBindings[buildingId] && 
        this._config.buildingSoundBindings[buildingId][soundKey] !== undefined) {
      return this._config.buildingSoundBindings[buildingId][soundKey];
    }
    
    // 否则使用默认音效
    if (this._config.buildingSoundBindings.default && 
        this._config.buildingSoundBindings.default[soundKey] !== undefined) {
      return this._config.buildingSoundBindings.default[soundKey];
    }
    
    return null;
  }

  /**
   * 获取物品合成音效配置
   * @param {string} itemId - 物品 ID
   * @param {string} soundKey - 音效键（synthesisStart, synthesisComplete）
   * @returns {string|null} SFX ID
   */
  _getItemSound(itemId, soundKey) {
    if (!this._config || !this._config.itemSoundBindings) return null;
    
    // 优先使用物品特定音效
    if (this._config.itemSoundBindings[itemId] && 
        this._config.itemSoundBindings[itemId][soundKey] !== undefined) {
      return this._config.itemSoundBindings[itemId][soundKey];
    }
    
    // 否则使用默认音效
    if (this._config.itemSoundBindings.default && 
        this._config.itemSoundBindings.default[soundKey] !== undefined) {
      return this._config.itemSoundBindings.default[soundKey];
    }
    
    return null;
  }

  /**
   * 绑定游戏事件 → SFX（基于 config/sound.json eventBindings）
   * + BGM 自动切换（基于时段）
   * + 建筑音效绑定
   */
  _bindGameEvents() {
    // ── SFX 事件绑定 ──
    if (this._config && Array.isArray(this._config.eventBindings)) {
      for (const binding of this._config.eventBindings) {
        if (!binding.sound) continue; // null 表示不绑定

        const sfxConfig = this._getSFXConfig(binding.sound);
        if (!sfxConfig) {
          console.warn(`[AudioSystem] SFX not found for binding: ${binding.event} → ${binding.sound}`);
          continue;
        }

        eventBus.on(binding.event, () => {
          if (gameLoop.isPaused()) return;
          if (!gameLoop.isPageVisible()) return;
          this.playSFX(binding.sound);
        });
      }
    }

    // ── 建筑音效绑定 ──
    const buildingEvents = [
      { event: 'buildingClicked', soundKey: 'click' },
      { event: 'buildingPlaced', soundKey: 'buildStart' },   // 放置建筑 = 开始建造
      { event: 'buildingComplete', soundKey: 'buildComplete' }, // 建造完成
      { event: 'buildingDemolished', soundKey: 'demolish' },
      { event: 'buildingUpgraded', soundKey: 'upgrade' },
      { event: 'buildingMoved', soundKey: 'move' },
    ];

    for (const { event, soundKey } of buildingEvents) {
      eventBus.on(event, (payload) => {
        if (gameLoop.isPaused()) return;
        if (!gameLoop.isPageVisible()) return;
        if (!payload) return;

        // 从事件数据中提取 buildingId（不同事件格式不同）
        const buildingId = payload.buildingId || (payload.building && payload.building.buildingId);
        if (!buildingId) return;

        const soundId = this._getBuildingSound(buildingId, soundKey);
        if (soundId) {
          this.playSFX(soundId);
        }
      });
    }

    // ── 物品合成音效绑定 ──
    const itemEvents = [
      { event: 'synthesisStarted', soundKey: 'synthesisStart' },
      { event: 'synthesisComplete', soundKey: 'synthesisComplete' },
    ];

    for (const { event, soundKey } of itemEvents) {
      eventBus.on(event, (payload) => {
        if (gameLoop.isPaused()) return;
        if (!gameLoop.isPageVisible()) return;
        if (!payload) return;

        // 从事件数据中提取 itemId
        const itemId = payload.itemId || (payload.item && payload.item.id);
        if (!itemId) return;

        const soundId = this._getItemSound(itemId, soundKey);
        if (soundId) {
          this.playSFX(soundId);
        }
      });
    }

    // ── BGM 事件绑定（由 sound.json 的 bgmBindings 配置）──
    if (this._config && Array.isArray(this._config.bgmBindings)) {
      for (const binding of this._config.bgmBindings) {
        if (!binding.bgm) continue;

        const bgmConfig = this._getBGMConfig(binding.bgm);
        if (!bgmConfig) {
          console.warn(`[AudioSystem] BGM not found for binding: ${binding.event} → ${binding.bgm}`);
          continue;
        }

        eventBus.on(binding.event, (payload) => {
          if (gameLoop.isPaused()) return;

          // periods 过滤器：仅在指定时段触发（用于 periodChange 等事件）
          if (binding.periods && Array.isArray(binding.periods) && binding.periods.length > 0) {
            if (!payload || !payload.period) return;
            if (!binding.periods.includes(payload.period)) return;
          }

          this.playBGM(binding.bgm);
        });
      }
    }
  }

  /**
   * 游戏暂停时的处理
   */
  _onPause() {
    if (this._currentBGM && !this._currentBGM.element.paused) {
      this._wasPlayingBeforePause = true;
      this._currentBGM.element.pause();
    }
    // 暂停 AudioContext
    if (this._audioContext && this._audioContext.state === 'running') {
      this._audioContext.suspend().catch(() => {});
    }
  }

  /**
   * 游戏恢复时的处理
   */
  _onResume() {
    // 恢复 AudioContext
    if (this._audioContext && this._audioContext.state === 'suspended') {
      this._audioContext.resume().catch(() => {});
    }
    // 恢复 BGM
    if (this._wasPlayingBeforePause && this._currentBGM && !this._muted) {
      this._currentBGM.element.play().catch(() => {});
      this._wasPlayingBeforePause = false;
    }
  }

  /**
   * tab 可见性变更
   * @param {boolean} visible
   */
  _onVisibility(visible) {
    if (!visible) {
      // tab 隐藏：静音 BGM（但不改变 _muted 标记）
      if (this._currentBGM && !this._currentBGM.element.paused) {
        this._visibilityMuted = true;
        this._currentBGM.element.pause();
      }
    } else {
      // tab 可见：恢复 BGM（仅在未被用户手动静音且非暂停状态）
      if (this._visibilityMuted && this._currentBGM && !this._muted && !gameLoop.isPaused()) {
        this._currentBGM.element.play().catch(() => {});
        this._visibilityMuted = false;
      }
    }
  }

  /**
   * 在用户首次交互时：恢复 AudioContext + 启动初始 BGM
   * 浏览器自动播放策略要求用户手势后才能播放音频，
   * 因此不在 init() 中直接播放，而是等待用户首次点击/按键/触摸。
   */
  _setupUserGestureResume() {
    const kickstart = () => {
      // 恢复 AudioContext（首次交互后浏览器允许）
      if (this._audioContext && this._audioContext.state === 'suspended') {
        this._audioContext.resume().catch(() => {});
      }

      // 在用户手势的同步调用链中启动 BGM（浏览器允许此次播放）
      if (this._initialized && !this._currentBGM && !this._muted) {
        this.playBGM('bgm_main');
      }

      // BGM 已启动，清理监听器
      if (this._currentBGM) {
        document.removeEventListener('click', kickstart);
        document.removeEventListener('keydown', kickstart);
        document.removeEventListener('touchstart', kickstart);
      }
    };
    document.addEventListener('click', kickstart);
    document.addEventListener('keydown', kickstart);
    document.addEventListener('touchstart', kickstart);
  }

  /**
   * 获取 BGM 配置
   * @param {string} id
   * @returns {object|null}
   */
  _getBGMConfig(id) {
    if (!this._config || !Array.isArray(this._config.bgm)) return null;
    return this._config.bgm.find(b => b.id === id) || null;
  }

  /**
   * 获取 SFX 配置
   * @param {string} id
   * @returns {object|null}
   */
  _getSFXConfig(id) {
    if (!this._config || !Array.isArray(this._config.sfx)) return null;
    return this._config.sfx.find(s => s.id === id) || null;
  }

  /**
   * 创建 HTMLAudioElement 用于 BGM
   * @param {object} bgmConfig
   * @returns {HTMLAudioElement}
   */
  _createBGMElement(bgmConfig) {
    const element = new Audio(bgmConfig.file);
    element.loop = bgmConfig.loop !== false;
    element.preload = 'auto';
    element.volume = 0; // 从 0 开始，播放时淡入
    this._bgmElements[bgmConfig.id] = element;
    return element;
  }

  /**
   * 预加载 SFX buffer 到内存
   * @param {Array} sfxList
   */
  async _preloadSFXBuffers(sfxList) {
    const loadPromises = sfxList.map(async (sfx) => {
      try {
        const response = await fetch(sfx.file);
        if (!response.ok) {
          console.warn(`[AudioSystem] SFX file not found: ${sfx.file} (${response.status})`);
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this._audioContext.decodeAudioData(arrayBuffer);
        this._sfxBuffers[sfx.id] = audioBuffer;
        return sfx.id;
      } catch (e) {
        console.warn(`[AudioSystem] Failed to load SFX: ${sfx.id} (${e.message})`);
        return null;
      }
    });

    const results = await Promise.all(loadPromises);
    const loaded = results.filter(Boolean);
    if (loaded.length > 0) {
      console.log(`[AudioSystem] Preloaded ${loaded.length} SFX buffers`);
    }
  }

  /**
   * 计算 BGM 有效音量
   * @returns {number}
   */
  _getEffectiveBGMVolume() {
    if (!this._currentBGM) return 0;
    const bgmConfig = this._getBGMConfig(this._currentBGM.id);
    const configVol = bgmConfig ? (bgmConfig.volume ?? 1.0) : 1.0;
    return configVol * this._bgmVolume * this._masterVolume;
  }

  /**
   * 应用音量到 BGM 元素
   * @param {HTMLAudioElement} element
   * @param {number} volume - 0~1
   */
  _applyBGMVolume(element, volume) {
    element.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * 淡入
   * @param {HTMLAudioElement} element
   * @param {number} duration - ms
   */
  _fadeIn(element, duration) {
    const targetVol = this._getEffectiveBGMVolume();
    this._animateVolume(element, element.volume, targetVol, duration);
  }

  /**
   * 淡出
   * @param {HTMLAudioElement} element
   * @param {number} duration - ms
   * @param {Function} [onComplete]
   */
  _fadeOut(element, duration, onComplete) {
    this._animateVolume(element, element.volume, 0, duration, onComplete);
  }

  /**
   * 音量动画（使用 requestAnimationFrame，零依赖）
   * @param {HTMLAudioElement} element
   * @param {number} from - 起始音量
   * @param {number} to - 目标音量
   * @param {number} duration - ms
   * @param {Function} [onComplete]
   */
  _animateVolume(element, from, to, duration, onComplete) {
    const start = performance.now();
    const step = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeInOutQuad
      const eased = progress < 0.5
        ? 2 * progress * progress
        : -1 + (4 - 2 * progress) * progress;
      const vol = from + (to - from) * eased;
      this._applyBGMVolume(element, vol);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        this._applyBGMVolume(element, to);
        if (onComplete) onComplete();
      }
    };
    requestAnimationFrame(step);
  }

  /**
   * 取消正在进行的淡出
   */
  _cancelCrossfade() {
    // 淡出动画通过 requestAnimationFrame 实现，取消通过覆盖完成回调
    // 简化方案：直接暂停旧的 BGM 元素
    if (this._crossfadeBGM) {
      this._crossfadeBGM.element.pause();
      this._crossfadeBGM.element.volume = 0;
      this._crossfadeBGM = null;
    }
    if (this._crossfadeTimer) {
      clearTimeout(this._crossfadeTimer);
      this._crossfadeTimer = null;
    }
  }

  /**
   * 通知状态变更
   */
  _notifyChange() {
    eventBus.emit('audioSettingsChanged', {
      musicVolume: this._bgmVolume,
      sfxVolume: this._sfxVolume,
      muted: this._muted
    });
    store.setState({ audioVersion: Date.now() });
  }

  /**
   * 热重载配置（从 configRegistry 重新加载 sound.json）
   * 用于编辑器修改配置后实时生效
   */
  async reloadConfig() {
    try {
      const newConfig = configRegistry.get('sound');
      if (!newConfig) {
        console.warn('[AudioSystem] No sound config found for reload');
        return;
      }

      this._config = newConfig;

      // 更新音量设置
      if (newConfig.masterVolume !== undefined) {
        this._masterVolume = newConfig.masterVolume;
      }
      if (newConfig.bgmVolume !== undefined) {
        this._bgmVolume = newConfig.bgmVolume;
        if (this._currentBGM) {
          this._applyBGMVolume(this._currentBGM.element, this._getEffectiveBGMVolume());
        }
      }
      if (newConfig.sfxVolume !== undefined) {
        this._sfxVolume = newConfig.sfxVolume;
      }

      // 重新预加载 SFX buffers（如果有新增或修改的音效）
      if (Array.isArray(newConfig.sfx)) {
        await this._preloadSFXBuffers(newConfig.sfx);
      }

      // 重新预创建 BGM 元素
      if (Array.isArray(newConfig.bgm)) {
        for (const bgm of newConfig.bgm) {
          this._createBGMElement(bgm);
        }
      }

      console.log('[AudioSystem] Config reloaded successfully');
      this._notifyChange();
    } catch (e) {
      console.warn('[AudioSystem] Failed to reload config:', e.message);
    }
  }
}

export default AudioSystem;
