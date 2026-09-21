/* =========================================================
 * ui.js —— 界面渲染 + 动画特效
 * ========================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/** 大数字格式化：12345 -> 1.2万 */
function fmt(n) {
  n = Math.round(n);
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + '兆';
  if (abs >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return n + '';
}
window.fmt = fmt;

/* ---------- 背景：星空 + 灵气流动 ---------- */
function initBackground() {
  const cv = $('#bg'); const ctx = cv.getContext('2d');
  let W, H, stars = [], qi = [];
  function resize() {
    W = cv.width = innerWidth * devicePixelRatio;
    H = cv.height = innerHeight * devicePixelRatio;
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    stars = Array.from({ length: Math.round(innerWidth / 6) }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 * devicePixelRatio,
      a: Math.random(), s: 0.4 + Math.random() * 1.2,
    }));
    qi = Array.from({ length: 26 }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: (2 + Math.random() * 4) * devicePixelRatio,
      v: 0.2 + Math.random() * 0.5, a: Math.random() * Math.PI * 2,
    }));
  }
  resize(); addEventListener('resize', resize);
  (function loop() {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#080c18'); g.addColorStop(.55, '#0d1426'); g.addColorStop(1, '#12102a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      s.a += 0.02 * s.s;
      ctx.globalAlpha = 0.35 + 0.4 * Math.sin(s.a);
      ctx.fillStyle = '#cfe0ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.3); ctx.fill();
    }
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

/* ---------- Toast ---------- */
function toast(msg, type = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + type; d.textContent = msg;
  $('#toasts').appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

/* ---------- 修炼灵气粒子 ---------- */
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
    box.appendChild(p);
    setTimeout(() => p.remove(), 3000);
  }, 420);
}

/* ---------- 突破全屏光效 ---------- */
function flashBreakthrough() {
  const f = $('#flash');
  f.innerHTML = '<div class="lightpillar"></div>';
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  setTimeout(() => { f.classList.remove('go'); f.innerHTML = ''; }, 1600);
}

/* ---------- 战斗动画 ---------- */
const A = {
  me: null, foe: null, busy: false,
};

function setFighters(meIcon, foeIcon, foeName) {
  A.me = $('#fMe'); A.foe = $('#fFoe');
  A.me.querySelector('.nm') && (A.me.querySelector('.nm').textContent = '你');
  A.foe.style.display = 'flex';
  A.foe.firstChild.textContent = foeIcon;
  A.foe.querySelector('.nm').textContent = foeName;
  $('#foeNm').textContent = foeName;
  $('#meNm').textContent = '你';
}

function floatNum(isMe, text, cls = '') {
  const arena = $('#arena');
  const el = document.createElement('div');
  el.className = 'float-num ' + (isMe ? 'me ' : '') + cls;
  el.textContent = text;
  el.style.left = (isMe ? 30 : arena.clientWidth - 130) + 'px';
  el.style.top = (70 + Math.random() * 40) + 'px';
  arena.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function boom(isMe) {
  const arena = $('#arena');
  const el = document.createElement('div');
  el.className = 'slash';
  el.style.left = (isMe ? arena.clientWidth / 2 - 20 : arena.clientWidth / 2 - 70) + 'px';
  el.style.top = '90px';
  arena.appendChild(el);
  setTimeout(() => el.remove(), 550);
}

function shake() {
  const a = $('#arena'); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake');
}

function hitAnim(el, kind) {
  el.classList.remove('attack', 'hurt'); void el.offsetWidth; el.classList.add(kind);
  setTimeout(() => el.classList.remove(kind), 500);
}

function hpBar(which, cur, max) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  $(which === 'me' ? '#meHp' : '#foeHp').style.width = pct + '%';
  $(which === 'me' ? '#meHpTxt' : '#foeHpTxt').textContent = `${Math.max(0, Math.round(cur))} / ${Math.round(max)}`;
}

function pushLog(text, cls = 'sys') {
  const box = $('#logbox');
  const p = document.createElement('p'); p.className = cls; p.textContent = text;
  box.appendChild(p); box.scrollTop = box.scrollHeight;
  while (box.children.length > 60) box.removeChild(box.firstChild);
}

function clearLog() { $('#logbox').innerHTML = ''; }

/* ---------- 渲染：HUD ---------- */
function renderHUD(p) {
  const a = ENGINE.attrs(p);
  $('#hRealm').textContent = ENGINE.realmName(p);
  $('#hRealm').style.color = GAME_CONFIG.realms[p.realm].color;
  $('#hExp').textContent = fmt(p.exp);
  $('#hStone').textContent = fmt(p.stone);
  $('#hPow').textContent = fmt(ENGINE.power(p));
  $('#hName').textContent = p.name;
  const need = ENGINE.expNeed(p);
  const pct = Math.min(100, (p.exp / need) * 100);
  $('#hBar').style.width = pct + '%';
  $('#hBarTxt').textContent = `${fmt(p.exp)} / ${fmt(need)}`;
  $('#cultBar').style.width = pct + '%';
  $('#cultBarTxt').textContent = `${fmt(p.exp)} / ${fmt(need)}　（${ENGINE.realmName(p)}）`;
  $('#cultRate').textContent = '+' + fmt(ENGINE.expPerSec(p)) + ' /秒';
  $('#cultAvatar').textContent = '🧘';
}

/** 闭关按钮：冷却中显示倒计时并禁用 */
function renderMeditate(p) {
  const btn = $('#btnMeditate'); if (!btn) return;
  const left = ENGINE.meditateCdLeft(p);
  if (left > 0) {
    const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
    btn.disabled = true;
    btn.textContent = `🧘 调息中 ${mm}:${ss}`;
    btn.classList.remove('act'); btn.classList.add('ghost');
  } else {
    btn.disabled = false;
    btn.textContent = '🧘 闭关修炼';
    btn.classList.add('act'); btn.classList.remove('ghost');
  }
}

function renderAttrs(p) {
  const a = ENGINE.attrs(p);
  const rows = [['气血', a.hp], ['攻击', a.atk], ['防御', a.def], ['暴击', (a.crit * 100).toFixed(1) + '%'], ['暴伤', (a.critDmg * 100).toFixed(0) + '%'], ['速度', a.speed.toFixed(1)]];
  $('#attrBox').innerHTML = rows.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
  $('#statBox').innerHTML = [
    ['总战力', fmt(ENGINE.power(p))], ['击杀', p.stats.kills], ['败北', p.stats.deaths],
    ['战次', p.stats.battles], ['累计修为', fmt(ENGINE.totalExp(p))], ['离线时长', Math.round((p.stats.offlineMin || 0)) + ' 分'],
    ['入道时间', new Date(p.createdAt).toLocaleDateString()],
  ].map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
}

/* ---------- 渲染：地图 ---------- */
let CUR_MAP = 0;
function renderMaps(p) {
  const cfg = GAME_CONFIG;
  $('#mapList').innerHTML = cfg.maps.map((m, i) => {
    const lock = p.realm < m.minRealm;
    return `<div class="mapc ${i === CUR_MAP ? 'on' : ''} ${lock ? 'lock' : ''}" data-map="${i}">
      <div class="ic">${m.icon}</div>
      <div style="flex:1">
        <div class="nm">${m.name} ${lock ? '🔒' : ''}</div>
        <div class="sub">${lock ? `需【${cfg.realms[m.minRealm].name}】境` : `修为 ${m.exp} · 灵石 ${m.stone} · 掉落 ${Math.round(m.dropRate * 100)}%`}</div>
        <div class="sub">${m.monsters.map((x) => x.icon + x.name).join('　')}</div>
      </div></div>`;
  }).join('');
  $$('#mapList .mapc').forEach((el) => el.onclick = () => {
    const i = +el.dataset.map;
    if (p.realm < GAME_CONFIG.maps[i].minRealm) return toast('修为不足，无法进入', 'err');
    CUR_MAP = i; renderMaps(p);
  });
}

/* ---------- 渲染：背包 ---------- */
let BAG_FILTER = 'all';
function renderBag(p) {
  const cfg = GAME_CONFIG;
  $('#equipBox').innerHTML = cfg.slots.map((s) => {
    const it = p.equip[s.key];
    return `<div class="item"><div class="ic">${s.icon}</div><div class="info">
      <div class="nm ${it ? 'q' + it.q : ''}">${s.name}：${it ? it.name + (it.level ? ' +' + it.level : '') : '（空）'}</div>
      <div class="sub">${it ? `攻${Math.round(it.atk * cfg.qualities[it.q].mul)} 防${Math.round(it.def * cfg.qualities[it.q].mul)} 血${Math.round(it.hp * cfg.qualities[it.q].mul)}` : '去储物袋装备'}</div>
    </div>${it ? `<button class="mini" data-enh="${s.key}">强化</button>` : ''}</div>`;
  }).join('');
  $$('#equipBox [data-enh]').forEach((b) => b.onclick = () => onEnhance(p, b.dataset.enh));

  const list = p.bag.filter((x) => BAG_FILTER === 'all' || x.kind === BAG_FILTER);
  $('#bagCount').textContent = `（${p.bag.length}/60）`;
  $('#bagList').innerHTML = list.length ? list.map((it) => {
    const q = it.kind === 'equip' ? it.q : 0;
    const sub = it.kind === 'equip'
      ? `${cfg.slots.find((s) => s.key === it.slot).name} · 攻${it.atk} 防${it.def} 血${it.hp}${it.level ? ' +' + it.level : ''}`
      : it.kind === 'mat' ? `材料 ×${it.count} · 售价 ${it.price * it.count}` : it.desc;
    return `<div class="item"><div class="ic">${it.kind === 'equip' ? cfg.slots.find((s) => s.key === it.slot).icon : it.icon}</div>
      <div class="info"><div class="nm q${q}">${it.name}${it.level ? ' +' + it.level : ''}</div><div class="sub">${sub}</div></div>
      <button class="mini" data-use="${it.id}">${it.kind === 'equip' ? '装备' : it.kind === 'pill' ? '服用' : '出售'}</button>
      ${it.kind === 'equip' ? `<button class="mini" data-sell="${it.id}">售</button>` : ''}</div>`;
  }).join('') : '<div class="small">空空如也</div>';
  $$('#bagList [data-use]').forEach((b) => b.onclick = () => onUseItem(p, b.dataset.use));
  $$('#bagList [data-sell]').forEach((b) => b.onclick = () => onSell(p, b.dataset.sell));

  $('#shopBox').innerHTML = cfg.pills.map((pl) => `<div class="item"><div class="ic">${pl.icon}</div>
    <div class="info"><div class="nm">${pl.name}</div><div class="sub">${pl.desc}</div></div>
    <button class="mini" data-buy="${pl.id}">${pl.price}💎</button></div>`).join('');
  $$('#shopBox [data-buy]').forEach((b) => b.onclick = () => onBuy(p, b.dataset.buy));
}

/* ---------- 渲染：排行 / 公告 ---------- */
function renderRank(list) {
  if (!list || !list.length) { $('#rankList').innerHTML = '<div class="small">暂无数据（等待 Actions 汇总）</div>'; return; }
  $('#rankList').innerHTML = list.slice(0, 50).map((r, i) => `<div class="rank">
    <span class="no ${i < 3 ? 'top' : ''}">${i + 1}</span>
    <span class="nm">${r.name} · <span class="small">${r.realm}</span></span>
    <span class="pw">${fmt(r.power)}</span></div>`).join('');
}

function renderNotice() {
  const n = window.NOTICE || {};
  $('#noticeTxt').textContent = n.notice || '暂无公告';
  const ev = n.events || {};
  $('#eventBox').innerHTML = (ev.doubleExp || ev.doubleStone)
    ? `<div class="event">🎉 ${ev.eventName || '全服活动'}：${ev.doubleExp ? '修为×' + ev.expMul : ''} ${ev.doubleStone ? '灵石×' + ev.stoneMul : ''} ${ev.eventEnd ? '（至 ' + ev.eventEnd + '）' : ''}</div>`
    : '';
}

/* ---------- 网络状态 ---------- */
function renderNet() {
  const on = Net.online;
  $('#netDot').className = 'dot ' + (on ? 'on' : 'off');
  $('#netTxt').textContent = on ? '云端已连接' : (Net.queueSize() ? '离线中（存档待传）' : '离线模式');
  $('#setEp').textContent = Net.endpoint.replace('https://', '');
  $('#setQueue').textContent = Net.queueSize();
}

window.UI = { initBackground, toast, renderHUD, renderMeditate, renderAttrs, renderMaps, renderBag, renderRank, renderNotice, renderNet, startQi, flashBreakthrough, pushLog, clearLog, hpBar, setFighters, floatNum, boom, shake, hitAnim, get curMap() { return CUR_MAP; }, set curMap(v) { CUR_MAP = v; }, get bagFilter() { return BAG_FILTER; }, set bagFilter(v) { BAG_FILTER = v; } };
