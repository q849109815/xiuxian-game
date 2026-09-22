/* =========================================================
 * ui.js —— 界面渲染（20 个系统面板 + 伪3D 动画）
 * 布局依据：23_操作界面介绍
 * ========================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const UI = {
  P: null,
  CUR: null,        // 当前面板
  TAB: {},          // 各面板当前 tab

  /* ================= 提示 ================= */
  toast(msg, type) {
    const d = document.createElement('div');
    d.className = 'toast ' + (type || '');
    d.textContent = msg;
    $('#toasts').appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; d.style.transition = '.3s'; setTimeout(() => d.remove(), 300); }, 1800);
  },

  /* ================= 主界面 HUD ================= */
  hud() {
    const p = this.P; if (!p) return;
    $('#tbName').textContent = p.name;
    $('#tbRealm').textContent = CFG.realmName(p.realm) + ' ' + EX.layerName(p.realm, p.layer);
    const need = E.expNeed(p);
    $('#tbExpBar').style.width = Math.min(100, (p.exp / need * 100)) + '%';
    $('#tbStone').textContent = E.fmt(p.stone);
    $('#tbJade').textContent = E.fmt(p.jade || 0);
    $('#tbAvIn').textContent = p.avatar || '🧙';
    // 左上玩家信息（图32：头像 + Lv + 战力 + VIP）
    const plNm = $('#plName'), plPw = $('#plPower'), plLv = $('#plAvLv'), plAv = $('#plAvImg'), plVip = $('#plVip');
    if (plNm) plNm.textContent = p.name;
    if (plPw) plPw.textContent = E.fmt(this.power ? this.power(p) : E.power(p));
    if (plLv) plLv.textContent = 'Lv.' + ((p.realm || 0) * 10 + (p.layer || 0) + 1);
    if (plVip) { const v = p.vip || 0; plVip.textContent = 'VIP' + v; plVip.style.display = v ? '' : 'none'; }
    if (plAv) { const f = p.face || 'hanli'; plAv.src = 'assets/char/' + f + '.jpg'; plAv.onerror = () => { plAv.style.display = 'none'; }; }
    // 任务追踪
    const q = E.curMain(p);
    if (q) { $('#tskName').textContent = q.name; $('#tskGoal').textContent = q.goal || q.触发条件 || ''; }
    // 血条灵力条
    const mh = E.maxHp(p), mm = E.maxMp(p);
    $('#heroHp').style.width = ((p.hp || mh) / mh * 100) + '%';
    $('#heroMp').style.width = ((p.mp || mm) / mm * 100) + '%';
    $('#heroFig').textContent = p.avatar || '🧙';
  },

  /* ================= 面板系统 ================= */
  open(key, tab) {
    this.CUR = key;
    if (tab !== undefined) this.TAB[key] = tab;
    const conf = PANELS[key];
    if (!conf) return;
    $('#pnTitle').textContent = conf.n;
    // tabs
    const tb = $('#pnTabs');
    if (conf.tabs && conf.tabs.length) {
      tb.style.display = 'flex';
      tb.innerHTML = conf.tabs.map((t) =>
        `<button class="pn-tab ${this.TAB[key] === t ? 'on' : ''}" data-tab="${t}">${t}</button>`).join('');
      $$('#pnTabs .pn-tab').forEach((b) => b.onclick = () => { this.TAB[key] = b.dataset.tab; this.open(key, b.dataset.tab); });
    } else { tb.style.display = 'none'; tb.innerHTML = ''; }
    // body
    const r = conf.render ? conf.render(this.P, this.TAB[key]) : '';
    $('#pnBody').innerHTML = typeof r === 'string' ? r : (r.html || '');
    if (conf.bind) conf.bind(this.P, this.TAB[key]);
    if (conf.bind2) conf.bind2(this.P, this.TAB[key]);
    $('#panel').classList.add('on');
  },
  close() {
    $('#panel').classList.remove('on');
    this.CUR = null;
  },

  /* ================= 战斗界面 ================= */
  showBattle(foe) {
    $('#bossFig').textContent = foe.icon;
    $('#bossNm').textContent = foe.name;
    $('#bossHp').style.width = '100%';
    $$('.boss-stage,.hero-stage,.hero-bars,.btl-top').forEach((e) => e.style.display = '');
    $('#bossFig').classList.remove('fig-dead');
    BT.startCdTimer();
    this.updateBattle();
  },
  hideBattle() {
    $$('.boss-stage,.hero-bars,.btl-top').forEach((e) => e.style.display = 'none');
    BT.stopCdTimer();
    BT.setAuto(false);
    $('#dmgLayer').innerHTML = '';
  },
  updateBattle() {
    if (!BT.foe) return;
    const p = this.P || (BT && BT._p) || null;
    if (!p) return;
    $('#bossHp').style.width = Math.max(0, BT.foe.hp / BT.foe.maxHp * 100) + '%';
    const mh = E.maxHp(p), mm = E.maxMp(p);
    $('#heroHp').style.width = Math.max(0, (p.hp || 0) / mh * 100) + '%';
    $('#heroMp').style.width = Math.max(0, (p.mp || 0) / mm * 100) + '%';
    if (BT.foe.hp <= 0) $('#bossFig').classList.add('fig-dead');
  },
  updateCd(cd) {
    $$('#skillbar .sk-btn[data-sk]').forEach((b) => {
      const i = +b.dataset.sk;
      if (cd[i] > 0) { b.classList.add('cd'); b.style.setProperty('--cd', (cd[i] / (EX.skills[i]?.cd || 6) * 360) + 'deg'); }
      else b.classList.remove('cd');
    });
  },
  updateAuto(v) { $('#btnAuto').classList.toggle('on', v); },

  /* 伤害飘字 */
  floatText(txt, cls, xPct, yPct) {
    const d = document.createElement('div');
    d.className = 'dmg ' + (cls || '');
    d.textContent = txt;
    d.style.left = (xPct !== undefined ? xPct : 50) + '%';
    d.style.top = (yPct !== undefined ? yPct : 40) + '%';
    if (!cls) d.style.color = '#fff';
    if (cls === 'heal') d.style.color = '#5ce88a';
    if (cls === 'crit') d.style.color = '#ffcf3a';
    if (cls === 'miss') d.style.color = '#9aa8cc';
    $('#dmgLayer').appendChild(d);
    setTimeout(() => d.remove(), 1000);
  },
  hitFoe(dmg, crit, counter) {
    const txt = (crit ? '暴击+' : '') + E.fmt(dmg) + (counter > 1 ? ' 克制' : counter < 1 ? ' 被克' : '');
    this.floatText(txt, crit ? 'crit' : '', 66 + Math.random() * 8, 22 + Math.random() * 8);
    $('#bossFig').classList.add('hit');
    setTimeout(() => $('#bossFig').classList.remove('hit'), 320);
    this.shake();
  },
  hitHero(dmg, crit) {
    this.floatText((crit ? '暴击-' : '-') + E.fmt(dmg), crit ? 'crit' : '', 26 + Math.random() * 8, 62 + Math.random() * 8);
    $('#heroFig').classList.add('hit');
    setTimeout(() => $('#heroFig').classList.remove('hit'), 320);
    this.shake();
  },
  shake() {
    const c = $('.center');
    if (!c) return;
    c.classList.add('screen-shake');
    setTimeout(() => c.classList.remove('screen-shake'), 260);
  },
  heroLunge() {
    const f = $('#heroFig');
    f.classList.add('atk'); setTimeout(() => f.classList.remove('atk'), 420);
  },
  bossLunge() {
    const f = $('#bossFig');
    f.classList.add('atk'); setTimeout(() => f.classList.remove('atk'), 420);
  },
  floatSkill(n, w) {
    this.floatText('【' + n + '】', '', 40 + Math.random() * 10, 46);
  },
  fx(name) {
    const c = $('.center');
    if (!c) return;
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:50%;top:52%;width:120px;height:120px;margin:-60px 0 0 -60px;' +
      'border-radius:50%;pointer-events:none;animation:flash .45s forwards';
    const col = { '剑影': 'rgba(92,232,255,.5)', '虫潮': 'rgba(95,208,122,.5)', '傀儡': 'rgba(176,108,255,.5)' }[name] || 'rgba(255,208,106,.45)';
    d.style.background = 'radial-gradient(circle,' + col + ',transparent 70%)';
    c.appendChild(d);
    setTimeout(() => d.remove(), 460);
  },

  battleResult(win, d) {
    const p = this.P;
    if (win) {
      let s = `击败【${d.name}】 灵石+${E.fmt(d.stone)} 修为+${E.fmt(d.exp)}`;
      if (d.drops && d.drops.length) s += ' 掉落:' + d.drops.join('、');
      this.toast(s, 'ok');
      if (d.up > 0) this.toast('修为精进！', 'ok');
    } else {
      this.toast('不敌【' + d.name + '】，身受重伤', 'err');
    }
    this.hud();
  },

  /* ================= 特效：升级/突破 ================= */
  levelUpFx(txt) {
    const f = document.createElement('div'); f.className = 'levelup-fx'; document.body.appendChild(f);
    setTimeout(() => f.remove(), 1250);
    const t = document.createElement('div'); t.className = 'levelup-txt'; t.textContent = txt; document.body.appendChild(t);
    setTimeout(() => t.remove(), 1850);
  },

  chat(msg, sys) {
    const box = $('#chScroll');
    if (!box) return;
    const d = document.createElement('div');
    d.className = 'ch-line' + (sys ? ' sys' : '');
    d.innerHTML = sys ? msg : `<b>${msg.split('：')[0]}</b>：${msg.split('：').slice(1).join('：')}`;
    box.prepend(d);
    while (box.children.length > 6) box.lastChild.remove();
  },

  /* ================= 场景背景 ================= */
  setScene(name) {
    const sc = $('#scene');
    if (!sc) return;
    // 地图 → 真实场景图（assets/scene/）
    const PIC = {
      'M1': 'luanxinghai', 'M2': 'huangfenggu', 'M3': 'xuese', 'M4': 'qixuanmen',
      'M5': 'luanxinghai', 'M6': 'xutiandian', 'M7': 'tianyuan', 'M8': 'beihan',
      'M9': 'luanxinghai', 'M10': 'xutiandian', 'M11': 'main_bg', 'M12': 'main_bg',
    };
    const f = PIC[name] || 'luanxinghai';
    sc.style.backgroundImage = `url(assets/scene/${f}.jpg)`;
    sc.style.backgroundSize = 'cover';
    sc.style.backgroundPosition = 'center 60%';
    sc.classList.add('on');
  },
};

/* =========================================================
 * 面板定义（20 个系统，依据 23_操作界面介绍）
 * ========================================================= */
const PANELS = {

  /* ---------- 1. 角色（参考图31：中央立绘+左右装备+底部标签） ---------- */
  role: {
    n: '角色', tabs: ['属性', '装备', '称号', '个性'],
    render(p, tab) {
      if (tab === '属性') return PANELS.role.attr(p);
      if (tab === '装备') return PANELS.role.equipTab(p);
      if (tab === '称号') return PANELS.role.titleTab(p);
      return PANELS.role.avatarTab(p);
    },
    attr(p) {
      const a = E.attrs(p);
      return `
      <div class="role-stage">
        <div class="role-halo"></div>
        <div class="role-fig" id="roleFig">${p.avatar || '🧙'}</div>
        <div class="role-shadow"></div>
      </div>
      <div class="bignum"><div class="v">${E.fmt(E.power(p))}</div><div class="l">战 力</div></div>
      <div class="card">
        <div class="card-t">基础信息</div>
        <div class="kv"><span>道号</span><b>${p.name}</b></div>
        <div class="kv"><span>境界</span><b class="up">${CFG.realmName(p.realm)} ${EX.layerName(p.realm, p.layer)}</b></div>
        <div class="kv"><span>灵根</span><b style="color:${(EX.roots.find(x=>x.k===p.root)||{}).c}">${p.rootName || p.root}</b></div>
        <div class="kv"><span>寿元</span><b>${CFG.realm(p.realm).life || '—'}</b></div>
        <div class="kv"><span>所在</span><b>${(EX.maps.find(m=>m.id===p.map)||{}).n || '小寰岛'}</b></div>
      </div>
      <div class="card">
        <div class="card-t">战斗属性</div>
        <div class="kv"><span>气血</span><b>${E.fmt(a.hp)}</b></div>
        <div class="kv"><span>灵力</span><b>${E.fmt(a.mp)}</b></div>
        <div class="kv"><span>攻击</span><b>${E.fmt(a.atk)}</b></div>
        <div class="kv"><span>防御</span><b>${E.fmt(a.def)}</b></div>
        <div class="kv"><span>神识</span><b>${E.fmt(a.sense)}</b></div>
        <div class="kv"><span>身法</span><b>${a.speed.toFixed(1)}</b></div>
        <div class="kv"><span>暴击</span><b>${(a.crit*100).toFixed(1)}%</b></div>
        <div class="kv"><span>闪避</span><b>${(a.dodge*100).toFixed(1)}%</b></div>
      </div>
      <div class="card">
        <div class="card-t">战绩</div>
        <div class="kv"><span>击杀</span><b>${E.fmt(p.stats.kills||0)}</b></div>
        <div class="kv"><span>战次</span><b>${E.fmt(p.stats.battles||0)}</b></div>
        <div class="kv"><span>突破</span><b>${p.stats.breaks||0} 次</b></div>
        <div class="kv"><span>在线时长</span><b>${Math.round((p.stats.online||0)/60)} 分</b></div>
      </div>`;
    },
    equipTab(p) {
      const slots = EX.slots;
      const L = slots.slice(0, 3), R = slots.slice(3);
      const heroImg = 'assets/char/' + (p.heroImg || 'hanli') + '.jpg';
      const cell = (s) => {
        const it = p.equip[s.k];
        const q = it ? EX.qIndex(it.q) : 0;
        return `<div class="eq-cell ${it ? 'on' : ''}" data-eq="${s.k}">
          ${it ? (it.icon || '⚔️') : `<span style="opacity:.28;font-size:20px">${s.icon}</span>`}
          ${it ? `<span class="lv">${it.lv ? '+' + it.lv : ''}</span>` : ''}
        </div>`;
      };
      return `
      <!-- 图31：中央大立绘 + 顶部战力 -->
      <div class="role-hero">
        <div class="rh-bg"></div>
        <div class="rh-ring"></div>
        <div class="rh-pw">战力 <b>${E.fmt(E.power(p))}</b></div>
        <img class="rh-fig" src="${heroImg}" alt="" onerror="this.style.display='none'">
      </div>

      <!-- 左右装备槽 -->
      <div class="eq3">
        <div class="eq3-col">${L.map(cell).join('')}</div>
        <div class="eq3-mid">
          <div style="font-size:11px;color:var(--txt3)">${CFG.realmName(p.realm)}</div>
          <div style="font-size:10px;color:var(--gold1);margin-top:2px">${EX.layerName(p.realm, p.layer)}</div>
        </div>
        <div class="eq3-col">${R.map(cell).join('')}</div>
      </div>

      <!-- 中部功能按钮（神识/御宠/仙霓神衣/幻化/收集） -->
      <div class="midbtns">
        <div class="mb" data-mb="sense"><i class="hot">👁</i><span>神识</span></div>
        <div class="mb" data-mb="pet"><i>🐾</i><span>御宠</span></div>
        <div class="mb" data-mb="robe"><i>👘</i><span>仙霓神衣</span></div>
        <div class="mb" data-mb="hua"><i>✨</i><span>幻化</span></div>
        <div class="mb" data-mb="collect"><i>📚</i><span>收集</span></div>
      </div>

      <button class="btn-yellow" id="btnAutoEquip">一键装备</button>

      <!-- 分类标签（首饰/神兵/时装/法器/套装） -->
      <div class="cats" id="eqCats">
        <div class="cat on" data-cat="all">全部</div>
        <div class="cat" data-cat="首饰">首饰</div>
        <div class="cat" data-cat="神兵">神兵</div>
        <div class="cat" data-cat="时装">时装</div>
        <div class="cat" data-cat="法器">法器</div>
        <div class="cat" data-cat="套装">套装</div>
      </div>

      <div class="sec-t">已装备</div>
      ${slots.map((s) => {
        const it = p.equip[s.k];
        return `<div class="item" data-eqs="${s.k}">
          <div class="ic">${it ? (it.icon || '⚔️') : s.icon}</div>
          <div class="info"><div class="nm">${it ? it.n : '（空）'}</div>
          <div class="sub">${it ? `攻${it.atk || 0} 防${it.def || 0} 血${it.hp || 0}${it.lv ? ' +' + it.lv : ''}` : s.n + ' 未装备'}</div></div>
          <div class="act">${it ? `<button class="btn sm d" data-un="${s.k}">卸下</button>` : ''}</div></div>`;
      }).join('')}
      <div class="sec-t">背包可装备</div>
      ${(p.bag || []).map((it, i) => it.slot ? `<div class="item" data-bag="${i}">
        <div class="ic">${it.icon || '⚔️'}</div>
        <div class="info"><div class="nm">${it.n}×${it.cnt || 1}</div>
        <div class="sub">攻${it.atk || 0} 防${it.def || 0} 血${it.hp || 0}</div></div>
        <div class="act"><button class="btn sm c" data-we="${i}">装备</button></div></div>` : '').join('') || '<div class="empty">无可装备物品</div>'}`;
    },

    titleTab(p) {
      const owns = p.titles || [];
      const cur = p.titleCur;
      const buffTxt = (b) => Object.entries(b || {}).map(([k, v]) =>
        `<i>${({ atk: '战力', hp: '生命', def: '防御', crit: '暴击', all: '全属性' })[k] || k}+${Math.round(v * 100)}%</i>`).join('');
      return `
      <!-- 图29：顶部战力 -->
      <div class="tt-power">当前战力 <b>${E.fmt(E.power(p))}</b></div>
      <div class="tt-tabs">
        <div class="cat on" data-tt="all">全部</div>
        <div class="cat" data-tt="跨服">跨服</div>
        <div class="cat" data-tt="赛季">赛季</div>
        <div class="cat" data-tt="活动">活动</div>
        <div class="cat" data-tt="成就">成就</div>
      </div>
      ${EX.titles.map((t) => {
        const own = owns.indexOf(t.id) >= 0;
        const on = cur === t.id;
        return `<div class="tt-card ${on ? 'on' : ''}">
          <div class="shine"></div>
          <div class="tt-nm">${t.n}</div>
          <div class="tt-buff">${buffTxt(t.buff)}<div class="tt-cond">${t.cond || ''}</div></div>
          <button class="tt-act ${own ? (on ? 'on' : '') : 'gray'}" data-tt-act="${t.id}">
            ${on ? '已激活' : (own ? '激活' : '未获得')}
          </button>
        </div>`;
      }).join('')}`;
    },

    avatarTab(p) {
      // 图30：圆形头像 + 3x4 网格 + 锁 + 进阶 + 标签
      const FACES = ['hanli', 'hanli_young', 'nangongwan', 'ziling', 'yinyue', 'yuanyao',
        'wangchan', 'xuangu', 'modafu', 'lifeiyu', 'lihuayuan', 'qingyuanzi'];
      const owned = p.faces || ['hanli'];
      const cur = p.face || 'hanli';
      const rank = p.faceRank || 1;
      return `
      <div class="ps-stage">
        <div class="ps-ring">
          <div class="ps-swirl"></div>
          <img src="assets/char/${cur}.jpg" alt="" onerror="this.style.display='none'">
        </div>
      </div>
      <div class="ps-meta">
        <div class="nm">浮云${rank}阶</div>
        <div class="sub">战力 ${E.fmt(E.power(p))} · ${owned.length > 1 ? '已解锁' + owned.length + '款' : '首次登录赠送'}</div>
      </div>
      <div class="cats">
        <div class="cat on" data-ps="头像">头像</div>
        <div class="cat" data-ps="头像框">头像框</div>
        <div class="cat" data-ps="聊天框">聊天框</div>
        <div class="cat" data-ps="传闻">传闻</div>
      </div>
      <div class="ps-grid">
        ${FACES.map((f, i) => {
          const ok = owned.indexOf(f) >= 0;
          return `<div class="ps-cell ${cur === f ? 'on' : ''}" data-face="${f}">
            ${ok ? `<img src="assets/char/${f}.jpg" alt="" onerror="this.style.display='none'">` : ''}
            ${ok ? '' : '<div class="lk">🔒</div>'}
            <div class="nmb">${['韩立', '少年', '南宫婉', '紫灵', '银月', '元瑶', '王蝉', '玄骨', '墨大夫', '厉飞雨', '李化元', '青元子'][i]}</div>
          </div>`;
        }).join('')}
      </div>
      <button class="ps-adv" id="btnFaceAdv">进 阶</button>`;
    },
  },

  /* ---------- 2. 境界 ---------- */
  realm: {
    n: '境界',
    render(p) {
      const rm = CFG.realm(p.realm);
      const nx = CFG.realm(p.realm + 1);
      const need = E.expNeed(p);
      const full = E.isFull(p);
      const cb = E.canBreak(p);
      return `
      <div class="bignum"><div class="v">${rm.name}</div><div class="l">${EX.layerName(p.realm, p.layer)}</div></div>
      <div class="card">
        <div class="card-t">修为进度</div>
        <div class="bar"><i class="g" style="width:${Math.min(100, p.exp / need * 100)}%"></i></div>
        <div class="kv"><span>当前修为</span><b>${E.fmt(p.exp)} / ${E.fmt(need)}</b></div>
        <div class="kv"><span>寿元</span><b>${rm.life || '—'}</b></div>
        <div class="kv"><span>小层</span><b>${p.layer + 1} / ${EX.layerCount(p.realm)}</b></div>
      </div>
      <div class="card">
        <div class="card-t">本境界加成</div>
        <div class="kv"><span>属性</span><b>${rm.bonus && Object.keys(rm.bonus).length ?
          Object.entries(rm.bonus).map(([k,v])=>({atk:'攻击',def:'防御',mp:'灵力',sense:'神识',all:'全属性'}[k]||k)+'+'+Math.round(v*100)+'%').join(' ') : '基础属性'}</b></div>
        <div class="kv"><span>解锁</span><b>${rm.unlock || '—'}</b></div>
      </div>
      <div class="card">
        <div class="card-t">突破条件 <span class="sub">下一境界：${nx && nx.id ? nx.name : '已至顶峰'}</span></div>
        <div class="kv"><span>修为圆满</span><b style="color:${full ? '#7ae89a' : '#ff8fa4'}">${full ? '✔ 已圆满' : '✘ 未圆满'}</b></div>
        <div class="kv"><span>所需丹药</span><b>${cb.pill || '无'}</b></div>
        <div class="kv"><span>试炼</span><b>${(rm.breakCond || '').indexOf('心魔') >= 0 || (rm.breakCond||'').indexOf('渡劫') >= 0 ? '需心魔试炼/渡劫' : '无需'}</b></div>
        <div class="kv"><span>失败惩罚</span><b style="color:var(--red)">${rm.failPenalty || '—'}</b></div>
      </div>
      <button class="btn p" style="width:100%;padding:13px;font-size:15px" id="btnBreak" ${full ? '' : 'disabled'}>
        ${full ? '⚡ 开始突破' : '修为未满'}</button>
      <div class="sec-t">境界序列</div>
      ${(CFG.core.realms || []).map((r, i) => `
        <div class="item ${i === p.realm ? 'on' : ''}" style="${i > p.realm ? 'opacity:.45' : ''}">
          <div class="ic">${i <= p.realm ? '✔' : '🔒'}</div>
          <div class="info"><div class="nm">${r.name} <span class="tag y">${r.stage}</span></div>
          <div class="sub">${r.unlock || r.breakCond}</div></div></div>`).join('')}`;
    },
    bind(p) {
      const b = $('#btnBreak');
      if (b) b.onclick = () => {
        const r = E.doBreak(p);
        if (r.ok) { UI.levelUpFx(r.msg.replace('突破成功！晋升【', '').replace('】', '')); UI.toast(r.msg + (r.unlock ? ' 解锁:' + r.unlock : ''), 'ok'); }
        else UI.toast(r.msg, 'err');
        UI.hud(); save(); UI.open('realm');
      };
    },
  },

  /* ---------- 3. 任务 ---------- */
  quest: {
    n: '任务', tabs: ['主线', '支线', '悬赏'],
    render(p, tab) {
      if (tab === '支线') return PANELS.quest.list(p, CFG.sideQuests(), 'side');
      if (tab === '悬赏') return PANELS.quest.list(p, CFG.bountyQuests(), 'bounty');
      return PANELS.quest.list(p, CFG.mainQuests(), 'main');
    },
    list(p, arr, kind) {
      const done = p.quest.done || [];
      return arr.map((q, i) => {
        const isDone = kind === 'main' ? (p.quest.main > i) : done.includes(q.id);
        const isCur = kind === 'main' && p.quest.main === i;
        return `<div class="item ${isCur ? 'on' : ''}" style="${isDone ? 'opacity:.5' : ''}">
          <div class="ic">${isDone ? '✔' : isCur ? '▶' : '○'}</div>
          <div class="info">
            <div class="nm">${q.name} <span class="tag ${kind==='main'?'y':kind==='side'?'b':'g'}">${q.chapter || q.type}</span></div>
            <div class="sub">${q.goal || q.任务目标 || ''}</div>
            <div class="sub" style="color:var(--gold)">奖励：${q.reward || q.奖励内容 || '—'}</div>
          </div>
          <div class="act">${isCur ? `<button class="btn sm c" data-qd="${q.id}">完成</button>` :
            isDone ? '<span class="tag g">已完成</span>' : '<span class="tag">未解锁</span>'}</div>
        </div>`;
      }).join('') || '<div class="empty">暂无任务</div>';
    },
    bind(p) {
      $$('[data-qd]').forEach((b) => b.onclick = () => {
        const q = CFG.questById(b.dataset.qd);
        p.quest.main++;
        (p.quest.done = p.quest.done || []).push(b.dataset.qd);
        // 发奖
        const rw = (q.reward || '');
        let stone = 80 + p.realm * 120 + Math.random() * 200;
        p.stone += Math.round(stone);
        const up = E.gainExp(p, EX.expPerMin(p.realm) * 40);
        // 主线关键节点给物品
        const key = { 'Q-X003': '储物袋', 'Q-X006': '降尘丹', 'Q-X009': '噬金虫卵' };
        if (key[q.id]) E.addItem(p, key[q.id], 1);
        UI.toast('完成任务【' + q.name + '】灵石+' + E.fmt(stone) + (up ? ' 修为提升' : ''), 'ok');
        if (q.chapter) UI.chat('【' + q.chapter + '】' + q.name + ' 已完成', true);
        UI.hud(); save(); UI.open('quest', UI.TAB.quest);
      });
    },
  },

  /* ---------- 4. 副本 ---------- */
  dungeon: {
    n: '副本秘境',
    render(p) {
      const list = CFG.core.dungeons || [];
      return list.map((d) => {
        const ok = true;
        return `<div class="item">
          <div class="ic">${d.type.indexOf('团') >= 0 ? '🏰' : d.type.indexOf('组队') >= 0 ? '👥' : d.type.indexOf('限时') >= 0 ? '⏳' : d.type.indexOf('交易') >= 0 ? '🏪' : '🚪'}</div>
          <div class="info">
            <div class="nm">${d.name} <span class="tag ${ok ? 'g' : 'r'}">${d.type}</span></div>
            <div class="sub">推荐：${d.lv} · ${d.people} · ${d.cd}</div>
            <div class="sub" style="color:var(--gold)">掉落：${d.drop}</div>
          </div>
          <div class="act"><button class="btn sm c" data-dg="${d.id}">进入</button></div>
        </div>`;
      }).join('') || '<div class="empty">暂无副本</div>';
    },
    bind(p) {
      $$('[data-dg]').forEach((b) => b.onclick = () => {
        const d = CFG.dungeonById(b.dataset.dg);
        UI.close();
        const bossName = (d.boss || '').split('→').pop() || '妖兽';
        const def = { name: bossName, type: 'BOSS', drop: d.drop };
        const mul = d.type.indexOf('团') >= 0 ? 2.6 : d.type.indexOf('组队') >= 0 ? 1.7 : 1.2;
        UI.toast('进入【' + d.name + '】', 'ok');
        BT.start(p, def, { mul });
        p.stats.dungeon = (p.stats.dungeon || 0) + 1;
      });
    },
  },

  /* ---------- 5. 洞府（含炼丹） ---------- */
  cave: {
    n: '洞府', tabs: ['设施', '灵田', '丹房'],
    render(p, tab) {
      if (tab === '灵田') return PANELS.cave.field(p);
      if (tab === '丹房') return PANELS.cave.alchemy(p);
      const lv = p.cave.lv || {};
      return EX.cave.map((c) => {
        const l = lv[c.k] || 1;
        const cost = Math.round(300 * Math.pow(2.2, l));
        return `<div class="item">
          <div class="ic">${c.icon}</div>
          <div class="info">
            <div class="nm">${c.n} <span class="tag y">Lv.${l}</span></div>
            <div class="sub">${c.desc}</div>
            <div class="sub" style="color:var(--gold)">升级需 ${E.fmt(cost)} 灵石</div>
          </div>
          <div class="act"><button class="btn sm ${p.stone >= cost ? 'c' : ''}" data-cu="${c.k}" ${p.stone < cost ? 'disabled' : ''}>升级</button></div>
        </div>`;
      }).join('');
    },
    field(p) {
      const seeds = CFG.core.items.filter((x) => x.type === '灵草');
      return `<div class="card"><div class="card-t">灵田 <span class="sub">离线也会生长</span></div>
        <div class="small" style="font-size:11px;color:var(--txt2)">选择灵草种子种植，成熟后可采收用于炼丹</div></div>
        <div class="grid g4">
        ${seeds.map((s) => `<div class="slot" data-sd="${s.name}" title="${s.name}">
          🌿<span class="nm2">${s.name.slice(0,4)}</span></div>`).join('') || '<div class="empty">暂无种子</div>'}
        </div>
        <div class="sec-t">已种植</div>
        ${(p.cave.seeds || []).length ? p.cave.seeds.map((s, i) => `
          <div class="item"><div class="ic">🌱</div>
          <div class="info"><div class="nm">${s.n}</div>
          <div class="sub">成熟进度 ${Math.min(100, Math.round((Date.now() - s.at) / 60000 / 5 * 100))}%</div></div>
          <div class="act"><button class="btn sm c" data-hv="${i}">采收</button></div></div>`).join('')
          : '<div class="empty">尚未种植，点击上方种子播种</div>'}`;
    },
    alchemy(p) {
      const pills = CFG.core.items.filter((x) => x.type === '丹药');
      return `<div class="card"><div class="card-t">炼丹 <span class="sub">丹房 Lv.${(p.cave.lv||{}).alchemy||1} · 成功率加成</span></div>
        <div class="small" style="font-size:11px;color:var(--txt2)">选择丹方，集齐材料后炼制。炼丹失败材料损失。</div></div>
        ${pills.map((d) => {
          const has = E.hasItem(p, d.name);
          return `<div class="item">
            <div class="ic">💊</div>
            <div class="info">
              <div class="nm">${d.name} <span class="tag y">${d.q}</span></div>
              <div class="sub">${d.eff}</div>
              <div class="sub">配方：${d.formula || '—'}</div>
            </div>
            <div class="act"><button class="btn sm ${has ? '' : 'c'}" data-al="${d.name}">${has ? '已有' : '炼制'}</button></div>
          </div>`;
        }).join('')}`;
    },
    bind(p) {
      $$('[data-cu]').forEach((b) => b.onclick = () => {
        const k = b.dataset.cu;
        const l = (p.cave.lv[k] || 1);
        const cost = Math.round(300 * Math.pow(2.2, l));
        if (p.stone < cost) return UI.toast('灵石不足', 'err');
        p.stone -= cost; p.cave.lv[k] = l + 1;
        UI.toast('【' + (EX.cave.find(c=>c.k===k)||{}).n + '】升级至 Lv.' + (l + 1), 'ok');
        UI.hud(); save(); UI.open('cave', UI.TAB.cave);
      });
      $$('[data-sd]').forEach((b) => b.onclick = () => {
        p.cave.seeds = p.cave.seeds || [];
        if (p.cave.seeds.length >= 6) return UI.toast('灵田已满', 'err');
        p.cave.seeds.push({ n: b.dataset.sd, at: Date.now() });
        UI.toast('已播种【' + b.dataset.sd + '】', 'ok'); save(); UI.open('cave', '灵田');
      });
      $$('[data-hv]').forEach((b) => b.onclick = () => {
        const s = p.cave.seeds.splice(+b.dataset.hv, 1)[0];
        if (s) { E.addItem(p, s.n, 1); UI.toast('采收【' + s.n + '】×1', 'ok'); }
        save(); UI.open('cave', '灵田');
      });
      $$('[data-al]').forEach((b) => b.onclick = () => {
        const n = b.dataset.al;
        const d = CFG.itemByName(n);
        // 简化：消耗灵草若干，成功率随丹房等级
        const herbs = (p.bag || []).filter((x) => x.type === '灵草');
        if (!herbs.length) return UI.toast('缺少灵草材料', 'err');
        herbs[0].cnt--; if (herbs[0].cnt <= 0) p.bag.splice(p.bag.indexOf(herbs[0]), 1);
        const rate = Math.min(0.92, 0.5 + ((p.cave.lv || {}).alchemy || 1) * 0.06);
        if (Math.random() < rate) { E.addItem(p, n, 1); UI.toast('炼制成功【' + n + '】×1', 'ok'); }
        else UI.toast('炼丹失败，材料损毁', 'err');
        save(); UI.open('cave', '丹房');
      });
    },
  },

  /* ---------- 6. 炼器 ---------- */
  forge: {
    n: '炼器',
    render(p) {
      const eqs = (CFG.core.skills || []).filter((x) => x.type === '装备' || x.type === '法宝');
      return `<div class="card"><div class="card-t">打造装备 <span class="sub">炼器房 Lv.${(p.cave.lv||{}).forge||1}</span></div>
        <div class="small" style="font-size:11px;color:var(--txt2)">消耗材料打造装备/法宝，品质越高属性越强</div></div>
        ${eqs.map((e) => `<div class="item">
          <div class="ic">${e.type === '法宝' ? '🔮' : '⚔️'}</div>
          <div class="info">
            <div class="nm">${e.name} <span class="tag y">${e.q}</span></div>
            <div class="sub">${e.eff}</div>
            <div class="sub">获取：${e.from}</div>
          </div>
          <div class="act"><button class="btn sm c" data-fg="${e.id}">打造</button></div>
        </div>`).join('')}
        <div class="sec-t">强化已装备</div>
        ${EX.slots.map((s) => {
          const it = p.equip[s.k];
          if (!it) return '';
          const cost = Math.round(120 * Math.pow(1.55, it.lv || 0));
          return `<div class="item"><div class="ic">${it.icon || s.icon}</div>
            <div class="info"><div class="nm">${it.n} <span class="tag y">+${it.lv || 0}</span></div>
            <div class="sub">强化需 ${E.fmt(cost)} 灵石</div></div>
            <div class="act"><button class="btn sm ${p.stone >= cost ? 'p' : ''}" data-up="${s.k}" ${p.stone < cost ? 'disabled' : ''}>强化</button></div></div>`;
        }).join('') || '<div class="empty">尚未装备</div>'}`;
    },
    bind(p) {
      $$('[data-fg]').forEach((b) => b.onclick = () => {
        const e = CFG.skillById(b.dataset.fg);
        const mats = (p.bag || []).filter((x) => x.type === '材料');
        if (!mats.length) return UI.toast('缺少材料', 'err');
        mats[0].cnt--; if (mats[0].cnt <= 0) p.bag.splice(p.bag.indexOf(mats[0]), 1);
        const qi = EX.qIndex(e.q);
        const mul = EX.qualities[qi].mul;
        const slot = e.type === '法宝' ? 'treasure' : 'weapon';
        E.addItem(p, e.name, 1, {
          type: e.type, q: e.q, slot,
          atk: Math.round(60 * mul * EX.realmMul(p.realm) * 0.3),
          def: Math.round(30 * mul * EX.realmMul(p.realm) * 0.3),
          hp: Math.round(300 * mul * EX.realmMul(p.realm) * 0.3),
        });
        UI.toast('打造成功【' + e.name + '】', 'ok');
        save(); UI.open('forge');
      });
      $$('[data-up]').forEach((b) => b.onclick = () => {
        const it = p.equip[b.dataset.up];
        const cost = Math.round(120 * Math.pow(1.55, it.lv || 0));
        if (p.stone < cost) return UI.toast('灵石不足', 'err');
        p.stone -= cost; it.lv = (it.lv || 0) + 1;
        UI.toast('强化成功【' + it.n + '】+' + it.lv, 'ok');
        UI.hud(); save(); UI.open('forge');
      });
    },
  },

  /* ---------- 7. 功法 ---------- */
  skill: {
    n: '功法', tabs: ['已学功法', '神通装配', '功法库'],
    render(p, tab) {
      if (tab === '神通装配') return PANELS.skill.slots(p);
      if (tab === '功法库') return PANELS.skill.lib(p);
      const list = (p.skills || []).map((id) => CFG.skillById(id)).filter(Boolean);
      return `<div class="card"><div class="card-t">已学功法 <span class="sub">功法影响战力核心</span></div></div>
        ${list.map((s) => `<div class="item">
          <div class="ic">📕</div>
          <div class="info"><div class="nm">${s.name} <span class="tag y">${s.q}</span> <span class="tag b">${s.type}</span></div>
          <div class="sub">${s.eff}</div></div></div>`).join('') || '<div class="empty">尚未学习功法</div>'}
        <div class="sec-t">可学习（消耗灵石）</div>
        ${(CFG.core.skills || []).filter((s) => !(p.skills || []).includes(s.id)).map((s) => {
          const cost = Math.round(800 * (EX.qIndex(s.q) + 1) * EX.realmMul(p.realm) * 0.2);
          return `<div class="item"><div class="ic">📕</div>
            <div class="info"><div class="nm">${s.name} <span class="tag y">${s.q}</span></div>
            <div class="sub">${s.eff}</div>
            <div class="sub" style="color:var(--gold)">${E.fmt(cost)} 灵石 · ${s.from}</div></div>
            <div class="act"><button class="btn sm ${p.stone >= cost ? 'c' : ''}" data-ls="${s.id}" ${p.stone < cost ? 'disabled' : ''}>学习</button></div></div>`;
        }).join('')}`;
    },
    slots(p) {
      return `<div class="card"><div class="card-t">神通装配 <span class="sub">战斗中按 1-4 释放</span></div>
        <div class="small" style="font-size:11px;color:var(--txt2)">五行：金克木克土克水克火，克制伤害 +35%</div></div>
        ${[0,1,2,3].map((i) => {
          const id = p.equipped[i];
          const sk = id ? EX.skills.find((x) => x.id === id) : null;
          return `<div class="item">
            <div class="ic" style="color:${sk ? EX.wuxingColor[sk.w] : '#666'}">${sk ? sk.w : (i+1)}</div>
            <div class="info"><div class="nm">${sk ? sk.n : '空槽位 ' + (i+1)}</div>
            <div class="sub">${sk ? `${sk.desc} · 耗${sk.cost}灵力 · CD${sk.cd}s` : '点击右侧装配'}</div></div>
            <div class="act">${sk ? `<button class="btn sm d" data-us="${i}">卸下</button>` : ''}</div>
          </div>`;
        }).join('')}
        <div class="sec-t">可用神通</div>
        ${EX.skills.filter((s) => (p.skills || []).includes(s.id) ||
            ['S1'].includes(s.id)).map((s) => `<div class="item">
          <div class="ic" style="color:${EX.wuxingColor[s.w]}">${s.w}</div>
          <div class="info"><div class="nm">${s.n} <span class="tag b">${s.w}属性</span></div>
          <div class="sub">${s.desc} · 倍率${s.mul}</div></div>
          <div class="act"><button class="btn sm c" data-es="${s.id}">装配</button></div></div>`).join('')}`;
    },
    lib(p) {
      return (CFG.core.skills || []).map((s) => `<div class="item">
        <div class="ic">${s.type === '剑诀' || s.type === '剑阵' ? '🗡️' : s.type === '遁术' ? '💨' : '📕'}</div>
        <div class="info"><div class="nm">${s.name} <span class="tag y">${s.q}</span> <span class="tag b">${s.type}</span></div>
        <div class="sub">${s.eff}</div>
        <div class="sub">获取：${s.from} ${s.up ? '· 进阶:' + s.up : ''}</div></div></div>`).join('');
    },
    bind(p) {
      $$('[data-ls]').forEach((b) => b.onclick = () => {
        const s = CFG.skillById(b.dataset.ls);
        const cost = Math.round(800 * (EX.qIndex(s.q) + 1) * EX.realmMul(p.realm) * 0.2);
        if (p.stone < cost) return;
        p.stone -= cost;
        (p.skills = p.skills || []).push(s.id);
        if (!p.equipped[0]) p.equipped[0] = 'S1';
        UI.toast('学会功法【' + s.name + '】', 'ok');
        UI.hud(); save(); UI.open('skill', UI.TAB.skill);
      });
      $$('[data-es]').forEach((b) => b.onclick = () => {
        const id = b.dataset.es;
        const i = p.equipped.indexOf(null);
        if (i < 0) return UI.toast('技能栏已满，请先卸下', 'err');
        p.equipped[i] = id;
        UI.toast('已装配【' + (EX.skills.find(x=>x.id===id)||{}).n + '】到槽位 ' + (i+1), 'ok');
        save(); UI.open('skill', '神通装配');
      });
      $$('[data-us]').forEach((b) => b.onclick = () => {
        p.equipped[+b.dataset.us] = null;
        UI.toast('已卸下', 'ok'); save(); UI.open('skill', '神通装配');
      });
    },
  },

  /* ---------- 8. 背包 ---------- */
  bag: {
    n: '背包', tabs: ['全部', '丹药', '材料', '灵草', '装备'],
    render(p, tab) {
      let list = p.bag || [];
      if (tab && tab !== '全部') list = list.filter((x) => x.type === tab);
      if (!list.length) return '<div class="empty"><div class="ic">🎒</div>背包空空如也</div>';
      return `<div class="card"><div class="card-t">背包 <span class="sub">${list.length} / 120</span></div></div>
        <div class="grid g5">
        ${list.map((it, i) => {
          const qi = EX.qIndex(it.q);
          return `<div class="slot q${qi}" data-bi="${(p.bag).indexOf(it)}">
            ${it.icon || E.iconFor(it.type)}
            ${it.lv ? `<span class="lv">+${it.lv}</span>` : ''}
            ${(it.cnt || 1) > 1 ? `<span class="cnt">${it.cnt}</span>` : ''}
            <span class="nm2">${(it.n || '').slice(0, 4)}</span></div>`;
        }).join('')}
        </div>
        <div class="sec-t">物品详情</div>
        <div id="bagDetail"><div class="empty" style="padding:16px">点击物品查看</div></div>`;
    },
    bind(p) {
      $$('[data-bi]').forEach((b) => b.onclick = () => {
        const it = p.bag[+b.dataset.bi]; if (!it) return;
        const qi = EX.qIndex(it.q);
        const canUse = it.type === '丹药';
        $('#bagDetail').innerHTML = `<div class="card">
          <div class="card-t" style="color:${EX.qualities[qi].c}">${it.n} <span class="sub">${it.q} · ${it.type}</span></div>
          <div class="kv"><span>数量</span><b>${it.cnt || 1}</b></div>
          ${it.atk ? `<div class="kv"><span>攻击</span><b>+${it.atk}</b></div>` : ''}
          ${it.def ? `<div class="kv"><span>防御</span><b>+${it.def}</b></div>` : ''}
          ${it.hp ? `<div class="kv"><span>气血</span><b>+${it.hp}</b></div>` : ''}
          ${it.slot ? `<div class="kv"><span>部位</span><b>${(EX.slots.find(s=>s.k===it.slot)||{}).n || it.slot}</b></div>` : ''}
          <div class="kv"><span>说明</span><b>${(CFG.itemByName(it.n) || {}).eff || '—'}</b></div>
          <div class="row" style="display:flex;gap:8px;margin-top:10px">
            ${canUse ? `<button class="btn c" style="flex:1" data-use="${(p.bag).indexOf(it)}">使用</button>` : ''}
            ${it.slot ? `<button class="btn p" style="flex:1" data-eqn="${(p.bag).indexOf(it)}">装备</button>` : ''}
          </div></div>`;
        $$('[data-use]').forEach((x) => x.onclick = () => {
          const idx = +x.dataset.use; const it2 = p.bag[idx];
          // 丹药效果
          const d = CFG.itemByName(it2.n);
          if (d && (d.eff || '').indexOf('气血') >= 0) p.hp = E.maxHp(p);
          else { const up = E.gainExp(p, EX.expPerMin(p.realm) * 30); UI.toast(up ? '修为提升' : '服用成功', 'ok'); }
          if ((d.eff||'').indexOf('气血') >= 0) UI.toast('气血已回满', 'ok');
          E.useItem(p, it2.n, 1); UI.hud(); save(); UI.open('bag', UI.TAB.bag);
        });
        $$('[data-eqn]').forEach((x) => x.onclick = () => {
          const r = E.equipItem(p, +x.dataset.eqn);
          UI.toast(r.msg, r.ok ? 'ok' : 'err'); UI.hud(); save(); UI.open('bag', UI.TAB.bag);
        });
      });
    },
  },

  /* ---------- 9. 灵宠 ---------- */
  pet: {
    n: '灵宠',
    render(p) {
      const owned = p.pets || [];
      return `<div class="card"><div class="card-t">出战灵宠 <span class="sub">${p.petOut ? (owned.find(x=>x.id===p.petOut)||{}).n : '无'}</span></div>
        <div class="small" style="font-size:11px;color:var(--txt2)">灵宠助战提供攻击与气血加成，战斗中可释放虫潮</div></div>
        ${owned.map((pet) => `<div class="item ${p.petOut === pet.id ? 'on' : ''}">
          <div class="ic">${pet.type === '灵虫' ? '🐛' : '🐾'}</div>
          <div class="info">
            <div class="nm">${pet.n} <span class="tag y">Lv.${pet.lv || 1}</span> ${pet.evo ? '<span class="tag p">' + pet.evo + '</span>' : ''}</div>
            <div class="sub">${(CFG.petById(pet.id) || {}).skill || ''}</div>
          </div>
          <div class="act">
            <button class="btn sm c" data-po="${pet.id}">${p.petOut === pet.id ? '出战中' : '出战'}</button>
            <button class="btn sm" data-pf="${pet.id}">喂养</button>
          </div></div>`).join('') || '<div class="empty"><div class="ic">🐾</div>尚无灵宠</div>'}
        <div class="sec-t">可获取灵宠</div>
        ${(CFG.core.pets || []).filter((x) => x.type === '灵宠' || x.type === '灵虫').map((x) => `
          <div class="item"><div class="ic">${x.type === '灵虫' ? '🐛' : '🐾'}</div>
          <div class="info"><div class="nm">${x.name} <span class="tag y">${x.q}</span></div>
          <div class="sub">${x.skill || ''} · ${x.from || ''}</div></div>
          <div class="act"><button class="btn sm c" data-pg="${x.id}">获取</button></div></div>`).join('')}`;
    },
    bind(p) {
      $$('[data-pg]').forEach((b) => b.onclick = () => {
        const d = CFG.petById(b.dataset.pg);
        if ((p.pets || []).some((x) => x.id === d.id)) return UI.toast('已有该灵宠', 'err');
        p.pets = p.pets || [];
        p.pets.push({ id: d.id, n: d.name, lv: 1, type: d.type, evo: '' });
        if (!p.petOut) p.petOut = d.id;
        UI.toast('获得灵宠【' + d.name + '】', 'ok');
        UI.hud(); save(); UI.open('pet');
      });
      $$('[data-po]').forEach((b) => b.onclick = () => {
        p.petOut = b.dataset.po; UI.toast('已设置出战', 'ok'); save(); UI.open('pet');
      });
      $$('[data-pf]').forEach((b) => b.onclick = () => {
        const pet = (p.pets || []).find((x) => x.id === b.dataset.pf);
        const cost = Math.round(100 * (pet.lv || 1) * 1.4);
        if (p.stone < cost) return UI.toast('灵石不足（需' + E.fmt(cost) + '）', 'err');
        p.stone -= cost; pet.lv = (pet.lv || 1) + 1;
        // 进化：噬金虫 10级成虫王
        if (pet.n.indexOf('噬金虫') >= 0 && pet.lv >= 10 && pet.evo !== '虫王') {
          pet.evo = '虫王'; pet.n = '噬金虫王';
          if (!(p.titles || []).includes('T08')) (p.titles = p.titles || []).push('T08');
          UI.toast('进化成功！【噬金虫王】 解锁称号【虫王统御】', 'ok');
        } else UI.toast('喂养成功，等级提升至 Lv.' + pet.lv, 'ok');
        UI.hud(); save(); UI.open('pet');
      });
    },
  },

  /* ---------- 10. 傀儡 ---------- */
  puppet: {
    n: '傀儡',
    render(p) {
      const owned = p.puppets || [];
      return `<div class="card"><div class="card-t">出战傀儡 <span class="sub">${p.puppetOut ? (owned.find(x=>x.id===p.puppetOut)||{}).n : '无'}</span></div>
        <div class="small" style="font-size:11px;color:var(--txt2)">傀儡独立参战，有耐久，战斗后需修复</div></div>
        ${owned.map((k) => `<div class="item ${p.puppetOut === k.id ? 'on' : ''}">
          <div class="ic">🗿</div>
          <div class="info"><div class="nm">${k.n} <span class="tag y">Lv.${k.lv || 1}</span></div>
          <div class="sub">耐久 ${k.dur || 100}%</div></div>
          <div class="act">
            <button class="btn sm c" data-ko="${k.id}">${p.puppetOut === k.id ? '出战中' : '出战'}</button>
            <button class="btn sm" data-kr="${k.id}">修复</button>
          </div></div>`).join('') || '<div class="empty"><div class="ic">🗿</div>尚无傀儡</div>'}
        <div class="sec-t">可炼制</div>
        ${(CFG.core.pets || []).filter((x) => x.type === '傀儡').map((x) => `
          <div class="item"><div class="ic">🗿</div>
          <div class="info"><div class="nm">${x.name} <span class="tag y">${x.q}</span></div>
          <div class="sub">${x.skill || ''} · ${x.from || ''}</div></div>
          <div class="act"><button class="btn sm c" data-kg="${x.id}">炼制</button></div></div>`).join('')}`;
    },
    bind(p) {
      $$('[data-kg]').forEach((b) => b.onclick = () => {
        const d = CFG.petById(b.dataset.kg);
        if ((p.puppets || []).some((x) => x.id === d.id)) return UI.toast('已有该傀儡', 'err');
        p.puppets = p.puppets || [];
        p.puppets.push({ id: d.id, n: d.name, lv: 1, dur: 100 });
        if (!p.puppetOut) p.puppetOut = d.id;
        UI.toast('炼制成功【' + d.name + '】', 'ok');
        UI.hud(); save(); UI.open('puppet');
      });
      $$('[data-ko]').forEach((b) => b.onclick = () => { p.puppetOut = b.dataset.ko; UI.toast('已设置出战', 'ok'); save(); UI.open('puppet'); });
      $$('[data-kr]').forEach((b) => b.onclick = () => {
        const k = (p.puppets || []).find((x) => x.id === b.dataset.kr);
        const cost = 200;
        if (p.stone < cost) return UI.toast('灵石不足', 'err');
        p.stone -= cost; k.dur = 100; k.lv = (k.lv || 1) + 1;
        UI.toast('修复完成，等级提升至 Lv.' + k.lv, 'ok'); save(); UI.open('puppet');
      });
    },
  },

  /* ---------- 11. 伙伴 ---------- */
  partner: {
    n: '伙伴仙缘',
    render(p) {
      const owned = p.partners || [];
      return `<div class="card"><div class="card-t">伙伴 <span class="sub">${owned.length} 位</span></div>
        <div class="small" style="font-size:11px;color:var(--txt2)">结识伙伴激活羁绊，上阵助战</div></div>
        ${owned.map((x) => `<div class="item">
          <div class="ic">${(x.q === 'SSR' ? '🌟' : x.q === 'SR' ? '⭐' : '✨')}</div>
          <div class="info"><div class="nm">${x.n} <span class="tag ${x.q==='SSR'?'y':x.q==='SR'?'p':'b'}">${x.q}</span> <span class="tag">${x.star || 1}星</span></div>
          <div class="sub">${(CFG.partnerById(x.id) || {}).skill || ''}</div></div>
          <div class="act"><button class="btn sm c" data-ps="${x.id}">升星</button></div></div>`).join('') || '<div class="empty"><div class="ic">👥</div>尚未结识伙伴</div>'}
        <div class="sec-t">可结识</div>
        ${(CFG.core.partners || []).filter((x) => ['伙伴', '主角'].indexOf(x.type) >= 0).map((x) => `
          <div class="item"><div class="ic">${x.q === 'SSR' ? '🌟' : x.q === 'SR' ? '⭐' : '✨'}</div>
          <div class="info"><div class="nm">${x.name} <span class="tag ${x.q==='SSR'?'y':x.q==='SR'?'p':'b'}">${x.q}</span></div>
          <div class="sub">${x.skill || ''} · ${x.from || ''}</div>
          ${x.bond && x.bond !== '—' ? `<div class="sub" style="color:var(--purple)">羁绊：${x.bond}</div>` : ''}</div>
          <div class="act"><button class="btn sm c" data-pa="${x.id}">结识</button></div></div>`).join('')}`;
    },
    bind(p) {
      $$('[data-pa]').forEach((b) => b.onclick = () => {
        const d = CFG.partnerById(b.dataset.pa);
        if ((p.partners || []).some((x) => x.id === d.id)) return UI.toast('已结识', 'err');
        const cost = d.q === 'SSR' ? 8000 : d.q === 'SR' ? 3000 : 800;
        if (p.stone < cost) return UI.toast('灵石不足（需' + E.fmt(cost) + '）', 'err');
        p.stone -= cost;
        p.partners = p.partners || [];
        p.partners.push({ id: d.id, n: d.name, q: d.q, star: 1 });
        UI.toast('结识伙伴【' + d.name + '】', 'ok');
        UI.hud(); save(); UI.open('partner');
      });
      $$('[data-ps]').forEach((b) => b.onclick = () => {
        const x = (p.partners || []).find((y) => y.id === b.dataset.ps);
        const cost = 1000 * (x.star || 1);
        if (p.stone < cost) return UI.toast('灵石不足', 'err');
        p.stone -= cost; x.star = (x.star || 1) + 1;
        UI.toast('【' + x.n + '】升至 ' + x.star + ' 星', 'ok'); save(); UI.open('partner');
      });
    },
  },

  /* ---------- 12. 坊市 ---------- */
  shop: {
    n: '坊市', tabs: ['商店', '悬赏榜', '拍卖'],
    render(p, tab) {
      if (tab === '悬赏榜') return PANELS.shop.bounty(p);
      if (tab === '拍卖') return '<div class="empty"><div class="ic">🔨</div>拍卖行暂未开启</div>';
      const goods = (CFG.core.items || []).filter((x) => ['丹药', '材料', '灵草', '符箓', '法宝'].indexOf(x.type) >= 0);
      return `<div class="card"><div class="card-t">魁星岛坊市 <span class="sub">灵石 ${E.fmt(p.stone)}</span></div></div>
        ${goods.map((g) => {
          const price = parseInt(String(g.price || '0').replace(/[^\d]/g, '')) || 100;
          return `<div class="item"><div class="ic">${E.iconFor(g.type)}</div>
            <div class="info"><div class="nm">${g.name} <span class="tag y">${g.q}</span></div>
            <div class="sub">${g.eff || ''}</div>
            <div class="sub" style="color:var(--gold)">${E.fmt(price)} 灵石</div></div>
            <div class="act"><button class="btn sm ${p.stone >= price ? 'c' : ''}" data-buy="${g.id}" ${p.stone < price ? 'disabled' : ''}>购买</button></div></div>`;
        }).join('')}`;
    },
    bounty(p) {
      const bs = CFG.bountyQuests();
      return `<div class="card"><div class="card-t">悬赏榜 <span class="sub">每日/每周刷新</span></div></div>
        ${bs.map((b) => `<div class="item">
          <div class="ic">📜</div>
          <div class="info"><div class="nm">${b.name}</div>
          <div class="sub">目标：${b.goal}</div>
          <div class="sub" style="color:var(--gold)">奖励：${b.reward}</div></div>
          <div class="act"><button class="btn sm c" data-bt="${b.id}">接取</button></div></div>`).join('')}`;
    },
    bind(p) {
      $$('[data-buy]').forEach((b) => b.onclick = () => {
        const g = CFG.itemById(b.dataset.buy);
        const price = parseInt(String(g.price || '0').replace(/[^\d]/g, '')) || 100;
        if (p.stone < price) return;
        p.stone -= price; E.addItem(p, g.name, 1);
        UI.toast('购买【' + g.name + '】', 'ok'); UI.hud(); save(); UI.open('shop', UI.TAB.shop);
      });
      $$('[data-bt]').forEach((b) => b.onclick = () => {
        const q = CFG.questById(b.dataset.bt);
        UI.close();
        UI.toast('接取悬赏【' + q.name + '】', 'ok');
        BT.start(p, { name: (q.goal || '').replace(/[^\u4e00-\u9fa5]/g, '').slice(0, 4) || '海兽', type: '悬赏' }, { mul: 1.3 });
      });
    },
  },

  /* ---------- 13. 仙盟 ---------- */
  sect: {
    n: '仙盟',
    render(p) {
      if (p.sect) {
        return `<div class="card"><div class="card-t">我的仙盟 <span class="sub">${p.sect.n}</span></div>
          <div class="kv"><span>职位</span><b>${p.sect.rank || '弟子'}</b></div>
          <div class="kv"><span>贡献</span><b>${E.fmt(p.sect.contrib || 0)}</b></div>
          <div class="kv"><span>等级</span><b>Lv.${p.sect.lv || 1}</b></div></div>
          <button class="btn c" style="width:100%;margin-bottom:10px" id="btnDonate">捐献灵石（+贡献）</button>
          <div class="sec-t">仙盟设施</div>
          ${(CFG.core.partners || []).filter((x) => x.type === '设施' || x.type === '玩法').map((x) => `
            <div class="item"><div class="ic">🏯</div>
            <div class="info"><div class="nm">${x.name}</div><div class="sub">${x.skill || ''}</div></div></div>`).join('')}`;
      }
      const list = (CFG.core.partners || []).filter((x) => x.type === '仙盟');
      return `<div class="card"><div class="card-t">创建/加入仙盟 <span class="sub">结丹期 + 灵石</span></div>
        <div class="small" style="font-size:11px;color:var(--txt2)">仙盟系统结丹期开放（当前：${CFG.realmName(p.realm)}）</div></div>
        <button class="btn p" style="width:100%;margin-bottom:10px" id="btnCreateSect">创建仙盟（5000灵石）</button>
        <div class="sec-t">仙盟玩法</div>
        ${list.map((x) => `<div class="item"><div class="ic">🏯</div>
          <div class="info"><div class="nm">${x.name}</div><div class="sub">${x.skill || ''} · ${x.from || ''}</div></div></div>`).join('')}`;
    },
    bind(p) {
      const c = $('#btnCreateSect');
      if (c) c.onclick = () => {
        if (p.realm < 5) return UI.toast('需结丹期方可创建仙盟', 'err');
        if (p.stone < 5000) return UI.toast('灵石不足', 'err');
        p.stone -= 5000;
        p.sect = { n: p.name + '仙盟', rank: '盟主', contrib: 0, lv: 1 };
        UI.toast('创建仙盟成功！', 'ok'); UI.hud(); save(); UI.open('sect');
      };
      const d = $('#btnDonate');
      if (d) d.onclick = () => {
        if (p.stone < 500) return UI.toast('灵石不足', 'err');
        p.stone -= 500; p.sect.contrib = (p.sect.contrib || 0) + 50;
        UI.toast('捐献成功，贡献+50', 'ok'); UI.hud(); save(); UI.open('sect');
      };
    },
  },

  /* ---------- 14. 图鉴 ---------- */
  codex: {
    n: '图鉴', tabs: ['怪物', '法宝', '功法', '人物', '丹药', '灵宠'],
    render(p, tab) {
      const m = { '怪物': CFG.core.monsters, '法宝': (CFG.core.skills||[]).filter(x=>x.type==='法宝'),
        '功法': (CFG.core.skills||[]).filter(x=>['主修功法','剑诀','神识功法','入门心法','遁术','神魂功法','剑阵'].indexOf(x.type)>=0),
        '人物': CFG.core.partners, '丹药': (CFG.core.items||[]).filter(x=>x.type==='丹药'),
        '灵宠': CFG.core.pets };
      const list = m[tab] || [];
      if (!list.length) return '<div class="empty">暂无数据</div>';
      return `<div class="card"><div class="card-t">${tab}图鉴 <span class="sub">${list.length} 条</span></div>
        <div class="small" style="font-size:11px;color:var(--txt2)">首次击杀/获得/遇到即解锁，解锁获灵石奖励</div></div>
        ${list.map((x) => `<div class="item">
          <div class="ic">${tab==='怪物'?BT.iconFor(x.name):tab==='丹药'?'💊':tab==='灵宠'?'🐾':tab==='人物'?'👤':tab==='功法'?'📕':'🔮'}</div>
          <div class="info"><div class="nm">${x.name} ${x.q?`<span class="tag y">${x.q}</span>`:''} ${x.type?`<span class="tag b">${x.type}</span>`:''}</div>
          <div class="sub">${x.eff || x.skill || x.attr || x.drop || x.from || x.desc || ''}</div></div></div>`).join('')}`;
    },
  },

  /* ---------- 15. 排行 ---------- */
  rank: {
    n: '排行榜',
    render(p) {
      return `<div class="bignum"><div class="v">${E.fmt(E.power(p))}</div><div class="l">我的战力</div></div>
        <div class="card"><div class="card-t">战力榜 <span class="sub">每 10 分钟刷新</span></div>
        <div id="rankList"><div class="empty" style="padding:20px">加载中…</div></div></div>`;
    },
    bind(p) {
      const el = $('#rankList'); if (!el) return;
      Net.read('data/ss/leaderboard.json').then((r) => {
        const list = (r && r.data && r.data.list) || [];
        if (!list.length) { el.innerHTML = '<div class="empty" style="padding:20px">暂无榜单数据（需 GitHub Actions 汇总）</div>'; return; }
        list.sort((a, b) => (b.power || 0) - (a.power || 0));
        el.innerHTML = list.slice(0, 20).map((x, i) => `
          <div class="item ${x.uid === p.uid ? 'on' : ''}">
            <div class="ic" style="color:${i<3?'var(--gold)':'var(--txt3)'};font-weight:800">${i+1}</div>
            <div class="info"><div class="nm">${x.name}</div>
            <div class="sub">${x.realm || ''} · 战力 ${E.fmt(x.power || 0)}</div></div></div>`).join('');
      });
    },
  },

  /* ---------- 16. 活动 ---------- */
  act: {
    n: '活动',
    render(p) {
      const today = new Date().toISOString().slice(0, 10);
      const signed = (p.signDate === today);
      return `<div class="card">
        <div class="card-t">每日签到</div>
        <div class="kv"><span>今日状态</span><b style="color:${signed ? '#ff8fa4' : '#7ae89a'}">${signed ? '已签到' : '可签到'}</b></div>
        <div class="kv"><span>连续签到</span><b>${p.signStreak || 0} 天</b></div>
        <button class="btn p" style="width:100%;margin-top:8px" id="btnSign" ${signed ? 'disabled' : ''}>
          ${signed ? '✔ 今日已签到' : '📅 签到领奖'}</button>
        <div class="small" style="font-size:10.5px;color:var(--txt3);margin-top:6px">每天仅可签到一次，连续签到奖励递增</div>
      </div>
      <div class="sec-t">活动列表</div>
      ${[['星海猎妖', '限时', '击杀指定海兽获取额外奖励'], ['跨服论道', '跨服', '与其他玩家切磋'],
         ['开服庆典', '开服', '登录领取丰厚奖励'], ['虚天探秘', '限时', '虚天殿限时开放']]
        .map(([n, t, d]) => `<div class="item"><div class="ic">🎪</div>
          <div class="info"><div class="nm">${n} <span class="tag y">${t}</span></div>
          <div class="sub">${d}</div></div>
          <div class="act"><button class="btn sm c" data-ac="${n}">参与</button></div></div>`).join('')}`;
    },
    bind(p) {
      const b = $('#btnSign');
      if (b) b.onclick = () => {
        const today = new Date().toISOString().slice(0, 10);
        if (p.signDate === today) return UI.toast('今日已签到', 'err');
        // 连续判定
        const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        p.signStreak = (p.signDate === y) ? (p.signStreak || 0) + 1 : 1;
        p.signDate = today;
        const rw = Math.round(200 * p.signStreak + EX.realmMul(p.realm) * 50);
        p.stone += rw;
        if (p.signStreak % 7 === 0) { p.jade = (p.jade || 0) + 5; UI.toast('连续7天！额外奖励 仙玉×5', 'ok'); }
        UI.toast('签到成功（连续' + p.signStreak + '天）灵石+' + E.fmt(rw), 'ok');
        UI.hud(); save(); UI.open('act');
      };
      $$('[data-ac]').forEach((b) => b.onclick = () => UI.toast('活动即将开放', 'ok'));
    },
  },

  /* ---------- 17. 设置 ---------- */
  set: {
    n: '设置',
    render(p) {
      return `<div class="card">
        <div class="card-t">账号</div>
        <div class="kv"><span>道号</span><b>${p.name}</b></div>
        <div class="kv"><span>UID</span><b>${p.uid}</b></div>
        <div class="kv"><span>注册时间</span><b>${new Date(p.createdAt).toLocaleDateString()}</b></div>
      </div>
      <div class="card">
        <div class="card-t">网络 <span class="sub">GitHub 云端存档</span></div>
        <div class="kv"><span>状态</span><b style="color:${Net.online ? '#7ae89a' : '#ff8fa4'}">${Net.online ? '● 已连接' : '○ 离线模式'}</b></div>
        <div class="kv"><span>端点</span><b style="font-size:11px">${Net.endpoint.replace('https://', '')}</b></div>
        <div class="kv"><span>待上传</span><b>${Net.queueLen} 条</b></div>
        <button class="btn" style="width:100%;margin-top:8px" id="btnReNet">重新检测网络</button>
        <button class="btn" style="width:100%;margin-top:6px" id="btnFlush">立即补传存档</button>
      </div>
      <div class="card">
        <div class="card-t">加速地址 <span class="sub">国内访问不畅时使用</span></div>
        <input class="lg-inp" id="inpEp" placeholder="https://xxx.workers.dev" value="${(GH.extra[0] || '')}">
        <button class="btn c" style="width:100%;margin-top:8px" id="btnSaveEp">保存加速地址</button>
      </div>
      <div class="card">
        <div class="card-t">操作</div>
        <button class="btn d" style="width:100%" id="btnLogout">退出登录</button>
      </div>`;
    },
    bind(p) {
      const r = $('#btnReNet');
      if (r) r.onclick = async () => {
        UI.toast('检测中…'); await Net.reset();
        UI.toast(Net.online ? '已连接：' + Net.endpoint.replace('https://', '') : '无法连接，将使用离线模式', Net.online ? 'ok' : 'err');
        UI.open('set');
      };
      const f = $('#btnFlush');
      if (f) f.onclick = async () => {
        const n = await Net.flush();
        UI.toast(n ? '已补传 ' + n + ' 条' : '无待上传数据', n ? 'ok' : 'err');
        UI.open('set');
      };
      const s = $('#btnSaveEp');
      if (s) s.onclick = () => {
        const v = ($('#inpEp').value || '').trim();
        GH.extra = v ? [v] : [];
        localStorage.setItem('ss_ep', v);
        UI.toast(v ? '已保存，重新检测后生效' : '已清除', 'ok');
        Net.reset();
      };
      const l = $('#btnLogout');
      if (l) l.onclick = () => { localStorage.removeItem('ss_session'); location.reload(); };
    },
  },

  /* ---------- 18. 地图 ---------- */
  map: {
    n: '乱星海',
    render(p) {
      return `<div class="card"><div class="card-t">当前所在 <span class="sub">${(EX.maps.find(m=>m.id===p.map)||{}).n || '小寰岛'}</span></div>
        <div class="small" style="font-size:11px;color:var(--txt2)">传送至其他地域，不同地域妖兽与掉落不同</div></div>
        ${EX.maps.map((m) => {
          const ok = p.realm >= m.realm;
          return `<div class="item ${p.map === m.id ? 'on' : ''}" style="${ok ? '' : 'opacity:.5'}">
            <div class="ic">${m.icon}</div>
            <div class="info"><div class="nm">${m.n} ${ok ? '' : '<span class="tag r">需' + CFG.realmName(m.realm) + '</span>'}</div>
            <div class="sub">${m.desc}</div></div>
            <div class="act">${ok ? `<button class="btn sm ${p.map===m.id?'':'c'}" data-mp="${m.id}">${p.map===m.id?'当前':'传送'}</button>` : ''}</div></div>`;
        }).join('')}`;
    },
    bind(p) {
      $$('[data-mp]').forEach((b) => b.onclick = () => {
        p.map = b.dataset.mp;
        UI.setScene(p.map);
        UI.toast('已传送至【' + (EX.maps.find(m=>m.id===p.map)||{}).n + '】', 'ok');
        save(); UI.open('map');
      });
    },
  },

  /* ---------- 19. 玩法指南（22表） ---------- */
  guide: {
    n: '玩法指南',
    render(p, tab) {
      const list = (CFG.meta.guides || []);
      return list.map((g) => `<div class="card">
        <div class="card-t">${g.sys}</div>
        <div class="kv"><span>说明</span><b style="font-size:11.5px">${g.desc}</b></div>
        <div class="kv"><span>入口</span><b style="font-size:11.5px">${g.entry}</b></div>
        <div style="font-size:11.5px;color:var(--txt2);line-height:1.8;margin-top:8px">${g.steps}</div>
        ${g.tip ? `<div style="font-size:11px;color:var(--gold);margin-top:6px">⚠ ${g.tip}</div>` : ''}
      </div>`).join('') || '<div class="empty">暂无</div>';
    },
  },
};

window.UI = UI;
window.PANELS = PANELS;
window.$ = $;
window.$$ = $$;
