/**
 * MainMenu - 游戏主菜单组件
 * 根据配置文件 config/ui_main_menu.json 渲染主菜单
 * 支持图片/文字分离配置，文字在图片上方
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { SaveManager } from '../core/SaveManager.js';

class MainMenu {
  constructor() {
    this.container = null;
    this.config = null;
    this.onNewGame = null;
    this.onContinueGame = null;
    this.onSettings = null;
    this.onExit = null;
    this._aboutPopup = null;
  }

  /**
   * 初始化主菜单
   * @param {object} callbacks - 回调函数
   */
  init(callbacks) {
    this.onNewGame = callbacks.onNewGame;
    this.onContinueGame = callbacks.onContinueGame;
    this.onSettings = callbacks.onSettings;
    this.onExit = callbacks.onExit;

    this.loadConfig();
    this.render();
  }

  /**
   * 加载配置（含默认值兼容）
   */
  loadConfig() {
    const cfg = configRegistry.get('ui_main_menu') || {};
    this.config = this._normalizeConfig(cfg);
  }

  /**
   * 规范化配置，补全默认值并兼容旧结构
   */
  _normalizeConfig(cfg) {
    const background = cfg.background || { type: 'color', color: '#0c0c1e', image: '', scaleMode: 'cover' };

    // Logo：兼容旧结构
    const logoRaw = cfg.logo || {};
    const logo = this._normalizeLogo(logoRaw);

    // 按钮：兼容旧结构
    const buttonsRaw = cfg.buttons || {};
    const buttons = {};
    const btnDefaults = {
      newGame: { text: '新游戏', y: 40, bgColor: 'rgba(91, 141, 239, 0.2)', hoverBgColor: 'rgba(91, 141, 239, 0.4)', borderColor: 'rgba(91, 141, 239, 0.5)', fontColor: '#ececf0' },
      continueGame: { text: '继续游戏', y: 50, bgColor: 'rgba(78, 203, 113, 0.15)', hoverBgColor: 'rgba(78, 203, 113, 0.35)', borderColor: 'rgba(78, 203, 113, 0.4)', fontColor: '#ececf0' },
      settings: { text: '设置', y: 60, bgColor: 'rgba(139, 124, 240, 0.15)', hoverBgColor: 'rgba(139, 124, 240, 0.35)', borderColor: 'rgba(139, 124, 240, 0.4)', fontColor: '#ececf0' },
      about: { text: '关于', y: 70, bgColor: 'rgba(240, 160, 64, 0.15)', hoverBgColor: 'rgba(240, 160, 64, 0.35)', borderColor: 'rgba(240, 160, 64, 0.4)', fontColor: '#ececf0' },
      exit: { text: '退出', y: 80, bgColor: 'rgba(255, 107, 107, 0.08)', hoverBgColor: 'rgba(255, 107, 107, 0.25)', borderColor: 'rgba(255, 107, 107, 0.3)', fontColor: '#ff6b6b' }
    };
    for (const key of Object.keys(btnDefaults)) {
      buttons[key] = this._normalizeButton(buttonsRaw[key] || {}, btnDefaults[key]);
    }

    const aboutContent = cfg.aboutContent || {
      title: '关于 GMGameChain',
      team: 'GMGameChain 开发团队',
      message: '感谢游玩本游戏！',
      version: '1.0.0'
    };

    return { background, logo, buttons, aboutContent };
  }

  _normalizeLogo(raw) {
    // 新结构：image/text 分离
    if (raw.image && typeof raw.image === 'object' && (raw.text === undefined || typeof raw.text === 'object')) {
      return {
        type: raw.type || 'text',
        image: {
          src: raw.image.src || '',
          position: raw.image.position || { x: 50, y: 22 },
          offset: raw.image.offset || { x: 0, y: 0 },
          scale: raw.image.scale != null ? raw.image.scale : 1,
          maxSize: raw.image.maxSize || { width: 300, height: 150 }
        },
        text: {
          content: raw.text?.content || raw.text?.text || 'GMGameChain',
          position: raw.text?.position || { x: 50, y: 12 },
          offset: raw.text?.offset || { x: 0, y: 0 },
          fontSize: raw.text?.fontSize || 48,
          fontFamily: raw.text?.fontFamily || 'inherit',
          fontColor: raw.text?.fontColor || raw.fontColor || '#f0a040',
          fontWeight: raw.text?.fontWeight || raw.fontWeight || 'bold'
        }
      };
    }
    // 旧结构兼容：扁平字段
    return {
      type: raw.type || 'text',
      image: {
        src: raw.image || '',
        position: raw.position || { x: 50, y: 22 },
        offset: { x: 0, y: 0 },
        scale: raw.scale != null ? raw.scale : 1,
        maxSize: { width: 300, height: 150 }
      },
      text: {
        content: raw.text || 'GMGameChain',
        position: raw.position || { x: 50, y: 12 },
        offset: { x: 0, y: 0 },
        fontSize: raw.fontSize || 48,
        fontFamily: 'inherit',
        fontColor: raw.fontColor || '#f0a040',
        fontWeight: raw.fontWeight || 'bold'
      }
    };
  }

  _normalizeButton(raw, defaults) {
    const position = raw.position || { x: 50, y: defaults.y };
    const size = raw.size || { width: 200, height: 48 };

    // 新结构：image/text 分离
    if (raw.image && typeof raw.image === 'object' && (raw.text === undefined || typeof raw.text === 'object')) {
      return {
        type: raw.type || 'text',
        position,
        size,
        image: {
          src: raw.image.src || '',
          offset: raw.image.offset || { x: 0, y: 8 },
          scale: raw.image.scale != null ? raw.image.scale : 1,
          maxSize: raw.image.maxSize || { width: size.width - 40, height: size.height - 20 }
        },
        text: {
          content: raw.text?.content || defaults.text,
          offset: raw.text?.offset || { x: 0, y: -8 },
          fontSize: raw.text?.fontSize || 18,
          fontFamily: raw.text?.fontFamily || 'inherit',
          fontColor: raw.text?.fontColor || defaults.fontColor,
          fontWeight: raw.text?.fontWeight || 'normal'
        },
        bgColor: raw.bgColor || defaults.bgColor,
        hoverBgColor: raw.hoverBgColor || defaults.hoverBgColor,
        borderColor: raw.borderColor || defaults.borderColor,
        borderRadius: raw.borderRadius != null ? raw.borderRadius : 12
      };
    }
    // 旧结构兼容：扁平字段
    return {
      type: raw.type || 'text',
      position,
      size,
      image: {
        src: raw.image || '',
        offset: { x: 0, y: 8 },
        scale: 1,
        maxSize: { width: size.width - 40, height: size.height - 20 }
      },
      text: {
        content: raw.text || defaults.text,
        offset: { x: 0, y: -8 },
        fontSize: raw.fontSize || 18,
        fontFamily: 'inherit',
        fontColor: raw.fontColor || defaults.fontColor,
        fontWeight: 'normal'
      },
      bgColor: raw.bgColor || defaults.bgColor,
      hoverBgColor: raw.hoverBgColor || defaults.hoverBgColor,
      borderColor: raw.borderColor || defaults.borderColor,
      borderRadius: raw.borderRadius != null ? raw.borderRadius : 12
    };
  }

  /**
   * 渲染主菜单
   */
  render() {
    if (this.container) {
      this.container.remove();
    }

    this.container = document.createElement('div');
    this.container.id = 'main-menu';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    `;

    this.renderBackground();
    this.renderLogo();
    this.renderButtons();

    document.body.appendChild(this.container);
    this.checkSaveExists();
  }

  renderBackground() {
    const bg = this.config.background;
    const bgEl = document.createElement('div');

    let style = `position:absolute;inset:0;`;
    if (bg.type === 'color' || bg.type === 'both') {
      style += `background-color:${bg.color};`;
    }
    if (bg.type === 'image' || bg.type === 'both') {
      if (bg.image) {
        const sizeMode = bg.scaleMode === 'stretch' ? '100% 100%' : bg.scaleMode;
        style += `background-image:url('${bg.image}');background-size:${sizeMode};background-position:center;background-repeat:no-repeat;`;
      }
    }

    bgEl.style.cssText = style;
    this.container.appendChild(bgEl);
  }

  renderLogo() {
    const logo = this.config.logo;
    // 文字（上方）
    if (logo.type === 'text' || logo.type === 'both' || logo.text?.content) {
      this.container.appendChild(this._makeTextElement(logo.text, true));
    }
    // 图片（下方）
    if ((logo.type === 'image' || logo.type === 'both') && logo.image.src) {
      this.container.appendChild(this._makeImageElement(logo.image, true));
    }
  }

  _makeTextElement(textCfg, isLogo) {
    const el = document.createElement('div');
    const pos = textCfg.position || (isLogo ? { x: 50, y: 12 } : { x: 50, y: 50 });
    const off = textCfg.offset || { x: 0, y: 0 };
    el.style.cssText = `
      position:absolute;
      left:${pos.x}%;top:${pos.y}%;
      transform:translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px));
      font-size:${textCfg.fontSize || 18}px;
      font-family:${textCfg.fontFamily || 'inherit'};
      font-weight:${textCfg.fontWeight || 'normal'};
      color:${textCfg.fontColor || '#ececf0'};
      text-align:center;
      pointer-events:none;
      white-space:nowrap;
      text-shadow:0 2px 10px rgba(0,0,0,0.3);
    `;
    el.textContent = textCfg.content || '';
    return el;
  }

  _makeImageElement(imgCfg, isLogo) {
    const el = document.createElement('div');
    const pos = imgCfg.position || (isLogo ? { x: 50, y: 22 } : { x: 50, y: 50 });
    const off = imgCfg.offset || { x: 0, y: 0 };
    const scale = imgCfg.scale != null ? imgCfg.scale : 1;
    const maxSize = imgCfg.maxSize || { width: 300, height: 150 };
    el.style.cssText = `
      position:absolute;
      left:${pos.x}%;top:${pos.y}%;
      transform:translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px)) scale(${scale});
      pointer-events:none;
      text-align:center;
    `;
    const img = document.createElement('img');
    img.src = imgCfg.src;
    img.style.cssText = `max-width:${maxSize.width}px;max-height:${maxSize.height}px;display:block;margin:0 auto;object-fit:contain;`;
    img.onerror = () => { el.style.display = 'none'; };
    el.appendChild(img);
    return el;
  }

  renderButtons() {
    const buttons = this.config.buttons;

    this.renderButton('newGame', buttons.newGame, () => this.onNewGame && this.onNewGame());
    this.renderButton('continueGame', buttons.continueGame, () => this.onContinueGame && this.onContinueGame());
    this.renderButton('settings', buttons.settings, () => this.onSettings && this.onSettings());
    this.renderButton('about', buttons.about, () => this.showAbout());
    this.renderButton('exit', buttons.exit, () => this.onExit && this.onExit());
  }

  renderButton(key, btnConfig, onClick) {
    const btn = document.createElement('button');
    const c = btnConfig || {};

    const pos = c.position || { x: 50, y: 50 };
    const size = c.size || { width: 200, height: 48 };
    let style = `position:absolute;`;
    style += `left:${pos.x}%;top:${pos.y}%;transform:translate(-50%,-50%);`;
    style += `width:${size.width}px;height:${size.height}px;`;
    style += `background-color:${c.bgColor || 'rgba(91,141,239,0.2)'};`;
    style += `border:1px solid ${c.borderColor || 'rgba(91,141,239,0.5)'};`;
    style += `border-radius:${c.borderRadius != null ? c.borderRadius : 12}px;`;
    style += `cursor:pointer;transition:background-color 0.2s;`;
    style += `overflow:hidden;`;
    btn.style.cssText = style;

    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = c.hoverBgColor || 'rgba(91,141,239,0.4)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = c.bgColor || 'rgba(91,141,239,0.2)';
    });
    btn.addEventListener('click', onClick);

    // 文字在上方
    if ((c.type === 'text' || c.type === 'both') && c.text) {
      const textWrap = document.createElement('div');
      const tOff = c.text.offset || { x: 0, y: -8 };
      textWrap.style.cssText = `
        position:absolute;left:50%;top:50%;
        transform:translate(calc(-50% + ${tOff.x}px), calc(-50% + ${tOff.y}px));
        font-size:${c.text.fontSize || 18}px;
        font-family:${c.text.fontFamily || 'inherit'};
        font-weight:${c.text.fontWeight || 'normal'};
        color:${c.text.fontColor || '#ececf0'};
        white-space:nowrap;
        pointer-events:none;
      `;
      textWrap.textContent = c.text.content || '';
      btn.appendChild(textWrap);
    }
    // 图片在下方
    if ((c.type === 'image' || c.type === 'both') && c.image && c.image.src) {
      const imgWrap = document.createElement('div');
      const iOff = c.image.offset || { x: 0, y: 8 };
      const iScale = c.image.scale != null ? c.image.scale : 1;
      const iMax = c.image.maxSize || { width: size.width - 40, height: size.height - 20 };
      imgWrap.style.cssText = `
        position:absolute;left:50%;top:50%;
        transform:translate(calc(-50% + ${iOff.x}px), calc(-50% + ${iOff.y}px)) scale(${iScale});
        pointer-events:none;
      `;
      const img = document.createElement('img');
      img.src = c.image.src;
      img.style.cssText = `max-width:${iMax.width}px;max-height:${iMax.height}px;display:block;object-fit:contain;`;
      img.onerror = () => { imgWrap.style.display = 'none'; };
      imgWrap.appendChild(img);
      btn.appendChild(imgWrap);
    }

    this.container.appendChild(btn);
    this[`btn_${key}`] = btn;
  }

  /**
   * 显示"关于"弹窗
   */
  showAbout() {
    if (this._aboutPopup) {
      this._aboutPopup.remove();
      this._aboutPopup = null;
      return;
    }
    const content = this.config.aboutContent || {};
    const popup = document.createElement('div');
    popup.style.cssText = `
      position:fixed;inset:0;z-index:1100;
      display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.6);
      animation:fadeIn 0.2s ease;
    `;
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        popup.remove();
        this._aboutPopup = null;
      }
    });

    const card = document.createElement('div');
    card.style.cssText = `
      background:#1e1e32;color:#ececf0;
      border:1px solid rgba(240,160,64,0.3);
      border-radius:16px;padding:32px 40px;
      max-width:480px;width:90%;
      box-shadow:0 12px 48px rgba(0,0,0,0.4);
      text-align:center;
      font-family:inherit;
    `;

    const title = document.createElement('div');
    title.style.cssText = `font-size:24px;font-weight:bold;color:#f0a040;margin-bottom:16px;`;
    title.textContent = content.title || '关于';
    card.appendChild(title);

    if (content.team) {
      const team = document.createElement('div');
      team.style.cssText = `font-size:15px;color:#ececf0;margin-bottom:12px;`;
      team.textContent = '开发团队：' + content.team;
      card.appendChild(team);
    }

    if (content.message) {
      const msg = document.createElement('div');
      msg.style.cssText = `font-size:14px;color:#a0a0ba;line-height:1.8;margin-bottom:16px;white-space:pre-line;`;
      msg.textContent = content.message;
      card.appendChild(msg);
    }

    if (content.version) {
      const ver = document.createElement('div');
      ver.style.cssText = `font-size:12px;color:#666;margin-bottom:20px;`;
      ver.textContent = '版本：' + content.version;
      card.appendChild(ver);
    }

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.style.cssText = `
      padding:8px 32px;border:1px solid rgba(255,255,255,0.15);
      border-radius:8px;background:rgba(255,255,255,0.06);
      color:#ececf0;font-size:14px;cursor:pointer;
      font-family:inherit;transition:background 0.2s;
    `;
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = 'rgba(255,255,255,0.12)'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'rgba(255,255,255,0.06)'; });
    closeBtn.addEventListener('click', () => {
      popup.remove();
      this._aboutPopup = null;
    });
    card.appendChild(closeBtn);

    popup.appendChild(card);
    document.body.appendChild(popup);
    this._aboutPopup = popup;
  }

  showMessage(titleText, messageText) {
    if (this._aboutPopup) {
      this._aboutPopup.remove();
      this._aboutPopup = null;
    }

    const popup = document.createElement('div');
    popup.style.cssText = `
      position:fixed;inset:0;z-index:1100;
      display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.6);
      animation:fadeIn 0.2s ease;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background:#1e1e32;color:#ececf0;
      border:1px solid rgba(139,124,240,0.35);
      border-radius:16px;padding:28px 36px;
      max-width:440px;width:90%;
      box-shadow:0 12px 48px rgba(0,0,0,0.4);
      text-align:center;
      font-family:inherit;
    `;

    const title = document.createElement('div');
    title.style.cssText = 'font-size:22px;font-weight:bold;color:#c8c3ff;margin-bottom:14px;';
    title.textContent = titleText || '提示';
    card.appendChild(title);

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:14px;color:#a0a0ba;line-height:1.8;margin-bottom:18px;white-space:pre-line;';
    msg.textContent = messageText || '';
    card.appendChild(msg);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '确定';
    closeBtn.style.cssText = `
      padding:8px 32px;border:1px solid rgba(255,255,255,0.15);
      border-radius:8px;background:rgba(255,255,255,0.06);
      color:#ececf0;font-size:14px;cursor:pointer;
      font-family:inherit;transition:background 0.2s;
    `;
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = 'rgba(255,255,255,0.12)'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'rgba(255,255,255,0.06)'; });
    closeBtn.addEventListener('click', () => {
      popup.remove();
      this._aboutPopup = null;
    });
    card.appendChild(closeBtn);

    popup.addEventListener('click', (e) => {
      if (e.target === popup) closeBtn.click();
    });

    popup.appendChild(card);
    document.body.appendChild(popup);
    this._aboutPopup = popup;
  }

  /**
   * 检查是否有存档，禁用/启用继续游戏按钮
   */
  async checkSaveExists() {
    try {
      const saveExists = await SaveManager.hasSave();
      if (this.btn_continueGame) {
        this.btn_continueGame.disabled = !saveExists;
        this.btn_continueGame.style.opacity = saveExists ? '1' : '0.5';
        this.btn_continueGame.style.cursor = saveExists ? 'pointer' : 'not-allowed';
      }
    } catch (e) {
      console.warn('[MainMenu] Failed to check save:', e);
    }
  }

  show() {
    if (this.container) {
      this.container.style.display = 'flex';
      this.checkSaveExists();
    }
  }

  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
    // 关闭可能打开的关于弹窗
    if (this._aboutPopup) {
      this._aboutPopup.remove();
      this._aboutPopup = null;
    }
  }

  destroy() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this._aboutPopup) {
      this._aboutPopup.remove();
      this._aboutPopup = null;
    }
  }

  reloadConfig() {
    this.loadConfig();
    this.render();
  }
}

export { MainMenu };
