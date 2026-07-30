/**
 * NpcNameGenerator - NPC名字生成器
 * 从 HumanFirstNames.txt 和 HumanSurnames.txt 中随机组合名字
 * 支持一家人姓氏相同的机制
 */
export class NpcNameGenerator {
  constructor() {
    this.firstNames = []; // 名字列表
    this.surnames = [];   // 姓氏列表
    this.families = [];   // 已存在的家庭（用于保持一家人姓氏相同）
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;

    try {
      // 读取名字文件
      const [firstNamesResp, surnamesResp] = await Promise.all([
        fetch('npc/HumanFirstNames.txt', { cache: 'no-cache' }),
        fetch('npc/HumanSurnames.txt', { cache: 'no-cache' })
      ]);

      this.firstNames = (await firstNamesResp.text())
        .split('\n')
        .map(line => line.trim())
        .filter(name => name.length > 0);

      this.surnames = (await surnamesResp.text())
        .split('\n')
        .map(line => line.trim())
        .filter(name => name.length > 0);

      this._initialized = true;
    } catch (e) {
      console.error('[NpcNameGenerator] Failed to load name files:', e);
      // 备用名字列表
      this.firstNames = ['张三', '李四', '王五', '赵六', '孙七', '周八', '吴九', '郑十'];
      this.surnames = ['张', '李', '王', '赵', '孙', '周', '吴', '郑'];
      this._initialized = true;
    }
  }

  /**
   * 获取随机名字
   * @param {boolean} allowFamily - 是否允许使用已有家庭的姓氏（一家人姓氏相同）
   * @returns {string} 完整姓名（如：阿尔杜斯·史密斯）
   */
  getRandomName(allowFamily = true) {
    if (!this._initialized) {
      return '无名氏';
    }

    let surname;
    
    // 有20%概率从已有家庭中选择（保持一家人姓氏相同）
    if (allowFamily && this.families.length > 0 && Math.random() < 0.2) {
      const family = this.families[Math.floor(Math.random() * this.families.length)];
      surname = family.surname;
    } else {
      // 随机选择新姓氏
      surname = this.surnames[Math.floor(Math.random() * this.surnames.length)];
      
      // 记录新家庭（有50%概率）
      if (Math.random() < 0.5) {
        this.families.push({
          surname,
          memberCount: 1
        });
      }
    }

    const firstName = this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
    // 英文格式：名·姓
    return `${firstName}·${surname}`;
  }

  /**
   * 获取随机名字（名·姓格式）
   * @param {boolean} allowFamily - 是否允许使用已有家庭的姓氏
   * @returns {string} 完整姓名（如：阿尔杜斯·史密斯）
   */
  getRandomNameSurname(allowFamily = true) {
    // 已经是名·姓格式，直接调用 getRandomName
    return this.getRandomName(allowFamily);
  }

  /**
   * 将全名转换为名·姓格式（兼容旧格式）
   * @param {string} fullName - 全名（如：阿尔杜斯·史密斯 或 史密斯阿尔杜斯）
   * @returns {string} 名·姓格式（如：阿尔杜斯·史密斯）
   */
  toNameSurname(fullName) {
    if (!fullName || fullName.length < 2) {
      return '无名氏';
    }
    // 如果已经包含·符号，直接返回
    if (fullName.includes('·')) {
      return fullName;
    }
    // 旧格式：姓氏名字（如：史密斯阿尔杜斯）
    // 需要从姓氏列表中匹配正确的姓氏
    let matchedSurname = '';
    for (const s of this.surnames) {
      if (fullName.startsWith(s)) {
        if (s.length > matchedSurname.length) {
          matchedSurname = s;
        }
      }
    }
    if (matchedSurname) {
      const firstName = fullName.slice(matchedSurname.length);
      return `${firstName}·${matchedSurname}`;
    }
    // 无法匹配，返回原始名字
    return fullName;
  }

  /**
   * 获取多个名字
   * @param {number} count - 数量
   * @returns {string[]} 名字列表
   */
  getRandomNames(count) {
    const names = [];
    for (let i = 0; i < count; i++) {
      names.push(this.getRandomName());
    }
    return names;
  }

  /**
   * 获取随机工人名字（可带上建筑名）
   * @param {string} buildingName - 建筑名称（可选）
   * @returns {string} 名字（如：伐木场工人 张三）
   */
  getWorkerName(buildingName = '') {
    const name = this.getRandomName();
    if (buildingName) {
      return `${buildingName}工人 ${name}`;
    }
    return `工人 ${name}`;
  }

  /**
   * 获取随机居民名字
   * @returns {string} 名字（如：居民 李四）
   */
  getResidentName() {
    return `居民 ${this.getRandomName()}`;
  }

  /**
   * 重置家庭数据（新游戏时调用）
   */
  reset() {
    this.families = [];
  }

  /**
   * 获取家庭数量
   */
  getFamilyCount() {
    return this.families.length;
  }
}

// 全局单例
export const npcNameGenerator = new NpcNameGenerator();