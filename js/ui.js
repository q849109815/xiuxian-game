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
    CUR_MAP = i; renderMaps(p);
  });
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
  $('#equippedSkills').innerHTML = eq.length ? eq.map((id) => {
    const sk = SYS.skillDef(id); if (!sk) return '';
    const own = SYS.ownSkill(p, id);
    return `<div class="item"><div class="ic">${sk.icon}</div>
      <div class="info"><div class="nm">${sk.name} <span class="small">${sk.type === 'heart' ? '心法' : '功法'} ${own ? own.level : 1} 层</span></div>
      <div class="sub">${sk.desc}｜适配 ${Math.round(SYS.skillFit(p, sk) * 100)}%</div></div>
      <button class="mini" data-un="${id}">卸下</button></div>`;
  }).join('') : '<div class="small">尚未装备功法</div>';
  $$('#equippedSkills [data-un]').forEach((b) => b.onclick = () => { toast(SYS.unequipSkill(p, b.dataset.un).msg); renderSkills(p); renderAttrs(p); save(); });

  const owned = p.skills || [];
  $('#skillList').innerHTML = owned.length ? owned.map((o) => {
    const sk = SYS.skillDef(o.id); if (!sk) return '';
    const equipped = eq.includes(o.id);
    const cost = SYS.skillUpCost(sk, o.level);
    return `<div class="item"><div class="ic">${sk.icon}</div>
      <div class="info"><div class="nm">${sk.name} <span class="small">${o.level}/${sk.maxLevel} 层</span></div>
      <div class="sub">${sk.desc}${sk.conflict && sk.conflict.length ? '｜冲突：' + sk.conflict.map((c) => (SYS.skillDef(c) || {}).name).join('、') : ''}</div></div>
      <button class="mini" data-eq="${o.id}">${equipped ? '已装' : '装备'}</button>
      <button class="mini" data-up="${o.id}">参悟 ${fmt(cost)}</button></div>`;
  }).join('') : '<div class="small">尚未习得功法（可在坊市购买或秘境获取）</div>';
  $$('#skillList [data-eq]').forEach((b) => b.onclick = () => { const r = SYS.equipSkill(p, b.dataset.eq); toast(r.msg, r.ok ? 'ok' : 'err'); renderSkills(p); renderAttrs(p); save(); });
  $$('#skillList [data-up]').forEach((b) => b.onclick = () => { const r = SYS.upgradeSkill(p, b.dataset.up); toast(r.msg, r.ok ? 'ok' : 'err'); renderSkills(p); renderHUD(p); renderAttrs(p); save(); });
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
      <button class="mini" data-ss="${it.id}" ${(p.sectInfo.contrib || 0) < it.contrib ? 'disabled' : ''}>${it.contrib} 贡献</button></div>`).join('');
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
function renderTasks(p) {
  SYS.refreshDaily(p);
  const mt = SYS.mainTaskOf(p);
  const done = SYS.checkMain(p);
  $('#mainTask').innerHTML = mt ? `<div class="item"><div class="ic">📖</div>
    <div class="info"><div class="nm">${mt.name}</div><div class="sub">${mt.desc}</div>
    <div class="sub">奖励：${rewardTxt(mt.reward)}</div></div>
    <button class="mini" id="btnMain" ${done ? '' : 'disabled'}>${done ? '领取' : '进行中'}</button></div>` : '<div class="small">主线已全部完成</div>';
  const bm = $('#btnMain'); if (bm) bm.onclick = () => { const r = SYS.claimMain(p); toast(r.msg, r.ok ? 'ok' : 'err'); renderTasks(p); renderHUD(p); save(); };
  $('#dailyDate').textContent = `（${SYS.todayStr()}）`;
  $('#dailyTasks').innerHTML = SYS.dailyList(p).map((t) => `<div class="item"><div class="ic">${t.done ? '✅' : '⭕'}</div>
    <div class="info"><div class="nm">${t.name}</div><div class="sub">${t.desc}｜进度 ${t.prog}/${t.need}</div>
    <div class="sub">奖励：${rewardTxt(t.reward)}</div></div>
    <button class="mini" data-dt="${t.id}" ${t.done && !t.claimed ? '' : 'disabled'}>${t.claimed ? '已领' : '领取'}</button></div>`).join('');
  $$('#dailyTasks [data-dt]').forEach((b) => b.onclick = () => { const r = SYS.claimDaily(p, b.dataset.dt); toast(r.msg, r.ok ? 'ok' : 'err'); renderTasks(p); renderHUD(p); save(); });
  $('#bountyTasks').innerHTML = SYS.bountyList(p).map((t) => `<div class="item"><div class="ic">📮</div>
    <div class="info"><div class="nm">${t.name}</div><div class="sub">${t.desc}｜进度 ${t.prog}/${t.need}</div>
    <div class="sub">赏金：${rewardTxt(t.reward)}</div></div>
    <button class="mini" data-bt="${t.id}" ${t.done && !t.claimed ? '' : 'disabled'}>${t.claimed ? '已领' : '领取'}</button></div>`).join('');
  $$('#bountyTasks [data-bt]').forEach((b) => b.onclick = () => { const r = SYS.claimBounty(p, b.dataset.bt); toast(r.msg, r.ok ? 'ok' : 'err'); renderTasks(p); renderHUD(p); save(); });
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
}

/* ---------- 装备栏 ---------- */
let DEVOUR_TARGET = null;
function renderEquip(p) {
  const cfg = GAME_CONFIG;
  $('#equipBox').innerHTML = cfg.slots.map((s) => {
    const it = p.equip[s.key];
    const m = it ? cfg.qualities[it.q].mul * (1 + (it.level || 0) * cfg.enhance.attrPerLevel) * (1 + (it.temper || 0) * cfg.temper.attrPerLevel) : 1;
    return `<div class="item"><div class="ic">${s.icon}</div>
      <div class="info"><div class="nm ${it ? 'q' + it.q : ''}">${s.name}：${it ? it.name + (it.level ? ' +' + it.level : '') + (it.temper ? ' 淬' + it.temper : '') : '（空）'}</div>
      <div class="sub">${it ? `攻${Math.round((it.atk || 0) * m)} 防${Math.round((it.def || 0) * m)} 血${Math.round((it.hp || 0) * m)}` : '去储物袋装备'}</div></div>
      ${it ? `<button class="mini" data-enh="${s.key}">强化 ${fmt(ENGINE.enhanceCost(it))}</button>
      <button class="mini" data-tem="${s.key}">淬灵 ${fmt(ENGINE.temperCost(it))}</button>
      <button class="mini" data-dev="${s.key}">炼化</button>` : ''}</div>`;
  }).join('');
  $$('#equipBox [data-enh]').forEach((b) => b.onclick = () => onEquipAction(p, 'enhance', b.dataset.enh));
  $$('#equipBox [data-tem]').forEach((b) => b.onclick = () => onEquipAction(p, 'temper', b.dataset.tem));
  $$('#equipBox [data-dev]').forEach((b) => b.onclick = () => { DEVOUR_TARGET = b.dataset.dev; renderDevour(p); });
}
function renderDevour(p) {
  const it = p.equip[DEVOUR_TARGET];
  if (!it) { $('#devourCard').style.display = 'none'; return; }
  $('#devourCard').style.display = '';
  $('#devourWho').textContent = it.name;
  const foods = p.bag.filter((x) => x.id !== it.id).slice(0, 15);
  $('#devourList').innerHTML = foods.length ? foods.map((f) => `<button class="mini" data-dvf="${f.id}" style="margin:2px">${f.icon || '📦'}${f.name}${f.count ? '×' + f.count : ''}</button>`).join('') : '<div class="small">没有可炼化的物品</div>';
  $$('#devourList [data-dvf]').forEach((b) => b.onclick = () => {
    const r = ENGINE.devour(p, it, b.dataset.dvf);
    toast(r.msg, r.ok ? 'ok' : 'err'); renderEquip(p); renderBag(p); renderHUD(p); renderAttrs(p); save();
  });
}

/* ---------- 背包（设置页之外共用） ---------- */
let BAG_FILTER = 'all';
function renderBag(p) {
  const cfg = GAME_CONFIG;
  const box = $('#bagList'); if (!box) return;
  const cnt = $('#bagCount'); if (cnt) cnt.textContent = `（${p.bag.length}/80）`;
  const list = p.bag.filter((x) => BAG_FILTER === 'all' || x.kind === BAG_FILTER);
  box.innerHTML = list.length ? list.map((it) => {
    const q = it.kind === 'equip' ? (it.q || 0) : 0;
    const sub = it.kind === 'equip'
      ? `${cfg.slots.find((s) => s.key === it.slot).name} · 攻${it.atk} 防${it.def} 血${it.hp}${it.level ? ' +' + it.level : ''}${it.temper ? ' 淬' + it.temper : ''}`
      : (it.desc || '') + (it.count ? ` ×${it.count}` : '');
    return `<div class="item"><div class="ic">${it.icon || (it.kind === 'equip' ? cfg.slots.find((s) => s.key === it.slot).icon : '📦')}</div>
      <div class="info"><div class="nm q${q}">${it.name}${it.count ? ' ×' + it.count : ''}</div><div class="sub">${sub}</div></div>
      ${it.kind === 'equip' ? `<button class="mini" data-buse="${it.id}">装备</button><button class="mini" data-bsell="${it.id}">售</button>`
        : it.kind === 'pill' ? `<button class="mini" data-buse="${it.id}">服用</button>`
        : it.kind === 'talisman' ? `<button class="mini" data-buse="${it.id}">激活</button>`
        : `<button class="mini" data-bsell="${it.id}">售</button>`}
      ${it.kind === 'equip' ? `<button class="mini" data-bmk="${it.id}">寄售</button>` : ''}</div>`;
  }).join('') : '<div class="small">空空如也</div>';
  $$('#bagList [data-buse]').forEach((b) => b.onclick = () => onUseItem(p, b.dataset.buse));
  $$('#bagList [data-bsell]').forEach((b) => b.onclick = () => onSell(p, b.dataset.bsell));
  $$('#bagList [data-bmk]').forEach((b) => b.onclick = () => onMarketSell(p, b.dataset.bmk));
}

/* ---------- 网络 / 公告 ---------- */
function renderNet() {
  const on = Net.online;
  $('#netDot').className = 'dot ' + (on ? 'on' : 'off');
  $('#netTxt').textContent = on ? '云端已连接' : (Net.queueSize() ? '离线中（存档待传）' : '离线模式');
  $('#setEp').textContent = Net.endpoint.replace('https://', '');
  $('#setQueue').textContent = Net.queueSize();
}
function renderNotice() {
  const n = window.NOTICE || {};
  const box = $('#noticeTxt'); if (!box) return;
  box.textContent = n.notice || '暂无公告';
  const ev = n.events || {};
  const eb = $('#eventBox');
  if (eb) eb.innerHTML = (ev.doubleExp || ev.doubleStone)
    ? `<div class="event">🎉 ${ev.eventName || '全服活动'}：${ev.doubleExp ? '修为×' + ev.expMul : ''} ${ev.doubleStone ? '灵石×' + ev.stoneMul : ''} ${ev.eventEnd ? '（至 ' + ev.eventEnd + '）' : ''}</div>` : '';
}

/* ---------- 角色创建 ---------- */
let CR = { gender: 'm', avatar: '🧙', root: 'mixed', sect: null };
function renderCreate() {
  const gs = GAME_CONFIG.genders || [];
  $('#crGender').innerHTML = gs.map((g) => `<button class="mini" data-g="${g.id}" style="${CR.gender === g.id ? 'background:rgba(255,215,110,.3)' : ''}">${g.name}</button>`).join('');
  $$('#crGender [data-g]').forEach((b) => b.onclick = () => { CR.gender = b.dataset.g; CR.avatar = gs.find((x) => x.id === CR.gender).icons[0]; renderCreate(); });
  const icons = gs.find((x) => x.id === CR.gender).icons;
  $('#crAvatar').innerHTML = icons.map((ic) => `<button class="mini" data-a="${ic}" style="font-size:20px;${CR.avatar === ic ? 'background:rgba(255,215,110,.3)' : ''}">${ic}</button>`).join('');
  $$('#crAvatar [data-a]').forEach((b) => b.onclick = () => { CR.avatar = b.dataset.a; renderCreate(); });
  const rt = GAME_CONFIG.roots.find((r) => r.id === CR.root);
  $('#crRoot').innerHTML = `<div class="item"><div class="ic">${rt.icon}</div>
    <div class="info"><div class="nm" style="color:${rt.color}">${rt.name}</div>
    <div class="sub">${rt.desc}｜修炼 ×${rt.expMul} 攻击 ×${rt.atkMul} 防御 ×${rt.defMul} 福缘 ×${rt.luck}</div></div></div>`;
  const sects = (window.GAME_SOCIAL && GAME_SOCIAL.sects) || [];
  $('#crSect').innerHTML = sects.map((s) => `<div class="mapc ${CR.sect === s.id ? 'on' : ''}" data-cs="${s.id}">
    <div class="ic">${s.icon}</div><div style="flex:1"><div class="nm">${s.name}</div>
    <div class="sub">${s.desc}</div></div></div>`).concat([`<div class="mapc ${CR.sect === null ? 'on' : ''}" data-cs="none">
    <div class="ic">🚶</div><div style="flex:1"><div class="nm">散修</div><div class="sub">不加入宗门，自由自在</div></div></div>`]).join('');
  $$('#crSect [data-cs]').forEach((el) => el.onclick = () => { CR.sect = el.dataset.cs === 'none' ? null : el.dataset.cs; renderCreate(); });
}

window.UI = {
  initBackground, toast, fmt, timeAgo, startQi, flashBreakthrough,
  renderHUD, renderMeditate, renderAttrs, renderSpots, renderMaps, renderDungeons,
  renderSkills, renderAlchemy, renderBeasts, renderBeastDetail, bindBeastButtons, renderCave,
  renderSect, renderTasks, renderArena, renderRank, renderMarket, renderSocial, renderChat,
  renderBag, renderEquip, renderDevour, renderNet, renderNotice, renderCreate, rewardTxt,
  setFighters, floatNum, boom, shake, hitAnim, hpBar, pushLog, clearLog,
  get curMap() { return CUR_MAP; }, set curMap(v) { CUR_MAP = v; },
  get bagFilter() { return BAG_FILTER; }, set bagFilter(v) { BAG_FILTER = v; },
  get mkFilter() { return MK_FILTER; }, set mkFilter(v) { MK_FILTER = v; },
  get arenaOpp() { return ARENA_OPP; }, set arenaOpp(v) { ARENA_OPP = v; },
  get curBeast() { return CUR_BEAST; }, set curBeast(v) { CUR_BEAST = v; },
  CR,
};
