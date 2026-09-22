/* =========================================================
 * config.js —— 资料加载与查询（《星海飞驰》22表全部数据）
 * ========================================================= */

const CFG = {
  core: null,      // 02境界 03任务 04副本 05怪物 06物品 07功法 08灵宠 09伙伴 20剧情
  meta: null,      // 22玩法指南 23界面 15特效 14场景
  ex: null,        // 扩展数值（本文件内定义）

  async load() {
    const [core, meta] = await Promise.all([
      fetch('data/config/core.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('data/config/meta.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]);
    this.core = core || { realms: [], quests: [], dungeons: [], monsters: [], items: [], skills: [], pets: [], partners: [], story: [] };
    this.meta = meta || { guides: [], uis: [], fx: [], scenes: [] };
    this.ex = EX_DATA;
    return !!core;
  },

  /* ---- 查询器 ---- */
  realm(i) { return (this.core.realms || [])[i] || { id: 'J001', name: '练气期', stage: '', life: '', bonus: {}, breakCond: '', unlock: '' }; },
  get realmCount() { return (this.core.realms || []).length; },
  realmName(i) { return this.realm(i).name; },
  mainQuests() { return (this.core.quests || []).filter((q) => q.type === '主线'); },
  sideQuests() { return (this.core.quests || []).filter((q) => q.type === '支线'); },
  bountyQuests() { return (this.core.quests || []).filter((q) => q.type === '悬赏'); },
  questById(id) { return (this.core.quests || []).find((q) => q.id === id); },
  itemById(id) { return (this.core.items || []).find((x) => x.id === id); },
  itemByName(n) { return (this.core.items || []).find((x) => x.name === n); },
  skillById(id) { return (this.core.skills || []).find((x) => x.id === id); },
  petById(id) { return (this.core.pets || []).find((x) => x.id === id); },
  partnerById(id) { return (this.core.partners || []).find((x) => x.id === id); },
  monsterById(id) { return (this.core.monsters || []).find((x) => x.id === id); },
  dungeonById(id) { return (this.core.dungeons || []).find((x) => x.id === id); },
  wildMonsters() { return (this.core.monsters || []).filter((m) => m.id.startsWith('W')); },
  bossMonsters() { return (this.core.monsters || []).filter((m) => m.id.startsWith('B')); },
  /** 按境界过滤可打的野怪 */
  wildByRealm(realm) {
    const all = this.wildMonsters();
    if (!all.length) return [];
    const idx = Math.min(realm, 12);
    const lvMap = ['练气', '练气', '筑基', '筑基', '筑基', '结丹', '结丹', '结丹', '结丹', '元婴', '元婴', '元婴', '元婴', '化神', '化神'];
    const cur = lvMap[Math.min(realm, 14)];
    const order = ['练气', '筑基', '结丹', '元婴', '化神'];
    const ci = order.indexOf(cur);
    const pool = all.filter((m) => {
      const mi = order.findIndex((o) => (m.lv || '').indexOf(o) >= 0);
      return mi >= 0 && mi <= ci;
    });
    return pool.length ? pool : all.slice(0, 4);
  },
};

/* =========================================================
 * 扩展数值（资料表中未给具体数值，按修仙页游惯例补齐）
 * ========================================================= */
const EX_DATA = {
  /* 五行克制：金克木克土克水克火（资料 22_玩法操作指南 第16条） */
  wuxing: ['金', '木', '土', '水', '火'],
  counter: { '金': '木', '木': '土', '土': '水', '水': '火', '火': '金' },
  wuxingColor: { '金': '#ffd06a', '木': '#5fd07a', '土': '#c89a5a', '水': '#5ce8ff', '火': '#ff5c7a' },

  /* 灵根：影响五行属性与功法适配 */
  roots: [
    { k: '金', n: '金灵根', c: '#ffd06a', desc: '锐金之气，剑修绝佳，攻击成长高' },
    { k: '木', n: '木灵根', c: '#5fd07a', desc: '生生不息，炼丹加成，续航强' },
    { k: '水', n: '水灵根', c: '#5ce8ff', desc: '上善若水，神识与灵力成长高' },
    { k: '火', n: '火灵根', c: '#ff5c7a', desc: '烈焰焚天，爆发高，炼器加成' },
    { k: '土', n: '土灵根', c: '#c89a5a', desc: '厚德载物，防御与气血成长高' },
    { k: '杂', n: '杂灵根', c: '#9aa8cc', desc: '五行驳杂，成长均衡但无专长' },
  ],

  /* 性别与形象 */
  genders: [
    { k: 'm', n: '男修', icons: ['🧙', '🧝‍♂️', '🧛‍♂️', '🕵️‍♂️', '🥷', '🧟‍♂️'] },
    { k: 'f', n: '女修', icons: ['🧙‍♀️', '🧝‍♀️', '🧛‍♀️', '🕵️‍♀️', '🥷‍♀️', '🧚‍♀️'] },
  ],

  /* 每境界修为需求（按页游成长曲线） */
  expNeed: (realm, layer) => {
    const base = [120, 400, 900, 1800, 3200, 6000, 11000, 19000, 32000, 55000,
      90000, 150000, 240000, 400000, 660000];
    const b = base[Math.min(realm, 14)] || 100000;
    return Math.round(b * (1 + (layer || 0) * 0.28));
  },
  /** 每层：练气13层，其余4层（初/中/后/巅峰） */
  layerCount: (realm) => (realm === 0 ? 13 : 4),
  layerName: (realm, layer) => {
    if (realm === 0) return (layer + 1) + '层';
    return ['初期', '中期', '后期', '巅峰'][Math.min(layer, 3)];
  },

  /* 挂机修为（每分钟） */
  expPerMin: (realm) => {
    const m = [6, 14, 30, 62, 130, 270, 560, 1150, 2400, 5000, 10500, 22000, 46000, 96000, 200000];
    return m[Math.min(realm, 14)] || 300000;
  },
  /* 挂机灵石（每分钟） */
  stonePerMin: (realm) => Math.round((EX_DATA.expPerMin(realm) / 12) + 2),

  /* 品质 */
  qualities: [
    { n: '凡品', c: '#8a8a8a', mul: 1 },
    { n: '下品', c: '#5fd07a', mul: 1.4 },
    { n: '中品', c: '#4aa8ff', mul: 2 },
    { n: '上品', c: '#c07bff', mul: 3 },
    { n: '极品', c: '#ffa030', mul: 4.6 },
    { n: '仙品', c: '#ff4d6d', mul: 7 },
  ],
  qIndex: (s) => {
    const i = ['凡品', '下品', '中品', '上品', '极品', '仙品'].indexOf(s);
    return i < 0 ? 0 : i;
  },

  /* 基础属性（1级） */
  baseAttr: { hp: 500, mp: 200, atk: 50, def: 25, sense: 30, speed: 10, crit: 0.05, dodge: 0.03, hit: 0.9 },

  /* 境界属性倍率（每大境界叠加） */
  realmMul: (realm) => Math.pow(1.85, realm),

  /* 装备部位（参考图31：神兵/首饰/时装/法器） */
  slots: [
    { k: 'weapon', n: '神兵', icon: '⚔️' },
    { k: 'armor', n: '仙霓神衣', icon: '🥋' },
    { k: 'helm', n: '神识', icon: '🪖' },
    { k: 'ring', n: '首饰', icon: '💍' },
    { k: 'boot', n: '御宠', icon: '👢' },
    { k: 'treasure', n: '法器', icon: '🔮' },
  ],

  /* 战斗神通技能（1-4 槽位） */
  skills: [
    { id: 'S1', n: '青元剑诀', w: '金', cost: 30, cd: 4, mul: 2.2, desc: '剑气纵横，金属性单体伤害' },
    { id: 'S2', n: '大衍决', w: '水', cost: 40, cd: 6, mul: 2.8, desc: '神识冲击，水属性伤害并降低敌方命中' },
    { id: 'S3', n: '三转重元功', w: '土', cost: 50, cd: 8, mul: 3.4, desc: '法力压缩爆发，土属性高伤' },
    { id: 'S4', n: '炼神术', w: '火', cost: 70, cd: 12, mul: 4.6, desc: '神魂灼烧，火属性爆发伤害' },
  ],

  /* 称号（参考图29） */
  titles: [
    { id: 'T01', n: '天选之子', buff: { all: 0.05 }, cond: '创建角色获得', from: '初始' },
    { id: 'T02', n: '至尊欧皇', buff: { crit: 0.08 }, cond: '奇遇触发 10 次', from: '成就' },
    { id: 'T03', n: '镇狱伏魔', buff: { atk: 0.1 }, cond: '击杀妖兽 500 只', from: '成就' },
    { id: 'T04', n: '劫烬斩厄', buff: { atk: 0.15, hp: 0.1 }, cond: '渡劫成功 3 次', from: '赛季' },
    { id: 'T05', n: '天威破障', buff: { all: 0.12 }, cond: '境界达到元婴', from: '境界' },
    { id: 'T06', n: '星海独行', buff: { def: 0.12 }, cond: '完成第三篇主线', from: '剧情' },
    { id: 'T07', n: '虚天探秘', buff: { sense: 0.2 }, cond: '通关虚天殿', from: '活动' },
    { id: 'T08', n: '虫王统御', buff: { atk: 0.18 }, cond: '噬金虫进化为虫王', from: '灵宠' },
    { id: 'T09', n: '星宫战将', buff: { hp: 0.15, atk: 0.1 }, cond: '星宫战场通关', from: '跨服' },
    { id: 'T10', n: '乱星海尊', buff: { all: 0.25 }, cond: '战力达到 100000', from: '跨服' },
  ],

  /* 头像（参考图30） */
  avatars: [
    { id: 'a1', n: '青衫剑修', icon: '🧙', need: 0 },
    { id: 'a2', n: '白衣书生', icon: '🧝‍♂️', need: 1 },
    { id: 'a3', n: '玄衣魔修', icon: '🧛‍♂️', need: 2 },
    { id: 'a4', n: '素女道姑', icon: '🧙‍♀️', need: 1 },
    { id: 'a5', n: '紫灵仙子', icon: '🧚‍♀️', need: 3 },
    { id: 'a6', n: '星宫修士', icon: '🕵️‍♂️', need: 4 },
    { id: 'a7', n: '海盗头目', icon: '🥷', need: 3 },
    { id: 'a8', n: '结丹道人', icon: '🧝‍♀️', need: 5 },
    { id: 'a9', n: '元婴老祖', icon: '🧟‍♂️', need: 6 },
    { id: 'a10', n: '化神尊者', icon: '🧚‍♀️', need: 7 },
    { id: 'a11', n: '曲魂化身', icon: '🗿', need: 4 },
    { id: 'a12', n: '星海飞驰', icon: '🧙', need: 8 },
  ],

  /* 洞府设施（资料 08） */
  cave: [
    { k: 'field', n: '灵田', icon: '🌾', desc: '种植灵草，离线也会生长' },
    { k: 'array', n: '聚灵阵', icon: '🔯', desc: '灵气+50%，提升修炼速度' },
    { k: 'close', n: '闭关室', icon: '🧘', desc: '闭关突破加速' },
    { k: 'alchemy', n: '丹房', icon: '⚗️', desc: '炼丹成功率提升' },
    { k: 'forge', n: '炼器房', icon: '🔨', desc: '炼器加成' },
  ],

  /* 章节（资料 20_剧情任务大纲） */
  chapters: ['序章', '第一篇', '第二篇', '第三篇', '第四篇', '第五篇'],

  /* 地图（资料 14_场景美术 + 世界观） */
  maps: [
    { id: 'M1', n: '小寰岛', icon: '🏝️', realm: 0, desc: '韩立落难之地，海兽出没' },
    { id: 'M2', n: '魁星岛坊市', icon: '🏘️', realm: 1, desc: '乱星海最大坊市' },
    { id: 'M3', n: '海猿岛', icon: '🦍', realm: 4, desc: '闭关隐匿之地' },
    { id: 'M4', n: '凝翠岛', icon: '🌿', realm: 5, desc: '购买诱妖草' },
    { id: 'M5', n: '外星海', icon: '🌊', realm: 5, desc: '猎妖场，妖兽密集' },
    { id: 'M6', n: '蝎岛', icon: '🦂', realm: 6, desc: '上古遗迹所在' },
    { id: 'M7', n: '虚天殿', icon: '🏛️', realm: 7, desc: '上古秘境，宝物无数' },
    { id: 'M8', n: '星宫', icon: '⭐', realm: 9, desc: '乱星海统治势力' },
  ],
};

window.CFG = CFG;
window.EX = EX_DATA;
