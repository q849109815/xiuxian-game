/* =========================================================
 * main.js —— 启动 / 登录 / 摇杆输入 / 战斗流程 / 存档
 * 依据资料 06 操作方案（移动端摇杆 + PC 备选）
 *        08 跳转流程（16 步）
 * ========================================================= */

let P = null, UID = null, saveT = null, hudT = null, MAINT = null;
let battleMode = 'normal', battleLevel = '1-1';

const MAIN = {
  savePath: null,

  async boot() {
    /* 表02 第15项 / 表23 第9项：热更新检查 */
    let up = { updated: false };
    try { up = OPS.checkUpdate(); } catch (e) { up = { updated: false }; }
    if (up.updated) {
      console.log('[热更新]', up.from, '→', up.ver);
      setTimeout(() => {
        if (window.UI && UI.toast) UI.toast('已更新到 ' + up.ver, 'ok');
      }, 1500);
    }
    /* 表37 埋点：game_start */
    try { OPS.track('game_start', { ver: up.ver }); } catch (e) {}
    const steps = [['正在装填弹药…', 12], ['加载武器数据…', 34], ['连接云端存档…', 58], ['读取先锋官档案…', 80], ['准备完毕', 100]];
    for (const [txt, v] of steps) {
      const b = document.getElementById('ldBar'), t = document.getElementById('ldTxt');
      if (b) b.style.width = v + '%'; if (t) t.textContent = txt;
      await new Promise((r) => setTimeout(r, 180));
    }
    await CFG.load();
    await Net.init().catch(() => {});
    const n = document.getElementById('lgNet');
    if (n) n.textContent = Net.online ? '● 已连接' : '○ 离线（可单机游玩）';
    UI.show('login');
  },

  /* 进入游戏（供微信登录 / 自动登录复用） */
  async enterWith(uid, name, gender) {
    UID = uid || (window.UA ? UA.acctId(UA.remembered().name || '') : '') || localStorage.getItem('zb_uid');
    localStorage.setItem('zb_uid', UID);
    return this.login(name, gender);
  },

  async login(name, gender) {
    UID = localStorage.getItem('zb_uid') || UID;
    if (!UID) { UID = 'u' + Math.random().toString(36).slice(2, 8); localStorage.setItem('zb_uid', UID); }
    const path = 'data/zb/players/' + UID + '.json';
    let p = null;
    const rr = await window.TMO(Net.read(path), 9000);
    if (rr && rr.data) p = rr.data;
    if (!p) {
      p = E.newPlayer(UID, name, gender);
      UI.toast('欢迎加入，先锋官！', 'ok');
    } else { p.name = p.name || name; p.lastSeen = Date.now(); }
    /* 封禁兜底：优先看账号文件（user.js 已拦），
     * 但离线或账号文件缺失时，玩家存档里的 p.ban 也要能拦住 */
    if (p.ban) {
      const until = p.banUntil || 0;
      if (!until || until > Date.now()) {
        UI.toast('🚫 该账号已被封禁：' + (p.banReason || '违规处理'), 'err');
        P = null; window.P = null;
        return;
      }
    }
    P = p; window.P = p; UI.P = p;
    this.savePath = path;
    this.migrate(p);
    UI.home(); UI.show('home');
    /* 拉取后台配置（活动 / 成就商店 / 活动商店 / 排行奖励 / 数值配置）。
     * 与邮件领取并行：claimMail 内部有 TMO 超时（邮件 5s + 维护 4s），
     * 若排在它后面，配置要等近 10 秒才到位，界面会先渲染成旧数据。 */
    this.syncCloudCfg().then(() => { try { UI.home(); } catch (e) {} }).catch(() => {});
    await this.claimMail();
    this.startSave(); this.loadLeaderboard();
  },

  /* 旧档字段补全 */
  migrate(p) {
    p.char = p.char || 'C01'; p.chars = p.chars || ['C01'];
    p.skin = p.skin || 'sk_c01a'; p.skins = p.skins || ['sk_c01a'];
    p.mat = p.mat || { M01: 0, M02: 0, M03: 0, M04: 0, M05: 0, P01: 0, P02: 0 };
    /* 旧存档兼容：把历史写入 p.use 的消耗品并回 p.mat（此前两字段分裂，
     * 导致已领的急救包/护盾/药剂在背包显示 ×0 且点不了"使用"） */
    if (p.use && typeof p.use === 'object') {
      for (const k in p.use) {
        const v = Number(p.use[k]) || 0;
        if (v > 0) p.mat[k] = (p.mat[k] || 0) + v;
      }
      p.use = {};
    }
    p.gun = p.gun || 'W01'; p.gunLv = p.gunLv || 1; p.gunAdv = p.gunAdv || 0;
    p.gunStats = p.gunStats || {}; p.gunOwn = p.gunOwn || ['W01'];
    p.chips = p.chips || {}; p.bag = p.bag || []; p.talents = p.talents || {};
    p.build = p.build || { hospital: 1, armory: 1, lab: 1, warehouse: 1 };
    p.cleared = p.cleared || {}; p.curLevel = p.curLevel || '1-1';
    p.stamina = p.stamina == null ? 100 : p.stamina;
    p.staminaAt = p.staminaAt || Date.now();
    p.tasks = p.tasks || { mainClaimed: [], dailyClaimed: [], dailyDate: '', dailyProg: {},
      weeklyClaimed: [], weeklyKey: '', weeklyProg: {}, achieveClaimed: [] };
    p.stats = p.stats || { kills: 0, runs: 0, bossKill: 0, noHitBest: 0, endlessBest: 0 };
    p.guide = p.guide || {}; p.ach = p.ach || 0; p.endlessTime = p.endlessTime || 0;
    p.mail = p.mail || [];
    E.resetTasks(p); E.tickStamina(p);
    /* 图鉴回填：补录已拥有但历史未记账的武器/皮肤 */
    try { if (E.codexBackfill) E.codexBackfill(p); } catch (e) {}
    /* 巡逻收益按章节同步（此前恒为 16 金币/小时） */
    try { if (E.syncPatrol) E.syncPatrol(p); } catch (e) {}
    /* GM「加属性」若填了持续时间，到期需扣回 ——
     * 否则临时增益变成永久增益，与后台配置意图不符。 */
    this.tickTempBuff(p);
    /* 登记到玩家索引：后台据此枚举全部玩家。
     * 只在注册/登录时写是不够的 —— 老账号从未写过，
     * 后台就只能靠不稳的目录枚举，结果长期只显示一个玩家。
     * 这里在每次启动/初始化时补登记（本机节流 6 小时一次）。 */
    this.tickIndex(p);
  },

  /* ---------- 玩家索引登记（节流） ---------- */
  tickIndex(p) {
    if (!p || !p.uid || !window.UA || !UA.idxAdd) return;
    try {
      const K = 'zb_idxat_' + p.uid;
      const last = Number(localStorage.getItem(K) || 0);
      if (Date.now() - last < 6 * 3600e3) return;
      localStorage.setItem(K, String(Date.now()));
      const name = (window.UA && UA.remembered ? UA.remembered().name : '') || p.name || '';
      UA.idxAdd(p.uid, name, p.name || name);
      /* 索引里补上等级与战力，后台列表不必逐个拉存档也能显示 */
      try { UA.idxPatch && UA.idxPatch(p.uid, { lv: p.lv || 1, pw: (E.power ? E.power(p) : 0), lastSeen: Date.now() }); } catch (e) {}
    } catch (e) {}
  },
  /* 临时增益到期回收 */
  tickTempBuff(p) {
    if (!p || !Array.isArray(p.tempBuff) || !p.tempBuff.length) return;
    const now = Date.now();
    const keep = [];
    let n = 0;
    p.tempBuff.forEach((b) => {
      if (!b || !b.attr) return;
      if ((b.exp || 0) > now) { keep.push(b); return; }
      /* 已过期：扣回当年加的值 */
      p[b.attr] = Math.max(0, (Number(p[b.attr]) || 0) - (Number(b.v) || 0));
      n++;
    });
    p.tempBuff = keep;
    if (n) { try { E.save(p); } catch (e) {} }
  },

  async save() {
    if (!P || !this.savePath) return;
    P.lastSeen = Date.now(); P.offlineAt = Date.now();
    try { await Net.write(this.savePath, P); } catch (e) {}
    this.uploadRank();
  },
  startSave() { if (saveT) clearInterval(saveT); saveT = setInterval(() => { if (P) this.save(); }, 30000); },
  async uploadRank() {
    if (!P || !Net.online) return;
    try {
      const r = await Net.read('data/zb/leaderboard.json');
      const lb = (r && r.data && r.data.list) ? r.data.list : [];
      const row = { u: P.uid, n: P.name, lv: E.curLevel(P), pw: E.power(P), eb: P.endlessBest || 0 };
      const i = lb.findIndex((x) => x.u === P.uid);
      if (i >= 0) lb[i] = row; else lb.push(row);
      lb.sort((a, b) => (b.eb || 0) - (a.eb || 0) || b.pw - a.pw);
      await Net.write('data/zb/leaderboard.json', { list: lb.slice(0, 50), updated: Date.now() });
    } catch (e) {}
  },
  async loadLeaderboard() {
    try { const r = await Net.read('data/zb/leaderboard.json'); window.LB = (r && r.data && r.data.list) ? r.data.list.slice(0, 30) : []; }
    catch (e) { window.LB = []; }
  },
  /* =========================================================
   * 云端配置同步（后台「活动/成就商店/活动商店/排行榜奖励/数值配置」
   * 五大模块写入的 JSON，此前游戏端一个都不读 —— 后台配了等于白配。
   * 登录时拉取，覆盖内存中的 EX 对应表；离线时用上次缓存。
   * ========================================================= */
  CFG_FILES: {
    activity: 'data/zb/activity.json',
    achshop: 'data/zb/achshop.json',
    actshop: 'data/zb/actshop.json',
    rankrw: 'data/zb/rankrw.json',
    cfg: 'data/zb/cfg.json',
  },
  async syncCloudCfg() {
    if (typeof Net === 'undefined' || typeof EX === 'undefined') return;
    for (const key in this.CFG_FILES) {
      const path = this.CFG_FILES[key];
      let db = null;
      try { const r = await window.TMO(Net.read(path), 6000, null); db = r && r.data; } catch (e) {}
      if (!db) {
        /* 离线：用上次缓存 */
        try { db = JSON.parse(localStorage.getItem('zb_cfg_' + key) || 'null'); } catch (e) {}
        if (!db) continue;
      } else {
        try { localStorage.setItem('zb_cfg_' + key, JSON.stringify(db)); } catch (e) {}
      }
      this.applyCloudCfg(key, db);
    }
  },
  /* 后台表 → 游戏端表的字段映射。
   * 两边字段完全不同，若直接整体覆盖，游戏端读到的 give/rw 全是 undefined，
   * 兑换后什么都拿不到 —— 等于后台配了但玩家领不到东西。 */
  /* 后台「刷新周期(天)」→ 游戏端限购周期 per
   *   0 / 空  → once（终身限购，不刷新）
   *   1       → day      7 → week      30 → month
   *   其他    → 就近取标准周期 */
  perFromDays(d) {
    const n = Number(d) || 0;
    if (n <= 0) return 'once';
    if (n <= 1) return 'day';
    if (n <= 7) return 'week';
    if (n <= 31) return 'month';
    return 'once';
  },
  applyCloudCfg(key, db) {
    try {
      const nm = (id) => { try { return (E.itemName ? E.itemName(id) : id) || id; } catch (e) { return id; } };
      if (key === 'activity' && Array.isArray(db.list)) {
        const base = (EX.activities || []).slice();
        db.list.forEach((a) => {
          if (!a || !a.id) return;
          const it = {
            id: a.id, n: a.name || a.n || '活动',
            startAt: a.startAt || 0, endAt: a.endAt || 0,
            cond: a.cond || {}, levelId: a.levelId || '',
            live: a.status === '运行中', status: a.status || '待开启',
            rw: a.rw || {}, desc: a.desc || '',
          };
          const i = base.findIndex((x) => x.id === a.id);
          if (i >= 0) base[i] = it; else base.push(it);
        });
        EX.activities = base;
      } else if (key === 'achshop' && Array.isArray(db.list)) {
        /* 后台 { id, item, n:数量, cost, limit, refresh, unlock }
         *  → 游戏端 { id, n:名称, t, cost, limit, per, need, give:{item:数量} } */
        EX.achShop = db.list.filter((x) => x && x.item).map((x, i) => ({
          id: x.id || ('AH' + i), n: nm(x.item) + '×' + (x.n || 1), t: '材料',
          cost: Number(x.cost) || 0, limit: Number(x.limit) || 0,
          /* 此前 per 硬编码 'day' —— 后台「刷新周期(天)」配了 7 天或 0（不刷新），
           * 游戏端一律按每天刷新，运营配置的限购周期完全不生效。
           * 现在按后台天数映射成限购周期。 */
          per: this.perFromDays(Number(x.refresh)),
          need: 0, refresh: Number(x.refresh) || 0,
          unlock: x.unlock || '', give: { [x.item]: Number(x.n) || 1 },
        }));
      } else if (key === 'actshop' && Array.isArray(db.list)) {
        EX.eventShop = db.list.filter((x) => x && x.item).map((x, i) => ({
          id: x.id || ('AS' + i), n: nm(x.item) + '×' + (x.n || 1), t: '材料',
          act: x.act || '', cost: Number(x.cost) || 0, limit: Number(x.limit) || 0,
          daily: Number(x.daily) || 0, refresh: Number(x.refresh) || 0,
          /* 注意单位差异：活动商店后台的「刷新间隔」单位是【小时】（默认 24），
           * 成就商店的「刷新周期」单位是【天】（默认 7）。
           * 此前统一按天解释，24 小时会被误判成 24 天。
           * 活动商店另有独立的「每日限购」字段，按它决定周期更准确。 */
          per: (Number(x.daily) || 0) > 0 ? 'day' : 'once',
          give: { [x.item]: Number(x.n) || 1 },
        }));
      } else if (key === 'rankrw' && Array.isArray(db.list)) {
        /* 后台 { id, board, a:名次起, b:名次止, item, n:数量, settle:天数, stack }
         *  → 游戏端 { id, board, rank, lo, hi, rw:{item:数量}, cyc, stack }
         *
         * 严重 BUG 修复（两处）：
         *  ① board 此前硬编码为 '无尽生存榜' —— 后台根本没有榜单类型选项，
         *     于是战力榜 / 活动冲榜的奖励永远配不出来，全被塞进无尽榜。
         *  ② 整体覆盖 EX.rankRewards —— 后台只配 1 条，游戏端原本 3 个榜单
         *     共 10 条默认奖励会被全部抹掉，玩家反而少了一大半奖励。
         *     现在改成「按榜单合并」：后台配的榜单替换，没配的保留默认。
         *  ③ settle 后台单位是「天」，此前被当成「小时」显示，改为 天。 */
        const BOARDS = ['无尽生存榜', '战力榜', '活动冲榜'];
        const incoming = db.list.filter((x) => x && x.item).map((x, i) => ({
          id: x.id || ('RW' + i),
          board: BOARDS.indexOf(x.board) >= 0 ? x.board : '无尽生存榜',
          rank: '第' + (x.a || 1) + '-' + (x.b || 1) + '名',
          lo: Number(x.a) || 1, hi: Number(x.b) || 1,
          rw: { [x.item]: Number(x.n) || 1 },
          cyc: x.settle ? (x.settle + ' 天') : '每期',
          stack: !!x.stack,
        }));
        /* 后台覆盖到的榜单 → 用后台数据；未覆盖的榜单 → 保留默认配置 */
        const touched = Array.from(new Set(incoming.map((x) => x.board)));
        const base = (EX.rankRewards || []).filter((x) => touched.indexOf(x.board) < 0);
        EX.rankRewards = base.concat(incoming);
      } else if (key === 'cfg') {
        /* 后台「配置热更新」上传的是用户手填的裸 JSON（如 {"STAMINA_MAX":200}），
         * 经 Object.assign 合并后落在文件顶层，并没有 data 这一层；
         * 而此前只认 db.data —— 后台热更的数值改了，游戏端完全读不到。
         * 现在两种结构都兼容：有 data 用 data，否则取顶层（跳过 _hotfix 元信息）。 */
        const src = (db.data && typeof db.data === 'object') ? db.data : db;
        Object.keys(src || {}).forEach((k) => {
          if (k === '_hotfix' || k === 'data') return;
          if (EX[k] !== undefined && src[k] !== null) EX[k] = src[k];
        });
      }
    } catch (e) { console.error('applyCloudCfg ' + key, e); }
  },

  async claimMail() {
    if (!P) return;
    let ch = false;
    /* 1) 玩家个人邮件（后台单发直接写入存档） */
    for (const m of (P.mail || [])) {
      if (m.got) continue;
      m.got = 1; ch = true;
      this.giveRw(m.rw || { gold: m.gold || 0, dia: m.dia });
      UI.toast('📮 ' + (m.t || '邮件') + ' 奖励已发放', 'ok');
    }
    /* 2) 后台全服/定向邮件（云端 mail.json） */
    try {
      const r = await window.TMO(Net.read('data/zb/mail.json'), 5000);
      const db = (r && r.data) || null;
      if (db && (db.list || []).length) {
        const now = Date.now();
        let touched = false;
        for (const m of db.list) {
          if (m.startAt && m.startAt > now) continue;
          if (m.expireAt && m.expireAt < now) continue;
          if ((m.claimed || []).indexOf(P.uid) >= 0) continue;
          /* 定向：检查 uid 列表或筛选条件 */
          if (m.type === 'target') {
            const hit = (m.uids || []).indexOf(P.uid) >= 0
              || this.matchFilter(P, m.filter);
            if (!hit) continue;
          }
          m.claimed = m.claimed || [];
          m.claimed.push(P.uid);
          touched = true; ch = true;
          this.giveRw(m.rw || {});
          UI.toast('📢 ' + (m.title || '全服邮件') + ' 奖励已发放', 'ok');
        }
        if (touched) { try { await Net.write('data/zb/mail.json', db, '领取邮件'); } catch (e) {} }
      }
    } catch (e) {}
    /* 3) 检查维护模式 */
    try {
      const r = await window.TMO(Net.read('data/zb/server.json'), 4000);
      if (r && r.data && r.data.mode === '维护') {
        UI.toast('🖥️ ' + (r.data.msg || '服务器维护中'), 'err');
        MAINT = r.data;
        /* 此前 MAINT 只被赋值、从未被读取 —— 后台开了维护模式，
         * 玩家只看到一行提示，照样进战斗、照样玩，维护形同虚设。
         * 现在真正拦截：挡住战斗入口并显示全屏维护页。 */
        if (window.UI && UI.showMaint) UI.showMaint(r.data);
      }
    } catch (e) {}
    if (ch) { UI.home(); await this.save(); }
  },
  /* 按后台筛选条件匹配玩家 */
  matchFilter(p, f) {
    if (!f) return false;
    const lv = p.lv || 1;
    const cleared = Object.keys(p.cleared || {}).length;
    if (f.lvMin != null && lv < f.lvMin) return false;
    if (f.lvMax != null && lv > f.lvMax) return false;
    if (f.clearedMin != null && cleared < f.clearedMin) return false;
    if (f.regAfter != null && (p.created || 0) < f.regAfter) return false;
    return true;
  },
  /* 通用发放（支持物品 id → 字段映射） */
  giveRw(rw) {
    if (!P || !rw) return;
    Object.keys(rw).forEach((k) => {
      const v = Number(rw[k]) || 0;
      if (!v) return;
      if (k === 'gold' || k === 'diamond' || k === 'ach' || k === 'stamina' || k === 'evToken') {
        P[k] = (P[k] || 0) + v;
      } else {
        /* BUG修复：消耗品此前写入 p.use，但背包「消耗」页与 useItem() 都读 p.mat，
         * 导致邮件/礼包发的急救包、护盾等在背包里恒显示 ×0 且无法使用。
         * 统一到 p.mat 一个字段。 */
        P.mat = P.mat || {};
        P.mat[k] = (P.mat[k] || 0) + v;
      }
    });
  },
  /* ============ 礼包码兑换 ============ */
  async redeemCode(code) {
    if (!P) return { ok: false, msg: '未登录' };
    code = (code || '').trim().toUpperCase();
    if (!code) return { ok: false, msg: '请输入兑换码' };
    let db = null;
    try { const r = await Net.read('data/zb/cdkey.json'); db = r && r.data; } catch (e) {}
    if (!db || !(db.codes || []).length) return { ok: false, msg: '礼包码服务不可用' };
    const c = db.codes.find((x) => x.code === code);
    if (!c) return { ok: false, msg: '兑换码不存在' };
    if (c.status === '作废') return { ok: false, msg: '该兑换码已作废' };
    if ((c.used || 0) >= (c.maxUse || 1)) return { ok: false, msg: '该兑换码已被使用' };
    if (c.exp && c.exp < Date.now()) return { ok: false, msg: '该兑换码已过期' };
    if (c.bindUid && c.bindUid !== P.uid) return { ok: false, msg: '该兑换码已绑定其他账号' };
    if ((c.usedBy || []).indexOf(P.uid) >= 0) return { ok: false, msg: '您已兑换过该码' };
    const tpl = (db.templates || []).find((t) => t.id === c.tpl);
    if (!tpl) return { ok: false, msg: '礼包模板缺失' };
    if (tpl.once && (c.usedBy || []).indexOf(P.uid) >= 0) return { ok: false, msg: '每人限领 1 次' };
    this.giveRw(tpl.items || {});
    c.used = (c.used || 0) + 1;
    c.usedBy = c.usedBy || [];
    c.usedBy.push(P.uid);
    c.usedAt = Date.now();
    if (c.used >= c.maxUse) c.status = '已使用';
    try { await Net.write('data/zb/cdkey.json', db, '兑换 ' + code); } catch (e) {}
    try { OPS.track('iap_purchase', { cdkey: code }); } catch (e) {}
    await this.save();
    const got = Object.keys(tpl.items || {}).map((k) => E.itemName(k) + '×' + tpl.items[k]).join('、');
    return { ok: true, msg: '兑换成功：' + (got || '礼包') };
  },
  toast(m, c) { UI.toast(m, c); },
};

/* =========================================================
 * 战斗流程（资料 08 跳转流程）
 * ========================================================= */
function startBattle(mode, levelId) {
  if (!P) return;
  /* 维护模式守卫：后台开启后一律不放行（此前完全没拦截） */
  if (window.UI && UI.guardBattle && !UI.guardBattle()) return;
  battleMode = mode;
  let id = levelId;
  if (mode === 'endless') {
    if (!E.endlessUnlocked(P)) { UI.toast('无尽模式需通关 3-3 解锁', 'err'); return; }
    id = 'endless';
  } else {
    id = levelId || E.curLevel(P);
    if (!E.levelUnlocked(P, id)) { UI.toast('该关卡尚未解锁', 'err'); return; }
  }
  /* 每日挑战次数（截图51：「今日剩余次数：3/3」）
   * 无尽模式不占用该次数 */
  if (mode !== 'endless') {
    const rn = E.useRun ? E.useRun(P) : { ok: true };
    if (!rn.ok) { UI.toast(rn.msg, 'err'); return; }
  }
  /* 体力检查 */
  const sp = E.spendStamina(P, id);
  if (!sp.ok) { UI.toast(sp.msg, 'err'); return; }
  battleLevel = id;

  UI.show('battle');
  /* 音频：战斗 BGM */
  if (window.SND) {
    const isBoss = BT.run && (BT.run.def.cond === 'boss' || BT.run.def.cond === 'bossAll');
    SND.bgm(id === 'endless' ? 'endless' : isBoss ? 'boss' : 'battle');
  }
  BT.joy = { x: 0, y: 0 };
  const knob = document.getElementById('joyKnob');
  if (knob) knob.style.transform = 'translate(0,0)';
  BT.attach(document.getElementById('C'));
  BT.start(P, id, { endless: id === 'endless', cb: onBattleEnd });
  /* HUD 初始化失败也不能影响战斗本体 */
  try { UI.btInit(P, id, id === 'endless'); }
  catch (e) { console.error('btInit:', e); }
  if (hudT) clearInterval(hudT);
  hudT = setInterval(() => { if (BT.on || (BT.run && !BT.run.over)) UI.btTick(); }, 100);

  /* 引导：移动 / 射击 */
  if (!P.guide[1]) { P.guide[1] = 1; UI.toast('① 拖动左下摇杆移动角色', 'ok'); }
  else if (!P.guide[2]) { P.guide[2] = 1; UI.toast('② 自动瞄准射击，怪物来袭', 'ok'); }
}

function onBattleEnd(res, d) {
  if (hudT) { clearInterval(hudT); hudT = null; }
  if (window.SND) { SND.play(res === 'win' ? 'win' : 'lose'); SND.bgm('base'); }
  const r = BT.run;
  const kills = d.kills || 0;
  const endless = r.endless;
  /* 资料奖励表 */
  let rw = { gold: 0, diamond: 0 };
  if (res === 'win') {
    const def = r.def;
    if (endless) {
      rw.gold = 100 + r.wave * 20;
      P.endlessBest = Math.max(P.endlessBest || 0, r.wave);
    } else {
      const lr = def.rw || {};
      rw.gold = lr.gold || 0;
      for (const k in lr) {
        if (k === 'gold') continue;
        if (k === 'chip') { for (let i = 0; i < lr[k]; i++) P.bag.push(E.rollChipById('CH01')); }
        else P.mat[k] = (P.mat[k] || 0) + lr[k];
      }
    }
  } else {
    rw.gold = Math.floor((d.rw && d.rw.gold) || 0);
  }
  /* 关卡掉落金币 */
  rw.gold += Math.round((d.rw && d.rw.gold) || 0);
  P.gold += rw.gold; P.diamond += rw.diamond;

  /* 表25 #1 角色等级：按击杀数结算经验（怪物表 xp 字段加权，受天赋/建筑经验加成） */
  const xpGain = Math.round(kills * 4 * (E.attrs(P).xpMul || 1));
  const lvr = E.addXp(P, xpGain);
  /* 结算面板读的是 rw.exp（此前未赋值，界面恒显示兜底值 15 EXP，
   * 而玩家实际拿到的是按击杀计算的数百经验 —— 显示与实际严重不符） */
  rw.exp = xpGain;
  rw.xp = xpGain;
  if (lvr.ups > 0) setTimeout(() => { if (window.UI) UI.toast('🎉 ' + lvr.msg, 'ok'); }, 900);

  /* 统计与任务推进 */
  const stars = (res === 'win' && !endless) ? E.clearLevel(P, r.def.id, r.maxHp ? r.hp / r.maxHp : 0) : 0;
  const isBoss = !endless && (r.def.cond === 'boss' || r.def.cond === 'bossAll');
  E.pushStats(P, {
    kills, clear: res === 'win' ? 1 : 0,
    boss: (isBoss && res === 'win') ? 1 : 0,
    noHit: (res === 'win' && r.hp >= r.maxHp) ? kills : 0,
    endlessSec: endless ? r.time : 0,
  });
  if (endless) P.endlessTime = Math.max(P.endlessTime || 0, Math.floor(r.time));

  /* 引导标记 */
  if (res === 'win') { P.guide[5] = 1; P.guide[6] = 1; }
  if (!P.guide[3]) P.guide[3] = 1;

  UI.home();
  UI.showResult(res, { kills, time: r.time, rw, stars });
  /* 表21：第一次通关 → 通关引导；首次失败 → 广告复活引导 */
  if (UI.guideTrigger) {
    if (res === 'win') UI.guideTrigger('win');
    else if (res === 'lose') UI.guideTrigger('fail');
  }
  if (stars) UI.toast('⭐ 获得 ' + stars + ' 星评价', 'ok');
  MAIN.save();
}

/* =========================================================
 * 输入：虚拟摇杆 + 键盘（资料 06）
 * ========================================================= */
function bindJoystick() {
  const joy = document.getElementById('joy'), knob = document.getElementById('joyKnob');
  if (!joy) return;
  const R = 34;
  let id = null, cx = 0, cy = 0;
  const setFrom = (tx, ty) => {
    let dx = tx - cx, dy = ty - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = dx / len * R; dy = dy / len * R; }
    BT.joy.x = dx / R; BT.joy.y = dy / R;
    if (knob) knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  const down = (e) => {
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const b = joy.getBoundingClientRect();
    cx = b.left + b.width / 2; cy = b.top + b.height / 2;
    id = t.identifier; setFrom(t.clientX, t.clientY); e.preventDefault();
  };
  const move = (e) => {
    if (id === null) return;
    const ts = e.changedTouches ? Array.from(e.changedTouches) : [e];
    const t = ts.find((x) => x.identifier === id); if (!t) return;
    setFrom(t.clientX, t.clientY); e.preventDefault();
  };
  const up = (e) => {
    if (id === null) return;
    const ts = e.changedTouches ? Array.from(e.changedTouches) : [e];
    if (!ts.some((x) => x.identifier === id)) return;
    id = null; BT.joy.x = 0; BT.joy.y = 0;
    if (knob) knob.style.transform = 'translate(0,0)';
  };
  joy.addEventListener('touchstart', down, { passive: false });
  joy.addEventListener('touchmove', move, { passive: false });
  joy.addEventListener('touchend', up); joy.addEventListener('touchcancel', up);
  joy.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

function bindKeys() {
  const keys = {};
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(); keys[k] = 1;
    if (!BT.on) return;
    if (k === 'r') BT.reload();
    if (k === 'escape') { BT.paused = true; document.getElementById('pause').classList.add('on'); }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = 0; });
  setInterval(() => {
    if (!BT.on) return;
    let x = 0, y = 0;
    if (keys['a'] || keys['arrowleft']) x -= 1;
    if (keys['d'] || keys['arrowright']) x += 1;
    if (keys['w'] || keys['arrowup']) y -= 1;
    if (keys['s'] || keys['arrowdown']) y += 1;
    if (x || y) { BT.joy.x = x; BT.joy.y = y; }
  }, 40);
}

/* =========================================================
 * 事件绑定
 * ========================================================= */
function bindAll() {
  let gender = 'm';
  $$('#lgGender .gd').forEach((b) => {
    b.onclick = () => { gender = b.dataset.g; $$('#lgGender .gd').forEach((x) => x.classList.remove('on')); b.classList.add('on'); };
  });
  const lb = document.getElementById('lgBtn');
  if (lb) lb.onclick = async () => {
    const nm = (document.getElementById('lgName').value || '').trim() || '先锋官';
    if (nm.length < 2) { UI.toast('代号至少 2 个字', 'err'); return; }
    UI.toast('正在进入战区…'); await MAIN.login(nm, gender);
  };

  const hg = document.getElementById('hmGo');
  if (hg) hg.onclick = () => UI.open('level');
  const he = document.getElementById('hmEndless');
  if (he) he.onclick = () => startBattle('endless');

  /* 战斗：倍速 / 暂停 / 自动 / 切换 */
  const spBtn = $('#btSpeed');
  if (spBtn) spBtn.onclick = () => {
    /* 截图：X1 → X1.5 → X2 */
    const seq = [1, 1.5, 2];
    const i = seq.indexOf(BT.speed || 1);
    BT.speed = seq[(i + 1) % seq.length];
    spBtn.textContent = 'X' + BT.speed;
    if (window.SND) SND.play('click');
  };
  const psBtn = $('#btPause');
  if (psBtn) psBtn.onclick = () => {
    BT.paused = !BT.paused;
    psBtn.textContent = BT.paused ? '▶' : '⏸';
    if (window.SND) SND.play('click');
  };
  const auBtn = $('#btAuto');
  if (auBtn) auBtn.onclick = () => {
    BT.auto = !BT.auto;
    auBtn.classList.toggle('on', BT.auto);
    UI.toast(BT.auto ? '自动战斗 开' : '自动战斗 关', 'ok');
    if (window.SND) SND.play('click');
  };
  const swBtn = $('#btSwitch');
  if (swBtn) swBtn.onclick = () => {
    UI.toast('长按战场可快速射击', 'ok');
    if (window.SND) SND.play('click');
  };

  $$('.hm-nav .hn').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.p;
      if (k === 'battle') { UI.open('level', '章节'); return; }
      $$('.hm-nav .hn').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      UI.open(k);
    };
  });
  $$('.hm-nav2 .hn2').forEach((b) => { b.onclick = () => { UI.open(b.dataset.p); }; });

  const px = document.getElementById('pnX'); if (px) px.onclick = () => UI.close();
  const pm = document.getElementById('pnMask'); if (pm) pm.onclick = () => UI.close();

  const bp = document.getElementById('btPause');
  if (bp) bp.onclick = () => { BT.paused = true; document.getElementById('pause').classList.add('on'); };
  const pr = document.getElementById('psResume');
  if (pr) pr.onclick = () => { BT.paused = false; document.getElementById('pause').classList.remove('on'); };
  const pq = document.getElementById('psQuit');
  if (pq) pq.onclick = () => { document.getElementById('pause').classList.remove('on'); BT.quit(); };

  const rl = document.getElementById('btReload');
  if (rl) rl.onclick = () => BT.reload();

  const cr = document.getElementById('chRefresh');
  if (cr) cr.onclick = () => { UI.toast('已刷新选项', 'ok'); BT.refreshOffer(); };

  const ra = document.getElementById('rsAgain');
  if (ra) ra.onclick = () => { UI.hideResult(); startBattle(battleMode, battleLevel); };
  const rn = document.getElementById('rsNext');
  if (rn) rn.onclick = () => {
    UI.hideResult();
    if (battleMode === 'endless') startBattle('endless');
    else {
      const nx = E.nextLevel(battleLevel);
      if (nx) startBattle('normal', nx); else { UI.home(); UI.show('home'); }
    }
  };
  /* ================= 账号密码登录 / 注册 ================= */
  const lgTip = document.getElementById('lgTip');
  const rgTip = document.getElementById('rgTip');
  const lgForm = document.getElementById('lgLoginForm');
  const rgForm = document.getElementById('lgRegForm');
  let rgGender = 'm';

  const sayTip = (el, m, ok) => {
    if (!el) return;
    el.textContent = m || '';
    el.style.color = ok ? 'var(--green)' : '#ff8fa4';
  };

  /* 登录 ⇄ 注册 切换 */
  const goReg = document.getElementById('lgGoReg');
  if (goReg) goReg.onclick = () => {
    if (lgForm) lgForm.style.display = 'none';
    if (rgForm) rgForm.style.display = 'flex';
    sayTip(lgTip, ''); sayTip(rgTip, '');
  };
  const goLogin = document.getElementById('lgGoLogin');
  if (goLogin) goLogin.onclick = () => {
    if (rgForm) rgForm.style.display = 'none';
    if (lgForm) lgForm.style.display = 'flex';
    sayTip(lgTip, ''); sayTip(rgTip, '');
  };
  const gbtns = document.querySelectorAll('#rgGender .gd');
  gbtns.forEach((b) => { b.onclick = () => {
    gbtns.forEach((x) => x.classList.remove('on'));
    b.classList.add('on'); rgGender = b.dataset.g || 'm';
  }; });

  /* 记住的账号自动填入 */
  const rem = UA.remembered();
  const lgUser = document.getElementById('lgUser');
  if (lgUser && rem.name) lgUser.value = rem.name;

  /* ---- 登录 ---- */
  const lgBtn = document.getElementById('lgBtn');
  if (lgBtn) lgBtn.onclick = async () => {
    const u = (document.getElementById('lgUser') || {}).value || '';
    const w = (document.getElementById('lgPwd') || {}).value || '';
    if (!u.trim()) { sayTip(lgTip, '请输入账号'); return; }
    if (!w) { sayTip(lgTip, '请输入密码'); return; }
    lgBtn.disabled = true; lgBtn.textContent = '登录中…';
    sayTip(lgTip, '正在验证…', true);
    let r;
    try { r = await UA.login(u.trim(), w); }
    catch (e) { r = { ok: false, msg: '登录异常：' + e.message }; }
    lgBtn.disabled = false; lgBtn.textContent = '登 录';
    if (!r.ok) { sayTip(lgTip, r.msg); return; }
    const keep = document.getElementById('lgKeep');
    if (keep && !keep.checked) localStorage.removeItem('zb_auto');
    sayTip(lgTip, '登录成功，正在进入…', true);
    localStorage.setItem('zb_uid', r.id);
    await MAIN.login(r.nick || u.trim(), r.gender || 'm');
  };

  /* ---- 注册 ---- */
  const rgBtn = document.getElementById('rgBtn');
  if (rgBtn) rgBtn.onclick = async () => {
    const u = (document.getElementById('rgUser') || {}).value || '';
    const w = (document.getElementById('rgPwd') || {}).value || '';
    const w2 = (document.getElementById('rgPwd2') || {}).value || '';
    const nk = (document.getElementById('rgNick') || {}).value || '';
    if (!u.trim()) { sayTip(rgTip, '请输入账号'); return; }
    if (!w) { sayTip(rgTip, '请输入密码'); return; }
    if (w !== w2) { sayTip(rgTip, '两次输入的密码不一致'); return; }
    rgBtn.disabled = true; rgBtn.textContent = '注册中…';
    sayTip(rgTip, '正在创建账号…', true);
    let r;
    try { r = await UA.register(u.trim(), w, nk.trim(), rgGender); }
    catch (e) { r = { ok: false, msg: '注册异常：' + e.message }; }
    rgBtn.disabled = false; rgBtn.textContent = '注 册 并 进 入';
    if (!r.ok) { sayTip(rgTip, r.msg); return; }
    sayTip(rgTip, '注册成功，正在进入…', true);
    localStorage.setItem('zb_uid', r.id);
    await MAIN.login(r.nick, r.gender);
  };

  /* 忘记密码 */
  const lgFind = document.getElementById('lgFind');
  if (lgFind) lgFind.onclick = () => {
    const u = ((document.getElementById('lgUser') || {}).value || '').trim();
    if (!u) { sayTip(lgTip, '请先填写账号名'); return; }
    sayTip(lgTip, '提示：账号数据保存在云端仓库。如需重置密码，请联系管理员在后台「账号管理 → 重置密码」操作。', true);
  };

  /* ---- 自动登录 ---- */
  if (UA.shouldAuto()) {
    const rr = UA.remembered();
    if (rr.uid) {
      sayTip(lgTip, '正在自动登录…', true);
      (async () => {
        try { await MAIN.login(rr.nick || rr.name || '先锋官', rr.gender || 'm'); }
        catch (e) { sayTip(lgTip, ''); }
      })();
    }
  }

  const rb = document.getElementById('rsBack');
  if (rb) rb.onclick = () => { UI.hideResult(); UI.home(); UI.show('home'); if (window.SND) SND.bgm('base'); };

  document.addEventListener('visibilitychange', () => { if (document.hidden && BT.on) BT.paused = true; });
  window.addEventListener('beforeunload', () => { if (P) MAIN.save(); });

  bindJoystick(); bindKeys();
}

window.addEventListener('DOMContentLoaded', async () => {
  bindAll();
  await MAIN.boot();
});

window.MAIN = MAIN;
window.startBattle = startBattle;
