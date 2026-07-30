/**
 * AnimatedSpriteHelper - PixiJS v8 序列帧动画辅助工具
 * 从水平排布的精灵图（sprite sheet）创建 AnimatedSprite
 *
 * 支持两种循环模式：
 * - loop（默认）：正向循环  0→1→2→...→N-1→0→...
 * - pingpong：乒乓循环    0→1→...→N-1→N-2→...→1→0→...
 *   乒乓模式通过构建 [0,1,...,N-1,N-2,...,1] 双倍纹理数组实现，
 *   利用 AnimatedSprite 原生正向循环产生无缝往复效果。
 *   首尾帧天然衔接，不会出现正向循环中 N-1→0 的视觉跳跃。
 */
export class AnimatedSpriteHelper {
  /**
   * 从水平精灵图创建 AnimatedSprite
   * @param {string} sheetPath - 精灵图文件路径
   * @param {number} frameCount - 帧数
   * @param {number} fps - 播放帧率
   * @param {boolean} pingpong - 是否使用乒乓循环（默认 false）
   * @returns {PIXI.AnimatedSprite|null}
   */
  static createFromHorizontalSheet(sheetPath, frameCount, fps = 8, pingpong = false) {
    const sheetTexture = PIXI.Texture.from(sheetPath);

    // 纹理可能异步加载，检查是否有效
    if (!sheetTexture.source || sheetTexture.width <= 0) {
      // 纹理还未加载完成，返回 null，后续 refresh 会重试
      return null;
    }

    const frameWidth = sheetTexture.width / frameCount;
    const frameHeight = sheetTexture.height;

    if (frameWidth <= 0 || frameHeight <= 0) return null;

    // 逐帧切分子纹理（共享同一 TextureSource，零拷贝）
    const sourceFrames = [];
    for (let i = 0; i < frameCount; i++) {
      const frameRect = new PIXI.Rectangle(
        i * frameWidth, 0,
        frameWidth, frameHeight
      );
      const texture = new PIXI.Texture({
        source: sheetTexture.source,
        frame: frameRect
      });
      sourceFrames.push(texture);
    }

    // 构建播放纹理序列
    let textures;
    if (pingpong && frameCount >= 2) {
      // 乒乓模式：[0,1,2,...,N-1, N-2,...,2,1] —— 不含重复的首尾
      // 8 帧 → 14 帧序列，N-1→N-2 和 1→0 都是单步相邻过渡
      textures = [
        ...sourceFrames,                          // 正向：0,1,2,3,4,5,6,7
        ...sourceFrames.slice(1, -1).reverse()    // 反向：6,5,4,3,2,1
      ];
    } else {
      textures = sourceFrames;
    }

    const anim = new PIXI.AnimatedSprite(textures);
    // animationSpeed：每游戏帧（60fps）播放的动画帧数
    // fps=8 → 0.133，即每 7.5 个渲染帧推进 1 帧
    anim.animationSpeed = fps / 60;
    anim.loop = true;
    anim.play();
    return anim;
  }

  /**
   * 从配置对象创建 AnimatedSprite
   * @param {object} animConfig - 动画配置对象
   * @param {string} animConfig.spriteSheet - 精灵图路径
   * @param {number} [animConfig.frameCount=8] - 帧数
   * @param {number} [animConfig.fps=8] - 播放帧率
   * @param {boolean} [animConfig.pingpong=false] - 乒乓循环
   * @param {number} [animConfig.frameWidth] - 单帧宽度（仅用于外部缩放计算，切分时不依赖此值）
   * @param {number} [animConfig.frameHeight] - 单帧高度（同上）
   * @returns {PIXI.AnimatedSprite|null}
   */
  static createFromConfig(animConfig) {
    if (!animConfig || !animConfig.spriteSheet) return null;
    return AnimatedSpriteHelper.createFromHorizontalSheet(
      animConfig.spriteSheet,
      animConfig.frameCount || 8,
      animConfig.fps || 8,
      animConfig.pingpong || false
    );
  }
}
