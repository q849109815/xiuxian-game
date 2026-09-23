/* =========================================================
 * ui.js —— 界面层
 * 依据资料 07 模块关系表（16 界面）/ 08 跳转流程
 * ========================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const UI = {
  P: null, curPanel: null, curTab: {}, selChipSlot: 'c1', selChipId: null, curChapter: 1,

  show(id) {
    $$('.screen').forEach((s) => s.classList.remove('on'));
    const el = document.getElementById(id); if (el) el.classList.add('on');
  },
  toast(msg, cls) {
    const box = $('#toasts'); if (!box) return;
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || ''); d.innerHTML = msg;
    box.appendChild(d); setTimeout(() => d.remove(), cls === 'boss' ? 2600 : 2000);
    while (box.children.length > 4 && box.firstElementChild) box.firstElementChild.remove();
  },

  /* ================= 基地主界面 ================= */
  home() {
    const p = this.P; if (!p) return;
    $('#hmName').textContent = p.name;
    $('#hmLv').textContent = 'Lv.' + (p.lv || 1);
    $('#hmPower').textContent = E.fmt(E.power(p));
    $('#cuGold').textContent = E.fmt(p.gold);
    $('#cuDia').textContent = E.fmt(p.diamond);
    const lv = Math.min(E.maxLevel(), p.level || 1);
    $('#hmLevel').textContent = E.levelName(lv);
    $('#hmLevelName').textContent = E.levelName(lv);
    $('#hmEndBest').textContent = '最佳 ' + (p.endlessBest || 0) + ' 层';
    const avEl = $('#hmAvIco');
    if (p.avatarImg) {
      avEl.style.backgroundImage = 'url(' + p.avatarImg + ')';
      avEl.style.backgroundSize = 'cover'; avEl.style.backgroundPosition = 'center top';
      avEl.style.width = '100%'; avEl.style.height = '100%'; avEl.style.borderRadius = '50%';
      avEl.textContent = '';
    } else avEl.textContent = p.avatar || '👨‍🚀';

    $('#hmBase').innerHTML = EX.buildings.map((b) => {
      const l = p.build[b.id] || 1;
      return `<button class="bs" data-build="${b.id}"><i>${b.icon}</i><b>${b.n} Lv.${l}</b><span>${b.desc}</span></button>`;
    }).join('');
    $$('#hmBase .bs').forEach((el) => { el.onclick = () => this.open('base', el.dataset.build); });
  },

  /* ================= 面板 ================= */
  PANELS: {
    role: ['角色', ['属性', '皮肤']],
    gun: ['武器', ['强化', '更换']],
    chip: ['芯片', ['装备', '背包']],
    talent: ['天赋', ['天赋']],
    task: ['任务', ['主线', '每日', '成就']],
    bag: ['背包', ['全部']],
    shop: ['商城', ['礼包', '兑换']],
    act: ['活动', ['活动']],
    rank: ['排行榜', ['全服']],
    set: ['设置', ['账号', '网络']],
    level: ['关卡选择', ['章节']],
    base: ['基地建筑', ['建筑']],
  },

  open(key, tab) {
    this.curPanel = key;
    const def = this.PANELS[key]; if (!def) return;
    if (tab) this.curTab[key] = tab;
    if (!this.curTab[key]) this.curTab[key] = def[1][0];
    $('#pnTitle').textContent = def[0];
    $('#pnTabs').innerHTML = def[1].map((t) =>
      `<button class="pt ${t === this.curTab[key] ? 'on' : ''}" data-t="${t}">${t}</button>`).join('');
    $$('#pnTabs .pt').forEach((b) => { b.onclick = () => { this.curTab[key] = b.dataset.t; this.open(key); }; });
    $('#pnBody').innerHTML = this.render(key, this.curTab[key]);
    $('#panel').classList.add('on');
    this.bind(key, this.curTab[key]);
  },
  close() { $('#panel').classList.remove('on'); this.curPanel = null; },
  render(key, tab) {
    const p = this.P; if (!p) return '<div class="empty">无数据</div>';
    const f = this['r_' + key]; return f ? f.call(this, p, tab) : '<div class="empty">待开发</div>';
  },
  bind(key, tab) {
    const p = this.P; if (!p) return;
    const f = this['b_' + key]; if (f) f.call(this, p, tab);
  },

  /* ---------- 角色 ---------- */
  r_role(p, tab) {
    if (tab === '皮肤') {
      return `<div class="card"><div class="card-t">外观 <span class="sub">通关解锁</span></div>
      <div class="lvgrid">${EX.skins.map((s) => {
        const ok = E.skinUnlocked(p, s.id);
        return `<button class="lvc ${ok ? '' : 'lock'} ${p.skin === s.id ? 'cur' : ''}" data-skin="${s.id}">
          <i style="font-size:20px;font-style:normal;display:block">${s.icon}</i>
          <b style="font-size:10px">${s.n}</b></button>`;
      }).join('')}</div>
      <div class="lbl">当前：${(EX.skins.find((s) => s.id === p.skin) || {}).n || '默认'}</div></div>`;
    }
    const a = E.attrs(p);
    return `<div class="card"><div class="card-t">战斗属性</div>
      <div class="kv"><span>战力</span><b style="color:var(--gold)">${E.fmt(E.power(p))}</b></div>
      <div class="kv"><span>攻击力</span><b>${E.fmt(a.atk)}</b></div>
      <div class="kv"><span>　枪械基础</span><b>${E.fmt(a.gunBase)}</b></div>
      <div class="kv"><span>生命值</span><b>${E.fmt(a.hp)}</b></div>
      <div class="kv"><span>移动速度</span><b>${Math.round(a.moveSpd)}</b></div>
      <div class="kv"><span>暴击率</span><b>${(a.crit * 100).toFixed(1)}%</b></div>
      <div class="kv"><span>暴击伤害</span><b>${(a.critDmg * 100).toFixed(0)}%</b></div>
      <div class="kv"><span>伤害减免</span><b>${(a.armor * 100).toFixed(1)}%</b></div>
      <div class="kv"><span>金币加成</span><b>${((a.goldMul - 1) * 100).toFixed(0)}%</b></div>
      <div class="kv"><span>经验加成</span><b>${((a.xpMul - 1) * 100).toFixed(0)}%</b></div>
      <div class="kv"><span>复活次数</span><b>${a.revive}</b></div></div>
      <div class="card"><div class="card-t">进度</div>
      <div class="kv"><span>通关关卡</span><b>${Object.keys(p.cleared || {}).length} / ${E.maxLevel()}</b></div>
      <div class="kv"><span>总星数</span><b>${E.totalStars(p)}</b></div>
      <div class="kv"><span>无尽最佳</span><b>第 ${p.endlessBest || 0} 层</b></div>
      <div class="kv"><span>累计击杀</span><b>${E.fmt((p.stats && p.stats.kills) || 0)}</b></div></div>`;
  },
  b_role(p, tab) {
    $$('#pnBody [data-skin]').forEach((b) => {
      b.onclick = () => { const r = E.wearSkin(p, b.dataset.skin); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) this.open('role', '皮肤'); };
    });
  },

  /* ---------- 武器 ---------- */
  r_gun(p, tab) {
    if (tab === '更换') {
      return `<div class="card"><div class="card-t">武器库 <span class="sub">通关解锁</span></div>
      ${EX.guns.map((g) => {
        const has = p.gun === g.id;
        return `<div class="item"><div class="ic" style="border:1.5px solid ${EX.qColor[g.q]}">${g.icon}</div>
          <div class="info"><div class="nm"><span style="color:${EX.qColor[g.q]}">${g.q}</span> ${g.n}</div>
          <div class="sub">伤害${g.dmg} 射速${g.rate}/s 弹夹${g.mag} 换弹${g.reload}s 穿透${g.pierce}</div>
          <div class="sub">${g.desc}</div></div>
          <div class="act">${has ? '<span class="tag g">使用中</span>' : `<button class="btn c sm" data-gun="${g.id}">切换</button>`}</div></div>`;
      }).join('')}</div>`;
    }
    const g = E.gun(p), a = E.attrs(p), c = E.gunUpgradeCost(p);
    return `<div class="card"><div class="card-t">${g.icon} ${g.n} <span class="sub">Lv.${p.gunLv}</span></div>
      <div class="kv"><span>基础伤害</span><b>${g.dmg} → <span style="color:var(--gold)">${E.fmt(a.gunBase)}</span></b></div>
      <div class="kv"><span>射速</span><b>${a.rate.toFixed(2)} /秒</b></div>
      <div class="kv"><span>弹夹容量</span><b>${g.mag} 发</b></div>
      <div class="kv"><span>换弹时间</span><b>${g.reload} 秒</b></div>
      <div class="kv"><span>射程 / 穿透</span><b>${g.range} / ${g.pierce}</b></div>
      <div class="kv"><span>齐射弹丸</span><b>${g.spread}</b></div>
      <button class="btn c blk" id="gunUp" ${p.gold < c ? 'disabled' : ''}>强化 · ${E.fmt(c)} 金币</button>
      <div class="lbl">武器强化是攻击成长的核心，每级 +${(E.GUN_GROW * 100).toFixed(0)}%。</div></div>`;
  },
  b_gun(p, tab) {
    const u = $('#gunUp'); if (u) u.onclick = () => {
      const r = E.upgradeGun(p); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('gun', tab); this.home(); }
    };
    $$('#pnBody [data-gun]').forEach((b) => {
      b.onclick = () => { p.gun = b.dataset.gun; this.toast('已切换武器', 'ok'); this.open('gun', '更换'); this.home(); };
    });
  },

  /* ---------- 芯片 ---------- */
  r_chip(p, tab) {
    if (tab === '背包') {
      const bag = p.bag || [];
      if (!bag.length) return '<div class="empty"><span class="ic">🔲</span>暂无芯片<br><span style="font-size:10px">通关或商城可获得</span></div>';
      return `<div class="card"><div class="card-t">芯片背包 <span class="sub">${bag.length} 块 · 碎片 ${p.shards || 0}</span></div>
      ${bag.map((c) => `<div class="item">
        <div class="ic" style="border:1.5px solid ${EX.qColor[c.q]}">🔲</div>
        <div class="info"><div class="nm" style="color:${EX.qColor[c.q]}">${c.q}品芯片</div>
        <div class="sub">${E.chipName(c).split(' · ')[1] || ''}</div></div>
        <div class="act">
          <button class="btn sm" data-fuse="${c.id}">合成</button>
          <button class="btn sm" data-rr="${c.id}">洗练</button>
          <button class="btn d sm" data-dec="${c.id}">拆解</button>
        </div></div>`).join('')}</div>
        <div class="lbl">合成：选 3 块同品质 → 升一级品质。洗练消耗钻石重 roll 词条。</div>`;
    }
    return `<div class="card"><div class="card-t">芯片槽 <span class="sub">${Object.keys(p.chips || {}).length}/6</span></div>
      <div class="lvgrid">${EX.chipSlots.map((s) => {
        const c = p.chips[s.k];
        return `<button class="lvc ${this.selChipSlot === s.k ? 'cur' : ''}" data-slot="${s.k}">
          <i style="font-size:18px;font-style:normal;display:block">${c ? '🔲' : '➕'}</i>
          <b style="font-size:9px;color:${c ? EX.qColor[c.q] : '#6b7899'}">${c ? c.q + '品' : '空'}</b></button>`;
      }).join('')}</div></div>
      <div class="card"><div class="card-t">可装备芯片</div>
      ${(p.bag || []).length ? (p.bag || []).map((c) => `<div class="item">
        <div class="ic" style="border:1.5px solid ${EX.qColor[c.q]}">🔲</div>
        <div class="info"><div class="nm" style="color:${EX.qColor[c.q]}">${c.q}品芯片</div>
        <div class="sub">${E.chipName(c).split(' · ')[1] || ''}</div></div>
        <div class="act"><button class="btn c sm" data-wear="${c.id}">装上</button></div></div>`).join('')
        : '<div class="lbl">背包内暂无芯片</div>'}</div>
      <div class="lbl">芯片提供百分比加成，品质越高词条越多。可拆解换碎片。</div>`;
  },
  b_chip(p, tab) {
    $$('#pnBody [data-slot]').forEach((b) => { b.onclick = () => { this.selChipSlot = b.dataset.slot; this.open('chip', tab); }; });
    $$('#pnBody [data-wear]').forEach((b) => {
      b.onclick = () => {
        const r = E.equipChip(p, b.dataset.wear, this.selChipSlot);
        this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('chip', tab); this.home(); }
      };
    });
    $$('#pnBody [data-dec]').forEach((b) => {
      b.onclick = () => { const r = E.dismantleChip(p, b.dataset.dec); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('chip', tab); this.home(); } };
    });
    $$('#pnBody [data-rr]').forEach((b) => {
      b.onclick = () => { const r = E.rerollChip(p, b.dataset.rr); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) this.open('chip', tab); };
    });
    $$('#pnBody [data-fuse]').forEach((b) => {
      b.onclick = () => {
        const c = (p.bag || []).find((x) => x.id === b.dataset.fuse); if (!c) return;
        const same = (p.bag || []).filter((x) => x.q === c.q).slice(0, 3).map((x) => x.id);
        if (same.length < 3) return this.toast('需要 3 块同品质芯片', 'err');
        const r = E.fuseChip(p, same); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('chip', tab); this.home(); }
      };
    });
  },

  /* ---------- 天赋 ---------- */
  r_talent(p) {
    return `<div class="card"><div class="card-t">永久天赋 <span class="sub">全局生效，不随关卡重置</span></div>
    ${EX.talents.map((t) => {
      const cur = p.talents[t.id] || 0;
      const cost = E.talentCost(p, t.id);
      const lock = !E.talentUnlocked(p, t.id);
      const full = cur >= t.max;
      return `<div class="item"><div class="ic">${t.icon}</div>
        <div class="info"><div class="nm">${t.n} <span class="tag y">Lv.${cur}/${t.max}</span></div>
        <div class="sub">${t.desc}</div>
        <div class="bar"><i style="width:${cur / t.max * 100}%"></i></div>
        ${lock ? `<div class="sub" style="color:#ff8fa4">需通关第 ${t.unlock + 1} 关解锁</div>` : ''}</div>
        <div class="act">${full ? '<span class="tag g">已满</span>' : lock ? '<span class="tag r">未解锁</span>'
          : `<button class="btn ${p.gold >= cost ? 'c' : ''} sm" data-tal="${t.id}" ${p.gold < cost ? 'disabled' : ''}>${E.fmt(cost)}</button>`}</div></div>`;
    }).join('')}</div>`;
  },
  b_talent(p) {
    $$('#pnBody [data-tal]').forEach((b) => {
      b.onclick = () => { const r = E.upTalent(p, b.dataset.tal); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('talent'); this.home(); } };
    });
  },

  /* ---------- 任务 ---------- */
  r_task(p, tab) {
    E.resetDaily(p);
    const map = { '主线': 'main', '每日': 'daily', '成就': 'achieve' };
    const list = EX.tasks[map[tab] || 'main'];
    const claimedKey = tab === '主线' ? 'mainClaimed' : tab === '每日' ? 'dailyClaimed' : 'achieveClaimed';
    const claimed = p.tasks[claimedKey] || [];
    return `<div class="card"><div class="card-t">${tab}任务</div>
    ${list.map((t) => {
      const cur = Math.min(E.taskVal(p, t.goal.t), t.goal.v);
      const done = E.taskDone(p, t);
      const got = claimed.indexOf(t.id) >= 0;
      return `<div class="item"><div class="ic">${done ? '✅' : '⏳'}</div>
        <div class="info"><div class="nm">${t.n}</div><div class="sub">${t.desc || ''}</div>
        <div class="bar"><i style="width:${cur / t.goal.v * 100}%"></i></div>
        <div class="sub">${E.fmt(cur)} / ${E.fmt(t.goal.v)}</div></div>
        <div class="act">${got ? '<span class="tag g">已领取</span>' :
          `<button class="btn ${done ? 'c' : ''} sm" data-claim="${t.id}" ${done ? '' : 'disabled'}>🪙${t.rw.gold} 💎${t.rw.dia}</button>`}</div></div>`;
    }).join('')}</div>`;
  },
  b_task(p, tab) {
    $$('#pnBody [data-claim]').forEach((b) => {
      b.onclick = () => {
        const map = { '主线': 'main', '每日': 'daily', '成就': 'achieve' };
        const r = E.claimTask(p, map[tab] || 'main', b.dataset.claim);
        this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('task', tab); this.home(); }
      };
    });
  },

  /* ---------- 背包 ---------- */
  r_bag(p) {
    const a = E.attrs(p);
    return `<div class="card"><div class="card-t">资源</div>
      <div class="kv"><span>金币</span><b style="color:var(--gold)">${E.fmt(p.gold)}</b></div>
      <div class="kv"><span>钻石</span><b style="color:var(--blue)">${E.fmt(p.diamond)}</b></div>
      <div class="kv"><span>芯片碎片</span><b>${E.fmt(p.shards || 0)}</b></div></div>
      <div class="card"><div class="card-t">已装芯片加成</div>
      ${EX.chipStats.map((s) => {
        const v = E.chipVal(p, s.k); if (!v) return '';
        return `<div class="kv"><span>${s.n}</span><b style="color:var(--green)">+${s.unit === '%' ? (v * 100).toFixed(1) + '%' : v.toFixed(2)}</b></div>`;
      }).join('') || '<div class="lbl">尚未装备芯片</div>'}</div>
      <div class="card"><div class="card-t">邮件 <span class="sub">${(p.mail || []).filter((m) => !m.got).length} 封未读</span></div>
      ${(p.mail || []).length ? p.mail.slice(-5).reverse().map((m) => `<div class="item">
        <div class="ic">📮</div><div class="info"><div class="nm">${m.t}</div><div class="sub">${m.b || ''}</div>
        <div class="sub">🪙${m.gold || 0} 💎${m.dia || 0}</div></div>
        <div class="act">${m.got ? '<span class="tag g">已领</span>' : ''}</div></div>`).join('')
        : '<div class="lbl">暂无邮件</div>'}</div>`;
  },

  /* ---------- 商城 ---------- */
  r_shop(p, tab) {
    if (tab === '兑换') {
      return `<div class="card"><div class="card-t">兑换码</div>
      <input id="codeInp" placeholder="输入兑换码" style="width:100%;padding:10px;border-radius:9px;
        background:rgba(10,16,28,.85);border:1px solid var(--line);color:var(--txt);font-size:13px;outline:none">
      <button class="btn c blk" id="codeBtn">兑 换</button>
      <div class="lbl">可用：VIP666、VIP888、SVIP999、xjskp888、dz789</div></div>`;
    }
    return `<div class="card"><div class="card-t">礼包商城</div>
    ${EX.shop.map((k) => `<div class="item"><div class="ic">${k.icon}</div>
      <div class="info"><div class="nm">${k.n}</div><div class="sub">${k.desc}</div></div>
      <div class="act"><button class="btn c sm" data-buy="${k.id}">${k.cur === 'free' ? '免费' : '💎' + k.price}</button></div></div>`).join('')}</div>`;
  },
  b_shop(p, tab) {
    $$('#pnBody [data-buy]').forEach((b) => {
      b.onclick = () => {
        const k = EX.shop.find((x) => x.id === b.dataset.buy); if (!k) return;
        if (k.cur === 'diamond' && p.diamond < k.price) return this.toast('钻石不足', 'err');
        p.diamond -= (k.cur === 'diamond' ? k.price : 0);
        p.gold += k.g || 0; p.diamond += k.d || 0;
        if (k.chip) for (let i = 0; i < k.chip; i++) p.bag.push(E.rollChip('紫', null));
        this.toast('购买成功：' + k.n, 'ok'); this.open('shop', tab); this.home();
      };
    });
    const cb = $('#codeBtn');
    if (cb) cb.onclick = () => {
      const v = ($('#codeInp').value || '').trim().toUpperCase();
      const codes = { VIP666: [8000, 60], VIP888: [15000, 100], SVIP999: [30000, 200], XJSKP888: [20000, 150], DZ789: [50000, 300] };
      if (!codes[v]) return this.toast('兑换码无效', 'err');
      p.usedCodes = p.usedCodes || [];
      if (p.usedCodes.indexOf(v) >= 0) return this.toast('该码已使用', 'err');
      p.usedCodes.push(v); p.gold += codes[v][0]; p.diamond += codes[v][1];
      this.toast('兑换成功：金币+' + E.fmt(codes[v][0]) + ' 钻石+' + codes[v][1], 'ok');
      this.open('shop', '兑换'); this.home();
    };
  },

  /* ---------- 活动 ---------- */
  r_act(p) {
    return `<div class="card"><div class="card-t">限时活动</div>
    ${EX.activities.map((a) => `<div class="item"><div class="ic">${a.icon}</div>
      <div class="info"><div class="nm">${a.n} <span class="tag ${a.state === '进行中' ? 'g' : 'r'}">${a.state}</span></div>
      <div class="sub">${a.desc}</div><div class="sub">奖励：${a.rw}</div></div>
      <div class="act">${a.state === '进行中' ? `<button class="btn c sm" data-act="${a.id}">参与</button>` : '<span class="tag">未开启</span>'}</div></div>`).join('')}</div>`;
  },
  b_act(p) {
    $$('#pnBody [data-act]').forEach((b) => {
      b.onclick = () => { this.close(); startBattle('normal'); };
    });
  },

  /* ---------- 排行榜 ---------- */
  r_rank(p) {
    const lb = window.LB || [];
    if (!lb.length) return '<div class="empty"><span class="ic">🏆</span>暂无排行数据<br><span style="font-size:10px">通关后自动上传，每小时刷新</span></div>';
    return lb.map((x, i) => `<div class="item">
      <div class="ic" style="font-size:15px;background:${i < 3 ? 'linear-gradient(135deg,#ffe9a8,#f0a020)' : 'rgba(10,16,28,.7)'};color:${i < 3 ? '#2a1a00' : '#fff'}">${i + 1}</div>
      <div class="info"><div class="nm">${x.n}</div><div class="sub">第 ${x.lv} 关 · 无尽 ${x.eb || 0} 层</div></div>
      <div class="act"><span class="tag y">${E.fmt(x.pw)}</span></div></div>`).join('');
  },

  /* ---------- 关卡选择 ---------- */
  r_level(p) {
    const per = EX.LEVELS_PER_CHAPTER;
    const ch = this.curChapter || E.chapterOf(p.level || 1);
    const cd = EX.chapters[ch - 1];
    const unlocked = E.chapterUnlocked(p, ch);
    const start = (ch - 1) * per + 1;
    return `<div class="card"><div class="card-t">${cd.icon} ${cd.n} <span class="sub">${unlocked ? '' : '未解锁'}</span></div>
      <div class="lvgrid">${Array.from({ length: per }, (_, i) => {
        const no = start + i;
        const isBoss = i === per - 1;
        const lock = no > (p.level || 1);
        const st = (p.cleared || {})[no] || 0;
        return `<button class="lvc ${lock ? 'lock' : ''} ${no === (p.level || 1) ? 'cur' : ''} ${isBoss ? 'boss' : ''}" data-lv="${no}" ${lock ? 'disabled' : ''}>
          <b>${isBoss ? '👹' : no}</b><div class="st">${st ? '★'.repeat(st) : ''}</div></button>`;
      }).join('')}</div>
      <div class="lbl">通关条件：清空全部波次。星级按剩余生命评定（>60% 三星）。</div></div>
      <div class="card"><div class="card-t">章节</div>
      <div class="lvgrid">${EX.chapters.map((c) => `<button class="lvc ${c.id === ch ? 'cur' : ''} ${E.chapterUnlocked(p, c.id) ? '' : 'lock'}" data-ch="${c.id}">
        <i style="font-size:17px;font-style:normal;display:block">${c.icon}</i><b style="font-size:9px">${c.n.split(' · ')[0]}</b></button>`).join('')}</div></div>`;
  },
  b_level(p) {
    $$('#pnBody [data-ch]').forEach((b) => { b.onclick = () => { this.curChapter = +b.dataset.ch; this.open('level'); }; });
    $$('#pnBody [data-lv]').forEach((b) => {
      b.onclick = () => { this.close(); startBattle('normal', +b.dataset.lv); };
    });
  },

  /* ---------- 基地建筑 ---------- */
  r_base(p, tab) {
    const b = EX.buildings.find((x) => x.id === tab) || EX.buildings[0];
    const cur = p.build[b.id] || 1;
    const cost = E.buildCost(p, b.id);
    const val = b.stat === 'gold' ? (b.offline * cur) + ' 金币/小时' : '+' + (cur * b.per * 100).toFixed(0) + '%';
    return `<div class="card"><div class="card-t">${b.icon} ${b.n} <span class="sub">Lv.${cur}/${b.max}</span></div>
      <div class="kv"><span>效果</span><b style="color:var(--green)">${val}</b></div>
      <div class="kv"><span>说明</span><b style="font-size:11px">${b.desc}</b></div>
      <button class="btn c blk" id="buUp" ${p.gold < cost ? 'disabled' : ''}>升级 · ${E.fmt(cost)} 金币</button>
      <div class="lbl">建筑加成永久生效，不随关卡重置。</div></div>
      <div class="card"><div class="card-t">离线产出</div>
      <div class="kv"><span>仓库离线收益</span><b style="color:var(--gold)">${E.fmt(E.offlineIncome(p))} 金币</b></div>
      <button class="btn blk" id="buClaim">领取离线收益</button>
      <div class="lbl">离线最多累计 12 小时。</div></div>`;
  },
  b_base(p, tab) {
    const u = $('#buUp'); if (u) u.onclick = () => {
      const r = E.upBuild(p, tab); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('base', tab); this.home(); }
    };
    const c = $('#buClaim'); if (c) c.onclick = () => {
      const v = E.offlineIncome(p);
      if (v <= 0) return this.toast('暂无离线收益', 'err');
      p.gold += v; p.offlineAt = Date.now();
      this.toast('领取离线收益 ' + E.fmt(v) + ' 金币', 'ok'); this.open('base', tab); this.home();
    };
  },

  /* ---------- 设置 ---------- */
  r_set(p, tab) {
    if (tab === '网络') {
      return `<div class="card"><div class="card-t">网络状态</div>
        <div class="kv"><span>状态</span><b style="color:${Net.online ? 'var(--green)' : '#ff8fa4'}">${Net.online ? '● 已连接' : '○ 离线'}</b></div>
        <div class="kv"><span>端点</span><b style="font-size:10px">${Net.endpoint.replace('https://', '')}</b></div>
        <button class="btn blk" id="setReNet">重新检测</button>
        <button class="btn blk" id="setDiag">逐端点诊断</button>
        <div id="diagBox"><div class="lbl">点「逐端点诊断」测试全部通道</div></div></div>
        <div class="card"><div class="card-t">自定义加速地址</div>
        <textarea id="setEps" rows="2" placeholder="https://xxx.workers.dev"
          style="width:100%;padding:8px;border-radius:8px;background:rgba(10,16,28,.85);border:1px solid var(--line);color:var(--txt);font-size:11px;outline:none">${(GH.extra || []).join('\n')}</textarea>
        <button class="btn c blk" id="setSaveEps">保存加速地址</button></div>`;
    }
    return `<div class="card"><div class="card-t">账号信息</div>
      <div class="kv"><span>代号</span><b>${p.name}</b></div>
      <div class="kv"><span>UID</span><b style="font-size:10px">${p.uid}</b></div>
      <div class="kv"><span>通关关卡</span><b>${Object.keys(p.cleared || {}).length} / ${E.maxLevel()}</b></div>
      <div class="kv"><span>总星数</span><b>${E.totalStars(p)}</b></div>
      <div class="kv"><span>累计击杀</span><b>${E.fmt((p.stats && p.stats.kills) || 0)}</b></div>
      <div class="kv"><span>无尽最佳</span><b>第 ${p.endlessBest || 0} 层</b></div></div>
      <div class="card"><div class="card-t">数据</div>
      <button class="btn blk" id="setSave">立即保存存档</button>
      <button class="btn d blk" id="setReset">重置存档（清空全部进度）</button>
      <div class="lbl">存档保存于云端仓库，换设备登录同一代号可继续。</div></div>
      <div class="card"><div class="card-t">后台管理</div>
      <button class="btn blk" id="setAdmin">进入管理后台</button></div>`;
  },
  b_set(p, tab) {
    const sv = $('#setSave'); if (sv) sv.onclick = async () => { await MAIN.save(); this.toast('存档已上传', 'ok'); };
    const rs = $('#setReset'); if (rs) rs.onclick = () => {
      if (!confirm('确定清空全部进度？此操作不可恢复！')) return;
      localStorage.removeItem('zb_uid'); location.reload();
    };
    const ad = $('#setAdmin'); if (ad) ad.onclick = () => { location.href = 'admin/'; };
    const rn = $('#setReNet'); if (rn) rn.onclick = async () => { this.toast('检测中…'); await Net.reset(); this.open('set', '网络'); };
    const dg = $('#setDiag'); if (dg) dg.onclick = async () => {
      const box = $('#diagBox'); box.innerHTML = '<div class="lbl">测试中…</div>';
      const list = await Net.diagnose();
      const ok = list.filter((x) => x.ok).length;
      box.innerHTML = `<div class="lbl" style="margin-bottom:5px">${ok}/${list.length} 个通道可用</div>` +
        list.map((x) => `<div class="kv"><span style="font-size:9px;word-break:break-all">${x.ep.replace('https://', '')}</span>
          <b style="font-size:9px;color:${x.ok ? 'var(--green)' : '#ff8fa4'}">${x.ok ? '✔' : '✘'} ${x.st}</b></div>`).join('');
      await Net.reset(); this.open('set', '网络');
    };
    const se = $('#setSaveEps'); if (se) se.onclick = () => {
      const v = ($('#setEps').value || '').split('\n').map((x) => x.trim()).filter(Boolean);
      GH.extra = v; try { localStorage.setItem('zb_extra', JSON.stringify(v)); } catch (e) {}
      alert('已保存 ' + v.length + ' 个加速地址'); Net.reset();
    };
  },

  /* ================= 战斗 HUD ================= */
  btInit(p, levelNo, endless) {
    $('#btLevel').textContent = endless ? ('无尽 第 ' + levelNo + ' 层') : E.levelName(levelNo);
    $('#btKill').textContent = '0';
    $('#btGold').textContent = '0';
    $('#btLv').textContent = '1';
    $('#btSkills').innerHTML = '';
  },
  btTick() {
    const r = BT.run; if (!r) return;
    $('#btWave').textContent = '第 ' + r.wave + '/' + r.waveTotal + ' 波';
    const s = Math.floor(r.time);
    $('#btTime').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    $('#btHpBar').style.width = Math.max(0, r.hp / r.maxHp * 100) + '%';
    $('#btHpTxt').textContent = Math.ceil(r.hp) + '/' + Math.ceil(r.maxHp);
    const sh = $('#btShWrap'), sb = $('#btShBar');
    if (r.maxShield > 0) { sh.style.display = ''; sb.style.width = (r.shield / r.maxShield * 100) + '%'; }
    else sh.style.display = 'none';
    $('#btKill').textContent = r.kills;
    $('#btGold').textContent = E.fmt(r.gold);
    $('#btLv').textContent = r.lv;
    /* 换弹 */
    const rl = $('#btReload');
    if (r.reloading) {
      rl.classList.add('reloading');
      const total = E.gun(this.P).reload;
      $('#btMag').textContent = '换弹…';
      $('#btReloadBar').style.width = ((1 - r.reloadT / total) * 100) + '%';
    } else {
      rl.classList.remove('reloading');
      $('#btMag').textContent = r.mag + '/' + r.magMax;
      $('#btReloadBar').style.width = '0';
    }
    /* 已获技能 */
    const sk = $('#btSkills');
    const ids = Object.keys(r.skills);
    if (sk.dataset.n !== String(ids.length)) {
      sk.dataset.n = String(ids.length);
      sk.innerHTML = ids.map((id) => {
        const d = EX.skills.find((x) => x.id === id); if (!d) return '';
        return `<div class="bs">${d.icon}<u>${r.skills[id]}</u></div>`;
      }).join('');
    }
  },

  /* ---------- 技能三选一 ---------- */
  showSkillChoice(picks) {
    $('#chCards').innerHTML = picks.map((s) => {
      const L = (BT.run.skills[s.id] || 0);
      const el = EX.elements.find((x) => x.k === s.el) || { c: '#ffd76a' };
      const kindTxt = s.kind === 'gun' ? '枪械强化' : s.kind === 'passive' ? '被动强化' : s.kind === 'aura' ? '光环' : '命中触发';
      return `<button class="ccard" data-pick="${s.id}">
        <i style="background:${el.c}22">${s.icon}</i>
        <div class="ci"><div class="cn"><span style="color:${el.c}">${s.n}</span>
          ${L ? `<span class="tag y">Lv.${L}→${L + 1}</span>` : '<span class="tag g">NEW</span>'}</div>
          <div class="cd2">${s.desc}</div>
          <div class="cl">${kindTxt} · ${s.up}${s.conflict ? ' · ⚠️与' + (EX.skills.find((x) => x.id === s.conflict) || {}).n + '互斥' : ''}</div>
        </div></button>`;
    }).join('');
    $$('#chCards .ccard').forEach((b) => {
      b.onclick = () => { $('#choice').classList.remove('on'); BT.pickSkill(b.dataset.pick); };
    });
    $('#choice').classList.add('on');
  },
  hideChoice() { $('#choice').classList.remove('on'); },

  /* ---------- 结算 ---------- */
  showResult(res, d) {
    const win = res === 'win';
    $('#rsTitle').textContent = win ? '战 斗 胜 利' : (res === 'lose' ? '防 线 失 守' : '撤 离 战 场');
    $('#rsTitle').className = 'rs-t ' + (win ? 'win' : 'lose');
    $('#rsLevel').textContent = BT.run.endless ? ('无尽 第 ' + BT.run.def.levelNo + ' 层') : BT.run.def.name;
    const mm = Math.floor((d.time || 0) / 60), ss = Math.floor((d.time || 0) % 60);
    $('#rsGrid').innerHTML = `
      <div class="rs-i"><div class="v">${d.kills}</div><div class="l">击杀僵尸</div></div>
      <div class="rs-i"><div class="v">${mm}:${String(ss).padStart(2, '0')}</div><div class="l">战斗时长</div></div>
      <div class="rs-i"><div class="v">${E.fmt(d.rw.gold)}</div><div class="l">获得金币</div></div>
      <div class="rs-i"><div class="v">${d.rw.diamond}</div><div class="l">获得钻石</div></div>`;
    $('#rsNext').style.display = win ? '' : 'none';
    $('#result').classList.add('on');
  },
  hideResult() { $('#result').classList.remove('on'); },
};

window.UI = UI;
