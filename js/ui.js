/* =========================================================
 * ui.js —— 渲染 + 动画（全模块）
 * ========================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function fmt(n) {
  n = Math.round(n);
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + '兆';
  if (abs >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return n + '';
}
function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  if (m < 1440) return Math.round(m / 60) + ' 小时前';
  return Math.round(m / 1440) + ' 天前';
}
window.fmt = fmt; window.timeAgo = timeAgo;

/* ---------- 背景 ---------- */
function initBackground() {
  const cv = $('#bg'); const ctx = cv.getContext('2d');
  let W, H, stars = [], qi = [];
  function resize() {
    W = cv.width = innerWidth * devicePixelRatio; H = cv.height = innerHeight * devicePixelRatio;
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    stars = Array.from({ length: Math.round(innerWidth / 6) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 * devicePixelRatio, a: Math.random(), s: 0.4 + Math.random() * 1.2 }));
    qi = Array.from({ length: 26 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: (2 + Math.random() * 4) * devicePixelRatio, v: 0.2 + Math.random() * 0.5, a: Math.random() * Math.PI * 2 }));
  }
  resize(); addEventListener('resize', resize);
  (function loop() {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#080c18'); g.addColorStop(.55, '#0d1426'); g.addColorStop(1, '#12102a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const s of stars) { s.a += 0.02 * s.s; ctx.globalAlpha = 0.35 + 0.4 * Math.sin(s.a); ctx.fillStyle = '#cfe0ff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.3); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const p of qi) {
      p.y -= p.v * devicePixelRatio; p.a += 0.01;
      if (p.y < -20) { p.y = H + 20; p.x = Math.random() * W; }
      const x = p.x + Math.sin(p.a) * 18 * devicePixelRatio;
      const gr = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 4);
      gr.addColorStop(0, 'rgba(255,215,110,.55)'); gr.addColorStop(1, 'rgba(255,215,110,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, p.y, p.r * 4, 0, 6.3); ctx.fill();
    }
    requestAnimationFrame(loop);
  })();
}

function toast(msg, type = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + type; d.textContent = msg;
  $('#toasts').appendChild(d); setTimeout(() => d.remove(), 2600);
}

/* ---------- 修炼动画 ---------- */
let qiTimer = null;
function startQi() {
  if (qiTimer) return;
  qiTimer = setInterval(() => {
    const box = $('.cultivate'); if (!box) return;
    const p = document.createElement('div');
    p.className = 'qi';
    p.style.left = (30 + Math.random() * 100) + 'px';
    p.style.bottom = (30 + Math.random() * 40) + 'px';
    p.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
    p.style.animationDuration = (1.6 + Math.random()) + 's';
    box.appendChild(p); setTimeout(() => p.remove(), 3000);
  }, 420);
}
function flashBreakthrough() {
  const f = $('#flash');
  f.innerHTML = '<div class="lightpillar"></div>';
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  setTimeout(() => { f.classList.remove('go'); f.innerHTML = ''; }, 1600);
}

/* ---------- 战斗动画 ---------- */
const A = { me: null, foe: null };
function setFighters(meIcon, foeIcon, foeName) {
  A.me = $('#fMe'); A.foe = $('#fFoe');
  A.me.firstChild.textContent = meIcon;
  A.foe.style.display = 'flex';
  A.foe.firstChild.textContent = foeIcon;
  A.me.querySelector('.nm').textContent = '你';
  A.foe.querySelector('.nm').textContent = foeName;
  $('#foeNm').textContent = foeName; $('#meNm').textContent = '你';
}
function floatNum(isMe, text, cls = '') {
  const arena = $('#arena'); if (!arena) return;
  const el = document.createElement('div');
  el.className = 'float-num ' + (isMe ? 'me ' : '') + cls;
  el.textContent = text;
  el.style.left = (isMe ? 30 : arena.clientWidth - 130) + 'px';
  el.style.top = (70 + Math.random() * 40) + 'px';
  arena.appendChild(el); setTimeout(() => el.remove(), 1200);
}
function boom(isMe) {
  const arena = $('#arena'); if (!arena) return;
  const el = document.createElement('div');
  el.className = 'slash';
  el.style.left = (isMe ? arena.clientWidth / 2 - 20 : arena.clientWidth / 2 - 70) + 'px';
  el.style.top = '90px';
  arena.appendChild(el); setTimeout(() => el.remove(), 550);
}
function shake() { const a = $('#arena'); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); }
function hitAnim(el, kind) { el.classList.remove('attack', 'hurt'); void el.offsetWidth; el.classList.add(kind); setTimeout(() => el.classList.remove(kind), 500); }
function hpBar(which, cur, max) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  $(which === 'me' ? '#meHp' : '#foeHp').style.width = pct + '%';
  $(which === 'me' ? '#meHpTxt' : '#foeHpTxt').textContent = `${Math.max(0, Math.round(cur))} / ${Math.round(max)}`;
}
function pushLog(text, cls = 'sys', box = '#logbox') {
  const b = $(box); if (!b) return;
  const p = document.createElement('p'); p.className = cls; p.textContent = text;
  b.appendChild(p); b.scrollTop = b.scrollHeight;
  while (b.children.length > 60) b.removeChild(b.firstChild);
}
function clearLog(box = '#logbox') { const b = $(box); if (b) b.innerHTML = ''; }

/* ---------- HUD ---------- */
function renderHUD(p) {
  const a = ENGINE.attrs(p);
  const face = $('#hFace'); if (face) face.firstChild.textContent = p.avatar || '🧙';
  const th = $('#tbHp'), tm = $('#tbMp');
  if (th) { th.style.width = '100%'; $('#tbHpTxt').textContent = `${fmt(a.hp)} 气血`; }
  if (tm) { tm.style.width = '100%'; $('#tbMpTxt').textContent = `${fmt(a.mp)} 灵力`; }
  $('#hRealm').textContent = ENGINE.realmName(p);
  $('#hRealm').style.color = GAME_CONFIG.realms[p.realm].color;
  $('#hExp').textContent = fmt(p.exp);
  $('#hStone').textContent = fmt(p.stone);
  $('#hPow').textContent = fmt(ENGINE.power(p));
  $('#hName').textContent = p.avatar + ' ' + p.name;
  const need = ENGINE.expNeed(p);
  const pct = Math.min(100, (p.exp / need) * 100);
  $('#hBar').style.width = pct + '%';
  $('#hBarTxt').textContent = `${fmt(p.exp)} / ${fmt(need)}`;
  $('#cultBar').style.width = pct + '%';
  $('#cultBarTxt').textContent = `${fmt(p.exp)} / ${fmt(need)}　（${ENGINE.realmName(p)}）`;
  $('#cultRate').textContent = '+' + fmt(ENGINE.expPerSec(p)) + ' /秒';
  $('#cultAvatar').textContent = p.avatar || '🧘';
  const yb = $('#hYuanbao'); if (yb && window.WALLET) yb.textContent = fmt(WALLET.get(p, 'C007'));
  const mt = $('#hMerit'); if (mt && window.WALLET) mt.textContent = fmt(WALLET.get(p, 'C014'));
}
function renderMeditate(p) {
  const btn = $('#btnMeditate'); if (!btn) return;
  const left = ENGINE.meditateCdLeft(p);
  if (left > 0) {
    btn.disabled = true;
    btn.textContent = `🧘 调息中 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    btn.classList.remove('act'); btn.classList.add('ghost');
  } else {
    btn.disabled = false; btn.textContent = '🧘 闭关修炼';
    btn.classList.add('act'); btn.classList.remove('ghost');
  }
}
function renderAttrs(p) {
  const a = ENGINE.attrs(p);
  const rows = [
    ['气血', fmt(a.hp)], ['灵力', fmt(a.mp)], ['攻击', fmt(a.atk)], ['防御', fmt(a.def)], ['身法', a.speed.toFixed(1)],
    ['暴击', (a.crit * 100).toFixed(1) + '%'], ['抗暴', (a.anticrit * 100).toFixed(1) + '%'],
    ['命中', (a.hit * 100).toFixed(0) + '%'], ['闪避', (a.dodge * 100).toFixed(1) + '%'],
    ['根骨', fmt(a.genu)], ['悟性', fmt(a.wuxing + (p.bonusWuxing || 0))], ['福缘', fmt(a.fuyuan)],
  ];
  $('#attrBox').innerHTML = rows.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
  $('#statBox').innerHTML = [
    ['总战力', fmt(ENGINE.power(p))], ['击杀', p.stats.kills], ['败北', p.stats.deaths],
    ['战次', p.stats.battles], ['闭关', p.stats.meditate || 0], ['秘境', p.stats.dungeon || 0],
    ['奇遇', p.stats.encounters || 0], ['累计修为', fmt(ENGINE.totalExp(p))],
    ['离线时长', Math.round(p.stats.offlineMin || 0) + ' 分'], ['入道', new Date(p.createdAt).toLocaleDateString()],
  ].map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
  const rt = ENGINE.rootInfo(p);
  $('#cultTip').textContent = `灵根【${rt.name}】${rt.desc}｜在线自动累积修为，离线也结算（上限 ${GAME_CONFIG.offlineMaxHours} 小时）`;
  const am = $('#attrMini');
  if (am) am.innerHTML = [['战力', fmt(ENGINE.power(p))], ['攻', fmt(a.atk)], ['防', fmt(a.def)], ['血', fmt(a.hp)],
    ['暴', (a.crit * 100).toFixed(1) + '%'], ['闪', (a.dodge * 100).toFixed(1) + '%'], ['悟', fmt(a.wuxing + (p.bonusWuxing || 0))], ['福', fmt(a.fuyuan)]]
    .map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
  const rc = $('#reincCard');
  if (rc) { rc.style.display = (p.stage === 3 && p.realm >= 5) ? '' : 'none'; $('#reincTip').textContent = GAME_CONFIG.reincarnation.desc + `　当前第 ${p.reinc || 0} 世`; }
}
function renderSpots(p) {
  const spots = GAME_CONFIG.cultivateSpots || [];
  $('#spotList').innerHTML = spots.map((s) => {
    const lock = p.realm < s.realmReq;
    return `<div class="mapc ${p.spot === s.id ? 'on' : ''} ${lock ? 'lock' : ''}" data-spot="${s.id}">
      <div class="ic">${s.icon}</div>
      <div style="flex:1"><div class="nm">${s.name} ${lock ? '🔒' : ''}</div>
      <div class="sub">修为 ×${s.expMul}${s.cost ? ` · ${s.cost} 灵石/时` : ''}</div>
      <div class="sub">${lock ? `需【${GAME_CONFIG.realms[s.realmReq].name}】境` : s.desc}</div></div></div>`;
  }).join('');
  const sm = $('#spotMini');
  const cur = spots.find((x) => x.id === p.spot) || spots[0];
  if (sm && cur) sm.innerHTML = `<div class="kv"><span>当前</span><b>${cur.icon} ${cur.name}</b></div>
    <div class="kv"><span>倍率</span><b>×${cur.expMul}</b></div>
    <div class="small mt8">在【角色】页可更换洞天</div>`;
  $$('#spotList [data-spot]').forEach((el) => el.onclick = () => {
    const id = el.dataset.spot;
    const s = spots.find((x) => x.id === id);
    if (p.realm < s.realmReq) return toast('境界不足', 'err');
    p.spot = id; renderSpots(p); renderHUD(p); save();
    toast(`已在【${s.name}】修炼`);
  });
}

/* ---------- 地图 ---------- */
let CUR_MAP = 0;
function renderMaps(p) {
  const cfg = GAME_CONFIG;
  $('#mapList').innerHTML = cfg.maps.map((m, i) => {
    const lock = p.realm < m.minRealm;
    return `<div class="mapc ${i === CUR_MAP ? 'on' : ''} ${lock ? 'lock' : ''}" data-map="${i}">
      <div class="ic">${m.icon}</div>
      <div style="flex:1">
        <div class="nm">${m.name} ${lock ? '🔒' : ''}</div>
        <div class="sub">${lock ? `需【${cfg.realms[m.minRealm].name}】境` : `修为 ${fmt(m.exp)} · 灵石 ${fmt(m.stone)} · 掉落 ${Math.round(m.dropRate * 100)}%`}</div>
        <div class="sub">${m.monsters.map((x) => x.icon + x.name).join('　')}</div>
      </div></div>`;
  }).join('');
  $$('#mapList [data-map]').forEach((el) => el.onclick = () => {
    const i = +el.dataset.map;
    if (p.realm < GAME_CONFIG.maps[i].minRealm) return toast('修为不足，无法进入', 'err');
    CUR_MAP = i; renderMaps(p); setScene(GAME_CONFIG.maps[i].name);
  });
  // 初次进入时按当前所选地图铺场景
  setScene((cfg.maps[CUR_MAP] || {}).name);
}
function renderDungeons(p) {
  const list = GAME_CONFIG.dungeons || [];
  $('#dungeonList').innerHTML = list.map((d) => {
    const lock = p.realm < d.minRealm;
    const rw = d.reward || {};
    const rwTxt = Object.entries(rw).map(([k, v]) => ({ stone: '灵石', exp: '修为', herb: '灵草', ore: '矿石', skill: '功法', beast: '灵兽' }[k] ? `${{ stone: '灵石', exp: '修为', herb: '灵草', ore: '矿石', skill: '功法', beast: '灵兽' }[k]}×${v}` : '')).filter(Boolean).join('、');
    return `<div class="mapc ${lock ? 'lock' : ''}" data-dg="${d.id}">
      <div class="ic">${d.icon}</div>
      <div style="flex:1">
        <div class="nm">${d.name} ${lock ? '🔒' : ''}</div>
        <div class="sub">${d.waves} 波 + BOSS【${d.boss.name}】· 限时 ${d.timeLimit}s</div>
        <div class="sub">产出：${rwTxt}</div>
        <div class="sub">${lock ? `需【${GAME_CONFIG.realms[d.minRealm].name}】境` : ''}</div>
      </div>
      <button class="mini" data-enter="${d.id}" ${lock ? 'disabled' : ''}>进入</button></div>`;
  }).join('');
  $$('#dungeonList [data-enter]').forEach((b) => b.onclick = () => onEnterDungeon(p, b.dataset.enter));
}

/* ---------- 功法 ---------- */
function renderSkills(p) {
  const eq = p.equipped || [];
  const eb = $('#equippedSkills');
  if (eb) eb.innerHTML = eq.length ? eq.map((id) => {
    const sk = SYS.skillDef(id); if (!sk) return '';
    const own = SYS.ownSkill(p, id);
    return `<div class="skcell on" data-sk="${id}"><div class="si">${sk.icon}</div><div class="sn">${sk.name}</div><div class="sl">${own ? own.level : 1} 层</div></div>`;
  }).join('') : '<div class="small" style="grid-column:1/-1">尚未装备功法</div>';
  $$('#equippedSkills [data-sk]').forEach((el) => el.onclick = () => { SK_SEL = el.dataset.sk; renderSkills(p); });

  const owned = p.skills || [];
  const sb = $('#skillList');
  if (sb) sb.innerHTML = owned.length ? owned.map((o) => {
    const sk = SYS.skillDef(o.id); if (!sk) return '';
    const on = eq.includes(o.id);
    return `<div class="skcell ${on ? 'on' : ''}" data-sk2="${o.id}"><div class="si">${sk.icon}</div><div class="sn">${sk.name}</div><div class="sl">${o.level}/${sk.maxLevel}层${on ? ' ✔' : ''}</div></div>`;
  }).join('') : '<div class="small" style="grid-column:1/-1">尚未习得功法（坊市购买 / 秘境掉落）</div>';
  $$('#skillList [data-sk2]').forEach((el) => el.onclick = () => { SK_SEL = el.dataset.sk2; renderSkills(p); });

  renderSkillDetail(p);
}
let SK_SEL = null;
function renderSkillDetail(p) {
  const box = $('#skillDetail'); if (!box) return;
  const sk = SK_SEL ? SYS.skillDef(SK_SEL) : null;
  if (!sk) { box.innerHTML = '<div class="small">点击功法查看详情</div>'; return; }
  const own = SYS.ownSkill(p, SK_SEL);
  const lv = own ? own.level : 1;
  const on = (p.equipped || []).includes(SK_SEL);
  const cost = SYS.skillUpCost(sk, lv);
  const fit = Math.round(SYS.skillFit(p, sk) * 100);
  const eff = [];
  if (sk.passive) for (const k in sk.passive) eff.push(`${({ hp: '气血', atk: '攻击', def: '防御', exp: '修炼速度', crit: '暴击', hit: '命中', anticrit: '抗暴' }[k] || k)} +${(sk.passive[k] * 100).toFixed(0)}%`);
  if (sk.active) eff.push(`伤害 ${sk.active.mult}倍 · 耗灵力 ${sk.active.mp}${sk.active.cd ? ` · 冷却 ${sk.active.cd} 回合` : ''}`);
  box.innerHTML = `<div class="hd" style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
      <div class="big bslot q${sk.root === p.root ? 3 : 2}" style="cursor:default">${sk.icon}</div>
      <div><div class="nm">${sk.name}</div><div class="sub">${sk.type === 'heart' ? '心法' : '功法'} · ${lv}/${sk.maxLevel} 层 · 灵根适配 ${fit}%</div></div></div>
    <div class="goal small">${sk.desc}</div>
    <div class="small" style="color:var(--jade)">当前效果：${eff.join('、') || '—'}</div>
    <div class="acts" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      ${on ? `<button class="mini" id="skOff">卸下</button>` : `<button class="mini" id="skOn">装备</button>`}
      <button class="mini" id="skUp">参悟 ${fmt(cost)}💎</button>
      <button class="mini" id="skForget" style="display:none">遗忘</button>
    </div>`;
  const b1 = on ? $('#skOff') : $('#skOn');
  if (b1) b1.onclick = () => { const r = on ? SYS.unequipSkill(p, SK_SEL) : SYS.equipSkill(p, SK_SEL); toast(r.msg, r.ok ? 'ok' : 'err'); renderSkills(p); renderMini(p); save(); };
  $('#skUp').onclick = () => { const r = SYS.upgradeSkill(p, SK_SEL); toast(r.msg, r.ok ? 'ok' : 'err'); renderSkills(p); renderHUD(p); renderMini(p); save(); };
}

/* ---------- 丹器 ---------- */
function renderAlchemy(p) {
  const rec = (GAME_CONTENT.alchemy || {}).recipes || [];
  $('#alchemyRateTxt').textContent = `成功率加成 +${Math.round((SYS.alchemyRate(p) - 1) * 100)}%`;
  $('#recipeList').innerHTML = rec.map((r) => {
    const costTxt = Object.entries(r.cost).map(([k, v]) => `${(ENGINE.extraPill(k) || (GAME_CONTENT.herbs || []).find((h) => h.id === k) || {}).name || k}×${v}`).join('、');
    const okAll = Object.entries(r.cost).every(([k, v]) => ENGINE.hasItem(p, k, v));
    return `<div class="item"><div class="ic">${r.icon}</div>
      <div class="info"><div class="nm">${r.name}</div><div class="sub">${costTxt}｜成功率 ${Math.round(Math.min(0.98, r.rate * SYS.alchemyRate(p)) * 100)}%</div>
      <div class="sub">${r.desc || ''}</div></div>
      <button class="mini" data-refine="${r.id}" ${okAll ? '' : 'disabled'}>炼制</button></div>`;
  }).join('');
  $$('#recipeList [data-refine]').forEach((b) => b.onclick = () => {
    const r = SYS.refine(p, b.dataset.refine);
    toast(r.msg, r.ok ? 'ok' : 'err'); renderAlchemy(p); renderHUD(p); renderBag && renderBag(p); save();
  });

  const fr = (GAME_CONTENT.forge || {}).recipes || [];
  $('#forgeRateTxt').textContent = `成功率加成 +${Math.round((SYS.forgeRate(p) - 1) * 100)}%`;
  $('#forgeList').innerHTML = fr.map((r) => {
    const costTxt = Object.entries(r.cost).map(([k, v]) => `${((GAME_CONTENT.ores || []).find((h) => h.id === k) || {}).name || k}×${v}`).join('、');
    const okAll = Object.entries(r.cost).every(([k, v]) => ENGINE.hasItem(p, k, v));
    return `<div class="item"><div class="ic">${r.icon}</div>
      <div class="info"><div class="nm">${r.name} <span class="small q${r.q}">${GAME_CONFIG.qualities[r.q].name}</span></div>
      <div class="sub">${costTxt}｜成功率 ${Math.round(Math.min(0.98, r.rate * SYS.forgeRate(p)) * 100)}%</div>
      <div class="sub">攻${r.base.atk || 0} 防${r.base.def || 0} 血${r.base.hp || 0}</div></div>
      <button class="mini" data-forge="${r.id}" ${okAll ? '' : 'disabled'}>打造</button></div>`;
  }).join('');
  $$('#forgeList [data-forge]').forEach((b) => b.onclick = () => {
    const r = SYS.forge(p, b.dataset.forge);
    toast(r.msg, r.ok ? 'ok' : 'err'); renderAlchemy(p); renderHUD(p); renderBag && renderBag(p); save();
  });

  const tl = GAME_CONTENT.talismans || [];
  $('#talismanList').innerHTML = tl.map((t) => {
    const costTxt = Object.entries(t.cost).map(([k, v]) => `${((GAME_CONTENT.herbs || []).find((h) => h.id === k) || (GAME_CONTENT.ores || []).find((h) => h.id === k) || {}).name || k}×${v}`).join('、');
    const okAll = Object.entries(t.cost).every(([k, v]) => ENGINE.hasItem(p, k, v));
    return `<div class="item"><div class="ic">${t.icon}</div>
      <div class="info"><div class="nm">${t.name}</div><div class="sub">${t.desc}</div><div class="sub">${costTxt}</div></div>
      <button class="mini" data-tal="${t.id}" ${okAll ? '' : 'disabled'}>制作</button></div>`;
  }).join('');
  $$('#talismanList [data-tal]').forEach((b) => b.onclick = () => { const r = SYS.makeTalisman(p, b.dataset.tal); toast(r.msg, r.ok ? 'ok' : 'err'); renderAlchemy(p); renderBag && renderBag(p); save(); });
}

/* ---------- 灵兽 ---------- */
let CUR_BEAST = -1;
function renderBeasts(p) {
  $('#beastCount').textContent = `（${p.beasts.length} 只）`;
  $('#beastList').innerHTML = p.beasts.length ? p.beasts.map((b, i) => {
    const s = ENGINE.beastStats(b);
    const on = p.activeBeast === i;
    return `<div class="item ${on ? 'on-item' : ''}" data-beast="${i}">
      <div class="ic">${((GAME_CONTENT.beasts || []).find((x) => x.id === b.ref) || {}).icon || '🐾'}</div>
      <div class="info"><div class="nm">${s.name} ${on ? '（出战）' : ''}${p.riding && on ? '🐎' : ''}</div>
      <div class="sub">Lv.${b.level} ${b.stage}阶 · 资质 ${b.apt.toFixed(2)}｜攻${fmt(s.atk)} 防${fmt(s.def)} 血${fmt(s.hp)}</div>
      <div class="sub">技能【${s.skill}】</div></div></div>`;
  }).join('') : '<div class="small">尚无灵兽（历练奇遇或坊市兽笼可获得）</div>';
  $$('#beastList [data-beast]').forEach((el) => el.onclick = () => { CUR_BEAST = +el.dataset.beast; renderBeastDetail(p); });
  if (CUR_BEAST >= 0 && CUR_BEAST < p.beasts.length) renderBeastDetail(p);
  else $('#beastDetail').style.display = 'none';
}
function renderBeastDetail(p) {
  const b = p.beasts[CUR_BEAST];
  if (!b) { $('#beastDetail').style.display = 'none'; return; }
  $('#beastDetail').style.display = '';
  const s = ENGINE.beastStats(b);
  const cfg = GAME_CONTENT.beast || {};
  $('#beastWho').textContent = `${s.name} Lv.${b.level}`;
  $('#beastInfo').innerHTML = [
    ['等级', `${b.level} / ${cfg.maxLevel}`], ['阶位', `${b.stage} / ${cfg.maxStage}`],
    ['资质', b.apt.toFixed(2)], ['经验', `${Math.round(b.exp)} / ${ENGINE.beastExpNeed(b)}`],
    ['攻击', fmt(s.atk)], ['防御', fmt(s.def)], ['气血', fmt(s.hp)],
    ['技能', `${s.skill}(×${s.skillMult})`], ['可骑乘', s.ride ? '是' : '否'],
  ].map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
  const foods = p.bag.filter((x) => x.kind === 'herb' || x.kind === 'ore').slice(0, 12);
  $('#beastFood').innerHTML = foods.length ? foods.map((f) => `<button class="mini" data-feed="${f.id}" style="margin:2px">${f.icon}${f.name}×${f.count || 1}</button>`).join('') : '<div class="small">背包中没有可吞噬的材料</div>';
  $$('#beastFood [data-feed]').forEach((el) => el.onclick = () => {
    const r = SYS.feedBeast(p, CUR_BEAST, el.dataset.feed);
    toast(r.msg, r.ok ? 'ok' : 'err'); renderBeasts(p); renderAttrs(p); save();
  });
}
function bindBeastButtons(p) {
  $('#btnBeastActive').onclick = () => { const r = SYS.setActiveBeast(p, CUR_BEAST); toast(r.msg); renderBeasts(p); renderAttrs(p); save(); };
  $('#btnBeastAdvance').onclick = () => { const r = SYS.advanceBeast(p, CUR_BEAST); toast(r.msg, r.ok ? 'ok' : 'err'); renderBeasts(p); renderHUD(p); save(); };
  $('#btnBeastRide').onclick = () => { const r = SYS.toggleRide(p); toast(r.msg, r.ok ? 'ok' : 'err'); renderBeasts(p); save(); };
  $('#btnBeastRelease').onclick = () => { if (!confirm('确认放归该灵兽？')) return; const r = SYS.releaseBeast(p, CUR_BEAST); toast(r.msg); CUR_BEAST = -1; renderBeasts(p); renderHUD(p); save(); };
}

/* ---------- 洞府 ---------- */
function renderCave(p) {
  const bs = GAME_CONFIG.cave.buildings || [];
  $('#caveBuildings').innerHTML = bs.map((b) => {
    const lv = p.cave.lv[b.id] || 0;
    const cost = SYS.buildingCost(p, b.id);
    return `<div class="item"><div class="ic">${b.icon}</div>
      <div class="info"><div class="nm">${b.name} <span class="small">Lv.${lv}/${b.maxLevel}</span></div>
      <div class="sub">${b.desc}</div>
      <div class="sub">当前每小时：${b.outType === 'stone' ? Math.round(SYS.buildingDef(b.id).outPerHour * lv) + ' 灵石' : b.outType === 'herb' ? Math.round(b.outPerHour * lv) + ' 灵草' : '+' + Math.round(b.outPerHour * lv * 100) + '% ' + ({ exp: '修炼', alchemyRate: '炼丹率', forgeRate: '炼器率' }[b.outType] || '')}</div></div>
      <button class="mini" data-upb="${b.id}" ${cost === Infinity || p.stone < cost ? 'disabled' : ''}>${cost === Infinity ? '满级' : '升级 ' + fmt(cost)}</button></div>`;
  }).join('');
  $$('#caveBuildings [data-upb]').forEach((el) => el.onclick = () => { const r = SYS.upgradeBuilding(p, el.dataset.upb); toast(r.msg, r.ok ? 'ok' : 'err'); renderCave(p); renderHUD(p); save(); });

  const arrs = GAME_CONFIG.cave.arrays || [];
  $('#caveArrays').innerHTML = arrs.map((a) => {
    const on = p.cave.array === a.id;
    return `<div class="mapc ${on ? 'on' : ''}" data-arr="${a.id}">
      <div class="ic">${a.icon}</div>
      <div style="flex:1"><div class="nm">${a.name}${on ? '（已布置）' : ''}</div><div class="sub">${a.desc}${a.cost ? ` · ${fmt(a.cost)} 灵石` : ''}</div></div></div>`;
  }).join('');
  $$('#caveArrays [data-arr]').forEach((el) => el.onclick = () => { const r = SYS.setArray(p, el.dataset.arr); toast(r.msg, r.ok ? 'ok' : 'err'); renderCave(p); renderAttrs(p); save(); });

  const hrs = (Date.now() - (p.cave.lastHarvest || Date.now())) / 3600000;
  const stone = Math.round(ENGINE.caveOutputPerHour(p, 'stone') * Math.min(hrs, 24));
  const herb = Math.round(ENGINE.caveOutputPerHour(p, 'herb') * Math.min(hrs, 24));
  $('#caveOutput').innerHTML = `<div class="kv"><span>已积累时长</span><b>${Math.round(Math.min(hrs, 24) * 60)} 分钟</b></div>
    <div class="kv"><span>待收灵石</span><b>${fmt(stone)}</b></div>
    <div class="kv"><span>待收灵草</span><b>${herb}</b></div>
    <div class="small mt8">产出上限 24 小时，记得常来收取</div>`;
}

/* ---------- 宗门 ---------- */
async function renderSect(p) {
  const list = await SYS.loadSects();
  if (p.sect) {
    const s = list.find((x) => x.id === p.sect) || { name: '未知' };
    $('#mySect').innerHTML = `<div class="kv"><span>宗门</span><b>${s.icon || ''} ${s.name}</b></div>
      <div class="kv"><span>职位</span><b>${SYS.sectRankName(p)}</b></div>
      <div class="kv"><span>贡献</span><b>${p.sectInfo ? p.sectInfo.contrib : 0}</b></div>
      <div class="kv"><span>加成</span><b>${Object.entries(s.buff || {}).map(([k, v]) => ({ atk: '攻击', def: '防御', hp: '气血', crit: '暴击', anticrit: '抗暴', alchemyRate: '炼丹', forgeRate: '炼器', rob: '掠夺' }[k] || k) + '+' + Math.round(v * 100) + '%').join('、')}</b></div>
      <button class="ghost mt8" id="btnLeaveSect">退出宗门</button>`;
    $('#btnLeaveSect').onclick = async () => { const r = await SYS.leaveSect(p); toast(r.msg); renderSect(p); renderAttrs(p); save(); };
    $('#sectTaskCard').style.display = '';
    $('#sectShopCard').style.display = '';
    $('#sectTasks').innerHTML = (GAME_SOCIAL.sectTaskRewards || []).map((t) => `<div class="item"><div class="ic">📜</div>
      <div class="info"><div class="nm">${t.name}</div><div class="sub">${t.desc}｜贡献 +${t.contrib}</div></div>
      <button class="mini" data-st="${t.id}">完成</button></div>`).join('');
    $$('#sectTasks [data-st]').forEach((b) => b.onclick = () => { const r = SYS.doSectTask(p, b.dataset.st); toast(r.msg, r.ok ? 'ok' : 'err'); renderSect(p); renderHUD(p); save(); });
    $('#sectShop').innerHTML = (GAME_SOCIAL.sectShop || []).map((it) => `<div class="item"><div class="ic">${it.icon}</div>
      <div class="info"><div class="nm">${it.name}</div><div class="sub">${Object.entries(it.give).map(([k, v]) => k + '×' + v).join('、')}</div></div>
      <button class="mini" data-ss="${it.id}" ${((p.sectInfo && p.sectInfo.contrib) || 0) < it.contrib ? 'disabled' : ''}>${it.contrib} 贡献</button></div>`).join('');
    $$('#sectShop [data-ss]').forEach((b) => b.onclick = () => { const r = SYS.buySectShop(p, b.dataset.ss); toast(r.msg, r.ok ? 'ok' : 'err'); renderSect(p); renderBag && renderBag(p); save(); });
  } else {
    $('#mySect').innerHTML = '<div class="small">尚未加入宗门</div>';
    $('#sectTaskCard').style.display = 'none';
    $('#sectShopCard').style.display = 'none';
  }
  $('#sectCostTip').textContent = `创建需 ${fmt(GAME_SOCIAL.sectCreateCost || 3000)} 灵石`;
  $('#sectList').innerHTML = list.map((s) => `<div class="mapc"><div class="ic">${s.icon}</div>
    <div style="flex:1"><div class="nm">${s.name} <span class="small">${s.members || 0} 人</span></div>
    <div class="sub">${s.desc}</div>
    <div class="sub">${Object.entries(s.buff || {}).map(([k, v]) => ({ atk: '攻击', def: '防御', hp: '气血', crit: '暴击', anticrit: '抗暴', alchemyRate: '炼丹', forgeRate: '炼器', rob: '掠夺' }[k] || k) + '+' + Math.round(v * 100) + '%').join('、')}${s.levelReq ? `｜需${GAME_CONFIG.realms[s.levelReq].name}` : ''}</div></div>
    <button class="mini" data-join="${s.id}" ${p.sect ? 'disabled' : ''}>${p.sect === s.id ? '已入' : '加入'}</button></div>`).join('');
  $$('#sectList [data-join]').forEach((b) => b.onclick = async () => { const r = await SYS.joinSect(p, b.dataset.join); toast(r.msg, r.ok ? 'ok' : 'err'); renderSect(p); renderAttrs(p); save(); });
}

/* ---------- 任务 ---------- */
/* ---------- 任务面板（列表 + 详情） ---------- */
let TASK_SEL = { main: null, daily: null, bounty: null };
const NPC_FACE = { main: '🧓', daily: '📜', bounty: '📮' };

function taskListOf(p, type) {
  if (type === 'main') {
    const all = (SC().tasks.main || []);
    const idx = p.tasks.mainIdx || 0;
    return all.map((t, i) => ({
      id: t.id, name: t.name, desc: t.desc, reward: t.reward, type: 'main',
      state: i < idx ? 'claimed' : (i === idx ? (SYS.checkMain(p) ? 'done' : 'doing') : 'lock'),
      prog: 0, need: 0, npc: '引路人',
      say: i < idx ? '此章已了，前路尚远。' : (SYS.checkMain(p) ? '不错，你已达成条件，速来领赏。' : '去吧，修为到了自然水到渠成。'),
    }));
  }
  if (type === 'daily') {
    SYS.refreshDaily(p);
    return SYS.dailyList(p).map((t) => ({
      id: t.id, name: t.name, desc: t.desc, reward: t.reward, type: 'daily',
      state: t.claimed ? 'claimed' : (t.done ? 'done' : 'doing'), prog: t.prog, need: t.need, npc: '执事弟子',
      say: t.claimed ? '今日份已领，明日再来。' : (t.done ? '已完成，领赏去吧。' : '每日功课不可荒废。'),
    }));
  }
  return SYS.bountyList(p).map((t) => ({
    id: t.id, name: t.name, desc: t.desc, reward: t.reward, type: 'bounty',
    state: t.claimed ? 'claimed' : (t.done ? 'done' : 'doing'), prog: t.prog, need: t.need, npc: '悬赏长老',
    say: t.claimed ? '赏金已付，好走。' : (t.done ? '妖已除，赏金在此。' : '去指定的地方，斩够数目再回来。'),
  }));
}
const ST_TXT = { claimed: '已领取', done: '可领取', doing: '进行中', lock: '未解锁' };

function renderTaskPane(p, type, listId, detailId) {
  const list = taskListOf(p, type);
  const lb = $(listId);
  if (lb) lb.innerHTML = list.map((t) => `<div class="taskitem ${TASK_SEL[type] === t.id ? 'on' : ''}" data-tid="${t.id}">
      <div class="tt">${t.name}</div>
      <div class="ss ${t.state === 'done' ? 'done' : t.state === 'claimed' ? 'fin' : 'do'}">${ST_TXT[t.state]}${t.need ? ` ${t.prog}/${t.need}` : ''}</div>
    </div>`).join('') || '<div class="small">暂无任务</div>';
  $$(`${listId} [data-tid]`).forEach((el) => el.onclick = () => { TASK_SEL[type] = el.dataset.tid; renderTaskPane(p, type, listId, detailId); });

  const cur = list.find((t) => t.id === TASK_SEL[type]) || list.find((t) => t.state === 'done') || list[0];
  const db = $(detailId); if (!db) return;
  if (!cur) { db.innerHTML = '<div class="small">暂无任务</div>'; return; }
  const rwHtml = Object.entries(cur.reward || {}).map(([k, v]) => {
    const icon = { stone: '💎', exp: '✨', herb: '🌿', ore: '⛏️', pill: '💊', skill: '📜', contrib: '🏯' }[k] || '🎁';
    const nm = { stone: '灵石', exp: '修为', herb: '灵草', ore: '矿石', pill: '丹药', skill: '功法', contrib: '贡献' }[k] || k;
    return `<span class="rwi">${icon} ${nm}×${v}</span>`;
  }).join('');
  const btn = cur.state === 'done'
    ? `<button class="act" data-tclaim="${cur.id}">✔ 领取奖励</button>`
    : cur.state === 'claimed' ? `<button class="ghost" disabled>已领取</button>`
    : `<button class="ghost" disabled>进行中</button>`;
  db.innerHTML = `<div class="npc"><div class="face">${NPC_FACE[type]}</div>
      <div><div class="nm">${cur.npc}</div><div class="tag">${type === 'main' ? '主线任务' : type === 'daily' ? '每日任务' : '悬赏任务'}</div></div></div>
    <div class="say">「${cur.say}」</div>
    <div class="row" style="justify-content:space-between"><span style="font-size:14px;font-weight:700;color:var(--gold)">${cur.name}</span><span class="small">${ST_TXT[cur.state]}</span></div>
    <div class="goal small">${cur.desc}${cur.need ? `　进度 <b style="color:var(--jade)">${cur.prog}/${cur.need}</b>` : ''}</div>
    ${cur.need ? `<div class="bar" style="margin-bottom:8px"><i style="width:${Math.min(100, cur.prog / cur.need * 100)}%"></i><span>${cur.prog}/${cur.need}</span></div>` : ''}
    <div class="rw"><span class="small">奖励：</span>${rwHtml}</div>
    <div class="row">${btn}${cur.type === 'main' ? '<button class="mini" data-gostory>📖 前往剧情</button>' : ''}</div>`;
  const cb = db.querySelector('[data-tclaim]');
  if (cb) cb.onclick = () => {
    const r = cur.type === 'main' ? SYS.claimMain(p) : cur.type === 'daily' ? SYS.claimDaily(p, cur.id) : SYS.claimBounty(p, cur.id);
    toast(r.msg, r.ok ? 'ok' : 'err'); TASK_SEL[cur.type] = null; renderTasks(p); renderHUD(p); renderTracker(p); save();
  };
  const gs = db.querySelector('[data-gostory]');
  if (gs) gs.onclick = () => openWin('story');
}

function renderTasks(p) {
  renderTaskPane(p, 'main', '#taskList', '#taskDetail');
  renderTaskPane(p, 'daily', '#taskList2', '#taskDetail2');
  renderTaskPane(p, 'bounty', '#taskList3', '#taskDetail3');
  // 兼容旧容器
  const mt = SYS.mainTaskOf(p); const done = SYS.checkMain(p);
  const mb = $('#mainTask');
  if (mb) mb.innerHTML = mt ? `<div class="item"><div class="ic">📖</div><div class="info"><div class="nm">${mt.name}</div><div class="sub">${mt.desc}</div></div>
    <button class="mini" id="btnMain" ${done ? '' : 'disabled'}>${done ? '领取' : '进行中'}</button></div>` : '<div class="small">主线已全部完成</div>';
  const bm = $('#btnMain'); if (bm) bm.onclick = () => { const r = SYS.claimMain(p); toast(r.msg, r.ok ? 'ok' : 'err'); renderTasks(p); renderHUD(p); save(); };
  const dd = $('#dailyDate'); if (dd) dd.textContent = `（${SYS.todayStr()}）`;
  const db = $('#dailyTasks');
  if (db) db.innerHTML = SYS.dailyList(p).map((t) => `<div class="item"><div class="ic">${t.done ? '✅' : '⭕'}</div>
    <div class="info"><div class="nm">${t.name}</div><div class="sub">${t.desc}｜${t.prog}/${t.need}</div></div>
    <button class="mini" data-dt="${t.id}" ${t.done && !t.claimed ? '' : 'disabled'}>${t.claimed ? '已领' : '领取'}</button></div>`).join('');
  $$('#dailyTasks [data-dt]').forEach((b) => b.onclick = () => { const r = SYS.claimDaily(p, b.dataset.dt); toast(r.msg, r.ok ? 'ok' : 'err'); renderTasks(p); renderHUD(p); save(); });
  const bb = $('#bountyTasks');
  if (bb) bb.innerHTML = SYS.bountyList(p).map((t) => `<div class="item"><div class="ic">📮</div>
    <div class="info"><div class="nm">${t.name}</div><div class="sub">${t.desc}｜${t.prog}/${t.need}</div></div>
    <button class="mini" data-bt="${t.id}" ${t.done && !t.claimed ? '' : 'disabled'}>${t.claimed ? '已领' : '领取'}</button></div>`).join('');
  $$('#bountyTasks [data-bt]').forEach((b) => b.onclick = () => { const r = SYS.claimBounty(p, b.dataset.bt); toast(r.msg, r.ok ? 'ok' : 'err'); renderTasks(p); renderHUD(p); save(); });
}

function renderTracker(p) {
  const mt = SYS.mainTaskOf(p);
  const done = SYS.checkMain(p);
  const tm = $('#trkMain');
  if (tm) {
    if (mt) tm.innerHTML = `<div class="t">${mt.name}</div><div class="d">${mt.desc}</div>
      <div class="p">${done ? '✔ 可领取' : '进行中…'}</div>
      <div class="d">奖励 ${rewardTxt(mt.reward)}</div>`;
    else tm.innerHTML = '<div class="d">主线已全部完成</div>';
  }
  const dl = SYS.dailyList(p).filter((t) => !t.claimed).slice(0, 3);
  const bl = SYS.bountyList(p).filter((t) => !t.claimed).slice(0, 2);
  const td = $('#trkDaily');
  if (td) td.innerHTML = (dl.length || bl.length)
    ? dl.map((t) => `<div class="row-i"><span>${t.done ? '✔' : '○'} ${t.name}</span><span class="p">${t.prog}/${t.need}</span></div>`).join('')
      + bl.map((t) => `<div class="row-i"><span>${t.done ? '✔' : '○'} ${t.name}</span><span class="p">${t.prog}/${t.need}</span></div>`).join('')
    : '<div class="d">今日任务已清</div>';
  // 剧情提示
  const st = $('#trkStory');
  if (st) {
    const i = storyAvailable(p);
    st.innerHTML = i >= 0
      ? `<div class="t">${STORY[i].title}</div><div class="d">点击观看剧情</div>`
      : `<div class="d">下一章需【${GAME_CONFIG.realms[(STORY[p.storyIdx || 0] || {}).req || 0].name}】境</div>`;
  }
}

function rewardTxt(rw) {
  if (!rw) return '—';
  const map = { stone: '灵石', exp: '修为', herb: '灵草', ore: '矿石', contrib: '贡献', pill: '丹药', skill: '功法' };
  return Object.entries(rw).map(([k, v]) => (map[k] || k) + '×' + v).join('、');
}

/* ---------- 论道 / 排行 ---------- */
let ARENA_OPP = null;
function renderArena(p) {
  const tier = SYS.arenaTier(p.arena.score || 0);
  const t = SYS.todayStr();
  const left = (p.arena.dayDate === t) ? (GAME_SOCIAL.arena.maxPerDay || 20) - (p.arena.fights || 0) : (GAME_SOCIAL.arena.maxPerDay || 20);
  $('#arenaBox').innerHTML = `<div class="kv"><span>积分</span><b>${p.arena.score || 0}</b></div>
    <div class="kv"><span>段位</span><b>${tier.icon} ${tier.name}</b></div>
    <div class="kv"><span>胜 / 负</span><b>${p.arena.wins || 0} / ${p.arena.losses || 0}</b></div>
    <div class="kv"><span>今日剩余</span><b>${left}</b></div>
    <div class="small mt8">${ARENA_OPP ? `对手：${ARENA_OPP.avatar || ''} ${ARENA_OPP.name}（战力 ${fmt(ARENA_OPP.power || 0)}）` : '点击挑战随机匹配道友'}</div>
    <div class="small">段位每日奖励：${rewardTxt(tier.daily)}</div>`;
}
function renderRank(list) {
  if (!list || !list.length) { $('#rankList').innerHTML = '<div class="small">暂无数据（Actions 每 10 分钟汇总）</div>'; return; }
  $('#rankList').innerHTML = list.slice(0, 50).map((r, i) => `<div class="rank">
    <span class="no ${i < 3 ? 'top' : ''}">${i + 1}</span>
    <span class="nm">${r.name} · <span class="small">${r.realm}</span></span>
    <span class="pw">${fmt(r.power)}</span></div>`).join('');
}

/* ---------- 坊市 ---------- */
let MK_FILTER = 'all';
async function renderMarket(p) {
  const shop = GAME_SOCIAL.shop || [];
  $('#shopList').innerHTML = shop.map((it) => `<div class="item"><div class="ic">${it.icon}</div>
    <div class="info"><div class="nm">${it.name}</div><div class="sub">${Object.entries(it.give).map(([k, v]) => ({ herb: '灵草', ore: '矿石', pill: '丹药', skill: '功法', beast: '灵兽', rename: '改名帖' }[k] || k) + (v === 'random' ? '' : '×' + v)).join('、')}</div></div>
    <button class="mini" data-buy="${it.id}" ${p.stone < it.price ? 'disabled' : ''}>${fmt(it.price)}💎</button></div>`).join('');
  $$('#shopList [data-buy]').forEach((b) => b.onclick = () => onShopBuy(p, b.dataset.buy));

  const list = await SYS.marketList();
  const show = MK_FILTER === 'mine' ? list.filter((x) => x.seller === p.uid && !x.sold) : list.filter((x) => !x.sold);
  $('#marketList').innerHTML = show.length ? show.slice(0, 30).map((e) => {
    const mine = e.seller === p.uid;
    return `<div class="item"><div class="ic">${e.item.icon || '📦'}</div>
      <div class="info"><div class="nm ${e.item.kind === 'equip' ? 'q' + e.item.q : ''}">${e.item.name}${e.item.count ? '×' + e.item.count : ''}</div>
      <div class="sub">${mine ? '我的挂单' : e.sellerName} · ${timeAgo(e.at)}</div></div>
      ${mine ? `<button class="mini" data-cancel="${e.id}">撤单</button>` : `<button class="mini" data-mkbuy="${e.id}" ${p.stone < e.price ? 'disabled' : ''}>${fmt(e.price)}💎</button>`}</div>`;
  }).join('') : '<div class="small">暂无寄售商品</div>';
  $$('#marketList [data-mkbuy]').forEach((b) => b.onclick = async () => { const r = await SYS.marketBuy(p, b.dataset.mkbuy); toast(r.msg, r.ok ? 'ok' : 'err'); renderMarket(p); renderHUD(p); renderBag && renderBag(p); save(); });
  $$('#marketList [data-cancel]').forEach((b) => b.onclick = async () => { const r = await SYS.marketCancel(p, b.dataset.cancel); toast(r.msg, r.ok ? 'ok' : 'err'); renderMarket(p); renderBag && renderBag(p); });
}

/* ---------- 社交 ---------- */
function renderSocial(p) {
  const mails = p.mail || [];
  $('#mailCount').textContent = `（${mails.filter((m) => !m.read).length} 未读）`;
  $('#mailList').innerHTML = mails.length ? mails.map((m) => `<div class="item"><div class="ic">${m.claimed ? '📭' : m.reward ? '🎁' : '✉️'}</div>
    <div class="info"><div class="nm">${m.title || '邮件'}</div><div class="sub">${m.body || ''} · ${timeAgo(m.at)}</div></div>
    <button class="mini" data-ml="${m.id}" ${m.claimed ? 'disabled' : ''}>${m.claimed ? '已领' : m.reward ? '领取' : '已读'}</button></div>`).join('') : '<div class="small">暂无邮件</div>';
  $$('#mailList [data-ml]').forEach((b) => b.onclick = () => { const r = SYS.claimMail(p, b.dataset.ml); toast(r.msg, r.ok ? 'ok' : ''); renderSocial(p); renderHUD(p); save(); });

  $('#relationBox').innerHTML = `<div class="kv"><span>道侣</span><b>${p.dao.partnerName || '无'}</b></div>
    <div class="kv"><span>师尊</span><b>${p.dao.masterName || '无'}</b></div>
    <div class="kv"><span>加成</span><b>${p.dao.partner ? '修炼 +15%' : ''} ${p.dao.master ? '修为 +10%' : ''}</b></div>`;
}
async function renderChat() {
  const list = await SYS.chatLoad();
  $('#chatBox').innerHTML = list.length ? list.slice(0, 40).map((m) => `<p class="${m.uid === (window.P && P.uid) ? 'p' : 'm'}">${m.avatar || ''}<b>${m.name}</b>（${m.realm}）：${m.text} <span class="small">${timeAgo(m.at)}</span></p>`).join('') : '<p class="sys">还没有人发言</p>';
  const tk = $('#chatTicker');
  if (tk) tk.innerHTML = list.length ? `<b>${list[0].name}</b>：${list[0].text}` : '仙途漫漫，与君共勉。';
  const cd = $('#chatCd');
  if (cd) { const left = SYS.chatCooldownLeft(window.P || { lastChatAt: 0 }); cd.textContent = left > 0 ? `冷却 ${left}s` : ''; }
}

/* ---------- 底部功能栏 & 面板窗口 ---------- */
const TOOLS = [
  { k: 'story', i: '📖', n: '剧情' },
  { k: 'bottle', i: '🏺', n: '掌天瓶' },
  { k: 'role', i: '👤', n: '角色' },
  { k: 'bag', i: '🎒', n: '背包' },
  { k: 'fight', i: '⚔️', n: '历练' },
  { k: 'dungeon', i: '🌀', n: '秘境' },
  { k: 'skill', i: '📜', n: '功法' },
  { k: 'alchemy', i: '⚗️', n: '丹器' },
  { k: 'beast', i: '🐾', n: '灵兽' },
  { k: 'cave', i: '🏠', n: '洞府' },
  { k: 'sect', i: '🏯', n: '宗门' },
  { k: 'task', i: '📋', n: '任务' },
  { k: 'rank', i: '🏆', n: '论道' },
  { k: 'market', i: '💰', n: '坊市' },
  { k: 'partner', i: '🌸', n: '仙缘' },
  { k: 'codex', i: '📚', n: '图鉴' },
  { k: 'act', i: '🎯', n: '活动' },
  { k: 'skin', i: '👗', n: '时装' },
  { k: 'title', i: '🎖️', n: '称号' },
  { k: 'social', i: '💬', n: '交游' },
  { k: 'set', i: '⚙️', n: '系统' },
];
function renderToolBar() {
  const bar = $('#toolbar'); if (!bar) return;
  bar.innerHTML = TOOLS.map((t) => `<button class="tbtn" data-tab="${t.k}"><span class="ti">${t.i}</span><span class="tn">${t.n}</span></button>`).join('')
    + '<span class="sep-v"></span>'
    + '<button class="tbtn" id="tAuto"><span class="ti">🤖</span><span class="tn">挂机</span></button>';
}
let CUR_WIN = '';
function openWin(k) {
  $$('.win').forEach((w) => w.classList.toggle('on', w.dataset.page === k));
  $$('#toolbar .tbtn[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
  $('#storyBox').classList.toggle('on', k === 'story');
  CUR_WIN = k;
  if (k === 'story') renderStory();
  if (k === 'role') { UI.renderSpots(window.P); UI.renderAttrs(window.P); }
  if (k === 'bag') { UI.renderEquip(window.P); UI.renderBag(window.P); }
  if (k === 'fight') UI.renderMaps(window.P);
  if (k === 'dungeon') UI.renderDungeons(window.P);
  if (k === 'skill') UI.renderSkills(window.P);
  if (k === 'alchemy') UI.renderAlchemy(window.P);
  if (k === 'beast') UI.renderBeasts(window.P);
  if (k === 'cave') UI.renderCave(window.P);
  if (k === 'sect') UI.renderSect(window.P);
  if (k === 'task') { UI.renderTasks(window.P); UI.renderTracker(window.P); }
  if (k === 'rank') { UI.renderArena(window.P); window.loadRank && window.loadRank(); }
  if (k === 'market') UI.renderMarket(window.P);
  if (k === 'social') { UI.renderSocial(window.P); UI.renderChat(); }
  if (k === 'bottle') UI.renderBottle(window.P);
  if (k === 'partner') UI.renderPartners(window.P);
  if (k === 'codex') UI.renderCodex(window.P);
  if (k === 'act') UI.renderActs(window.P);
  if (k === 'title') UI.renderTitles(window.P);
  if (k === 'sect') UI.renderSectEx(window.P);
  if (k === 'skin') UI.renderSkins(window.P);
  if (k === 'beast') UI.renderWorms(window.P);
  if (k === 'social') UI.renderSocialX(window.P);
  if (k === 'market') UI.renderAuction(window.P);
  return k;
}
function closeWin() {
  $$('.win').forEach((w) => w.classList.remove('on'));
  $$('#toolbar .tbtn[data-tab]').forEach((b) => b.classList.remove('on'));
  $('#storyBox').classList.remove('on');
  CUR_WIN = '';
}
function bindWinTabs() {
  document.addEventListener('click', (e) => {
    const wt = e.target.closest('.wtabs button');
    if (wt) {
      const box = wt.closest('.win');
      box.querySelectorAll('.wtabs button').forEach((b) => b.classList.toggle('on', b === wt));
      const k = wt.dataset.wt;
      box.querySelectorAll('[data-wc]').forEach((c) => c.style.display = c.dataset.wc === k ? '' : 'none');
    }
    if (e.target.dataset && e.target.dataset.close !== undefined) closeWin();
    if (e.target.dataset && e.target.dataset.go) openWin(e.target.dataset.go);
  });
}

/* ---------- 剧情对话 ---------- */
let ST_CUR = -1, ST_SCENE = 0;
function renderStory() {
  const p = window.P; if (!p) return;
  const i = p.storyIdx || 0;
  if (!STORY[i]) {
    $('#stChapter').textContent = '终章已了';
    $('#stName').textContent = '旁白';
    $('#stFace').textContent = '☯️';
    $('#stText').innerHTML = '<div class="ln now">道途无尽，各自珍重。此界已了，去往他方吧。</div>';
    $('#stBtns').innerHTML = '';
    return;
  }
  if (ST_CUR !== i) { ST_CUR = i; ST_SCENE = 0; }
  const s = STORY[i];
  const sc = s.scenes[ST_SCENE];
  $('#stChapter').textContent = `${s.title}　（${ST_SCENE + 1}/${s.scenes.length}）`;
  $('#stName').textContent = sc.who;
  $('#stFace').textContent = sc.face;
  $('#stText').innerHTML = s.scenes.map((x, k) =>
    `<div class="ln ${k === ST_SCENE ? 'now' : k < ST_SCENE ? 'old' : ''}" style="${k > ST_SCENE ? 'display:none' : ''}"><b>${x.who}</b>：${x.text}</div>`).join('');
  const last = ST_SCENE >= s.scenes.length - 1;
  const can = p.realm >= s.req;
  $('#stBtns').innerHTML = (last ? '' : '<button class="act" id="stNext">继续 ▸</button>')
    + (last ? (can ? `<button class="act" id="stDone">✔ 完成本章 · 领奖</button>`
      : `<button class="ghost" disabled>需【${GAME_CONFIG.realms[s.req].name}】境</button>`) : '')
    + (STORY[i - 1] ? '<button class="ghost" id="stPrev">◂ 上一章</button>' : '');
  const nx = $('#stNext'); if (nx) nx.onclick = () => { ST_SCENE++; renderStory(); };
  const pv = $('#stPrev'); if (pv) pv.onclick = () => { ST_CUR = i - 1; ST_SCENE = (STORY[i - 1] ? STORY[i - 1].scenes.length - 1 : 0); renderStory(); };
  const dn = $('#stDone'); if (dn) dn.onclick = () => {
    const r = storyFinish(p, i);
    toast(r.msg, 'ok'); ST_CUR = -1; ST_SCENE = 0;
    if (typeof renderAll === 'function') renderAll();
    renderStory(); if (typeof save === 'function') save();
  };
}



/* ================= 页游风面板渲染（纸娃娃/背包网格/任务/功法/剧情） ================= */
const DOLL_CELLS = [
  { k: 'helmet' }, { k: 'necklace' }, { k: 'bracelet' },
  { k: 'weapon' }, { k: '__fig' }, { k: 'armor' },
  { k: 'artifact' }, { k: 'boots' }, { k: 'ring' },
];
let EQ_SEL = 'weapon';
let DEVOUR_TARGET = null;
let BAG_FILTER = 'all';
let BAG_SEL = null;


function slotDef(k) { return (C().slots || []).find((x) => x.key === k) || { key: k, name: k, icon: '❓' }; }
function itemIcon(it) {
  if (it.icon) return it.icon;
  if (it.kind === 'equip') return slotDef(it.slot).icon;
  return '📦';
}
function sellPrice(it) {
  const cfg = C();
  if (it.kind === 'equip') return Math.round((60 + (it.atk || 0) * 2 + (it.def || 0) * 2 + (it.hp || 0) * 0.4) * cfg.qualities[it.q || 0].mul * (1 + (it.level || 0) * 0.3));
  return (it.price || 50) * (it.count || 1);
}

/* ---------- 纸娃娃装备栏 ---------- */
function renderEquip(p) {
  const cfg = C();
  const html = DOLL_CELLS.map((c) => {
    if (c.k === '__fig') return `<div class="fig"><span>${p.avatar || '🧙'}</span></div>`;
    const sd = slotDef(c.k);
    const it = p.equip[c.k];
    const cls = it ? 'q' + (it.q || 0) : 'q0';
    const inner = it
      ? `${sd.icon}${it.level ? `<span class="lv">+${it.level}</span>` : ''}`
      : `<span style="opacity:.28;font-size:22px">${sd.icon}</span>`;
    return `<div class="bslot ${cls} ${EQ_SEL === c.k ? 'sel' : ''}" data-slot="${c.k}" title="${sd.name}">${inner}<span class="nm2">${sd.name}</span></div>`;
  }).join('');
  const box = $('#dollBox'); if (box) box.innerHTML = html;
  $$('#dollBox [data-slot]').forEach((el) => el.onclick = () => { EQ_SEL = el.dataset.slot; renderEquip(p); });

  const a = ENGINE.attrs(p);
  const dp = $('#dollPow'); if (dp) dp.textContent = fmt(ENGINE.power(p));
  const da = $('#dollAttr');
  if (da) da.innerHTML = [['攻击', fmt(a.atk)], ['防御', fmt(a.def)], ['气血', fmt(a.hp)], ['灵力', fmt(a.mp)],
    ['暴击', (a.crit * 100).toFixed(1) + '%'], ['身法', a.speed.toFixed(0)]]
    .map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
  renderEquipDetail(p);
}

function renderEquipDetail(p) {
  const box = $('#equipDetail'); if (!box) return;
  const it = p.equip[EQ_SEL];
  const sd = slotDef(EQ_SEL);
  if (!it) {
    box.innerHTML = `<div class="hd"><div class="big bslot q0" style="cursor:default">${sd.icon}</div>
      <div><div class="nm">${sd.name}（空）</div><div class="sub">尚未装备 · 去【储物袋】装备</div></div></div>`;
    return;
  }
  const q = C().qualities[it.q || 0];
  const m = q.mul * (1 + (it.level || 0) * C().enhance.attrPerLevel) * (1 + (it.temper || 0) * C().temper.attrPerLevel);
  box.innerHTML = `<div class="hd">
      <div class="big bslot q${it.q || 0}" style="cursor:default">${sd.icon}${it.level ? `<span class="lv">+${it.level}</span>` : ''}</div>
      <div><div class="nm" style="color:${q.color}">${it.name}</div>
      <div class="sub">${q.name} · ${sd.name} · 强化 +${it.level || 0} · 淬灵 ${it.temper || 0}</div></div></div>
    <div class="stats">
      ${[['攻击', Math.round((it.atk || 0) * m)], ['防御', Math.round((it.def || 0) * m)], ['气血', Math.round((it.hp || 0) * m)], ['灵力', Math.round((it.mp || 0) * m)]]
        .map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('')}
    </div>
    <div class="acts">
      <button class="mini" id="edEnh">强化 ${fmt(ENGINE.enhanceCost(it))}💎</button>
      <button class="mini" id="edTem">淬灵 ${fmt(ENGINE.temperCost(it))}💎</button>
      <button class="mini" id="edDev">炼化</button>
      <button class="mini" id="edOff">卸下</button>
    </div>`;
  const e1 = $('#edEnh'); if (e1) e1.onclick = () => { const r = ENGINE.enhance(p, it); toast(r.msg, r.ok ? 'ok' : 'err'); renderEquip(p); renderHUD(p); renderMini(p); save(); };
  const e2 = $('#edTem'); if (e2) e2.onclick = () => { const r = ENGINE.temper(p, it); toast(r.msg, r.ok ? 'ok' : 'err'); renderEquip(p); renderHUD(p); renderMini(p); save(); };
  const e3 = $('#edDev'); if (e3) e3.onclick = () => { DEVOUR_TARGET = EQ_SEL; renderDevour(p); };
  const e4 = $('#edOff'); if (e4) e4.onclick = () => {
    if (!p.equip[EQ_SEL]) return;
    ENGINE.addItem(p, p.equip[EQ_SEL]); p.equip[EQ_SEL] = null;
    toast('已卸下'); renderEquip(p); renderBag(p); renderMini(p); save();
  };
}

function renderDevour(p) {
  const box = $('#bagDetail'); if (!box) return;
  const it = p.equip[DEVOUR_TARGET];
  if (!it) { DEVOUR_TARGET = null; return; }
  const foods = p.bag.filter((x) => x.id !== it.id).slice(0, 18);
  box.innerHTML = `<h3>炼化【${it.name}】</h3>
    <div class="small">选择一件材料喂给它（有几率提升强化等级）：</div>
    <div class="row mt8" style="flex-wrap:wrap">${foods.length ? foods.map((f) => `<button class="mini" data-dvf="${f.id}">${itemIcon(f)}${f.name}</button>`).join('') : '<span class="small">无可炼化物品</span>'}</div>
    <button class="ghost mt8" id="dvCancel">取消</button>`;
  $$('#bagDetail [data-dvf]').forEach((b) => b.onclick = () => {
    const r = ENGINE.devour(p, it, b.dataset.dvf);
    toast(r.msg, r.ok ? 'ok' : 'err'); renderEquip(p); renderBag(p); renderHUD(p); renderMini(p); save();
  });
  const cc = $('#dvCancel'); if (cc) cc.onclick = () => { DEVOUR_TARGET = null; renderBag(p); };
}

/* ---------- 背包网格 + 详情 ---------- */
function renderBag(p) {
  const box = $('#bagList'); if (!box) return;
  const cnt = $('#bagCount'); if (cnt) cnt.textContent = `（${p.bag.length}/80）`;
  const list = p.bag.filter((x) => BAG_FILTER === 'all' || x.kind === BAG_FILTER);
  box.innerHTML = list.length ? list.map((it) => {
    const q = it.kind === 'equip' ? (it.q || 0) : 0;
    return `<div class="bslot q${q} ${BAG_SEL === it.id ? 'sel' : ''}" data-bid="${it.id}" title="${it.name}">
      ${itemIcon(it)}
      ${it.count ? `<span class="cnt">${it.count}</span>` : ''}
      ${it.level ? `<span class="lv">+${it.level}</span>` : ''}
    </div>`;
  }).join('') : '<div class="small" style="grid-column:1/-1">空空如也</div>';
  $$('#bagList [data-bid]').forEach((el) => el.onclick = () => { BAG_SEL = el.dataset.bid; renderBag(p); renderBagDetail(p); });
  renderBagDetail(p);
}
function renderBagDetail(p) {
  if (DEVOUR_TARGET) return;
  const box = $('#bagDetail'); if (!box) return;
  const it = p.bag.find((x) => x.id === BAG_SEL);
  if (!it) { box.innerHTML = '<div class="small">点击物品查看详情</div>'; return; }
  const cfg = C();
  let sub = it.desc || '';
  let stats = '';
  if (it.kind === 'equip') {
    const q = cfg.qualities[it.q];
    const m = q.mul * (1 + (it.level || 0) * cfg.enhance.attrPerLevel) * (1 + (it.temper || 0) * cfg.temper.attrPerLevel);
    sub = `${q.name} · ${slotDef(it.slot).name} · 强化+${it.level || 0} 淬灵${it.temper || 0}`;
    stats = `<div class="stats">${[['攻击', Math.round((it.atk || 0) * m)], ['防御', Math.round((it.def || 0) * m)], ['气血', Math.round((it.hp || 0) * m)], ['灵力', Math.round((it.mp || 0) * m)]]
      .map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  }
  const acts = [];
  if (it.kind === 'equip') acts.push('<button class="mini" id="bdEq">装备</button>', '<button class="mini" id="bdMk">寄售</button>');
  if (it.kind === 'pill') acts.push('<button class="mini" id="bdUse">服用</button>');
  if (it.kind === 'talisman') acts.push('<button class="mini" id="bdUse">激活</button>');
  acts.push(`<button class="mini" id="bdSell">出售 ${fmt(sellPrice(it))}💎</button>`);
  box.innerHTML = `<div class="hd"><div class="big bslot q${it.kind === 'equip' ? it.q : 0}" style="cursor:default">${itemIcon(it)}${it.count ? `<span class="cnt">${it.count}</span>` : ''}</div>
    <div><div class="nm">${it.name}${it.count ? ' ×' + it.count : ''}</div><div class="sub">${sub}</div></div></div>
    ${stats}<div class="acts">${acts.join('')}</div>`;
  const e1 = $('#bdEq'); if (e1) e1.onclick = () => { ENGINE.equipItem(p, it); toast('已装备 ' + it.name); BAG_SEL = null; renderEquip(p); renderBag(p); renderHUD(p); renderMini(p); save(); };
  const e2 = $('#bdUse'); if (e2) e2.onclick = () => {
    const r = it.kind === 'pill' ? ENGINE.usePill(p, it) : SYS.useTalisman(p, it.ref || it.id);
    toast(r.msg, r.ok ? 'ok' : 'err'); BAG_SEL = null; renderBag(p); renderHUD(p); renderMini(p); save();
  };
  const e3 = $('#bdSell'); if (e3) e3.onclick = () => { const price = ENGINE.sellItem(p, it); toast('出售获得 ' + fmt(price) + ' 灵石'); BAG_SEL = null; renderBag(p); renderHUD(p); save(); };
  const e4 = $('#bdMk'); if (e4) e4.onclick = async () => {
    const v = prompt('挂单售价（灵石）', String(Math.max(50, Math.round((it.price || 200) * 1.2))));
    if (v === null) return;
    const r = await SYS.marketSell(p, it.id, parseInt(v, 10));
    toast(r.msg, r.ok ? 'ok' : 'err'); BAG_SEL = null; renderBag(p); renderMarket(p); save();
  };
}

/* ---------- 功法网格 ---------- */
function renderSkills(p) {
  const eq = p.equipped || [];
  const eb = $('#equippedSkills');
  if (eb) eb.innerHTML = eq.length ? eq.map((id) => {
    const sk = SYS.skillDef(id); if (!sk) return '';
    const own = SYS.ownSkill(p, id);
    return `<div class="skcell on" data-sk="${id}"><div class="si">${sk.icon}</div><div class="sn">${sk.name}</div><div class="sl">${own ? own.level : 1} 层</div></div>`;
  }).join('') : '<div class="small" style="grid-column:1/-1">尚未装备功法</div>';
  $$('#equippedSkills [data-sk]').forEach((el) => el.onclick = () => { SK_SEL = el.dataset.sk; renderSkills(p); });

  const owned = p.skills || [];
  const sb = $('#skillList');
  if (sb) sb.innerHTML = owned.length ? owned.map((o) => {
    const sk = SYS.skillDef(o.id); if (!sk) return '';
    const on = eq.includes(o.id);
    return `<div class="skcell ${on ? 'on' : ''}" data-sk2="${o.id}"><div class="si">${sk.icon}</div><div class="sn">${sk.name}</div><div class="sl">${o.level}/${sk.maxLevel}层${on ? ' ✔' : ''}</div></div>`;
  }).join('') : '<div class="small" style="grid-column:1/-1">尚未习得功法（坊市购买 / 秘境掉落）</div>';
  $$('#skillList [data-sk2]').forEach((el) => el.onclick = () => { SK_SEL = el.dataset.sk2; renderSkills(p); });
  renderSkillDetail(p);
}
function renderSkillDetail(p) {
  const box = $('#skillDetail'); if (!box) return;
  const sk = SK_SEL ? SYS.skillDef(SK_SEL) : null;
  if (!sk) { box.innerHTML = '<div class="small">点击功法查看详情</div>'; return; }
  const own = SYS.ownSkill(p, SK_SEL);
  const lv = own ? own.level : 1;
  const on = (p.equipped || []).includes(SK_SEL);
  const cost = SYS.skillUpCost(sk, lv);
  const fit = Math.round(SYS.skillFit(p, sk) * 100);
  const eff = [];
  if (sk.passive) for (const k in sk.passive) eff.push(`${({ hp: '气血', atk: '攻击', def: '防御', exp: '修炼速度', crit: '暴击', hit: '命中', anticrit: '抗暴' }[k] || k)} +${(sk.passive[k] * 100).toFixed(0)}%`);
  if (sk.active) eff.push(`伤害 ${sk.active.mult} 倍 · 耗灵力 ${sk.active.mp}${sk.active.cd ? ` · 冷却 ${sk.active.cd} 回合` : ''}`);
  box.innerHTML = `<div class="hd" style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
      <div class="big bslot q${sk.root === p.root ? 3 : 2}" style="cursor:default">${sk.icon}</div>
      <div><div class="nm">${sk.name}</div><div class="sub">${sk.type === 'heart' ? '心法' : '功法'} · ${lv}/${sk.maxLevel} 层 · 灵根适配 ${fit}%</div></div></div>
    <div class="goal small">${sk.desc}</div>
    <div class="small" style="color:var(--jade)">当前效果：${eff.join('、') || '—'}</div>
    <div class="acts" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      ${on ? '<button class="mini" id="skOff">卸下</button>' : '<button class="mini" id="skOn">装备</button>'}
      <button class="mini" id="skUp">参悟 ${fmt(cost)}💎</button>
    </div>`;
  const b1 = on ? $('#skOff') : $('#skOn');
  if (b1) b1.onclick = () => { const r = on ? SYS.unequipSkill(p, SK_SEL) : SYS.equipSkill(p, SK_SEL); toast(r.msg, r.ok ? 'ok' : 'err'); renderSkills(p); renderMini(p); save(); };
  const b2 = $('#skUp'); if (b2) b2.onclick = () => { const r = SYS.upgradeSkill(p, SK_SEL); toast(r.msg, r.ok ? 'ok' : 'err'); renderSkills(p); renderHUD(p); renderMini(p); save(); };
}

/* ---------- 剧情对话（覆盖旧实现） ---------- */
function renderStory() {
  const p = window.P; if (!p) return;
  const i = p.storyIdx || 0;
  if (!STORY[i]) {
    const c = $('#stChapter'); if (c) c.textContent = '终章已了';
    const n = $('#stName'); if (n) n.textContent = '旁白';
    const f = $('#stFace'); if (f) f.textContent = '☯️';
    const t = $('#stText'); if (t) t.innerHTML = '<div class="ln now">道途无尽，各自珍重。</div>';
    const b = $('#stBtns'); if (b) b.innerHTML = '';
    return;
  }
  if (ST_CUR !== i) { ST_CUR = i; ST_SCENE = 0; }
  const s = STORY[i];
  const sc = s.scenes[ST_SCENE];
  const c1 = $('#stChapter'); if (c1) c1.textContent = `${s.title}　（${ST_SCENE + 1}/${s.scenes.length}）`;
  const n1 = $('#stName'); if (n1) n1.textContent = sc.who;
  const fe = $('#stFaceEmoji'); const pImg = $('#stPortraitImg');
  const src = (window.ART && ART.charOf) ? ART.charOf(sc.who) : null;
  if (pImg && src) {
    pImg.src = src; pImg.style.display = 'block';
    if (fe) { fe.style.display = 'none'; fe.textContent = ''; }
  } else {
    if (pImg) { pImg.style.display = 'none'; pImg.removeAttribute('src'); }
    if (fe) { fe.style.display = ''; fe.textContent = sc.face || '🧓'; }
  }
  const t1 = $('#stText');
  if (t1) t1.innerHTML = s.scenes.map((x, k) =>
    `<div class="ln ${k === ST_SCENE ? 'now' : k < ST_SCENE ? 'old' : ''}" style="${k > ST_SCENE ? 'display:none' : ''}"><b>${x.who}</b>：${x.text}</div>`).join('');
  const last = ST_SCENE >= s.scenes.length - 1;
  const can = p.realm >= s.req;
  const b1 = $('#stBtns');
  if (b1) b1.innerHTML = (last ? '' : '<button class="act" id="stNext">继续 ▸</button>')
    + (last ? (can ? '<button class="act" id="stDone">✔ 完成本章 · 领奖</button>'
      : `<button class="ghost" disabled>需【${GAME_CONFIG.realms[s.req].name}】境</button>`) : '')
    + (STORY[i - 1] ? '<button class="ghost" id="stPrev">◂ 上一章</button>' : '');
  const nx = $('#stNext'); if (nx) nx.onclick = () => { ST_SCENE++; renderStory(); };
  const pv = $('#stPrev'); if (pv) pv.onclick = () => { ST_CUR = i - 1; ST_SCENE = (STORY[i - 1] ? STORY[i - 1].scenes.length - 1 : 0); renderStory(); };
  const dn = $('#stDone'); if (dn) dn.onclick = () => {
    const r = storyFinish(p, i);
    toast(r.msg, 'ok'); ST_CUR = -1; ST_SCENE = 0;
    if (typeof renderAll === 'function') renderAll();
    renderStory(); if (typeof save === 'function') save();
  };
}


/* ---------- 网络 / 公告 / 角色创建 ---------- */
function renderNet() {
  const on = Net.online;
  const d = $('#netDot'); if (d) d.className = 'dot ' + (on ? 'on' : 'off');
  const t = $('#netTxt'); if (t) t.textContent = on ? '云端已连接' : (Net.queueSize() ? '离线中（存档待传）' : '离线模式');
  const e = $('#setEp'); if (e) e.textContent = Net.endpoint.replace('https://', '');
  const q = $('#setQueue'); if (q) q.textContent = Net.queueSize();
}
function renderNotice() {
  const n = window.NOTICE || {};
  const box = $('#noticeTxt'); if (box) box.textContent = n.notice || '仙门公告：潜心修炼，勿生事端。';
  const box2 = $('#noticeTxt2'); if (box2) box2.textContent = n.notice || '暂无公告';
  const ev = n.events || {};
  const eb = $('#eventBox');
  if (eb) eb.innerHTML = (ev.doubleExp || ev.doubleStone)
    ? `<div class="event">🎉 ${ev.eventName || '全服活动'}：${ev.doubleExp ? '修为×' + ev.expMul : ''} ${ev.doubleStone ? '灵石×' + ev.stoneMul : ''} ${ev.eventEnd ? '（至 ' + ev.eventEnd + '）' : ''}</div>` : '';
}
/* ---------- 角色创建 ---------- */
let CR = { gender: "m", avatar: "🧙", root: "mixed", sect: null, faction: "C001", trait: "P002" };
function renderCreate() {
  const gs = GAME_CONFIG.genders || [];
  const gb = $('#crGender');
  if (gb) gb.innerHTML = gs.map((g) => `<button class="mini" data-g="${g.id}" style="${CR.gender === g.id ? 'background:rgba(255,216,138,.3)' : ''}">${g.name}</button>`).join('');
  $$('#crGender [data-g]').forEach((b) => b.onclick = () => { CR.gender = b.dataset.g; CR.avatar = (gs.find((x) => x.id === CR.gender).icons || ['🧙'])[0]; renderCreate(); });
  const icons = (gs.find((x) => x.id === CR.gender) || { icons: ['🧙'] }).icons;
  const ab = $('#crAvatar');
  if (ab) ab.innerHTML = icons.map((ic) => `<button class="mini" data-a="${ic}" style="font-size:20px;${CR.avatar === ic ? 'background:rgba(255,216,138,.3)' : ''}">${ic}</button>`).join('');
  $$('#crAvatar [data-a]').forEach((b) => b.onclick = () => { CR.avatar = b.dataset.a; renderCreate(); });
  const rt = GAME_CONFIG.roots.find((r) => r.id === CR.root) || GAME_CONFIG.roots[0];
  const rb = $('#crRoot');
  if (rb) rb.innerHTML = `<div class="item"><div class="ic">${rt.icon}</div>
    <div class="info"><div class="nm" style="color:${rt.color}">${rt.name}</div>
    <div class="sub">${rt.desc}｜修炼 ×${rt.expMul} 攻击 ×${rt.atkMul} 防御 ×${rt.defMul} 福缘 ×${rt.luck}</div></div></div>`;
  const sects = (window.GAME_SOCIAL && GAME_SOCIAL.sects) || [];
  const sb = $('#crSect');
  if (sb) sb.innerHTML = sects.map((s) => `<div class="mapc ${CR.sect === s.id ? 'on' : ''}" data-cs="${s.id}">
    <div class="ic">${s.icon}</div><div style="flex:1"><div class="nm">${s.name}</div>
    <div class="sub">${s.desc}</div></div></div>`).concat([`<div class="mapc ${CR.sect === null ? 'on' : ''}" data-cs="none">
    <div class="ic">🚶</div><div style="flex:1"><div class="nm">散修</div><div class="sub">不加入宗门，自由自在</div></div></div>`]).join('');
  $$('#crSect [data-cs]').forEach((el) => el.onclick = () => { CR.sect = el.dataset.cs === 'none' ? null : el.dataset.cs; renderCreate(); });
  if (window.FRXX && FRXX.loaded) renderCreateFaction();
  const td = $('#crTraitDesc');
  if (window.FRXX && FRXX.loaded) {
    if (td) td.innerHTML = renderTraitDesc();
    else { const box = $('#crTrait'); if (box && !$('#crTraitDesc')) box.insertAdjacentHTML('afterend', '<div id="crTraitDesc" class="small mt8"></div>'); const td2 = $('#crTraitDesc'); if (td2) td2.innerHTML = renderTraitDesc(); }
  }
}

/* ---------- 左侧精简面板 ---------- */
function renderMini(p) {
  const a = ENGINE.attrs(p);
  const am = $('#attrMini');
  if (am) am.innerHTML = [['战力', fmt(ENGINE.power(p))], ['攻', fmt(a.atk)], ['防', fmt(a.def)], ['血', fmt(a.hp)],
    ['暴', (a.crit * 100).toFixed(1) + '%'], ['悟', fmt(a.wuxing + (p.bonusWuxing || 0))], ['福', fmt(a.fuyuan)]]
    .map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
  const spots = GAME_CONFIG.cultivateSpots || [];
  const cur = spots.find((x) => x.id === p.spot) || spots[0];
  const sm = $('#spotMini');
  if (sm && cur) sm.innerHTML = `<div class="kv"><span>洞天</span><b>${cur.icon}${cur.name}</b></div>
    <div class="kv"><span>倍率</span><b>×${cur.expMul}</b></div>
    <div class="kv"><span>灵根</span><b>${ENGINE.rootInfo(p).name}</b></div>`;
}


/* ================= 凡人修仙传 · 新面板 ================= */

/* ---------- 掌天瓶 ---------- */
let BOTTLE_SEL = 1;
function renderBottle(p) {
  if (!p) return;
  if (!p.bottle) p.bottle = { liquid: 0, acc: 0, level: 1 };
  const F = window.FRXX;
  const cap = F.bottleCap(p);
  const lv = p.bottle.level || 1;
  const every = Math.max(90, 300 - lv * 18);
  const art = $('#bottleArt');
  if (art) {
    const src = (window.ART && ART.itemOf) ? ART.itemOf('掌天瓶') : null;
    if (src) { art.innerHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; }
    else art.textContent = '🏺';
  }
  const l = $('#bottleLv'); if (l) l.textContent = lv;
  const r = $('#bottleRate'); if (r) r.textContent = `产液间隔 ${every} 秒　上限 ${cap} 滴`;
  const bar = $('#bottleBar');
  if (bar) { bar.style.width = Math.min(100, (p.bottle.liquid || 0) / cap * 100) + '%';
    $('#bottleBarTxt').textContent = `${p.bottle.liquid || 0} / ${cap} 滴绿液`; }
  const hint = $('#bottleHint');
  if (hint) hint.textContent = `瓶中绿液可催熟万物：1 滴可炼化约三成本层修为，或催熟灵草 3 株。`;
  const lore = $('#bottleLore');
  if (lore) lore.innerHTML = `七玄门后山所得，木质小瓶，夜里渗出绿液。此物来历不明，却是韩立一生最大的倚仗。<br>
    <span class="small">瓶身刻有古朴纹路，隐隐与木灵根相合……</span>`;
  const b1 = $('#btnLiqExp'); if (b1) b1.onclick = () => {
    const r2 = F.useLiquidExp(p, 1); UI.toast(r2.msg, r2.ok ? 'ok' : 'err');
    renderBottle(p); renderHUD(p); renderMini(p); save();
  };
  const b2 = $('#btnLiqHerb'); if (b2) b2.onclick = () => {
    const r2 = F.useLiquidHerb(p, 1); UI.toast(r2.msg, r2.ok ? 'ok' : 'err');
    renderBottle(p); save();
  };
  const b3 = $('#btnLiqUp'); if (b3) b3.onclick = () => {
    const r2 = F.upgradeBottle(p); UI.toast(r2.msg, r2.ok ? 'ok' : 'err');
    renderBottle(p); renderHUD(p); save();
  };
}

/* ---------- 仙缘伙伴 ---------- */
let PARTNER_SEL = null;
function renderPartners(p) {
  if (!p) return;
  const F = window.FRXX;
  const list = F.companionState(p);
  const partners = list.filter((c) => c.id.startsWith('P0'));
  const pets = list.filter((c) => !c.id.startsWith('P0'));
  const cnt = $('#partnerCount');
  if (cnt) cnt.textContent = `（${partners.filter((c) => c.unlocked).length}/${partners.length} 结缘）`;

  const card = (c) => {
    const qc = c.q.includes('仙') ? 4 : c.q.includes('极') ? 3 : c.q.includes('上') ? 2 : c.q.includes('中') ? 1 : 0;
    return `<div class="compitem ${PARTNER_SEL === c.id ? 'on' : ''} ${c.unlocked ? '' : 'lock'}" data-cid="${c.id}">
      <div class="cface q${qc}">${(function(){ const emo = c.unlocked ? (c.type.includes('灵虫') ? '🐛' : c.type.includes('灵兽') ? '🐾' : c.type.includes('反派') ? '😈' : '🌸') : '🔒'; const u = (window.ART && c.unlocked) ? (ART.faceOf(c.name) || ART.charOf(c.name)) : null; return u ? '<img src="'+u+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.outerHTML=\'' + emo + '\'">' : emo; })()}</div>
      <div class="cinfo"><div class="cnm">${c.name}${c.active ? ' <span style="color:var(--jade)">出战</span>' : ''}</div>
      <div class="csub">${c.q} · ${c.type}${c.unlocked ? ` · 好感 ${c.favor}` : ' · 未结缘'}</div>
      <div class="bar" style="height:9px;margin-top:3px"><i style="width:${c.favor}%"></i><span style="font-size:9px">${c.bonus.desc}</span></div></div>
    </div>`;
  };
  const pb = $('#partnerList'); if (pb) pb.innerHTML = partners.map(card).join('');
  const tb = $('#petList'); if (tb) tb.innerHTML = pets.map(card).join('');
  $$('[data-cid]').forEach((el) => el.onclick = () => { PARTNER_SEL = el.dataset.cid; renderPartners(p); });
  renderPartnerDetail(p);
}
function renderPartnerDetail(p) {
  const box = $('#partnerDetail'); if (!box) return;
  const F = window.FRXX;
  const c = PARTNER_SEL ? F.companion(PARTNER_SEL) : null;
  if (!c) { box.innerHTML = '<div class="small">点选一位查看详情</div>'; return; }
  const st = F.companionState(p).find((x) => x.id === c.id) || { favor: 0, active: false, unlocked: false, bonus: { lv: 0, desc: '—' } };
  box.innerHTML = `<div class="hd" style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
      <div class="big bslot q${c.q.includes('仙') ? 4 : 3}" style="cursor:default">${c.type.includes('灵虫') ? '🐛' : c.type.includes('灵兽') ? '🐾' : c.type.includes('反派') ? '😈' : '🌸'}</div>
      <div><div class="nm">${c.name} <span class="small">${c.q}</span></div>
      <div class="sub">${c.type} · 好感 ${st.favor || 0}/100 · ${st.bonus ? st.bonus.desc : '—'}</div></div></div>
    <div class="goal small">${c.attr || ''}</div>
    <div class="small" style="color:var(--gold)">技能：${c.skill || '—'}</div>
    <div class="small" style="color:var(--jade)">好感奖励：${c.favor || '—'}</div>
    <div class="small">来历：${c.src || '—'}</div>
    ${c.evo ? `<div class="small">进阶：${c.evo}</div>` : ''}
    <div class="acts" style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap">
      ${st.unlocked ? `<button class="mini" id="ptAct">${st.active ? '撤回' : '出战'}</button>
        <button class="mini" id="ptGift">🎁 赠礼（好感+5，200灵石）</button>` : '<button class="ghost" disabled>尚未结缘</button>'}
    </div>`;
  const a = $('#ptAct'); if (a) a.onclick = () => {
    const r = FRXX.toggleCompanion(p, c.id); UI.toast(r.msg, r.ok ? 'ok' : 'err'); renderPartners(p); renderMini(p); save();
  };
  const g = $('#ptGift'); if (g) g.onclick = () => {
    if ((p.stone || 0) < 200) return UI.toast('灵石不足', 'err');
    p.stone -= 200;
    const r = FRXX.gainFavor(p, c.id, 5); UI.toast(r.msg, 'ok'); renderPartners(p); renderHUD(p); save();
  };
}

/* ---------- 图鉴 ---------- */
function renderCodex(p) {
  if (!p) return;
  const F = window.FRXX;
  const list = F.codex(p);
  const box = $('#codexList');
  if (box) box.innerHTML = list.map((c) => {
    const pct = c.max ? Math.round(c.now / c.max * 100) : 0;
    const items = (c.list || []).slice(0, 60);
    return `<div class="item" style="margin-bottom:7px;cursor:pointer" data-cdx="${c.id}">
      <div class="ic">${c.icon}</div>
      <div class="info"><div class="nm">${c.name}</div>
      <div class="sub">收录 ${c.now}/${c.max}　<span class="q1">${pct}%</span></div>
      <div class="bar" style="height:9px;margin-top:3px"><i style="width:${pct}%"></i><span style="font-size:9px">${pct}%</span></div></div>
      <button class="mini">查看</button></div>
      <div class="cdxgrid" id="cdx_${c.id}" style="display:none">${items.map((x) =>
        `<span class="cdxitem ${x.got ? 'got' : ''}" title="${x.n}">${x.got ? x.n : '？？？'}</span>`).join('')}</div>`;
  }).join('');
  $$('#codexList [data-cdx]').forEach((el) => el.onclick = () => {
    const g = $('#cdx_' + el.dataset.cdx);
    if (g) g.style.display = g.style.display === 'none' ? 'block' : 'none';
  });
  const mb = $('#codexMaps');
  const maps = (F.data && F.data.maps) || [];
  if (mb) mb.innerHTML = maps.map((m) => {
    const seen = (p.realm || 0) >= m.minRealm;
    return `<div class="mapc ${seen ? '' : 'lock'}"><div class="ic">${m.icon}</div>
      <div style="flex:1"><div class="nm">${m.name} ${seen ? '' : '（未至）'}</div>
      <div class="sub">${m.zone || m.desc}　${m.npc ? '｜' + m.npc.slice(0, 16) : ''}</div></div></div>`;
  }).join('');
}

/* ---------- 创建角色：派系 / 性情 ---------- */
function renderCreateFaction() {
  const F = window.FRXX;
  const fs = F.factions();
  const fb = $('#crFaction');
  if (fb) fb.innerHTML = fs.map((f) => `<div class="mapc ${CR.faction === f.id ? 'on' : ''}" data-cf="${f.id}">
      <div class="ic">${f.id === 'C001' ? '🗡️' : f.id === 'C002' ? '💪' : f.id === 'C003' ? '❄️' : '💀'}</div>
      <div style="flex:1"><div class="nm">${f.name}　<span class="small">${f.role}</span></div>
      <div class="sub">${f.desc}</div></div></div>`).join('');
  $$('#crFaction [data-cf]').forEach((el) => el.onclick = () => { CR.faction = el.dataset.cf; renderCreate(); });
  const ts = F.traits();
  const tb = $('#crTrait');
  if (tb) tb.innerHTML = ts.map((t) => `<button class="mini" data-ct="${t.id}" style="${CR.trait === t.id ? 'background:rgba(255,216,138,.3)' : ''}">${t.name}</button>`).join('');
  $$('#crTrait [data-ct]').forEach((b) => b.onclick = () => { CR.trait = b.dataset.ct; renderCreate(); });
}
function renderTraitDesc() {
  const F = window.FRXX;
  const t = F.trait(CR.trait);
  return t ? `<div class="small" style="color:var(--jade)">${t.name}：${t.desc}</div>` : '';
}

function setScene(mapName) {
  const el = document.getElementById('sceneImg');
  if (!el || !window.ART) return;
  const src = ART.sceneOf(mapName);
  if (el.getAttribute('src') === src) return;
  el.src = src; el.style.display = 'block';
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  // 切曲
  if (window.AUDIO_SCENE && window.AUDIO) {
    AUDIO.play(AUDIO_SCENE.trackFor(UI.CUR_WIN || CUR_WIN, mapName));
  }
}


/* ================= 玩法扩展面板 ================= */
const fmtN = (n) => {
  n = Math.round(n || 0);
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return String(n);
};

/* ---------- 活动 ---------- */
function renderActs(p) {
  if (!p) return;
  if (!window.ACTSYS) return;
  ACTSYS.init(p); WALLET.init(p);
  const A = ACTSYS;

  // 签到
  const sb = $('#signBox');
  if (sb) {
    const can = A.canSign(p);
    const streak = p.act.sign.streak || 0;
    const list = (GAME_SOCIAL.signRewards) || [];
    sb.innerHTML = `<div class="small">已连续签到 <b style="color:var(--gold)">${streak}</b> 天　累计 ${p.act.sign.days || 0} 天</div>
      <div class="row mt8" style="flex-wrap:wrap">
        ${list.map((r, i) => `<div class="bslot ${((streak % 7) === i && !can) ? 'sel' : ''}" style="width:52px;height:52px;font-size:18px" title="${A.grant(p, {}), ''}">
          <span>${i + 1}</span></div>`).join('')}
      </div>
      <button class="act mt8" id="btnSign" ${can ? '' : 'disabled'}>${can ? '📅 今日签到' : '✔ 今日已签'}</button>
      <div class="small mt8">连续 7 天额外奖励元宝×5</div>`;
    const b = $('#btnSign');
    if (b && can) b.onclick = () => { const r = A.sign(p); toast(r.msg, r.ok ? 'ok' : 'err'); renderActs(p); renderHUD(p); save(); };
  }
  // 七日修行
  const seven = $('#sevenBox');
  if (seven) seven.innerHTML = A.sevenList().map((x) => {
    const done = !!p.act.seven[x.id];
    return `<div class="item" style="margin-bottom:6px"><div class="ic">${done ? '✔️' : '🗓️'}</div>
      <div class="info"><div class="nm">第 ${x.day} 天：${x.name}</div>
      <div class="sub">灵石${fmtN(x.reward.stone)}·修为${fmtN(x.reward.exp)}${x.reward.yuanbao ? '·元宝' + x.reward.yuanbao : ''}</div></div>
      <button class="mini" data-s7="${x.id}" ${done ? 'disabled' : ''}>${done ? '已领' : '领取'}</button></div>`;
  }).join('');
  $$('#sevenBox [data-s7]').forEach((b) => b.onclick = () => {
    const r = A.sevenDone(p, b.dataset.s7); toast(r.msg, r.ok ? 'ok' : 'err'); renderActs(p); renderHUD(p); save();
  });
  // 成长之路
  const gb = $('#growthBox');
  if (gb) {
    const list = A.growthCheck(p);
    gb.innerHTML = list.map((g) => `<div class="item" style="margin-bottom:6px">
      <div class="ic">${g.claimed ? '🎁' : g.ok ? '✨' : '🔒'}</div>
      <div class="info"><div class="nm">${g.name}</div><div class="sub">${g.need}${g.ok ? '·已达成' : '·未达成'}</div></div>
      <button class="mini" data-gr="${g.id}" ${(!g.ok || g.claimed) ? 'disabled' : ''}>${g.claimed ? '已领' : '领取'}</button></div>`).join('');
    $$('#growthBox [data-gr]').forEach((b) => b.onclick = () => {
      const r = A.growthClaim(p, b.dataset.gr); toast(r.msg, r.ok ? 'ok' : 'err'); renderActs(p); renderHUD(p); save();
    });
  }
  // 在线奖励
  const ob = $('#onlineBox');
  if (ob) {
    const min = A.onlineMin(p);
    ob.innerHTML = `<div class="small">本次在线 <b style="color:var(--gold)">${min}</b> 分钟</div>` +
      A.onlineList().map((x) => {
        const can = min >= x.min && p.act.online.claimed < x.min;
        const got = p.act.online.claimed >= x.min;
        return `<div class="item" style="margin-bottom:6px"><div class="ic">${got ? '✔️' : can ? '⏱️' : '🔒'}</div>
          <div class="info"><div class="nm">在线 ${x.min} 分钟</div>
          <div class="sub">灵石${fmtN(x.stone || 0)}·修为${fmtN(x.exp || 0)}${x.yuanbao ? '·元宝' + x.yuanbao : ''}</div></div>
          <button class="mini" data-on="${x.min}" ${(!can) ? 'disabled' : ''}>${got ? '已领' : '领取'}</button></div>`;
      }).join('');
    $$('#onlineBox [data-on]').forEach((b) => b.onclick = () => {
      const r = A.onlineClaim(p, +b.dataset.on); toast(r.msg, r.ok ? 'ok' : 'err'); renderActs(p); renderHUD(p); save();
    });
  }
  // 等级礼包
  const lg = $('#levelGiftBox');
  if (lg) lg.innerHTML = A.giftList().map((g) => {
    const nm = window.FRXX ? FRXX.realm(g.realm).name : '境' + g.realm;
    const ok = p.realm >= g.realm, bought = !!p.act.gifts[g.id];
    return `<div class="item" style="margin-bottom:6px"><div class="ic">🎁</div>
      <div class="info"><div class="nm">${nm} 礼包</div>
      <div class="sub">灵石${fmtN(g.reward.stone)}·修为${fmtN(g.reward.exp)}·元宝${g.reward.yuanbao}</div></div>
      <button class="mini" data-gf="${g.id}" ${(!ok || bought) ? 'disabled' : ''}>${bought ? '已购' : fmtN(g.price) + '💎'}</button></div>`;
  }).join('');
  $$('#levelGiftBox [data-gf]').forEach((b) => b.onclick = () => {
    const r = A.giftBuy(p, b.dataset.gf); toast(r.msg, r.ok ? 'ok' : 'err'); renderActs(p); renderHUD(p); save();
  });
  // 限时活动一览
  const la = $('#limitActs');
  if (la) la.innerHTML = (A.all() || []).map((a) => `<div class="item" style="margin-bottom:6px">
    <div class="ic">${a.icon}</div><div class="info"><div class="nm">${a.name}
    <span class="sub">${a.type}</span></div><div class="sub">${a.content}</div>
    <div class="sub" style="color:var(--jade)">${a.reward}</div></div></div>`).join('');
}

/* ---------- 称号 ---------- */
function renderTitles(p) {
  if (!p || !window.TITLE) return;
  const list = TITLE.check(p);
  const box = $('#titleList');
  const got = list.filter((x) => x.owned).length;
  const c = $('#titleCount'); if (c) c.textContent = `（${got}/${list.length}）`;
  if (box) box.innerHTML = list.map((t) => {
    const on = p.titles.cur === t.id;
    return `<div class="compitem ${on ? 'on' : ''} ${t.owned ? '' : 'lock'}" data-tid="${t.id}">
      <div class="cface">${t.icon}</div>
      <div class="cinfo"><div class="cnm">${t.name} ${on ? '<span style="color:var(--jade)">佩戴中</span>' : ''}</div>
      <div class="csub">${t.desc}　${t.owned ? '' : '（' + t.need + '）'}</div>
      <div class="csub" style="color:var(--gold)">${Object.entries(t.buff || {}).map(([k, v]) => ({ atk: '攻', hp: '气血', exp: '修为', stone: '灵石' }[k] || k) + '+' + Math.round(v * 100) + '%').join(' ') || '无加成'}</div>
    </div></div>`;
  }).join('');
  $$('#titleList [data-tid]').forEach((el) => el.onclick = () => {
    const r = TITLE.wear(p, el.dataset.tid); toast(r.msg, r.ok ? 'ok' : 'err'); renderTitles(p); renderMini(p); save();
  });
  const cur = $('#titleCur');
  if (cur) {
    const n = TITLE.curName(p);
    cur.innerHTML = n ? `<div class="nm" style="color:var(--gold)">${n}</div>` : '<div class="small">未佩戴称号</div>';
  }
}

/* ---------- 宗门扩展 ---------- */
function renderSectEx(p) {
  if (!p || !window.SECTEX) return;
  // 仓库
  const wh = SECTEX.warehouse(p);
  const wc = $('#whCount'); if (wc) wc.textContent = `（${wh.items.length}/60）`;
  const wt = $('#whTip');
  if (wt) wt.textContent = p.sectInfo ? '存入后宗门成员可按权限取用' : '加入宗门后可使用';
  const wl = $('#whList');
  if (wl) wl.innerHTML = wh.items.length ? wh.items.slice(0, 24).map((it, i) =>
    `<div class="item"><div class="ic">${it.kind === 'herb' ? '🌿' : it.kind === 'ore' ? '⛏️' : '📦'}</div>
      <div class="info"><div class="nm">${it.id} ×${it.count}</div><div class="sub">${it.by} 存入</div></div>
      <button class="mini" data-wht="${i}">取出</button></div>`).join('') : '<div class="small">仓库为空</div>';
  $$('#whList [data-wht]').forEach((b) => b.onclick = () => {
    const r = SECTEX.whTake(p, +b.dataset.wht); toast(r.msg, r.ok ? 'ok' : 'err'); renderSectEx(p); renderBag(p); save();
  });
  const d1 = $('#btnWhDeposit');
  if (d1) d1.onclick = () => {
    const n = Math.min(5, p.mats && p.mats.herb ? p.mats.herb : 0);
    if (!n) return toast('没有可存入的灵草', 'err');
    p.mats.herb -= n;
    const r = SECTEX.whDeposit(p, 'herb', 'herb_green', n);
    toast(r.msg, r.ok ? 'ok' : 'err'); renderSectEx(p); save();
  };
  // BOSS
  const bl = $('#sectBossList');
  if (bl) bl.innerHTML = SECTEX.bossList().map((b) =>
    `<div class="item" style="margin-bottom:7px"><div class="ic">${b.icon}</div>
      <div class="info"><div class="nm">${b.name}</div>
      <div class="sub">气血${fmtN(b.hp)} 攻${fmtN(b.atk)}｜${b.cost} 灵石开启</div>
      <div class="sub" style="color:var(--jade)">贡献${b.reward.contrib}·灵石${fmtN(b.reward.stone)}</div></div>
      <button class="mini" data-sb="${b.id}">讨伐</button></div>`).join('');
  $$('#sectBossList [data-sb]').forEach((b) => b.onclick = () => {
    const r = SECTEX.fightBoss(p, b.dataset.sb);
    toast(r.msg, r.ok ? 'ok' : 'err'); renderSectEx(p); renderHUD(p); save();
  });
  // 联盟
  const ab = $('#allyBox');
  if (ab) {
    const a = SECTEX.ally(p);
    ab.innerHTML = a ? `<div class="nm" style="color:var(--gold)">${a.name}</div>
      <div class="small">盟主：${a.leader}　成员宗门 ${a.sects.length}</div>`
      : '<div class="small">尚未创建或加入联盟。联盟可共探玄荒古域、交换镇物。</div>';
  }
  const ca = $('#btnCreateAlly');
  if (ca) ca.onclick = () => {
    const n = (prompt('联盟名称', '') || '').trim();
    if (!n) return;
    const r = SECTEX.createAlly(p, n); toast(r.msg, r.ok ? 'ok' : 'err'); renderSectEx(p); renderHUD(p); save();
  };
}


/* ---------- 时装 / 外观 ---------- */
function renderSkins(p) {
  if (!p || !window.SKIN) return;
  const list = SKIN.check(p);
  const put = (id, type) => {
    const box = $(id); if (!box) return;
    const arr = list.filter((x) => x.type === type);
    box.innerHTML = arr.map((sk) => {
      const on = p.skin.wear[type] === sk.id;
      const cost = 500 * Math.pow(3, Math.floor(sk.realm / 4));
      const clsOk = sk.cls === '通用' || sk.cls === (p.faction || '') || !(p.faction);
      return `<div class="compitem ${on ? 'on' : ''} ${sk.owned ? '' : 'lock'}" data-sk="${sk.id}">
        <div class="cface">${(function(){ const u=(window.ART)?ART.skillOf(sk.name):null; return u? '<img src="'+u+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.outerHTML=\'' + sk.icon + '\'">' : sk.icon; })()}</div>
        <div class="cinfo"><div class="cnm">${sk.name} ${on ? '<span style="color:var(--jade)">穿戴中</span>' : ''}</div>
        <div class="csub">${sk.cls}｜${sk.desc}</div>
        <div class="csub" style="color:var(--gold)">${Object.entries(sk.buff || {}).map(([k, v]) =>
          ({ atk: '攻', def: '防', hp: '气血', mp: '灵力', speed: '身法', dodge: '闪避', exp: '修为' }[k] || k) + '+' + Math.round(v * 100) + '%').join(' ')}</div>
        ${sk.owned ? '' : `<div class="csub">${clsOk ? (sk.realmOk ? '💎 ' + fmtN(cost) + ' 解锁' : '需境界不足') : '职业不符'}</div>`}
        </div></div>`;
    }).join('');
    box.querySelectorAll('[data-sk]').forEach((el) => el.onclick = () => {
      const id2 = el.dataset.sk;
      const owned = (p.skin.owned || []).indexOf(id2) >= 0;
      let r;
      if (!owned) {
        if (!SKIN.check(p).find((x) => x.id === id2).realmOk) { r = { ok: false, msg: '境界不足' }; }
        else r = SKIN.unlock(p, id2);
      } else r = SKIN.wear(p, id2);
      toast(r.msg, r.ok ? 'ok' : 'err'); renderSkins(p); renderMini(p); renderAttrs(p); save();
    });
  };
  put('#skinShizhuang', '时装'); put('#skinWing', '翅膀');
  put('#skinMount', '坐骑'); put('#skinAura', '环身特效');

  const w = $('#skinWearing');
  if (w) w.innerHTML = SKIN.wearing(p).map((x) =>
    `<div class="item"><div class="ic">${x.icon}</div><div class="info">
      <div class="nm">${x.type}</div><div class="sub">${x.name}</div></div></div>`).join('');
  const b = $('#skinBuff');
  if (b) {
    const bf = SKIN.buff(p);
    b.innerHTML = Object.keys(bf).length
      ? Object.entries(bf).map(([k, v]) => `<div class="kv"><span>{{atk:'攻击',def:'防御',hp:'气血',mp:'灵力',speed:'身法',dodge:'闪避',exp:'修为'}[k]||k}</span><b>+${Math.round(v * 100)}%</b></div>`).join('').replace('{{', '{').replace('}}', '}').replace(/'/g, "'")
      : '<div class="small">未穿戴任何外观</div>';
    // 简单重渲染避免模板问题
    b.innerHTML = Object.entries(bf).map(([k, v]) => {
      const nm = { atk: '攻击', def: '防御', hp: '气血', mp: '灵力', speed: '身法', dodge: '闪避', exp: '修为' }[k] || k;
      return `<div class="kv"><span>${nm}</span><b>+${Math.round(v * 100)}%</b></div>`;
    }).join('') || '<div class="small">未穿戴任何外观</div>';
  }
}

/* ---------- 灵虫 ---------- */
function renderWorms(p) {
  if (!p || !window.WORM) return;
  WORM.init(p);
  const box = $('#wormList');
  if (box) box.innerHTML = WORM.list().map((w) => {
    const n = WORM.count(p, w.id);
    const on = p.worm.cur === w.id;
    const canEvo = w.evolve && n >= (w.needCount || 30);
    return `<div class="compitem ${on ? 'on' : ''} ${n ? '' : 'lock'}" data-wm="${w.id}">
      <div class="cface">${w.icon}</div>
      <div class="cinfo"><div class="cnm">${w.name} ${n ? '×' + n : ''} ${on ? '<span style="color:var(--jade)">出战中</span>' : ''}</div>
      <div class="csub">${w.q}｜${w.skill}｜${w.desc}</div>
      <div class="csub" style="color:var(--gold)">${Object.entries(w.buff || {}).map(([k, v]) => ({ atk: '攻', mp: '灵力', speed: '身法' }[k] || k) + '+' + Math.round(v * 100) + '%').join(' ')}（数量越多越强）</div>
      </div></div>
      <div style="display:flex;gap:6px;margin:-4px 0 8px">
        <button class="mini" data-wmg="${w.id}">获得一只</button>
        <button class="mini" data-wms="${w.id}" ${n ? '' : 'disabled'}>${on ? '收回' : '出战'}</button>
        ${w.evolve ? `<button class="mini" data-wme="${w.id}" ${canEvo ? '' : 'disabled'}>进化(需${w.needCount})</button>` : ''}
      </div>`;
  }).join('');
  const q = (sel, fn) => $$('#wormList ' + sel).forEach((b) => b.onclick = () => { const r = fn(b); toast(r.msg, r.ok ? 'ok' : 'err'); renderWorms(p); renderMini(p); save(); });
  q('[data-wmg]', (b) => WORM.gain(p, b.dataset.wmg, 1));
  q('[data-wms]', (b) => WORM.set(p, b.dataset.wms));
  q('[data-wme]', (b) => WORM.evolve(p, b.dataset.wme));
  const c = $('#wormCur');
  if (c) {
    const id = p.worm.cur;
    const w = id ? WORM.list().find((x) => x.id === id) : null;
    const bf = WORM.buff(p);
    c.innerHTML = w ? `<div class="nm">${w.icon} ${w.name} ×${WORM.count(p, id)}</div>
      <div class="small">${Object.entries(bf).map(([k, v]) => ({ atk: '攻', mp: '灵力', speed: '身法' }[k] || k) + '+' + Math.round(v * 100) + '%').join(' ')}</div>`
      : '<div class="small">未出战灵虫</div>';
  }
}

/* ---------- 好友 / 组队 / 私聊 ---------- */
function renderSocialX(p) {
  if (!p || !window.SOCIALX) return;
  SOCIALX.init(p);
  // 好友
  const c = $('#friendCount'); if (c) c.textContent = `（${p.social.friends.length}/50）`;
  const fl = $('#friendList');
  if (fl) fl.innerHTML = p.social.friends.length ? p.social.friends.map((f) =>
    `<div class="item"><div class="ic">🙂</div><div class="info">
      <div class="nm">${f.name}</div><div class="sub">${f.uid}</div></div>
      <button class="mini" data-fd="${f.uid}">删除</button></div>`).join('') : '<div class="small">暂无好友，添加道友可获得攻击加成</div>';
  $$('#friendList [data-fd]').forEach((b) => b.onclick = () => {
    const r = SOCIALX.delFriend(p, b.dataset.fd); toast(r.msg); renderSocialX(p); renderAttrs(p); save();
  });
  const af = $('#btnAddFriend');
  if (af) af.onclick = () => {
    const uid = ($('#friendUid').value || '').trim();
    if (!uid) return toast('请输入道号', 'err');
    const r = SOCIALX.addFriend(p, uid, uid); toast(r.msg, r.ok ? 'ok' : 'err'); renderSocialX(p); renderAttrs(p); save();
  };
  // 组队
  const tb = $('#teamBox');
  if (tb) {
    const t = p.social.team;
    tb.innerHTML = t ? `<div class="nm">队伍（队长 ${t.lead}） ${t.members.length}/5 人</div>` +
      t.members.map((m) => `<div class="item"><div class="ic">🧑‍🤝‍🧑</div><div class="info">
        <div class="nm">${m.name}</div><div class="sub">战力 ${fmt(m.power || 0)}</div></div></div>`).join('')
      : '<div class="small">尚未组队，组队可获得攻防加成</div>';
  }
  const ct = $('#btnCreateTeam'); if (ct) ct.onclick = () => { const r = SOCIALX.createTeam(p); toast(r.msg); renderSocialX(p); renderAttrs(p); save(); };
  const iv = $('#btnInviteMate'); if (iv) iv.onclick = () => {
    const n = (prompt('邀请的道友名', '散修道友') || '').trim();
    if (!n) return;
    const r = SOCIALX.joinTeam(p, n, Math.round(((window.ENGINE && ENGINE.power(p)) || 100) * (0.3 + Math.random() * 0.5)));
    toast(r.msg, r.ok ? 'ok' : 'err'); renderSocialX(p); renderAttrs(p); save();
  };
  const lv = $('#btnLeaveTeam'); if (lv) lv.onclick = () => { p.social.team = null; toast('已解散队伍'); renderSocialX(p); renderAttrs(p); save(); };
  // 私聊
  const dm = $('#dmBox');
  if (dm) dm.innerHTML = (p.social.dm || []).slice(-20).reverse().map((m) =>
    `<p><b>${m.from}</b> → ${m.to}：${m.text}</p>`).join('') || '<p class="sys">暂无消息</p>';
  const sd = $('#btnSendDM');
  if (sd) sd.onclick = () => {
    const to = ($('#dmTo').value || '').trim(), tx = ($('#dmText').value || '').trim();
    if (!to || !tx) return toast('请填写对方与内容', 'err');
    const r = SOCIALX.sendDM(p, to, tx); toast(r.msg); $('#dmText').value = ''; renderSocialX(p); save();
  };
}

/* ---------- 拍卖行 ---------- */
function renderAuction(p) {
  if (!p || !window.AUCTION) return;
  const sel = $('#aucItem');
  if (sel) {
    const eqs = (p.bag || []).filter((x) => x.kind === 'equip' || x.fr);
    sel.innerHTML = eqs.length ? eqs.map((x, i) =>
      `<option value="${i}">${x.icon} ${x.name}${x.enh ? ' +' + x.enh : ''}</option>`).join('')
      : '<option value="">（背包无可上架物品）</option>';
  }
  const bs = $('#btnAucSell');
  if (bs) bs.onclick = () => {
    const i = parseInt(($('#aucItem') || {}).value, 10);
    const price = parseInt(($('#aucPrice') || {}).value || '0', 10);
    const eqs = (p.bag || []).filter((x) => x.kind === 'equip' || x.fr);
    if (isNaN(i) || !eqs[i]) return toast('请选择物品', 'err');
    const r = AUCTION.sell(p, eqs[i], price);
    toast(r.msg, r.ok ? 'ok' : 'err'); renderAuction(p); renderBag(p); renderHUD(p); save();
  };
  const box = $('#aucList');
  if (box) {
    const list = AUCTION.board(p);
    box.innerHTML = list.length ? list.map((e, i) =>
      `<div class="item"><div class="ic">${(e.item || {}).icon || '📦'}</div>
        <div class="info"><div class="nm">${(e.item || {}).name}</div>
        <div class="sub">${fmt(e.price)} 灵石${e.sys ? '（系统寄售）' : '（我的挂单）'}</div></div>
        ${e.sys ? `<button class="mini" data-aub="${i}">购买</button>` : '<span class="small">挂单中</span>'}</div>`).join('')
      : '<div class="small">暂无拍品</div>';
    $$('#aucList [data-aub]').forEach((b) => b.onclick = () => {
      const r = AUCTION.buy(p, list[+b.dataset.aub]);
      toast(r.msg, r.ok ? 'ok' : 'err'); renderAuction(p); renderBag(p); renderHUD(p); save();
    });
  }
}

window.UI = {
  initBackground, toast, fmt, timeAgo, startQi, flashBreakthrough,
  renderHUD, renderMeditate, renderAttrs, renderSpots, renderMaps, renderDungeons,
  renderSkills, renderAlchemy, renderBeasts, renderBeastDetail, bindBeastButtons, renderCave,
  renderSect, renderTasks, renderArena, renderRank, renderMarket, renderSocial, renderChat,
  renderBag, renderEquip, renderDevour, renderNet, renderNotice, renderCreate, rewardTxt,
  renderTracker, renderToolBar, openWin, closeWin, bindWinTabs, renderStory, renderMini, TOOLS,
  renderEquipDetail, renderBagDetail, renderSkillDetail, slotDef,
  renderBottle, renderPartners, renderCodex, renderCreateFaction, renderTraitDesc,
  setScene, renderActs, renderTitles, renderSectEx,
  renderSkins, renderWorms, renderSocialX, renderAuction,
  get CUR_WIN() { return CUR_WIN; },
  setFighters, floatNum, boom, shake, hitAnim, hpBar, pushLog, clearLog,
  get curMap() { return CUR_MAP; }, set curMap(v) { CUR_MAP = v; },
  get bagFilter() { return BAG_FILTER; }, set bagFilter(v) { BAG_FILTER = v; },
  get mkFilter() { return MK_FILTER; }, set mkFilter(v) { MK_FILTER = v; },
  get arenaOpp() { return ARENA_OPP; }, set arenaOpp(v) { ARENA_OPP = v; },
  get curBeast() { return CUR_BEAST; }, set curBeast(v) { CUR_BEAST = v; },
  CR,
};
