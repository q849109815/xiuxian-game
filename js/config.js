/* =========================================================
 * config.js —— 《向僵尸开炮》数据层
 * 严格依据 向僵尸开炮游戏开发资料大全.xlsx
 * 已对齐：角色表 / 武器表(10) / 关卡表(10) / 物品表(15) /
 *        芯片表(8) / 任务表(12) / 商城表(10) / 活动表(6) /
 *        怪物表(12) / BOSS / 局内技能(12) / 天赋(8) /
 *        伤害公式(10) / 成长曲线 / 引导节点(12) / 广告位(7)
 * ========================================================= */

const CFG = {
  core: null, meta: null,
  async load() {
    if (this.core) return;
    const g = async (p) => {
      try { const r = await fetch('data/config/' + p + '?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? await r.json() : null; }
      catch (e) { return null; }
    };
    const [core, meta] = await Promise.all([g('core.json'), g('meta.json')]);
    this.core = core || {}; this.meta = meta || {};
  },
};

const EX = {

  /* =====================================================
   * 【角色表】资料：4 个角色，各有皮肤
   * hp 生命 / spd 移速 / armor 护甲 / crit 暴击率
   * 移速 6.0 → 按 ×22 映射为像素速度 132
   * =================================================== */
  chars: [
    { id: 'C01', n: '幸存者-杰克', icon: '🧑‍🚀', img: 'assets/char/c01_jack.jpg', hp: 1000, spd: 6.0, armor: 0, crit: 0.05,
      unlockLv: 0, unlockTxt: '初始解锁', desc: '均衡型先锋官，无短板' },
    { id: 'C02', n: '医疗兵-艾拉', icon: '👩‍⚕️', img: 'assets/char/c02_aila.jpg', hp: 900, spd: 6.5, armor: 5, crit: 0.05,
      unlockLv: '1-3', unlockTxt: '通关 1-3 解锁', desc: '高移速轻护甲，灵活游走' },
    { id: 'C03', n: '重装兵-雷', icon: '🧑‍🏭', img: 'assets/char/c03_lei.jpg', hp: 1200, spd: 5.0, armor: 15, crit: 0.03,
      unlockLv: '2-3', unlockTxt: '通关 2-3 解锁', desc: '厚血高护甲，正面硬扛' },
    { id: 'C04', n: '狙击手-妮可', icon: '🕵️‍♀️', img: 'assets/char/c04_nike.jpg', hp: 850, spd: 6.0, armor: 3, crit: 0.08,
      unlockLv: '3-3', unlockTxt: '通关 3-3 解锁', desc: '高暴击脆皮，爆发输出' },
  ],
  /* 【皮肤表】每个角色 2 款，第二款用钻石解锁 */
  skins: [
    { id: 'sk_c01a', char: 'C01', n: '默认', icon: '🧑‍🚀', img: 'assets/skin/sk_c01a.jpg', price: 0, bonus: null, desc: '初始外观' },
    { id: 'sk_c01b', char: 'C01', n: '废土战甲', icon: '🥼', img: 'assets/skin/sk_c01b.jpg', price: 680, bonus: { hp: 0.10 }, desc: '生命 +10%' },
    { id: 'sk_c02a', char: 'C02', n: '默认', icon: '👩‍⚕️', img: 'assets/skin/sk_c02a.jpg', price: 0, bonus: null, desc: '初始外观' },
    { id: 'sk_c02b', char: 'C02', n: '战术套装', icon: '🥻', img: 'assets/skin/sk_c02b.jpg', price: 680, bonus: { spd: 0.10 }, desc: '移速 +10%' },
    { id: 'sk_c03a', char: 'C03', n: '默认', icon: '🧑‍🏭', img: 'assets/skin/sk_c03a.jpg', price: 0, bonus: null, desc: '初始外观' },
    { id: 'sk_c03b', char: 'C03', n: '装甲骑士', icon: '🦺', img: 'assets/skin/sk_c03b.jpg', price: 680, bonus: { armor: 0.20 }, desc: '护甲 +20%' },
    { id: 'sk_c04a', char: 'C04', n: '默认', icon: '🕵️‍♀️', price: 0, bonus: null, desc: '初始外观' },
    { id: 'sk_c04b', char: 'C04', n: '暗夜', icon: '🥷', price: 680, bonus: { crit: 0.10 }, desc: '暴击 +10%' },
    { id: 'sk_c01c', char: 'C01', n: '沙漠突击', icon: '🏜️', img: 'assets/skin/sk_desert.jpg', price: 880,
      bonus: { atk: 0.08 }, desc: '沙地作战服，攻击 +8%' },
    { id: 'sk_c02c', char: 'C02', n: '防化服', icon: '☣️', img: 'assets/skin/sk_chem.jpg', price: 880,
      bonus: { armor: 0.12 }, desc: '生化防护服，护甲 +12%' },
    { id: 'sk_c03c', char: 'C03', n: '重装装甲', icon: '🦾', img: 'assets/skin/sk_armor.jpg', price: 980,
      bonus: { hp: 0.14 }, desc: '动力装甲，生命 +14%' },
  ],

  /* =====================================================
   * 【武器表】资料：10 把（主武器 6 + 副武器 4）
   * dmg 基础伤害 / rate 射速(发每秒) / mag 弹夹 / reload 换弹秒
   * pellets 弹丸数（散弹枪 5）/ pierce 穿透
   * =================================================== */
  guns: [
    { id: 'W01', n: '突击步枪', img: 'assets/icon/w_rifle.jpg', kind: '主', type: '自动', dmg: 25, rate: 8, mag: 30, reload: 1.8,
      bullet: '普通弹', pierce: 0, pellets: 1, range: 40, spread: 2, recoil: '中', bspd: 800, icon: '🔫', q: '白', unlockLv: 0, slots: 2, crit: 0.05, critDmg: 1.5, dmgMin: 22, dmgMax: 28},
    { id: 'W02', n: '散弹枪', img: 'assets/icon/w_shotgun.jpg', kind: '主', type: '散弹', dmg: 70, rate: 1.6, mag: 6, reload: 2.4,
      bullet: '散弹', pierce: 0, pellets: 5, range: 15, spread: 8, recoil: '高', bspd: 600, icon: '💥', q: '绿', unlockLv: '1-2', slots: 2, crit: 0.05, critDmg: 1.5, dmgMin: 60, dmgMax: 80},
    { id: 'W03', n: '榴弹枪', img: 'assets/icon/w_grenade.jpg', kind: '主', type: '爆炸', dmg: 120, rate: 0.8, mag: 3, reload: 3.0,
      bullet: '爆炸弹', pierce: 0, pellets: 1, explode: 0.6, er: 62, range: 25, spread: 0, recoil: '高', bspd: 400, icon: '🎇', q: '绿', unlockLv: '1-4', slots: 2, crit: 0.08, critDmg: 1.5, dmgMin: 100, dmgMax: 140},
    { id: 'W04', n: '狙击枪', img: 'assets/icon/w_sniper.jpg', kind: '主', type: '狙击', dmg: 260, rate: 0.7, mag: 5, reload: 2.8,
      bullet: '穿甲弹', pierce: 2, pellets: 1, range: 80, spread: 0, recoil: '高', bspd: 1400, icon: '🎯', q: '蓝', unlockLv: '2-2', slots: 3, crit: 0.15, critDmg: 2.0, dmgMin: 230, dmgMax: 290},
    { id: 'W05', n: '冲锋枪', img: 'assets/icon/w_smg.jpg', kind: '主', type: '自动', dmg: 12, rate: 14, mag: 45, reload: 1.5,
      bullet: '普通弹', pierce: 0, pellets: 1, range: 25, spread: 3, recoil: '低', bspd: 750, icon: '🔦', q: '绿', unlockLv: '2-1', slots: 2, crit: 0.05, critDmg: 1.5, dmgMin: 10, dmgMax: 14},
    { id: 'W06', n: '加特林', img: 'assets/icon/w_gatling.jpg', kind: '主', type: '重机枪', dmg: 20, rate: 16, mag: 120, reload: 4.0,
      bullet: '普通弹', pierce: 0, pellets: 1, range: 35, spread: 2, recoil: '高', bspd: 850, icon: '⚙️', q: '紫', unlockLv: '3-1', slots: 3, crit: 0.05, critDmg: 1.5, dmgMin: 17, dmgMax: 23},
    { id: 'S01', n: '手雷', img: 'assets/icon/w_handgrenade.jpg', kind: '副', type: '投掷', dmg: 150, rate: 0.6, mag: 2, reload: 2.0,
      bullet: '爆炸弹', pierce: 0, pellets: 1, explode: 0.8, er: 78, icon: '🧨', q: '蓝', unlockLv: '1-3', slots: 2, crit: 0.08, critDmg: 1.5, dmgMin: 120, dmgMax: 180},
    { id: 'S02', n: '燃烧瓶', img: 'assets/icon/w_molotov.jpg', kind: '副', type: '投掷', dmg: 80, rate: 0.6, mag: 2, reload: 2.0,
      bullet: '燃烧弹', pierce: 0, pellets: 1, burn: 0.7, icon: '🔥', q: '蓝', unlockLv: '2-2', slots: 2, crit: 0.05, critDmg: 1.5, dmgMin: 60, dmgMax: 100},
    { id: 'S03', n: '地雷', img: 'assets/icon/w_mine.jpg', kind: '副', type: '布置', dmg: 200, rate: 0.3, mag: 3, reload: 3.0,
      bullet: '爆炸弹', pierce: 0, pellets: 1, explode: 1.0, er: 70, icon: '💣', q: '紫', unlockLv: '3-2', slots: 2, crit: 0.05, critDmg: 1.5, dmgMin: 160, dmgMax: 240},
    { id: 'S04', n: '电击棒', img: 'assets/icon/w_taser.jpg', kind: '副', type: '近战', dmg: 90, rate: 1.2, mag: 1, reload: 0.5,
      bullet: '近战', pierce: 0, pellets: 1, icon: '⚡', q: '绿', unlockLv: '2-3', slots: 2, crit: 0.08, critDmg: 2.0, dmgMin: 70, dmgMax: 110},
  ],
  /* 武器进阶：每 5 级进阶一次，品质 白→绿→蓝→紫→橙 */
  gunAdvance: [
    { q: '白', lv: 1, slot: 0 }, { q: '绿', lv: 5, slot: 1 }, { q: '蓝', lv: 10, slot: 2 },
    { q: '紫', lv: 15, slot: 3 }, { q: '橙', lv: 20, slot: 4 },
  ],
  /* 词条池（进阶解锁词条槽） */
  /* 【30_武器词条池】AF01~AF12 共 12 条，品质 蓝/紫/红 */
  gunStats: [
    { id: 'AF01', k: 'dmg', n: '伤害强化', q: '蓝', unit: '%', base: 0.05, stack: 1, desc: '伤害+5%' },
    { id: 'AF02', k: 'rate', n: '攻速强化', q: '蓝', unit: '%', base: 0.05, stack: 1, desc: '攻速+5%' },
    { id: 'AF03', k: 'crit', n: '暴击率', q: '蓝', unit: '%', base: 0.03, stack: 1, desc: '暴击率+3%' },
    { id: 'AF04', k: 'critDmg', n: '暴击伤害', q: '紫', unit: '%', base: 0.10, stack: 1, desc: '暴伤+10%' },
    { id: 'AF05', k: 'pierce', n: '穿透', q: '紫', unit: '', base: 1, stack: 0, desc: '穿透+1' },
    { id: 'AF06', k: 'lifesteal', n: '吸血', q: '紫', unit: '%', base: 0.03, stack: 1, desc: '吸血+3%' },
    { id: 'AF07', k: 'mag', n: '弹夹容量', q: '紫', unit: '', base: 2, stack: 1, desc: '弹夹+2' },
    { id: 'AF08', k: 'reload', n: '换弹速度', q: '紫', unit: 's', base: -0.2, stack: 1, desc: '换弹-0.2秒' },
    { id: 'AF09', k: 'blastR', n: '爆炸范围', q: '红', unit: '%', base: 0.10, stack: 1, desc: '爆炸范围+10%' },
    { id: 'AF10', k: 'pierce2', n: '穿透强化', q: '红', unit: '', base: 2, stack: 0, desc: '穿透+2' },
    { id: 'AF11', k: 'double', n: '双倍伤害', q: '红', unit: '%', base: 0.05, stack: 0, desc: '5%概率双倍伤害' },
    { id: 'AF12', k: 'extraB', n: '额外子弹', q: '红', unit: '', base: 1, stack: 0, desc: '额外发射1颗子弹' },
  ],
  /* 洗练消耗（钻石） */
  REROLL_GUN_COST: 20,

  /* =====================================================
   * 【28_地图布局配置】障碍物 / 掩体 / 可破坏油桶
   * =================================================== */
  mapLayouts: {
    '1-1': { n: '废弃街道', terrain: '开阔街道', covers: [['废弃车辆', 4], ['沙袋', 2]], barrels: 3 },
    '1-2': { n: '停车场', terrain: '半开放场地', covers: [['立柱', 6], ['废弃巴士', 2]], barrels: 4 },
    '1-3': { n: '废墟大楼', terrain: '室内走廊+大厅', covers: [['承重柱', 4], ['桌椅', 3]], barrels: 3 },
    '1-4': { n: '天台(BOSS)', terrain: '开阔平台', covers: [['集装箱', 5], ['矮墙', 2]], barrels: 6 },
    '2-1': { n: '地下实验室', terrain: '室内长通道', covers: [['实验台', 3], ['隔离门', 2]], barrels: 3 },
    '2-2': { n: '废弃医院', terrain: '多层室内', covers: [['病床', 4], ['隔离墙', 3]], barrels: 3 },
    '2-3': { n: '母体巢穴(BOSS)', terrain: '密闭大厅', covers: [['黏液柱', 4], ['残骸', 2]], barrels: 4 },
    '3-1': { n: '城市中心', terrain: '开阔广场', covers: [['雕像', 2], ['路灯', 4], ['车阵', 3]], barrels: 8 },
    '3-2': { n: '桥梁防线', terrain: '长直线桥梁', covers: [['桥墩', 3], ['护栏', 4]], barrels: 4 },
    '3-3': { n: '最终战场(BOSS)', terrain: '超开阔战场', covers: [['巨型掩体', 6]], barrels: 10 },
  },
  /* 障碍物通用参数 */
  COVER_HP: 120,        /* 掩体血量，被打坏后消失 */
  BARREL_HP: 30,        /* 油桶血量 */
  BARREL_DMG: 260,      /* 油桶爆炸伤害 */
  BARREL_R: 96,         /* 油桶爆炸半径 */

  /* =====================================================
   * 【45_全局掉落掉率明细表】21 条，按怪物来源精确掉率
   * =================================================== */
  globalDrops: [
    { src: '普通僵尸', item: 'M01', rate: 0.80, min: 1, max: 1, ch: 1.0, q: '白' },
    { src: '普通僵尸', item: 'M04', rate: 0.05, min: 1, max: 1, ch: 1.0, q: '白' },
    { src: '疾跑僵尸', item: 'M01', rate: 0.85, min: 1, max: 2, ch: 1.0, q: '白' },
    { src: '疾跑僵尸', item: 'M02', rate: 0.03, min: 1, max: 1, ch: 1.1, q: '蓝' },
    { src: '自爆僵尸', item: 'M04', rate: 0.60, min: 1, max: 1, ch: 1.0, q: '白' },
    { src: '吐液僵尸', item: 'M01', rate: 0.80, min: 2, max: 3, ch: 1.1, q: '白' },
    { src: '毒僵尸', item: 'M02', rate: 0.50, min: 1, max: 1, ch: 1.2, q: '蓝' },
    { src: '毒僵尸', item: 'M05', rate: 0.10, min: 1, max: 1, ch: 1.2, q: '蓝' },
    { src: '重甲僵尸', item: 'M02', rate: 0.60, min: 1, max: 2, ch: 1.2, q: '蓝' },
    { src: '护盾僵尸', item: 'M02', rate: 0.55, min: 1, max: 2, ch: 1.2, q: '蓝' },
    { src: '炸弹僵尸', item: 'M04', rate: 0.70, min: 1, max: 2, ch: 1.3, q: '白' },
    { src: '分裂僵尸', item: 'M01', rate: 0.75, min: 2, max: 3, ch: 1.3, q: '白' },
    { src: '飞行僵尸', item: 'M01', rate: 0.75, min: 2, max: 3, ch: 1.3, q: '白' },
    { src: 'BOSS巨型丧尸', item: 'M03', rate: 1.00, min: 3, max: 5, ch: 1.5, q: '紫', first: 1 },
    { src: 'BOSS巨型丧尸', item: 'C01', rate: 0.60, min: 1, max: 1, ch: 1.5, q: '白' },
    { src: 'BOSS巨型丧尸', item: 'P01', rate: 0.50, min: 2, max: 4, ch: 1.5, q: '蓝' },
    { src: 'BOSS感染母体', item: 'M03', rate: 1.00, min: 4, max: 6, ch: 1.8, q: '紫', first: 1 },
    { src: 'BOSS感染母体', item: 'C02', rate: 0.40, min: 1, max: 1, ch: 1.8, q: '蓝' },
    { src: 'BOSS感染母体', item: 'P02', rate: 0.30, min: 1, max: 2, ch: 1.8, q: '紫' },
    { src: 'BOSS巨型母体', item: 'M03', rate: 1.00, min: 5, max: 8, ch: 2.0, q: '紫', first: 1 },
    { src: 'BOSS巨型母体', item: 'C03', rate: 0.30, min: 1, max: 1, ch: 2.0, q: '红', first: 1 },
    /* 补齐缺失来源（原表未覆盖精英/小僵尸，打精英不掉东西） */
    { src: '精英僵尸', item: 'M02', rate: 0.90, min: 2, max: 4, ch: 1.2, q: '蓝' },
    { src: '精英僵尸', item: 'M03', rate: 0.25, min: 1, max: 2, ch: 1.3, q: '紫' },
    { src: '精英僵尸', item: 'P01', rate: 0.10, min: 1, max: 1, ch: 1.3, q: '紫' },
    { src: '小僵尸', item: 'M01', rate: 0.35, min: 1, max: 1, ch: 1.0, q: '白' },
  ],

  /* =====================================================
   * 【关卡表】资料：3 章 10 关 + 无尽 + 活动
   * waves 总波次 / pool 怪物 / per 每波数量[min,max] / mul 强度系数
   * cond 通关条件 / rw 通关奖励 / unlock 解锁条件
   * =================================================== */
  levels: [
    { id: '1-1', ch: 1, n: '废弃街道', waves: 20, pool: ['putong', 'jipao'], per: [8, 13], mul: 1.0,
      cond: 'clear', rw: { gold: 300, M02: 5 }, unlock: null, scene: 'city' },
    { id: '1-2', ch: 1, n: '停车场', waves: 20, pool: ['putong', 'jipao'], per: [8, 13], mul: 1.0,
      cond: 'clear', rw: { gold: 300, M02: 5 }, unlock: '1-1', scene: 'city' },
    { id: '1-3', ch: 1, n: '废墟大楼', waves: 20, pool: ['putong', 'jipao'], per: [8, 13], mul: 1.0,
      cond: 'clear', rw: { gold: 300, M02: 5 }, unlock: '1-2', scene: 'city' },
    { id: '1-4', ch: 1, n: '便利店', waves: 20, pool: ['putong', 'jipao'], per: [8, 13], mul: 1.0,
      cond: 'clear', rw: { gold: 300, M02: 5 }, unlock: '1-3', scene: 'city' },
    { id: '1-5', ch: 1, n: '天台哨所', waves: 20, pool: ['putong', 'jipao'], per: [8, 13], mul: 1.0,
      cond: 'clear', rw: { gold: 300, M02: 5 }, unlock: '1-4', scene: 'city' },
    { id: '1-6', ch: 1, n: '地下车库', waves: 20, pool: ['putong', 'jipao'], per: [8, 13], mul: 1.0,
      cond: 'clear', rw: { gold: 300, M02: 5 }, unlock: '1-5', scene: 'wasteland' },
    { id: '1-7', ch: 1, n: '街区巷战', waves: 20, pool: ['putong', 'jipao'], per: [8, 13], mul: 1.0,
      cond: 'clear', rw: { gold: 300, M02: 5 }, unlock: '1-6', scene: 'factory' },
    { id: '1-8', ch: 1, n: '加油站', waves: 20, pool: ['putong', 'jipao'], per: [8, 13], mul: 1.0,
      cond: 'clear', rw: { gold: 300, M02: 5 }, unlock: '1-7', scene: 'tunnel' },
    { id: '1-9', ch: 1, n: '学校操场', waves: 20, pool: ['putong', 'jipao'], per: [8, 13], mul: 1.0,
      cond: 'clear', rw: { gold: 300, M02: 5 }, unlock: '1-8', scene: 'field' },
    { id: '1-10', ch: 1, n: 'BOSS·巨型丧尸', waves: 20, pool: ['putong', 'jipao'], per: [8, 13], mul: 1.0,
      cond: 'boss', boss: 'juxing', rw: { gold: 300, M02: 5 }, unlock: '1-9', scene: 'snow' },
    { id: '2-1', ch: 2, n: '实验室入口', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia'], per: [10, 16], mul: 1.72,
      cond: 'clear', rw: { gold: 840, M03: 8 }, unlock: '1-10', scene: 'tunnel' },
    { id: '2-2', ch: 2, n: '培养舱', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia'], per: [10, 16], mul: 1.72,
      cond: 'clear', rw: { gold: 840, M03: 8 }, unlock: '2-1', scene: 'tunnel' },
    { id: '2-3', ch: 2, n: '通风管道', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia'], per: [10, 16], mul: 1.72,
      cond: 'clear', rw: { gold: 840, M03: 8 }, unlock: '2-2', scene: 'tunnel' },
    { id: '2-4', ch: 2, n: '生化仓库', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia'], per: [10, 16], mul: 1.72,
      cond: 'clear', rw: { gold: 840, M03: 8 }, unlock: '2-3', scene: 'tunnel' },
    { id: '2-5', ch: 2, n: '隔离区', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia'], per: [10, 16], mul: 1.72,
      cond: 'clear', rw: { gold: 840, M03: 8 }, unlock: '2-4', scene: 'tunnel' },
    { id: '2-6', ch: 2, n: '样本室', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia'], per: [10, 16], mul: 1.72,
      cond: 'clear', rw: { gold: 840, M03: 8 }, unlock: '2-5', scene: 'factory' },
    { id: '2-7', ch: 2, n: '地下二层', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia'], per: [10, 16], mul: 1.72,
      cond: 'clear', rw: { gold: 840, M03: 8 }, unlock: '2-6', scene: 'tunnel' },
    { id: '2-8', ch: 2, n: '冷却机组', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia'], per: [10, 16], mul: 1.72,
      cond: 'clear', rw: { gold: 840, M03: 8 }, unlock: '2-7', scene: 'field' },
    { id: '2-9', ch: 2, n: '排污通道', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia'], per: [10, 16], mul: 1.72,
      cond: 'clear', rw: { gold: 840, M03: 8 }, unlock: '2-8', scene: 'snow' },
    { id: '2-10', ch: 2, n: 'BOSS·感染母体', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia'], per: [10, 16], mul: 1.72,
      cond: 'boss', boss: 'mama', rw: { gold: 840, M03: 8 }, unlock: '2-9', scene: 'city' },
    { id: '3-1', ch: 3, n: '城市广场', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia', 'du'], per: [12, 20], mul: 2.96,
      cond: 'clear', rw: { gold: 2352, M04: 10 }, unlock: '2-10', scene: 'city' },
    { id: '3-2', ch: 3, n: '商业街', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia', 'du'], per: [12, 20], mul: 2.96,
      cond: 'clear', rw: { gold: 2352, M04: 10 }, unlock: '3-1', scene: 'city' },
    { id: '3-3', ch: 3, n: '地铁口', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia', 'du'], per: [12, 20], mul: 2.96,
      cond: 'clear', rw: { gold: 2352, M04: 10 }, unlock: '3-2', scene: 'city' },
    { id: '3-4', ch: 3, n: '钟楼', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia', 'du'], per: [12, 20], mul: 2.96,
      cond: 'clear', rw: { gold: 2352, M04: 10 }, unlock: '3-3', scene: 'city' },
    { id: '3-5', ch: 3, n: '桥梁防线', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia', 'du'], per: [12, 20], mul: 2.96,
      cond: 'clear', rw: { gold: 2352, M04: 10 }, unlock: '3-4', scene: 'city' },
    { id: '3-6', ch: 3, n: '市政厅', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia', 'du'], per: [12, 20], mul: 2.96,
      cond: 'clear', rw: { gold: 2352, M04: 10 }, unlock: '3-5', scene: 'tunnel' },
    { id: '3-7', ch: 3, n: '广播塔', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia', 'du'], per: [12, 20], mul: 2.96,
      cond: 'clear', rw: { gold: 2352, M04: 10 }, unlock: '3-6', scene: 'field' },
    { id: '3-8', ch: 3, n: '中央车站', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia', 'du'], per: [12, 20], mul: 2.96,
      cond: 'clear', rw: { gold: 2352, M04: 10 }, unlock: '3-7', scene: 'snow' },
    { id: '3-9', ch: 3, n: '立交桥', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia', 'du'], per: [12, 20], mul: 2.96,
      cond: 'clear', rw: { gold: 2352, M04: 10 }, unlock: '3-8', scene: 'city' },
    { id: '3-10', ch: 3, n: 'BOSS·开垦者&感染母体', waves: 20, pool: ['putong', 'jipao', 'zibao', 'zhongjia', 'du'], per: [12, 20], mul: 2.96,
      cond: 'bossAll', boss: ['kaiken', 'mama'], rw: { gold: 2352, M04: 10 }, unlock: '3-9', scene: 'wasteland' },
    { id: '4-1', ch: 4, n: '厂房大门', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan'], per: [14, 23], mul: 5.09,
      cond: 'clear', rw: { gold: 6586, M05: 12 }, unlock: '3-10', scene: 'factory' },
    { id: '4-2', ch: 4, n: '传送带', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan'], per: [14, 23], mul: 5.09,
      cond: 'clear', rw: { gold: 6586, M05: 12 }, unlock: '4-1', scene: 'factory' },
    { id: '4-3', ch: 4, n: '熔炉车间', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan'], per: [14, 23], mul: 5.09,
      cond: 'clear', rw: { gold: 6586, M05: 12 }, unlock: '4-2', scene: 'factory' },
    { id: '4-4', ch: 4, n: '装配线', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan'], per: [14, 23], mul: 5.09,
      cond: 'clear', rw: { gold: 6586, M05: 12 }, unlock: '4-3', scene: 'factory' },
    { id: '4-5', ch: 4, n: '原料仓', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan'], per: [14, 23], mul: 5.09,
      cond: 'clear', rw: { gold: 6586, M05: 12 }, unlock: '4-4', scene: 'factory' },
    { id: '4-6', ch: 4, n: '高压电房', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan'], per: [14, 23], mul: 5.09,
      cond: 'clear', rw: { gold: 6586, M05: 12 }, unlock: '4-5', scene: 'field' },
    { id: '4-7', ch: 4, n: '烟囱平台', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan'], per: [14, 23], mul: 5.09,
      cond: 'clear', rw: { gold: 6586, M05: 12 }, unlock: '4-6', scene: 'snow' },
    { id: '4-8', ch: 4, n: '废料场', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan'], per: [14, 23], mul: 5.09,
      cond: 'clear', rw: { gold: 6586, M05: 12 }, unlock: '4-7', scene: 'city' },
    { id: '4-9', ch: 4, n: '控制室', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan'], per: [14, 23], mul: 5.09,
      cond: 'clear', rw: { gold: 6586, M05: 12 }, unlock: '4-8', scene: 'wasteland' },
    { id: '4-10', ch: 4, n: 'BOSS·开垦者', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan'], per: [14, 23], mul: 5.09,
      cond: 'boss', boss: 'kaiken', rw: { gold: 6586, M05: 12 }, unlock: '4-9', scene: 'factory' },
    { id: '5-1', ch: 5, n: '田间小路', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun'], per: [16, 26], mul: 8.75,
      cond: 'clear', rw: { gold: 18440, M01: 15 }, unlock: '4-10', scene: 'field' },
    { id: '5-2', ch: 5, n: '麦浪深处', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun'], per: [16, 26], mul: 8.75,
      cond: 'clear', rw: { gold: 18440, M01: 15 }, unlock: '5-1', scene: 'field' },
    { id: '5-3', ch: 5, n: '风车谷仓', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun'], per: [16, 26], mul: 8.75,
      cond: 'clear', rw: { gold: 18440, M01: 15 }, unlock: '5-2', scene: 'field' },
    { id: '5-4', ch: 5, n: '灌溉渠', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun'], per: [16, 26], mul: 8.75,
      cond: 'clear', rw: { gold: 18440, M01: 15 }, unlock: '5-3', scene: 'field' },
    { id: '5-5', ch: 5, n: '农舍', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun'], per: [16, 26], mul: 8.75,
      cond: 'clear', rw: { gold: 18440, M01: 15 }, unlock: '5-4', scene: 'field' },
    { id: '5-6', ch: 5, n: '玉米地', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun'], per: [16, 26], mul: 8.75,
      cond: 'clear', rw: { gold: 18440, M01: 15 }, unlock: '5-5', scene: 'snow' },
    { id: '5-7', ch: 5, n: '晒谷场', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun'], per: [16, 26], mul: 8.75,
      cond: 'clear', rw: { gold: 18440, M01: 15 }, unlock: '5-6', scene: 'city' },
    { id: '5-8', ch: 5, n: '拖拉机场', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun'], per: [16, 26], mul: 8.75,
      cond: 'clear', rw: { gold: 18440, M01: 15 }, unlock: '5-7', scene: 'wasteland' },
    { id: '5-9', ch: 5, n: '围栏缺口', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun'], per: [16, 26], mul: 8.75,
      cond: 'clear', rw: { gold: 18440, M01: 15 }, unlock: '5-8', scene: 'factory' },
    { id: '5-10', ch: 5, n: 'BOSS·巢穴之母', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun'], per: [16, 26], mul: 8.75,
      cond: 'boss', boss: 'chaoxue', rw: { gold: 18440, M01: 15 }, unlock: '5-9', scene: 'tunnel' },
    { id: '6-1', ch: 6, n: '辐射边界', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie'], per: [18, 29], mul: 15.05,
      cond: 'clear', rw: { gold: 51631, M02: 18 }, unlock: '5-10', scene: 'wasteland' },
    { id: '6-2', ch: 6, n: '焦土', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie'], per: [18, 29], mul: 15.05,
      cond: 'clear', rw: { gold: 51631, M02: 18 }, unlock: '6-1', scene: 'wasteland' },
    { id: '6-3', ch: 6, n: '掩体群', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie'], per: [18, 29], mul: 15.05,
      cond: 'clear', rw: { gold: 51631, M02: 18 }, unlock: '6-2', scene: 'wasteland' },
    { id: '6-4', ch: 6, n: '枯树林', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie'], per: [18, 29], mul: 15.05,
      cond: 'clear', rw: { gold: 51631, M02: 18 }, unlock: '6-3', scene: 'wasteland' },
    { id: '6-5', ch: 6, n: '沙暴区', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie'], per: [18, 29], mul: 15.05,
      cond: 'clear', rw: { gold: 51631, M02: 18 }, unlock: '6-4', scene: 'wasteland' },
    { id: '6-6', ch: 6, n: '战壕', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie'], per: [18, 29], mul: 15.05,
      cond: 'clear', rw: { gold: 51631, M02: 18 }, unlock: '6-5', scene: 'city' },
    { id: '6-7', ch: 6, n: '废弃坦克', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie'], per: [18, 29], mul: 15.05,
      cond: 'clear', rw: { gold: 51631, M02: 18 }, unlock: '6-6', scene: 'wasteland' },
    { id: '6-8', ch: 6, n: '观测站', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie'], per: [18, 29], mul: 15.05,
      cond: 'clear', rw: { gold: 51631, M02: 18 }, unlock: '6-7', scene: 'factory' },
    { id: '6-9', ch: 6, n: '辐射核心', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie'], per: [18, 29], mul: 15.05,
      cond: 'clear', rw: { gold: 51631, M02: 18 }, unlock: '6-8', scene: 'tunnel' },
    { id: '6-10', ch: 6, n: 'BOSS·深渊领主', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie'], per: [18, 29], mul: 15.05,
      cond: 'boss', boss: 'shenyuan', rw: { gold: 51631, M02: 18 }, unlock: '6-9', scene: 'field' },
    { id: '7-1', ch: 7, n: '雪原前哨', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing'], per: [20, 32], mul: 25.89,
      cond: 'clear', rw: { gold: 144567, M03: 20 }, unlock: '6-10', scene: 'snow' },
    { id: '7-2', ch: 7, n: '冰封公路', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing'], per: [20, 32], mul: 25.89,
      cond: 'clear', rw: { gold: 144567, M03: 20 }, unlock: '7-1', scene: 'snow' },
    { id: '7-3', ch: 7, n: '补给站', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing'], per: [20, 32], mul: 25.89,
      cond: 'clear', rw: { gold: 144567, M03: 20 }, unlock: '7-2', scene: 'snow' },
    { id: '7-4', ch: 7, n: '雪松林', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing'], per: [20, 32], mul: 25.89,
      cond: 'clear', rw: { gold: 144567, M03: 20 }, unlock: '7-3', scene: 'snow' },
    { id: '7-5', ch: 7, n: '悬崖哨塔', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing'], per: [20, 32], mul: 25.89,
      cond: 'clear', rw: { gold: 144567, M03: 20 }, unlock: '7-4', scene: 'snow' },
    { id: '7-6', ch: 7, n: '冰湖', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing'], per: [20, 32], mul: 25.89,
      cond: 'clear', rw: { gold: 144567, M03: 20 }, unlock: '7-5', scene: 'wasteland' },
    { id: '7-7', ch: 7, n: '物资仓', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing'], per: [20, 32], mul: 25.89,
      cond: 'clear', rw: { gold: 144567, M03: 20 }, unlock: '7-6', scene: 'factory' },
    { id: '7-8', ch: 7, n: '风雪谷', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing'], per: [20, 32], mul: 25.89,
      cond: 'clear', rw: { gold: 144567, M03: 20 }, unlock: '7-7', scene: 'tunnel' },
    { id: '7-9', ch: 7, n: '雷达站', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing'], per: [20, 32], mul: 25.89,
      cond: 'clear', rw: { gold: 144567, M03: 20 }, unlock: '7-8', scene: 'field' },
    { id: '7-10', ch: 7, n: 'BOSS·暴食者', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing'], per: [20, 32], mul: 25.89,
      cond: 'boss', boss: 'baoshi', rw: { gold: 144567, M03: 20 }, unlock: '7-9', scene: 'snow' },
    { id: '8-1', ch: 8, n: '裂谷入口', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [22, 36], mul: 44.53,
      cond: 'clear', rw: { gold: 404788, M04: 22 }, unlock: '7-10', scene: 'tunnel' },
    { id: '8-2', ch: 8, n: '深渊阶梯', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [22, 36], mul: 44.53,
      cond: 'clear', rw: { gold: 404788, M04: 22 }, unlock: '8-1', scene: 'tunnel' },
    { id: '8-3', ch: 8, n: '溶洞', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [22, 36], mul: 44.53,
      cond: 'clear', rw: { gold: 404788, M04: 22 }, unlock: '8-2', scene: 'tunnel' },
    { id: '8-4', ch: 8, n: '地下暗河', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [22, 36], mul: 44.53,
      cond: 'clear', rw: { gold: 404788, M04: 22 }, unlock: '8-3', scene: 'tunnel' },
    { id: '8-5', ch: 8, n: '骨窟', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [22, 36], mul: 44.53,
      cond: 'clear', rw: { gold: 404788, M04: 22 }, unlock: '8-4', scene: 'tunnel' },
    { id: '8-6', ch: 8, n: '毒沼', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [22, 36], mul: 44.53,
      cond: 'clear', rw: { gold: 404788, M04: 22 }, unlock: '8-5', scene: 'factory' },
    { id: '8-7', ch: 8, n: '虫巢', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [22, 36], mul: 44.53,
      cond: 'clear', rw: { gold: 404788, M04: 22 }, unlock: '8-6', scene: 'tunnel' },
    { id: '8-8', ch: 8, n: '熔岩缝', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [22, 36], mul: 44.53,
      cond: 'clear', rw: { gold: 404788, M04: 22 }, unlock: '8-7', scene: 'field' },
    { id: '8-9', ch: 8, n: '深渊祭坛', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [22, 36], mul: 44.53,
      cond: 'clear', rw: { gold: 404788, M04: 22 }, unlock: '8-8', scene: 'snow' },
    { id: '8-10', ch: 8, n: 'BOSS·修道士&深渊领主', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [22, 36], mul: 44.53,
      cond: 'bossAll', boss: ['xiudao', 'shenyuan'], rw: { gold: 404788, M04: 22 }, unlock: '8-9', scene: 'city' },
    { id: '9-1', ch: 9, n: '母巢外壁', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [24, 39], mul: 76.6,
      cond: 'clear', rw: { gold: 1133406, M05: 25 }, unlock: '8-10', scene: 'factory' },
    { id: '9-2', ch: 9, n: '孵化室', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [24, 39], mul: 76.6,
      cond: 'clear', rw: { gold: 1133406, M05: 25 }, unlock: '9-1', scene: 'factory' },
    { id: '9-3', ch: 9, n: '黏液通道', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [24, 39], mul: 76.6,
      cond: 'clear', rw: { gold: 1133406, M05: 25 }, unlock: '9-2', scene: 'factory' },
    { id: '9-4', ch: 9, n: '蛛网回廊', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [24, 39], mul: 76.6,
      cond: 'clear', rw: { gold: 1133406, M05: 25 }, unlock: '9-3', scene: 'factory' },
    { id: '9-5', ch: 9, n: '卵室', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [24, 39], mul: 76.6,
      cond: 'clear', rw: { gold: 1133406, M05: 25 }, unlock: '9-4', scene: 'factory' },
    { id: '9-6', ch: 9, n: '守卫巢', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [24, 39], mul: 76.6,
      cond: 'clear', rw: { gold: 1133406, M05: 25 }, unlock: '9-5', scene: 'tunnel' },
    { id: '9-7', ch: 9, n: '菌毯', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [24, 39], mul: 76.6,
      cond: 'clear', rw: { gold: 1133406, M05: 25 }, unlock: '9-6', scene: 'field' },
    { id: '9-8', ch: 9, n: '腐蚀池', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [24, 39], mul: 76.6,
      cond: 'clear', rw: { gold: 1133406, M05: 25 }, unlock: '9-7', scene: 'snow' },
    { id: '9-9', ch: 9, n: '母巢前厅', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [24, 39], mul: 76.6,
      cond: 'clear', rw: { gold: 1133406, M05: 25 }, unlock: '9-8', scene: 'city' },
    { id: '9-10', ch: 9, n: 'BOSS·修道士', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [24, 39], mul: 76.6,
      cond: 'boss', boss: 'xiudao', rw: { gold: 1133406, M05: 25 }, unlock: '9-9', scene: 'wasteland' },
    { id: '10-1', ch: 10, n: '最后阵地', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [26, 42], mul: 131.75,
      cond: 'clear', rw: { gold: 3173537, M01: 28 }, unlock: '9-10', scene: 'wasteland' },
    { id: '10-2', ch: 10, n: '断墙', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [26, 42], mul: 131.75,
      cond: 'clear', rw: { gold: 3173537, M01: 28 }, unlock: '10-1', scene: 'wasteland' },
    { id: '10-3', ch: 10, n: '弹药库', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [26, 42], mul: 131.75,
      cond: 'clear', rw: { gold: 3173537, M01: 28 }, unlock: '10-2', scene: 'wasteland' },
    { id: '10-4', ch: 10, n: '指挥所', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [26, 42], mul: 131.75,
      cond: 'clear', rw: { gold: 3173537, M01: 28 }, unlock: '10-3', scene: 'wasteland' },
    { id: '10-5', ch: 10, n: '血色战壕', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [26, 42], mul: 131.75,
      cond: 'clear', rw: { gold: 3173537, M01: 28 }, unlock: '10-4', scene: 'wasteland' },
    { id: '10-6', ch: 10, n: '残破街垒', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [26, 42], mul: 131.75,
      cond: 'clear', rw: { gold: 3173537, M01: 28 }, unlock: '10-5', scene: 'field' },
    { id: '10-7', ch: 10, n: '终末广场', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [26, 42], mul: 131.75,
      cond: 'clear', rw: { gold: 3173537, M01: 28 }, unlock: '10-6', scene: 'snow' },
    { id: '10-8', ch: 10, n: '人类旗帜', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [26, 42], mul: 131.75,
      cond: 'clear', rw: { gold: 3173537, M01: 28 }, unlock: '10-7', scene: 'city' },
    { id: '10-9', ch: 10, n: '黎明前夜', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [26, 42], mul: 131.75,
      cond: 'clear', rw: { gold: 3173537, M01: 28 }, unlock: '10-8', scene: 'wasteland' },
    { id: '10-10', ch: 10, n: 'BOSS·尸王', waves: 20, pool: ['putong', 'jipao', 'zhongjia', 'du', 'tuye', 'zhadan', 'dun', 'fenlie', 'feixing', 'jinying'], per: [26, 42], mul: 131.75,
      cond: 'boss', boss: 'shiwang', rw: { gold: 3173537, M01: 28 }, unlock: '10-9', scene: 'factory' },
  ],

  chapters: [
    { id: 1, n: '第一章 · 街区沦陷', icon: '🏙️' },
    { id: 2, n: '第二章 · 地下设施', icon: '🚇' },
    { id: 3, n: '第三章 · 城市核心', icon: '🌉' },
    { id: 4, n: '第四章 · 废弃工厂', icon: '🏭' },
    { id: 5, n: '第五章 · 荒野麦田', icon: '🌾' },
    { id: 6, n: '第六章 · 辐射废墟', icon: '☢️' },
    { id: 7, n: '第七章 · 雪山哨站', icon: '🏔️' },
    { id: 8, n: '第八章 · 深渊裂谷', icon: '🕳️' },
    { id: 9, n: '第九章 · 母巢外围', icon: '🕸️' },
    { id: 10, n: '第十章 · 最终防线', icon: '⚔️' },
  ],

  /* 无尽模式：通关 3-3 解锁 */
  ENDLESS_UNLOCK: '10-10',

  /* =====================================================
   * 【物品表】资料：15 项
   * =================================================== */
  items: [
    { id: 'R01', n: '金币', type: '货币', q: '白', icon: '🪙', img: 'assets/icon/i_gold.jpg', stack: 999999, src: '关卡/任务' },
    { id: 'R02', n: '钻石', type: '货币', q: '紫', icon: '💎', img: 'assets/icon/i_diamond.jpg', stack: 999999, src: '充值/活动' },
    { id: 'M01', n: '金属', type: '材料', q: '白', icon: '🔩', img: 'assets/icon/i_metal.jpg', stack: 9999, src: '关卡掉落' },
    { id: 'M02', n: '合金', type: '材料', q: '蓝', icon: '⚙️', img: 'assets/icon/i_alloy.jpg', stack: 9999, src: '高章节掉落' },
    { id: 'M03', n: '稀有金属', type: '材料', q: '紫', icon: '💠', img: 'assets/icon/i_rare.jpg', stack: 9999, src: 'BOSS关' },
    { id: 'M04', n: '火药', type: '材料', q: '白', icon: '🧪', img: 'assets/icon/i_powder.jpg', stack: 9999, src: '关卡/分解' },
    { id: 'M05', n: '电子元件', type: '材料', q: '蓝', icon: '🔌', img: 'assets/icon/i_chip_elec.jpg', stack: 9999, src: '商店/掉落' },
    { id: 'P01', n: '枪械碎片', type: '碎片', q: '蓝', icon: '🧩', img: 'assets/icon/i_gunfrag.jpg', stack: 9999, src: '关卡/分解' },
    { id: 'P02', n: '角色碎片', type: '碎片', q: '紫', icon: '👤', img: 'assets/icon/i_frag.jpg', stack: 9999, src: '活动/抽奖' },
    { id: 'C01', n: '普通芯片', type: '芯片', q: '白', icon: '🔲', img: 'assets/icon/i_chip.jpg', stack: 999, src: 'BOSS关' },
    { id: 'C02', n: '精英芯片', type: '芯片', q: '蓝', icon: '🔳', img: 'assets/icon/i_chip.jpg', stack: 999, src: '活动/合成' },
    { id: 'C03', n: '传说芯片', type: '芯片', q: '红', icon: '💎', img: 'assets/icon/i_chip.jpg', stack: 999, src: '合成/活动' },
    { id: 'I01', n: '急救包', type: '消耗', q: '白', icon: '🧰', img: 'assets/icon/i_medkit.jpg', stack: 99, src: '关卡/商店', use: '恢复生命50%' },
    { id: 'I02', n: '护盾发生器', type: '消耗', q: '蓝', icon: '🛡️', img: 'assets/icon/i_shield.jpg', stack: 99, src: '商店/任务', use: '获得护盾' },
    { id: 'I03', n: '攻击增幅药剂', type: '消耗', q: '蓝', icon: '💉', img: 'assets/icon/i_potion.jpg', stack: 99, src: '商店/掉落', use: '攻击+30%持续30秒' },
    { id: 'I04', n: '宝箱', type: '消耗', q: '紫', icon: '🎁', img: 'assets/icon/i_chip.jpg', stack: 99, src: '活动/商城', use: '开启获得材料（表31 DR11）' },
  ],
  /* 成就点（任务奖励货币） */
  ACH_POINT: '成就点',

  /* =====================================================
   * 【芯片表】资料：8 个固定芯片，品质决定词条
   * main 主属性 / subPool 词条池 / fuse 合成消耗
   * =================================================== */
  chips: [
    { id: 'CH01', n: '生命芯片', q: '白', slot: '通用', main: { k: 'hp', v: 0.05 }, subPool: [], src: 'BOSS关', fuse: null },
    { id: 'CH02', n: '攻击芯片', q: '白', slot: '通用', main: { k: 'atk', v: 0.05 }, subPool: [], src: 'BOSS关', fuse: null },
    { id: 'CH03', n: '护甲芯片', q: '白', slot: '通用', main: { k: 'armor', v: 0.05 }, subPool: [], src: '活动', fuse: null },
    { id: 'CH04', n: '精英生命', q: '蓝', slot: '武器位', main: { k: 'hp', v: 0.10 }, subPool: ['crit', 'ls', 'rate'], src: '活动/合成', fuse: '3x普通芯片' },
    { id: 'CH05', n: '精英攻击', q: '蓝', slot: '武器位', main: { k: 'atk', v: 0.10 }, subPool: ['crit', 'ls', 'rate'], src: '活动/合成', fuse: '3x普通芯片' },
    { id: 'CH06', n: '传说生命', q: '红', slot: '武器位', main: { k: 'hp', v: 0.20 }, subPool: ['crit', 'ls'], src: '合成/活动', fuse: '3x精英芯片' },
    { id: 'CH07', n: '传说攻击', q: '红', slot: '武器位', main: { k: 'atk', v: 0.20 }, subPool: ['rate', 'crit'], src: '合成/活动', fuse: '3x精英芯片' },
    { id: 'CH08', n: '传说暴击', q: '红', slot: '武器位', main: { k: 'crit', v: 0.10 }, subPool: ['critDmg', 'ls'], src: '活动/充值', fuse: null },
  ],
  chipSlots: [
    { k: 'c1', n: '芯片槽 I' }, { k: 'c2', n: '芯片槽 II' }, { k: 'c3', n: '芯片槽 III' },
    { k: 'c4', n: '芯片槽 IV' }, { k: 'c5', n: '芯片槽 V' }, { k: 'c6', n: '芯片槽 VI' },
  ],
  chipSubStats: [
    { k: 'crit', n: '暴击率', unit: '%', base: 0.02 },
    { k: 'critDmg', n: '暴击伤害', unit: '%', base: 0.06 },
    { k: 'ls', n: '吸血', unit: '%', base: 0.01 },
    { k: 'rate', n: '攻速', unit: '%', base: 0.03 },
  ],
  /* 洗练消耗钻石 */
  REROLL_COST: { '白': 20, '蓝': 50, '红': 120 },

  /* =====================================================
   * 【任务表】资料：12 条（主线3 / 每日3 / 每周2 / 成就4）
   * =================================================== */
  tasks: {
    main: [
      { id: 'M01', n: '通关1-1', cond: { t: 'clearLv', v: '1-1' }, rw: { gold: 200 }, desc: '通关关卡 1-1' },
      { id: 'M02', n: '通关1-2', cond: { t: 'clearLv', v: '1-2' }, rw: { gold: 300 }, desc: '通关关卡 1-2' },
      { id: 'M03', n: '击杀100僵尸', cond: { t: 'kills', v: 100 }, rw: { P01: 3 }, desc: '累计击杀 100 只僵尸' },
    ],
    daily: [
      { id: 'D01', n: '每日登录', cond: { t: 'login', v: 1 }, rw: { gold: 200 }, desc: '登录游戏' },
      { id: 'D02', n: '通关1次关卡', cond: { t: 'dailyClear', v: 1 }, rw: { M01: 5 }, desc: '任意关卡通关 1 次' },
      { id: 'D03', n: '击杀50僵尸', cond: { t: 'dailyKill', v: 50 }, rw: { gold: 150 }, desc: '今日累计击杀 50 只' },
    ],
    weekly: [
      { id: 'W01', n: '每周通关10关', cond: { t: 'weekClear', v: 10 }, rw: { diamond: 50 }, desc: '本周通关 10 个关卡' },
      { id: 'W02', n: '每周击杀1000僵尸', cond: { t: 'weekKill', v: 1000 }, rw: { M03: 2 }, desc: '本周击杀 1000 只' },
    ],
    achieve: [
      { id: 'A01', n: '百人斩', cond: { t: 'kills', v: 1000 }, rw: { ach: 100 }, desc: '累计击杀 1000 只僵尸' },
      { id: 'A02', n: '十连斩', cond: { t: 'noHitKill', v: 10 }, rw: { ach: 50 }, desc: '单场无伤击杀 10 只' },
      { id: 'A03', n: '首次通关BOSS', cond: { t: 'bossKill', v: 1 }, rw: { ach: 150 }, desc: '通关第一个 BOSS 关' },
      { id: 'A04', n: '无尽达10分钟', cond: { t: 'endlessTime', v: 600 }, rw: { ach: 200 }, desc: '无尽模式存活 10 分钟' },
    ],
  },

  /* =====================================================
   * 【热更新清单】表02 第15项 + 表23 第9项
   * 资源路径 / 版本号 / 大小，启动时比对云端决定是否需要刷新缓存
   * =================================================== */
  HOT_UPDATE: {
    enabled: true,
    version: '20260923b',      /* 主版本号，改这个会强制全量刷新缓存 */
    /* 资源清单：path / ver / size(KB) */
    manifest: [
      { p: 'css/style.css', ver: '20260923b', size: 0 },
      { p: 'js/net.js', ver: '20260923b', size: 0 },
      { p: 'js/config.js', ver: '20260923b', size: 0 },
      { p: 'js/engine.js', ver: '20260923b', size: 0 },
      { p: 'js/battle.js', ver: '20260923b', size: 0 },
      { p: 'js/ui.js', ver: '20260923b', size: 0 },
      { p: 'js/main.js', ver: '20260923b', size: 0 },
      { p: 'js/audio.js', ver: '20260923b', size: 0 },
    ],
  },
  /* 取资源带版本号的 URL（热更新核心：改 ver 即失效浏览器缓存） */
  resUrl(p) {
    const it = (this.HOT_UPDATE.manifest || []).find((x) => x.p === p);
    const v = it ? it.ver : this.HOT_UPDATE.version;
    return p + '?v=' + v;
  },

  /* =====================================================
   * 【37_运营数据埋点表】12 个事件
   * =================================================== */
  TRACK_EVENTS: [
    { id: 'game_start', n: '游戏启动', use: '激活/启动', trig: '启动游戏', pr: 'P0' },
    { id: 'level_start', n: '进入关卡', use: '关卡参与率', trig: '进入关卡', pr: 'P0' },
    { id: 'level_finish', n: '关卡结算', use: '通关率/难度', trig: '结算', pr: 'P0' },
    { id: 'kill_monster', n: '击杀怪物', use: '怪物分布', trig: '击杀', pr: 'P1' },
    { id: 'skill_select', n: '技能选择', use: '技能强度/平衡', trig: '选技能', pr: 'P0' },
    { id: 'weapon_upgrade', n: '武器升级', use: '养成深度', trig: '武器升级', pr: 'P1' },
    { id: 'ad_watch', n: '观看广告', use: '广告变现', trig: '看广告', pr: 'P0' },
    { id: 'iap_purchase', n: '内购', use: '付费率/ARPU', trig: '购买', pr: 'P0' },
    { id: 'resurrect', n: '复活', use: '失败流失点', trig: '看广告复活', pr: 'P1' },
    { id: 'endless_time', n: '无尽时长', use: '无尽参与', trig: '无尽结束', pr: 'P1' },
    { id: 'dau_retention', n: '留存', use: '次日/7日留存', trig: '每日', pr: 'P0' },
    { id: 'funnel_convert', n: '新手漏斗', use: '引导转化', trig: '引导完成', pr: 'P0' },
  ],

  /* =====================================================
   * 【39_多语言本地化表】TXT_001~TXT_008，5 种语言
   * =================================================== */
  LANGS: [
    { k: 'zh', n: '简体中文' }, { k: 'en', n: 'English' },
    { k: 'zhTW', n: '繁體中文' }, { k: 'ja', n: '日本語' }, { k: 'ru', n: 'Русский' },
  ],
  I18N: {
    TXT_001: { zh: '开始游戏', en: 'Start', zhTW: '開始遊戲', ja: 'スタート', ru: 'Начать' },
    TXT_002: { zh: '设置', en: 'Settings', zhTW: '設置', ja: '設定', ru: 'Настройки' },
    TXT_003: { zh: '通关', en: 'Clear', zhTW: '通關', ja: 'クリア', ru: 'Пройдено' },
    TXT_004: { zh: '看广告复活', en: 'Revive(Watch Ad)', zhTW: '復活(看廣告)', ja: '広告で復活', ru: 'Возродиться(реклама)' },
    TXT_005: { zh: '武器升级', en: 'Weapon Upgrade', zhTW: '武器升級', ja: '武器強化', ru: 'Улучшение оружия' },
    TXT_006: { zh: '技能选择', en: 'Choose Skill', zhTW: '技能選擇', ja: 'スキル選択', ru: 'Выбор навыка' },
    TXT_007: { zh: '大量僵尸来袭', en: 'Massive Zombies!', zhTW: '大量殭屍來襲', ja: '大量ゾンビ襲来', ru: 'Массовые зомби!' },
    TXT_008: { zh: '生存时间', en: 'Survival Time', zhTW: '生存時間', ja: '生存時間', ru: 'Время выживания' },
  },
  txt(id, lang) {
    const e = this.I18N[id]; if (!e) return id;
    return e[lang || 'zh'] || e.zh || id;
  },

  /* =====================================================
   * 【38_版本开发排期表】V0.1 ~ V1.0 共 8 个版本
   * =================================================== */
  VERSIONS: [
    { v: 'V0.1', n: '核心原型', wk: '第1-2周', c: '战斗+关卡+自动瞄准原型', ms: '战斗可玩', ok: '核心战斗可操作、可通关1-3关', pr: 'P0', done: true },
    { v: 'V0.2', n: '核心玩法闭环', wk: '第3-5周', c: '武器+局内技能+角色养成', ms: '养成闭环', ok: '武器升级+技能选择+角色成长完整', pr: 'P0', done: true },
    { v: 'V0.3', n: '系统整合', wk: '第6-8周', c: '基地+任务+背包+商城', ms: '全系统', ok: '基地/任务/背包/商城可访问', pr: 'P0', done: true },
    { v: 'V0.4', n: '内容扩充', wk: '第9-12周', c: '第1-3章+BOSS+无尽', ms: '内容量', ok: '前3章完整+无尽+3个BOSS', pr: 'P0', done: true },
    { v: 'V0.5', n: '付费与广告', wk: '第13-14周', c: '商城+广告+复活', ms: '变现闭环', ok: '充值/广告可正常变现', pr: 'P1', done: true },
    { v: 'V0.6', n: '运营系统', wk: '第15-16周', c: '活动+排行榜+埋点', ms: '运营能力', ok: '活动/排行/数据上报可用', pr: 'P1', done: true },
    { v: 'V0.7', n: '打磨优化', wk: '第17-19周', c: '数值平衡+性能+机型适配', ms: '品质', ok: 'FPS达标+低端机流畅', pr: 'P1', done: true },
    { v: 'V1.0', n: '正式上线', wk: '第20周', c: '提审+上线', ms: '上线', ok: '过审+可正式发布', pr: 'P0', done: true },
  ],

  /* =====================================================
   * 【40_后端接口清单】API_001~008 → GitHub 实现映射
   * =================================================== */
  APIS: [
    { id: 'API_001', n: '玩家登录', m: 'POST /login', param: 'uid/token/version', ret: '用户信息/存档', sc: '启动登录', pr: 'P0', impl: 'GET data/ss/players/{uid}.json' },
    { id: 'API_002', n: '上传存档', m: 'POST /save', param: 'uid/存档数据', ret: '存档ID/时间戳', sc: '离线/手动存档', pr: 'P0', impl: 'PUT data/ss/players/{uid}.json（git commit）' },
    { id: 'API_003', n: '拉取存档', m: 'GET /load', param: 'uid', ret: '完整存档', sc: '登录/切换设备', pr: 'P0', impl: 'GET data/ss/players/{uid}.json' },
    { id: 'API_004', n: '无尽排名', m: 'POST /endless/rank', param: 'uid/时长/战力', ret: '排名/榜单', sc: '无尽结算', pr: 'P2', impl: 'PUT data/ss/leaderboard.json' },
    { id: 'API_005', n: '拉取排行榜', m: 'GET /leaderboard', param: '榜单类型/页', ret: '榜单列表', sc: '查看排行', pr: 'P2', impl: 'GET data/ss/leaderboard.json' },
    { id: 'API_006', n: '订单支付回调', m: 'POST /pay/callback', param: '订单号/回执', ret: '验证结果', sc: '内购', pr: 'P1', impl: '本地直购（无服务端校验）' },
    { id: 'API_007', n: '活动配置', m: 'GET /activity', param: '活动ID', ret: '活动数据', sc: '活动开启', pr: 'P2', impl: 'data/config/*.json（内置）' },
    { id: 'API_008', n: '公告', m: 'GET /notice', param: '—', ret: '公告列表', sc: '登录拉公告', pr: 'P1', impl: 'data/config/meta.json.notice' },
  ],

  /* =====================================================
   * 【36_资源命名规范】12 类前缀，用于新增资源时规范化
   * =================================================== */
  NAMING: [
    { t: 'UI底图', pre: 'UI_', rule: 'UI_页面_用途_尺寸', eg: 'UI_Main_MainBase_1080', dir: 'Art/UI/Main', pr: 'P0' },
    { t: '按钮', pre: 'BTN_', rule: 'BTN_按钮用途_状态', eg: 'BTN_Attack_Normal', dir: 'Art/UI/Base', pr: 'P0' },
    { t: '图标', pre: 'ICO_', rule: 'ICO_物品类型_名称', eg: 'ICO_Weapon_Rifle', dir: 'Art/Icon', pr: 'P0' },
    { t: '角色模型', pre: 'CH_', rule: 'CH_角色名_皮肤', eg: 'CH_Jack_Wasteland', dir: 'Art/Character/Player', pr: 'P0' },
    { t: '怪物模型', pre: 'MO_', rule: 'MO_怪物名', eg: 'MO_Zombie_Normal', dir: 'Art/Character/Monster', pr: 'P0' },
    { t: '武器模型', pre: 'WP_', rule: 'WP_武器名', eg: 'WP_Rifle_01', dir: 'Art/Weapon', pr: 'P0' },
    { t: '特效', pre: 'FX_', rule: 'FX_技能名_效果', eg: 'FX_ChainLightning', dir: 'Art/VFX', pr: 'P0' },
    { t: '场景', pre: 'SC_', rule: 'SC_地图名', eg: 'SC_Street_01', dir: 'Art/Scene', pr: 'P0' },
    { t: 'BGM', pre: 'BGM_', rule: 'BGM_场景/用途', eg: 'BGM_Battle_01', dir: 'Audio/BGM', pr: 'P0' },
    { t: '音效', pre: 'SFX_', rule: 'SFX_类型_用途', eg: 'SFX_Bullet_Fire', dir: 'Audio/SFX', pr: 'P0' },
    { t: '配音', pre: 'VO_', rule: 'VO_角色/用途_台词ID', eg: 'VO_NPC_001', dir: 'Audio/VO', pr: 'P1' },
    { t: '配置表', pre: 'DT_', rule: 'DT_表名', eg: 'DT_WeaponTable', dir: 'Data/Config', pr: 'P0' },
  ],

  /* =====================================================
   * 【30_武器词条池】AF01~AF12，按品质分档
   * =================================================== */
  affixes: [
    { id: 'AF01', n: '伤害强化', q: '蓝', eff: '伤害+5%', k: 'dmg', v: 0.05, stack: true, src: '洗练/掉落', pr: 'P1' },
    { id: 'AF02', n: '攻速强化', q: '蓝', eff: '攻速+5%', k: 'rate', v: 0.05, stack: true, src: '洗练/掉落', pr: 'P1' },
    { id: 'AF03', n: '暴击率', q: '蓝', eff: '暴击率+3%', k: 'crit', v: 0.03, stack: true, src: '洗练/掉落', pr: 'P1' },
    { id: 'AF04', n: '暴击伤害', q: '紫', eff: '暴伤+10%', k: 'critDmg', v: 0.10, stack: true, src: '洗练/掉落', pr: 'P1' },
    { id: 'AF05', n: '穿透', q: '紫', eff: '穿透+1', k: 'pierce', v: 1, stack: false, src: '洗练/掉落', pr: 'P1' },
    { id: 'AF06', n: '吸血', q: '紫', eff: '吸血+3%', k: 'lifesteal', v: 0.03, stack: true, src: '洗练/掉落', pr: 'P1' },
    { id: 'AF07', n: '弹夹容量', q: '紫', eff: '弹夹+2', k: 'mag', v: 2, stack: true, src: '洗练/掉落', pr: 'P1' },
    { id: 'AF08', n: '换弹速度', q: '紫', eff: '换弹-0.2秒', k: 'reload', v: 0.2, stack: true, src: '洗练/掉落', pr: 'P2' },
    { id: 'AF09', n: '爆炸范围', q: '红', eff: '爆炸范围+10%', k: 'er', v: 0.10, stack: true, src: '传说洗练', pr: 'P2' },
    { id: 'AF10', n: '穿透强化', q: '红', eff: '穿透+2', k: 'pierce', v: 2, stack: false, src: '传说洗练', pr: 'P2' },
    { id: 'AF11', n: '双倍伤害', q: '红', eff: '5%概率双倍伤害', k: 'double', v: 0.05, stack: false, src: '传说洗练', pr: 'P2' },
    { id: 'AF12', n: '额外子弹', q: '红', eff: '额外发射1颗子弹', k: 'extra', v: 1, stack: false, src: '传说洗练', pr: 'P2' },
  ],
  /* 词条洗练消耗：普通洗练金币，传说洗练钻石 */
  AFFIX_REROLL_GOLD: 5000,
  AFFIX_REROLL_LEGEND_DIA: 50,
  /* 按品质随机取词条 */
  rollAffixOne(legend) {
    const pool = this.affixes.filter((a) => legend ? a.q === '红' : a.q !== '红');
    const src = pool.length ? pool : this.affixes;
    const a = src[Math.floor(Math.random() * src.length)];
    /* 数值在基础值上下浮动 ±40% */
    const v = a.v * (0.6 + Math.random() * 0.8);
    return { id: a.id, v: a.k === 'pierce' || a.k === 'mag' || a.k === 'extra'
      ? Math.max(1, Math.round(v)) : Math.round(v * 1000) / 1000 };
  },
  affixOf(id) { return this.affixes.find((x) => x.id === id) || null; },
  affixTxt(af) {
    const a = this.affixOf(af.id); if (!a) return '';
    if (a.k === 'pierce' || a.k === 'mag' || a.k === 'extra') return a.n + ' +' + af.v;
    if (a.k === 'reload') return a.n + ' -' + af.v.toFixed(1) + '秒';
    return a.n + ' +' + (af.v * 100).toFixed(1) + '%';
  },

  /* =====================================================
   * 【36_】扫荡系统（表29：已通关关卡快速扫荡，消耗体力）
   * =================================================== */
  SWEEP_STAMINA: 5,          /* 单次扫荡消耗体力 */
  SWEEP_MAX: 10,             /* 单次最多扫荡次数 */
  sweepRw(lv, times) {
    /* 产出随关卡章节递增 */
    const ch = Math.floor((lv - 1) / 10) + 1;
    const g = Math.round((120 + ch * 60) * times);
    const metal = Math.round((3 + ch * 2) * times);
    const xp = Math.round((80 + ch * 45) * times);
    return { gold: g, M01: metal, xp: xp };
  },

  /* =====================================================
   * 【42_成就商店兑换表】12 项，消耗成就点
   * =================================================== */
  achShop: [
    { id: 'AS01', n: '金属x20', t: '材料', cost: 30, limit: 10, per: 'day', need: 0, give: { M01: 20 } },
    { id: 'AS02', n: '合金x5', t: '材料', cost: 50, limit: 5, per: 'day', need: 0, give: { M02: 5 } },
    { id: 'AS03', n: '稀有金属x2', t: '材料', cost: 120, limit: 2, per: 'day', need: 0, give: { M03: 2 } },
    { id: 'AS04', n: '火药x10', t: '材料', cost: 40, limit: 5, per: 'day', need: 0, give: { M04: 10 } },
    { id: 'AS05', n: '急救包x1', t: '消耗', cost: 80, limit: 3, per: 'day', need: 0, give: { U01: 1 } },
    { id: 'AS06', n: '护盾发生器x1', t: '消耗', cost: 100, limit: 2, per: 'day', need: 0, give: { U02: 1 } },
    { id: 'AS07', n: '枪械碎片x3', t: '碎片', cost: 150, limit: 2, per: 'day', need: 0, give: { P01: 3 } },
    { id: 'AS08', n: '角色碎片x2', t: '碎片', cost: 200, limit: 3, per: 'week', need: 0, give: { P02: 2 } },
    { id: 'AS09', n: '普通芯片x1', t: '芯片', cost: 180, limit: 1, per: 'day', need: 0, give: { C01: 1 } },
    { id: 'AS10', n: '精英芯片x1', t: '芯片', cost: 400, limit: 2, per: 'week', need: 0, give: { C02: 1 } },
    { id: 'AS11', n: '传说芯片x1', t: '芯片', cost: 900, limit: 1, per: 'month', need: 0, give: { C03: 1 } },
    { id: 'AS12', n: '限定称号-百人斩', t: '称号', cost: 500, limit: 1, per: 'once', need: 0, give: { title: 'ach_100' } },
  ],

  /* =====================================================
   * 【43_活动商店兑换表】12 项，消耗活动代币
   * =================================================== */
  eventShop: [
    { id: 'ES01', n: '金属x30', t: '材料', cost: 50, limit: 10, per: 'day', ev: '丧尸围城', give: { M01: 30 } },
    { id: 'ES02', n: '合金x8', t: '材料', cost: 100, limit: 5, per: 'day', ev: '丧尸围城', give: { M02: 8 } },
    { id: 'ES03', n: '稀有金属x3', t: '材料', cost: 200, limit: 2, per: 'day', ev: '丧尸围城', give: { M03: 3 } },
    { id: 'ES04', n: '枪械碎片x5', t: '碎片', cost: 150, limit: 3, per: 'day', ev: '丧尸围城', give: { P01: 5 } },
    { id: 'ES05', n: '角色碎片x3', t: '碎片', cost: 250, limit: 3, per: 'ev', ev: 'BOSS突袭', give: { P02: 3 } },
    { id: 'ES06', n: '普通芯片x2', t: '芯片', cost: 180, limit: 2, per: 'day', ev: 'BOSS突袭', give: { C01: 2 } },
    { id: 'ES07', n: '精英芯片x1', t: '芯片', cost: 350, limit: 2, per: 'ev', ev: 'BOSS突袭', give: { C02: 1 } },
    { id: 'ES08', n: '传说芯片x1', t: '芯片', cost: 800, limit: 1, per: 'ev', ev: 'BOSS突袭', give: { C03: 1 } },
    { id: 'ES09', n: '限定皮肤-末日战甲', t: '皮肤', cost: 1500, limit: 1, per: 'ev', ev: '节日活动', give: { skin: 'mo_ri' } },
    { id: 'ES10', n: '钻石x100', t: '货币', cost: 300, limit: 5, per: 'ev', ev: '丧尸围城', give: { diamond: 100 } },
    { id: 'ES11', n: '体力x30', t: '体力', cost: 60, limit: 3, per: 'day', ev: '节日活动', give: { stamina: 30 } },
    { id: 'ES12', n: '活动限定头像框', t: '外观', cost: 800, limit: 1, per: 'ev', ev: '节日活动', give: { frame: 'ev_frame' } },
  ],

  /* =====================================================
   * 【33_排行榜奖励表】10 项，按排名发奖（邮件）
   * =================================================== */
  rankRewards: [
    { id: 'RK01', board: '无尽生存榜', rank: '第1名', lo: 1, hi: 1, rw: { C03: 1, diamond: 500, title: 'endless_king' }, cyc: '每小时' },
    { id: 'RK02', board: '无尽生存榜', rank: '第2-5名', lo: 2, hi: 5, rw: { C02: 2, diamond: 200 }, cyc: '每小时' },
    { id: 'RK03', board: '无尽生存榜', rank: '第6-20名', lo: 6, hi: 20, rw: { C01: 2, diamond: 100 }, cyc: '每小时' },
    { id: 'RK04', board: '无尽生存榜', rank: '第21-100名', lo: 21, hi: 100, rw: { gold: 2000, M01: 20 }, cyc: '每小时' },
    { id: 'RK05', board: '战力榜', rank: '第1名', lo: 1, hi: 1, rw: { C03: 1, M03: 5 }, cyc: '每日' },
    { id: 'RK06', board: '战力榜', rank: '第2-10名', lo: 2, hi: 10, rw: { C02: 1, M03: 3 }, cyc: '每日' },
    { id: 'RK07', board: '战力榜', rank: '第11-50名', lo: 11, hi: 50, rw: { C01: 1, M02: 10 }, cyc: '每日' },
    { id: 'RK08', board: '活动冲榜', rank: '第1名', lo: 1, hi: 1, rw: { skin: 'ev_top', C03: 2 }, cyc: '活动结束' },
    { id: 'RK09', board: '活动冲榜', rank: '第2-5名', lo: 2, hi: 5, rw: { C03: 1, diamond: 300 }, cyc: '活动结束' },
    { id: 'RK10', board: '活动冲榜', rank: '第6-20名', lo: 6, hi: 20, rw: { C02: 2, diamond: 150 }, cyc: '活动结束' },
  ],

  /* =====================================================
   * 【图鉴收集】表29：收集怪物/武器/皮肤，首次解锁领奖
   * =================================================== */
  codexRw: { zombie: { gold: 100, ach: 5 }, gun: { gold: 200, ach: 10 }, skin: { gold: 300, ach: 15 } },
  codexKinds: [
    { k: 'zombie', n: '怪物图鉴', icon: '🧟' },
    { k: 'gun', n: '武器图鉴', icon: '🔫' },
    { k: 'skin', n: '皮肤图鉴', icon: '👕' },
  ],
  codexOf(kind) {
    if (kind === 'zombie') return (this.zombies || []).map((z) => ({ id: z.id, n: z.n, icon: z.icon, img: z.img }));
    if (kind === 'gun') return (this.guns || []).map((g) => ({ id: g.id, n: g.n, icon: g.icon, img: g.img }));
    if (kind === 'skin') return (this.skins || []).map((s) => ({ id: s.id, n: s.n, icon: s.icon, img: s.img }));
    return [];
  },

  /* =====================================================
   * 【角色升星】表15/42：角色碎片升星，每星 +8% 全属性
   * =================================================== */
  starCost: [0, 10, 20, 40, 80, 160],   /* 升到 1~5 星各需角色碎片 */
  STAR_MAX: 5,
  starBonus(star) { return (star || 0) * 0.08; },   /* 每星 +8% */

  /* =====================================================
   * 【商城表】资料：10 个商品（RMB 直购）
   * =================================================== */
  shop: [
    { id: 'SH01', n: '新手礼包', type: '礼包', price: 6, cur: 'RMB', limit: 1,
      rw: { gold: 2000, M01: 50, P01: 10 }, icon: '🎁' },
    { id: 'SH02', n: '钻石小包', type: '直购', price: 6, cur: 'RMB', limit: 0,
      rw: { diamond: 60 }, icon: '💎' },
    { id: 'SH03', n: '钻石中包', type: '直购', price: 30, cur: 'RMB', limit: 0,
      rw: { diamond: 330 }, icon: '💎' },
    { id: 'SH04', n: '钻石大包', type: '直购', price: 98, cur: 'RMB', limit: 0,
      rw: { diamond: 1150 }, icon: '💎' },
    { id: 'SH05', n: '月卡', type: '月卡', price: 30, cur: 'RMB', limit: 1,
      rw: { diamond: 0 }, monthly: true, icon: '📅' },
    { id: 'SH06', n: '战令(普通)', type: '战令', price: 0, cur: 'RMB', limit: 0,
      rw: {}, pass: true, icon: '🎖️' },
    { id: 'SH07', n: '战令(进阶)', type: '战令', price: 68, cur: 'RMB', limit: 0,
      rw: { diamond: 300 }, pass: true, icon: '🎖️' },
    { id: 'SH08', n: '废土战甲皮肤', type: '直购', price: 68, cur: 'RMB', limit: 0,
      rw: { skin: 'sk_c01b' }, icon: '🥼' },
    { id: 'SH09', n: '传说芯片包', type: '礼包', price: 98, cur: 'RMB', limit: 3,
      rw: { chipRed: 2, diamond: 200 }, icon: '📦' },
    { id: 'SH10', n: '资源礼包', type: '礼包', price: 30, cur: 'RMB', limit: 0,
      rw: { M01: 100, M02: 50, M04: 50 }, icon: '📦' },
  ],

  /* =====================================================
   * 【活动表】资料：6 个
   * =================================================== */
  activities: [
    { id: 'EV01', n: '丧尸围城', type: '限时挑战', time: '每周五~周日', icon: '🏰',
      desc: '生存限时挑战，波次积分', rw: '活动代币 + 芯片', rule: '按积分领奖' },
    { id: 'EV02', n: 'BOSS突袭', type: '限时', time: '每月1-3日', icon: '👹',
      desc: '限定 BOSS 战，挑战次数限制', rw: '稀有金属 + 钻石', rule: '每日 3 次' },
    { id: 'EV03', n: '签到活动', type: '常驻', time: '每自然月', icon: '📅',
      desc: '累计登录领奖', rw: '钻石 + 材料', rule: '连续签到奖励递增' },
    { id: 'EV04', n: '首充双倍', type: '付费活动', time: '开服永久', icon: '💰',
      desc: '首次充值钻石翻倍', rw: '钻石', rule: '仅 1 次' },
    { id: 'EV05', n: '限时皮肤', type: '皮肤活动', time: '节日期间', icon: '👗',
      desc: '限定皮肤上架', rw: '皮肤', rule: '限时购买' },
    { id: 'EV06', n: '无尽冲榜', type: '排行榜', time: '每月15-25日', icon: '🏆',
      desc: '无尽模式存活时长排名', rw: '传说芯片 + 限定称号', rule: '按排名发奖' },
  ],

  /* =====================================================
   * 【怪物表】资料 09 表：12 种（保持已对齐）
   * =================================================== */
  zombies: [
    { id: 'putong', n: '普通僵尸', icon: '🧟', img: 'assets/icon/z_putong.jpg', hp: 30, spd: 58, dmg: 8, atkR: 26, ai: 'chase', armor: 0,
      skill: '扑咬', sk: '近战伤害，靠近玩家撕咬', xp: 4, gold: 3 },
    { id: 'jipao', n: '疾跑僵尸', icon: '🏃', img: 'assets/icon/z_jipao.jpg', hp: 22, spd: 130, dmg: 14, atkR: 24, ai: 'rush', armor: 0,
      skill: '冲刺', sk: '高速冲向玩家，接触造成高伤害', xp: 6, gold: 4 },
    { id: 'zhongjia', n: '重甲僵尸', icon: '🥋', img: 'assets/icon/z_zhongjia.jpg', hp: 180, spd: 44, dmg: 18, atkR: 28, ai: 'chase', armor: 15,
      skill: '护甲', sk: '减伤高，需穿透/爆炸破甲', def: 0.55, xp: 14, gold: 12, elite: true },
    { id: 'zibao', n: '自爆僵尸', icon: '💣', img: 'assets/icon/z_zibao.jpg', hp: 45, spd: 105, dmg: 34, atkR: 30, ai: 'boomer', armor: 0,
      skill: '自爆', sk: '接近后自爆，范围伤害，死亡解体', xp: 10, gold: 8 },
    { id: 'du', n: '毒僵尸', icon: '☠️', img: 'assets/icon/z_du.jpg', hp: 90, spd: 58, dmg: 10, atkR: 120, ai: 'ranged', armor: 5,
      skill: '毒雾', sk: '喷洒毒雾，玩家中毒持续掉血', poison: 6, xp: 13, gold: 10, elite: true },
    { id: 'tuye', n: '吐液僵尸', icon: '🤮', img: 'assets/icon/z_tuye.jpg', hp: 70, spd: 52, dmg: 12, atkR: 150, ai: 'ranged', armor: 0,
      skill: '腐蚀液', sk: '远程喷吐，落地区域持续伤害', pool: 5, xp: 12, gold: 9 },
    { id: 'zhadan', n: '炸弹僵尸', icon: '🧨', img: 'assets/icon/z_zhadan.jpg', hp: 55, spd: 75, dmg: 26, atkR: 28, ai: 'boomer', armor: 0,
      skill: '死亡爆炸', sk: '死亡时爆炸范围伤害，可引爆油桶', xp: 11, gold: 9 },
    { id: 'dun', n: '护盾僵尸', icon: '🔰', img: 'assets/icon/z_dun.jpg', hp: 130, spd: 55, dmg: 16, atkR: 26, ai: 'chase', armor: 10,
      skill: '能量护盾', sk: '正面免疫伤害，需绕后或破盾', front: 0.85, xp: 16, gold: 13, elite: true },
    { id: 'fenlie', n: '分裂僵尸', icon: '🪱', img: 'assets/icon/z_fenlie.jpg', hp: 85, spd: 62, dmg: 12, atkR: 26, ai: 'chase', armor: 0,
      skill: '分裂', sk: '死亡分裂成 2 个小僵尸', split: 2, xp: 12, gold: 10 },
    { id: 'feixing', n: '飞行僵尸', icon: '🦅', img: 'assets/icon/z_feixing.jpg', hp: 60, spd: 98, dmg: 15, atkR: 30, ai: 'chase', armor: 0,
      skill: '飞行', sk: '越过地面障碍，空中移动', fly: true, xp: 13, gold: 11 },
    { id: 'jinying', n: '精英僵尸', icon: '👹', img: 'assets/icon/z_jinying.jpg', hp: 320, spd: 68, dmg: 26, atkR: 30, ai: 'chase', armor: 5,
      skill: '强化体魄', sk: '高血量高伤害的精英单位', def: 0.3, xp: 30, gold: 26, elite: true },
    { id: 'xiaozombie', n: '小僵尸', icon: '🐛', img: 'assets/icon/z_xiaozombie.jpg', hp: 12, spd: 85, dmg: 5, atkR: 20, ai: 'chase', armor: 0,
      skill: '扑咬', sk: '分裂产生的小体型僵尸', xp: 2, gold: 1 },
  ],
  /* BOSS */
  bosses: [
    { id: 'juxing', n: '巨型丧尸', icon: '🦖', img: 'assets/char/boss_juxing.jpg', hp: 6500, spd: 22, dmg: 40, atkR: 46, def: 0.25,
      phases: 2, xp: 220, gold: 260,
      skills: [
        { n: '巨爪拍击', sk: '大范围近战，击退防线', trig: 'contact' },
        { n: '召唤小怪', sk: '召唤普通僵尸群助战', trig: 0.7 },
        { n: '召唤小怪', sk: '再次召唤僵尸群', trig: 0.4 },
      ] },
    { id: 'mama', n: '感染母体', icon: '🕷️', img: 'assets/char/boss_mama.jpg', hp: 14000, spd: 26, dmg: 34, atkR: 150, def: 0.2,
      phases: 3, xp: 320, gold: 380,
      skills: [
        { n: '孢子喷吐', sk: '喷出感染孢子，落地分裂小怪', trig: 0.8 },
        { n: '狂暴', sk: '进入狂暴，攻速移速提升', trig: 0.5 },
        { n: '阶段切换', sk: '血量阈值触发新技能，全屏警告', trig: 0.3 },
      ] },
    /* ===== 真实 BOSS（资料表 realBosses，此前 6 个名字未使用，
     *       100 关里只有 2 个 BOSS 反复轮播） ===== */
    { id: 'kaiken', n: '开垦者', icon: '⛏️', img: 'assets/char/boss_kaiken.jpg', hp: 44000, spd: 20, dmg: 52, atkR: 60, def: 0.28,
      phases: 2, xp: 420, gold: 480,
      skills: [
        { n: '铲斗横扫', sk: '大范围横扫，击退并眩晕', trig: 'contact' },
        { n: '地面震击', sk: '砸地产生冲击波', trig: 0.7 },
        { n: '狂暴', sk: '攻速提升，免疫减速', trig: 0.35 },
      ] },
    { id: 'chaoxue', n: '巢穴之母', icon: '🕸️', img: 'assets/char/boss_chaoxue.jpg', hp: 76000, spd: 18, dmg: 58, atkR: 130, def: 0.30,
      phases: 3, xp: 620, gold: 700,
      skills: [
        { n: '产卵', sk: '持续孵化小僵尸', trig: 0.85 },
        { n: '酸液喷吐', sk: '远程腐蚀伤害', trig: 0.6 },
        { n: '狂暴', sk: '移速提升，召唤虫群', trig: 0.4 },
      ] },
    { id: 'shenyuan', n: '深渊领主', icon: '🔱', img: 'assets/char/boss_shenyuan.jpg', hp: 195000, spd: 24, dmg: 75, atkR: 170, def: 0.32,
      phases: 3, xp: 880, gold: 980,
      skills: [
        { n: '暗影镰斩', sk: '远程能量斩击', trig: 'contact' },
        { n: '深渊召唤', sk: '召唤精英僵尸', trig: 0.7 },
        { n: '狂暴免疫', sk: '免疫控制，伤害大幅提升', trig: 0.3 },
      ] },
    { id: 'baoshi', n: '暴食者', icon: '🍖', img: 'assets/char/boss_baoshi.jpg', hp: 240000, spd: 14, dmg: 88, atkR: 55, def: 0.38,
      phases: 2, xp: 1200, gold: 1350,
      skills: [
        { n: '吞噬', sk: '近身吞噬，大量伤害', trig: 'contact' },
        { n: '呕吐酸液', sk: '范围持续伤害', trig: 0.65 },
        { n: '狂暴', sk: '移速提升，血量回复', trig: 0.35 },
      ] },
    { id: 'xiudao', n: '修道士', icon: '🕯️', img: 'assets/char/boss_xiudao.jpg', hp: 1700000, spd: 28, dmg: 105, atkR: 200, def: 0.34,
      phases: 3, xp: 1650, gold: 1850,
      skills: [
        { n: '诅咒之杖', sk: '远程诅咒，降低玩家攻速', trig: 'contact' },
        { n: '亡者复苏', sk: '复活场上死亡僵尸', trig: 0.7 },
        { n: '暗红仪式', sk: '全屏伤害', trig: 0.4 },
      ] },
    { id: 'shiwang', n: '尸王', icon: '👑', img: 'assets/char/boss_shiwang.jpg', hp: 3500000, spd: 26, dmg: 130, atkR: 210, def: 0.40,
      phases: 3, xp: 2400, gold: 2800,
      skills: [
        { n: '巨剑斩击', sk: '超大范围斩击', trig: 'contact' },
        { n: '瘟疫领域', sk: '全场持续毒伤', trig: 0.75 },
        { n: '尸王狂暴', sk: '全属性大幅提升，召唤尸潮', trig: 0.35 },
      ] },
  ],
  bossCommon: [
    { n: '阶段切换', sk: '血量 70% / 40% 触发新技能，全屏警告' },
    { n: '狂暴免疫', sk: '狂暴阶段免疫控制，伤害提升' },
  ],
  /* 真实 BOSS（资料） */
  realBosses: ['开垦者', '巢穴之母', '深渊领主', '暴食者', '修道士', '尸王'],

  /* 【局内技能表】真实《向僵尸开炮》技能（火/电/冰/风 四系 + 被动） */
  skills: [
    { id: 'wenyadan', n: '温压弹', icon: '🔥', img: 'assets/icon/sk_wenyadan.jpg', kind: 'active', el: '火', conflict: 'ranyoudan', max: 10, cd: 6.0,
      desc: '高温高压爆炸，大范围群体伤害', up: '每级 +范围 +伤害', mods: { blastR: 96, blastMul: 1.6 } },
    { id: 'ganbingdan', n: '干冰弹', icon: '❄️', img: 'assets/icon/sk_ganbingdan.jpg', kind: 'active', el: '冰', conflict: 'bingbao', max: 10, cd: 7.0,
      desc: '冻结减速全场僵尸', up: '每级 +冻结时长 +范围', mods: { freeze: 1.6, freezeR: 120 } },
    { id: 'diancichuan', n: '电磁穿刺', icon: '⚡', img: 'assets/icon/sk_diancichuan.jpg', kind: 'active', el: '电', conflict: 'gaonengshexian', max: 10, cd: 5.5,
      desc: '电磁穿刺穿透一条直线上的敌人', up: '每级 +穿透数', mods: { pierceN: 5, chainMul: 1.2 } },
    { id: 'zhuangjiache', n: '装甲车', icon: '🚙', img: 'assets/icon/sk_zhuangjiache.jpg', kind: 'summon', el: '物', max: 8, cd: 12.0,
      desc: '召唤装甲车冲入尸潮，聚怪并碾压', up: '每级 +持续时间', mods: { summon: 'armored', dur: 8 } },
    { id: 'xuanfengjianong', n: '旋风加农', icon: '🌪️', img: 'assets/icon/sk_xuanfengjianong.jpg', kind: 'active', el: '风', max: 10, cd: 8.0,
      desc: '生成旋风吸附僵尸并持续切割', up: '每级 +吸附范围', mods: { vortexR: 110, vortexDps: 0.8 } },
    { id: 'zhidaojiguang', n: '制导激光', icon: '🔺', img: 'assets/icon/sk_zhidaojiguang.jpg', kind: 'active', el: '电', max: 10, cd: 4.5,
      desc: '自动锁定最近僵尸持续激光灼烧', up: '每级 +伤害', mods: { laserDps: 1.4, laserDur: 3.0 } },
    { id: 'wurenji', n: '无人机', icon: '🛸', img: 'assets/icon/sk_wurenji.jpg', kind: 'summon', el: '物', max: 8, cd: 10.0,
      desc: '召唤无人机辅助自动输出', up: '每级 +无人机数量', mods: { summon: 'drone', dur: 14 } },
    { id: 'ranyoudan', n: '燃油弹', icon: '🛢️', img: 'assets/icon/sk_ranyoudan.jpg', kind: 'active', el: '火', conflict: 'wenyadan', max: 10, cd: 6.5,
      desc: '抛洒燃油，地面持续燃烧', up: '每级 +燃烧范围', mods: { burnR: 130, burnDps: 0.9 } },
    { id: 'gaonengshexian', n: '高能射线', icon: '📡', img: 'assets/icon/sk_gaonengshexian.jpg', kind: 'active', el: '电', conflict: 'diancichuan', max: 10, cd: 5.0,
      desc: '高能射线贯穿，对高血量目标额外增伤', up: '每级 +伤害', mods: { rayMul: 2.0, rayPierce: 7 } },
    { id: 'hongzhaji', n: '轰炸机', icon: '✈️', img: 'assets/icon/sk_hongzhaji.jpg', kind: 'active', el: '火', max: 8, cd: 14.0,
      desc: '呼叫轰炸机对全场进行轰炸', up: '每级 +轰炸次数', mods: { bombN: 5, bombMul: 2.2 } },
    { id: 'bingbao', n: '冰暴发生器', icon: '🌨️', img: 'assets/icon/sk_bingbao.jpg', kind: 'active', el: '冰', conflict: 'ganbingdan', max: 8, cd: 11.0,
      desc: '引发冰暴，全场大幅减速并造成伤害', up: '每级 +伤害', mods: { stormR: 150, stormDps: 1.1 } },
    { id: 'fenliezidan', n: '分裂子弹', icon: '🎯', img: 'assets/icon/sk_fenliezidan.jpg', kind: 'passive', el: '物', max: 10, cd: 0,
      desc: '子弹命中后分裂成多枚', up: '每级 +分裂数', mods: { split: 2 } },
    { id: 'lianfa', n: '连发', icon: '🔫', img: 'assets/icon/sk_lianfa.jpg', kind: 'passive', el: '物', max: 10, cd: 0,
      desc: '提升射速', up: '每级 +15% 射速', mods: { rateMul: 0.15 } },
    { id: 'zidanbaozha', n: '子弹爆炸', icon: '💥', img: 'assets/icon/s_baozha.jpg', kind: 'passive', el: '火', max: 10, cd: 0,
      desc: '子弹命中触发小范围爆炸', up: '每级 +爆炸范围', mods: { explode: 0.45, er: 42 } },
    { id: 'zengshang', n: '子弹增伤', icon: '💪', img: 'assets/icon/s_shanghai.jpg', kind: 'passive', el: '物', max: 10, cd: 0,
      desc: '提升子弹伤害', up: '每级 +15% 伤害', mods: { dmgMul: 0.15 } },
    { id: 'chuantou', n: '穿透', icon: '➤', img: 'assets/icon/s_chuantou.jpg', kind: 'passive', el: '物', max: 10, cd: 0,
      desc: '子弹穿透更多目标', up: '每级 +1 穿透', mods: { pierce: 1 } },
    { id: 'baoji', n: '暴击强化', icon: '💥', img: 'assets/icon/s_baoji.jpg', kind: 'passive', el: '物', max: 10, cd: 0,
      desc: '提升暴击率与暴击伤害', up: '每级 +3% 暴击率', mods: { crit: 0.03 } },
    { id: 'xixue', n: '吸血', icon: '🩸', img: 'assets/icon/s_xixue.jpg', kind: 'passive', el: '物', max: 8, cd: 0,
      desc: '造成伤害时回复防线血量', up: '每级 +1.5% 吸血', mods: { healOnKill: 0.015 } },
  ],


  /* 【炮台表】局内用金币建造/升级，部署在防线前 */
  turrets: [
    { id: 'T_HB', n: '寒冰炮台', icon: '❄️', img: 'assets/icon/t_hb.jpg', img: 'assets/icon/t_hb.jpg', el: '冰', dmg: 14, rate: 1.0, rng: 150,
      cost: 120, upCost: 90, desc: '减速命中的僵尸' },
    { id: 'T_HY', n: '火焰炮台', icon: '🔥', img: 'assets/icon/t_hy.jpg', img: 'assets/icon/t_hy.jpg', el: '火', dmg: 22, rate: 0.9, rng: 140,
      cost: 150, upCost: 110, desc: '持续灼烧伤害' },
    { id: 'T_DC', n: '电磁炮台', icon: '⚡', img: 'assets/icon/t_dc.jpg', img: 'assets/icon/t_dc.jpg', el: '电', dmg: 18, rate: 1.3, rng: 165,
      cost: 180, upCost: 130, desc: '链式电击多个目标' },
    { id: 'T_JJ', n: '狙击炮台', icon: '🎯', img: 'assets/icon/t_jj.jpg', img: 'assets/icon/t_jj.jpg', el: '物', dmg: 55, rate: 0.5, rng: 210,
      cost: 220, upCost: 160, desc: '高单体伤害，优先攻击精英' },
  ],
  /* 炮台部署槽位（防线前 4 个位置，按屏幕比例） */
  turretSlots: [
    { k: 's1', x: 0.18, y: 0.62 }, { k: 's2', x: 0.40, y: 0.58 },
    { k: 's3', x: 0.60, y: 0.58 }, { k: 's4', x: 0.82, y: 0.62 },
  ],

  /* 【僵尸 Q 版头像】截图：好友/邮件/军团均为绿皮黄眼僵尸 */
  zAvatars: [
    'assets/char/z_suit.jpg',
    'assets/char/z_cap.jpg',
    'assets/char/z_pilot.jpg',
  ],

  /* 【宝石】截图：红=攻击 蓝=生命/暴击 绿 紫，可镶嵌到装备 */
  gems: [
    { id: 'G_R', n: '红宝石', c: 'r', icon: '🔴', img: 'assets/icon/gem_r.jpg', desc: '攻击 +6%（每级 +4%）' },
    { id: 'G_B', n: '蓝宝石', c: 'b', icon: '🔵', img: 'assets/icon/gem_b.jpg', desc: '生命 +8% · 暴击 +1%' },
    { id: 'G_G', n: '绿宝石', c: 'g', icon: '🟢', img: 'assets/icon/gem_g.jpg', desc: '生命 +5% · 吸血 +0.5%' },
    { id: 'G_P', n: '紫宝石', c: 'p', icon: '🟣', img: 'assets/icon/gem_p.jpg', desc: '暴击伤害 +8% · 攻速 +1.5%' },
  ],
  /* 【商店商品】截图：每日/武器/宝石/材料 三列网格 */
  shopGoods: {
    '每日': [
      { id: 'D1', n: '金币袋', icon: '🪙', img: 'assets/icon/d1_gold.jpg', price: 1000, cur: 'gold', give: { gold: 5000 } },
      { id: 'D2', n: '体力包', icon: '⚡', price: 50, cur: 'diamond', give: { stamina: 60 } },
      { id: 'D3', n: '宝箱', icon: '🎁', img: 'assets/icon/d3_box.jpg', price: 100, cur: 'diamond', give: { M01: 50, gold: 2000 } },
      { id: 'D4', n: '武器箱', icon: '🔫', price: 200, cur: 'diamond', give: { M02: 30 } },
      { id: 'D5', n: '宝石礼包', icon: '💎', price: 300, cur: 'diamond', give: { M03: 20 } },
      { id: 'D6', n: '招募令', icon: '📜', price: 150, cur: 'diamond', give: { M04: 10 } },
    ],
    '武器': [
      { id: 'W1', n: '突击步枪', icon: '🔫', img: 'assets/icon/w1_rifle.jpg', price: 3000, cur: 'gold', give: { M01: 20 } },
      { id: 'W2', n: '霰弹枪', icon: '💥', img: 'assets/icon/w2_shotgun.jpg', price: 5000, cur: 'gold', give: { M02: 15 } },
      { id: 'W3', n: '狙击枪', icon: '🎯', img: 'assets/icon/w3_sniper.jpg', price: 8000, cur: 'gold', give: { M03: 10 } },
    ],
    '宝石': [
      { id: 'GB1', n: '红宝石', icon: '🔴', price: 200, cur: 'diamond', give: { gem: 'G_R' } },
      { id: 'GB2', n: '蓝宝石', icon: '🔵', price: 200, cur: 'diamond', give: { gem: 'G_B' } },
      { id: 'GB3', n: '绿宝石', icon: '🟢', price: 200, cur: 'diamond', give: { gem: 'G_G' } },
      { id: 'GB4', n: '紫宝石', icon: '🟣', price: 300, cur: 'diamond', give: { gem: 'G_P' } },
    ],
    /* ===== 表35 礼包内容明细表 GP01~GP06 =====
     * limit: {t:'once'|'daily'|'weekly'|'monthly'|'level'|'bossFirst', v}
     * 单机无支付SDK，故用钻石计价，rmb 字段仅作价值展示 */
    '礼包': [
      { id: 'GP01', n: '新手礼包', icon: '🎁', img: 'assets/icon/gp01.jpg', price: 60, cur: 'diamond', rmb: '6元',
        give: { gold: 2000, M01: 50, M04: 10, P01: 3 },
        limit: { t: 'once', v: 1 }, desc: '金币2000+金属50+枪械碎片10+急救包3' },
      { id: 'GP02', n: '成长礼包', icon: '📦', img: 'assets/icon/gp02.jpg', price: 300, cur: 'diamond', rmb: '30元',
        give: { gold: 8000, M02: 30, diamond: 100 },
        limit: { t: 'level', v: 5 }, desc: '按等级分批解锁：金币/材料/钻石（每5关1次）' },
      { id: 'GP03', n: '每日特惠', icon: '💰', img: 'assets/icon/gp03.jpg', price: 10, cur: 'diamond', rmb: '1元',
        give: { gold: 500, M01: 10, diamond: 10 },
        limit: { t: 'daily', v: 1 }, desc: '金币500+金属10+钻石10 · 每日1次' },
      { id: 'GP04', n: '周礼包', icon: '🗓️', img: 'assets/icon/gp04.jpg', price: 300, cur: 'diamond', rmb: '30元',
        give: { M03: 10, chipE: 1, diamond: 200 },
        limit: { t: 'weekly', v: 1 }, desc: '稀有金属10+精英芯片1+钻石200 · 每周1次' },
      { id: 'GP05', n: '月度超值', icon: '👑', price: 680, cur: 'diamond', rmb: '68元',
        give: { chipL: 1, M03: 20, diamond: 800 },
        limit: { t: 'monthly', v: 1 }, desc: '传说芯片1+稀有金属20+钻石800 · 每月1次' },
      { id: 'GP06', n: 'BOSS首杀礼包', icon: '🏆', img: 'assets/icon/gp06.jpg', price: 0, cur: 'gold', rmb: '免费',
        give: { M03: 5, chipN: 1 },
        limit: { t: 'bossFirst', v: 1 }, desc: '击杀首个BOSS赠送 · 稀有金属5+芯片1' },
    ],
    /* ===== 表19 商城商品表 SH01~SH10（直购/月卡/战令/皮肤）=====
     * 单机无支付SDK：RMB 按 1元=10钻石 折算，用钻石结算
     * monthly=true 月卡（每日可领）；pass=true 战令（按等级领奖） */
    '直购': [
      { id: 'SH01', n: '新手礼包', icon: '🎁', price: 60, cur: 'diamond', rmb: '6元',
        give: { gold: 2000, M01: 50, P01: 10 }, limit: { t: 'once', v: 1 },
        desc: '金币2000+金属50+枪械碎片10 · 限购1' },
      { id: 'SH02', n: '钻石小包', icon: '💎', img: 'assets/icon/sh02_diamond.jpg', price: 60, cur: 'diamond', rmb: '6元',
        give: { diamond: 60 }, desc: '钻石 ×60' },
      { id: 'SH03', n: '钻石中包', icon: '💎', price: 300, cur: 'diamond', rmb: '30元',
        give: { diamond: 330 }, desc: '钻石 300 + 赠送 30' },
      { id: 'SH04', n: '钻石大包', icon: '💎', price: 980, cur: 'diamond', rmb: '98元',
        give: { diamond: 1150 }, desc: '钻石 1000 + 赠送 150' },
      { id: 'SH05', n: '月卡', icon: '📅', img: 'assets/icon/sh05_mcard.jpg', price: 300, cur: 'diamond', rmb: '30元',
        give: {}, monthly: true, limit: { t: 'monthly', v: 1 },
        desc: '每日领 钻石50 + 体力60（30天）' },
      { id: 'SH06', n: '战令(普通)', icon: '🎖️', img: 'assets/icon/sh06_pass.jpg', price: 0, cur: 'gold', rmb: '免费',
        give: {}, pass: 'normal', desc: '按等级免费领奖励' },
      { id: 'SH07', n: '战令(进阶)', icon: '🎖️', img: 'assets/icon/sh07_passpro.jpg', price: 680, cur: 'diamond', rmb: '68元',
        give: { diamond: 300 }, pass: 'adv', limit: { t: 'monthly', v: 1 },
        desc: '解锁高级奖励 + 限定皮肤' },
      { id: 'SH08', n: '废土战甲皮肤', icon: '🥼', price: 680, cur: 'diamond', rmb: '68元',
        give: { skin: 'sk_c01b' }, limit: { t: 'once', v: 1 },
        desc: '角色皮肤 · 废土战甲' },
      { id: 'SH09', n: '传说芯片包', icon: '📦', price: 980, cur: 'diamond', rmb: '98元',
        give: { chipL: 2, diamond: 200 }, limit: { t: 'once', v: 3 },
        desc: '传说芯片×2 + 钻石200 · 限购3' },
      { id: 'SH10', n: '资源礼包', icon: '📦', price: 300, cur: 'diamond', rmb: '30元',
        give: { M01: 100, M02: 50, M04: 50 }, desc: '金属100+合金50+火药50' },
    ],
    '材料': [
      { id: 'M1', n: '金属', icon: '🔩', price: 500, cur: 'gold', give: { M01: 30 } },
      { id: 'M2', n: '合金', icon: '⚙️', price: 1200, cur: 'gold', give: { M02: 20 } },
      { id: 'M3', n: '稀有晶体', icon: '💠', price: 3000, cur: 'gold', give: { M03: 10 } },
      { id: 'M4', n: '火药', icon: '🧨', price: 800, cur: 'gold', give: { M04: 15 } },
    ],
  },
  /* 【装备槽】截图：装备/宝石界面 */
  equipSlots: [
    { k: 'head', n: '头盔', icon: '🪖' },
    { k: 'cloth', n: '衣甲', icon: '🥋' },
    { k: 'weapon', n: '神兵', icon: '⚔️' },
    { k: 'ring', n: '首饰', icon: '💍' },
    { k: 'boot', n: '靴子', icon: '👢' },
    { k: 'fabao', n: '法器', icon: '🔮' },
    { k: 'neck', n: '项链', icon: '📿' },
    { k: 'brace', n: '护腕', icon: '🧤' },
  ],

  /* 【军团】社交：加入/自建/捐献 */
  legions: [
    { id: 'L01', n: '钢铁防线', icon: '🛡️', mem: 42, need: 0, desc: '老牌军团，气氛活跃' },
    { id: 'L02', n: '末日先锋', icon: '⚔️', mem: 38, need: 5000, desc: '主攻高难副本' },
    { id: 'L03', n: '废土游侠', icon: '🏹', mem: 25, need: 20000, desc: '休闲养老，福利好' },
    { id: 'L04', n: '雷霆战队', icon: '⚡', mem: 46, need: 50000, desc: '战力顶尖，赛季强队' },
  ],

  /* 【远征堡垒】消耗体力挑战 */
  expeds: [
    { id: 'E01', n: '尸潮围剿', icon: '🧟', cost: 10, need: 3000, gold: 800, mat: 5,
      desc: '成波次尸潮，产出金属与合金' },
    { id: 'E02', n: '精英猎杀', icon: '☠️', cost: 15, need: 8000, gold: 1500, mat: 8,
      desc: '精英僵尸，产出稀有晶体' },
    { id: 'E03', n: '母巢突袭', icon: '🕸️', cost: 20, need: 20000, gold: 3000, mat: 12,
      desc: '深入母巢，产出火药与电子元件' },
  ],
  /* 巡逻：每小时产出随章节提升 */
  patrolRateByCh: [16, 26, 40, 58, 80, 106, 136, 170, 208, 250],

  /* 【佣兵表】基地酒馆招募，战斗中协同作战 */
  mercs: [
    { id: 'M_SD', n: '霰弹枪士', icon: '🔫', img: 'assets/icon/m_sd.jpg', img: 'assets/icon/m_sd.jpg', dmg: 26, rate: 1.1, rng: 130, cost: 800,
      desc: '近距离扇形霰弹，清小怪快' },
    { id: 'M_JQ', n: '机枪大兵', icon: '⚙️', img: 'assets/icon/m_jq.jpg', img: 'assets/icon/m_jq.jpg', dmg: 15, rate: 3.0, rng: 150, cost: 1200,
      desc: '高射速持续压制' },
    { id: 'M_JZ', n: '精准狙击手', icon: '🎯', img: 'assets/icon/m_jz.jpg', img: 'assets/icon/m_jz.jpg', dmg: 90, rate: 0.45, rng: 240, cost: 1600,
      desc: '远程高伤，点杀精英' },
    { id: 'M_SJ', n: '哨箭达人', icon: '🏹', img: 'assets/icon/m_sj.jpg', img: 'assets/icon/m_sj.jpg', dmg: 34, rate: 1.6, rng: 180, cost: 1000,
      desc: '穿透箭矢，命中一排' },
  ],

  /* =====================================================
   * 【掉落表】资料 02 表第 8 项
   * =================================================== */
  drops: [
    { id: 'D01', item: 'R01', rate: 1.00, min: 8, max: 20, w: 60, from: '普通僵尸' },
    { id: 'D02', item: 'M01', rate: 0.35, min: 1, max: 3, w: 20, from: '普通/疾跑僵尸' },
    { id: 'D03', item: 'M04', rate: 0.18, min: 1, max: 2, w: 10, from: '自爆/炸弹僵尸' },
    { id: 'D04', item: 'M02', rate: 0.22, min: 1, max: 3, w: 12, from: '第2章起精英' },
    { id: 'D05', item: 'M03', rate: 0.10, min: 1, max: 2, w: 6, from: 'BOSS关' },
    { id: 'D06', item: 'P01', rate: 0.16, min: 1, max: 2, w: 14, from: '关卡/分解' },
    { id: 'D07', item: 'M05', rate: 0.12, min: 1, max: 2, w: 8, from: '商店/掉落' },
    { id: 'D08', item: 'chip', rate: 0.06, min: 1, max: 1, w: 4, from: 'BOSS关/活动' },
    { id: 'D09', item: 'I01', rate: 0.08, min: 1, max: 1, w: 5, from: '关卡/商店' },
    { id: 'D10', item: 'I03', rate: 0.05, min: 1, max: 1, w: 3, from: '商店/掉落' },
  ],
  /* 掉落权重池（按关卡章节取用） */
  /* =====================================================
   * 【31_掉落概率表】DR01~DR12：按怪物/来源的真实掉落
   * =================================================== */
  dropTable: [
    { id: 'DR01', src: '普通僵尸', item: 'M01', n: '金属', rate: 0.80, min: 1, max: 1, w: 80 },
    { id: 'DR02', src: '疾跑僵尸', item: 'M01', n: '金属', rate: 0.85, min: 1, max: 2, w: 85 },
    { id: 'DR03', src: '自爆僵尸', item: 'M04', n: '火药', rate: 0.60, min: 1, max: 1, w: 60 },
    { id: 'DR04', src: '吐液僵尸', item: 'M01', n: '金属', rate: 0.80, min: 2, max: 3, w: 80 },
    { id: 'DR05', src: '毒僵尸', item: 'M02', n: '合金', rate: 0.50, min: 1, max: 1, w: 50 },
    { id: 'DR06', src: '重甲僵尸', item: 'M02', n: '合金', rate: 0.60, min: 1, max: 2, w: 60 },
    { id: 'DR07', src: '炸弹僵尸', item: 'M04', n: '火药', rate: 0.70, min: 1, max: 2, w: 70 },
    { id: 'DR08', src: 'BOSS掉落', item: 'M03', n: '稀有金属', rate: 1.00, min: 3, max: 5, w: 100 },
    { id: 'DR09', src: 'BOSS掉落', item: 'C01', n: '普通芯片', rate: 0.60, min: 1, max: 1, w: 60 },
    { id: 'DR10', src: 'BOSS掉落', item: 'P01', n: '枪械碎片', rate: 0.50, min: 2, max: 4, w: 50 },
    { id: 'DR11', src: '宝箱开箱', item: 'M02', n: '合金', rate: 0.70, min: 3, max: 5, w: 70 },
    { id: 'DR12', src: '活动掉落', item: 'C02', n: '精英芯片', rate: 0.30, min: 1, max: 1, w: 30 },
  ],
  /* 按僵尸名取掉落（表31） */
  dropOf(zName) {
    return (this.dropTable || []).filter((d) => d.src === zName);
  },
  /* 按来源取掉落（BOSS掉落/宝箱开箱/活动掉落） */
  dropBySrc(src) {
    return (this.dropTable || []).filter((d) => d.src === src);
  },
  /* 执行一次掉落判定 */
  rollDrop(list) {
    const got = [];
    (list || []).forEach((d) => {
      if (Math.random() < d.rate) {
        const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
        if (n > 0) got.push({ item: d.item, n: n, name: d.n });
      }
    });
    return got;
  },

  dropPool(ch) {
    return this.drops.filter((d) => {
      if (d.from === 'BOSS关' || d.from === 'BOSS关/活动') return ch >= 1;
      if (d.from === '第2章起精英') return ch >= 2;
      if (d.from === '商店/掉落' || d.from === '关卡/商店') return true;
      return true;
    });
  },

  /* =====================================================
   * 【提示文本表】资料 02 表第 14 项（飘字/弹窗/系统/报错）
   * =================================================== */
  tips: {
    /* 飘字 */
    float: {
      crit: '暴击', miss: '闪避', block: '格挡',
      heal: '+{v}', dmg: '-{v}', gold: '+{v} 金币', xp: '+{v} 经验',
      lvup: '等级提升！', wallHit: '防线受损！',
      immune: '免疫', frozen: '冰冻', burn: '灼烧', poison: '中毒',
    },
    /* 弹窗 */
    popup: {
      noStamina: '体力不足，每 5 分钟恢复 1 点',
      noCoin: '金币不足',
      noDiamond: '钻石不足',
      lvLocked: '通关 {v} 后解锁',
      buyOk: '购买成功',
      adLimit: '今日广告次数已用完',
      reviveOk: '复活成功，继续战斗',
      quitConfirm: '退出将放弃本关奖励，确定退出？',
      clearConfirm: '确定清空全部存档？此操作不可恢复',
      resetConfirm: '确定重置该玩家数据？',
    },
    /* 系统提示 */
    sys: {
      saveOk: '存档已保存',
      saveFail: '存档失败，已保存到本地',
      offline: '当前离线模式，数据仅存本机',
      online: '已连接云端',
      netRetry: '正在重新连接…',
      reload: '换弹中…',
      waveIn: '第 {v} 波来袭',
      bossIn: '警告：BOSS 出现',
      newWave: '新一波尸潮接近',
    },
    /* 报错文本 */
    err: {
      netErr: '网络异常，请检查连接',
      dataErr: '数据读取失败，请重试',
      loadErr: '资源加载失败',
      opFail: '操作失败，请稍后重试',
      notFound: '未找到该玩家',
      nameErr: '昵称需 2-8 个字',
      dupName: '该代号已被占用',
    },
  },

  /* =====================================================
   * 【永久天赋表】资料 10 表：8 项
   * =================================================== */
  talents: [
    { id: 't_hp', n: '基地生命强化', icon: '❤️', max: 20, cost0: 500, costGrow: 1.35, unlock: 0,
      desc: '基地外永久生命 +5%', per: 0.05, stat: 'hp' },
    { id: 't_atk', n: '伤害强化天赋', icon: '⚔️', max: 20, cost0: 600, costGrow: 1.38, unlock: 0,
      desc: '全局伤害 +3%', per: 0.03, stat: 'atk' },
    { id: 't_gold', n: '金币加成', icon: '🪙', max: 20, cost0: 400, costGrow: 1.32, unlock: '1-1',
      desc: '金币获取 +5%', per: 0.05, stat: 'gold' },
    { id: 't_xp', n: '经验加成', icon: '📘', max: 20, cost0: 450, costGrow: 1.33, unlock: '1-1',
      desc: '经验获取 +5%', per: 0.05, stat: 'xp' },
    { id: 't_crit', n: '暴击天赋', icon: '🎯', max: 20, cost0: 700, costGrow: 1.40, unlock: '1-3',
      desc: '全局暴击率 +2%', per: 0.02, stat: 'crit' },
    { id: 't_ls', n: '吸血天赋', icon: '🩸', max: 15, cost0: 800, costGrow: 1.42, unlock: '1-3',
      desc: '全局吸血 +1%', per: 0.01, stat: 'ls' },
    { id: 't_armor', n: '护甲天赋', icon: '🛡️', max: 20, cost0: 650, costGrow: 1.39, unlock: '2-2',
      desc: '全局护甲 +3%', per: 0.03, stat: 'armor' },
    { id: 't_revive', n: '复活天赋', icon: '💚', max: 3, cost0: 5000, costGrow: 2.2, unlock: '2-3',
      desc: '每局限一次免费复活（每级 +1 次）', per: 1, stat: 'revive' },
  ],

  /* =====================================================
   * 【基地建筑】GD-010：医疗站/军械库/研究所/仓库
   * =================================================== */
  buildings: [
    { id: 'hospital', n: '医疗站', icon: '🏥', desc: '提升角色生命上限', stat: 'hp', per: 0.06,
      cost0: 800, grow: 1.45, max: 30 },
    { id: 'armory', n: '军械库', icon: '🔧', desc: '提升武器伤害', stat: 'atk', per: 0.05,
      cost0: 900, grow: 1.46, max: 30 },
    { id: 'lab', n: '研究所', icon: '🔬', desc: '提升经验获取', stat: 'xp', per: 0.04,
      cost0: 700, grow: 1.44, max: 30 },
    { id: 'warehouse', n: '仓库', icon: '📦', desc: '离线产出金币（每小时）', stat: 'gold', per: 1,
      cost0: 600, grow: 1.42, max: 30, offline: 120 },
  ],

  /* =====================================================
   * 【伤害公式】资料：10 条
   * =================================================== */
  formulas: [
    { n: '基础伤害', f: '武器伤害 × (1 + 攻击强化%)', note: '攻击强化来自天赋/药剂/技能' },
    { n: '暴击伤害', f: '基础伤害 × (1 + 暴击伤害%)', note: '触发暴击时放大' },
    { n: '最终伤害', f: '基础伤害 − 怪物护甲（最低 1）', note: '怪物护甲来自怪物表' },
    { n: '穿透', f: '基础伤害 × (1 − 目标剩余护甲%)', note: '穿透每级忽略 1 个目标护甲' },
    { n: '吸血', f: '回复生命 = 最终伤害 × 吸血%', note: '吸血来自技能/词条' },
    { n: '爆炸范围伤害', f: '中心伤害 × 距离衰减系数', note: '衰减 0.5~1.0' },
    { n: '怪物强度缩放', f: '怪物血量 = 基础血量 × 章节系数', note: '章节系数来自关卡表' },
    { n: '经验获取', f: '击杀经验 × (1 + 经验加成%)', note: '经验加成来自天赋' },
    { n: '攻速', f: '基础攻速 × (1 + 攻速强化%)', note: '攻击间隔缩短' },
    { n: '护盾吸收', f: '剩余伤害 = 伤害 − 护盾值', note: '护盾优先吸收' },
  ],

  /* =====================================================
   * 【成长曲线】资料
   * =================================================== */
  growth: [
    { n: '角色等级', way: '击杀经验升级', curve: '前期快后期慢（对数曲线）', key: '每 10 级解锁新技能槽' },
    { n: '武器等级', way: '金币升级', curve: '线性成长，每级 +固定伤害', key: '每 5 级进阶一次' },
    { n: '武器进阶', way: '进阶材料', curve: '跨越式提升，解锁词条', key: '白→绿→蓝→紫→橙' },
    { n: '怪物强度', way: '章节系数', curve: '每章节血量/攻击 ×1.2', key: '每章 BOSS 大幅提升' },
    { n: '关卡难度', way: '波次递增', curve: '同关卡内每波数量递增', key: 'BOSS 波封顶' },
    { n: '局内技能', way: '升级叠加', curve: '三选一，可叠加成长', key: '选同技能叠加增强' },
    { n: '永久天赋', way: '金币点选', curve: '点选型，越高阶越贵', key: '高阶需通关解锁' },
    { n: '芯片养成', way: '合成 + 洗练', curve: '品质越高词条越强', key: '传说芯片双词条' },
  ],

  /* =====================================================
   * 【新手引导】资料：12 节点
   * =================================================== */
  guides: [
    { id: 1, n: '移动引导', trig: '进入第一关', txt: '使用左下摇杆移动角色', way: '半透明手指指示', must: true },
    { id: 2, n: '射击引导', trig: '移动后', txt: '自动瞄准射击，怪物来袭', way: '箭头指向+文字', must: true },
    { id: 3, n: '升级引导', trig: '第一次升级', txt: '弹出技能三选一，选择一项', way: '高亮技能卡', must: true },
    { id: 4, n: '捡拾引导', trig: '击杀后', txt: '拾取掉落物', way: '光圈提示', must: true },
    { id: 5, n: '通关引导', trig: '第一次通关', txt: '进入结算界面，领取奖励', way: '高亮领取按钮', must: true },
    { id: 6, n: '基地引导', trig: '返回基地', txt: '点出击按钮进入下一关', way: '箭头指向', must: true },
    { id: 7, n: '武器引导', trig: '通关1-2', txt: '进入武器库，升级武器', way: '高亮升级按钮', must: false },
    { id: 8, n: '任务引导', trig: '通关1-2', txt: '进入任务界面，领取每日奖励', way: '高亮任务', must: false },
    { id: 9, n: '芯片引导', trig: '通关1-4', txt: '进入芯片界面，装配芯片', way: '高亮芯片槽', must: false },
    { id: 10, n: '天赋引导', trig: '通关1-3', txt: '进入天赋，点亮节点', way: '高亮天赋节点', must: false },
    { id: 11, n: '无尽引导', trig: '通关3-3', txt: '开启无尽模式', way: '弹窗说明', must: false },
    { id: 12, n: '广告引导', trig: '首次失败', txt: '看广告复活', way: '失败弹窗高亮', must: false },
  ],

  /* =====================================================
   * 【广告位】资料：7 个
   * =================================================== */
  ads: [
    { id: 'AD01', pos: '失败复活', type: '激励视频', trig: '战斗失败时', limit: 10, rw: '原地复活 1 次' },
    { id: 'AD02', pos: '双倍奖励', type: '激励视频', trig: '通关结算后', limit: 10, rw: '通关奖励 ×2' },
    { id: 'AD03', pos: '免费体力', type: '激励视频', trig: '体力不足时', limit: 5, rw: '体力 +10' },
    { id: 'AD04', pos: '免费抽奖', type: '激励视频', trig: '基地抽奖入口', limit: 3, rw: '免费抽奖 1 次' },
    { id: 'AD05', pos: '开箱', type: '激励视频', trig: '活动/宝箱', limit: 5, rw: '额外宝箱' },
    { id: 'AD06', pos: '插屏广告', type: '插屏', trig: '关卡切换/回基地', limit: 0, rw: '—' },
    { id: 'AD07', pos: '横幅广告', type: '横幅', trig: '基地底部', limit: 0, rw: '—' },
  ],
  /* 体力：上限 100，每 5 分钟 +1 */
  STAMINA_MAX: 100,
  STAMINA_MS: 300000,

  /* 货币图标 */
  curIcon: {
    gold: 'assets/icon/i_gold.jpg',
    diamond: 'assets/icon/i_diamond.jpg',
    frag: 'assets/icon/i_frag.jpg',
    stamina: 'assets/icon/i_stamina.jpg',
  },

  /* CG 过场（章节开场） */
  cgImg: {
    'cg01_horde': 'assets/cg/cg01_horde.jpg',
    'cg02_defense': 'assets/cg/cg02_defense.jpg',
    'cg03_rebuild': 'assets/cg/cg03_rebuild.jpg',
  },
  /* 章节 CG 对应 */
  chapterCg: { 1: 'cg01_horde', 4: 'cg02_defense', 7: 'cg03_rebuild', 10: 'cg02_defense' },

  /* 场景图映射 */
  sceneImg: {
    city: 'assets/scene/city.jpg', wasteland: 'assets/scene/wasteland.jpg',
    factory: 'assets/scene/factory.jpg', tunnel: 'assets/scene/tunnel.jpg',
    field: 'assets/scene/field.jpg', snow: 'assets/scene/snow.jpg',
  },

  /* 品质与元素 */
  qualities: ['白', '绿', '蓝', '紫', '橙', '红'],
  qColor: { '白': '#b9c4d4', '绿': '#5fd07a', '蓝': '#5cd8ff', '紫': '#c08cff', '橙': '#ffa53c', '红': '#ff4d6d' },
  elements: [
    { k: '火', c: '#ff7a3c' }, { k: '冰', c: '#5cd8ff' },
    { k: '电', c: '#c08cff' }, { k: '风', c: '#7be8a0' }, { k: '物', c: '#ffd76a' },
  ],
};

window.EX = EX;
window.CFG = CFG;
