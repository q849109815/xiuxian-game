/* =========================================================
 * frxx.js —— 凡人修仙传 · 内容层
 * 载入真实配置（32境界 / 4派系 / 37章主线 / 26副本 / 20功法 /
 *               30法宝 / 24伙伴灵宠 / 19地图 / 12势力）
 * 并提供：掌天瓶绿液、仙缘伙伴、派系、图鉴
 * ========================================================= */

const FRXX = {
  data: null,       // frxx.json 原始资料
  story: [],        // 37 章主线
  loaded: false,

  async load() {
    if (this.loaded) return true;
    const get = async (p) => {
      try {
        const r = await fetch('data/frxx/' + p, { cache: 'no-store' });
        return r.ok ? await r.json() : null;
      } catch (e) { return null; }
    };
    const [d, s, gp, cp] = await Promise.all([
      get('frxx.json'), get('story.json'), get('game_patch.json'), get('content_patch.json'),
    ]);
    if (!d || !gp) return false;
    this.data = d;
    this.story = s || [];
    this.applyPatch(gp, cp);
    this.loaded = true;
    return true;
  },

  /* ---------- 把真实数据并入引擎配置 ---------- */
  applyPatch(gp, cp) {
    const C = window.GAME_CONFIG;
    // 32 真实境界（扁平：一层一突破）
    C.realms = gp.realms;
    C.stages = gp.stages;
    // 成长曲线适配 32 层
    const g = C.growthPerRealm || {};
    for (const k in g) g[k] = g[k] * 0.42;
    C.growthPerStage = C.growthPerStage || {};
    for (const k in C.growthPerStage) C.growthPerStage[k] = 0;
    // 真实地图 / 副本 / 势力
    C.maps = gp.maps;
    C.dungeons = gp.dungeons;
    C.powers = gp.powers || [];
    // 修炼速率：32 层重新标定（炼气约 17 分/层，道祖约 132 分/层）
    C.cultivate = Object.assign({}, C.cultivate, { perRealm: 1.6 });
    // 真实功法
    if (cp && cp.skills && window.GAME_CONTENT) {
      window.GAME_CONTENT.skills = cp.skills;
    }
  },

  /* ---------- 派系 ---------- */
  factions() { return (this.data && this.data.factions) || []; },
  faction(id) { return this.factions().find((f) => f.id === id) || this.factions()[0]; },
  traits() { return (this.data && this.data.traits) || []; },
  trait(id) { return this.traits().find((t) => t.id === id) || null; },
  factionSkills(cls) { return ((this.data && this.data.fskills) || []).filter((s) => s.cls === cls); },

  /* ---------- 境界 ---------- */
  realms() { return (this.data && this.data.realms) || []; },
  realm(i) { const r = this.realms(); return r[Math.max(0, Math.min(r.length - 1, i | 0))] || { name: '凡人' }; },
  realmName(p) { return this.realm(p.realm).name; },
  bigName(p) { return this.realm(p.realm).big || '凡人'; },
  /** 突破所需丹药（真实配置） */
  breakPill(p) {
    const rs = this.realms(), nx = rs[(p.realm | 0) + 1];
    if (!nx) return null;
    const d = nx.pill || nx.needPill;
    if (!d) return null;
    return { name: d.item, n: d.n, key: this._pillKey(d.item), trial: !!nx.trial };
  },
  _pillKey(name) { return 'pill_' + name; },
  /** 是否备齐突破丹药（仅大境界关卡校验） */
  hasBreakPill(p) {
    const bp = this.breakPill(p);
    if (!bp || !bp.trial) return { ok: true, need: null };
    const bag = p.bag || [];
    const own = bag.filter((x) => (x.name || '').indexOf(bp.name) >= 0)
                   .reduce((a, b) => a + (b.count || 1), 0);
    return { ok: own >= bp.n, need: bp, own };
  },
  /** 按名称消耗丹药 */
  consumePillByName(p, name, n) {
    let left = n;
    p.bag = p.bag || [];
    for (let i = 0; i < p.bag.length && left > 0; i++) {
      const it = p.bag[i];
      if ((it.name || '').indexOf(name) < 0) continue;
      const c = it.count || 1;
      if (c <= left) { p.bag.splice(i, 1); i--; left -= c; }
      else { it.count = c - left; left = 0; }
    }
    return left === 0;
  },

  /* ---------- 掌天瓶（韩立核心外挂） ---------- */
  bottleCap(p) { return 3 + Math.floor((p.realm || 0) * 0.8); },
  /** 每 tick 积累绿液 */
  bottleTick(p, sec) {
    if (!p.bottle) p.bottle = { liquid: 0, acc: 0, level: 1 };
    const every = Math.max(90, 300 - p.bottle.level * 18);   // 产液间隔（秒）
    p.bottle.acc = (p.bottle.acc || 0) + sec;
    let made = 0;
    while (p.bottle.acc >= every) {
      p.bottle.acc -= every;
      if ((p.bottle.liquid || 0) < this.bottleCap(p)) { p.bottle.liquid = (p.bottle.liquid || 0) + 1; made++; }
    }
    return made;
  },
  /** 用绿液催熟灵草 */
  useLiquidHerb(p, n) {
    n = n || 1;
    if (!p.bottle || (p.bottle.liquid || 0) < n) return { ok: false, msg: '绿液不足' };
    p.bottle.liquid -= n;
    const got = n * 3;
    p.mats = p.mats || {};
    p.mats.herb = (p.mats.herb || 0) + got;
    if (window.SYS && SYS.addLog) SYS.addLog(p, `掌天瓶催熟灵草 ×${got}`);
    return { ok: true, msg: `绿液催熟：获得灵草 ×${got}` };
  },
  /** 用绿液催熟修为（一次性大量修为） */
  useLiquidExp(p, n) {
    n = n || 1;
    if (!p.bottle || (p.bottle.liquid || 0) < n) return { ok: false, msg: '绿液不足' };
    const need = window.ENGINE ? ENGINE.expNeed(p) : 1000;
    const gain = Math.round(need * 0.35 * n * (1 + (p.bottle.level - 1) * 0.15));
    p.bottle.liquid -= n;
    p.exp = (p.exp || 0) + gain;
    return { ok: true, msg: `绿液炼化：修为 +${gain}`, gain };
  },
  /** 升级掌天瓶 */
  upgradeBottle(p) {
    if (!p.bottle) p.bottle = { liquid: 0, acc: 0, level: 1 };
    const cost = 800 * Math.pow(2.2, p.bottle.level - 1);
    if ((p.stone || 0) < cost) return { ok: false, msg: `灵石不足（需 ${Math.round(cost)}）` };
    p.stone -= cost; p.bottle.level++;
    return { ok: true, msg: `掌天瓶升至 ${p.bottle.level} 阶，产液更快` };
  },

  /* ---------- 仙缘伙伴 / 灵宠 ---------- */
  partners() { return (this.data && this.data.partners) || []; },
  pets() { return (this.data && this.data.pets) || []; },
  allCompanions() { return this.partners().concat(this.pets()); },
  companion(id) { return this.allCompanions().find((c) => c.id === id) || null; },
  /** 伙伴列表（含好感状态） */
  companionState(p) {
    p.partners = p.partners || {};
    return this.allCompanions().map((c) => {
      const st = p.partners[c.id] || { favor: 0, active: false };
      return Object.assign({}, c, { favor: st.favor || 0, active: !!st.active,
        unlocked: this._unlocked(c, p), bonus: this._bonus(c, st.favor || 0) });
    });
  },
  _unlocked(c, p) {
    // 按获取途径粗略判断：主线伙伴随剧情解锁
    const src = c.src || '';
    if (src.includes('七玄门')) return (p.storyIdx || 0) >= 1;
    if (src.includes('血色禁地')) return (p.storyIdx || 0) >= 8;
    if (src.includes('黄枫谷')) return (p.storyIdx || 0) >= 6;
    if (src.includes('乱星海')) return (p.storyIdx || 0) >= 13;
    if (src.includes('虚天殿')) return (p.storyIdx || 0) >= 14;
    if (src.includes('落云宗')) return (p.storyIdx || 0) >= 19;
    if (src.includes('灵界') || src.includes('地渊')) return (p.storyIdx || 0) >= 25;
    return (p.storyIdx || 0) >= 3;
  },
  _bonus(c, favor) {
    const lv = favor >= 80 ? 3 : favor >= 50 ? 2 : favor >= 20 ? 1 : 0;
    return { lv, atk: lv * 0.06, hp: lv * 0.08, desc: ['—', '初识', '相知', '莫逆'][lv] };
  },
  /** 提升好感 */
  gainFavor(p, id, n) {
    const c = this.companion(id);
    if (!c) return { ok: false, msg: '无此人' };
    p.partners = p.partners || {};
    const st = p.partners[id] = p.partners[id] || { favor: 0, active: false };
    const old = st.favor || 0;
    st.favor = Math.min(100, old + n);
    let msg = `${c.name} 好感 +${n}（${st.favor}/100）`;
    const ob = this._bonus(c, old).lv, nb = this._bonus(c, st.favor).lv;
    if (nb > ob) msg += `　关系提升：${this._bonus(c, st.favor).desc}`;
    return { ok: true, msg, favor: st.favor };
  },
  /** 出战 / 撤回 */
  toggleCompanion(p, id) {
    p.partners = p.partners || {};
    const c = this.companion(id);
    if (!c) return { ok: false, msg: '无此人' };
    const st = p.partners[id] = p.partners[id] || { favor: 0, active: false };
    if (!this._unlocked(c, p)) return { ok: false, msg: `${c.name} 尚未结缘` };
    const isPet = !id.startsWith('P0');
    if (isPet) {
      // 灵宠单出战
      this.pets().forEach((x) => { if (x.id !== id && p.partners[x.id]) p.partners[x.id].active = false; });
    }
    st.active = !st.active;
    return { ok: true, msg: `${c.name} ${st.active ? '出战' : '撤回'}`, active: st.active };
  },
  /** 出战伙伴提供的总加成 */
  activeBonus(p) {
    let atk = 0, hp = 0, names = [];
    this.companionState(p).forEach((c) => {
      if (c.active) { atk += c.bonus.atk; hp += c.bonus.hp; names.push(c.name); }
    });
    return { atk, hp, names };
  },

  /* ---------- 图鉴（25_图鉴系统 8 类） ---------- */
  codex(p) {
    p.codexSeen = p.codexSeen || {};
    const seen = (k) => (p.codexSeen[k] || []);
    const R = this.realms().length;
    const allMons = ((window.GAME_CONTENT && GAME_CONTENT.monsters) || []);
    return [
      { id: 'realm', name: '境界图鉴', icon: '☯️', now: Math.min(R, (p.realm || 0) + 1), max: R, list: this.realms().map((r, i) => ({ n: r.name, got: (p.realm || 0) >= i })) },
      { id: 'skill', name: '功法图鉴', icon: '📜', now: (p.skills || []).length, max: (this.data.skills || []).length + 14,
        list: ((window.GAME_CONTENT && GAME_CONTENT.skills) || []).map((x) => ({ n: x.name, got: (p.skills || []).some((y) => y.id === x.id) })) },
      { id: 'equip', name: '法宝图鉴', icon: '🔮', now: Object.keys(p.equip || {}).filter((k) => p.equip[k]).length + (p.bag || []).filter((x) => x.fr).length,
        max: (this.data.equips || []).length,
        list: (this.data.equips || []).map((e) => ({ n: e.name, got: (p.bag || []).some((x) => (x.name || '') === e.name) || Object.values(p.equip || {}).some((x) => x && x.name === e.name) })) },
      { id: 'partner', name: '仙缘图鉴', icon: '🌸', now: this.companionState(p).filter((c) => c.unlocked).length, max: this.allCompanions().length,
        list: this.allCompanions().map((c) => ({ n: c.name, got: this._unlocked(c, p) })) },
      { id: 'dungeon', name: '秘境图鉴', icon: '🌀', now: (p.dungeonCleared || []).length, max: ((window.GAME_CONFIG && GAME_CONFIG.dungeons) || []).length,
        list: ((window.GAME_CONFIG && GAME_CONFIG.dungeons) || []).map((d) => ({ n: d.name, got: (p.dungeonCleared || []).indexOf(d.id) >= 0 })) },
      { id: 'map', name: '山河图鉴', icon: '🗺️', now: ((window.GAME_CONFIG && GAME_CONFIG.maps) || []).filter((m) => (p.realm || 0) >= (m.minRealm || 0)).length, max: ((window.GAME_CONFIG && GAME_CONFIG.maps) || []).length,
        list: ((window.GAME_CONFIG && GAME_CONFIG.maps) || []).map((m) => ({ n: m.name, got: (p.realm || 0) >= (m.minRealm || 0) })) },
      { id: 'monster', name: '妖兽图鉴', icon: '👹', now: new Set((p.killed || [])).size, max: Math.max(1, allMons.length),
        list: allMons.map((m) => ({ n: m.name, got: (p.killed || []).indexOf(m.name) >= 0 })) },
      { id: 'pill', name: '丹药图鉴', icon: '💊', now: new Set((p.pillsUsed || [])).size, max: (this.data.pills || []).length,
        list: (this.data.pills || []).map((x) => ({ n: x.name, got: (p.pillsUsed || []).indexOf(x.name) >= 0 })) },
    ];
  },
  /** 记录击杀 / 用药，供图鉴使用 */
  markKill(p, name) { p.killed = p.killed || []; if (name && p.killed.indexOf(name) < 0 && p.killed.length < 400) p.killed.push(name); },
  markPill(p, name) { p.pillsUsed = p.pillsUsed || []; if (name && p.pillsUsed.indexOf(name) < 0) p.pillsUsed.push(name); },

  /* ---------- 主线剧情 ---------- */
  storyList() { return this.story; },
  storyChapter(i) { return this.story[i] || null; },
};


/* =========================================================
 * 美术资源映射（assets/ 目录）
 * ========================================================= */
const ART = {
  base: 'assets/',
  scene: {
    main: 'scene/main_bg.jpg',
    // 地图名 → 场景图（按资料 12_地图势力 的篇目归属）
    '七玄门': 'scene/qixuanmen.jpg',
    '青牛镇': 'scene/qixuanmen.jpg',
    '越国都城': 'scene/qixuanmen.jpg',
    '黄枫谷': 'scene/huangfenggu.jpg',
    '落云宗': 'scene/huangfenggu.jpg',
    '血色禁地': 'scene/xuese.jpg',
    '坠魔谷': 'scene/xuese.jpg',
    '乱星海': 'scene/luanxinghai.jpg',
    '虚天殿': 'scene/xutiandian.jpg',
    '天渊城': 'scene/tianyuan.jpg',
    '昆吾山': 'scene/tianyuan.jpg',
    '地渊': 'scene/tianyuan.jpg',
    '北寒仙域': 'scene/beihan.jpg',
    '黑土仙域': 'scene/beihan.jpg',
    '仙界': 'scene/beihan.jpg',
    '广寒界': 'scene/luanxinghai.jpg',
    '慕兰草原': 'scene/tianyuan.jpg',
  },
  char: {
    '韩立': 'char/hanli.jpg',
    '南宫婉': 'char/nangongwan.jpg',
    '墨大夫': 'char/modafu.jpg',
    '银月': 'char/yinyue.jpg',
    '紫灵': 'char/ziling.jpg',
    '元瑶': 'char/yuanyao.jpg',
    '厉飞雨': 'char/hanli.jpg',
    '李化元': 'char/modafu.jpg',
    '玄骨上人': 'char/modafu.jpg',
    '古或今': 'char/modafu.jpg',
    '蟹道人': 'char/hanli.jpg',
    '陈巧倩': 'char/yuanyao.jpg',
    '慕沛灵': 'char/yuanyao.jpg',
  },
  /** 头像（列表 / 好友 / 聊天） */
  face: {
    '韩立': 'icon/face_hanli.jpg',
    '南宫婉': 'icon/face_nangongwan.jpg',
    '紫灵': 'icon/face_ziling.jpg',
  },
  /** 功法图标 */
  skill: {
    '青元剑诀': 'icon/skill_qingyuan.jpg',
    '梵圣真魔功': 'icon/skill_fansheng.jpg',
    '大衍决': 'icon/skill_dayan.jpg',
    '惊蛰十二变': 'icon/skill_jingzhe.jpg',
  },
  /** 货币图标（11_资源货币） */
  cur: {
    C001: 'icon/stone_low.jpg',
    C002: 'icon/stone_mid.jpg',
    C003: 'icon/stone_high.jpg',
    C004: 'icon/stone_top.jpg',
    C007: 'icon/yuanbao.jpg',
    C005: 'icon/contrib.jpg',
  },
  /** 职业图标（03_职业派系） */
  cls: {
    '剑修': 'icon/cls_jian.jpg',
    '体修': 'icon/cls_ti.jpg',
    '法修': 'icon/cls_fa.jpg',
    '魔修': 'icon/cls_mo.jpg',
  },
  /** 装备槽位图标（20_图标资源 IC-030~033） */
  slot: {
    weapon: 'icon/slot_weapon.jpg',
    armor: 'icon/slot_armor.jpg',
    helm: 'icon/slot_helm.jpg',
    ring: 'icon/slot_ring.jpg',
  },
  /** UI 通用图标（IC-029/034/035/036/040） */
  ui: {
    dungeon: 'icon/dungeon_gate.jpg',
    lock: 'icon/lock.jpg',
    reddot: 'icon/reddot.jpg',
    check: 'icon/check.jpg',
    star: 'icon/star.jpg',
    questMain: 'icon/quest_main.jpg',
    questDaily: 'icon/quest_daily.jpg',
  },
  /** 属性图标（IC-037~039） */
  attr: {
    atk: 'icon/attr_atk.jpg',
    def: 'icon/attr_def.jpg',
    hp: 'icon/attr_hp.jpg',
  },
  /** 灵宠头像 */
  pet: {
    '噬金虫': 'icon/pet_shijin.jpg',
    '啼魂兽': 'icon/pet_tihun.jpg',
  },
  item: {
    '掌天瓶': 'item/zhangtianping.jpg',
    '青竹蜂云剑': 'item/qingzhujian.jpg',
    '虚天鼎': 'item/xutianding.jpg',
    '筑基丹': 'item/zhujidan.jpg',
    '凝婴丹': 'item/ningyingdan.jpg',
  },
  /** 取场景图（无匹配则回落主背景） */
  sceneOf(name) {
    if (!name) return this.base + this.scene.main;
    for (const k in this.scene) {
      if (k === 'main') continue;
      if (name.indexOf(k) >= 0) return this.base + this.scene[k];
    }
    return this.base + this.scene.main;
  },
  /** 取角色立绘 */
  charOf(name) {
    if (!name) return null;
    for (const k in this.char) if (name.indexOf(k) >= 0) return this.base + this.char[k];
    return null;
  },
  itemOf(name) {
    if (!name) return null;
    for (const k in this.item) if (name.indexOf(k) >= 0) return this.base + this.item[k];
    return null;
  },
  /** 头像 */
  faceOf(name) {
    if (!name) return null;
    for (const k in this.face) if (name.indexOf(k) >= 0) return this.base + this.face[k];
    return null;
  },
  /** 装备槽位图标 */
  slotOf(id) {
    const v = this.slot[id];
    return v ? this.base + v : null;
  },
  /** UI 图标 */
  uiOf(id) {
    const v = this.ui[id];
    return v ? this.base + v : null;
  },
  /** 属性图标 */
  attrOf(id) {
    const v = this.attr[id];
    return v ? this.base + v : null;
  },
  /** 职业图标 */
  clsOf(name) {
    if (!name) return null;
    for (const k in this.cls) if (name.indexOf(k) >= 0) return this.base + this.cls[k];
    return null;
  },
  /** 灵宠头像 */
  petOf(name) {
    if (!name) return null;
    for (const k in this.pet) if (name.indexOf(k) >= 0) return this.base + this.pet[k];
    return null;
  },
  /** 功法图标 */
  skillOf(name) {
    if (!name) return null;
    for (const k in this.skill) if (name.indexOf(k) >= 0) return this.base + this.skill[k];
    return null;
  },
  /** 货币图标 */
  curOf(id) {
    const v = this.cur[id];
    return v ? this.base + v : null;
  },
  /** 生成 img 标签，失败回落 emoji */
  img(url, emoji, cls) {
    if (!url) return emoji || '';
    return '<img src="' + url + '" class="' + (cls || 'artimg') + '" alt="" onerror="this.outerHTML=\'' + (emoji || '') + '\'">';
  },
};

/* =========================================================
 * 音频场景调度（按当前界面/地图自动切曲）
 * ========================================================= */
const AUDIO_SCENE = {
  /** 根据当前面板决定曲目 */
  trackFor(win, mapName) {
    if (win === 'fight') return 'battle';
    if (win === 'dungeon') return 'dungeon';
    if (win === 'story') return 'town';
    if (mapName) {
      const n = String(mapName);
      if (n.indexOf('禁地') >= 0 || n.indexOf('魔') >= 0 || n.indexOf('地渊') >= 0) return 'dungeon';
      if (n.indexOf('乱星海') >= 0 || n.indexOf('草原') >= 0 || n.indexOf('域') >= 0) return 'wild';
    }
    return 'town';
  },
  /** 渡劫专用 */
  trial() { AUDIO.play('trial'); },
};

window.ART = ART;
window.AUDIO_SCENE = AUDIO_SCENE;
window.FRXX = FRXX;
