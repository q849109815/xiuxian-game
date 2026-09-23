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
    { id: 'C01', n: '幸存者-杰克', icon: '🧑‍🚀', hp: 1000, spd: 6.0, armor: 0, crit: 0.05,
      unlockLv: 0, unlockTxt: '初始解锁', desc: '均衡型先锋官，无短板' },
    { id: 'C02', n: '医疗兵-艾拉', icon: '👩‍⚕️', hp: 900, spd: 6.5, armor: 5, crit: 0.05,
      unlockLv: '1-3', unlockTxt: '通关 1-3 解锁', desc: '高移速轻护甲，灵活游走' },
    { id: 'C03', n: '重装兵-雷', icon: '🧑‍🏭', hp: 1200, spd: 5.0, armor: 15, crit: 0.03,
      unlockLv: '2-3', unlockTxt: '通关 2-3 解锁', desc: '厚血高护甲，正面硬扛' },
    { id: 'C04', n: '狙击手-妮可', icon: '🕵️‍♀️', hp: 850, spd: 6.0, armor: 3, crit: 0.08,
      unlockLv: '3-3', unlockTxt: '通关 3-3 解锁', desc: '高暴击脆皮，爆发输出' },
  ],
  /* 【皮肤表】每个角色 2 款，第二款用钻石解锁 */
  skins: [
    { id: 'sk_c01a', char: 'C01', n: '默认', icon: '🧑‍🚀', price: 0, bonus: null, desc: '初始外观' },
    { id: 'sk_c01b', char: 'C01', n: '废土战甲', icon: '🥼', price: 680, bonus: { hp: 0.10 }, desc: '生命 +10%' },
    { id: 'sk_c02a', char: 'C02', n: '默认', icon: '👩‍⚕️', price: 0, bonus: null, desc: '初始外观' },
    { id: 'sk_c02b', char: 'C02', n: '战术套装', icon: '🥻', price: 680, bonus: { spd: 0.10 }, desc: '移速 +10%' },
    { id: 'sk_c03a', char: 'C03', n: '默认', icon: '🧑‍🏭', price: 0, bonus: null, desc: '初始外观' },
    { id: 'sk_c03b', char: 'C03', n: '装甲骑士', icon: '🦺', price: 680, bonus: { armor: 0.20 }, desc: '护甲 +20%' },
    { id: 'sk_c04a', char: 'C04', n: '默认', icon: '🕵️‍♀️', price: 0, bonus: null, desc: '初始外观' },
    { id: 'sk_c04b', char: 'C04', n: '暗夜', icon: '🥷', price: 680, bonus: { crit: 0.10 }, desc: '暴击 +10%' },
  ],

  /* =====================================================
   * 【武器表】资料：10 把（主武器 6 + 副武器 4）
   * dmg 基础伤害 / rate 射速(发每秒) / mag 弹夹 / reload 换弹秒
   * pellets 弹丸数（散弹枪 5）/ pierce 穿透
   * =================================================== */
  guns: [
    { id: 'W01', n: '突击步枪', kind: '主', type: '自动', dmg: 25, rate: 8, mag: 30, reload: 1.8,
      bullet: '普通弹', pierce: 0, pellets: 1, icon: '🔫', q: '白', unlockLv: 0 },
    { id: 'W02', n: '散弹枪', kind: '主', type: '散弹', dmg: 70, rate: 1.6, mag: 6, reload: 2.4,
      bullet: '散弹', pierce: 0, pellets: 5, icon: '💥', q: '绿', unlockLv: '1-2' },
    { id: 'W03', n: '榴弹枪', kind: '主', type: '爆炸', dmg: 120, rate: 0.8, mag: 3, reload: 3.0,
      bullet: '爆炸弹', pierce: 0, pellets: 1, explode: 0.6, er: 62, icon: '🎇', q: '绿', unlockLv: '1-4' },
    { id: 'W04', n: '狙击枪', kind: '主', type: '狙击', dmg: 260, rate: 0.7, mag: 5, reload: 2.8,
      bullet: '穿甲弹', pierce: 2, pellets: 1, icon: '🎯', q: '蓝', unlockLv: '2-2' },
    { id: 'W05', n: '冲锋枪', kind: '主', type: '自动', dmg: 12, rate: 14, mag: 45, reload: 1.5,
      bullet: '普通弹', pierce: 0, pellets: 1, icon: '🔦', q: '绿', unlockLv: '2-1' },
    { id: 'W06', n: '加特林', kind: '主', type: '重机枪', dmg: 20, rate: 16, mag: 120, reload: 4.0,
      bullet: '普通弹', pierce: 0, pellets: 1, icon: '⚙️', q: '紫', unlockLv: '3-1' },
    { id: 'S01', n: '手雷', kind: '副', type: '投掷', dmg: 150, rate: 0.6, mag: 2, reload: 2.0,
      bullet: '爆炸弹', pierce: 0, pellets: 1, explode: 0.8, er: 78, icon: '🧨', q: '蓝', unlockLv: '1-3' },
    { id: 'S02', n: '燃烧瓶', kind: '副', type: '投掷', dmg: 80, rate: 0.6, mag: 2, reload: 2.0,
      bullet: '燃烧弹', pierce: 0, pellets: 1, burn: 0.7, icon: '🔥', q: '蓝', unlockLv: '2-2' },
    { id: 'S03', n: '地雷', kind: '副', type: '布置', dmg: 200, rate: 0.3, mag: 3, reload: 3.0,
      bullet: '爆炸弹', pierce: 0, pellets: 1, explode: 1.0, er: 70, icon: '💣', q: '紫', unlockLv: '3-2' },
    { id: 'S04', n: '电击棒', kind: '副', type: '近战', dmg: 90, rate: 1.2, mag: 1, reload: 0.5,
      bullet: '近战', pierce: 0, pellets: 1, icon: '⚡', q: '绿', unlockLv: '2-3' },
  ],
  /* 武器进阶：每 5 级进阶一次，品质 白→绿→蓝→紫→橙 */
  gunAdvance: [
    { q: '白', lv: 1, slot: 0 }, { q: '绿', lv: 5, slot: 1 }, { q: '蓝', lv: 10, slot: 2 },
    { q: '紫', lv: 15, slot: 3 }, { q: '橙', lv: 20, slot: 4 },
  ],
  /* 词条池（进阶解锁词条槽） */
  gunStats: [
    { k: 'dmg', n: '伤害', unit: '%', base: 0.06 },
    { k: 'rate', n: '射速', unit: '%', base: 0.05 },
    { k: 'mag', n: '弹夹容量', unit: '', base: 3 },
    { k: 'pierce', n: '穿透', unit: '', base: 0.34 },
    { k: 'crit', n: '暴击率', unit: '%', base: 0.02 },
  ],

  /* =====================================================
   * 【关卡表】资料：3 章 10 关 + 无尽 + 活动
   * waves 总波次 / pool 怪物 / per 每波数量[min,max] / mul 强度系数
   * cond 通关条件 / rw 通关奖励 / unlock 解锁条件
   * =================================================== */
  levels: [
    { id: '1-1', ch: 1, n: '废弃街道', waves: 3, pool: ['putong'], per: [10, 15], mul: 1.0,
      cond: 'clear', rw: { gold: 200, M01: 10 }, unlock: null, scene: 'city' },
    { id: '1-2', ch: 1, n: '停车场', waves: 4, pool: ['putong', 'jipao'], per: [12, 18], mul: 1.1,
      cond: 'clear', rw: { gold: 300, M01: 15 }, unlock: '1-1', scene: 'city' },
    { id: '1-3', ch: 1, n: '废墟大楼', waves: 4, pool: ['putong', 'jipao', 'zibao'], per: [15, 20], mul: 1.2,
      cond: 'clear', rw: { gold: 400, P01: 3 }, unlock: '1-2', scene: 'wasteland' },
    { id: '1-4', ch: 1, n: 'BOSS关-天台', waves: 5, pool: ['putong', 'jipao', 'zibao'], per: [12, 18], mul: 1.3,
      cond: 'boss', boss: 'juxing', rw: { gold: 500, chip: 1 }, unlock: '1-3', scene: 'wasteland' },
    { id: '2-1', ch: 2, n: '地下实验室', waves: 4, pool: ['du', 'tuye', 'putong'], per: [15, 22], mul: 1.5,
      cond: 'clear', rw: { gold: 500, M01: 20 }, unlock: '1-4', scene: 'tunnel' },
    { id: '2-2', ch: 2, n: '废弃医院', waves: 5, pool: ['du', 'dun', 'jipao'], per: [18, 25], mul: 1.6,
      cond: 'clear', rw: { gold: 600, M02: 10 }, unlock: '2-1', scene: 'tunnel' },
    { id: '2-3', ch: 2, n: 'BOSS关-母体', waves: 6, pool: ['du', 'tuye', 'jipao', 'putong'], per: [18, 25], mul: 1.8,
      cond: 'boss', boss: 'mama', rw: { gold: 800, chip: 2 }, unlock: '2-2', scene: 'factory' },
    { id: '3-1', ch: 3, n: '城市中心', waves: 5, pool: ['feixing', 'fenlie', 'putong'], per: [20, 30], mul: 2.0,
      cond: 'clear', rw: { gold: 800, M03: 8 }, unlock: '2-3', scene: 'city' },
    { id: '3-2', ch: 3, n: '桥梁防线', waves: 6, pool: ['putong', 'jipao', 'zhadan', 'fenlie'], per: [22, 32], mul: 2.2,
      cond: 'clear', rw: { gold: 900, M03: 5 }, unlock: '3-1', scene: 'field' },
    { id: '3-3', ch: 3, n: 'BOSS关-巨型母体', waves: 7, pool: ['putong', 'jipao', 'zhongjia', 'feixing', 'zhadan'], per: [22, 32], mul: 2.5,
      cond: 'bossAll', boss: ['juxing', 'mama'], rw: { gold: 1200, chip: 3 }, unlock: '3-2', scene: 'snow' },
  ],
  chapters: [
    { id: 1, n: '第一章 · 街区沦陷', icon: '🏙️' },
    { id: 2, n: '第二章 · 地下设施', icon: '🚇' },
    { id: 3, n: '第三章 · 城市核心', icon: '🌉' },
  ],
  /* 无尽模式：通关 3-3 解锁 */
  ENDLESS_UNLOCK: '3-3',

  /* =====================================================
   * 【物品表】资料：15 项
   * =================================================== */
  items: [
    { id: 'R01', n: '金币', type: '货币', q: '白', icon: '🪙', stack: 999999, src: '关卡/任务' },
    { id: 'R02', n: '钻石', type: '货币', q: '紫', icon: '💎', stack: 999999, src: '充值/活动' },
    { id: 'M01', n: '金属', type: '材料', q: '白', icon: '🔩', stack: 9999, src: '关卡掉落' },
    { id: 'M02', n: '合金', type: '材料', q: '蓝', icon: '⚙️', stack: 9999, src: '高章节掉落' },
    { id: 'M03', n: '稀有金属', type: '材料', q: '紫', icon: '💠', stack: 9999, src: 'BOSS关' },
    { id: 'M04', n: '火药', type: '材料', q: '白', icon: '🧪', stack: 9999, src: '关卡/分解' },
    { id: 'M05', n: '电子元件', type: '材料', q: '蓝', icon: '🔌', stack: 9999, src: '商店/掉落' },
    { id: 'P01', n: '枪械碎片', type: '碎片', q: '蓝', icon: '🧩', stack: 9999, src: '关卡/分解' },
    { id: 'P02', n: '角色碎片', type: '碎片', q: '紫', icon: '👤', stack: 9999, src: '活动/抽奖' },
    { id: 'C01', n: '普通芯片', type: '芯片', q: '白', icon: '🔲', stack: 999, src: 'BOSS关' },
    { id: 'C02', n: '精英芯片', type: '芯片', q: '蓝', icon: '🔳', stack: 999, src: '活动/合成' },
    { id: 'C03', n: '传说芯片', type: '芯片', q: '红', icon: '💎', stack: 999, src: '合成/活动' },
    { id: 'I01', n: '急救包', type: '消耗', q: '白', icon: '🧰', stack: 99, src: '关卡/商店', use: '恢复生命50%' },
    { id: 'I02', n: '护盾发生器', type: '消耗', q: '蓝', icon: '🛡️', stack: 99, src: '商店/任务', use: '获得护盾' },
    { id: 'I03', n: '攻击增幅药剂', type: '消耗', q: '蓝', icon: '💉', stack: 99, src: '商店/掉落', use: '攻击+30%持续30秒' },
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
    { id: 'putong', n: '普通僵尸', icon: '🧟', hp: 30, spd: 34, dmg: 8, atkR: 26, ai: 'chase',
      skill: '扑咬', sk: '近战伤害，靠近玩家撕咬', xp: 4, gold: 3 },
    { id: 'jipao', n: '疾跑僵尸', icon: '🏃', hp: 22, spd: 78, dmg: 14, atkR: 24, ai: 'rush',
      skill: '冲刺', sk: '高速冲向玩家，接触造成高伤害', xp: 6, gold: 4 },
    { id: 'zhongjia', n: '重甲僵尸', icon: '🥋', hp: 180, spd: 26, dmg: 18, atkR: 28, ai: 'chase',
      skill: '护甲', sk: '减伤高，需穿透/爆炸破甲', def: 0.55, xp: 14, gold: 12, elite: true },
    { id: 'zibao', n: '自爆僵尸', icon: '💣', hp: 45, spd: 62, dmg: 34, atkR: 30, ai: 'boomer',
      skill: '自爆', sk: '接近后自爆，范围伤害，死亡解体', xp: 10, gold: 8 },
    { id: 'du', n: '毒僵尸', icon: '☠️', hp: 90, spd: 34, dmg: 10, atkR: 120, ai: 'ranged',
      skill: '毒雾', sk: '喷洒毒雾，玩家中毒持续掉血', poison: 6, xp: 13, gold: 10, elite: true },
    { id: 'tuye', n: '吐液僵尸', icon: '🤮', hp: 70, spd: 30, dmg: 12, atkR: 150, ai: 'ranged',
      skill: '腐蚀液', sk: '远程喷吐，落地区域持续伤害', pool: 5, xp: 12, gold: 9 },
    { id: 'zhadan', n: '炸弹僵尸', icon: '🧨', hp: 55, spd: 44, dmg: 26, atkR: 28, ai: 'boomer',
      skill: '死亡爆炸', sk: '死亡时爆炸范围伤害，可引爆油桶', xp: 11, gold: 9 },
    { id: 'dun', n: '护盾僵尸', icon: '🔰', hp: 130, spd: 32, dmg: 16, atkR: 26, ai: 'chase',
      skill: '能量护盾', sk: '正面免疫伤害，需绕后或破盾', front: 0.85, xp: 16, gold: 13, elite: true },
    { id: 'fenlie', n: '分裂僵尸', icon: '🪱', hp: 85, spd: 36, dmg: 12, atkR: 26, ai: 'chase',
      skill: '分裂', sk: '死亡分裂成 2 个小僵尸', split: 2, xp: 12, gold: 10 },
    { id: 'feixing', n: '飞行僵尸', icon: '🦅', hp: 60, spd: 58, dmg: 15, atkR: 30, ai: 'chase',
      skill: '飞行', sk: '越过地面障碍，空中移动', fly: true, xp: 13, gold: 11 },
    { id: 'jinying', n: '精英僵尸', icon: '👹', hp: 320, spd: 40, dmg: 26, atkR: 30, ai: 'chase',
      skill: '强化体魄', sk: '高血量高伤害的精英单位', def: 0.3, xp: 30, gold: 26, elite: true },
    { id: 'xiaozombie', n: '小僵尸', icon: '🐛', hp: 12, spd: 50, dmg: 5, atkR: 20, ai: 'chase',
      skill: '扑咬', sk: '分裂产生的小体型僵尸', xp: 2, gold: 1 },
  ],
  /* BOSS */
  bosses: [
    { id: 'juxing', n: '巨型丧尸', icon: '🦖', hp: 2600, spd: 22, dmg: 40, atkR: 46, def: 0.25,
      phases: 2, xp: 220, gold: 260,
      skills: [
        { n: '巨爪拍击', sk: '大范围近战，击退玩家', trig: 'contact' },
        { n: '召唤小怪', sk: '召唤普通僵尸群助战', trig: 0.7 },
        { n: '召唤小怪', sk: '再次召唤僵尸群', trig: 0.4 },
      ] },
    { id: 'mama', n: '感染母体', icon: '🕷️', hp: 3400, spd: 26, dmg: 34, atkR: 150, def: 0.2,
      phases: 3, xp: 320, gold: 380,
      skills: [
        { n: '孢子喷吐', sk: '喷出感染孢子，落地分裂小怪', trig: 0.8 },
        { n: '狂暴', sk: '进入狂暴，攻速移速提升', trig: 0.5 },
        { n: '阶段切换', sk: '血量阈值触发新技能，全屏警告', trig: 0.3 },
      ] },
  ],
  bossCommon: [
    { n: '阶段切换', sk: '血量 70% / 40% 触发新技能，全屏警告' },
    { n: '狂暴免疫', sk: '狂暴阶段免疫控制，伤害提升' },
  ],

  /* =====================================================
   * 【局内技能表】资料 10 表：12 项
   * =================================================== */
  skills: [
    { id: 'duochong', n: '多重射击', icon: '🎯', kind: 'gun', el: '物', max: 10, conflict: null,
      desc: '额外发射 1 颗子弹', up: '每级 +1 颗子弹', mods: { spread: 1 } },
    { id: 'chantou', n: '穿透强化', icon: '➤', kind: 'gun', el: '物', max: 10, conflict: null,
      desc: '子弹穿透 +1 个目标', up: '每级 +1 穿透', mods: { pierce: 1 } },
    { id: 'shanghai', n: '伤害强化', icon: '💪', kind: 'passive', el: '物', max: 10, conflict: null,
      desc: '伤害 +15%', up: '每级 +15%', mods: { dmgMul: 0.15 } },
    { id: 'gongsu', n: '攻速强化', icon: '⚡', kind: 'passive', el: '物', max: 10, conflict: null,
      desc: '攻击速度 +15%', up: '每级 +15%', mods: { rateMul: 0.15 } },
    { id: 'baoji', n: '暴击强化', icon: '✨', kind: 'passive', el: '物', max: 10, conflict: null,
      desc: '暴击率 +10%、暴击伤害 +20%', up: '每级叠加', mods: { crit: 0.10, critDmg: 0.20 } },
    { id: 'xixue', n: '吸血', icon: '🩸', kind: 'passive', el: '物', max: 10, conflict: null,
      desc: '击杀回复生命', up: '每级提升回复量', mods: { healOnKill: 6 } },
    { id: 'shandian', n: '闪电链', icon: '⚡', kind: 'proc', el: '电', max: 10, conflict: 'huohuan',
      desc: '子弹命中后概率触发闪电，连锁 3 个目标', up: '每级 +1 连锁', mods: { chain: 0.18, chainN: 3 } },
    { id: 'huohuan', n: '火环', icon: '🔥', kind: 'aura', el: '火', max: 10, conflict: 'shandian',
      desc: '角色周围火圈持续灼烧，击退近身怪', up: '每级提升范围与伤害', mods: { auraR: 62, auraDps: 0.55, knock: 1 } },
    { id: 'binghuan', n: '冰霜新星', icon: '❄️', kind: 'aura', el: '冰', max: 8, conflict: null,
      desc: '定期释放冰环，减速并冰冻范围内怪', up: '每级提升范围与控制时长', mods: { novaR: 90, novaSlow: 0.5, novaCd: 3.2 } },
    { id: 'baozha', n: '爆炸子弹', icon: '💥', kind: 'proc', el: '火', max: 10, conflict: null,
      desc: '子弹命中后爆炸，造成范围伤害', up: '每级提升爆炸范围', mods: { explode: 0.45, er: 46 } },
    { id: 'hudun', n: '护盾', icon: '🛡️', kind: 'passive', el: '物', max: 10, conflict: null,
      desc: '获得护盾吸收伤害', up: '每级 +护盾值', mods: { shield: 120 } },
    { id: 'yisu', n: '移速强化', icon: '👟', kind: 'passive', el: '风', max: 10, conflict: null,
      desc: '移动速度 +10%', up: '每级 +10%', mods: { moveMul: 0.10 } },
  ],

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
