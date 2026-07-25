/**
 * settings-panel - 设置面板
 * 使用统一设计系统
 */
import { SaveManager } from '../../core/SaveManager.js';

export function renderSettingsPanel(data, body, pm) {
  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  // ===== 画面设置 =====
  const displaySection = document.createElement('div');
  displaySection.style.cssText = 'padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.05);';

  const displayTitle = document.createElement('div');
  displayTitle.style.cssText = 'font-size:14px;font-weight:600;color:#ececf0;margin-bottom:10px;letter-spacing:0.01em;';
  displayTitle.textContent = '🎨 画面设置';

  const toggleRow = document.createElement('div');
  toggleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';

  const toggleLabel = document.createElement('span');
  toggleLabel.style.cssText = 'font-size:13px;color:#a0a0ba;';
  toggleLabel.textContent = '3D 透视效果';

  const toggleBtn = document.createElement('button');
  const is3D = window.__game && window.__game.mapRenderer
    ? window.__game.mapRenderer.isPerspectiveEnabled()
    : document.getElementById('game-canvas').classList.contains('perspective-3d');

  const updateToggle = (enabled) => {
    toggleBtn.textContent = enabled ? '已开启' : '已关闭';
    toggleBtn.style.cssText = `
      padding:6px 16px;border-radius:20px;border:1px solid ${enabled ? 'rgba(78,203,113,0.3)' : 'rgba(255,255,255,0.1)'};
      background:${enabled ? 'rgba(78,203,113,0.15)' : 'rgba(255,255,255,0.06)'};
      color:${enabled ? '#4ecb71' : '#888'};font-size:13px;font-weight:500;cursor:pointer;
      font-family:inherit;transition:all 0.3s;min-width:72px;
    `;
  };
  updateToggle(is3D);

  toggleBtn.addEventListener('click', () => {
    const game = window.__game;
    if (game && game.mapRenderer) {
      const current = game.mapRenderer.isPerspectiveEnabled();
      game.mapRenderer.setPerspective(!current);
      updateToggle(!current);
    }
  });

  toggleRow.appendChild(toggleLabel);
  toggleRow.appendChild(toggleBtn);
  displaySection.appendChild(displayTitle);
  displaySection.appendChild(toggleRow);
  container.appendChild(displaySection);

  // ===== 音频设置 =====
  const audioSys = window.__game?.systems?.audio;
  if (audioSys && audioSys._initialized) {
    const audioSection = document.createElement('div');
    audioSection.style.cssText = 'padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.05);';

    const audioTitle = document.createElement('div');
    audioTitle.style.cssText = 'font-size:14px;font-weight:600;color:#ececf0;margin-bottom:10px;letter-spacing:0.01em;';
    audioTitle.textContent = '🔊 音频设置';

    const muteBtn = document.createElement('button');
    const updateMuteBtn = () => {
      const muted = audioSys.isMuted();
      muteBtn.textContent = muted ? '🔇 已静音' : '🔊 已开启';
      muteBtn.style.cssText = [
        'padding:6px 14px;border-radius:20px;border:1px solid',
        muted ? 'rgba(255,107,107,0.3)' : 'rgba(78,203,113,0.3)',
        ';background:', muted ? 'rgba(255,107,107,0.12)' : 'rgba(78,203,113,0.12)',
        ';color:', muted ? '#ff6b6b' : '#4ecb71',
        ';font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;transition:all 0.2s;margin-bottom:10px;'
      ].join('');
    };
    updateMuteBtn();
    muteBtn.addEventListener('click', () => {
      audioSys.toggleMute();
      updateMuteBtn();
      // 更新滑块以反映静音状态
      masterSlider.value = Math.round(audioSys.getMasterVolume() * 100);
      bgmSlider.value = Math.round(audioSys.getBGMVolume() * 100);
      sfxSlider.value = Math.round(audioSys.getSFXVolume() * 100);
    });

    // 音量滑块
    const sliders = [
      { label: '主音量', get: () => audioSys.getMasterVolume(), set: (v) => audioSys.setMasterVolume(v) },
      { label: '背景音乐', get: () => audioSys.getBGMVolume(), set: (v) => audioSys.setBGMVolume(v) },
      { label: '音效', get: () => audioSys.getSFXVolume(), set: (v) => audioSys.setSFXVolume(v) }
    ];

    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    let masterSlider, bgmSlider, sfxSlider;

    sliders.forEach((s, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;';

      const label = document.createElement('span');
      label.style.cssText = 'font-size:12px;color:#a0a0ba;width:62px;flex-shrink:0;';
      label.textContent = s.label;

      const input = document.createElement('input');
      input.type = 'range';
      input.min = 0;
      input.max = 100;
      input.value = Math.round(s.get() * 100);
      input.style.cssText = 'flex:1;accent-color:#4ecb71;';

      const valDisplay = document.createElement('span');
      valDisplay.style.cssText = 'font-size:12px;color:#ececf0;width:36px;text-align:right;flex-shrink:0;';
      valDisplay.textContent = input.value + '%';

      input.addEventListener('input', () => {
        s.set(parseInt(input.value) / 100);
        valDisplay.textContent = input.value + '%';
        updateMuteBtn();
      });

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(valDisplay);
      sliderContainer.appendChild(row);

      if (i === 0) masterSlider = input;
      if (i === 1) bgmSlider = input;
      if (i === 2) sfxSlider = input;
    });

    audioSection.appendChild(audioTitle);
    audioSection.appendChild(muteBtn);
    audioSection.appendChild(sliderContainer);
    container.appendChild(audioSection);
  }

  // ===== 存档信息 =====
  const saveSection = document.createElement('div');
  saveSection.style.cssText = 'padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.05);';
  saveSection.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#ececf0;margin-bottom:8px;letter-spacing:0.01em;">💾 存档状态</div>
    <div style="font-size:13px;color:#4ecb71;font-weight:500;">正常运行中</div>
    <div style="font-size:12px;color:#888;margin-top:4px;">每个时段结束后自动保存</div>
  `;
  container.appendChild(saveSection);

  // ===== 操作说明 =====
  const helpSection = document.createElement('div');
  helpSection.style.cssText = 'padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.05);';
  helpSection.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#ececf0;margin-bottom:8px;letter-spacing:0.01em;">📖 快捷操作</div>
    <div style="font-size:12px;color:#a0a0ba;line-height:1.8;">
      <div>🏗️ <b style="color:#ececf0;">建造</b> — 选择建筑后点击地图放置</div>
      <div>🖱️ <b style="color:#ececf0;">移动建筑</b> — 按住左键拖动已建成的建筑到新位置</div>
      <div>⏩ <b style="color:#ececf0;">加速</b> — 切换 1× / 2× / 4× 速度</div>
      <div>⏸ <b style="color:#ececf0;">暂停</b> — 暂停/恢复时间流逝</div>
      <div>🔍 <b style="color:#ececf0;">探险</b> — 点击地图上的探险入口</div>
    </div>
  `;
  container.appendChild(helpSection);

  // ===== 重置存档 =====
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '🗑️ 重置全部存档';
  resetBtn.style.cssText = `
    width:100%; padding:12px 16px; border:1px solid rgba(255,107,107,0.2);
    border-radius:10px; background:rgba(255,107,107,0.1);
    color:#ff6b6b; font-size:14px; font-weight:500; cursor:pointer;
    font-family:inherit; transition:background 0.2s;
  `;
  resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'rgba(255,107,107,0.2)'; });
  resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'rgba(255,107,107,0.1)'; });
  resetBtn.addEventListener('click', async () => {
    if (confirm('确定要重置所有进度吗？此操作不可撤销。')) {
      const game = window.__game;
      if (game) game._resetting = true;
      await SaveManager.reset();
      location.reload();
    }
  });
  container.appendChild(resetBtn);

  // ===== 作弊面板（仅 Konami 码激活后可见）=====
  if (window.__cheatManager?.isEnabled()) {
    const cheatSection = document.createElement('div');
    cheatSection.id = 'cheat-panel';
    cheatSection.style.cssText = 'padding:14px;background:rgba(78,203,113,0.05);border-radius:12px;border:1px solid rgba(78,203,113,0.2);';

    const cheatTitle = document.createElement('div');
    cheatTitle.style.cssText = 'font-size:14px;font-weight:600;color:#4ecb71;margin-bottom:12px;letter-spacing:0.01em;';
    cheatTitle.textContent = '🎮 作弊面板';
    cheatSection.appendChild(cheatTitle);

    // ---- 倍速按钮组 ----
    const game = window.__game;
    const timeSys = game?.systems?.time;
    const currentSpeed = timeSys?.speed || 1;

    const speedLabel = document.createElement('div');
    speedLabel.style.cssText = 'font-size:12px;color:#a0a0ba;margin-bottom:8px;';
    speedLabel.textContent = '⚡ 游戏倍速';
    cheatSection.appendChild(speedLabel);

    const speedRow = document.createElement('div');
    speedRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;';
    [1, 2, 4, 8, 16].forEach(n => {
      const btn = document.createElement('button');
      const isActive = n === currentSpeed;
      btn.textContent = `${n}×`;
      btn.style.cssText = [
        'padding:6px 14px;border-radius:20px;border:1px solid',
        isActive ? 'rgba(78,203,113,0.5)' : 'rgba(255,255,255,0.1)',
        ';background:', isActive ? 'rgba(78,203,113,0.2)' : 'rgba(255,255,255,0.06)',
        ';color:', isActive ? '#4ecb71' : '#888',
        ';font-size:13px;font-weight:', isActive ? '600' : '400',
        ';cursor:pointer;font-family:inherit;transition:all 0.2s;min-width:44px;'
      ].join('');
      btn.addEventListener('click', () => {
        timeSys?.setSpeed(n);
        // 刷新作弊面板按钮状态
        cheatSection.querySelectorAll('button').forEach(b => {
          const txt = b.textContent;
          if (txt === '1×' || txt === '2×' || txt === '4×' || txt === '8×' || txt === '16×') {
            const spd = parseInt(txt);
            const act = spd === n;
            b.style.borderColor = act ? 'rgba(78,203,113,0.5)' : 'rgba(255,255,255,0.1)';
            b.style.background = act ? 'rgba(78,203,113,0.2)' : 'rgba(255,255,255,0.06)';
            b.style.color = act ? '#4ecb71' : '#888';
            b.style.fontWeight = act ? '600' : '400';
          }
        });
      });
      speedRow.appendChild(btn);
    });
    cheatSection.appendChild(speedRow);

    // ---- 资源 +100 按钮组 ----
    const resLabel = document.createElement('div');
    resLabel.style.cssText = 'font-size:12px;color:#a0a0ba;margin-bottom:8px;';
    resLabel.textContent = '📦 资源补给（点击 +100）';
    cheatSection.appendChild(resLabel);

    const resSys = game?.systems?.resource;
    if (resSys) {
      const hudResources = resSys.getHUDResources();
      const resList = document.createElement('div');
      resList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

      hudResources.forEach(res => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

        const info = document.createElement('span');
        info.style.cssText = 'font-size:13px;color:#ececf0;flex:1;min-width:0;';
        const icon = res.icon
          ? `<img src="${res.icon}" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin-right:4px;" onerror="this.remove()" />`
          : '';
        const emojiMap = { wood: '🪵', plank: '📐', stone: '🪨', iron_ore: '⛏️', coal: '⚫', iron_ingot: '🔩', food: '🍞' };
        info.innerHTML = `${icon}${emojiMap[res.id] || ''} ${res.name} <span style="color:#888;font-size:11px;">${res.current}/${res.max}</span>`;

        const addBtn = document.createElement('button');
        const isFull = res.current >= res.max;
        addBtn.textContent = isFull ? '已满' : '+100';
        addBtn.style.cssText = [
          'padding:3px 12px;border-radius:14px;border:1px solid',
          isFull ? 'rgba(255,255,255,0.06)' : 'rgba(78,203,113,0.3)',
          ';background:', isFull ? 'rgba(255,255,255,0.03)' : 'rgba(78,203,113,0.12)',
          ';color:', isFull ? '#666' : '#4ecb71',
          ';font-size:12px;font-weight:500;cursor:', isFull ? 'default' : 'pointer',
          ';font-family:inherit;transition:all 0.2s;flex-shrink:0;'
        ].join('');

        if (!isFull) {
          addBtn.addEventListener('click', () => {
            const added = resSys.addClamped(res.id, 100);
            if (added > 0) {
              // 更新按钮反馈
              addBtn.textContent = `+${added}`;
              addBtn.style.background = 'rgba(78,203,113,0.3)';
              // 更新当前值显示
              const countSpan = info.querySelector('span');
              const latest = resSys.getAmount(res.id);
              if (countSpan) {
                countSpan.textContent = `${latest}/${res.max}`;
              }
              // 延迟恢复按钮状态
              setTimeout(() => {
                const latestNow = resSys.getAmount(res.id);
                if (latestNow >= res.max) {
                  addBtn.textContent = '已满';
                  addBtn.style.color = '#666';
                  addBtn.style.background = 'rgba(255,255,255,0.03)';
                  addBtn.style.borderColor = 'rgba(255,255,255,0.06)';
                  addBtn.style.cursor = 'default';
                } else {
                  addBtn.textContent = '+100';
                  addBtn.style.background = 'rgba(78,203,113,0.12)';
                }
              }, 500);
            } else {
              // 资源已满（可能被其他操作填满）
              addBtn.textContent = '已满';
              addBtn.style.color = '#666';
              addBtn.style.background = 'rgba(255,255,255,0.03)';
              addBtn.style.borderColor = 'rgba(255,255,255,0.06)';
              addBtn.style.cursor = 'default';
            }
          });
        }

        row.appendChild(info);
        row.appendChild(addBtn);
        resList.appendChild(row);
      });
      cheatSection.appendChild(resList);
    }

    // ---- 关闭作弊 ----
    const disableBtn = document.createElement('button');
    disableBtn.textContent = '🔒 关闭作弊模式';
    disableBtn.style.cssText = [
      'width:100%;margin-top:14px;padding:8px 16px;border:1px solid rgba(255,107,107,0.2)',
      ';border-radius:10px;background:rgba(255,107,107,0.08)',
      ';color:#ff6b6b;font-size:12px;font-weight:500;cursor:pointer',
      ';font-family:inherit;transition:background 0.2s;'
    ].join('');
    disableBtn.addEventListener('mouseenter', () => { disableBtn.style.background = 'rgba(255,107,107,0.16)'; });
    disableBtn.addEventListener('mouseleave', () => { disableBtn.style.background = 'rgba(255,107,107,0.08)'; });
    disableBtn.addEventListener('click', () => {
      window.__cheatManager?.disable();
      // 重渲染设置面板（移除作弊区块）
      body.innerHTML = '';
      renderSettingsPanel(data, body, pm);
    });
    cheatSection.appendChild(disableBtn);

    container.appendChild(cheatSection);
  }

  // ===== 关闭 =====
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  closeBtn.style.cssText = 'width:100%;padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.06);color:#ececf0;cursor:pointer;font-size:14px;font-weight:500;font-family:inherit;transition:background 0.2s;';
  closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = 'rgba(255,255,255,0.12)'; });
  closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'rgba(255,255,255,0.06)'; });
  closeBtn.addEventListener('click', () => pm.close());
  container.appendChild(closeBtn);

  body.appendChild(container);
}
