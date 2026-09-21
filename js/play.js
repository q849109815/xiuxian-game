/* =========================================================
 * play.js —— 凡人修仙传 · 玩法扩展层
 * 覆盖资料中此前未接入的部分：
 *   11_资源货币（16种） / 17_活动系统（24条） / 04_任务（日常·周常·奇遇）
 *   18_社交宗门（仓库·BOSS·联盟·拍卖·称号·好友）
 * ========================================================= */

/* ============ 一、多货币钱包（11_资源货币） ============ */
const WALLET = {
  /** 初始化钱包 */
  init(p) {
    p.wallet = p.wallet || {};
    const defs = this.defs();
    for (const d of defs) if (p.wallet[d.id] === undefined) p.wallet[d.id] = 0;
    // 灵石沿用原字段，保持兼容
    if (!p.wallet.C001) p.wallet.C001 = p.stone || 0;
    return p.wallet;
  },
  defs() { return (window.GAME_CONTENT && GAME_CONTENT.currencies) || []; },
  get(p, id) { this.init(p); return p.wallet[id] || 0; },
  add(p, id, n) {
    this.init(p);
    p.wallet[id] = Math.max(0, (p.wallet[id] || 0) + n);
    if (id === 'C001') p.stone = p.wallet[id];   // 灵石双写，兼容旧逻辑
    return p.wallet[id];
  },
  cost(p, id, n) {
    if (this.get(p, id) < n) return false;
    this.add(p, id, -n);
    return true;
  },
  /** 顶部展示用的主要货币 */
  brief(p) {
    this.init(p);
    const d = this.defs();
    const pick = ['C001', 'C007', 'C014', 'C005', 'C015'];
    return pick.map((id) => {
      const it = d.find((x) => x.id === id);
      return it ? { icon: it.icon, name: it.name, v: p.wallet[id] || 0 } : null;
    }).filter(Boolean);
  },
  nameOf(id) {
    const it = this.defs().find((x) => x.id === id);
    return it ? it.name : id;
  },
};

/* ============ 二、活动系统（17_活动系统 24 条） ============ */
const ACTSYS = {
  S: () => window.GAME_SOCIAL || {},
  init(p) {
    p.act = p.act || { sign: { last: 0, days: 0, streak: 0 }, seven: {}, growth: {}, online: { claimed: 0 }, gifts: {} };
    WALLET.init(p);
    return p.act;
  },
  today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; },

  /* --- 每日签到 --- */
  canSign(p) { this.init(p); return p.act.sign.last !== this.today(); },
  sign(p) {
    this.init(p);
    if (!this.canSign(p)) return { ok: false, msg: '今日已签到' };
    const t = this.today();
    const y = new Date(Date.now() - 86400000);
    const ystr = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
    p.act.sign.streak = (p.act.sign.last === ystr) ? (p.act.sign.streak || 0) + 1 : 1;
    p.act.sign.last = t;
    p.act.sign.days = (p.act.sign.days || 0) + 1;
    const list = this.S().signRewards || [];
    const idx = ((p.act.sign.streak - 1) % 7);
    const rw = list[idx] || list[0] || { stone: 100 };
    const got = this.grant(p, rw);
    let msg = `签到成功（连续 ${p.act.sign.streak} 天）：${got}`;
    if (p.act.sign.streak % 7 === 0) {
      WALLET.add(p, 'C007', 5);
      msg += '　🎁 累计七日额外奖励：元宝×5';
    }
    return { ok: true, msg, streak: p.act.sign.streak };
  },
  /** 把奖励对象发放，返回文字描述 */
  grant(p, rw) {
    const out = [];
    if (!rw) return '无';
    if (rw.stone) { WALLET.add(p, 'C001', rw.stone); out.push(`灵石×${rw.stone}`); }
    if (rw.exp) { window.ENGINE.gainExp(p, rw.exp); out.push(`修为×${rw.exp}`); }
    if (rw.yuanbao) { WALLET.add(p, 'C007', rw.yuanbao); out.push(`元宝×${rw.yuanbao}`); }
    if (rw.contrib) { WALLET.add(p, 'C005', rw.contrib); out.push(`贡献×${rw.contrib}`); }
    if (rw.merit) { WALLET.add(p, 'C014', rw.merit); out.push(`功勋×${rw.merit}`); }
    if (rw.rep) { WALLET.add(p, 'C015', rw.rep); out.push(`声望×${rw.rep}`); }
    if (rw.herb) { window.ENGINE.addHerb(p, 'herb_green', rw.herb); out.push(`灵草×${rw.herb}`); }
    if (rw.ore) { window.ENGINE.addOre(p, 'ore_iron', rw.ore); out.push(`矿石×${rw.ore}`); }
    if (rw.pill) { window.ENGINE.addPill(p, 'pill_hp', rw.pill); out.push(`丹药×${rw.pill}`); }
    if (rw.frag) { WALLET.add(p, 'C009', rw.frag); out.push(`功法残篇×${rw.frag}`); }
    return out.join('、') || '无';
  },

  /* --- 七日修行 --- */
  sevenList() {
    const qs = (this.S().realQuests || {}).日常 || [];
    return ['初入七玄门', '习得一门功法', '斩杀妖兽×10', '炼制一枚丹药',
      '闭关修炼×3', '通关一次秘境', '突破一个小境界'].map((n, i) => ({
        id: 's7_' + i, day: i + 1, name: n,
        reward: { stone: 300 * (i + 1), exp: 800 * (i + 1), yuanbao: i >= 5 ? 3 : 0 },
      }));
  },
  sevenDone(p, id) {
    this.init(p);
    if (p.act.seven[id]) return { ok: false, msg: '已领' };
    p.act.seven[id] = 1;
    const it = this.sevenList().find((x) => x.id === id);
    return { ok: true, msg: this.grant(p, it.reward) };
  },

  /* --- 成长之路 --- */
  growthList() { return this.S().growthGoals || []; },
  growthCheck(p) {
    this.init(p);
    return this.growthList().map((g) => {
      const need = g.need || '';
      const m = need.match(/realm>=(\d+)/);
      const ok = m ? (p.realm >= +m[1]) : false;
      return { ...g, ok, claimed: !!p.act.growth[g.id] };
    });
  },
  growthClaim(p, id) {
    this.init(p);
    const g = this.growthList().find((x) => x.id === id);
    if (!g) return { ok: false, msg: '无此目标' };
    if (!this.growthCheck(p).find((x) => x.id === id).ok) return { ok: false, msg: '尚未达成' };
    if (p.act.growth[id]) return { ok: false, msg: '已领取' };
    p.act.growth[id] = 1;
    return { ok: true, msg: this.grant(p, g.reward) };
  },

  /* --- 在线奖励 --- */
  onlineList() { return this.S().onlineRewards || []; },
  onlineMin(p) {
    const t = (Date.now() - (p.loginAt || Date.now())) / 60000;
    return Math.floor(t);
  },
  onlineClaim(p, min) {
    this.init(p);
    if (p.act.online.claimed >= min) return { ok: false, msg: '已领' };
    if (this.onlineMin(p) < min) return { ok: false, msg: `需在线 ${min} 分钟` };
    const it = this.onlineList().find((x) => x.min === min);
    p.act.online.claimed = min;
    return { ok: true, msg: this.grant(p, it) };
  },

  /* --- 等级礼包 --- */
  giftList() {
    return [4, 8, 12, 16, 20, 24, 27].map((r, i) => ({
      id: 'gift_' + r, realm: r, price: 500 * Math.pow(4, i),
      reward: { stone: 2000 * Math.pow(4, i), exp: 10000 * Math.pow(4, i), yuanbao: (i + 1) * 2 },
    }));
  },
  giftBuy(p, id) {
    this.init(p);
    const g = this.giftList().find((x) => x.id === id);
    if (!g) return { ok: false, msg: '无此礼包' };
    if (p.realm < g.realm) {
      const nm = window.FRXX ? FRXX.realm(g.realm).name : '更高境界';
      return { ok: false, msg: `需【${nm}】方可购买` };
    }
    if (p.act.gifts[id]) return { ok: false, msg: '已购买' };
    if (!WALLET.cost(p, 'C001', g.price)) return { ok: false, msg: '灵石不足' };
    p.act.gifts[id] = 1;
    return { ok: true, msg: this.grant(p, g.reward) };
  },

  /* --- 活动总览 --- */
  all() {
    const list = (this.S().acts) || [];
    return list;
  },
  /** 可领取数（用于红点） */
  pending(p) {
    this.init(p);
    let n = 0;
    if (this.canSign(p)) n++;
    n += this.growthCheck(p).filter((x) => x.ok && !x.claimed).length;
    const om = this.onlineMin(p);
    n += this.onlineList().filter((x) => x.min <= om && p.act.online.claimed < x.min).length;
    return n;
  },
};

/* ============ 三、真实任务（04_任务系统 日常/周常/奇遇） ============ */
const REALQ = {
  S: () => window.GAME_SOCIAL || {},
  list(type) { return (this.S().realQuests || {})[type] || []; },
  init(p) {
    p.rq = p.rq || { daily: {}, weekly: {}, event: {}, lastDaily: '', lastWeekly: '' };
    const t = ACTSYS.today();
    if (p.rq.lastDaily !== t) { p.rq.daily = {}; p.rq.lastDaily = t; }
    const wk = Math.floor(Date.now() / 604800000);
    if (p.rq.lastWeekly !== wk) { p.rq.weekly = {}; p.rq.lastWeekly = wk; }
    return p.rq;
  },
  prog(p, q) {
    this.init(p);
    const k = q.type === '日常' ? 'daily' : q.type === '周常' ? 'weekly' : 'event';
    return p.rq[k][q.id] || 0;
  },
  done(p, q) { return this.prog(p, q) >= (q.need || 1); },
  claimed(p, q) {
    this.init(p);
    const k = q.type === '日常' ? 'daily' : q.type === '周常' ? 'weekly' : 'event';
    return !!p.rq[k]['c_' + q.id];
  },
  /** 推进进度 */
  add(p, kind, n = 1) {
    this.init(p);
    for (const t of ['日常', '周常']) {
      for (const q of this.list(t)) {
        if (q.kind !== kind) continue;
        const k = t === '日常' ? 'daily' : 'weekly';
        if (this.done(p, q)) continue;
        p.rq[k][q.id] = Math.min(q.need, (p.rq[k][q.id] || 0) + n);
      }
    }
  },
  claim(p, q) {
    this.init(p);
    if (!this.done(p, q)) return { ok: false, msg: `进度 ${this.prog(p, q)}/${q.need}` };
    if (this.claimed(p, q)) return { ok: false, msg: '已领取' };
    const k = q.type === '日常' ? 'daily' : q.type === '周常' ? 'weekly' : 'event';
    p.rq[k]['c_' + q.id] = 1;
    return { ok: true, msg: ACTSYS.grant(p, q.reward) };
  },
  /** 触发奇遇（随机） */
  roll(p) {
    const list = this.list('奇遇');
    if (!list.length) return null;
    if (Math.random() > 0.18) return null;
    return list[Math.floor(Math.random() * list.length)];
  },
};

/* ============ 四、宗门扩展（18_社交宗门） ============ */
const SECTEX = {
  S: () => window.GAME_SOCIAL || {},

  /* 仓库 */
  warehouse(p) { return p.sectWh || (p.sectWh = { items: [] }); },
  whDeposit(p, kind, id, count) {
    const wh = this.warehouse(p);
    const cap = ((this.S().sectWarehouse || {}).maxSlots) || 60;
    if (wh.items.length >= cap) return { ok: false, msg: '仓库已满' };
    wh.items.push({ kind, id, count, by: p.name, at: Date.now() });
    return { ok: true, msg: '已存入宗门仓库' };
  },
  whTake(p, i) {
    const wh = this.warehouse(p);
    const it = wh.items[i];
    if (!it) return { ok: false, msg: '无此物' };
    wh.items.splice(i, 1);
    if (it.kind === 'herb') window.ENGINE.addHerb(p, it.id, it.count);
    else if (it.kind === 'ore') window.ENGINE.addOre(p, it.id, it.count);
    return { ok: true, msg: `取出 ${it.count} 份` };
  },

  /* 宗门 BOSS */
  bossList() { return this.S().sectBoss || []; },
  fightBoss(p, id) {
    const b = this.bossList().find((x) => x.id === id);
    if (!b) return { ok: false, msg: '无此 BOSS' };
    if (!p.sectInfo) return { ok: false, msg: '需先加入宗门' };
    if (!WALLET.cost(p, 'C001', b.cost)) return { ok: false, msg: `灵石不足（需 ${b.cost}）` };
    const a = window.ENGINE.attrs(p);
    const power = a.atk * 8 + a.hp;
    const win = power > b.hp * 0.55 || Math.random() < 0.45;
    if (win) {
      ACTSYS.grant(p, b.reward);
      return { ok: true, msg: `击败【${b.name}】！贡献 +${b.reward.contrib}、灵石 +${b.reward.stone}`, win: true };
    }
    return { ok: true, msg: `不敌【${b.name}】，众人合力将其暂时逼退`, win: false };
  },

  /* 联盟 */
  ally(p) { return p.ally || null; },
  createAlly(p, name) {
    if (!p.sectInfo) return { ok: false, msg: '需先加入宗门' };
    const cost = (this.S().alliance || {}).createCost || 20000;
    if (!WALLET.cost(p, 'C001', cost)) return { ok: false, msg: `灵石不足（需 ${cost}）` };
    p.ally = { name, leader: p.name, sects: [p.sectInfo.sid || p.sectInfo.name], at: Date.now() };
    return { ok: true, msg: `联盟【${name}】创建成功` };
  },

  /* 拍卖行 */
  auctionFee() { return (this.S().auction || {}).fee || 0.05; },
};

/* ============ 五、称号 ============ */
const TITLE = {
  list() { return (window.GAME_SOCIAL || {}).titles || []; },
  init(p) { p.titles = p.titles || { owned: [], cur: null }; return p.titles; },
  /** 检查解锁条件 */
  check(p) {
    this.init(p);
    const out = [];
    for (const t of this.list()) {
      const need = t.need || '';
      let ok = false;
      if (need === '创建角色') ok = true;
      else if (need.startsWith('realm>=')) ok = p.realm >= +need.slice(7);
      else if (need.startsWith('kills>=')) ok = (p.stats.kills || 0) >= +need.slice(7);
      else if (need.startsWith('skills>=')) ok = (p.skills || []).length >= +need.slice(8);
      else if (need.startsWith('stone>=')) ok = (p.stone || 0) >= +need.slice(7);
      const owned = p.titles.owned.indexOf(t.id) >= 0;
      if (ok && !owned) p.titles.owned.push(t.id);
      out.push({ ...t, ok, owned: owned || ok });
    }
    return out;
  },
  wear(p, id) {
    this.init(p);
    const l = this.check(p).find((x) => x.id === id);
    if (!l || !l.owned) return { ok: false, msg: '尚未获得' };
    p.titles.cur = (p.titles.cur === id) ? null : id;
    return { ok: true, msg: p.titles.cur ? `佩戴【${l.name}】` : '已卸下称号', cur: p.titles.cur };
  },
  buff(p) {
    this.init(p);
    if (!p.titles.cur) return {};
    const t = this.list().find((x) => x.id === p.titles.cur);
    return (t && t.buff) || {};
  },
  curName(p) {
    this.init(p);
    if (!p.titles.cur) return '';
    const t = this.list().find((x) => x.id === p.titles.cur);
    return t ? `${t.icon} ${t.name}` : '';
  },
};

window.WALLET = WALLET;
window.ACTSYS = ACTSYS;
window.REALQ = REALQ;
window.SECTEX = SECTEX;
window.TITLE = TITLE;
