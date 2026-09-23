/* =========================================================
 * config.js —— 《向僵尸开炮》游戏数据层
 * 资料依据：官网 xjskp.scgame.com.cn + 百度百科 + 玩家攻略
 * 风格：低饱和灰蓝 + Q 版卡通末日
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
 * EX —— 静态扩展（技能/僵尸/BOSS/枪械/宝石/佣兵）
 * ========================================================= */
const EX = {

  /* ---------- 元素 ---------- */
  elements: [
    { k: '火', c: '#ff7a3c', n: '火' },
    { k: '冰', c: '#5cd8ff', n: '冰' },
    { k: '电', c: '#c08cff', n: '电' },
    { k: '风', c: '#7be8a0', n: '风' },
    { k: '物', c: '#ffd76a', n: '物' },
  ],

  /* ---------- 技能（局内三选一） ----------
   * kind: active=主动(消耗能量) / passive=被动 / gun=枪械强化
   * fx  : 主动技能的释放效果类型
   * mods: 被动提供的属性修正
   */
  skills: [
    /* ===== 火系 ===== */
    { id: 'wenya', n: '温压弹', el: '火', kind: 'active', icon: '💥', fx: 'explode',
      desc: '发射温压弹，命中后大范围爆炸并留下燃烧区域持续灼烧',
      cost: 40, cd: 6.5, p0: { dmg: 3.2, r: 78, burn: 0.35 }, pg: { dmg: 0.9, r: 6, burn: 0.06 } },
    { id: 'ranyou', n: '燃油弹', el: '火', kind: 'active', icon: '🔥', fx: 'explode',
      desc: '抛洒燃油，落地形成大范围火海，对范围内敌人持续造成高额灼烧',
      cost: 55, cd: 9, p0: { dmg: 1.1, r: 96, burn: 0.9 }, pg: { dmg: 0.3, r: 8, burn: 0.2 } },
    { id: 'bomb', n: '子弹爆炸', el: '火', kind: 'gun', icon: '🎇',
      desc: '子弹命中怪物后发生爆炸，造成小范围溅射伤害',
      p0: { explode: 0.45, er: 46 }, pg: { explode: 0.16, er: 4 } },

    /* ===== 冰系 ===== */
    { id: 'ganbing', n: '干冰弹', el: '冰', kind: 'active', icon: '❄️', fx: 'freeze',
      desc: '发射干冰弹，冻结范围内敌人并造成冰霜伤害',
      cost: 38, cd: 7, p0: { dmg: 2.4, r: 88, slow: 0.55, time: 2.4 }, pg: { dmg: 0.7, r: 6, slow: 0.05, time: 0.3 } },
    { id: 'bingbao', n: '冰暴发生器', el: '冰', kind: 'active', icon: '🌨️', fx: 'freeze',
      desc: '召唤冰暴持续轰击随机区域，大范围减速冻结',
      cost: 50, cd: 8.5, p0: { dmg: 1.5, r: 74, slow: 0.65, time: 3.2 }, pg: { dmg: 0.45, r: 5, slow: 0.04, time: 0.35 } },
    { id: 'bingbao2', n: '冰雹', el: '冰', kind: 'active', icon: '🧊', fx: 'freeze',
      desc: '天降冰雹砸击全场敌人，附带冻结效果',
      cost: 62, cd: 11, p0: { dmg: 2.0, r: 999, slow: 0.45, time: 2.0 }, pg: { dmg: 0.6, slow: 0.04, time: 0.25 } },

    /* ===== 电系 ===== */
    { id: 'dianci', n: '电磁穿刺', el: '电', kind: 'active', icon: '⚡', fx: 'chain',
      desc: '释放电磁穿刺，在敌人之间弹射传导并造成百分比生命伤害',
      cost: 45, cd: 7.5, p0: { dmg: 2.2, chain: 4, pct: 0.02 }, pg: { dmg: 0.65, chain: 0.5, pct: 0.006 } },
    { id: 'yueqian', n: '跃迁电子', el: '电', kind: 'active', icon: '🌀', fx: 'chain',
      desc: '跃迁电子在敌群中反复弹射，每次弹射伤害递增',
      cost: 58, cd: 10, p0: { dmg: 1.6, chain: 6, pct: 0.012 }, pg: { dmg: 0.5, chain: 0.7, pct: 0.004 } },
    { id: 'shexian', n: '高能射线', el: '电', kind: 'active', icon: '📡', fx: 'laser',
      desc: '发射贯穿性高能射线，直线穿透所有敌人',
      cost: 42, cd: 6, p0: { dmg: 2.8, w: 26, time: 1.1 }, pg: { dmg: 0.85, w: 2, time: 0.1 } },
    { id: 'zhidao', n: '制导激光', el: '电', kind: 'active', icon: '🎯', fx: 'laser',
      desc: '锁定血量最高的敌人发射制导激光，单体爆发',
      cost: 48, cd: 8, p0: { dmg: 4.5, w: 16, time: 1.4 }, pg: { dmg: 1.3, time: 0.1 } },

    /* ===== 风系 ===== */
    { id: 'xuanfeng', n: '旋风加农', el: '风', kind: 'active', icon: '🌪️', fx: 'vortex',
      desc: '生成旋风将周围敌人聚拢并持续切割',
      cost: 52, cd: 9, p0: { dmg: 1.3, r: 108, pull: 1 }, pg: { dmg: 0.4, r: 7 } },
    { id: 'longjuan', n: '风暴旋风', el: '风', kind: 'active', icon: '🌀', fx: 'vortex',
      desc: '召唤大型风暴，持续吸附并绞杀范围内敌人',
      cost: 66, cd: 12, p0: { dmg: 1.8, r: 132, pull: 1.4 }, pg: { dmg: 0.55, r: 8 } },
    { id: 'qiren', n: '压缩气刃', el: '风', kind: 'active', icon: '🗡️', fx: 'wave',
      desc: '向前释放压缩气刃，横扫前方扇形区域',
      cost: 40, cd: 5.5, p0: { dmg: 3.0, w: 130 }, pg: { dmg: 0.9, w: 8 } },

    /* ===== 召唤 ===== */
    { id: 'zhuangjia', n: '装甲车', el: '物', kind: 'active', icon: '🚙', fx: 'summon',
      desc: '召唤装甲车冲入尸潮，撞击聚怪并承伤',
      cost: 60, cd: 14, p0: { dmg: 2.6, hp: 900, time: 8 }, pg: { dmg: 0.8, hp: 260, time: 0.8 } },
    { id: 'wurenji', n: '无人机', el: '物', kind: 'active', icon: '🛸', fx: 'summon',
      desc: '召唤无人机环绕自动攻击附近敌人',
      cost: 55, cd: 13, p0: { dmg: 1.4, time: 10, n: 1 }, pg: { dmg: 0.42, time: 0.9 } },
    { id: 'feiji', n: '脉冲飞机', el: '电', kind: 'active', icon: '✈️', fx: 'summon',
      desc: '呼叫脉冲飞机对全场进行扫射轰炸',
      cost: 70, cd: 16, p0: { dmg: 2.2, time: 4 }, pg: { dmg: 0.66, time: 0.3 } },

    /* ===== 枪械强化（被动） ===== */
    { id: 'lianfa', n: '连发', el: '物', kind: 'gun', icon: '🔫',
      desc: '每次射击额外发射一发子弹', p0: { extra: 1 }, pg: { extra: 0.34 } },
    { id: 'qishe', n: '齐射', el: '物', kind: 'gun', icon: '🎯',
      desc: '增加同时射出的弹道数量', p0: { spread: 1 }, pg: { spread: 0.34 } },
    { id: 'fenlie', n: '分裂子弹', el: '物', kind: 'gun', icon: '✳️',
      desc: '子弹命中后分裂出次级子弹', p0: { split: 2 }, pg: { split: 0.5 } },
    { id: 'sifenlie', n: '四分裂', el: '物', kind: 'gun', icon: '❉',
      desc: '子弹命中后向四方向分裂', p0: { split4: 1 }, pg: { split4: 0.34 } },
    { id: 'tanshe', n: '弹射', el: '物', kind: 'gun', icon: '↩️',
      desc: '子弹命中后弹射至附近敌人', p0: { bounce: 1 }, pg: { bounce: 0.4 } },
    { id: 'tuanchuan', n: '穿透', el: '物', kind: 'gun', icon: '➡️',
      desc: '子弹可穿透更多敌人', p0: { pierce: 1 }, pg: { pierce: 0.5 } },
    { id: 'zengshang', n: '子弹增伤', el: '物', kind: 'gun', icon: '💪',
      desc: '提升子弹基础伤害', p0: { dmgMul: 0.35 }, pg: { dmgMul: 0.18 } },
    { id: 'sheshu', n: '急速射击', el: '物', kind: 'gun', icon: '⏩',
      desc: '提升射击速度', p0: { rateMul: 0.25 }, pg: { rateMul: 0.12 } },
    { id: 'shecheng', n: '炮管延长', el: '物', kind: 'gun', icon: '📏',
      desc: '提升攻击射程', p0: { rangeMul: 0.2 }, pg: { rangeMul: 0.1 } },

    /* ===== 通用被动 ===== */
    { id: 'baoji', n: '暴击强化', el: '物', kind: 'passive', icon: '💢',
      desc: '提升暴击率与暴击伤害', p0: { crit: 0.1, critDmg: 0.3 }, pg: { crit: 0.04, critDmg: 0.15 } },
    { id: 'shaguai', n: '杀怪加血', el: '物', kind: 'passive', icon: '❤️',
      desc: '击杀敌人恢复防线生命', p0: { heal: 3 }, pg: { heal: 1.6 } },
    { id: 'jinbi', n: '金币加成', el: '物', kind: 'passive', icon: '🪙',
      desc: '提升金币获取量', p0: { goldMul: 0.3 }, pg: { goldMul: 0.15 } },
    { id: 'jingyan', n: '经验加成', el: '物', kind: 'passive', icon: '💎',
      desc: '提升经验获取，更快升级', p0: { xpMul: 0.3 }, pg: { xpMul: 0.15 } },
    { id: 'citie', n: '磁力场', el: '物', kind: 'passive', icon: '🧲',
      desc: '扩大拾取范围', p0: { magnet: 40 }, pg: { magnet: 18 } },
    { id: 'fangxian', n: '防线强化', el: '物', kind: 'passive', icon: '🧱',
      desc: '提升防线最大生命值', p0: { wallHp: 400 }, pg: { wallHp: 220 } },
    { id: 'jianshang', n: '减伤护盾', el: '物', kind: 'passive', icon: '🛡️',
      desc: '降低受到的伤害', p0: { dr: 0.1 }, pg: { dr: 0.05 } },
    { id: 'miaosha', n: '秒杀', el: '物', kind: 'passive', icon: '☠️',
      desc: '攻击有概率直接秒杀普通敌人', p0: { exec: 0.02 }, pg: { exec: 0.012 } },
  ],

  /* ---------- 僵尸 ---------- */
  zombies: [
    { id: 'z1', n: '普通僵尸', icon: '🧟', hp: 100, spd: 26, dmg: 12, gold: 3, xp: 6, r: 15 },
    { id: 'z2', n: '快速僵尸', icon: '🏃', hp: 70, spd: 48, dmg: 9, gold: 4, xp: 7, r: 13 },
    { id: 'z3', n: '装甲僵尸', icon: '🛡️', hp: 380, spd: 20, dmg: 18, gold: 9, xp: 14, r: 18, def: 0.35 },
    { id: 'z4', n: '隐身僵尸', icon: '👻', hp: 150, spd: 34, dmg: 15, gold: 7, xp: 11, r: 15, stealth: 1 },
    { id: 'z5', n: '瘟疫僵尸', icon: '🤢', hp: 240, spd: 24, dmg: 14, gold: 8, xp: 12, r: 16, poison: 1 },
    { id: 'z6', n: '冰雪僵尸', icon: '🥶', hp: 300, spd: 22, dmg: 16, gold: 8, xp: 13, r: 17, res: '冰' },
    { id: 'z7', n: '飞行僵尸', icon: '🦅', hp: 130, spd: 42, dmg: 13, gold: 8, xp: 12, r: 14, fly: 1 },
    { id: 'z8', n: '木乃伊僵尸', icon: '🧻', hp: 260, spd: 23, dmg: 15, gold: 9, xp: 13, r: 16, revive: 1 },
    { id: 'z9', n: '咸鱼僵尸', icon: '🐟', hp: 200, spd: 30, dmg: 12, gold: 6, xp: 10, r: 15, immune: 1 },
    { id: 'z10', n: '自爆僵尸', icon: '💣', hp: 160, spd: 36, dmg: 40, gold: 7, xp: 11, r: 15, boom: 1 },
    { id: 'z11', n: '精英僵尸', icon: '👹', hp: 900, spd: 24, dmg: 30, gold: 26, xp: 40, r: 22, elite: 1, def: 0.2 },
  ],

  /* ---------- BOSS ---------- */
  bosses: [
    { id: 'b1', n: '机械开垦者', icon: '🤖', hp: 3000, spd: 16, dmg: 55, gold: 180, xp: 260, r: 34, boss: 1, def: 0.15 },
    { id: 'b2', n: '巢穴之母', icon: '🕷️', hp: 4200, spd: 14, dmg: 48, gold: 220, xp: 320, r: 36, boss: 1, spawn: 1 },
    { id: 'b3', n: '深渊领主', icon: '👺', hp: 5600, spd: 18, dmg: 70, gold: 300, xp: 420, r: 38, boss: 1, def: 0.18 },
    { id: 'b4', n: '裂骨者', icon: '💀', hp: 7200, spd: 20, dmg: 85, gold: 380, xp: 520, r: 38, boss: 1, def: 0.20 },
    { id: 'b5', n: '暴食者', icon: '🦖', hp: 9200, spd: 15, dmg: 95, gold: 450, xp: 620, r: 40, boss: 1, heal: 1 },
    { id: 'b6', n: '深渊巨兽', icon: '🐉', hp: 12000, spd: 17, dmg: 120, gold: 560, xp: 780, r: 42, boss: 1, res: '火' },
    { id: 'b7', n: '猛犸象', icon: '🦣', hp: 16000, spd: 13, dmg: 150, gold: 700, xp: 980, r: 44, boss: 1, def: 0.25 },
  ],

  /* ---------- 枪械 ---------- */
  guns: [
    { id: 'g1', n: '突击步枪', icon: '🔫', dmg: 22, rate: 3.2, range: 210, pierce: 0, q: '绿' },
    { id: 'g2', n: '霰弹枪', icon: '🔫', dmg: 16, rate: 1.6, range: 150, pierce: 0, spread: 5, q: '绿' },
    { id: 'g3', n: '冲锋枪', icon: '🔫', dmg: 13, rate: 6.5, range: 175, pierce: 0, q: '蓝' },
    { id: 'g4', n: '狙击枪', icon: '🎯', dmg: 68, rate: 0.9, range: 320, pierce: 2, q: '蓝' },
    { id: 'g5', n: '加特林', icon: '🔫', dmg: 15, rate: 9.0, range: 190, pierce: 1, q: '紫' },
    { id: 'g6', n: '激光炮', icon: '📡', dmg: 46, rate: 2.4, range: 280, pierce: 3, q: '紫' },
    { id: 'g7', n: '等离子炮', icon: '☄️', dmg: 88, rate: 1.5, range: 300, pierce: 4, q: '橙' },
  ],

  /* ---------- 装备部位 ---------- */
  slots: [
    { k: 'head', n: '头盔', icon: '🪖' },
    { k: 'cloth', n: '衣服', icon: '🥋' },
    { k: 'shoe', n: '鞋子', icon: '👟' },
    { k: 'arm', n: '护臂', icon: '🧤' },
    { k: 'pants', n: '裤子', icon: '👖' },
    { k: 'glove', n: '手套', icon: '✋' },
  ],

  /* ---------- 品质 ---------- */
  qualities: [
    { n: '白', c: '#b8b8b8', mul: 1.0 },
    { n: '绿', c: '#5fd07a', mul: 1.25 },
    { n: '蓝', c: '#4aa8ff', mul: 1.6 },
    { n: '紫', c: '#c07bff', mul: 2.1 },
    { n: '橙', c: '#ffa030', mul: 2.8 },
    { n: '红', c: '#ff4d6d', mul: 3.8 },
  ],

  /* ---------- 宝石词条 ---------- */
  gems: [
    { id: 'gm1', n: '暴击率', icon: '💢', v: 0.05, unit: '%', desc: '暴击率 +5%' },
    { id: 'gm2', n: '技能冷却', icon: '⏱️', v: 0.04, unit: '%', desc: '技能冷却缩减 +4%' },
    { id: 'gm3', n: '枪械穿透', icon: '➡️', v: 1, unit: '', desc: '枪械穿透 +1' },
    { id: 'gm4', n: '枪械齐射', icon: '🎯', v: 1, unit: '', desc: '枪械齐射 +1' },
    { id: 'gm5', n: '枪械伤害', icon: '💪', v: 0.08, unit: '%', desc: '枪械伤害 +8%' },
    { id: 'gm6', n: '传送', icon: '🌀', v: 0.03, unit: '%', desc: '攻击概率传送敌人' },
    { id: 'gm7', n: '秒杀', icon: '☠️', v: 0.015, unit: '%', desc: '概率直接秒杀' },
    { id: 'gm8', n: '杀怪加血', icon: '❤️', v: 4, unit: '', desc: '击杀恢复防线生命' },
    { id: 'gm9', n: '防线免疫', icon: '🧱', v: 1, unit: '', desc: '免疫前 5 次受到的伤害' },
    { id: 'gm10', n: '伤害追加', icon: '📈', v: 0.06, unit: '%', desc: '伤害追加百分比 +6%' },
    { id: 'gm11', n: '负面延长', icon: '⏳', v: 0.15, unit: '%', desc: '负面状态持续延长 15%' },
    { id: 'gm12', n: '暴击追加', icon: '🔥', v: 0.12, unit: '%', desc: '暴击追加伤害 +12%' },
  ],

  /* ---------- 佣兵（不可操作，辅助战斗） ---------- */
  mercs: [
    { id: 'm1', n: '霰弹枪士', icon: '🔫', atk: 18, rate: 1.4, q: '绿', desc: '近距离范围散射' },
    { id: 'm2', n: '机枪大兵', icon: '🔫', atk: 12, rate: 4.2, q: '蓝', desc: '高射速持续压制' },
    { id: 'm3', n: '精准狙击手', icon: '🎯', atk: 55, rate: 0.7, q: '蓝', desc: '优先点杀高血量目标' },
    { id: 'm4', n: '哨箭达人', icon: '🏹', atk: 26, rate: 2.0, q: '紫', desc: '穿透射击' },
    { id: 'm5', n: '工程师', icon: '🔧', atk: 8, rate: 1.0, q: '紫', desc: '持续修复防线' },
    { id: 'm6', n: '超时空', icon: '⚡', atk: 40, rate: 1.2, q: '橙', desc: '概率秒杀精英' },
  ],

  /* ---------- 基地模块 ---------- */
  base: [
    { id: 'lab', n: '研究所', icon: '🔬', desc: '研发科技，永久提升属性' },
    { id: 'wall', n: '防线', icon: '🧱', desc: '升级城墙，提升防线生命' },
    { id: 'canteen', n: '食堂', icon: '🍚', desc: '补充体力，领取每日补给' },
    { id: 'rank', n: '排行榜', icon: '🏆', desc: '查看全服通关排行' },
    { id: 'fort', n: '远征堡垒', icon: '🏰', desc: '派遣佣兵远征获取资源' },
    { id: 'tavern', n: '酒馆', icon: '🍺', desc: '招募雇佣兵并肩作战' },
  ],

  /* ---------- 研究所科技 ---------- */
  techs: [
    { id: 't1', n: '弹药改良', icon: '💪', max: 30, base: 120, grow: 1.28, desc: '攻击力 +2%/级' },
    { id: 't2', n: '枪管工艺', icon: '📏', max: 30, base: 100, grow: 1.26, desc: '射程 +1.5%/级' },
    { id: 't3', n: '自动装填', icon: '⏩', max: 30, base: 140, grow: 1.3, desc: '射速 +2%/级' },
    { id: 't4', n: '装甲加固', icon: '🧱', max: 30, base: 110, grow: 1.27, desc: '防线生命 +3%/级' },
    { id: 't5', n: '能量核心', icon: '⚡', max: 30, base: 160, grow: 1.32, desc: '能量恢复 +2.5%/级' },
    { id: 't6', n: '幸运 scav', icon: '🍀', max: 30, base: 130, grow: 1.29, desc: '金币获取 +3%/级' },
  ],
};

window.CFG = CFG;
window.EX = EX;
