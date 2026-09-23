/* =========================================================
 * config.js —— 《向僵尸开炮》数据层
 * 资料依据：向僵尸开炮游戏开发资料大全.xlsx
 *   - 09 怪物/BOSS技能机制表（12 种怪物 + BOSS 通用机制）
 *   - 10 局内技能+永久天赋表（12 局内技能 + 8 永久天赋）
 *   - 02 配置表清单（角色/武器/技能/天赋/怪物/BOSS/关卡/掉落/芯片/任务/活动/商城）
 *   - 06 操作方案（移动端摇杆 + PC 备选）
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

/* =========================================================
 * EX —— 静态数据表
 * ========================================================= */
const EX = {

  /* ---------- 品质 ---------- */
  qualities: ['白', '绿', '蓝', '紫', '橙', '红'],
  qColor: { '白': '#b9c4d4', '绿': '#5fd07a', '蓝': '#5cd8ff', '紫': '#c08cff', '橙': '#ffa53c', '红': '#ff4d6d' },

  /* =================================================
   * 一、局内技能表（资料 10 表，12 项）
   * kind: gun=枪械强化 / passive=被动 / aura=光环 / proc=命中触发
   * conflict: 互斥技能（资料明确：闪电链 ↔ 火环）
   * ================================================ */
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
    { id: 'binghuan', n: '冰霜新星', icon: '❄️', kind: 'aura', el: '冰', max: 10, conflict: null,
      desc: '定期释放冰环，减速并冰冻范围内怪', up: '每级提升范围与控制时长', mods: { novaR: 90, novaSlow: 0.5, novaCd: 3.2 } },
    { id: 'baozha', n: '爆炸子弹', icon: '💥', kind: 'proc', el: '火', max: 10, conflict: null,
      desc: '子弹命中后爆炸，造成范围伤害', up: '每级提升爆炸范围', mods: { explode: 0.45, er: 46 } },
    { id: 'hudun', n: '护盾', icon: '🛡️', kind: 'passive', el: '物', max: 10, conflict: null,
      desc: '获得护盾吸收伤害', up: '每级 +护盾值', mods: { shield: 120 } },
    { id: 'yisu', n: '移速强化', icon: '👟', kind: 'passive', el: '风', max: 10, conflict: null,
      desc: '移动速度 +10%', up: '每级 +10%', mods: { moveMul: 0.10 } },
  ],

  /* =================================================
   * 二、永久天赋表（资料 10 表，8 项）
   * 解锁等级 = 需通关的关卡门槛
   * ================================================ */
  talents: [
    { id: 't_hp', n: '基地生命强化', icon: '❤️', max: 20, cost0: 500, costGrow: 1.35, unlock: 0,
      desc: '基地外永久生命 +5%', per: 0.05, stat: 'hp' },
    { id: 't_atk', n: '伤害强化天赋', icon: '⚔️', max: 20, cost0: 600, costGrow: 1.38, unlock: 0,
      desc: '全局伤害 +3%', per: 0.03, stat: 'atk' },
    { id: 't_gold', n: '金币加成', icon: '🪙', max: 20, cost0: 400, costGrow: 1.32, unlock: 3,
      desc: '金币获取 +5%', per: 0.05, stat: 'gold' },
    { id: 't_xp', n: '经验加成', icon: '📘', max: 20, cost0: 450, costGrow: 1.33, unlock: 3,
      desc: '经验获取 +5%', per: 0.05, stat: 'xp' },
    { id: 't_crit', n: '暴击天赋', icon: '🎯', max: 20, cost0: 700, costGrow: 1.40, unlock: 6,
      desc: '全局暴击率 +2%', per: 0.02, stat: 'crit' },
    { id: 't_ls', n: '吸血天赋', icon: '🩸', max: 15, cost0: 800, costGrow: 1.42, unlock: 6,
      desc: '全局吸血 +1%', per: 0.01, stat: 'ls' },
    { id: 't_armor', n: '护甲天赋', icon: '🛡️', max: 20, cost0: 650, costGrow: 1.39, unlock: 10,
      desc: '全局护甲 +3%（减伤）', per: 0.03, stat: 'armor' },
    { id: 't_revive', n: '复活天赋', icon: '💚', max: 3, cost0: 5000, costGrow: 2.2, unlock: 12,
      desc: '每局限一次免费复活（每级 +1 次）', per: 1, stat: 'revive' },
  ],

  /* =================================================
   * 三、怪物表（资料 09 表，12 种）
   * ai: chase=追击 / rush=冲刺 / ranged=远程 / boomer=自爆
   * ================================================ */
  zombies: [
    { id: 'putong', n: '普通僵尸', icon: '🧟', hp: 30, spd: 34, dmg: 8, atkR: 26, ai: 'chase',
      skill: '扑咬', sk: '近战伤害，靠近玩家撕咬', xp: 4, gold: 3, elite: false },
    { id: 'jipao', n: '疾跑僵尸', icon: '🏃', hp: 22, spd: 78, dmg: 14, atkR: 24, ai: 'rush',
      skill: '冲刺', sk: '高速冲向玩家，接触造成高伤害', xp: 6, gold: 4, elite: false },
    { id: 'zhongjia', n: '重甲僵尸', icon: '🥋', hp: 180, spd: 26, dmg: 18, atkR: 28, ai: 'chase',
      skill: '护甲', sk: '减伤高，需穿透/爆炸破甲', def: 0.55, xp: 14, gold: 12, elite: true },
    { id: 'zibao', n: '自爆僵尸', icon: '💣', hp: 45, spd: 62, dmg: 34, atkR: 30, ai: 'boomer',
      skill: '自爆', sk: '接近后自爆，范围伤害，死亡解体', xp: 10, gold: 8, elite: false },
    { id: 'du', n: '毒僵尸', icon: '☠️', hp: 90, spd: 34, dmg: 10, atkR: 120, ai: 'ranged',
      skill: '毒雾', sk: '喷洒毒雾，玩家中毒持续掉血', poison: 6, xp: 13, gold: 10, elite: true },
    { id: 'tuye', n: '吐液僵尸', icon: '🤮', hp: 70, spd: 30, dmg: 12, atkR: 150, ai: 'ranged',
      skill: '腐蚀液', sk: '远程喷吐，落地区域持续伤害', pool: 5, xp: 12, gold: 9, elite: false },
    { id: 'zhadan', n: '炸弹僵尸', icon: '🧨', hp: 55, spd: 44, dmg: 26, atkR: 28, ai: 'boomer',
      skill: '死亡爆炸', sk: '死亡时爆炸范围伤害，可引爆油桶', xp: 11, gold: 9, elite: false },
    { id: 'dun', n: '护盾僵尸', icon: '🔰', hp: 130, spd: 32, dmg: 16, atkR: 26, ai: 'chase',
      skill: '能量护盾', sk: '正面免疫伤害，需绕后或破盾', front: 0.85, xp: 16, gold: 13, elite: true },
    { id: 'fenlie', n: '分裂僵尸', icon: '🪱', hp: 85, spd: 36, dmg: 12, atkR: 26, ai: 'chase',
      skill: '分裂', sk: '死亡分裂成 2 个小僵尸', split: 2, xp: 12, gold: 10, elite: false },
    { id: 'feixing', n: '飞行僵尸', icon: '🦅', hp: 60, spd: 58, dmg: 15, atkR: 30, ai: 'chase',
      skill: '飞行', sk: '越过地面障碍，空中移动', fly: true, xp: 13, gold: 11, elite: false },
    { id: 'jinying', n: '精英僵尸', icon: '👹', hp: 320, spd: 40, dmg: 26, atkR: 30, ai: 'chase',
      skill: '强化体魄', sk: '高血量高伤害的精英单位', def: 0.3, xp: 30, gold: 26, elite: true },
    { id: 'xiaozombie', n: '小僵尸', icon: '🐛', hp: 12, spd: 50, dmg: 5, atkR: 20, ai: 'chase',
      skill: '扑咬', sk: '分裂产生的小体型僵尸', xp: 2, gold: 1, elite: false },
  ],

  /* =================================================
   * 四、BOSS 表（资料 09 表）
   * 阶段数量随章节递增；血量阈值触发技能
   * ================================================ */
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

  /* BOSS 通用机制（资料 09 表 11/16 项） */
  bossCommon: [
    { n: '阶段切换', sk: '血量 70% / 40% 触发新技能，全屏警告' },
    { n: '狂暴免疫', sk: '狂暴阶段免疫控制，伤害提升' },
  ],

  /* =================================================
   * 五、武器表（资料：主副武器 + 弹夹容量 + 换弹时间）
   * ================================================ */
  guns: [
    { id: 'ar', n: '突击步枪', icon: '🔫', q: '绿', dmg: 12, rate: 5.0, range: 300, mag: 30, reload: 1.5,
      pierce: 0, spread: 1, bulletSpd: 620, unlock: 0, desc: '均衡型，射速与弹夹适中' },
    { id: 'sg', n: '霰弹枪', icon: '💥', q: '蓝', dmg: 9, rate: 1.6, range: 170, mag: 6, reload: 2.2,
      pierce: 1, spread: 6, bulletSpd: 520, unlock: 3, desc: '一次射出多颗弹丸，近距离爆发' },
    { id: 'gl', n: '榴弹枪', icon: '🎇', q: '蓝', dmg: 34, rate: 1.1, range: 260, mag: 4, reload: 2.6,
      pierce: 0, spread: 1, bulletSpd: 420, unlock: 6, explode: 0.6, er: 60, desc: '命中爆炸，范围伤害' },
    { id: 'sn', n: '狙击枪', icon: '🎯', q: '紫', dmg: 90, rate: 0.8, range: 420, mag: 5, reload: 2.4,
      pierce: 3, spread: 1, bulletSpd: 900, unlock: 10, desc: '高伤高穿透，射速较慢' },
    { id: 'gat', n: '加特林', icon: '⚙️', q: '紫', dmg: 8, rate: 11.0, range: 280, mag: 90, reload: 3.4,
      pierce: 0, spread: 1, bulletSpd: 700, unlock: 16, desc: '极高射速，弹夹大但换弹慢' },
    { id: 'las', n: '激光枪', icon: '⚡', q: '橙', dmg: 46, rate: 4.0, range: 360, mag: 20, reload: 1.8,
      pierce: 5, spread: 1, bulletSpd: 1200, unlock: 24, desc: '高穿透光束，直线贯穿' },
  ],

  /* =================================================
   * 六、芯片表（资料 02 表 10 / GD-009）
   * 芯片槽 + 品质 + 词条池；支持拆解 / 合成 / 洗练
   * ================================================ */
  chipSlots: [
    { k: 'c1', n: '芯片槽 I', icon: '🔲' },
    { k: 'c2', n: '芯片槽 II', icon: '🔲' },
    { k: 'c3', n: '芯片槽 III', icon: '🔲' },
    { k: 'c4', n: '芯片槽 IV', icon: '🔲' },
    { k: 'c5', n: '芯片槽 V', icon: '🔲' },
    { k: 'c6', n: '芯片槽 VI', icon: '🔲' },
  ],
  /* 词条池：芯片随机 1~N 条词 */
  chipStats: [
    { k: 'atk', n: '攻击力', unit: '%', base: 0.04 },
    { k: 'hp', n: '生命值', unit: '%', base: 0.05 },
    { k: 'crit', n: '暴击率', unit: '%', base: 0.015 },
    { k: 'critDmg', n: '暴击伤害', unit: '%', base: 0.05 },
    { k: 'rate', n: '攻击速度', unit: '%', base: 0.03 },
    { k: 'move', n: '移动速度', unit: '%', base: 0.03 },
    { k: 'armor', n: '伤害减免', unit: '%', base: 0.02 },
    { k: 'gold', n: '金币获取', unit: '%', base: 0.06 },
    { k: 'xp', n: '经验获取', unit: '%', base: 0.05 },
    { k: 'pierce', n: '穿透', unit: '', base: 0.25 },
  ],
  /* 品质决定词条数量与数值倍率 */
  chipQ: [
    { q: '白', stats: 1, mul: 1.0, shards: 1 },
    { q: '绿', stats: 2, mul: 1.4, shards: 2 },
    { q: '蓝', stats: 2, mul: 1.9, shards: 4 },
    { q: '紫', stats: 3, mul: 2.6, shards: 8 },
    { q: '橙', stats: 4, mul: 3.5, shards: 16 },
    { q: '红', stats: 5, mul: 4.8, shards: 32 },
  ],

  /* =================================================
   * 七、基地建筑（资料 GD-010：医疗站/军械库/研究所/仓库）
   * 升级消耗 + 离线产出
   * ================================================ */
  buildings: [
    { id: 'hospital', n: '医疗站', icon: '🏥', desc: '提升角色生命上限', stat: 'hp', per: 0.06,
      cost0: 800, grow: 1.45, max: 30, offline: null },
    { id: 'armory', n: '军械库', icon: '🔧', desc: '提升武器伤害', stat: 'atk', per: 0.05,
      cost0: 900, grow: 1.46, max: 30, offline: null },
    { id: 'lab', n: '研究所', icon: '🔬', desc: '提升经验获取', stat: 'xp', per: 0.04,
      cost0: 700, grow: 1.44, max: 30, offline: null },
    { id: 'warehouse', n: '仓库', icon: '📦', desc: '离线产出金币（每小时）', stat: 'gold', per: 1,
      cost0: 600, grow: 1.42, max: 30, offline: 120 },
  ],

  /* =================================================
   * 八、任务表（资料 02 表 11：主线/每日/成就）
   * ================================================ */
  tasks: {
    main: [
      { id: 'm1', n: '初次出击', goal: { t: 'clear', v: 1 }, rw: { gold: 500, dia: 10 }, desc: '通关 1 个关卡' },
      { id: 'm2', n: '清理街区', goal: { t: 'clear', v: 3 }, rw: { gold: 1200, dia: 20 }, desc: '通关 3 个关卡' },
      { id: 'm3', n: '武器专家', goal: { t: 'gunLv', v: 10 }, rw: { gold: 2000, dia: 30 }, desc: '武器强化到 10 级' },
      { id: 'm4', n: '芯片先驱', goal: { t: 'chip', v: 3 }, rw: { gold: 2500, dia: 40 }, desc: '装备 3 块芯片' },
      { id: 'm5', n: '天赋觉醒', goal: { t: 'talent', v: 5 }, rw: { gold: 3000, dia: 50 }, desc: '点亮 5 个天赋' },
      { id: 'm6', n: '深入第二章', goal: { t: 'chapter', v: 2 }, rw: { gold: 5000, dia: 80 }, desc: '通关第 2 章' },
      { id: 'm7', n: '无尽试炼', goal: { t: 'endless', v: 10 }, rw: { gold: 6000, dia: 100 }, desc: '无尽模式到达第 10 层' },
      { id: 'm8', n: '基地建设', goal: { t: 'build', v: 10 }, rw: { gold: 8000, dia: 120 }, desc: '基地建筑总等级达 10' },
    ],
    daily: [
      { id: 'd1', n: '每日登录', goal: { t: 'login', v: 1 }, rw: { gold: 1000, dia: 10 } },
      { id: 'd2', n: '出击 3 次', goal: { t: 'run', v: 3 }, rw: { gold: 1500, dia: 15 } },
      { id: 'd3', n: '击杀 300 僵尸', goal: { t: 'kill', v: 300 }, rw: { gold: 2000, dia: 20 } },
      { id: 'd4', n: '强化武器 3 次', goal: { t: 'upgrade', v: 3 }, rw: { gold: 1800, dia: 15 } },
      { id: 'd5', n: '通关 2 关', goal: { t: 'clearDaily', v: 2 }, rw: { gold: 2200, dia: 25 } },
    ],
    achieve: [
      { id: 'a1', n: '僵尸猎手', goal: { t: 'kills', v: 1000 }, rw: { gold: 3000, dia: 40 } },
      { id: 'a2', n: '尸山血海', goal: { t: 'kills', v: 10000 }, rw: { gold: 15000, dia: 150 } },
      { id: 'a3', n: '收割机器', goal: { t: 'kills', v: 50000 }, rw: { gold: 50000, dia: 400 } },
      { id: 'a4', n: '关卡征服者', goal: { t: 'clears', v: 30 }, rw: { gold: 12000, dia: 120 } },
      { id: 'a5', n: '无尽勇者', goal: { t: 'endlessBest', v: 30 }, rw: { gold: 18000, dia: 200 } },
      { id: 'a6', n: '战力巅峰', goal: { t: 'power', v: 20000 }, rw: { gold: 20000, dia: 250 } },
      { id: 'a7', n: 'BOSS 终结者', goal: { t: 'boss', v: 10 }, rw: { gold: 16000, dia: 180 } },
      { id: 'a8', n: '芯片大师', goal: { t: 'chipQ', v: 5 }, rw: { gold: 14000, dia: 160 } },
    ],
  },

  /* =================================================
   * 九、章节表（资料 07 表：章节小节 / 星级 / 通关条件）
   * 每章 10 关，第 10 关为 BOSS 关
   * ================================================ */
  chapters: [
    { id: 1, n: '第一章 · 街区沦陷', icon: '🏙️', boss: 'juxing', pool: ['putong', 'jipao', 'zhadan'], hpMul: 1.0 },
    { id: 2, n: '第二章 · 废弃工厂', icon: '🏭', boss: 'mama', pool: ['putong', 'jipao', 'zhongjia', 'zibao'], hpMul: 1.8 },
    { id: 3, n: '第三章 · 毒雾蔓延', icon: '☠️', boss: 'juxing', pool: ['putong', 'du', 'tuye', 'jipao'], hpMul: 3.0 },
    { id: 4, n: '第四章 · 地下设施', icon: '🚇', boss: 'mama', pool: ['zhongjia', 'dun', 'fenlie', 'tuye'], hpMul: 5.0 },
    { id: 5, n: '第五章 · 空中威胁', icon: '🌉', boss: 'juxing', pool: ['feixing', 'jipao', 'du', 'zhongjia'], hpMul: 8.0 },
    { id: 6, n: '第六章 · 母体巢穴', icon: '🕳️', boss: 'mama', pool: ['jinying', 'dun', 'fenlie', 'feixing', 'zhongjia'], hpMul: 13.0 },
  ],
  LEVELS_PER_CHAPTER: 10,

  /* =================================================
   * 十、活动表（资料 02 表 12 / GD-013）
   * ================================================ */
  activities: [
    { id: 'ac1', n: '限时挑战', icon: '⏱️', type: '限时', desc: '限时内击杀指定数量僵尸', rw: '金币 ×5000 · 钻石 ×50', state: '进行中' },
    { id: 'ac2', n: '丧尸围城', icon: '🏰', type: '防守', desc: '抵御 20 波尸潮进攻', rw: '金币 ×12000 · 芯片 ×3', state: '进行中' },
    { id: 'ac3', n: 'BOSS 突袭', icon: '👹', type: '挑战', desc: '限时击败巨型丧尸', rw: '钻石 ×100 · 橙色芯片', state: '进行中' },
    { id: 'ac4', n: '节日狂欢', icon: '🎉', type: '节日', desc: '登录即领节日礼包', rw: '钻石 ×200 · 皮肤碎片', state: '未开启' },
    { id: 'ac5', n: '无尽竞速', icon: '♾️', type: '排行', desc: '无尽模式层数排行', rw: '按排名发放钻石', state: '进行中' },
    { id: 'ac6', n: '新手特训', icon: '🎓', type: '引导', desc: '完成新手引导任务', rw: '金币 ×3000 · 钻石 ×30', state: '进行中' },
  ],

  /* =================================================
   * 十一、商城表（资料 02 表 13 / GD-012）
   * ================================================ */
  shop: [
    { id: 's1', n: '新手礼包', icon: '🎁', price: 0, cur: 'free', desc: '金币 ×5000 · 钻石 ×50', g: 5000, d: 50 },
    { id: 's2', n: '成长基金', icon: '💰', price: 30, cur: 'diamond', desc: '金币 ×30000 · 钻石 ×200', g: 30000, d: 200 },
    { id: 's3', n: '至尊礼包', icon: '👑', price: 128, cur: 'diamond', desc: '金币 ×150000 · 钻石 ×800', g: 150000, d: 800 },
    { id: 's4', n: '月卡', icon: '📅', price: 68, cur: 'diamond', desc: '每日返钻石 ×100，持续 30 天', g: 0, d: 0, monthly: true },
    { id: 's5', n: '战令', icon: '🎖️', price: 98, cur: 'diamond', desc: '解锁战令奖励线', g: 10000, d: 300, pass: true },
    { id: 's6', n: '芯片礼包', icon: '🔲', price: 45, cur: 'diamond', desc: '紫色芯片 ×2 · 碎片 ×200', g: 0, d: 0, chip: 2 },
  ],

  /* =================================================
   * 十二、角色皮肤（资料 GD-003 皮肤解锁表）
   * ================================================ */
  skins: [
    { id: 'default', n: '默认战术服', icon: '👨‍🚀', unlock: 0, desc: '初始装备' },
    { id: 'swat', n: '特警制服', icon: '🥷', unlock: 5, desc: '通关 5 关解锁' },
    { id: 'hazmat', n: '防化服', icon: '🦺', unlock: 12, desc: '通关 12 关解锁' },
    { id: 'commando', n: '突击兵', icon: '🪖', unlock: 20, desc: '通关 20 关解锁' },
    { id: 'reaper', n: '死神', icon: '💀', unlock: 30, desc: '通关 30 关解锁' },
    { id: 'cyber', n: '赛博战士', icon: '🤖', unlock: 45, desc: '通关 45 关解锁' },
  ],

  /* ---------- 元素（技能系别） ---------- */
  elements: [
    { k: '火', c: '#ff7a3c' }, { k: '冰', c: '#5cd8ff' },
    { k: '电', c: '#c08cff' }, { k: '风', c: '#7be8a0' }, { k: '物', c: '#ffd76a' },
  ],
};

window.EX = EX;
window.CFG = CFG;
