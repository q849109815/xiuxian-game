/* =========================================================
 * main.js —— 启动 / 登录 / 战斗流程 / 存档
 * 依据资料 06 操作方案（自动瞄准 + PC 键盘备选）
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
    /* 凭据失效必须显式提示：此时读写存档全部失败，
     * 玩家会读到本机旧缓存（表现为"自己回档"）却毫无察觉。
     * 实测事故：线上 net.js 令牌被截断为 32 字符 → 全站 401 → 全站回档。 */
    if (n) {
      n.textContent = Net.authFail ? '⚠ 存档服务异常（进度仅存本机）'
        : (Net.online ? '● 已连接' : '○ 离线（可单机游玩）');
      if (Net.authFail) n.style.color = '#ff6b6b';
    }
    /* 需求：每次打开都必须输入账号密码。
     * 清掉上一次留下的登录态（zb_uid），否则残留 UID 会让 MAIN.login 的
     * 「无账号不得进入」守卫失效 —— 拿着旧 UID 一样能直接读存档。
     * 账号名 zb_name 保留，仅用于回填输入框。 */
    try { localStorage.removeItem('zb_uid'); localStorage.removeItem('zb_auto'); } catch (e) {}
    UID = null;
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
    /* 需求：必须输入账号登录 —— 未经账号密码校验不得凭空开户进入游戏。
     * 旧行为：UID 为空时随机生成 'u'+随机串 并直接进主界面，
     *   等于任何一次 MAIN.login 调用都能绕过登录页生成一个游客存档。
     * 现行为：没有账号标识就直接退回登录界面。
     * （正常路径：登录/注册按钮先跑 UA.login / UA.register 校验，
     *   通过后才写入 zb_uid，所以正常玩家不受影响。） */
    if (!UID) {
      try {
        if (window.UI && UI.show) UI.show('login');
        if (window.UI && UI.toast) UI.toast('请先输入账号登录', 'err');
      } catch (e) {}
      return;
    }
    const path = 'data/zb/players/' + UID + '.json';
    let p = null;
    const rr = await window.TMO(Net.read(path), 9000);
    if (rr && rr.data) p = rr.data;
    /* 关页面快照兜底：上次直接关标签页 / 手机切走时，异步上传来不及完成，
     * 当时已在 pagehide 里同步存了一份到 localStorage。这里如果本地比云端新
     * （云端那次写入根本没成功），就用本地这份，否则整局进度白丢。
     *
     * ⚠️ 严重回档 BUG 修复：原判据只看 offlineAt 谁大，而 syncSnap() 在
     *   Net.write 【之前】无条件把 offlineAt 刷成 Date.now()，且不关心写入
     *   是否成功。于是产生「旧内容 + 最新时间戳」的快照：
     *     设备A 页面停在进度 X（金币1万），自动存档每 30 秒跑一次，
     *       syncSnap 持续刷新快照时间戳，而 Net.write 被 stale 守卫拒绝；
     *     玩家在设备B 玩到进度 Y（金币5万）并成功写入云端；
     *     回到设备A 刷新 → 快照时间戳比云端新 → 采纳 X → 金币 5万变1万。
     *   实测确认（见 t_rollback）：多设备场景下必然回档，玩家什么都没做。
     *
     * 正确判据：先比【派生基准】_baseAt（这份数据是从云端哪一版来的）。
     *   快照的基准早于云端当前时间 → 说明云端已被别的设备推进，
     *   这份快照是【基于旧版】继续玩的，绝不能覆盖云端新档。
     *   只有在基准不低于云端时，才继续比较内容时间决定用谁。 */
    const snap = this.loadSnap(UID);
    if (snap) {
      const sBase = Number(snap._baseAt) || Number(snap.offlineAt) || 0;
      const cAt = Number(p && p.offlineAt) || 0;
      const staleBase = cAt > 0 && sBase > 0 && sBase < cAt;
      if (staleBase) {
        /* 云端已被别处推进，本地这份是旧版派生 → 丢弃，保住云端新进度 */
        try { this.dropSnap(UID); } catch (e) {}
        try { console.log('[存档] 本地快照基于旧版，已丢弃，采用云端新进度'); } catch (e) {}
      } else if (!p || (Number(snap.offlineAt) || 0) > cAt) {
        p = snap;
        try { UI.toast('已恢复上次未保存的进度', 'ok'); } catch (e) {}
      }
    }
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
    /* 读档基准：记录"内存里这份数据来自云端哪一版"。
     * 存档写入时用它判断本地是否已被云端超越（多设备 / 读到旧分支），
     * 防止把旧档写回去覆盖别人的新进度（回档）。 */
    p._baseAt = Number(p.offlineAt) || 0;
    this.savePath = path;
    this.migrate(p);
    UI.home(); UI.show('home');
    /* 凭据失效：读到的多半是本机旧缓存，必须让玩家知道"这不是回档，是读不到云端"，
     * 否则他会以为进度丢了、反复重玩，越玩越乱。 */
    if (Net.authFail) {
      try { UI.toast('⚠️ 存档服务凭据失效，当前显示的是本机存档，进度无法上传', 'err'); } catch (e) {}
    }
    /* 拉取后台配置（活动 / 成就商店 / 活动商店 / 排行奖励 / 数值配置）。
     * 与邮件领取并行：claimMail 内部有 TMO 超时（邮件 5s + 维护 4s），
     * 若排在它后面，配置要等近 10 秒才到位，界面会先渲染成旧数据。 */
    this.syncCloudCfg().then(() => { try { UI.home(); } catch (e) {} }).catch(() => {});
    await this.claimMail();
    this.startSave(); this.loadLeaderboard(); this.startCfgSync();
    /* 消费运营指令队列（后台补发 / 回档）：登录即消费一次，之后每 5 分钟一次 */
    this.consumeOps();
    this.startOpSync();
  },

  /* ---------- 后台配置周期性重拉 ----------
   * BUG：syncCloudCfg() 此前【只在登录时调用一次】。
   * 后果：运营在后台改了数值配置 / 活动商店 / 成就商店 / 排行榜奖励后，
   *   只要玩家不刷新页面、不重新登录，就永远读到登录那一刻的旧表。
   *   典型场景：发现 BOSS 太肉、紧急热更调低血量 —— 在线玩家全都看不到，
   *   只能在群里喊"刷新页面"，且无法确认谁刷了。
   * 现在两个触发点：
   *   ① 页面从后台切回前台（visibilitychange），距上次同步 >60s 才拉
   *   ② 兜底轮询，间隔 10 分钟，且只在页面可见时执行
   * 频率控制：单次同步 5 个文件，10 分钟一次 ≈ 30 次/小时/玩家，
   *   远低于 GitHub token 5000 次/小时限额；页面不可见时完全不请求。
   * applyCloudCfg 全部是「整体替换」而非累加，重复调用幂等，不会重复发奖。 */
  startCfgSync() {
    if (this._cfgT) clearInterval(this._cfgT);
    this._cfgAt = Date.now();
    this._cfgT = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      this.refreshCloudCfg();
    }, 600000);   /* 10 分钟 */
    if (this._visBound) return;
    this._visBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - (this._cfgAt || 0) < 60000) return;   /* 60 秒内不重复拉 */
      this.refreshCloudCfg();
    });
  },
  async refreshCloudCfg() {
    if (!P) return;
    this._cfgAt = Date.now();
    try {
      await this.syncCloudCfg();
      try { UI.home(); } catch (e) {}
    } catch (e) {}
  },

  /* ---------- 运营「待应用指令」队列消费 ----------
   * 后台补发 / 回档此前是【直接改写玩家云端存档】，而游戏端每 30 秒把内存 P
   * 整份写回同一路径（Net.write 每次重新 GET sha，不冲突、直接覆盖）。
   * 实测：后台补发 500 → 云端 1500 → 在线玩家自动存档 → 云端回到 1000，
   *   后台提示「已补发」并记审计日志，玩家一分拿不到，全程不报错。
   * 现在后台改为往 data/zb/ops/{uid}.json 追加指令（append-only），
   * 这里消费并用本地 p.opsDone 记录已处理 id 去重 —— 不重复发放，
   * 也不与游戏端抢写存档文件。
   * 频率：5 分钟一次 + 切回前台时（60 秒防抖），约 12~30 次/小时/玩家。 */
  async consumeOps() {
    if (!P || !P.uid) return 0;
    const path = 'data/zb/ops/' + P.uid + '.json';
    let f = null;
    try {
      const r = await window.TMO(Net.read(path), 8000);
      if (r && r.data) f = r.data;
    } catch (e) {}
    if (!f || !Array.isArray(f.list) || !f.list.length) return 0;
    P.opsDone = Array.isArray(P.opsDone) ? P.opsDone : [];
    let n = 0;
    for (const op of f.list) {
      if (!op || !op.id || P.opsDone.indexOf(op.id) >= 0) continue;
      try { this.applyOp(op); } catch (e) {}
      P.opsDone.push(op.id); n++;
    }
    if (P.opsDone.length > 300) P.opsDone = P.opsDone.slice(-300);
    if (n) {
      try { UI.toast('📦 运营发放已到账（' + n + ' 项）', 'ok'); } catch (e) {}
      try { UI.home(); } catch (e) {}
      try { this.save(); } catch (e) {}
    }
    return n;
  },
  applyOp(op) {
    if (op.t === 'grant') {
      const g = {}; g[op.item] = op.n;
      try { E.grant(P, g); } catch (e) {}
      if (op.mail) {
        P.mail = P.mail || [];
        P.mail.unshift({ id: 'op' + op.id, t: op.mail.t || '补偿发放',
          b: op.mail.b || '', rw: {}, got: false, at: Date.now() });
      }
      if (op.exp) {
        P.tempItems = P.tempItems || [];
        P.tempItems.push({ id: op.item, n: op.n, exp: Date.now() + op.exp });
      }
    } else if (op.t === 'restore' && op.data) {
      /* 整体覆盖（回档）：重复应用无害，故后台可双写 */
      const np = JSON.parse(JSON.stringify(op.data));
      np.uid = P.uid;
      np.opsDone = P.opsDone;
      Object.keys(P).forEach((k) => { delete P[k]; });
      Object.assign(P, np);
      P.lastSeen = Date.now(); P.offlineAt = Date.now();
      /* 后台主动回档：这份数据即为当前最新状态，刷新基准避免被守卫拦截 */
      P._baseAt = Date.now();
    } else if (op.t === 'ban') {
      /* 在线封禁立即生效：登录校验只在登录时跑，
       * 光写存档会被在线玩家 30 秒自动存档覆盖 → 作弊者能一直玩到手动退出 */
      P.ban = true; P.banUntil = op.until || 0; P.banReason = op.reason || '';
      P.banAt = Date.now();
      try { UI.toast('🚫 该账号已被封禁：' + (P.banReason || '违规处理'), 'err'); } catch (e) {}
      try { this.save(); } catch (e) {}
      setTimeout(() => { try { if (window.UA) UA.logout(); } catch (e) {} }, 1500);
    } else if (op.t === 'unban') {
      P.ban = false; P.banUntil = 0; P.banReason = '';
      try { UI.toast('账号已解封', 'ok'); } catch (e) {}
    }
  },
  startOpSync() {
    if (this._opT) clearInterval(this._opT);
    this._opT = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      this.consumeOps();
    }, 300000);   /* 5 分钟 */
    if (this._opVis) return;
    this._opVis = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - (this._opAt || 0) < 60000) return;
      this._opAt = Date.now();
      this.consumeOps();
    });
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
    /* 旧存档兼容：芯片曾发到 p.mat.chipE/chipL/chipN/chipRed（发放分支缺失），
     * 芯片真实存放在 p.bag。这里把历史残留补发成真实芯片并清掉伪键，
     * 让老玩家已购买的礼包芯片能真正出现在芯片页、可装备/合成。
     * 需要在 giveChipByQuality 可用后执行，故放在 E 就绪之后。 */
    if (window.E && E.giveChipByQuality) {
      /* C01/C02/C03 是掉落表与排名奖励里的芯片品质码，历史上同样被写进 p.mat。
       * 一并补发成真实芯片，让老玩家打 BOSS / 领排名奖励攒的芯片回到芯片页。 */
      const qmap = { chipN: '白', chipE: '蓝', chipL: '红', chipRed: '红',
        C01: '白', C02: '蓝', C03: '红' };
      for (const k in qmap) {
        const n = Math.floor(Number(p.mat[k]) || 0);
        if (n > 0) {
          for (let i = 0; i < n; i++) E.giveChipByQuality(p, qmap[k]);
          delete p.mat[k];
        }
      }
      /* 消耗品别名：历史 p.mat.U01/U02 补回 I01/I02（背包与使用只读 I0x） */
      ['U01', 'U02'].forEach((uk) => {
        const n = Math.floor(Number(p.mat[uk]) || 0);
        if (n > 0) { const rk = 'I' + uk.slice(1); p.mat[rk] = (p.mat[rk] || 0) + n; delete p.mat[uk]; }
      });
      /* 成就点也曾被误写进 p.mat.ach（grant 缺分支），这里补回 p.ach */
      const achN = Math.floor(Number(p.mat.ach) || 0);
      if (achN > 0) { p.ach = (p.ach || 0) + achN; delete p.mat.ach; }
      /* 皮肤曾被误写成数组（grant 里 p.skin.push 崩溃/错写），这里矫正：
       * p.skin 是字符串（当前穿戴），p.skins 是数组（已拥有） */
      if (Array.isArray(p.skin)) {
        const arr = p.skin.slice();
        p.skins = p.skins || [];
        arr.forEach((x) => { if (typeof x === 'string' && p.skins.indexOf(x) < 0) p.skins.push(x); });
        p.skin = (typeof arr[0] === 'string' && arr[0]) ? arr[0] : (p.skins[0] || 'sk_c01a');
      }
      if (!Array.isArray(p.skins)) p.skins = p.skin ? [p.skin] : ['sk_c01a'];
      if (typeof p.skin !== 'string' || !p.skin) p.skin = p.skins[0] || 'sk_c01a';
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
    p.tempItems = Array.isArray(p.tempItems) ? p.tempItems : [];
    E.resetTasks(p); E.tickStamina(p);
    /* 图鉴回填：补录已拥有但历史未记账的武器/皮肤 */
    try { if (E.codexBackfill) E.codexBackfill(p); } catch (e) {}
    /* 巡逻收益按章节同步（此前恒为 16 金币/小时） */
    try { if (E.syncPatrol) E.syncPatrol(p); } catch (e) {}
    /* GM「加属性」若填了持续时间，到期需扣回 ——
     * 否则临时增益变成永久增益，与后台配置意图不符。 */
    this.tickTempBuff(p);
    /* 限时道具到期回收：tempItems 此前只写不读，限时道具实际永久化 */
    try { this.tickTempItems(p); } catch (e) {}
    /* 登记到玩家索引：后台据此枚举全部玩家。
     * 只在注册/登录时写是不够的 —— 老账号从未写过，
     * 后台就只能靠不稳的目录枚举，结果长期只显示一个玩家。
     * 这里在每次启动/初始化时补登记（本机节流 6 小时一次）。 */
    this.tickIndex(p);
    /* 旧存档兼容：商店【内联发放】路径曾缺少 skin/title/frame/gem 分支，
     * 一律掉进 else 写进 p.mat —— 玩家花 680 钻买 SH08 皮肤，
     * 提示「购买成功」，皮肤页里却什么都没有（钱白花）。
     * （E.grant() 早已正确处理，但商店这条内联路径漏了，已单独修复。）
     * 这里把历史写进 p.mat 的这类伪键补回各自的真实容器。 */
    if (p.mat && typeof p.mat === 'object') {
      const take = (key) => { const v = p.mat[key]; if (v) { delete p.mat[key]; return v; } return null; };
      const sk = take('skin');
      if (sk && typeof sk === 'string') {
        p.skins = Array.isArray(p.skins) ? p.skins : [];
        if (p.skins.indexOf(sk) < 0) p.skins.push(sk);
        if (!p.skin || typeof p.skin !== 'string') p.skin = sk;
      }
      const ti = take('title');
      if (ti && typeof ti === 'string') {
        p.titles = Array.isArray(p.titles) ? p.titles : [];
        if (p.titles.indexOf(ti) < 0) p.titles.push(ti);
      }
      const fr = take('frame');
      if (fr && typeof fr === 'string') {
        p.frames = Array.isArray(p.frames) ? p.frames : [];
        if (p.frames.indexOf(fr) < 0) p.frames.push(fr);
      }
      const gm = take('gem');
      if (gm && typeof gm === 'string') {
        p.gems = (p.gems && typeof p.gems === 'object') ? p.gems : {};
        p.gems[gm] = (p.gems[gm] || 0) + 1;
      }
      /* 活动代币曾被写进 p.mat.evToken（内联路径漏分支） */
      const ev = Math.floor(Number(p.mat.evToken) || 0);
      if (ev > 0) { p.evToken = (p.evToken || 0) + ev; p.evScore = (p.evScore || 0) + ev; delete p.mat.evToken; }
    }
    /* 类型规范化：放在 migrate 最后，确保补字段之后再做类型收敛 */
    try { E.sanitize(p); } catch (e) {}

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

  /* ---------- 限时道具到期回收 ----------
   * BUG：运营补发带有效期的道具时（applyOp 的 op.exp 分支），
   * 除了直接 E.grant 发放，还会往 p.tempItems 记一条 {id,n,exp}。
   * 但 tempItems 全项目【只写不读】—— 没有任何地方检查到期、也不会扣回，
   * 于是「限时道具」实际上变成永久道具，且数组只增不减（存档持续膨胀）。
   * 现在按到期时间扣回，与 GM 临时增益 tickTempBuff 同一套语义；
   * 扣回时发一封邮件说明，避免玩家以为物品凭空消失。 */
  tickTempItems(p) {
    if (!p || !Array.isArray(p.tempItems) || !p.tempItems.length) return 0;
    const now = Date.now();
    const keep = [];
    const got = {};
    p.tempItems.forEach((t) => {
      if (!t || !t.id) return;
      if ((Number(t.exp) || 0) > now) { keep.push(t); return; }
      const q = Math.max(0, Math.floor(Number(t.n) || 0));
      if (q <= 0) return;
      const k = t.id;
      let real = 0;
      if (k === 'gold') { real = Math.min(q, p.gold || 0); p.gold = Math.max(0, (p.gold || 0) - q); }
      else if (k === 'diamond') { real = Math.min(q, p.diamond || 0); p.diamond = Math.max(0, (p.diamond || 0) - q); }
      else if (k === 'stamina') { real = Math.min(q, Math.floor(p.stamina || 0)); p.stamina = Math.max(0, (p.stamina || 0) - q); }
      else {
        p.mat = p.mat || {};
        real = Math.min(q, Math.floor(Number(p.mat[k]) || 0));
        p.mat[k] = Math.max(0, (Number(p.mat[k]) || 0) - q);
      }
      if (real > 0) got[k] = (got[k] || 0) + real;
    });
    p.tempItems = keep.slice(-100);
    const ks = Object.keys(got);
    if (!ks.length) { try { E.save(p); } catch (e) {} return 0; }
    const txt = ks.map((k) => E.itemName(k) + '×' + got[k]).join('、');
    p.mail = p.mail || [];
    p.mail.unshift({ id: 'tmp' + Date.now(), t: '限时道具已到期',
      b: '以下限时道具已到期并回收：' + txt, rw: {}, from: '系统',
      got: false, at: Date.now() });
    if (p.mail.length > 40) p.mail.length = 40;
    try { E.save(p); } catch (e) {}
    return ks.length;
  },
  /* 某个物品当前是否处于限时状态（用于背包角标） */
  tempExpOf(p, id) {
    if (!p || !Array.isArray(p.tempItems)) return 0;
    let e = 0;
    p.tempItems.forEach((t) => {
      if (t && t.id === id && (Number(t.exp) || 0) > Date.now()) e = Math.max(e, Number(t.exp) || 0);
    });
    return e;
  },

  /* 关页面时的同步快照：localStorage 写入是同步的，一定赶得及。
   * 异步的 Net.write 在页面卸载时会被浏览器掐断，进度就丢了。 */
  snapKey(uid) { return 'zb_snap_' + (uid || UID || ''); },
  /* 丢弃本地快照：云端已被别处推进、或玩家主动重置时使用。
   * 不删的话下次登录它可能再次"以新时间戳赢过云端"，造成反复回档。 */
  dropSnap(uid) {
    try { localStorage.removeItem(this.snapKey(uid)); } catch (e) {}
  },
  syncSnap() {
    /* 重置存档期间禁止写快照：否则清理之后、reload 之前的窗口里
     * 任何一次 save()（含其内部调用）都会把刚删掉的进度重新写回本地快照，
     * 下次登录云端读取失败时会用它恢复 —— 玩家以为清空了，进度却原样回来。 */
    if (!P || window.__zbResetting) return;
    try {
      P.offlineAt = Date.now(); P.lastSeen = Date.now();
      localStorage.setItem(this.snapKey(P.uid), JSON.stringify(P));
    } catch (e) {}
  },
  loadSnap(uid) {
    try {
      const s = localStorage.getItem(this.snapKey(uid));
      if (!s) return null;
      const o = JSON.parse(s);
      return (o && o.uid) ? o : null;
    } catch (e) { return null; }
  },

  async save() {
    if (!P || !this.savePath || window.__zbResetting) return;
    P.lastSeen = Date.now(); P.offlineAt = Date.now();
    /* 每次都同步留一份快照，写成功后再清掉 —— 关页面时它就能顶上 */
    this.syncSnap();
    let ok = false;
    try { ok = await Net.write(this.savePath, P); } catch (e) {}
    if (ok === true) {
      try { localStorage.removeItem(this.snapKey(P.uid)); } catch (e) {}
      P._baseAt = P.offlineAt;      /* 已成功落云端，基准前移 */
    } else if (ok === 'stale') {
      /* 云端已有更新的进度（别的设备 / 读到了旧分支的档）。
       * 拒绝覆盖，并且【必须丢弃本地快照】—— 快照里是落后的旧内容，
       * 而 syncSnap() 刚给它刷了最新时间戳，留着它下次登录就会
       * 「以新时间戳赢过云端」把新进度整份顶掉 = 回档（已实测确认）。
       * save() 每 30 秒跑一次，提示必须节流，否则会一直弹。 */
      this.dropSnap(P.uid);
      const now = Date.now();
      if (now - (this._staleAt || 0) > 300000) {
        this._staleAt = now;
        try { UI.toast('⚠️ 检测到其他设备有更新的进度，已保留最新的一份', 'err'); } catch (e) {}
      }
    }
    this.uploadRank();
  },
  startSave() { if (saveT) clearInterval(saveT); saveT = setInterval(() => { if (P && !window.__zbResetting) this.save(); }, 30000); },
  /* 榜单上传节流键：记录上次成功上传时自己的成绩指纹 + 时间戳。
   * BUG：save() 每 30 秒触发一次，uploadRank() 无条件执行，
   *   每次都是「读 leaderboard + 写 leaderboard + 读 endless + 写 endless」= 4 次 API。
   *   单玩家 8 次/分钟 ≈ 480 次/小时；10 人同时在线就逼近 GitHub token
   *   5000 次/小时限额，之后写入全部失败进队列、榜单彻底停止更新。
   *   而玩家的层数/战力/积分绝大多数时候根本没变 —— 全是无效写入。
   * 现在：成绩指纹未变 且 距上次上传 <10 分钟 → 直接跳过。
   *   指纹变了（打完无尽/战力提升/拿到活动积分）立刻上传，不影响榜单实时性。 */
  rankKey() {
    if (!P) return '';
    return [P.uid, P.name, P.lv || 1, E.curLevel(P), E.power(P),
      P.endlessBest || 0, P.evScore || 0].join('|');
  },
  /* 两条榜单记录合并：只增字段取大值，展示字段取较新的一份 */
  /* 统一口径：合并逻辑收敛到 E.mergeRankRow，后台重建榜单用的是同一份实现 */
  mergeRow(old, row) { return E.mergeRankRow(old, row); },
  /* 榜单保留集：各维度 Top100 的并集，上限 200 条。
   * 只按单一维度（如 eb）截断会让其他维度的高手整体落榜，
   * 三个榜共用一份 leaderboard.json，必须都留人。 */
  topUnion(list) {
    const lim = 200, top = 100;
    const keep = (key) => list.slice()
      .sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, top);
    const m = new Map();
    ['eb', 'pw', 'ev'].forEach((k) => keep(k).forEach((r) => {
      const id = r.uid || r.u; if (id) m.set(id, r);
    }));
    /* 兜底：若玩家数超过并集容量，至少保证各维度第一在榜 */
    const out = [...m.values()];
    out.sort((a, b) => (b.eb || 0) - (a.eb || 0) || (b.pw || 0) - (a.pw || 0));
    return out.slice(0, lim);
  },
  async uploadRank(force) {
    if (!P || !Net.online) return;
    try {
      const fp = this.rankKey();
      if (!force && this._rankFp === fp
        && Date.now() - (this._rankAt || 0) < 600000) return;   /* 10 分钟 */
    } catch (e) {}
    try {
      const r = await Net.read('data/zb/leaderboard.json');
      const lb = (r && r.data && r.data.list) ? r.data.list : [];
      /* 字段名必须同时兼容两端：
       * 后台读 uid/name/t，游戏端面板读 u/n/eb/pw —— 此前只写 u/n/eb，
       * 后台「排行榜刷新」里战力榜的名字和 UID 全是空的；
       * 且游戏把无尽成绩也写进 leaderboard.json，而后台无尽榜读的是
       * endless.json → 后台无尽榜恒为空，只能靠手动重建。
       * 现在一条记录同时带两套键，并同步写 endless.json。 */
      /* 统一口径：改由 E.rankRow 产出（游戏端与后台共用同一份行结构）。
       * 此前这里是就地手写 10 个键，后台"重建榜单"另写 4~5 个键，
       * 两边字段集不一致 → 重建后游戏端读不到 eb/pw，全服层数显示 0。 */
      const row = E.rankRow(P);
      /* 合并而非覆盖
       * BUG：此前是 `lb[i] = row` 整行替换，而 lb 来自本次读到的快照。
       *   玩家 A 读快照 → B 上传了新纪录 → A 写入 A 的旧快照
       *   （Net.write 每次重新 GET sha，所以不会 409 冲突，而是【静默覆盖】）
       *   → B 的新层数被回退成 A 快照里的旧值。
       *   更糟的是写失败会进 localStorage 队列、跨会话重放：
       *   A 断网一天后重连，队列里那份 24 小时前的榜单被推上去，
       *   期间所有人的成绩一起回退，且 B 若不在线就永远补不回来。
       * 现在按 uid 合并：无尽层数 / 活动积分取【较大值】（都是只增的历史最佳），
       *   昵称/等级/战力取时间戳较新的一份。这样任何一份旧快照都不可能把
       *   别人的成绩改小。 */
      const i = lb.findIndex((x) => (x.uid || x.u) === P.uid);
      if (i >= 0) lb[i] = this.mergeRow(lb[i], row); else lb.push(row);
      lb.sort((a, b) => (b.eb || 0) - (a.eb || 0) || b.pw - a.pw);
      /* 保留各榜 Top100 的并集（上限 200）。
       * 此前只按 eb 排序截断 50 条，于是「战力很高但无尽层数低」的玩家
       * 永远挤不进 leaderboard.json —— 游戏端切到战力榜时压根没有他，
       * 名次算不出来，表33 战力榜奖励也领不到。 */
      await Net.write('data/zb/leaderboard.json',
        { list: MAIN.topUnion(lb), updated: Date.now() });
      /* 同步无尽榜：后台 DBP.endless 读的就是这个文件 */
      const er = await Net.read('data/zb/endless.json');
      const el = (er && er.data && er.data.list) ? er.data.list : [];
      /* 同上：无尽榜也用统一行结构，避免只写半套键 */
      const erow = E.rankRow(P);
      /* 同上：无尽榜也按 uid 合并，层数取较大值 */
      const j = el.findIndex((x) => (x.uid || x.u) === P.uid);
      if (j >= 0) el[j] = this.mergeRow(el[j], erow); else el.push(erow);
      el.sort((a, b) => (b.t || 0) - (a.t || 0));
      /* 同上：无尽榜也按并集保留，避免只留单一维度的人 */
      await Net.write('data/zb/endless.json',
        { list: MAIN.topUnion(el), updated: Date.now() });
      /* 回写「我的排名」
       * BUG：UI 读 p.rankEndless / p.rankPower / p.rankEv，
       * 但全项目从未给这三个字段赋过值 → 排行榜面板永远显示「未上榜」，
       * 表33 排名奖励的领取判定 inRank 恒为 false，玩家一次都领不到。
       * 榜单上传后按当前榜单顺序回算自己的名次（1 起算，0 = 未上榜）。 */
      const byEndless = lb.slice().sort((a, b) => (b.eb || 0) - (a.eb || 0));
      const byPower = lb.slice().sort((a, b) => (b.pw || 0) - (a.pw || 0));
      const pos = (arr) => {
        const k = arr.findIndex((x) => (x.uid || x.u) === P.uid);
        return k >= 0 ? k + 1 : 0;
      };
      P.rankEndless = (P.endlessBest || 0) > 0 ? pos(byEndless) : 0;
      P.rankPower = pos(byPower);
      /* 活动冲榜：此前 P.evScore 恒为 undefined（从未赋值），
       * 守卫 `if (P.evScore != null)` 让这段永远不执行 → rankEv 恒 0
       * → 表33 RK08/RK09/RK10 奖励永不可领。现在按活动积分正常计算。 */
      const byEv = lb.slice().sort((a, b) => (b.ev || 0) - (a.ev || 0));
      P.rankEv = (P.evScore || 0) > 0 ? pos(byEv) : 0;
      /* 记指纹：只有真正上传成功才记，失败时下次存档会重试 */
      this._rankFp = this.rankKey(); this._rankAt = Date.now();
      try { E.save(P); } catch (e) {}
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
  /* 后台「解锁条件」自由文本 → 需通关关数
   *   文档示例：'通关10关' / '通关 30 关' / '需通关5关解锁'
   *   留空或不含数字 → 0（无条件） */
  needFromText(t) {
    const m = String(t || '').match(/(\d+)/);
    return m ? Math.max(0, parseInt(m[1], 10)) : 0;
  },
  applyCloudCfg(key, db) {
    try {
      const nm = (id) => { try { return (E.itemName ? E.itemName(id) : id) || id; } catch (e) { return id; } };
      if (key === 'activity' && Array.isArray(db.list)) {
        const base = (EX.activities || []).slice();
        db.list.forEach((a) => {
          if (!a || !a.id) return;
          /* 状态必须按时间算，不能只信后台存的 status 字段：
           * 后台「活动启停」页显示的"运行中"是渲染时用时间算出来的，
           * 但云端 status 字段自创建起就一直是 '待开启'，从没被回写。
           * 此前 live = (status === '运行中') 恒为 false，
           * 导致后台时间到了显示运行中、游戏端却判定为不可参与。 */
          const nowT = Date.now();
          const st = a.status === '强制下架' ? '强制下架'
            : nowT < (a.startAt || 0) ? '待开启'
            : nowT > (a.endAt || 0) ? '已结束' : '运行中';
          const it = {
            id: a.id, n: a.name || a.n || '活动',
            startAt: a.startAt || 0, endAt: a.endAt || 0,
            cond: a.cond || {}, levelId: a.levelId || '',
            live: st === '运行中', status: st,
            rw: a.rw || {}, desc: a.desc || '',
          };
          const i = base.findIndex((x) => x.id === a.id);
          if (i >= 0) base[i] = it; else base.push(it);
        });
        EX.activities = base;
      } else if (key === 'achshop' && Array.isArray(db.list)) {
        /* 后台 { id, item, n:数量, cost, limit, refresh, unlock }
         *  → 游戏端 { id, n:名称, t, cost, limit, per, need, give:{item:数量} }
         *
         * 致命 BUG 修复（线上已发生）：此前是【无条件整体覆盖】。
         *   后台「添加商品」无校验，运营点一下"添加"就会产生一条
         *   { id:'AH...', item:'', n:0, cost:0 } 的空记录并上传云端。
         *   游戏端 filter(x => x.item) 把它滤掉 → EX.achShop = []，
         *   于是内置的 12 件成就商店商品【全部消失，玩家进去空空如也】。
         * 现在：云端有效条目为 0 时保留内置默认（只是草稿 / 空记录不算接管），
         *   有效条目 > 0 才由后台接管。actshop 同此逻辑。 */
        const arr = db.list.filter((x) => x && x.item).map((x, i) => ({
          id: x.id || ('AH' + i), n: nm(x.item) + '×' + (x.n || 1), t: '材料',
          cost: Number(x.cost) || 0, limit: Number(x.limit) || 0,
          /* 此前 per 硬编码 'day' —— 后台「刷新周期(天)」配了 7 天或 0（不刷新），
           * 游戏端一律按每天刷新，运营配置的限购周期完全不生效。
           * 现在按后台天数映射成限购周期。 */
          per: this.perFromDays(Number(x.refresh)),
          /* 解锁条件：后台是自由文本（文档示例「通关10关」），
           * 此前映射成 need:0 且从不被读取 —— 运营配了「需通关 30 关」，
           * 新玩家照样能直接兑换，解锁条件形同虚设。
           * 现在从文本里提取数字作为需通关关数，engine 侧真正校验。 */
          need: this.needFromText(x.unlock), refresh: Number(x.refresh) || 0,
          unlock: x.unlock || '', give: { [x.item]: Number(x.n) || 1 },
        }));
        if (arr.length) EX.achShop = arr;
        else console.warn('[cfg] achshop 云端无有效商品（可能只有空记录草稿），保留内置默认 '
          + ((EX.achShop || []).length) + ' 条');
      } else if (key === 'actshop' && Array.isArray(db.list)) {
        const arr2 = db.list.filter((x) => x && x.item).map((x, i) => ({
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
        /* 同 achshop：空记录草稿不能把内置 12 件活动商店商品清成 0 */
        if (arr2.length) EX.eventShop = arr2;
        else console.warn('[cfg] actshop 云端无有效商品，保留内置默认 '
          + ((EX.eventShop || []).length) + ' 条');
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
        /* 定时生效
         * BUG：后台「生效时间(小时，0=立即)」写入 _hotfix.at，
         * 但游戏端从没读过它 —— 填「2 小时后生效」的配置是【立即生效】的。
         * 运营想定时开活动、定时调数值，实际一上传就变了。
         * 现在未到生效时间就整份跳过（沿用内置默认值），下次登录到点后自然生效。 */
        const hf = src._hotfix || {};
        if (hf.at && Date.now() < Number(hf.at)) {
          console.log('[cfg] 热更未到生效时间，跳过：' + new Date(Number(hf.at)).toLocaleString());
          return;
        }
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
      try { E.logAct(P, 'pick', '领取邮件：' + (m.t || '邮件')); } catch (e) {}
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
          /* 重复领取漏洞：
           * 原顺序是「先 giveRw 发奖 → 最后统一 Net.write 写回 claimed」。
           * 若写回失败（网络抖动，这在弱网下很常见），奖励已经进了背包，
           * 但 claimed 里没有这个 uid —— 下次登录会再发一遍，可无限重复领取。
           * 现在先在本地登记已领，再发奖；即使云端写回失败也不会重发。 */
          if ((P.mailGot || []).indexOf(m.id) >= 0) continue;
          if ((m.claimed || []).indexOf(P.uid) >= 0) continue;
          /* 字段不一致修复：后台全服/定向邮件写入的是 title/body，
           * 而玩家存档里的邮件用 t/b。此前统一读 m.t，
           * 导致运营精心写的标题被吞掉，玩家只看到「邮件」两个字。
           * 这里做兼容补齐，让 m.t / m.b 在云端邮件上也能取到值。 */
          if (!m.t && m.title) m.t = m.title;
          if (!m.b && m.body) m.b = m.body;
          /* 定向：检查 uid 列表或筛选条件 */
          if (m.type === 'target') {
            const hit = (m.uids || []).indexOf(P.uid) >= 0
              || this.matchFilter(P, m.filter);
            if (!hit) continue;
          }
          m.claimed = m.claimed || [];
          m.claimed.push(P.uid);
          P.mailGot = P.mailGot || [];
          if (m.id && P.mailGot.indexOf(m.id) < 0) P.mailGot.push(m.id);
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
  /* 通用发放
   * 严重BUG（此前）：这里只认 gold/diamond/ach/stamina/evToken，其余一律
   * `P.mat[k] += Number(v)`。而 Number('sk_c01b') = NaN → 直接被 `if(!v) return` 丢掉。
   * 于是邮件补偿和兑换码礼包里凡是【芯片 / 皮肤 / 宝石 / 称号 / 头像框】
   * 全部发放失败，且界面照样提示「奖励已发放」：
   *   giveRw({chipL:1}) → p.mat['chipL'] = 1，而芯片真实存放在 p.bag → 芯片页永远 0
   *   giveRw({skin:'sk_c01b'}) → Number('sk_c01b') = NaN → 直接丢弃
   *   giveRw({gem:'G_R'}) → p.mat['gem'] = NaN → 丢弃
   * 实测：邮件 rw{chipE:2,gem:'G_B'} 只到账 M01，芯片和宝石全丢；
   *       兑换码 items{chipL:1,skin,gem:'G_R'} 三样全丢。
   * 现在统一走 E.grant()（它已正确处理芯片/皮肤/宝石/称号/头像框/消耗品别名），
   * 并把邮件里的 dia 映射成 diamond，保持对外调用不变。 */
  giveRw(rw) {
    if (!P || !rw || typeof rw !== 'object') return;
    const g = {};
    Object.keys(rw).forEach((k) => {
      if (k === 'dia') { g.diamond = (g.diamond || 0) + (Number(rw[k]) || 0); return; }
      g[k] = rw[k];
    });
    try { E.grant(P, g); } catch (e) {}
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
    /* 本地防重复（与全服邮件同理）：
     * 原逻辑先 giveRw 发奖、最后才 Net.write 写回 used/usedBy。
     * 写回失败（弱网很常见）时奖励已入背包但云端未记账，
     * 下次兑换同一个码还能再领一次 —— 可无限刷。
     * 现在先在本地登记，再发奖。 */
    P.cdkGot = P.cdkGot || [];
    if (P.cdkGot.indexOf(code) >= 0) return { ok: false, msg: '您已兑换过该码' };
    const tpl = (db.templates || []).find((t) => t.id === c.tpl);
    if (!tpl) return { ok: false, msg: '礼包模板缺失' };
    if (tpl.once && (c.usedBy || []).indexOf(P.uid) >= 0) return { ok: false, msg: '每人限领 1 次' };
    this.giveRw(tpl.items || {});
    /* 日志模板名：后台模板存的是 name 字段，此前取 tpl.n 恒为 undefined，
     * 日志里一律显示「兑换码 XXX（礼包）」，看不出兑的是哪个礼包。 */
    try { E.logAct(P, 'pick', '兑换码 ' + code + '（' + (tpl.name || tpl.n || '礼包') + '）'); } catch (e) {}
    if (P.cdkGot.indexOf(code) < 0) P.cdkGot.push(code);
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
    if (!E.endlessUnlocked(P)) { UI.toast('无尽模式需通关 ' + (EX.ENDLESS_UNLOCK || '10-10') + ' 解锁', 'err'); return; }
    id = 'endless';
  } else {
    id = levelId || E.curLevel(P);
    if (!E.levelUnlocked(P, id)) { UI.toast('该关卡尚未解锁', 'err'); return; }
  }
  /* 挑战次数：改为纯体力判断，不再有「每日 3 次」上限。
   * 此前在体力之外还叠了一道每日次数闸门（E.useRun），玩家体力明明是满的，
   * 打完 3 关就被「今日挑战次数已用完（每日 3 次）」拦住 —— 与关卡面板
   * 标注的「体力 1」完全对不上。现在只由 spendStamina 决定能不能打。 */
  /* 体力检查（只检查不扣除）
   * BUG：此前此处直接 spendStamina 扣费，而章节 CG 分支随后 return，
   *      玩家关掉 CG 弹窗（不点「进入战区」）时战斗根本没开始，体力却已扣掉。
   *      现在扣费下沉到 battleGo（真正进入战斗时），CG 取消不再白扣。 */
  const sp = E.checkStamina(P, id);
  if (!sp.ok) { UI.toast(sp.msg, 'err'); return; }
  battleLevel = id;

  /* 章节 CG 过场：首次进入该章节时播放一次
   * EX.cgImg / EX.chapterCg 此前是死配置，CG 图已生成却从不展示。
   * 无尽模式不播（没有章节归属）。 */
  if (mode !== 'endless') {
    const ch = E.chapterOf(id);
    const cg = E.cgTake(P, ch);
    if (cg) {
      const cd = (EX.chapters || []).find((x) => x.id === ch);
      E.save(P);
      UI.showCG(cg, ch, cd ? cd.n : '', () => battleGo(id, mode));
      return;
    }
  }

  battleGo(id, mode);
}

/* 实际进入战斗（CG 播放完 / 无需 CG 时调用） */
function battleGo(id, mode) {
  if (!P) return;
  /* 真正进入战斗时才扣体力（CG 取消不扣，避免白扣） */
  const sp = E.spendStamina(P, id);
  if (!sp.ok) { UI.toast(sp.msg, 'err'); UI.show('home'); return; }
  UI.show('battle');
  /* 音频：战斗 BGM
   * BUG：此处此前读的是 BT.run.def（上一局残留的 run，首次进入时为 undefined），
   *      而 BT.start 在下面才执行 —— 于是 BOSS 关判定的是【上一局】的类型：
   *      · 首次进游戏就打 BOSS → BT.run 为空 → 按普通关播 'battle'，BOSS 音乐永远不出；
   *      · 刚打完 BOSS 再打普通关 → BT.run 还是上一局的 BOSS → 普通关播 BOSS 音乐。
   *      而 SND.bgm 内部有 `curBgm === name 则直接 return` 的短路，
   *      连续两局同为 'battle' 时连切换都不会发生，BOSS 音乐彻底播不出来。
   * 现在改为按【本关】的关卡定义判定，与 BT.start 的先后顺序无关。 */
  if (window.SND) {
    const def = (EX.levels || []).find((l) => l.id === id) || {};
    const isBoss = def.cond === 'boss' || def.cond === 'bossAll' || !!(def.boss);
    SND.bgm(id === 'endless' ? 'endless' : isBoss ? 'boss' : 'battle');
  }
  BT.attach(document.getElementById('C'));
  BT.start(P, id, { endless: id === 'endless', cb: onBattleEnd });
  /* HUD 初始化失败也不能影响战斗本体 */
  try { UI.btInit(P, id, id === 'endless'); }
  catch (e) { console.error('btInit:', e); }
  if (hudT) clearInterval(hudT);
  hudT = setInterval(() => { if (BT.on || (BT.run && !BT.run.over)) UI.btTick(); }, 100);

  /* 引导：移动 / 射击
   * BUG：这里直接 `P.guide[2] = 1` 并只弹一句 toast，绕过了 showGuide 正式弹窗。
   *   → 引导 2「射击引导」是 6 个 must=true 节点里
   *     【唯一一个永远不会以正式弹窗出现】的（moved 事件全项目零调用）；
   *   → 设置页「引导进度」会显示已完成（因为被直接标记了），
   *     但玩家其实只看到一句一闪而过的 toast，等于这条引导没做；
   *   → 而且它在 BT.start 之后立即执行，比引导 1（延迟 420ms 弹窗）还早，
   *     玩家先看到「自动瞄准射击」的 toast，之后才看到「移动引导」弹窗，顺序颠倒。
   * 现在改为延迟走正式弹窗，排在引导 1 之后；战斗已结束则不再弹。 */
  setTimeout(() => {
    try {
      if (!P || (P.guide && P.guide[2])) return;
      if (!(BT.on || (BT.run && !BT.run.over))) return;
      if (window.UI && UI.guideTrigger) UI.guideTrigger('moved');
    } catch (e) {}
  }, 2600);
}

window.battleGo = battleGo;

function onBattleEnd(res, d) {
  if (hudT) { clearInterval(hudT); hudT = null; }
  if (window.SND) { SND.play(res === 'win' ? 'win' : 'lose'); SND.bgm('base'); }
  const r = BT.run;
  const kills = d.kills || 0;
  const endless = r.endless;
  /* 统一口径：p.stats.runs 此前在 newPlayer 里初始化后就再没人写过，
   * 全项目零读取 —— 后台想看留存/活跃度拿不到"打了几局"这个最基本的数。
   * 现在在唯一的结算入口累加，并由 E.stats 对外暴露。 */
  P.stats = P.stats || {};
  P.stats.runs = (P.stats.runs || 0) + 1;
  /* 资料奖励表 */
  let rw = { gold: 0, diamond: 0 };
  if (res === 'win') {
    const def = r.def;
    if (endless) {
      rw.gold = Math.round((100 + r.wave * 20) * (E.attrs(P).goldMul || 1));
      P.endlessBest = Math.max(P.endlessBest || 0, r.wave);
      /* 表22 EV01 丧尸围城 = 无尽模式，按存活波次发活动代币
       * （此前 evToken 全项目零产出，活动商店 12 项商品一件都买不了） */
      const tk = Math.max(10, r.wave * 3);
      P.evToken = (P.evToken || 0) + tk;
      P.evScore = (P.evScore || 0) + tk;
    } else {
      const lr = def.rw || {};
      /* 金币加成天赋此前只作用于「击杀金币」（battle.js kill 里直连 talentVal），
       * 关卡奖励这条占全部金币约 4 成的来源完全不吃加成
       * （attrs().goldMul 定义后全项目零消费，是死字段）。 */
      rw.gold = Math.round((lr.gold || 0) * (E.attrs(P).goldMul || 1));
      /* 结算面板此前只显示 EXP / 金币 / 击杀 / 「1阶枪械部件」，
       * 而「1阶枪械部件」这个格子是从未赋值的 rw.parts，恒显示 0；
       * 关卡配置真正发的材料（如 1-1 的 M02×5）一行都不显示 ——
       * 玩家拿到 5 个材料却完全不知道。这里把实发材料记进 rw.mat 供面板渲染。 */
      rw.mat = {};
      for (const k in lr) {
        if (k === 'gold') continue;
        if (k === 'chip') {
          for (let i = 0; i < lr[k]; i++) P.bag.push(E.rollChipById('CH01'));
          rw.chip = (rw.chip || 0) + lr[k];
        } else {
          P.mat[k] = (P.mat[k] || 0) + lr[k];
          rw.mat[k] = (rw.mat[k] || 0) + lr[k];
        }
      }
    }
  } else {
    /* 失败 / 中途退出
     * BUG：battle 回调里的 rw.gold 已经是「按比例折算后」的局内金币
     *   lose → floor(r.gold * 0.3)
     *   quit → floor(r.gold * 0.5)
     * 但下面那句「关卡掉落金币」又无条件加了一遍 d.rw.gold，
     * 于是失败实际发 60%（30%×2），中途退出实际发 100%（50%×2，等于全额返还）。
     * 现在按结局区分：胜利 = 关卡奖励 + 局内金币；失败/退出 = 直接用折算后的值。 */
    rw.gold = Math.floor((d.rw && d.rw.gold) || 0);
  }
  /* 关卡掉落金币（仅胜利时叠加：胜利分支的 rw.gold 是关卡奖励，
   * 局内击杀金币在 d.rw.gold 里，两者相加；失败/退出分支 d.rw.gold 已含折算） */
  if (res === 'win') rw.gold += Math.round((d.rw && d.rw.gold) || 0);
  P.gold += rw.gold; P.diamond += rw.diamond;
  /* 玩家操作日志：击杀
   * 后台「日志查询 → 玩家操作」页头写着「拾取/击杀/升级/合成/兑换」，
   * 但全项目只有 3 处 logAct（武器升级 + 2 个商店动作），
   * 击杀/拾取/合成/兑换一条都没记 —— 页面常年显示「暂无操作日志」。
   * 这里补齐最高频的战斗结算记录。 */
  try { E.logAct(P, 'kill', (endless ? '无尽 ' : '') + (BT.run && BT.run.def ? BT.run.def.id + ' ' : '')
    + (res === 'win' ? '通关' : res === 'lose' ? '失败' : '撤离') + ' 击杀 ' + kills); } catch (e) {}

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
  /* home 引导（返回基地）——此前同样是零调用事件 */
  if (window.UI && UI.guideTrigger) UI.guideTrigger('home');

  UI.home();
  UI.showResult(res, { kills, time: r.time, rw, stars });
  /* 表21：第一次通关 → 通关引导；首次失败 → 广告复活引导 */
  if (UI.guideTrigger) {
    if (res === 'win') UI.guideTrigger('win');
    else if (res === 'lose') UI.guideTrigger('fail');
  }
  if (stars) UI.toast('⭐ 获得 ' + stars + ' 星评价', 'ok');
  /* 解锁类引导（表21 触发时机）
   * BUG：guideTrigger 的 12 个事件里只有 enter/firstUpgrade/firstKill/win/fail
   * 5 个被真正调用 —— moved、home、gunUnlock、taskUnlock、chipUnlock、
   * talentUnlock、endless 共 7 个【零调用】。
   * 结果：引导 7~11（武器库 / 任务 / 天赋 / 芯片 / 无尽）玩家永远看不到提示，
   * 且设置页「引导进度」永远卡在 7/12，不可能走满。
   * 现在通关后按已通关关卡触发对应解锁引导。 */
  if (res === 'win' && !endless && UI.guideTrigger) {
    const has = (id) => !!(P.cleared || {})[id];
    if (has('1-2')) { UI.guideTrigger('gunUnlock'); UI.guideTrigger('taskUnlock'); }
    if (has('1-3')) UI.guideTrigger('talentUnlock');
    if (has('1-4')) UI.guideTrigger('chipUnlock');
    if (has('3-3')) UI.guideTrigger('endless');
  }
  MAIN.save();
}

/* =========================================================
 * 输入：键盘（自动瞄准，摇杆已按需求移除）
 * ========================================================= */
function bindJoystick() { /* 摇杆已移除：自动瞄准射击，无需方向输入 */ }

function bindKeys() {
  const keys = {};
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(); keys[k] = 1;
    if (!BT.on) return;
    if (k === 'r') BT.reload();
    if (k === 'escape') { BT.paused = true; document.getElementById('pause').classList.add('on'); }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = 0; });
  /* 摇杆已移除：WASD 不再驱动移动（角色固定在防线，自动瞄准射击） */
}

/* =========================================================
 * 事件绑定
 * ========================================================= */
function bindAll() {
  let gender = 'm';
  $$('#lgGender .gd').forEach((b) => {
    b.onclick = () => { gender = b.dataset.g; $$('#lgGender .gd').forEach((x) => x.classList.remove('on')); b.classList.add('on'); };
  });
  /* 原此处有一份 lgBtn 绑定，读取页面根本不存在的 #lgName
   * （登录表单只有 lgUser/lgPwd）→ 一旦执行必然抛 null.value。
   * 它被下方「---- 登录 ----」处的第二次绑定覆盖，所以从未触发，
   * 但属于危险死代码（调整绑定顺序会当场崩溃），已移除。 */

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
  /* 暂停按钮：绑定放在下方「if (bp)」处（打开暂停面板 + 继续/放弃），
   * 这里原本还有一份 `BT.paused = !BT.paused` 的 toggle 绑定，会被下方覆盖成为死代码。
   * 它更危险的地方在于：那份 toggle 只置暂停标志、不弹面板，
   * 一旦将来调整绑定顺序让它生效，玩家点 ⏸ 就会得到一次【无提示的静默冻结】。
   * 已移除，只保留下方那一份。 */
  const auBtn = $('#btAuto');
  if (auBtn) auBtn.onclick = () => {
    BT.auto = !BT.auto;
    auBtn.classList.toggle('on', BT.auto);
    UI.toast(BT.auto ? '自动战斗 开' : '自动战斗 关', 'ok');
    if (window.SND) SND.play('click');
  };
  const swBtn = $('#btSwitch');
  if (swBtn) swBtn.onclick = () => {
    /* BUG：此前只弹一句「长按战场可快速射击」，不切换任何东西 —— 真正的
     * 武器切换入口 E.switchGun 只在武器库面板里，战斗中的 🔄 是死按钮。
     * 现在循环切换到下一把已解锁武器，并同步战斗数值（BT.refreshGun）。 */
    /* 统一走 window.P：P 是 let 声明的词法变量（不挂 window），
     * 与 window.P 由 MAIN.login 同步维护，这里只读 window.P 避免读到 null。 */
    const pp = window.P;
    if (!pp) { UI.toast('尚未进入战斗', 'err'); return; }
    const list = (EX.guns || []).filter((g) => E.gunUnlocked(pp, g.id));
    if (list.length <= 1) { UI.toast('暂无其他可用武器', 'err'); if (window.SND) SND.play('click'); return; }
    const i = list.findIndex((g) => g.id === pp.gun);
    const nx = list[(i < 0 ? 0 : i + 1) % list.length];
    const res = E.switchGun(pp, nx.id);
    if (res.ok) {
      if (window.BT && BT.refreshGun) BT.refreshGun();
      UI.toast('🔄 ' + res.msg, 'ok');
    } else UI.toast(res.msg, 'err');
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
  if (pq) pq.onclick = () => {
    /* BUG修复：此前「放弃本关」是裸调 quit()，没有任何二次确认。
     * 暂停面板里「继续战斗」与「放弃本关」是相邻按钮，误点一下本关奖励就只剩一半金币，
     * 且不可撤销。配置表 tips.popup.quitConfirm 早就写了这条提示文案，却从未被使用。
     * 现在按文案弹出确认，取消则保持暂停面板打开、战斗继续处于暂停态。 */
    const msg = (window.EX && EX.tip && EX.tip('popup.quitConfirm')) || '退出将放弃本关奖励，确定退出？';
    if (!window.confirm(msg)) return;
    document.getElementById('pause').classList.remove('on');
    BT.quit();
  };

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
    /* 昵称长度校验（前端即时反馈，避免白等一次云端往返） */
    const ne = (window.UA && UA.chkNick) ? UA.chkNick(nk) : (nk.trim().length < 2 || nk.trim().length > 8 ? '昵称需 2-8 个字' : '');
    if (ne) { sayTip(rgTip, ne); return; }
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

  /* ---- 手机软键盘「前往 / 完成」提交 ----
   * BUG：登录/注册表单完全没有 keydown 处理。手机输完密码后，软键盘右下角
   *   显示的「前往」按钮点了毫无反应（实测：密码框按 Enter 触发登录 0 次、
   *   提示区为空；账号框按 Enter 焦点仍停在账号框，不会跳到密码框），
   *   玩家必须手动收起键盘再去点登录按钮，每次登录都多一步。
   * 现在：登录表单 账号→密码→登录；注册表单 账号→密码→确认→昵称→注册。
   *   （index.html 已同步补 enterkeyhint，让键盘按钮直接显示「下一项/前往/完成」，
   *     并关闭 iOS 的首字母自动大写与自动更正，避免密码被悄悄改掉。） */
  const kbChain = (ids, submitId) => {
    ids.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.keyCode !== 13) return;
        e.preventDefault();
        const next = document.getElementById(ids[i + 1]);
        if (next) { next.focus(); return; }
        const btn = document.getElementById(submitId);
        if (btn) btn.click();
      });
    });
  };
  kbChain(['lgUser', 'lgPwd'], 'lgBtn');
  kbChain(['rgUser', 'rgPwd', 'rgPwd2', 'rgNick'], 'rgBtn');

  /* 忘记密码 */
  const lgFind = document.getElementById('lgFind');
  if (lgFind) lgFind.onclick = () => {
    const u = ((document.getElementById('lgUser') || {}).value || '').trim();
    if (!u) { sayTip(lgTip, '请先填写账号名'); return; }
    sayTip(lgTip, '提示：账号数据保存在云端仓库。如需重置密码，请联系管理员在后台「账号管理 → 重置密码」操作。', true);
  };

  /* ---- 自动登录（已按需求关闭，保留说明） ----
   * 需求：进入游戏必须输入账号 + 密码，不允许免密直接进。
   * 旧行为：勾选「记住账号」后 shouldAuto() 为真 → 下次打开直接跳过登录进主界面，
   *   密码形同虚设：任何人拿到这台设备（或把 localStorage 带到别的设备）
   *   都能直接进到该账号的存档，还能花掉里面的钻石。
   * 现行为：「记住账号」只保留「自动回填账号名」的便利，密码每次都要输。 */
  if (lgUser && rem.name) sayTip(lgTip, '已填入上次账号，请输入密码', true);

  const rb = document.getElementById('rsBack');
  if (rb) rb.onclick = () => { UI.hideResult(); UI.home(); UI.show('home'); if (window.SND) SND.bgm('base'); };

  /* 切到后台自动暂停。
   * BUG：此处原本只写 `BT.paused = true` 就结束了 ——
   *   ① 没有任何代码在切回前台时把它改回 false，战斗【永久冻结】；
   *   ② 也不会弹出暂停面板，玩家切回来看到的是一帧完全静止的画面，
   *      既没有提示也不知道该怎么恢复，只会以为游戏卡死、直接杀掉重开，
   *      这一局打下来的进度就白费了（手机上来个电话/切个微信就会中招）。
   * 现在：切走时暂停并弹出暂停面板，玩家切回来一眼看到「已暂停」，
   * 点「继续战斗」即可恢复；技能三选一已经全屏遮挡时不再重复叠一层。 */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !BT.on) return;
    const r = BT.run;
    if (!r || r.over) return;
    const chOpen = document.getElementById('choice');
    if (chOpen && chOpen.classList.contains('on')) return;
    BT.paused = true;
    const pp = document.getElementById('pause');
    if (pp) pp.classList.add('on');
  });
  /* 关页面/切走时保存进度。
   * 原来只挂 beforeunload 且只调异步 save()：
   *   ① 浏览器不等待 Promise，页面一关 fetch 就被掐断，那一局的进度全丢；
   *   ② iOS Safari / 手机切 App 根本不触发 beforeunload。
   * 现在三个事件都挂，且先同步写 localStorage 快照（一定成功），再试异步上传。 */
  /* 重置存档期间禁止回写。
   * 否则 location.reload() 会触发 beforeunload/pagehide，
   * 把刚删掉的进度又同步写进 zb_snap_ 快照和 ss_queue 队列，
   * 下次登录云端读取失败时会用它恢复 —— 等于白重置。 */
  const byeNow = () => {
    if (!P || window.__zbResetting) return;
    MAIN.syncSnap(); try { MAIN.save(); } catch (e) {}
  };
  window.addEventListener('beforeunload', byeNow);
  window.addEventListener('pagehide', byeNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) byeNow(); });

  bindJoystick(); bindKeys();
}

window.addEventListener('DOMContentLoaded', async () => {
  bindAll();
  await MAIN.boot();
});

window.MAIN = MAIN;
window.startBattle = startBattle;
