/* =========================================================
 * ui.js —— 界面层
 * 依据资料 07 模块关系表（16 界面）/ 08 跳转流程
 * ========================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const UI = {
  P: null, curPanel: null, curTab: {}, selChipSlot: 'c1', curChapter: 1,

  show(id) {
    $$('.screen').forEach((s) => s.classList.remove('on'));
    const el = document.getElementById(id); if (el) el.classList.add('on');
  },
  toast(msg, cls) {
    const box = $('#toasts'); if (!box) return;
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || ''); d.innerHTML = msg;
    box.appendChild(d); setTimeout(() => { if (d.remove) d.remove(); }, cls === 'boss' ? 2600 : 2000);
    while (box.children.length > 4 && box.firstElementChild) box.firstElementChild.remove();
  },

  /* ================= 基地主界面 ================= */
  home() {
    const p = this.P; if (!p) return;
    E.resetTasks(p); E.tickStamina(p);
    $('#hmName').textContent = p.name;
    /* 已装备称号显示在代号旁（此前称号发放后玩家完全看不到） */
    const hmT = $('#hmTitle');
    if (hmT) {
      const td = p.title ? E.titleDef(p.title) : null;
      hmT.textContent = td ? ('『' + td.n + '』') : '';
      hmT.style.color = td ? td.color : '';
      hmT.style.display = td ? '' : 'none';
    }
    $('#hmLv').textContent = 'Lv.' + (p.lv || 1);
    $('#hmPower').textContent = E.fmt(E.power(p));
    $('#cuGold').textContent = E.fmt(p.gold);
    const ci = EX.curIcon || {};
    const cgEl = $('#cuGoldIco'); if (cgEl && ci.gold) cgEl.src = ci.gold;
    const cdEl = $('#cuDiaIco'); if (cdEl && ci.diamond) cdEl.src = ci.diamond;
    const csEl = $('#cuStaIco'); if (csEl && ci.stamina) csEl.src = ci.stamina;
    $('#cuDia').textContent = E.fmt(p.diamond);
    const cur = E.curLevel(p);
    $('#hmLevel').textContent = E.char(p).n + ' · ' + E.levelName(cur);
    $('#hmLevelName').textContent = E.levelName(cur) + (E.staminaCost(cur) > 1 ? '（体力' + E.staminaCost(cur) + '）' : '');
    const eb = $('#hmEndBest');
    if (eb) eb.textContent = E.endlessUnlocked(p) ? ('最佳 ' + (p.endlessBest || 0) + ' 层') : '通关 3-3 解锁';
    const st = $('#hmStamina');
    if (st) st.textContent = Math.floor(p.stamina || 0) + '/' + EX.STAMINA_MAX;
    const avEl = $('#hmAvIco');
    if (avEl) avEl.textContent = E.char(p).icon;

    $('#hmBase').innerHTML = EX.buildings.map((b) => {
      const l = p.build[b.id] || 1;
      return `<button class="bs" data-build="${b.id}"><i>${b.icon}</i><b>${b.n} Lv.${l}</b><span>${b.desc}</span></button>`;
    }).join('');
    $$('#hmBase .bs').forEach((el) => { el.onclick = () => this.open('base', el.dataset.build); });
  },

  /* ================= 面板 ================= */
  /* PANELS: [标题, 分类, tab位置]
     位置: side=左侧竖排(截图35/38/39/41) bottom=底部横排(截图34背包) right=右侧竖标(截图40) */
  PANELS: {
    role: ['角色', ['装备', '宝石', '皮肤'], 'side'],
    gun: ['武器', ['强化', '武器库'], 'side'],
    chip: ['芯片系统', ['芯片'], 'right'],
    talent: ['天赋', ['天赋'], 'top'],
    task: ['任务', ['主线', '日常', '周常', '成就'], 'side'],
    bag: ['我的背包', ['宝石', '装备', '材料', '芯片', '消耗'], 'bottom'],
    shop: ['商店', ['每日', '武器', '宝石', '材料', '礼包', '直购'], 'side'],
    gem: ['宝石镶嵌', ['镶嵌'], 'top'],
    friends: ['好友', ['好友列表', '申请', '聊天'], 'side'],
    mail: ['邮件', ['邮件'], 'top'],
    act: ['活动', ['活动'], 'top'],
    rank: ['排行榜', ['全服'], 'top'],
    set: ['设置', ['账号', '音频', '兑换码', '网络', '数值', '语言', '运营'], 'side'],
    level: ['关卡选择', ['章节'], 'top'],
    base: ['基地建筑', ['建筑'], 'top'],
    tavern: ['酒馆招募', ['佣兵'], 'top'],
    core: ['核心技能', ['技能'], 'top'],
    legion: ['军团', ['军团', '成员'], 'side'],
    exped: ['远征堡垒', ['远征', '巡逻'], 'side'],
    ashop: ['兑换商店', ['成就商店', '活动商店'], 'side'],
    codex: ['图鉴收集', ['怪物', '武器', '皮肤'], 'side'],
  },
  tabPos(key) { const d = this.PANELS[key]; return (d && d[2]) || 'top'; },

  open(key, tab) {
    if (window.SND) SND.play('panel');
    this.curPanel = key;
    const def = this.PANELS[key]; if (!def) return;
    if (tab) this.curTab[key] = tab;
    if (!this.curTab[key]) this.curTab[key] = def[1][0];
    $('#pnTitle').textContent = def[0];
    const pos = this.tabPos(key);
    const box = $('#panel');
    if (box) box.dataset.tp = pos;
    const tabsHTML = def[1].map((t) =>
      `<button class="pt ${t === this.curTab[key] ? 'on' : ''}" data-t="${t}">${t}</button>`).join('');
    /* 单分类时不显示 tab 区 */
    $('#pnTabs').innerHTML = def[1].length > 1 ? tabsHTML : '';
    $('#pnTabs').style.display = def[1].length > 1 ? '' : 'none';
    $$('#pnTabs .pt').forEach((b) => { b.onclick = () => { this.curTab[key] = b.dataset.t; this.open(key); }; });
    $('#pnBody').innerHTML = this.render(key, this.curTab[key]);
    $('#panel').classList.add('on');
    this.bind(key, this.curTab[key]);
  },
  close() { $('#panel').classList.remove('on'); this.curPanel = null; },
  /* 通用弹层（军团商店 / 军团副本用）
   * 严重 BUG：b_legion 里两处调用 this.sheet(...)，但 UI 上【根本没有 sheet 方法】
   *   （全项目 0 处定义）——点「军团商店」「军团活动」直接抛
   *   "this.sheet is not a function"，两个面板永远打不开。
   * 结果：军团捐献攒下的贡献【没有任何出口】——
   *   LS01~LS06（金币/合金/稀有金属/碎片/芯片/红宝石）一件都买不了；
   *   LA01~LA03 三个军团副本也进不去，贡献只能靠捐、花不掉。
   *   （此前测试是直接调兑换逻辑验的，所以没暴露点击链路断了。）
   * 这里补上：复用 #sweepBox 这个 modal 容器。
   */
  sheet(title, html) {
    const box = document.getElementById('sweepBox');
    if (!box) { try { this.toast(String(title || ''), 'err'); } catch (e) {} return; }
    box.innerHTML = `<div class="pn-box"><div class="pn-hd"><b>${this.esc(title)}</b>
      <button id="shX">✕</button></div><div class="pn-main"><div class="pn-body">${html || ''}</div></div></div>`;
    box.classList.add('on');
    const x = document.getElementById('shX');
    if (x) x.onclick = () => { box.classList.remove('on'); box.innerHTML = ''; };
    box.onclick = (e) => { if (e.target === box) { box.classList.remove('on'); box.innerHTML = ''; } };
    return box;
  },
  /* 关闭通用弹层（军团商店/副本兑换后调用）
   * BUG：b_legion 两处调用 this.closeSheet()，但 UI 上【没有这个方法】
   *   → 兑换成功后抛 "this.closeSheet is not a function"，
   *     后面的 open('legion') / home() 全都不执行，界面不刷新。 */
  closeSheet() {
    const box = document.getElementById('sweepBox');
    if (box) { box.classList.remove('on'); box.innerHTML = ''; }
  },
  render(key, tab) {
    const p = this.P; if (!p) return '<div class="empty">无数据</div>';
    const f = this['r_' + key]; return f ? f.call(this, p, tab) : '<div class="empty">待开发</div>';
  },
  bind(key, tab) {
    const p = this.P; if (!p) return;
    const f = this['b_' + key]; if (f) f.call(this, p, tab);
  },
  /* ---------- 酒馆：招募佣兵（真实玩法：基地酒馆） ---------- */
    /* HTML 转义（防止昵称/账号名里的特殊字符破坏结构） */
  esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
r_tavern(p, tab) {
    const hired = p.mercs || [];
    return `<div class="card"><div class="card-t">🍺 酒馆 · 雇佣兵
      <span class="sub">战斗中协同作战（已雇 ${hired.length}/${EX.mercs.length}）</span></div>
      ${EX.mercs.map((m) => {
        const own = hired.indexOf(m.id) >= 0;
        return `<div class="mc-card">
          <div class="mi">${m.img
            ? `<img src="${m.img}" style="width:40px;height:40px;border-radius:8px;object-fit:cover">`
            : m.icon}</div>
          <div class="mn"><b>${m.n}</b>
            <span>${m.desc}</span>
            <span>伤害 ${m.dmg} · 射速 ${m.rate}/s · 射程 ${m.rng}</span></div>
          <button data-hire="${m.id}" class="${own ? 'hired' : ''}"
            ${own ? '' : (p.gold < m.cost ? 'disabled' : '')}>
            ${own ? '已雇佣' : '🪙' + m.cost}</button>
        </div>`;
      }).join('')}
    </div>
    <div class="card"><div class="card-t">战斗阵容</div>
      <div class="sub" style="padding:4px 2px">雇佣的佣兵会在每局战斗开始时自动出战，站在防线后方协同射击。</div>
    </div>`;
  },
  b_tavern(p, tab) {
    $$('#pnBody [data-hire]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.hire;
        const m = EX.mercs.find((x) => x.id === id); if (!m) return;
        if ((p.mercs || []).indexOf(id) >= 0) return;
        if (p.gold < m.cost) return this.toast('金币不足', 'err');
        p.gold -= m.cost;
        (p.mercs || (p.mercs = [])).push(id);
        E.save(p); this.toast('已雇佣 ' + m.n, 'ok');
        if (window.SND) SND.play('upgrade');
        this.open('tavern'); this.home();
      };
    });
  },

  /* ---------- 核心：局内技能总览 ---------- */
  r_core(p, tab) {
    const byEl = {};
    EX.skills.forEach((s) => { (byEl[s.el] || (byEl[s.el] = [])).push(s); });
    const elName = { '火': '🔥 火系', '冰': '❄️ 冰系', '电': '⚡ 电系', '风': '🌪️ 风系', '物': '🔩 物理' };
    return Object.keys(byEl).map((el) => {
      const c = (EX.elements.find((x) => x.k === el) || {}).c || '#ffd76a';
      return `<div class="card"><div class="card-t" style="color:${c}">${elName[el] || el}</div>
      ${byEl[el].map((s) => `<div class="item">
        <div class="ic" style="border:1.5px solid ${c}66">${s.img
          ? `<img src="${s.img}" style="width:30px;height:30px;border-radius:6px;object-fit:cover">`
          : s.icon}</div>
        <div class="info"><div class="nm">${s.n}
          <span class="tag">${s.kind === 'active' ? '主动' : s.kind === 'summon' ? '召唤' : '被动'}</span></div>
          <div class="sub">${s.desc}</div>
          <div class="sub" style="color:#ffd76a">${s.up} · 上限 Lv${s.max}</div></div>
      </div>`).join('')}</div>`;
    }).join('');
  },

  /* ---------- 军团 ---------- */
  r_legion(p, tab) {
    const lg = p.legion || null;
    if (tab === '成员') {
      if (!lg) return '<div class="empty">尚未加入军团</div>';
      const mem = lg.members || [];
      return `<div class="card"><div class="card-t">成员 <span class="sub">${mem.length} 人</span></div>
        ${mem.map((m) => `<div class="kv"><span>${m.role || '成员'} ${m.n}</span><b>战力 ${E.fmt(m.pw || 0)}</b></div>`).join('')}
      </div>`;
    }
    if (lg) {
      /* 截图37：军团名/等级/成员/战力 + 战团列表 + 底部三按钮 */
      const mem = lg.members || [];
      const totalPw = mem.reduce((s, m) => s + (m.pw || 0), 0);
      return `<div class="card" style="text-align:center">
        ${this.zAvatarHTML(lg.id, '')}
        <div style="font-size:15px;font-weight:800;margin-top:6px;color:var(--yel)">${lg.n}</div>
        <div class="sub">${lg.lv || 1}级 · 成员 ${mem.length}/${lg.cap || 50} · 战力 ${E.fmt(Math.max(totalPw, E.power(p)))}</div>
      </div>
      <div class="card"><div class="card-t">战团</div>
        ${['一团', '二团', '三团'].map((nm, i) => `<div class="zrow">
          ${this.zAvatarHTML('t' + i)}<div class="zi"><b>${nm}</b><span>人数 ${[1, 3, 1][i]} · 队伍 ${i + 1}</span></div>
          ${this.zAvatarHTML('u' + i)}</div>`).join('')}
      </div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn sm o" style="flex:1" id="lgAct">军团活动</button>
        <button class="btn sm o" style="flex:1" id="lgShop">军团商店</button>
        <button class="btn sm" style="flex:1" id="lgDonate">捐献</button>
      </div>
      <div class="card" style="margin-top:8px"><div class="card-t">军团贡献
        <span class="sub">捐献获得，可在军团商店消费</span></div>
        <div class="kv"><span>当前贡献</span><b>${E.fmt(p.legionExp || 0)}</b></div>
      </div>`;
    }
    return `<div class="card"><div class="card-t">加入军团</div>
      <div class="sub" style="padding:4px 2px">军团可提供属性加成、军团副本与军团商店。</div>
      ${EX.legions.map((l) => `<div class="mc-card">
        <div class="mi">${l.icon}</div>
        <div class="mn"><b>${l.n}</b><span>${l.desc}</span>
          <span>人数 ${l.mem} · 需要战力 ${E.fmt(l.need)}</span></div>
        <button data-join="${l.id}" ${E.power(p) < l.need ? 'disabled' : ''}>加入</button>
      </div>`).join('')}
      <div class="sub" style="padding:6px 2px">或花费 <b>20000 金币</b> 自建军团</div>
      <button class="btn" id="lgCreate" style="width:100%;margin-top:4px">🏰 自建军团（20000 金币）</button>
    </div>`;
  },
  b_legion(p, tab) {
    const jb = $$('#pnBody [data-join]');
    jb.forEach((b) => { b.onclick = () => {
      const l = EX.legions.find((x) => x.id === b.dataset.join); if (!l) return;
      p.legion = { id: l.id, n: l.n, lv: 1, cap: 50, members: [{ n: p.name, role: '成员', pw: E.power(p) }] };
      E.save(p); this.toast('已加入 ' + l.n, 'ok');
      if (window.SND) SND.play('upgrade'); this.open('legion'); this.home();
    }; });
    const cb = $('#lgCreate');
    if (cb) cb.onclick = () => {
      if (p.gold < 20000) return this.toast('金币不足', 'err');
      p.gold -= 20000;
      p.legion = { id: 'my', n: p.name + '的军团', lv: 1, cap: 50,
        members: [{ n: p.name, role: '团长', pw: E.power(p) }] };
      E.save(p); this.toast('军团创建成功', 'ok'); this.open('legion'); this.home();
    };
    const db = $('#lgDonate');
    if (db) db.onclick = () => {
      if (p.gold < 5000) return this.toast('金币不足', 'err');
      p.gold -= 5000; p.legionExp = (p.legionExp || 0) + 100;
      E.save(p); this.toast('捐献成功 +100 贡献', 'ok'); this.open('legion'); this.home();
    };
    /* 军团活动：此前写死「开发中」，点了没反应。
     * 现在按 legionActs 挑战，消耗体力 → 产出贡献+金币+材料。 */
    const la = $('#lgAct');
    if (la) la.onclick = () => {
      if (!p.legion) return this.toast('请先加入军团', 'err');
      this.sheet('军团副本', `
        <div class="sub" style="padding:4px 2px">消耗体力挑战，产出军团贡献与奖励。</div>
        ${(EX.legionActs || []).map((a) => {
          const okSt = (p.stamina || 0) >= a.cost;
          const okPw = E.power(p) >= a.need;
          return `<div class="mc-card">
            <div class="mi">${a.icon}</div>
            <div class="mn"><b>${a.n}</b><span>贡献 +${a.contrib} · 金币 +${E.fmt(a.gold)}</span>
              <span>体力 ${a.cost} · 推荐战力 ${E.fmt(a.need)}${okPw ? '' : '（战力不足）'}</span></div>
            <button data-lact="${a.id}" ${(okSt && okPw) ? '' : 'disabled'}>${okSt ? '挑战' : '体力不足'}</button>
          </div>`;
        }).join('')}`);
      $$('[data-lact]').forEach((b) => { b.onclick = () => {
        const a = (EX.legionActs || []).find((x) => x.id === b.dataset.lact); if (!a) return;
        if ((p.stamina || 0) < a.cost) return this.toast('体力不足', 'err');
        if (E.power(p) < a.need) return this.toast('战力不足', 'err');
        p.stamina -= a.cost;
        p.gold = (p.gold || 0) + a.gold;
        p.legionExp = (p.legionExp || 0) + a.contrib;
        (a.mats || []).forEach((m) => { p.mat = p.mat || {}; p.mat[m.k] = (p.mat[m.k] || 0) + m.n; });
        E.save(p);
        this.toast('挑战成功：贡献 +' + a.contrib, 'ok');
        if (window.SND) SND.play('upgrade');
        this.closeSheet(); this.open('legion'); this.home();
      }; });
    };

    /* 军团商店：此前只弹 toast，贡献赚了没出口（白捐）。
     * 现在按 legionShop 兑换，扣贡献发货，带限购。 */
    const ls = $('#lgShop');
    if (ls) ls.onclick = () => {
      if (!p.legion) return this.toast('请先加入军团', 'err');
      const today = new Date().toDateString();
      if (p.lgShopDate !== today) { p.lgShopDate = today; p.lgShopBuy = {}; }
      p.lgShopBuy = p.lgShopBuy || {};
      this.sheet('军团商店', `
        <div class="kv"><span>我的贡献</span><b>${E.fmt(p.legionExp || 0)}</b></div>
        ${(EX.legionShop || []).map((g) => {
          const used = p.lgShopBuy[g.id] || 0;
          const can = (p.legionExp || 0) >= g.cost && (!g.lim || used < g.lim);
          return `<div class="mc-card">
            <div class="mi">${g.icon}</div>
            <div class="mn"><b>${g.n}</b><span>${g.item === 'gold' ? ('金币 ' + E.fmt(g.n2)) : (E.itemName(g.item) + ' ×' + g.n2)}</span>
              <span>贡献 ${g.cost}${g.lim ? ' · 每日限 ' + g.lim + '（已兑 ' + used + '）' : ''}</span></div>
            <button data-lbuy="${g.id}" ${can ? '' : 'disabled'}>${can ? '兑换' : (g.lim && used >= g.lim ? '已达上限' : '贡献不足')}</button>
          </div>`;
        }).join('')}`);
      $$('[data-lbuy]').forEach((b) => { b.onclick = () => {
        const g = (EX.legionShop || []).find((x) => x.id === b.dataset.lbuy); if (!g) return;
        if ((p.legionExp || 0) < g.cost) return this.toast('贡献不足', 'err');
        const used = (p.lgShopBuy || {})[g.id] || 0;
        if (g.lim && used >= g.lim) return this.toast('已达每日兑换上限', 'err');
        p.legionExp -= g.cost;
        p.lgShopBuy[g.id] = used + 1;
        if (g.item === 'gold') p.gold = (p.gold || 0) + g.n2;
        else if (String(g.item).indexOf('gem_') === 0) {
          const gid = g.item.slice(4);
          p.gems = p.gems || {}; p.gems[gid] = (p.gems[gid] || 0) + g.n2;
        }
        /* 芯片（LS05「普通芯片」200 贡献）
         * BUG：军团商店这段是【内联发放】，只认 gold / gem_，
         *      其余一律 p.mat[g.item] —— 于是 C01 被写进 p.mat['C01']。
         *      而芯片真实存放在 p.bag，芯片面板只读 p.bag。
         * 结果：花 200 贡献兑换「普通芯片」，提示兑换成功，
         *       芯片页永远 0 颗，既不能装备也不能合成，贡献白捐。
         * （成就商店 AS09~AS11、活动商店 ES06~ES08 走 E.grant()，
         *   grant 里有 C0x 分支，所以那两处是对的；只有这条内联漏了。）
         * 顺带兼容 chipN/chipE/chipL/chipRed 与 title/frame，
         * 防止后台热更给军团商店加这些奖励时重演。 */
        else if (/^C0[1-3]$/.test(g.item) || /^chip/.test(g.item)) {
          const q = (g.item === 'C02' || g.item === 'chipE') ? '蓝'
            : (g.item === 'C01' || g.item === 'chipN' || g.item === 'chip') ? '白' : '红';
          const cnt = Math.max(1, Math.min(20, Math.floor(Number(g.n2) || 1)));
          let ok = 0;
          for (let i = 0; i < cnt; i++) {
            try { const c = E.giveChipByQuality ? E.giveChipByQuality(p, q) : null; if (c) ok++; } catch (e) {}
          }
          if (!ok) { p.mat = p.mat || {}; p.mat.M03 = (p.mat.M03 || 0) + cnt * 2; }
        }
        else if (g.item === 'title') { p.titles = p.titles || []; if (p.titles.indexOf(g.n2) < 0) p.titles.push(g.n2); }
        else if (g.item === 'frame') { p.frames = p.frames || []; if (p.frames.indexOf(g.n2) < 0) p.frames.push(g.n2); }
        else { p.mat = p.mat || {}; p.mat[g.item] = (p.mat[g.item] || 0) + g.n2; }
        E.save(p);
        this.toast('兑换成功：' + g.n, 'ok');
        if (window.SND) SND.play('get');
        this.closeSheet(); this.open('legion'); this.home();
      }; });
    };
  },

  /* ---------- 远征堡垒 ---------- */
  r_exped(p, tab) {
    if (tab === '巡逻') {
      const last = p.patrolT || 0;
      const now = Date.now();
      const hrs = Math.min(8, (now - last) / 3600000);
      const gain = Math.floor(hrs * ((p.patrolRate || 16)));
      return `<div class="card"><div class="card-t">🚩 巡逻收益
        <span class="sub">章节越高，收益越大</span></div>
        <div class="kv"><span>当前章节</span><b>第 ${p.ch || 1} 章</b></div>
        <div class="kv"><span>每小时产出</span><b>${p.patrolRate || 16} 金币</b></div>
        <div class="kv"><span>累计可领</span><b>${E.fmt((p.patrolAcc || 0) + gain)}</b></div>
        <div class="sub" style="padding:6px 2px">最长累计 8 小时，离线也会累积。</div>
        <button class="btn" id="ptClaim" style="width:100%;margin-top:6px">领取巡逻收益</button>
        <button class="btn g" id="ptFast" style="width:100%;margin-top:6px">⚡ 快速巡逻（${p.patrolFast || 0}/3）</button>
      </div>`;
    }
    return `<div class="card"><div class="card-t">远征副本</div>
      <div class="sub" style="padding:4px 2px">消耗体力挑战，产出稀有材料与宝石。</div>
      ${EX.expeds.map((e) => {
        const ok = (p.stamina || 0) >= e.cost;
        return `<div class="mc-card">
          <div class="mi">${e.icon}</div>
          <div class="mn"><b>${e.n}</b><span>${e.desc}</span>
            <span>消耗体力 ${e.cost} · 推荐战力 ${E.fmt(e.need)}</span></div>
          <button data-exped="${e.id}" ${!ok ? 'disabled' : ''}>${ok ? '挑战' : '体力不足'}</button>
        </div>`;
      }).join('')}
    </div>`;
  },
  b_exped(p, tab) {
    $$('#pnBody [data-exped]').forEach((b) => { b.onclick = () => {
      const e = EX.expeds.find((x) => x.id === b.dataset.exped); if (!e) return;
      if ((p.stamina || 0) < e.cost) return this.toast('体力不足', 'err');
      p.stamina -= e.cost;
      /* 按副本配置的 mats 精确产出（此前 M0x 全随机，与 desc 对不上） */
      const txt = ['金币+' + e.gold];
      p.gold += e.gold;
      (e.mats || [{ k: 'M01', n: e.mat }]).forEach((m) => {
        p.mat = p.mat || {};
        p.mat[m.k] = (p.mat[m.k] || 0) + m.n;
        txt.push(E.itemName(m.k) + '+' + m.n);
      });
      /* 宝石产出（此前从不发宝石，与面板描述不符） */
      if (e.gem && Math.random() < e.gem.rate) {
        const pool = (EX.gems || []).map((x) => x.id);
        if (pool.length) {
          const gid = pool[Math.floor(Math.random() * pool.length)];
          p.gems = p.gems || {};
          p.gems[gid] = (p.gems[gid] || 0) + (e.gem.n || 1);
          const gd = EX.gems.find((x) => x.id === gid);
          txt.push((gd ? gd.n : '宝石') + '+' + (e.gem.n || 1));
        }
      }
      E.save(p); this.toast('远征完成：' + txt.join('、'), 'ok');
      if (window.SND) SND.play('upgrade'); this.open('exped'); this.home();
    }; });
    const cb = $('#ptClaim');
    if (cb) cb.onclick = () => {
      const now = Date.now();
      const hrs = Math.min(8, (now - (p.patrolT || now)) / 3600000);
      const gain = Math.floor(hrs * (p.patrolRate || 16)) + (p.patrolAcc || 0);
      if (gain <= 0) return this.toast('暂无可领收益', 'err');
      p.gold += gain; p.patrolAcc = 0; p.patrolT = now;
      E.save(p); this.toast('领取 ' + E.fmt(gain) + ' 金币', 'ok'); this.open('exped', '巡逻'); this.home();
    };
    const fb = $('#ptFast');
    if (fb) fb.onclick = () => {
      if ((p.patrolFast || 0) <= 0) return this.toast('快速巡逻次数已用完', 'err');
      p.patrolFast--; p.gold += (p.patrolRate || 16) * 2;
      E.save(p); this.toast('快速巡逻完成', 'ok'); this.open('exped', '巡逻'); this.home();
    };
  },

  /* 奖励文本 */
  rwTxt(rw) {
    if (!rw) return '';
    const out = [];
    for (const k in rw) {
      if (!rw[k]) continue;
      out.push(E.itemName(k) + '×' + rw[k]);
    }
    return out.join(' ');
  },

  /* ---------- 角色 ---------- */
  /* ---------- 角色（截图41：Q版角色 + 装备/宝石/皮肤 + 橙色「装备设造」） ---------- */
  r_role(p, tab) {
    const c = E.char(p);
    const a = E.attrs(p);
    if (tab === '皮肤') {
      /* BUG1：own 判定写的是 (p.skin||[]).indexOf(...) —— 但 p.skin 是【字符串】
       *      （当前穿戴皮肤ID），已拥有列表才叫 p.skins（数组）。
       *      结果：除当前这件外，玩家已拥有的皮肤全被标成「未拥有」。
       * BUG2：格子没有任何 data-* 属性，b_role 也没有绑定
       *      → 皮肤页签是个死图库，点了完全没反应，无法切换穿戴。
       *      玩家买/领了多套皮肤后永远换不回去，皮肤加成
       *      （攻击+5%、生命+8% 等）永远卡在最后一次自动穿戴的那套。 */
      const owned = p.skins || [];
      return `<div class="card"><div class="card-t">外观
        <span class="sub">已拥有 ${owned.length} / ${(EX.skins || []).length}</span></div>
        <div class="lbl" style="text-align:left;margin-bottom:6px">点击已拥有的皮肤即可穿戴</div>
        <div class="grid3">${(EX.skins || []).map((sk) => {
          const own = sk.price === 0 || owned.indexOf(sk.id) >= 0;
          const on = (p.skin || '') === sk.id;
          const bo = sk.bonus || {};
          const bt = Object.keys(bo).map((k) => ({
            atk: '攻击', hp: '生命', crit: '暴击', spd: '移速', xp: '经验', armor: '护甲'
          }[k] || k) + '+' + Math.round(bo[k] * 100) + '%').join(' ');
          return `<div class="gcell ${on ? '' : 'sel'}" data-skb="${sk.id}"
            style="${own ? '' : 'opacity:.45'}">${sk.img
            ? `<img src="${sk.img}">` : `<div class="gi">${sk.icon}</div>`}
            <div class="gn">${sk.n}${on ? '<span class="tag y" style="font-size:8px">穿戴中</span>' : ''}</div>
            <div class="lbl" style="font-size:8px;line-height:1.3">${bt || '无加成'}${own ? '' : ' · 未拥有'}</div></div>`;
        }).join('') || '<div class="lbl">暂无外观</div>'}</div>
      </div>`;
    }
    if (tab === '宝石') {
      /* 截图41：宝石属性 tab，三颗宝石 + 绿色「卸下」+ 橙色「装备设造」 */
      const gb = E.gemBonus(p);
      return `<div class="card"><div class="card-t">宝石属性
        <span class="sub">Lv.${p.gemLv || 0}</span></div>
        ${(EX.gems || []).map((g) => {
          const on = p.gemOn === g.id;
          return `<div class="zrow">
            ${g.img ? `<div class="zav"><img src="${g.img}" style="width:100%;height:100%;object-fit:cover;border-radius:10px"></div>`
                    : `<div class="zav">${g.icon}</div>`}
            <div class="zi"><b>${g.n}</b><span>${g.desc}</span>
              <span style="color:${on ? 'var(--yel)' : 'rgba(255,255,255,.55)'}">Lv.${p.gemLv || 0}：${E.gemBonusOf ? E.gemBonusOf(p, g.id) : '—'}${on ? '（已镶嵌）' : ''}</span></div>
            ${on ? '<button class="btn g sm" data-gemoff="1">卸下</button>'
                 : `<button class="btn sm" data-gemon="${g.id}">镶嵌</button>`}
          </div>`;
        }).join('') || '<div class="lbl">暂无宝石</div>'}
        <button class="btn o" id="roleForge" style="width:100%;margin-top:8px">装备设造</button>
      </div>
      <div class="card"><div class="card-t">装备槽 <span class="sub">强化 / 进阶</span></div>
        <div class="grid4">${(EX.equipSlots || []).map((sl) => {
          const e = (p.equip || {})[sl.k] || { lv: 0 };
          return `<div class="gcell ${e.lv ? '' : 'sel'}" data-forge="${sl.k}">
            <div class="gi">${sl.icon}</div>
            <div class="gn">${sl.n}</div>
            ${e.lv ? `<span class="gq">+${e.lv}</span>` : ''}</div>`;
        }).join('')}</div>
        <div class="sub" style="margin-top:6px">点击装备槽强化，每 5 级进阶一次</div>
      </div>`;
    }
    /* 装备总览 */
    return `<div class="card" style="text-align:center">
      <div style="position:relative;display:inline-block">
        ${c.img ? `<img src="${c.img}" style="width:120px;height:160px;object-fit:cover;border-radius:14px;
          border:3px solid rgba(255,201,60,.5);box-shadow:0 6px 20px rgba(0,0,0,.5)">`
          : `<div style="font-size:70px">${c.icon}</div>`}
      </div>
      <div style="font-size:16px;font-weight:800;margin-top:6px;color:var(--yel)">${c.n}</div>
      <div class="sub">战力 ${E.fmt(E.power(p))}</div>
    </div>
    <div class="card"><div class="card-t">属性</div>
      <div class="kv"><span>攻击</span><b>${E.fmt(a.atk)}</b></div>
      <div class="kv"><span>生命</span><b>${E.fmt(a.hp)}</b></div>
      <div class="kv"><span>护甲</span><b>${a.armor}</b></div>
      <div class="kv"><span>暴击</span><b>${(a.crit * 100).toFixed(1)}%</b></div>
      <div class="kv"><span>吸血</span><b>${(a.ls * 100).toFixed(1)}%</b></div>
    </div>
    <div class="card"><div class="card-t">角色升星
      <span class="sub">${p.charStar || 0} / ${EX.STAR_MAX} 星</span></div>
      <div class="stars">${[1, 2, 3, 4, 5].map((i) =>
        `<span class="star ${(p.charStar || 0) >= i ? 'on' : ''}">★</span>`).join('')}</div>
      <div class="sub">每星全属性 +8%，当前 +${Math.round((p.charStar || 0) * 8)}%</div>
      <div class="kv"><span>角色碎片</span><b>${(p.mat || {}).P02 || 0}</b></div>
      <div class="kv"><span>下级所需</span><b>${EX.starCost[(p.charStar || 0) + 1] || '已满级'}</b></div>
      <button class="btn" id="roleStar" style="width:100%;margin-top:8px">⭐ 升星</button>
    </div>
    <button class="btn o" id="roleForge" style="width:100%">装备设造</button>`;
  },
  b_role(p, tab) {
    $$('#pnBody [data-gemon]').forEach((b) => { b.onclick = () => {
      const g = (EX.gems || []).find((x) => x.id === b.dataset.gemon);
      if (!((p.gems || {})[b.dataset.gemon] > 0)) return this.toast('该宝石数量不足', 'err');
      p.gemOn = b.dataset.gemon; E.save(p);
      this.toast('已镶嵌 ' + g.n, 'ok'); this.open('role', '宝石'); this.home();
    }; });
    $$('#pnBody [data-gemoff]').forEach((b) => { b.onclick = () => {
      p.gemOn = null; E.save(p); this.toast('已卸下', 'ok'); this.open('role', '宝石'); this.home();
    }; });
    $$('#pnBody [data-forge]').forEach((b) => { b.onclick = () => {
      const r = E.forgeEquip(p, b.dataset.forge);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('upgrade'); this.open('role', '宝石'); this.home(); }
    }; });
    /* 皮肤穿戴：点击已拥有的皮肤切换（此前死图库，点了没反应） */
    $$('#pnBody [data-skb]').forEach((el) => { el.onclick = () => {
      const id = el.dataset.skb;
      if ((p.skins || []).indexOf(id) < 0) {
        const sk = (EX.skins || []).find((x) => x.id === id);
        return this.toast('尚未拥有「' + (sk ? sk.n : id) + '」', 'err');
      }
      p.skin = id; E.save(p);
      if (window.SND) SND.play('pickup');
      this.toast('已穿戴 ' + (((EX.skins || []).find((x) => x.id === id)) || {}).n, 'ok');
      this.open('role', '皮肤'); this.home();
    }; });
    /* 升星按钮：渲染了（r_role 里 id="roleStar"）但从未绑定 onclick
     * → 玩家点「⭐ 升星」完全没反应，花碎片升星的入口等于不存在。 */
    const sb = $('#roleStar');
    if (sb) sb.onclick = () => {
      const r = E.starUp(p);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('upgrade'); this.open('role', '角色'); this.home(); }
    };
    const fb = $('#roleForge');
    if (fb) fb.onclick = () => this.open('role', '宝石');
  },

  r_gun(p, tab) {
    if (tab === '武器库') {
      return `<div class="card"><div class="card-t">武器库 <span class="sub">主武器 6 + 副武器 4</span></div>
      ${['主', '副'].map((kind) => `<div class="lbl" style="color:var(--gold);margin-top:6px">${kind}武器</div>
      ${EX.guns.filter((g) => g.kind === kind).map((g) => {
        const ok = E.gunUnlocked(p, g.id);
        const on = p.gun === g.id;
        return `<div class="item"><div class="ic" style="border:1.5px solid ${EX.qColor[g.q]}">${g.img
          ? `<img src="${g.img}" style="width:30px;height:30px;border-radius:6px;object-fit:cover">`
          : g.icon}</div>
          <div class="info"><div class="nm"><span style="color:${EX.qColor[g.q]}">${g.q}</span> ${g.n} <span class="tag">${g.type}</span></div>
          <div class="sub">伤害${g.dmg} 射速${g.rate}/s 弹夹${g.mag} 换弹${g.reload}s ${g.pellets > 1 ? '弹丸' + g.pellets : ''} ${g.pierce ? '穿透' + g.pierce : ''}</div>
          <div class="sub">${g.bullet}${ok ? '' : ' · 需通关 ' + g.unlockLv}</div></div>
          <div class="act">${on ? '<span class="tag g">使用中</span>' : ok ? `<button class="btn c sm" data-gun="${g.id}">装备</button>` : '<span class="tag r">未解锁</span>'}</div></div>`;
      }).join('')}`).join('')}</div>`;
    }
    const g = E.gun(p), a = E.attrs(p), c = E.gunUpgradeCost(p);
    const adv = E.advInfo(p.gunLv);
    const nextAdv = EX.gunAdvance[Math.min(EX.gunAdvance.length - 1, E.advOf(p.gunLv) + 1)];
    return `<div class="card"><div class="card-t">当前武器</div>
      <div style="text-align:center;padding:6px 0">
        ${g.img ? `<img src="${g.img}" style="width:96px;height:96px;object-fit:contain;border-radius:10px"
             onerror="this.style.display='none'">` : ''}
        <div style="font-size:26px">${g.icon}</div>
        <div style="color:${EX.qColor[adv.q]};font-weight:700;margin-top:2px">${g.n}</div>
        <div style="font-size:10px;color:#7d8ca8">${g.kind}武器 · ${g.type} · ${adv.q}品</div>
      </div></div>
      <div class="card"><div class="card-t">武器属性</div>
      <div class="kv"><span>品质</span><b style="color:${EX.qColor[adv.q]}">${adv.q}品</b></div>
      <div class="kv"><span>等级</span><b>Lv.${p.gunLv}</b></div>
      <div class="kv"><span>面板伤害</span><b>${g.dmg} → <span style="color:var(--gold)">${E.fmt(a.gunBase)}</span></b></div>
      <div class="kv"><span>射速</span><b>${a.rate.toFixed(2)} /秒</b></div>
      <div class="kv"><span>弹夹容量</span><b>${a.mag} 发</b></div>
      <div class="kv"><span>换弹时间</span><b>${g.reload} 秒</b></div>
      <div class="kv"><span>弹丸 / 穿透</span><b>${g.pellets || 1} / ${a.pierce}</b></div>
      <div class="kv"><span>子弹类型</span><b>${g.bullet}</b></div>
      <button class="btn c blk" id="gunUp" ${p.gold < c ? 'disabled' : ''}>强化 · ${E.fmt(c)} 金币</button>
      <div class="lbl">每级 +${(E.GUN_GROW * 100).toFixed(0)}% 伤害；每 5 级进阶一次（${adv.q}→${nextAdv.q}），进阶解锁词条槽。</div></div>
      <div class="card"><div class="card-t">已解锁词条
        <span class="sub">${Object.keys(p.gunStats || {}).length} / ${E.gunAffixSlots(p, p.gun)} 槽</span></div>
      ${Object.keys(p.gunStats || {}).length ? Object.values(p.gunStats || {}).map((st) => {
        const d = EX.gunStats.find((x) => (st.id ? x.id === st.id : x.k === st.k));
        const qc = st.q === '红' ? '#ff5c7a' : st.q === '紫' ? '#c98bff' : st.q === '蓝' ? '#5cb8ff' : '#9fb3d0';
        return `<div class="kv"><span style="color:${qc}">${d ? d.n : st.k}${st.q ? ' <span class="tag" style="background:' + qc + '22;color:' + qc + '">' + st.q + '</span>' : ''}</span>
          <b style="color:var(--green)">+${d && d.unit === '%' ? (st.v * 100).toFixed(1) + '%' : st.v.toFixed(2)}</b></div>`;
      }).join('') : '<div class="lbl">尚未进阶，暂无词条</div>'}
      <button class="btn o blk" id="gunReroll" ${E.gunAffixSlots(p, p.gun) <= 0 ? 'disabled' : ''}>🔄 洗练词条（💎${EX.REROLL_GUN_COST}）</button>
      <div class="lbl">洗练将重随机全部已解锁词条，按品质加权：蓝60% / 紫30% / 红10%。</div></div>

      <div class="card"><div class="card-t">武器词条 <span class="sub">表30 · ${g.slots || 2} 槽位</span></div>
      ${E.gunAffixes(p).map((af, i) => {
        const a = EX.affixOf(af.id); if (!a) return '';
        const qc = EX.qColor[a.q] || '#ccc';
        return `<div class="kv"><span><span class="tag" style="background:${qc}22;color:${qc}">${a.q}</span> ${EX.affixTxt(af)}</span>
          <b style="color:var(--green)">${a.eff}</b></div>`;
      }).join('') || '<div class="lbl">暂无词条</div>'}
      <div class="sub" style="margin-top:4px">词条加成已计入战斗属性（伤害/攻速/暴击/穿透/吸血/弹夹…）</div>
      <button class="btn blk" id="gunAfReroll">🔄 普通洗练（🪙${E.fmt(EX.AFFIX_REROLL_GOLD)}）</button>
      <button class="btn o blk" id="gunAfRerollL">🔴 传说洗练（💎${EX.AFFIX_REROLL_LEGEND_DIA}）必出红词条</button>
    </div>`;
  },
  b_gun(p, tab) {
    const rr = $('#gunReroll');
    if (rr) rr.onclick = () => {
      const r = E.rerollGun(p, p.gun); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('upgrade'); this.open('gun', tab); this.home(); }
    };
    const u = $('#gunUp'); if (u) u.onclick = () => {
      const r = E.upgradeGun(p); this.toast(r.msg, r.ok ? 'ok' : 'err');
      try { OPS.track('weapon_upgrade', { lv: p.gunLv }); } catch (e) {}
      if (r.ok) { this.open('gun', tab); this.home(); }
    };
    /* 表30 武器词条洗练 */
    const ar = $('#gunAfReroll');
    if (ar) ar.onclick = () => {
      const r = E.rerollAffix(p, false); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('upgrade'); this.open('gun', tab); this.home(); }
    };
    const arl = $('#gunAfRerollL');
    if (arl) arl.onclick = () => {
      const r = E.rerollAffix(p, true); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('upgrade'); this.open('gun', tab); this.home(); }
    };
    $$('#pnBody [data-gun]').forEach((b) => {
      b.onclick = () => { const r = E.switchGun(p, b.dataset.gun); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('gun', '武器库'); this.home(); } };
    });
  },

  /* ---------- 芯片 ---------- */
  r_chip(p, tab) {
    if (!E.chipUnlocked(p)) return '<div class="empty"><span class="ic">🔲</span>芯片系统未解锁<br><span style="font-size:10px">通关 1-4 后开启</span></div>';
    if (tab === '背包') {
      const bag = p.bag || [];
      if (!bag.length) return '<div class="empty"><span class="ic">🔲</span>暂无芯片<br><span style="font-size:10px">BOSS 关掉落 / 活动获取</span></div>';
      return `<div class="card"><div class="card-t">芯片背包 <span class="sub">${bag.length} 块</span></div>
      ${bag.map((c) => `<div class="item">
        <div class="ic" style="border:1.5px solid ${EX.qColor[c.q]}">
          <img src="assets/icon/i_chip.jpg" style="width:30px;height:30px;border-radius:6px;object-fit:cover"
               onerror="this.outerHTML='🔲'"></div>
        <div class="info"><div class="nm" style="color:${EX.qColor[c.q]}">${E.chipName(c)}</div>
        <div class="sub">${(E.chipDef(c.def) || {}).src || ''}</div></div>
        <div class="act">
          <button class="btn sm" data-fuse="${c.id}">合成</button>
          <button class="btn sm" data-rr="${c.id}">洗练</button>
          <button class="btn d sm" data-dec="${c.id}">拆解</button>
        </div></div>`).join('')}</div>
        <div class="lbl">合成：3 块同品质 → 升一级（白→蓝→红）。洗练：钻石重 roll 副词条。</div>`;
    }
    /* 截图特征：顶部「全线战力」 */
    return `<div class="card"><div class="card-t">全线战力
      <span class="sub" style="color:var(--yel);font-size:13px;font-weight:800">${E.fmt(E.power(p))}</span></div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="zav">🧟</div>
        <div class="grid4" style="flex:1">${(p.bag || []).slice(0, 4).map((c) =>
          `<div class="gcell"><div class="gi" style="color:${EX.qColor[c.q]}">🔲</div>
           <div class="gn" style="color:${EX.qColor[c.q]}">${c.q}品</div></div>`).join('')
          || '<div class="lbl">未装芯片</div>'}</div>
        <div class="zav" style="background:linear-gradient(160deg,#78909c,#455a64)">🔫</div>
      </div></div>
      <div class="card"><div class="card-t">芯片槽 <span class="sub">${Object.keys(p.chips || {}).length}/6</span></div>
      <div class="lvgrid">${EX.chipSlots.map((s) => {
        const c = p.chips[s.k];
        return `<button class="lvc ${this.selChipSlot === s.k ? 'cur' : ''}" data-slot="${s.k}">
          <i style="font-size:18px;font-style:normal;display:block">${c ? '🔲' : '➕'}</i>
          <b style="font-size:9px;color:${c ? EX.qColor[c.q] : '#6b7899'}">${c ? c.q + '品' : '空'}</b></button>`;
      }).join('')}</div>
      ${(() => { const c = (p.chips || {})[this.selChipSlot || EX.chipSlots[0].k];
        return c ? `<button class="btn n sm" data-chipoff="1" style="width:100%;margin-top:8px">卸下当前槽位芯片</button>`
                 : '<div class="lbl" style="margin-top:8px">选中槽位为空，无需卸下</div>'; })()}</div></div>
      <div class="card"><div class="card-t">可装备芯片</div>
      ${(p.bag || []).length ? (p.bag || []).map((c) => `<div class="item">
        <div class="ic" style="border:1.5px solid ${EX.qColor[c.q]}">
          <img src="assets/icon/i_chip.jpg" style="width:30px;height:30px;border-radius:6px;object-fit:cover"
               onerror="this.outerHTML='🔲'"></div>
        <div class="info"><div class="nm" style="color:${EX.qColor[c.q]}">${E.chipName(c)}</div></div>
        <div class="act"><button class="btn c sm" data-wear="${c.id}">装上</button></div></div>`).join('')
        : '<div class="lbl">背包内暂无芯片</div>'}</div>
      <button class="btn o" id="chipEquip" style="width:100%;margin:8px 0">装 备 芯 片</button>
      <div class="card"><div class="card-t">芯片图鉴 <span class="sub">资料 8 种</span></div>
      ${EX.chips.map((d) => `<div class="kv"><span style="color:${EX.qColor[d.q]}">${d.n}</span>
        <b style="font-size:10px">主+${(d.main.v * 100).toFixed(0)}%${d.subPool.length ? ' · 词条' + d.subPool.length : ''} · ${d.src}</b></div>`).join('')}</div>`;
  },
  b_chip(p, tab) {
    const ce = $('#chipEquip');
    if (ce) ce.onclick = () => {
      const bag = p.bag || [];
      if (!bag.length) return this.toast('背包内暂无芯片', 'err');
      const free = EX.chipSlots.find((s) => !p.chips[s.k]);
      if (!free) return this.toast('芯片槽已满', 'err');
      const c = bag[0];
      p.chips[free.k] = c; p.bag = bag.filter((x) => x.id !== c.id);
      E.save(p); this.toast('已装备 ' + E.chipName(c), 'ok');
      if (window.SND) SND.play('upgrade'); this.open('chip'); this.home();
    };
    $$('#pnBody [data-slot]').forEach((b) => { b.onclick = () => { this.selChipSlot = b.dataset.slot; this.open('chip', tab); }; });
    /* 卸下芯片
     * BUG：E.unequipChip() 定义了却零调用，面板上也只有「装上」没有「卸下」。
     * 玩家把 6 个槽位装满后，只能靠拿另一颗芯片顶替（equipChip 会把旧的退回背包），
     * 但【无法主动清空某个槽位】——想卸下来拿去合成/拆解/洗练都做不到。
     * 这里补上按钮并接上已有的引擎方法。 */
    $$('#pnBody [data-chipoff]').forEach((b) => { b.onclick = () => {
      const r = E.unequipChip(p, this.selChipSlot || EX.chipSlots[0].k);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { E.save(p); this.open('chip', tab); this.home(); }
    }; });
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
    if (!E.sysUnlocked(p, 'talent')) return '<div class="empty"><span class="ic">⭐</span>天赋系统未解锁<br><span style="font-size:10px">通关 1-3 后开启</span></div>';
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
        ${lock ? `<div class="sub" style="color:#ff8fa4">需通关 ${t.unlock} 解锁</div>` : ''}</div>
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
  /* 任务图标（按条件类型） */
  taskIcon(t) {
    const m = {
      clearLv: '🎯', kills: '🧟', dailyKill: '🔫', dailyClear: '🏁',
      login: '📅', weekClear: '🏆', weekKill: '💀', bossKill: '👹',
      noHitKill: '✨', endlessTime: '♾️',
    };
    return m[(t.cond || {}).t] || '📋';
  },

  /* ---------- 任务（截图：主线/日常/成就 + 黄色「前往任务」） ---------- */
  r_task(p, tab) {
    const DONE = '✔';
    if (tab === '周常') {
      return `<div class="card"><div class="card-t">周常任务 <span class="sub">每周刷新</span></div>
        ${(EX.tasks.weekly || []).map((t) => {
          const cur = E.taskProg(p, t), need = t.cond.v || t.need || 1, done = cur >= need;
          return `<div class="zrow">
            <div class="zav">🏆</div>
            <div class="zi"><b>${t.n}</b><span>${cur}/${need} · ${t.desc || ''}</span></div>
            ${done ? `<button class="btn sm g" data-wq="${t.id}">领取</button>`
                   : '<span class="st off">未完成</span>'}</div>`;
        }).join('') || '<div class="lbl">暂无周常</div>'}
        <div class="sub" style="padding:6px 2px">每周一 0 点刷新，奖励钻石与稀有材料。</div>
      </div>`;
    }
    if (tab === '日常') {
      return `<div class="card"><div class="card-t">日常任务 <span class="sub">每日刷新</span></div>
        ${EX.tasks.daily.map((t) => {
          const need = t.need || (t.cond ? t.cond.v : 1);
          const cur = E.taskProg(p, t), done = cur >= need;
          return `<div class="zrow">
            <div class="zav">${this.taskIcon(t)}</div>
            <div class="zi"><b>${t.n}</b><span>${cur}/${need}</span></div>
            ${done ? `<button class="btn sm g" data-dq="${t.id}">领取</button>`
                   : '<span class="st off">未完成</span>'}</div>`;
        }).join('')}
      </div>
      <button class="btn" id="goTask" style="width:100%;margin-top:8px">前往任务</button>`;
    }
    if (tab === '成就') {
      return `<div class="card"><div class="card-t">成就
        <span class="sub">${EX.tasks.achieve.filter((a) => E.taskDone(p, a)).length}/${EX.tasks.achieve.length}</span></div>
        <div class="kv"><span>成就点</span><b style="color:var(--yel)">${p.ach || 0}</b></div>
        <button class="btn o blk" id="toAchShop">🔄 前往成就商店</button>
      </div>
      <div class="card"><div class="card-t">成就列表</div>
        ${EX.tasks.achieve.map((a) => {
          const done = E.taskDone(p, a);
          const got = (p.achGot || {})[a.id] || done;
          const claimed = (p.tasks.achieveClaimed || []).indexOf(a.id) >= 0;
          return `<div class="zrow">
            <div class="zav">${this.taskIcon(a)}</div>
            <div class="zi"><b>${a.n}</b><span>${a.desc}</span>
              <span style="color:var(--yel)">成就点 +${a.rw.ach || 0}</span></div>
            ${claimed ? '<span class="st on">已领取</span>'
              : (done ? `<button class="btn sm g" data-aq="${a.id}">领取</button>`
                      : '<span class="st off">未达成</span>')}</div>`;
        }).join('')}</div>`;
    }
    /* 主线（截图：清除僵尸/通关关卡/收集材料/领取奖励 + 紫宝石金币奖励） */
    return `<div class="card"><div class="card-t">主线任务
      <span class="sub">第 ${p.ch || 1} 章</span></div>
      ${EX.tasks.main.map((t) => {
        const need = t.need || (t.cond && t.cond.t === 'clearLv' ? 1 : (t.cond ? t.cond.v : 1));
        const cur = E.taskProg(p, t), done = cur >= need;
        return `<div class="zrow">
          <div class="zav">${this.taskIcon(t)}</div>
          <div class="zi"><b>${t.n}</b><span>${Math.min(cur, need)}/${need}</span>
            <span>💎${t.rw.diamond || 0} 🪙${t.rw.gold || 0}</span></div>
          ${done ? `<button class="btn sm g" data-mq="${t.id}">领取</button>`
                 : '<span class="st off">进行中</span>'}</div>`;
      }).join('')}
      </div>
      <button class="btn" id="goTask" style="width:100%;margin-top:8px">前往任务</button>`;
  },
  b_task(p, tab) {
    const gb = $('#goTask');
    const asb = $('#toAchShop');
    if (asb) asb.onclick = () => this.open('ashop', '成就商店');
    $$('#pnBody [data-aq]').forEach((b) => { b.onclick = () => {
      const r = E.claimTask(p, 'achieve', b.dataset.aq); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('pickup'); this.open('task'); this.home(); }
    }; });
    if (gb) gb.onclick = () => { this.close(); this.open('level', '章节'); };
    $$('#pnBody [data-mq]').forEach((b) => { b.onclick = () => {
      const r = E.claimTask(p, 'main', b.dataset.mq); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { this.open('task'); this.home(); }
    }; });
    $$('#pnBody [data-wq]').forEach((b) => { b.onclick = () => {
      const r = E.claimTask(p, 'weekly', b.dataset.wq); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('pickup'); this.open('task'); this.home(); }
    }; });
    $$('#pnBody [data-dq]').forEach((b) => { b.onclick = () => {
      const r = E.claimTask(p, 'daily', b.dataset.dq); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { this.open('task'); this.home(); }
    }; });
  },

  /* 僵尸 Q 版头像（按 id 稳定取一个） */
  zAvatar(seed) {
    const arr = EX.zAvatars || [];
    if (!arr.length) return '🧟';
    let h = 0; const str = String(seed || 'z');
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return arr[h % arr.length];
  },
  zAvatarHTML(seed, cls) {
    const u = this.zAvatar(seed);
    return u.indexOf('assets/') === 0
      ? `<div class="zav ${cls || ''}"><img src="${u}" style="width:100%;height:100%;object-fit:cover;border-radius:10px"></div>`
      : `<div class="zav ${cls || ''}">${u}</div>`;
  },

  r_bag(p, tab) {
    /* 表16 消耗品（I01~I04）：此前有数据但无使用入口 */
    if (tab === '消耗') {
      const items = (EX.items || []).filter((x) => x.type === '消耗');
      const pend = p.pendingItem || {};
      return `<div class="card"><div class="card-t">消耗品 <span class="sub">战斗中生效</span></div>
        ${items.length ? items.map((it) => {
          const n = p.mat[it.id] || 0;
          const def = E.ITEM_USE[it.id] || {};
          return `<div class="zrow">
            ${it.img ? `<img class="zav" src="${it.img}" style="object-fit:cover">`
                     : `<div class="zav">${it.icon}</div>`}
            <div class="zi"><b>${it.n} ×${n}</b><span>${def.desc || it.use || ''}</span>
              ${pend[it.id] ? `<span style="color:#7ee38a;font-size:9px">下一场生效 ×${pend[it.id]}</span>` : ''}</div>
            <div style="display:flex;flex-direction:column;gap:3px">
              <button class="btn sm" data-use="${it.id}" ${n > 0 ? '' : 'disabled'}>使用</button>
              ${it.id === 'I04' ? `<button class="btn sm" data-use10="${it.id}" ${n >= 10 ? '' : 'disabled'} style="font-size:9px">开10个</button>` : ''}
            </div></div>`;
        }).join('') : '<div class="lbl">暂无消耗品</div>'}
        <div class="lbl" style="text-align:left;margin-top:6px">战斗中点击立即生效；战斗外使用将在下一场自动生效</div>
      </div>`;
    }

    const GEMC = { r: 'gem r', b: 'gem b', g: 'gem g', p: 'gem p' };
    if (tab === '宝石') {
      const gs = EX.gems || [];
      return `<div class="card"><div class="card-t">宝石 <span class="sub">镶嵌到装备提升属性</span></div>
        <div class="grid4">${gs.length ? gs.map((g) => {
          const n = (p.gems || {})[g.id] || 0;
          return `<div class="gcell ${n ? '' : 'sel'}" data-gem="${g.id}">
            ${g.img ? `<img src="${g.img}" style="width:60%;height:60%;object-fit:contain">`
                    : `<div class="${GEMC[g.c] || 'gem'}">${g.icon || '💎'}</div>`}
            <div class="gn">${g.n}</div>
            ${n ? `<span class="gq">×${n}</span>` : ''}${n == 0 ? '' : '<i class="gdot"></i>'}</div>`;
        }).join('') : '<div class="lbl">暂无宝石</div>'}</div>
      </div>
      <button class="btn" id="goGem" style="width:100%;margin-top:8px">💎 前往宝石镶嵌</button>`;
    }
    if (tab === '装备') {
      const eq = p.equip || {};
      return `<div class="card"><div class="card-t">装备</div>
        <div class="grid4">${(EX.equipSlots || []).map((sl) => {
          const it = eq[sl.k];
          return `<div class="gcell"><div class="gi">${it ? (it.icon || '🎽') : (sl.icon || '⬜')}</div>
            <div class="gn">${sl.n}</div>${it ? '<i class="gdot"></i>' : ''}</div>`;
        }).join('') || '<div class="lbl">暂无装备槽</div>'}</div>
      </div>`;
    }
    if (tab === '芯片') {
      const cs = Object.keys(p.chips || {});
      return `<div class="card"><div class="card-t">芯片 <span class="sub">${cs.length} 个</span></div>
        <div class="grid4">${cs.length ? cs.map((id) => {
          const c = p.chips[id];
          return `<div class="gcell"><div class="gi">${c.icon || '🔲'}</div>
            <div class="gn">${c.n || '芯片'}</div><span class="gq">Lv${c.lv || 1}</span></div>`;
        }).join('') : '<div class="lbl">芯片背包为空</div>'}</div>
      </div>
      <button class="btn o" id="goChip" style="width:100%;margin-top:8px">🔲 前往芯片系统</button>`;
    }
    /* 材料 */
    return `<div class="card"><div class="card-t">材料</div>
      <div class="grid4">${EX.items.filter((x) => x.type === '材料' || x.type === '碎片').map((it) => {
        const n = (p.mat || {})[it.id] || 0;
        return `<div class="gcell ${n ? '' : 'sel'}">${it.img
          ? `<img src="${it.img}">` : `<div class="gi">${it.icon}</div>`}
          <div class="gn">${it.n}</div>${n ? `<span class="gq">${n > 9999 ? (n / 1000).toFixed(1) + 'k' : n}</span>` : ''}</div>`;
      }).join('')}</div></div>
      <div class="card"><div class="card-t">分解 <span class="sub">碎片/芯片 → 金币</span></div>
        ${['P01', 'P02'].map((id) => {
          const n = (p.mat || {})[id] || 0;
          const rate = E.DISMANTLE_RATE[id];
          return `<div class="zrow"><div class="zav">🧩</div>
            <div class="zi"><b>${E.itemName(id)}</b><span>×${n} · 单价 ${rate} 金币</span></div>
            <button class="btn sm ${n ? '' : 'd'}" data-dec2="${id}" ${n ? '' : 'disabled'}>分解</button></div>`;
        }).join('')}
        ${['白', '蓝', '红'].map((q) => {
          const n = E.chipCountByQ(p, q);
          const rate = ({ '白': 200, '蓝': 500, '红': 1200 })[q];
          return `<div class="zrow"><div class="zav">🔲</div>
            <div class="zi"><b>${q}色芯片</b><span>背包 ×${n} · 单价 ${rate} 金币</span></div>
            <button class="btn sm ${n ? '' : 'd'}" data-decq="${q}" ${n ? '' : 'disabled'}>分解</button></div>`;
        }).join('')}
        <button class="btn o blk" id="bagDecAll">一键分解全部碎片</button>
      </div>
      <div class="card"><div class="card-t">宝箱 <span class="sub">表31 DR11</span></div>
        <div class="kv"><span>持有宝箱</span><b>${(p.mat || {}).I04 || 0}</b></div>
        <div class="sub">开启可得：合金 3-5 个（70% 概率）</div>
        <button class="btn blk" id="bagChest1">开启 1 个</button>
        <button class="btn o blk" id="bagChest10">开启 10 个</button>
      </div>
      <div class="card"><div class="card-t">消耗品
        <span class="sub">点击使用</span></div>
      <div class="grid4">${EX.items.filter((x) => x.type === '消耗').map((it) => {
        /* 此前读 (p.use||{})[it.id] —— 但消耗品统一存放在 p.mat，
         * p.use 只有 newPlayer 里建了个全 0 的空壳，main.js 还会把它清空。
         * 结果：这里永远显示 ×0（连数量都不显示），玩家以为自己没有消耗品，
         * 实际 p.mat.I01/I02/I03 里躺着一堆。
         * 同时格子没有任何 data-* / onclick，点了完全没反应。 */
        const n = (p.mat || {})[it.id] || 0;
        return `<div class="gcell ${n ? '' : 'sel'}" data-bu="${it.id}" style="${n ? '' : 'opacity:.45'}">${it.img
          ? `<img src="${it.img}">` : `<div class="gi">${it.icon}</div>`}
          <div class="gn">${it.n}</div>${n ? `<span class="gq">×${n}</span>` : ''}</div>`;
      }).join('')}</div>
      <div class="lbl" style="text-align:left;margin-top:4px">战斗中点击立即生效；战斗外使用将在下一场自动生效</div></div>`;
  },
  b_bag(p, tab) {
    /* 表16 消耗品使用 */
    $$('#pnBody [data-use]').forEach((b) => { b.onclick = () => {
      const r = E.useItem(p, b.dataset.use);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('get'); E.save(p); this.open('bag', tab); this.home(); }
    }; });
    $$('#pnBody [data-use10]').forEach((b) => { b.onclick = () => {
      if ((p.mat[b.dataset.use10] || 0) < 10) return this.toast('宝箱不足 10 个', 'err');
      const rw = E.openBox(p, 10);
      this.toast('开启 10 个宝箱：' + rw, 'ok');
      if (window.SND) SND.play('get');
      E.save(p); this.open('bag', tab); this.home();
    }; });

    const c1 = $('#bagChest1'), c10 = $('#bagChest10');
    if (c1) c1.onclick = () => {
      const r = E.openChest(p, 1); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('pick'); this.open('bag', '材料'); this.home(); }
    };
    if (c10) c10.onclick = () => {
      const r = E.openChest(p, 10); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('pick'); this.open('bag', '材料'); this.home(); }
    };
    /* 表05 第9项：分解碎片 */
    $$('#pnBody [data-dec2]').forEach((b) => { b.onclick = () => {
      const r = E.dismantleMat(p, b.dataset.dec2, 1);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('coin'); this.open('bag', '材料'); this.home(); }
    }; });
    /* 芯片分解按钮（此前 C01/C02/C03 显示的是三个角色名且按钮永远灰着） */
    $$('#pnBody [data-decq]').forEach((b) => { b.onclick = () => {
      const r = E.dismantleChip(p, b.dataset.decq);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('coin'); E.save(p); this.open('bag', '材料'); this.home(); }
    }; });
    /* 材料页「消耗品」格子：此前无绑定，点了没反应 */
    $$('#pnBody [data-bu]').forEach((el) => { el.onclick = () => {
      const r = E.useItem(p, el.dataset.bu);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('pickup'); this.open('bag', '材料'); this.home(); }
    }; });
    const da = $('#bagDecAll');
    if (da) da.onclick = () => {
      const r = E.dismantleAll(p); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('coin'); this.open('bag', '材料'); this.home(); }
    };
    const g1 = $('#goGem'); if (g1) g1.onclick = () => this.open('gem');
    const g2 = $('#goChip'); if (g2) g2.onclick = () => this.open('chip');
    /* 宝石格子点击：渲染用的是 data-gem，此前全项目没有任何地方绑定它
     * （只有宝石镶嵌面板的 data-gsel 有绑定），点了完全没反应。
     * 格子带选中态和红点，视觉上是可交互的，现在补上跳转。 */
    $$('#pnBody [data-gem]').forEach((el) => { el.onclick = () => {
      this.gemSel = el.dataset.gem; this.open('gem');
    }; });
  },

  /* ---------- 商店（截图：每日/武器/宝石/材料 三列网格） ---------- */
  r_shop(p, tab) {
    const goods = (EX.shopGoods || {})[tab] || [];
    return `<div class="card"><div class="card-t">${tab}
      <span class="sub">🪙 ${E.fmt(p.gold)} · 💎 ${E.fmt(p.diamond)}</span></div>
      <div class="grid3">${(tab === '直购') ? `
        <div class="card" style="grid-column:1/-1"><div class="card-t">月卡 <span class="sub">SH05 每日领</span></div>
          ${E.monthCardLeft(p) > 0 ? `
            <div class="kv"><span>剩余天数</span><b>${E.monthCardLeft(p)} 天</b></div>
            <div class="kv"><span>今日状态</span><b>${(p.monthCard && p.monthCard.last === new Date(Date.now()+8*3600000).toISOString().slice(0,10)) ? '已领取' : '待领取'}</b></div>
            <button class="btn blk" id="shMcClaim" style="margin-top:6px">📅 领取今日（钻石50+体力60）</button>`
            : `<div class="lbl">未开通 · 在上方购买「月卡」后 30 天内每日可领</div>`}
        </div>
        <div class="card" style="grid-column:1/-1"><div class="card-t">战令 <span class="sub">${p.passAdv ? '进阶版' : '普通版'} · 当前 ${E.passLevel(p)} 关</span></div>
          <div class="lbl" style="text-align:left;margin-bottom:5px">按通关关卡数解锁，${p.passAdv ? '可领进阶档（额外钻石30）' : '购买「战令(进阶)」解锁高级奖励'}</div>
          ${E.PASS_TIERS.map((t, i) => {
            const un = E.passLevel(p) >= t.lv;
            const gn = (p.passClaimed || {})['p' + i + 'n'];
            const ga = (p.passClaimed || {})['p' + i + 'a'];
            return `<div class="zrow" style="${un ? '' : 'opacity:.5'}">
              <div class="zav">${un ? '🎖️' : '🔒'}</div>
              <div class="zi"><b>Lv.${t.lv} ${t.n}</b><span>${un ? '可领取' : '通关 ' + t.lv + ' 关解锁'}</span></div>
              <div style="display:flex;flex-direction:column;gap:3px">
                <button class="btn sm" data-psn="${i}" ${(un && !gn) ? '' : 'disabled'}>${gn ? '已领' : '普通'}</button>
                <button class="btn sm" data-psa="${i}" ${(un && !ga && p.passAdv) ? '' : 'disabled'} style="font-size:9px">${ga ? '已领' : '进阶'}</button>
              </div></div>`;
          }).join('')}
        </div>
      ` : ''}${goods.length ? goods.map((g) => {
        const can = (p[g.cur || 'gold'] || 0) >= g.price;
        /* 表35：礼包限购状态 */
        let lm = null;
        if (g.limit) { try { lm = E.giftCan(p, g); } catch (e) { lm = null; } }
        const blocked = lm && !lm.ok;
        return `<div class="gcell">
          ${g.img ? `<img src="${g.img}">` : `<div class="gi">${g.icon}</div>`}
          <div class="gn">${g.n}${g.rmb ? `<span class="tag y" style="font-size:8px">${g.rmb}</span>` : ''}</div>
          ${g.desc ? `<div class="lbl" style="font-size:8px;line-height:1.3;margin:2px 0">${g.desc}</div>` : ''}
          <button class="btn sm" data-buy="${g.id}" ${(can && !blocked) ? '' : 'disabled'}
            style="font-size:9px;padding:3px 6px;margin-top:2px">
            ${g.price === 0 ? '免费领取' : (g.cur === 'diamond' ? '💎' : '🪙') + g.price}</button>
          ${lm ? `<div class="lbl" style="font-size:8px;color:${lm.ok ? '#7ee38a' : '#ff8a8a'}">${lm.msg}</div>` : ''}
        </div>`;
      }).join('') : '<div class="lbl">暂无商品</div>'}</div>
    </div>`;
  },
  b_shop(p, tab) {
    $$('#pnBody [data-buy]').forEach((b) => { b.onclick = () => {
      const goods = (EX.shopGoods || {})[tab] || [];
      const g = goods.find((x) => x.id === b.dataset.buy); if (!g) return;
      const cur = g.cur || 'gold';
      /* 表35 限购校验 */
      if (g.limit) {
        let lm = null; try { lm = E.giftCan(p, g); } catch (e) { lm = null; }
        if (lm && !lm.ok) return this.toast(lm.msg, 'err');
      }
      if ((p[cur] || 0) < g.price) return this.toast('货币不足', 'err');
      p[cur] -= g.price;
      if (g.give) for (const k in g.give) {
        if (k === 'gold') p.gold += g.give[k];
        else if (k === 'diamond') {
          /* 表22 EV04 首充双倍：首次购买钻石类商品翻倍 */
          let amt = g.give[k];
          if (amt > 0) {
            const fr = E.applyFirstRecharge(p, amt);
            if (fr.doubled) this.toast('🎉 首充双倍！钻石 ' + g.give[k] + ' → ' + fr.amt, 'ok');
            amt = fr.amt;
          }
          p.diamond = (p.diamond || 0) + amt;
        }
        else if (k === 'stamina') p.stamina = (p.stamina || 0) + g.give[k];
        else if (k === 'gem') {
          /* 可镶嵌宝石：give: { gem: 'G_R' }
           * 修复：此前没有该分支，宝石类商品会落到 p.mat['gem']，
           *       买了红宝石但宝石页数量永远为 0，无法镶嵌 */
          const gid = g.give[k];
          if (gid) { p.gems = p.gems || {}; p.gems[gid] = (p.gems[gid] || 0) + 1; }
        }
        /* 皮肤（SH08「废土战甲皮肤」680 钻）
         * BUG：b_shop 这段是【内联发放】，不走 E.grant()，
         *      而内联分支里根本没有 skin → 掉进最后的 else：
         *        p.mat['skin'] = 'sk_c01b'
         *      皮肤真实存放在 p.skins（数组），当前穿戴叫 p.skin（字符串）。
         *      结果：花 680 钻买皮肤，扣了钻石、提示成功，
         *            但皮肤页里根本没有、也穿不上，钻石白花。
         *      （E.grant() 里 skin 分支是对的，这条内联路径漏了。）
         * 顺带把 title / frame / ach / evToken 也接上，避免后台热更
         * 给商品加上这些奖励时重演同类问题。 */
        else if (k === 'skin') {
          const sid = g.give[k];
          if (sid) {
            p.skins = p.skins || [];
            if (p.skins.indexOf(sid) < 0) p.skins.push(sid);
            p.skin = sid;
          }
        }
        else if (k === 'title') { p.titles = p.titles || []; if (p.titles.indexOf(g.give[k]) < 0) p.titles.push(g.give[k]); }
        else if (k === 'frame') { p.frames = p.frames || []; if (p.frames.indexOf(g.give[k]) < 0) p.frames.push(g.give[k]); }
        else if (k === 'ach') { p.ach = (p.ach || 0) + (Number(g.give[k]) || 0); }
        else if (k === 'evToken' || k === 'ev') {
          const n = Number(g.give[k]) || 0;
          if (n > 0) { p.evToken = (p.evToken || 0) + n; p.evScore = (p.evScore || 0) + n; }
        }
        else if (/^chip/.test(k)) {
          /* 芯片类：直接生成对应品质芯片进背包 */
          /* chipRed 此前【不在映射表里】：
           *   qmap['chipRed'] = undefined → q = 'n'（普通/白色）
           *   商店 SH09「传说芯片包」rw 配的正是 { chipRed: 2 }
           *   → 98 元买到手的是 2 块【白色】生命芯片，不是传说红芯片。
           *   （engine.js 战令那处 qmap 已含 chipRed，本处漏了。）
           * 现在与 main.js 旧存档迁移表保持一致。 */
          const qmap = { chipN: 'n', chipE: 'e', chipL: 'l', chipRed: 'l', chip: 'n' };
          const q = qmap[k] || 'n';
          try {
            /* 此前传品质码给 rollChipById（它收的是 CH01~CH08 定义ID）
             * → 恒回退 chips[0]，980 钻的「传说芯片包」到手是白色生命芯片 */
            /* 数量：此前无论配置写几个，一律只 push 1 块。
             *   SH09「传说芯片包」980 钻，give 是 { chipL: 2 }
             *   → 实际只发 1 块传说芯片，宣传的「×2」少给一半。
             *   （E.grant() 里有按数量循环，这条内联路径漏了。）
             * 现在按配置数量发放。 */
            const cnt = Math.max(1, Math.min(20, Math.floor(Number(g.give[k]) || 1)));
            let ok = 0;
            for (let i = 0; i < cnt; i++) {
              const c = E.rollChipByQuality ? E.rollChipByQuality(q) : null;
              if (c) { p.bag = p.bag || []; p.bag.push(c); ok++; }
            }
            if (!ok) p.mat[k] = (p.mat[k] || 0) + cnt;
          } catch (e) { p.mat[k] = (p.mat[k] || 0) + (Number(g.give[k]) || 1); }
        }
        else p.mat[k] = (p.mat[k] || 0) + g.give[k];
      }
      /* 直购特殊类型：月卡 / 战令进阶 / 皮肤 */
      if (g.monthly) {
        p.monthCard = { until: Date.now() + 30 * 86400000, last: '' };
        this.toast('月卡开通成功！30 天内每日可领 钻石50+体力60', 'ok');
      } else if (g.pass === 'adv') {
        p.passAdv = 1; this.toast('进阶战令已解锁！可领取高级档位', 'ok');
      } else if (g.pass === 'normal') {
        this.toast('普通战令已激活（免费档位可领取）', 'ok');
      }
      if (g.give && g.give.skin) {
        p.skins = p.skins || [];
        if (p.skins.indexOf(g.give.skin) < 0) p.skins.push(g.give.skin);
        this.toast('已获得皮肤：' + g.n, 'ok');
      }
      if (g.limit) { try { E.giftMark(p, g); } catch (e) {} }
      E.save(p); if (!g.monthly && !g.pass) this.toast('购买成功', 'ok');
      if (window.SND) SND.play('get'); this.open('shop', tab); this.home();
    }; });
    /* 月卡每日领取 */
    const mc = $('#shMcClaim'); if (mc) mc.onclick = () => {
      const r = E.monthCardClaim(p);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('get'); E.save(p); this.open('shop', tab); this.home(); }
    };
    /* 战令档位领取 */
    $$('#pnBody [data-psn]').forEach((b) => { b.onclick = () => {
      const r = E.passClaim(p, +b.dataset.psn, false);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('get'); E.save(p); this.open('shop', tab); this.home(); }
    }; });
    $$('#pnBody [data-psa]').forEach((b) => { b.onclick = () => {
      const r = E.passClaim(p, +b.dataset.psa, true);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('get'); E.save(p); this.open('shop', tab); this.home(); }
    }; });
  },

  /* ---------- 宝石镶嵌（截图：石质面板 + 僵尸头 + 红蓝绿紫宝石 + 黄色镶嵌） ---------- */
  r_gem(p, tab) {
    const gs = EX.gems || [];
    const sel = this.gemSel || (gs[0] && gs[0].id);
    const g = gs.find((x) => x.id === sel) || gs[0];
    return `<div class="stone-panel">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        ${this.zAvatarHTML('gem')}
        <div><b style="font-size:14px">宝石镶嵌</b>
          <div class="sub">镶嵌宝石可大幅提升属性</div></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px">
        ${gs.map((x) => {
          const n = (p.gems || {})[x.id] || 0;
          const on = x.id === sel;
          return `<div class="zrow" data-gsel="${x.id}" style="${on ? 'border-color:var(--yel);background:rgba(255,201,60,.12)' : ''}">
            <div class="gem ${x.c === 'r' ? 'r' : x.c === 'b' ? 'b' : x.c === 'g' ? 'g' : 'p'}">${x.img
              ? `<img src="${x.img}" style="width:26px;height:26px;object-fit:contain">` : (x.icon || '💎')}</div>
            <div class="zi"><b>${x.n}</b><span>${x.desc}</span></div>
            <span class="st ${on ? 'on' : 'off'}">${n} 颗</span>
          </div>`;
        }).join('') || '<div class="lbl">暂无宝石</div>'}
      </div>
      <div class="sub" style="margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.2)">
        当前选中：<b style="color:var(--yel)">${g ? g.n : '—'}</b>
        ${g ? ' · ' + g.desc : ''}
      </div>
      <button class="btn" id="gemInlay" style="width:100%;margin-top:10px">镶 嵌</button>
      <button class="btn o" id="gemFuse" style="width:100%;margin-top:6px">🔨 宝石合成（3 颗 → 升一级）</button>
      <div class="sub" style="margin-top:6px">当前宝石等级：<b style="color:var(--yel)">Lv.${p.gemLv || 0}</b>
        加成：${E.gemBonusTxt ? E.gemBonusTxt(p) : '—'}
        <span style="opacity:.7">（百分比加成，只随宝石合成等级提升，与角色等级无关）</span></div>
    </div>`;
  },
  b_gem(p, tab) {
    const fb = $('#gemFuse');
    if (fb) fb.onclick = () => {
      const id = this.gemSel;
      const r = E.gemFuse(p, id); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('upgrade'); this.open('gem'); this.home(); }
    };
    $$('#pnBody [data-gsel]').forEach((el) => { el.onclick = () => {
      this.gemSel = el.dataset.gsel; this.open('gem');
    }; });
    const ib = $('#gemInlay');
    if (ib) ib.onclick = () => {
      const id = this.gemSel; const g = (EX.gems || []).find((x) => x.id === id);
      if (!g) return this.toast('请选择宝石', 'err');
      if (!((p.gems || {})[id] > 0)) return this.toast('该宝石数量不足', 'err');
      p.gems[id]--; p.gemOn = id;
      if (window.SND) SND.play('upgrade');
      E.save(p); this.toast('镶嵌成功：' + g.n, 'ok'); this.open('gem'); this.home();
    };
  },

  /* ---------- 好友（截图：好友列表/申请/聊天 + 僵尸头像 + 添加好友） ---------- */
  r_friends(p, tab) {
    if (tab === '聊天') {
      const msgs = (p.chat || []).slice(-20).reverse();
      return `<div class="card"><div class="card-t">聊天</div>
        ${msgs.length ? msgs.map((m) => `<div class="zrow">${this.zAvatarHTML(m.n)}
          <div class="zi"><b>${m.n || '匿名'}</b><span>${m.t || ''}</span></div></div>`).join('')
        : '<div class="lbl">暂无消息</div>'}</div>`;
    }
    if (tab === '申请') {
      const reqs = p.friendReq || [];
      return `<div class="card"><div class="card-t">好友申请 <span class="sub">${reqs.length}</span></div>
        ${reqs.length ? reqs.map((r) => `<div class="zrow">${this.zAvatarHTML(r.id)}
          <div class="zi"><b>${r.n}</b><span>战力 ${E.fmt(r.pw || 0)}</span></div>
          <button class="btn g sm" data-accept="${r.id}">接受</button></div>`).join('')
        : '<div class="lbl">暂无申请</div>'}</div>`;
    }
    const fs = p.friends || [];
    return `<div class="card"><div class="card-t">好友列表
      <span class="sub">${fs.length} 人 · 每个 +0.5% 攻击</span></div>
      ${fs.length ? fs.map((f) => `<div class="zrow">
        ${this.zAvatarHTML(f.id || f)}
        <div class="zi"><b>${(f && f.n) || f.id || '未知'}</b><span>战力 ${E.fmt((f && f.pw) || 0)} · 可发送体力</span></div>
        ${(function () {
          const today = new Date().toDateString();
          const sent = (p.sendStDate === today) ? (p.sendStTo || []) : [];
          const done = sent.indexOf(f.id) >= 0;
          return `<button class="btn sm ${done ? 'd' : 'g'}" data-sendst="${f.id}" ${done ? 'disabled' : ''}>${done ? '已送' : '送体力'}</button>`;
        })()}
        <span class="st ${f.online ? 'on' : 'off'}">${f.online ? '在线' : '离线'}</span>
      </div>`).join('') : '<div class="lbl">还没有好友，点击下方添加</div>'}
      <button class="btn" id="addFriend" style="width:100%;margin-top:8px">添加好友</button>
    </div>`;
  },
  b_friends(p, tab) {
    const ab = $('#addFriend');
    if (ab) ab.onclick = () => {
      const nm = '僵友' + Math.floor(Math.random() * 900 + 100);
      (p.friends || (p.friends = [])).push({ id: 'f' + Date.now(), n: nm,
        pw: Math.floor(Math.random() * 50000 + 5000), online: Math.random() > 0.5 });
      E.save(p); this.toast('已添加好友 ' + nm, 'ok');
      if (window.SND) SND.play('get'); this.open('friends'); this.home();
    };
    /* 送体力此前只弹一个 toast，不扣资源、不限次数、按钮永远可点
     * → 这是个纯装饰按钮，点一万次也不产生任何数据变化。
     * 现在：每个好友每天限送 1 次，每天总共限 10 次，
     *       送出后自己获得好友回赠金币（单机架构无法真送到对方，但行为真实）。 */
    $$('#pnBody [data-sendst]').forEach((b) => { b.onclick = () => {
      const fid = b.dataset.sendst;
      const today = new Date().toDateString();
      if (p.sendStDate !== today) { p.sendStDate = today; p.sendStTo = []; }
      p.sendStTo = p.sendStTo || [];
      if (p.sendStTo.indexOf(fid) >= 0) return this.toast('今天已给该好友送过', 'err');
      if (p.sendStTo.length >= 10) return this.toast('每日赠送上限 10 次', 'err');
      p.sendStTo.push(fid);
      const back = 30;
      p.gold = (p.gold || 0) + back;
      E.save(p);
      this.toast('已赠送，好友回赠 ' + back + ' 金币', 'ok');
      if (window.SND) SND.play('get');
      this.open('friends'); this.home();
    }; });
    $$('#pnBody [data-accept]').forEach((b) => { b.onclick = () => {
      const id = b.dataset.accept;
      const r = (p.friendReq || []).find((x) => x.id === id);
      if (r) { (p.friends || (p.friends = [])).push(r);
        p.friendReq = p.friendReq.filter((x) => x.id !== id);
        E.save(p); this.toast('已添加 ' + r.n, 'ok'); this.open('friends', '申请'); this.home(); }
    }; });
  },

  /* ---------- 邮件（截图：列表 + 绿色一键领取） ---------- */
  r_mail(p, tab) {
    const ms = p.mail || [];
    const un = ms.filter((m) => !m.got).length;
    return `<div class="card"><div class="card-t">邮件 <span class="sub">${un} 封未读</span></div>
      ${ms.length ? ms.slice().reverse().map((m) => `<div class="zrow">
        ${this.zAvatarHTML(m.t)}
        <div class="zi"><b>${m.t}</b><span>${m.b || ''}</span>
          <span>🪙${m.gold || 0} 💎${m.dia || 0}</span></div>
        ${m.got ? '<span class="st off">已领</span>'
          : `<button class="btn sm g" data-ml="${m.id || ''}">领取</button><i class="gdot"></i>`}
      </div>`).join('') : '<div class="lbl">暂无邮件</div>'}
      <button class="btn g" id="mailAll" style="width:100%;margin-top:8px">一键领取</button>
    </div>`;
  },
  /* ---------- 排行榜（含表33排名奖励） ---------- */
  r_rank(p) {
    const boards = ['无尽生存榜', '战力榜', '活动冲榜'];
    const myRank = { '无尽生存榜': p.rankEndless || 0, '战力榜': p.rankPower || 0, '活动冲榜': p.rankEv || 0 };
    return `<div class="card"><div class="card-t">我的排名</div>
      ${boards.map((b) => {
        const rk = myRank[b] || 0;
        return `<div class="kv"><span>${b}</span><b style="color:${rk ? 'var(--yel)' : 'var(--txt3)'}">${rk ? '第 ' + rk + ' 名' : '未上榜'}</b></div>`;
      }).join('')}
    </div>
    <div class="card"><div class="card-t">排名奖励 <span class="sub">表33</span></div>
      ${boards.map((b) => `<div class="sub" style="color:var(--yel);font-weight:700;margin-top:6px">${b}</div>
        ${(EX.rankRewards || []).filter((x) => x.board === b).map((rw) => {
          const rk = myRank[b] || 0;
          const inRank = rk >= rw.lo && rk <= rw.hi;
          const got = (p.rankRwGot || {})['rk_' + b + '_' + rw.id];
          return `<div class="zrow">
            <div class="zav">🏅</div>
            <div class="zi"><b>${rw.rank}</b><span>${rw.cyc}结算 · ${Object.keys(rw.rw).map((k) => E.itemName(k)).join('、')}</span></div>
            ${got ? '<span class="st on">已领取</span>'
              : (inRank ? `<button class="btn sm g" data-rk="${b}|${rw.id}">领取</button>`
                        : '<span class="st off">未达名次</span>')}</div>`;
        }).join('')}`).join('')}
    </div>
    <div class="card"><div class="card-t">全服榜单 <span class="sub">通关后自动上传</span></div>
      <div class="pn-tabs" style="padding:0 0 8px">${['无尽生存榜', '战力榜', '活动冲榜'].map((b) =>
        `<div class="pt ${(this.rankBoard || '无尽生存榜') === b ? 'on' : ''}" data-rkb="${b}">${b}</div>`).join('')}</div>
      ${(function () {
        const board = this.rankBoard || '无尽生存榜';
        let lb = (window.LB || []).slice();
        /* 三个榜单此前共用同一份列表：云端只按「无尽层数」排序，
         * 于是切到战力榜/活动冲榜看到的名次仍是按无尽层数排的 ——
         * 战力第一的人可能显示在第十名。现在按各榜自己的字段排序。 */
        if (board === '战力榜') lb.sort((a, b) => (b.pw || 0) - (a.pw || 0));
        else if (board === '活动冲榜') lb.sort((a, b) => (b.ev || 0) - (a.ev || 0));
        else lb.sort((a, b) => (b.eb || 0) - (a.eb || 0) || (b.pw || 0) - (a.pw || 0));
        if (!lb.length) return '<div class="lbl">暂无排行数据，通关后自动上传</div>';
        return lb.map((x, i) => `<div class="item">
          <div class="ic" style="font-size:15px;background:${i < 3 ? 'linear-gradient(135deg,#ffe9a8,#f0a020)' : 'rgba(10,16,28,.7)'};color:${i < 3 ? '#2a1a00' : '#fff'}">${i + 1}</div>
          <div class="info"><div class="nm">${x.n || x.name || '匿名'}</div>
            <div class="sub">${x.lv || '—'} · 无尽 ${x.eb || 0} 层</div></div>
          <div class="act"><span class="tag y">${board === '活动冲榜' ? E.fmt(x.ev || 0) + ' 积分' : board === '战力榜' ? E.fmt(x.pw || 0) : E.fmt(x.pw || 0)}</span></div></div>`).join('');
      }).call(this)}
    </div>`;
  },
  b_rank(p) {
    /* 榜单切换：此前三个榜共用同一份按无尽层数排好的列表，没有切换入口 */
    $$('#pnBody [data-rkb]').forEach((t) => { t.onclick = () => {
      this.rankBoard = t.dataset.rkb; this.open('rank');
    }; });
    $$('#pnBody [data-rk]').forEach((b) => { b.onclick = () => {
      const [board, id] = b.dataset.rk.split('|');
      const rw = (EX.rankRewards || []).find((x) => x.id === id);
      const rank = board === '战力榜' ? (p.rankPower || 0) : board === '活动冲榜' ? (p.rankEv || 0) : (p.rankEndless || 0);
      const r = E.claimRankRw(p, board, rank);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('get'); this.open('rank'); this.home(); }
    }; });
  },

  b_mail(p, tab) {
    /* 单封邮件「领取」按钮
     * BUG：r_mail 里渲染了 <button data-ml="...">领取</button>，
     * 但 b_mail 此前只绑定了「一键领取」#mailAll，单封按钮没有任何 onclick。
     * 结果：玩家点单封邮件的领取完全没反应（只有一键领取能用），
     * 想只领某一封、或一键领取已用过的场景下，邮件奖励永远拿不到。
     * 现在补上：按邮件 id 领取，发奖励并标记 got。 */
    $$('#pnBody [data-ml]').forEach((btn) => {
      btn.onclick = () => {
        const mid = btn.dataset.ml || '';
        const m = (p.mail || []).find((x) => String(x.id || '') === mid) || null;
        if (!m) { this.toast('邮件不存在', 'err'); return; }
        if (m.got) { this.toast('已领取过', 'err'); return; }
        m.got = true;
        const g = m.gold || 0, d = m.dia || 0;
        p.gold = (p.gold || 0) + g;
        p.diamond = (p.diamond || 0) + d;
        if (m.rw && Object.keys(m.rw).length) E.grant(p, m.rw);
        E.save(p);
        if (window.SND) SND.play('get');
        this.toast('领取成功：🪙' + E.fmt(g) + ' 💎' + d, 'ok');
        this.open('mail'); this.home();
      };
    });
    const ab = $('#mailAll');
    if (ab) ab.onclick = () => {
      const ms = (p.mail || []).filter((m) => !m.got);
      if (!ms.length) return this.toast('没有可领取的邮件', 'err');
      let g = 0, d = 0;
      ms.forEach((m) => {
        m.got = true; g += m.gold || 0; d += m.dia || 0;
        /* 后端/后台邮件常把奖励放在 rw（物品）而非 gold/dia，
         * 此前一键领取只算 gold/dia，rw 里的材料、芯片、皮肤全部漏发。 */
        if (m.rw && Object.keys(m.rw).length) E.grant(p, m.rw);
      });
      p.gold += g; p.diamond += d; E.save(p);
      if (window.SND) SND.play('get');
      this.toast('领取成功：🪙' + E.fmt(g) + ' 💎' + E.fmt(d), 'ok');
      this.open('mail'); this.home();
    };
  },

  /* ---------- 活动 ---------- */
  /* 后台「活动创建」建出来的活动（id 形如 ACTxxx）此前没有任何按钮：
   * 游戏端的参与入口是照 EV01/EV02/EV04/EV06 硬编码的，
   * 于是运营新建的活动玩家只能看见、点不了，成了纯展示。
   * 这里按活动自带的 levelId / rw 生成通用入口。 */
  actExtraBtn(p, a) {
    const isBuiltin = /^EV\d+$/.test(a.id || '');
    if (isBuiltin) return '';
    const got = ((p.actRwGot || {})[a.id]);
    let h = '';
    if (a.levelId) h += `<button class="btn sm" data-actlv="${a.id}">前往</button>`;
    if (a.rw && Object.keys(a.rw).length) {
      h += got ? '<span class="st off">已领</span>'
        : `<button class="btn sm g" data-actrw="${a.id}" style="margin-left:4px">领奖</button>`;
    }
    return h;
  },
  r_act(p, tab) {
    /* 后台「强制下架」/已结束的活动必须隐藏：
     * 此前游戏端原样列出全部活动，运营紧急下架了，玩家照样看得见、照样能参与。 */
    const acts = (EX.acts || EX.activities || []).filter((a) => {
      if (a.status === '强制下架') return false;
      if (a.endAt && Date.now() > a.endAt) return false;
      if (a.startAt && Date.now() < a.startAt - 864e5 * 30) return false;  /* 一个月后才开始的先不显示 */
      return true;
    });
    return `<div class="card"><div class="card-t">活动
      <span class="sub">${acts.length} 个进行中</span></div>
      ${acts.length ? acts.map((a) => `<div class="zrow">
        <div class="zav">${a.icon || '🎪'}</div>
        <div class="zi"><b>${a.n}</b><span>${a.desc || ''}</span>
          <span style="font-size:9px;color:#8fa0c0">${a.time || ''} · ${a.rule || ''}</span>
          ${a.id === 'EV02' ? `<span style="font-size:9px;color:#ffd76a">今日剩余 ${E.bossRaidLeft(p)} / 3 次</span>` : ''}
          ${a.id === 'EV04' ? `<span style="font-size:9px;color:${p.firstRech ? '#7ee38a' : '#ffd76a'}">${p.firstRech ? '已使用' : '未使用 · 首次购买钻石翻倍'}</span>` : ''}
        </div>
        ${a.id === 'EV02' ? `<button class="btn sm" data-raid="1" ${E.bossRaidLeft(p) > 0 ? '' : 'disabled'}>挑战</button>` : ''}
        ${a.id === 'EV01' ? `<button class="btn sm" data-evendless="1">参与</button>` : ''}
        ${a.id === 'EV06' ? `<button class="btn sm" data-evrank="1">查看</button>` : ''}
        ${this.actExtraBtn(p, a)}
      </div>`).join('') : '<div class="lbl">暂无活动</div>'}
    </div>
    <div class="card"><div class="card-t">签到 <span class="sub">每日登录领取</span></div>
      <div class="grid4">${[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const got = (p.signDays || 0) >= d;
        return `<div class="gcell ${got ? 'sel' : ''}">
          <div class="gi">${got ? '✔' : '🎁'}</div><div class="gn">第${d}天</div></div>`;
      }).join('')}</div>
      <button class="btn" id="actSign" style="width:100%;margin-top:8px">每日签到</button>
    </div>`;
  },
  b_act(p, tab) {
    const sb = $('#actSign');
    if (sb) sb.onclick = () => {
      const r = E.sign(p); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('get'); this.open('act'); this.home(); }
    };
    /* 表22 EV02 BOSS突袭：每日 3 次 */
    $$('#pnBody [data-raid]').forEach((b) => { b.onclick = () => {
      const r = E.bossRaidStart(p);
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { E.save(p); this.close(); startBattle('boss', null); }
      else this.open('act');
    }; });
    /* 表22 EV01 丧尸围城 → 无尽模式 */
    $$('#pnBody [data-evendless]').forEach((b) => { b.onclick = () => {
      this.toast('进入丧尸围城（无尽生存）', 'ok');
      this.close(); startBattle('endless');
    }; });
    /* 表22 EV06 无尽冲榜 → 排行榜 */
    $$('#pnBody [data-evrank]').forEach((b) => { b.onclick = () => {
      this.close(); this.open('rank');
    }; });
    /* 后台新建活动：前往指定关卡 */
    $$('#pnBody [data-actlv]').forEach((b) => { b.onclick = () => {
      const a = (EX.acts || EX.activities || []).find((x) => x.id === b.dataset.actlv);
      if (!a) return;
      const lv = a.levelId;
      if (!E.levelUnlocked(p, lv)) return this.toast('该活动关卡尚未解锁', 'err');
      this.close(); startBattle('normal', lv);
    }; });
    /* 后台新建活动：领取奖励（每个活动限一次） */
    $$('#pnBody [data-actrw]').forEach((b) => { b.onclick = () => {
      const a = (EX.acts || EX.activities || []).find((x) => x.id === b.dataset.actrw);
      if (!a || !a.rw) return;
      /* 参与条件校验 */
      const c = a.cond || {};
      if (c.lvMin && (p.lv || 1) < c.lvMin) return this.toast('等级不足（需 Lv.' + c.lvMin + '）', 'err');
      if (c.clearedMin && Object.keys(p.cleared || {}).length < c.clearedMin) {
        return this.toast('需通关 ' + c.clearedMin + ' 关', 'err');
      }
      p.actRwGot = p.actRwGot || {};
      p.actRwGot[a.id] = 1;
      E.grant(p, a.rw);
      E.save(p);
      this.toast('已领取「' + (a.n || '活动') + '」奖励', 'ok');
      if (window.SND) SND.play('get');
      this.open('act'); this.home();
    }; });
  },

  /* ---------- 关卡选择 ---------- */
  r_level(p) {
    const ch = this.curChapter || E.chapterOf(E.curLevel(p));
    const cd = EX.chapters.find((x) => x.id === ch) || EX.chapters[0];
    const list = EX.levels.filter((x) => x.ch === ch);
    return `<div class="card"><div class="card-t">${cd.icon} ${cd.n}</div>
      ${list.map((l) => {
        const lock = !E.levelUnlocked(p, l.id);
        const st = (p.cleared || {})[l.id] || 0;
        const isBoss = l.cond === 'boss' || l.cond === 'bossAll';
        const cost = E.staminaCost(l.id);
        return `<div class="item"><div class="ic">${isBoss ? '👹' : '🎯'}</div>
          <div class="info"><div class="nm">${l.id} ${l.n} ${isBoss ? '<span class="tag r">BOSS</span>' : ''}</div>
          <div class="sub">${l.waves} 波 · 强度 ×${l.mul} · ${l.pool.map((x) => (EX.zombies.find((z) => z.id === x) || {}).n).join('、')}</div>
          <div class="sub">${st ? '★'.repeat(st) : '未通关'} · 体力 ${cost} · 奖励：${this.rwTxt(l.rw)}</div>
          ${lock ? '<div class="sub" style="color:#ff8fa4">需先通关 ' + l.unlock + '</div>' : ''}</div>
          <div class="act">${lock ? '<span class="tag r">未解锁</span>' : `<button class="btn c sm" data-lv="${l.id}">挑战</button>`
            + (st ? `<button class="btn sm o" data-sw="${l.id}" style="margin-top:4px">扫荡</button>` : '')}</div></div>`;
      }).join('')}</div>
      <div class="card"><div class="card-t">章节</div>
      <div class="lvgrid">${EX.chapters.map((c) => `<button class="lvc ${c.id === ch ? 'cur' : ''}" data-ch="${c.id}">
        <i style="font-size:17px;font-style:normal;display:block">${c.icon}</i><b style="font-size:9px">${c.n.split(' · ')[0]}</b></button>`).join('')}</div></div>
      <div class="card"><div class="card-t">无尽模式</div>
      ${E.endlessUnlocked(p)
        ? `<div class="kv"><span>最佳层数</span><b>${p.endlessBest || 0}</b></div>
           <button class="btn c blk" data-lv="endless">进入无尽（体力 2）</button>`
        : '<div class="lbl">通关 3-3 后解锁</div>'}</div>`;
  },
  b_level(p) {
    $$('#pnBody [data-ch]').forEach((b) => { b.onclick = () => { this.curChapter = +b.dataset.ch; this.open('level'); }; });
    $$('#pnBody [data-lv]').forEach((b) => { b.onclick = () => { this.close(); startBattle('normal', b.dataset.lv); }; });
    $$('#pnBody [data-sw]').forEach((b) => { b.onclick = () => this.sweepBox(b.dataset.sw); });
  },

  /* ---------- 扫荡弹窗（表29：已通关关卡快速扫荡） ---------- */
  sweepBox(lvId) {
    const p = this.P; if (!p) return;
    const ck = E.canSweep(p, lvId);
    if (!ck.ok) return this.toast(ck.msg, 'err');
    const maxBySt = Math.floor((p.stamina || 0) / EX.SWEEP_STAMINA);
    const max = Math.max(1, Math.min(EX.SWEEP_MAX, maxBySt));
    const rw1 = EX.sweepRw(parseInt(String(lvId).split('-')[1] || '1', 10), 1);
    /* 用通用面板层承载扫荡弹窗 */
    const box = document.getElementById('sweepBox');
    if (!box) return this.sweepQuick(lvId, 1);
    box.innerHTML = `<div class="pn-box"><div class="pn-hd"><b>扫荡 ${lvId}</b>
      <button id="swX">✕</button></div><div class="pn-main"><div class="pn-body">
      <div class="card"><div class="card-t">扫荡设置</div>
      <div class="sub">单次消耗体力 ${EX.SWEEP_STAMINA} · 当前体力 ${Math.floor(p.stamina || 0)}</div>
      <div class="sub">单次产出：金币 ${E.fmt(rw1.gold)} · 金属 ${rw1.M01} · 经验 ${rw1.xp}</div>
      <div class="kv"><span>扫荡次数</span><b><input type="number" id="swN" value="${max}" min="1" max="${max}"
        style="width:64px;padding:4px;border-radius:6px;border:1px solid #555;background:#222;color:#fff"></b></div>
      <button class="btn c blk" id="swGo">开始扫荡（最多 ${max} 次）</button>
      <button class="btn d blk" id="swX2">取消</button></div></div></div></div>`;
    box.classList.add('on');
    const g = document.getElementById('swGo');
    if (g) g.onclick = () => {
      const el = document.getElementById('swN');
      const n = Math.max(1, Math.min(max, parseInt((el && el.value) || '1', 10)));
      const r = E.sweep(p, lvId, n);
      try { E.logAct(p, 'shop', 'sweep'); } catch (e) {}
          this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('pickup'); box.classList.remove('on'); this.open('level'); this.home(); }
    };
    const x1 = document.getElementById('swX'), x2 = document.getElementById('swX2');
    if (x1) x1.onclick = () => box.classList.remove('on');
    if (x2) x2.onclick = () => box.classList.remove('on');
  },
  sweepQuick(lvId, n) {
    const r = E.sweep(this.P, lvId, n || 1);
    this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) this.home();
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
      <button class="btn c blk" id="buUp" ${p.gold < cost ? 'disabled' : ''}>升级 · ${E.fmt(cost)} 金币</button></div>
      <div class="card"><div class="card-t">离线产出</div>
      <div class="kv"><span>仓库离线收益</span><b style="color:var(--gold)">${E.fmt(E.offlineIncome(p))} 金币</b></div>
      <div class="kv"><span>同时产出</span><b>金属 + 经验</b></div>
      <button class="btn blk" id="buClaim">领取离线收益</button>
      <div class="lbl">离线最多累计 8 小时（表34）。</div></div>`;
  },
  b_base(p, tab) {
    const u = $('#buUp'); if (u) u.onclick = () => {
      const r = E.upBuild(p, tab); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('base', tab); this.home(); }
    };
    const c = $('#buClaim'); if (c) c.onclick = () => {
      /* 此前只取 E.offlineIncome（仅金币）然后手动 +=，
       * 而 E.offlineClaim（金币 + 金属 + 经验）定义了却从未被调用
       * → 玩家离线 8 小时只拿到金币，金属和经验一直没发。
       * 现在改走完整领取。 */
      const r = E.offlineClaim(p);
      if (!r.ok) return this.toast(r.msg, 'err');
      this.toast(r.msg, 'ok'); this.open('base', tab); this.home();
    };
  },

  /* ---------- 设置 ---------- */
  /* ---------- 新手引导（表21：12 节点） ---------- */
  showGuide(id) {
    const p = this.P; if (!p) return;
    const g = (EX.guides || []).find((x) => x.id === id);
    if (!g) return;
    /* 已完成则不弹 */
    if ((p.guide || {})[id]) return;
    const box = document.getElementById('guide');
    if (!box) return;
    const t = document.getElementById('gdTitle'), c = document.getElementById('gdText');
    if (t) t.textContent = g.n;
    if (c) c.textContent = g.txt || g.desc || '';
    box.classList.add('on');
    this._curGuide = id;
    const ok = document.getElementById('gdOk');
    if (ok) ok.onclick = () => {
      E.guideDone(p, id);
      box.classList.remove('on');
      this._curGuide = null;
      if (window.MAIN && MAIN.save) MAIN.save();
    };
  },
  /* 战斗内按事件触发（表21 触发时机） */
  guideTrigger(ev) {
    /* 表37 埋点：funnel_convert（新手漏斗） */
    try { OPS.track('funnel_convert', { step: ev }); } catch (e) {}
    const p = this.P; if (!p) return;
    /* 表21 触发时机 → 引导节点 id */
    const map = {
      enter: 1,          /* 进入第一关：移动引导 */
      moved: 2,          /* 移动后：射击引导 */
      firstUpgrade: 3,   /* 第一次升级：技能三选一 */
      firstKill: 4,      /* 击杀后：拾取引导 */
      win: 5,            /* 第一次通关 */
      home: 6,           /* 返回基地 */
      gunUnlock: 7,      /* 通关1-2：武器引导 */
      taskUnlock: 8,     /* 通关1-2：任务引导 */
      chipUnlock: 9,     /* 通关1-4：芯片引导 */
      talentUnlock: 10,  /* 通关1-3：天赋引导 */
      endless: 11,       /* 通关3-3：无尽引导 */
      fail: 12,          /* 首次失败：广告复活 */
    };
    const id = map[ev];
    if (id) setTimeout(() => this.showGuide(id), 420);
  },

  /* ---------- 兑换商店（表42成就商店 / 表43活动商店） ---------- */
  r_ashop(p, tab) {
    const isAch = tab === '成就商店';
    const list = isAch ? (EX.achShop || []) : (EX.eventShop || []);
    const curName = isAch ? '成就点' : '活动代币';
    const curVal = isAch ? (p.ach || 0) : (p.evToken || 0);
    return `<div class="card"><div class="card-t">${tab}
      <span class="sub">持有 <b style="color:var(--yel)">${E.fmt(curVal)}</b> ${curName}</span></div>
      ${list.map((it) => {
        const bought = isAch ? E.achShopBought(p, it.id)
          : (() => { const b = p.evShopBuy || {}, k = 'es_' + it.id; return b[k] ? b[k].n : 0; })();
        const full = bought >= it.limit;
        /* 未达通关门槛时置灰并显示条件（此前 need 从不参与判定） */
        const locked = (it.need || 0) > 0 && Object.keys(p.cleared || {}).length < it.need;
        const can = curVal >= it.cost && !full && !locked;
        return `<div class="zrow">
          <div class="zav">${it.t === '芯片' ? '💠' : it.t === '碎片' ? '🧩' : it.t === '皮肤' ? '👕' : it.t === '称号' ? '🏅' : '📦'}</div>
          <div class="zi"><b>${it.n}</b><span>${it.cost} ${curName} · 限购 ${it.limit}（已兑 ${bought}）${locked ? ' · <span style="color:#ff8fa4">需通关 ' + it.need + ' 关</span>' : ''}</span></div>
          <button class="btn sm ${can ? '' : 'd'}" data-buy="${it.id}" ${can ? '' : 'disabled'}>兑换</button>
        </div>`;
      }).join('')}
      <div class="sub" style="padding:6px 2px">限购按 ${isAch ? '每日/每周/每月' : '每日/活动期'} 刷新。</div>
    </div>`;
  },
  b_ashop(p, tab) {
    const isAch = tab === '成就商店';
    $$('#pnBody [data-buy]').forEach((b) => { b.onclick = () => {
      const r = isAch ? E.achShopBuyItem(p, b.dataset.buy) : E.eventShopBuy(p, b.dataset.buy);
      try { E.logAct(p, 'shop', 'achShopBuyItem'); } catch (e) {}
          this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('equip'); this.open('ashop', tab); this.home(); }
    }; });
  },

  /* ---------- 图鉴收集（表29） ---------- */
  r_codex(p, tab) {
    const kindMap = { '怪物': 'zombie', '武器': 'gun', '皮肤': 'skin' };
    const kind = kindMap[tab] || 'zombie';
    const list = EX.codexOf(kind) || [];
    const got = (p.codex || {})[kind] || [];
    const cc = E.codexCount(p);
    const rw = (EX.codexRw || {})[kind] || {};
    return `<div class="card"><div class="card-t">收集进度
      <span class="sub">${cc.got} / ${cc.all}</span></div>
      <div class="sub">解锁奖励：+${rw.gold || 0} 金币 · +${rw.ach || 0} 成就点</div>
    </div>
    <div class="card"><div class="card-t">${tab}图鉴 <span class="sub">${got.length}/${list.length}</span></div>
      <div class="grid4">${list.map((x) => {
        const has = got.indexOf(x.id) >= 0;
        return `<div class="gcell ${has ? '' : 'sel'}"${has ? '' : ` data-cdx="${kind}|${x.id}"`}>
          ${x.img ? `<img src="${x.img}" style="width:60%;height:60%;object-fit:contain">`
                  : `<div class="gi">${x.icon || '❓'}</div>`}
          <div class="gn">${has ? x.n : '???'}</div>
          ${has ? '<span class="gq">✔</span>' : '<span class="gq" style="background:#666">解锁</span>'}
        </div>`;
      }).join('')}</div>
      <div class="sub" style="padding:6px 2px">点击未解锁条目可解锁并领奖。</div>
    </div>`;
  },
  b_codex(p, tab) {
    $$('#pnBody [data-cdx]').forEach((b) => { b.onclick = () => {
      const [kind, id] = b.dataset.cdx.split('|');
      const r = E.codexUnlock(p, kind, id);
      if (r.ok) { this.toast(r.msg, 'ok'); if (window.SND) SND.play('pickup'); }
      else this.toast(r.already ? '已解锁' : r.msg, r.already ? 'ok' : 'err');
      this.open('codex', tab); this.home();
    }; });
  },

  r_set(p, tab) {
    /* ---------- 音频（音乐/音效开关 + 音量） ----------
     * 补齐：SND 一直有 musicOn/sfxOn/volMusic/volSfx 四个状态，
     * 但设置面板里从未提供入口，玩家无法关音乐音效、无法调音量，
     * 且状态从不保存（刷新即回默认）。这里补上控制与持久化。 */
    if (tab === '音频') {
      const S = window.SND || null;
      const mo = S ? S.musicOn : true, so = S ? S.sfxOn : true;
      const vm = S ? S.volMusic : 0.28, vs = S ? S.volSfx : 0.5;
      return `<div class="card"><div class="card-t">声音开关</div>
        <div class="zrow"><div class="zav">🎵</div>
          <div class="zi"><b>背景音乐</b><span>末日低频氛围 BGM</span></div>
          <button class="btn sm ${mo ? 'g' : ''}" data-snd="music">${mo ? '开' : '关'}</button></div>
        <div class="zrow"><div class="zav">🔊</div>
          <div class="zi"><b>音效</b><span>枪声 / 爆炸 / 命中</span></div>
          <button class="btn sm ${so ? 'g' : ''}" data-snd="sfx">${so ? '开' : '关'}</button></div>
      </div>
      <div class="card"><div class="card-t">音量</div>
        <div class="kv"><span>音乐音量</span><b style="color:var(--yel)">${Math.round(vm * 100)}%</b></div>
        <input type="range" id="volM" min="0" max="100" value="${Math.round(vm * 100)}"
          style="width:100%;margin:6px 0">
        <div class="kv"><span>音效音量</span><b style="color:var(--yel)">${Math.round(vs * 100)}%</b></div>
        <input type="range" id="volS" min="0" max="100" value="${Math.round(vs * 100)}"
          style="width:100%;margin:6px 0">
        <div class="sub">拖动调节，设置会自动保存。</div>
      </div>`;
    }
    /* ---------- 多语言（表39） ---------- */
    if (tab === '语言') {
      const cur = (window.OPS ? OPS.getLang() : 'zh');
      return `<div class="card"><div class="card-t">语言 <span class="sub">表39 本地化</span></div>
        <div class="sub">当前：${((EX.LANGS || []).find((x) => x.k === cur) || { n: cur }).n}</div>
        ${(EX.LANGS || []).map((l) => `<div class="zrow">
          <div class="zav">🌐</div>
          <div class="zi"><b>${l.n}</b><span>${l.k}</span></div>
          ${l.k === cur ? '<span class="st on">使用中</span>'
            : `<button class="btn sm" data-lang="${l.k}">切换</button>`}</div>`).join('')}
      </div>
      <div class="card"><div class="card-t">文本预览 <span class="sub">TXT_001~008</span></div>
        ${Object.keys(EX.I18N || {}).map((id) => `<div class="kv">
          <span style="font-size:10px">${id}</span><b style="font-size:11px">${window.OPS ? OPS.t(id) : (EX.I18N[id] || {}).zh}</b></div>`).join('')}
      </div>`;
    }
    /* ---------- 运营（表37 埋点 / 表38 版本 / 表40 接口 / 表36 命名 / 热更新） ---------- */
    if (tab === '运营') {
      const st = window.OPS ? OPS.trackStat() : {};
      const mi = window.OPS ? OPS.manifestInfo() : { ver: '-', n: 0 };
      const cv = window.OPS ? OPS.curVersion() : null;
      return `<div class="card"><div class="card-t">热更新 <span class="sub">表02 #15 / 表23 #9</span></div>
        <div class="kv"><span>资源版本号</span><b style="color:var(--yel)">${mi.ver}</b></div>
        <div class="kv"><span>清单条目</span><b>${mi.n} 个</b></div>
        <div class="sub">启动时比对版本，不一致自动刷新缓存并提示。</div></div>

      <div class="card"><div class="card-t">版本 <span class="sub">表38 排期</span></div>
        <div class="kv"><span>当前版本</span><b style="color:var(--green)">${cv ? cv.v + ' ' + cv.n : '-'}</b></div>
        ${(EX.VERSIONS || []).map((v) => `<div class="zrow"><div class="zav">${v.done ? '✔' : '○'}</div>
          <div class="zi"><b>${v.v} ${v.n}</b><span>${v.wk} · ${v.c}</span></div>
          <span class="st ${v.done ? 'on' : 'off'}">${v.done ? '已完成' : '开发中'}</span></div>`).join('')}
      </div>

      <div class="card"><div class="card-t">数据埋点 <span class="sub">表37 · 共 ${window.OPS ? OPS.trackBuf().length : 0} 条</span></div>
        ${Object.keys(st).length ? Object.keys(st).map((k) => `<div class="zrow">
          <div class="zav">📊</div>
          <div class="zi"><b>${st[k].n}</b><span>${k} · ${st[k].pr} · ${st[k].cnt} 次</span></div></div>`).join('')
          : '<div class="lbl">暂无埋点数据</div>'}
        <button class="btn d blk" id="opsClearTrack">清空埋点</button>
      </div>

      <div class="card"><div class="card-t">后端接口 <span class="sub">表40 → GitHub 实现</span></div>
        ${(EX.APIS || []).map((a) => `<div class="kv">
          <span style="font-size:10px">${a.id} ${a.n}</span>
          <b style="font-size:9.5px;color:var(--txt3)">${a.impl}</b></div>`).join('')}
      </div>

      <div class="card"><div class="card-t">资源命名规范 <span class="sub">表36 · 12 类</span></div>
        ${(EX.NAMING || []).map((n) => `<div class="kv">
          <span style="font-size:10px"><b style="color:var(--yel)">${n.pre}</b> ${n.t}</span>
          <b style="font-size:9.5px;color:var(--txt3)">${n.eg}</b></div>`).join('')}
      </div>`;
    }
    /* ---------- 兑换码（后台礼包码系统） ---------- */
    if (tab === '兑换码') {
      return `<div class="card"><div class="card-t">礼包码兑换 <span class="sub">后台生成</span></div>
        <div class="fld"><label>输入兑换码</label>
          <input id="cdInput" placeholder="请输入 CDKEY" style="width:100%;text-transform:uppercase"
            autocomplete="off"></div>
        <button class="btn blk" id="cdGo">🎁 立即兑换</button>
        <div id="cdTip" class="lbl">兑换码由后台「礼包码 → 生成兑换码」产出</div>
      </div>
      <div class="card"><div class="card-t">说明</div>
        <div class="lbl" style="text-align:left;line-height:1.7">
          · 每个兑换码有使用次数上限，先到先得<br>
          · 过期 / 作废 / 已绑定的码无法使用<br>
          · 若礼包模板设置了「限领 1 次」，同一账号只能兑换一次<br>
          · 兑换成功后奖励直接发放到背包
        </div>
      </div>`;
    }
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
    if (tab === '数值') {
      return `<div class="card"><div class="card-t">伤害公式 <span class="sub">资料 10 条</span></div>
        ${EX.formulas.map((f) => `<div class="kv"><span style="font-size:10px">${f.n}</span><b style="font-size:10px">${f.f}</b></div>`).join('')}</div>
        <div class="card"><div class="card-t">成长曲线</div>
        ${EX.growth.map((g) => `<div class="kv"><span style="font-size:10px">${g.n}</span><b style="font-size:10px">${g.curve}</b></div>`).join('')}</div>`;
    }
    const ac = window.UA ? UA.remembered() : {};
    return `<div class="card"><div class="card-t">账号 <span class="sub">账号密码登录</span></div>
      <div class="kv"><span>账号名</span><b>${this.esc(ac.name || '—')}</b></div>
      <div class="kv"><span>账号 ID</span><b style="font-size:10px">${this.esc(ac.uid || '—')}</b></div>
      <div class="kv"><span>下次登录</span><b style="font-size:10px">${window.UA && UA.shouldAuto() ? '自动登录（已记住）' : '需重新输入'}</b></div>
      <div class="lbl" style="text-align:left;margin-top:6px">换设备时用同一账号名+密码登录，存档自动继承</div></div>
    <div class="card"><div class="card-t">修改密码</div>
      <div class="fld"><label>原密码</label><input id="spOld" type="password" placeholder="原密码"></div>
      <div class="fld"><label>新密码</label><input id="spNew" type="password" placeholder="新密码（至少6位）"></div>
      <div class="fld"><label>确认新密码</label><input id="spNew2" type="password" placeholder="再输入一次"></div>
      <button class="btn blk" id="spGo">🔑 修改密码</button>
      <div class="lbl" id="spTip"></div></div>
    <div class="card"><div class="card-t">注销账号 <span class="sub">不可恢复</span></div>
      <div class="lbl" style="text-align:left;color:#ff8fa4">注销会删除云端存档并封禁该账号，无法恢复</div>
      <div class="fld"><label>输入密码确认</label><input id="spDel" type="password" placeholder="当前密码"></div>
      <button class="btn d blk" id="spDelGo">🗑 确认注销</button></div>
    <div class="card">
      <button class="btn n blk" id="setSwitchAcct">🔁 退出登录 / 切换账号</button></div>
    <div class="card"><div class="card-t">账号信息</div>
      <div class="kv"><span>代号</span><b>${p.name}</b></div>
      <div class="kv"><span>UID</span><b style="font-size:10px">${p.uid}</b></div>
      <div class="kv"><span>角色</span><b>${E.char(p).n}</b></div>
      <div class="kv"><span>通关关卡</span><b>${Object.keys(p.cleared || {}).length} / ${EX.levels.length}</b></div>
      <div class="kv"><span>体力</span><b>${Math.floor(p.stamina || 0)}/${EX.STAMINA_MAX} <button class="btn sm" id="setAdStam">看广告+10</button></b></div>
      <div class="kv"><span>成就点</span><b>${E.fmt(p.ach || 0)}</b></div>
      <div class="kv"><span>累计击杀</span><b>${E.fmt((p.stats && p.stats.kills) || 0)}</b></div></div>
      <div class="card"><div class="card-t">🏅 我的称号 <span class="sub">${(p.titles || []).length} 个</span></div>
      ${(p.titles || []).length ? (p.titles || []).map((id) => {
        const t = E.titleDef(id);
        const on = (p.title || '') === id;
        return `<div class="zrow"><div class="zav">🏅</div>
          <div class="zi"><b style="color:${t ? t.color : 'var(--txt)'}">${t ? t.n : id}</b>
          <span>${t ? t.desc : '称号'}</span></div>
          ${on ? '<span class="st on">已装备</span>'
               : `<button class="btn sm" data-eqt="${id}">装备</button>`}</div>`;
      }).join('') + ((p.title) ? '<button class="btn d sm blk" data-eqt="">卸下当前称号</button>' : '')
        : '<div class="lbl">暂无称号（成就商店 / 排行榜奖励可获得）</div>'}</div>
      <div class="card"><div class="card-t">🖼️ 我的头像框 <span class="sub">${(p.frames || []).length} 个</span></div>
      ${(p.frames || []).length ? (p.frames || []).map((id) => {
        const t = E.frameDef(id);
        const on = (p.frame || '') === id;
        return `<div class="zrow"><div class="zav">🖼️</div>
          <div class="zi"><b style="color:${t ? t.color : 'var(--txt)'}">${t ? t.n : id}</b>
          <span>头像框</span></div>
          ${on ? '<span class="st on">已装备</span>'
               : `<button class="btn sm" data-eqf="${id}">装备</button>`}</div>`;
      }).join('') + ((p.frame) ? '<button class="btn d sm blk" data-eqf="">卸下当前头像框</button>' : '')
        : '<div class="lbl">暂无头像框（活动商店可获得）</div>'}</div>
      <div class="card"><div class="card-t">引导进度 <span class="sub">${Object.keys(p.guide || {}).length}/${EX.guides.length}</span></div>
      ${EX.guides.filter((g) => g.must).map((g) => `<div class="kv"><span style="font-size:10px">${g.n}</span>
        <b style="font-size:10px;color:${(p.guide || {})[g.id] ? 'var(--green)' : '#6b7899'}">${(p.guide || {})[g.id] ? '✔ 已完成' : '待引导'}</b></div>`).join('')}</div>
      <div class="card"><div class="card-t">广告福利 <span class="sub">表24 广告位</span></div>
      <div class="kv"><span style="font-size:10px">免费体力 AD03</span>
        <b><button class="btn sm" id="setAdStam2">看广告 +10 体力（剩 ${E.adLeft(p, 'AD03')}）</button></b></div>
      <div class="kv"><span style="font-size:10px">免费抽奖 AD04</span>
        <b><button class="btn sm" id="setAdDraw">看广告 抽奖1次（剩 ${E.adLeft(p, 'AD04')}）</button></b></div>
      <div class="kv"><span style="font-size:10px">额外宝箱 AD05</span>
        <b><button class="btn sm" id="setAdBox">看广告 宝箱×1（剩 ${E.adLeft(p, 'AD05')}）</button></b></div>
      <div class="lbl" style="text-align:left">每日上限：体力5次 · 抽奖3次 · 宝箱5次（每日重置）</div></div>
      <div class="card"><div class="card-t">数据</div>
      <button class="btn blk" id="setSave">立即保存存档</button>
      <button class="btn d blk" id="setReset">重置存档（清空全部进度）</button>
      <div class="lbl">存档保存于云端仓库，换设备登录同一代号可继续。</div></div>
      <div class="card"><div class="card-t">后台管理</div>
      <button class="btn blk" id="setAdmin">进入管理后台</button></div>`;
  },
  b_set(p, tab) {
    /* ---------- 音频开关 / 音量 ---------- */
    if (tab === '音频') {
      const S = window.SND;
      $$('[data-snd]').forEach((btn) => {
        btn.onclick = () => {
          if (!S) { this.toast('音频未初始化', 'err'); return; }
          const k = btn.dataset.snd;
          if (k === 'music') { S.setMusic(!S.musicOn); if (S.musicOn) S.bgm('base'); }
          else { S.setSfx(!S.sfxOn); }
          S.saveCfg();
          if (k === 'sfx' && S.sfxOn) S.play('click');
          this.open('set', '音频'); this.home();
        };
      });
      const vm = $('#volM'), vs2 = $('#volS');
      const applyVol = () => {
        if (!S) return;
        const m = Math.max(0, Math.min(1, (Number(vm && vm.value) || 0) / 100));
        const sv = Math.max(0, Math.min(1, (Number(vs2 && vs2.value) || 0) / 100));
        S.setVol(m, sv); S.saveCfg();
        this.open('set', '音频'); this.home();
      };
      if (vm) vm.onchange = applyVol;
      if (vs2) vs2.onchange = applyVol;
      return;
    }
    /* 称号装备 / 卸下（此前 p.titles 写入后全项目零读取，玩家看不到也用不了） */
    $$('#pnBody [data-eqt]').forEach((b) => { b.onclick = () => {
      const r = E.equipTitle(p, b.dataset.eqt || '');
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { E.save(p); this.open('set'); this.home(); }
    }; });
    /* 头像框装备 / 卸下 */
    $$('#pnBody [data-eqf]').forEach((b) => { b.onclick = () => {
      const r = E.equipFrame(p, b.dataset.eqf || '');
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { E.save(p); this.open('set'); this.home(); }
    }; });
    /* 修改密码 */
    const sp = $('#spGo');
    if (sp) sp.onclick = async () => {
      const tip = $('#spTip');
      const ac = UA.remembered();
      const o = ($('#spOld') || {}).value || '';
      const n1 = ($('#spNew') || {}).value || '';
      const n2 = ($('#spNew2') || {}).value || '';
      if (!ac.name) { if (tip) tip.textContent = '未获取到账号名'; return; }
      if (!o) { if (tip) tip.textContent = '请输入原密码'; return; }
      if (n1 !== n2) { if (tip) tip.textContent = '两次新密码不一致'; return; }
      const r = await UA.changePwd(ac.name, o, n1);
      if (tip) tip.textContent = r.ok ? (r.msg || '修改成功') : r.msg;
      this.toast(r.ok ? '密码已修改' : r.msg, r.ok ? 'ok' : 'err');
    };
    /* 注销账号 */
    const sd = $('#spDelGo');
    if (sd) sd.onclick = async () => {
      const ac = UA.remembered();
      const w = ($('#spDel') || {}).value || '';
      if (!w) { this.toast('请输入密码确认', 'err'); return; }
      if (!confirm('确定注销账号「' + (ac.name || '') + '」？\n云端存档将一并删除，无法恢复！')) return;
      const r = await UA.destroy(ac.name, w);
      this.toast(r.msg || (r.ok ? '已注销' : '注销失败'), r.ok ? 'ok' : 'err');
      if (r.ok) setTimeout(() => { if (window.UA) UA.logout(); }, 800);
    };
    /* 退出登录 / 切换账号 */
    const sw = $('#setSwitchAcct');
    if (sw) sw.onclick = () => {
      if (!confirm('退出当前账号？')) return;
      if (window.UA) UA.logout();
    };
    /* 礼包码兑换 */
    const cdg = $('#cdGo');
    if (cdg) cdg.onclick = async () => {
      const v = ($('#cdInput') && $('#cdInput').value) || '';
      if (!v.trim()) return this.toast('请输入兑换码', 'err');
      cdg.disabled = true; cdg.textContent = '兑换中…';
      const r = await MAIN.redeemCode(v);
      cdg.disabled = false; cdg.textContent = '🎁 立即兑换';
      const tip = $('#cdTip');
      if (tip) tip.innerHTML = `<span style="color:${r.ok ? 'var(--green)' : 'var(--red)'}">${this.esc(r.msg)}</span>`;
      this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { if (window.SND) SND.play('pick'); this.home(); }
    };
    /* 表39 多语言切换 */
    $$('#pnBody [data-lang]').forEach((b) => { b.onclick = () => {
      if (window.OPS) OPS.setLang(b.dataset.lang);
      this.toast('语言已切换为 ' + b.dataset.lang, 'ok');
      this.open('set', '语言'); this.home();
    }; });
    /* 表37 清空埋点 */
    const oct = $('#opsClearTrack');
    if (oct) oct.onclick = () => {
      if (window.OPS) OPS.clearTrack(); this.toast('埋点数据已清空', 'ok'); this.open('set', '运营');
    };
    const sv = $('#setSave'); if (sv) sv.onclick = async () => { await MAIN.save(); this.toast('存档已上传', 'ok'); };
    const rs = $('#setReset'); if (rs) rs.onclick = () => {
      if (!confirm('确定清空全部进度？此操作不可恢复！')) return;
      localStorage.removeItem('zb_uid'); location.reload();
    };
    const ad = $('#setAdmin'); if (ad) ad.onclick = () => { location.href = 'admin/'; };
    const st = $('#setAdStam'); if (st) st.onclick = () => {
      /* 体力已满时先看广告会白扣次数（每日仅 10 次），提前拦截 */
      if (E.staminaFull(p)) return this.toast('体力已满（' + EX.STAMINA_MAX + '），无需观看', 'err');
      const r = E.useAd(p, 'AD03');
      if (!r.ok) return this.toast(r.msg, 'err');
      const got = E.addStamina(p, 10);
      this.toast('体力 +' + got + '（今日剩余 ' + E.adLeft(p, 'AD03') + ' 次）', 'ok');
      this.open('set', '账号'); this.home();
    };
    /* 表24 AD04 免费抽奖 */
    const dw = $('#setAdDraw'); if (dw) dw.onclick = () => {
      const r = E.useAd(p, 'AD04');
      if (!r.ok) return this.toast(r.msg, 'err');
      const got = E.adDraw(p);
      if (window.SND) SND.play('get');
      this.toast('抽奖获得：' + got.n + '（今日剩余 ' + E.adLeft(p, 'AD04') + ' 次）', 'ok');
      E.save(p); this.open('set', '账号'); this.home();
    };
    /* 表24 AD05 额外宝箱 */
    const bx = $('#setAdBox'); if (bx) bx.onclick = () => {
      const r = E.useAd(p, 'AD05');
      if (!r.ok) return this.toast(r.msg, 'err');
      const got = E.adBoxReward(p);
      if (window.SND) SND.play('get');
      this.toast('获得：' + got.n + '（今日剩余 ' + E.adLeft(p, 'AD05') + ' 次）', 'ok');
      E.save(p); this.open('set', '账号'); this.home();
    };
    const st2 = $('#setAdStam2'); if (st2) st2.onclick = () => {
      if (E.staminaFull(p)) return this.toast('体力已满（' + EX.STAMINA_MAX + '），无需观看', 'err');
      const r = E.useAd(p, 'AD03');
      if (!r.ok) return this.toast(r.msg, 'err');
      const got = E.addStamina(p, 10);
      this.toast('体力 +' + got + '（今日剩余 ' + E.adLeft(p, 'AD03') + ' 次）', 'ok');
      E.save(p); this.open('set', '账号'); this.home();
    };
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
  btInit(p, levelId, endless) {
    const d = BT.run ? BT.run.def : null;
    /* 全部做判空：任何一个元素缺失都不能让战斗初始化中断 */
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    const setH = (id, v) => { const e = $(id); if (e) e.innerHTML = v; };
    const setV = (id, v) => { const e = $(id); if (e) e.value = v; };
    set('#btLevel', endless ? '无尽模式' : (d ? d.n : E.levelName(levelId)));
    set('#btKill', '0');
    set('#btGold', '0');
    set('#btLv', '1');
    setH('#btSkills', '');
    set('#btTime', '00:00');
    set('#btWave', '1');
    set('#btWaveMax', d ? d.waves : 20);
    set('#btMag2', BT.run ? BT.run.mag : 30);
    set('#btMagMax', BT.run ? BT.run.magMax : 30);
    set('#btCoin', '0');
    this.btTick();
  },
  /* 战斗对话气泡（截图45/46：核心G-94 协同作战） */
  btTalk(text, ms) {
    const el = $('#btTalk'), tx = $('#btTalkTx');
    if (!el || !tx || !text) return;
    tx.textContent = text;
    el.classList.add('on');
    clearTimeout(this._talkT);
    this._talkT = setTimeout(() => el.classList.remove('on'), ms || 4200);
  },

  /* 开局台词（截图45/46） */
  /* =========================================================
   * 维护模式拦截（后台「服务器运维 → 启停维护」）
   * 真正挡住战斗入口，而不是只弹一行提示就放行。
   * ========================================================= */
  MAINT: null,
  showMaint(d) {
    this.MAINT = d || {};
    const box = document.getElementById('maintMask');
    if (box) {
      box.innerHTML = '<div class="mt-box">' +
        '<div class="mt-ico">🖥️</div>' +
        '<div class="mt-t">服务器维护中</div>' +
        '<div class="mt-s">' + ((d && d.msg) || '服务器正在维护，请稍后再来') + '</div>' +
        ((d && d.until) ? '<div class="mt-u">预计维护时长：' + d.until + ' 分钟</div>' : '') +
        '<button class="mt-btn" onclick="location.reload()">重新检测</button>' +
        '</div>';
      box.style.display = 'flex';
    }
  },
  /* 统一的战斗入口守卫：维护中一律不放行 */
  guardBattle() {
    if (this.MAINT && this.MAINT.mode === '维护') {
      this.toast('🖥️ ' + (this.MAINT.msg || '服务器维护中，暂无法进入战斗'), 'err');
      this.showMaint(this.MAINT);
      return false;
    }
    return true;
  },


  btIntroTalk(r) {
    const lines = [
      '丧尸越来越多了，守住防线！',
      '丧尸大队马上赶到，弹药资源有限，申请支援！',
      '我是来自后方实验室的核心G-94，我的任务是协同你一起作战，对抗尸潮。请快速填充弹药，接下来我会配合你的。',
    ];
    this.btTalk(lines[Math.floor(Math.random() * lines.length)], 4600);
  },

  btTick() {
    const r = BT.run; if (!r) return;
    /* 顶部关卡 / 波次 */
    const blv = $('#btLevel');
    if (blv) {
      /* 截图格式：1.城市大街 */
      const nm = r.endless ? ('无尽 ' + r.wave + ' 层')
        : (r.def && r.def.n ? r.def.n : ('第 ' + r.wave + ' 波'));
      blv.textContent = r.endless ? nm : ((r.ch || 1) + '.' + String(nm).replace(/^第\s*|^\s*关/g, ''));
    }
    const bw0 = $('#btWave'); if (bw0) bw0.textContent = r.wave;
    const bwm0 = $('#btWaveMax'); if (bwm0) bwm0.textContent = r.waveTotal;
    const bt = $('#btTime');
    if (bt) { const s = Math.floor(r.time);
      bt.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
    /* 血量（旧布局，保留兼容） */
    const hb = $('#btHpBar'); if (hb) hb.style.width = Math.max(0, r.hp / r.maxHp * 100) + '%';
    const ht = $('#btHpTxt'); if (ht) ht.textContent = Math.ceil(r.hp) + '/' + Math.ceil(r.maxHp);
    const sh = $('#btShWrap'), sb = $('#btShBar');
    if (sh && sb) { if (r.maxShield > 0) { sh.style.display = ''; sb.style.width = (r.shield / r.maxShield * 100) + '%'; }
      else sh.style.display = 'none'; }
    const bk = $('#btKill'); if (bk) bk.textContent = r.kills;
    const cg = $('#btCoin'); if (cg) cg.textContent = E.fmt(r.coin != null ? r.coin : r.gold);
    /* BUG：局内金币 HUD 从未刷新，一直是 0 */
    const bg = $('#btGold'); if (bg) bg.textContent = E.fmt(r.coin != null ? r.coin : r.gold);
    const bd2 = $('#btDia2'); if (bd2) bd2.textContent = E.fmt((BT.P && BT.P.diamond) || 0);
    $('#btLv').textContent = r.lv;
    /* 顶部波次 */
    const bw = $('#btWave'); if (bw) bw.textContent = r.wave;
    const bwm = $('#btWaveMax'); if (bwm) bwm.textContent = r.waveTotal;
    /* P 判空：战斗 HUD 每帧刷新，若玩家对象异常会连续抛错打断渲染。
     * 此前 this.P 为 null 时 E.power(null) / this.P.diamond 直接崩溃。 */
    if (!this.P) return;
    /* 左上英雄立绘 + 战力 */
    const hi = $('#btHeroImg');
    if (hi && !hi.src) { const av = (E.char(this.P) || {}).img; if (av) hi.src = av; }
    const bpw = $('#btPower'); if (bpw) bpw.textContent = E.fmt(E.power(this.P));
    const bd = $('#btDia'); if (bd) bd.textContent = E.fmt(this.P.diamond || 0);
    /* 武器图标（底部 + 右上） */
    const gi = $('#btGunImg');
    if (gi && !gi.src) { const g = E.gun(this.P); if (g && g.img) gi.src = g.img; }
    const gi2 = $('#btGunImg2');
    if (gi2 && !gi2.src) { const g2 = E.gun(this.P); if (g2 && g2.img) gi2.src = g2.img; }
    /* 右上弹药 30/30 */
    const mg2 = $('#btMag2'), mgm = $('#btMagMax');
    if (mg2) mg2.textContent = r.mag != null ? r.mag : 30;
    if (mgm) mgm.textContent = (E.attrs(this.P).mag) || 30;
    /* 倍速按钮 */
    const sp = $('#btSpeed'); if (sp) sp.textContent = 'X' + (BT.speed || 1);
    /* 防线血条 */
    const wb = $('#btWallBar'), wt = $('#btWallTxt');
    if (wb) {
      const wm = r.wallMax || r.maxHp, wv = r.wallHp != null ? r.wallHp : r.hp;
      wb.style.width = Math.max(0, wv / wm * 100) + '%';
      if (wt) wt.textContent = Math.ceil(Math.max(0, wv));
      /* 截图：只显示当前血量数值（如 3000），不显示上限 */
    }
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
    const sk = $('#btSkills');
    const ids = Object.keys(r.skills).filter((id) => {
      const d = EX.skills.find((x) => x.id === id); return d && d.kind !== 'passive';
    });
    const key = ids.join(',') + '|' + ids.map((i) => (r.cd[i] || 0).toFixed(1)).join(',');
    if (sk.dataset.k !== key) {
      sk.dataset.k = key;
      sk.innerHTML = ids.map((id) => {
        const d = EX.skills.find((x) => x.id === id); if (!d) return '';
        const cd = r.cd[id] || 0;
        const el = EX.elements.find((x) => x.k === d.el) || { c: '#ffd76a' };
        return `<div class="bs ${cd > 0 ? 'cd' : ''}" data-cast="${id}"
          style="border-color:${el.c}66">
          ${d.img ? `<img src="${d.img}" style="width:26px;height:26px;border-radius:6px;object-fit:cover">`
                  : d.icon}<b>${r.skills[id]}</b>
          <u style="width:${cd > 0 ? Math.min(100, cd / (d.cd || 5) * 100) : 0}%"></u></div>`;
      }).join('');
      $$('#btSkills [data-cast]').forEach((b) => {
        b.onclick = () => {
          const res = BT.castSkill(b.dataset.cast);
          if (res && res.msg) this.toast(res.msg, res.ok ? 'ok' : 'err');
        };
      });
    }
    /* 炮台建造栏 */
    const tb = $('#btTurret');
    if (tb && !tb.dataset.init) {
      tb.dataset.init = '1';
      tb.innerHTML = EX.turrets.map((t) => {
        const el = EX.elements.find((x) => x.k === t.el) || { c: '#ffd76a' };
        return `<button data-turret="${t.id}" style="border-color:${el.c}55">${t.img
          ? `<img src="${t.img}" style="width:24px;height:24px;border-radius:5px;object-fit:cover;display:block;margin:0 auto 2px">`
          : t.icon + ' '}${t.n}<br>${t.cost}金</button>`;
      }).join('');
      $$('#btTurret [data-turret]').forEach((b) => {
        b.onclick = () => {
          const slot = this.pickFreeSlot();
          if (!slot) return this.toast('炮台槽位已满', 'err');
          const res = BT.buildTurret(slot, b.dataset.turret);
          this.toast(res.msg, res.ok ? 'ok' : 'err');
          if (res.ok && window.SND) SND.play('equip');
        };
      });
    }
  },

  /* ---------- 技能三选一 ---------- */
  showSkillChoice(picks) {
    /* 健壮性修复：picks 为空/未传时（战斗外调用、或抽取失败）会一路崩到
     * `picks.map(...)`，且 15 秒倒计时回调里 `picks[0]` 会二次崩溃。
     * 这里统一兜底：无候选则直接收起面板，避免白屏与报错刷屏 */
    if (!picks || !picks.length) {
      picks = (BT._picks && BT._picks.length) ? BT._picks : [];
    }
    if (!picks.length) {
      try { this.hideChoice(); } catch (e) {}
      return;
    }
    /* 截图特征：顶部「选择技能」+ 15 秒倒计时 */
    const chT = $('#chTitle'); if (chT) chT.textContent = '选择技能';
    this.chTime = 15;
    const tm = $('#chTimer');
    if (tm) {
      tm.textContent = '15';
      clearInterval(this._chIv);
      this._chIv = setInterval(() => {
        this.chTime--;
        if (tm) tm.textContent = Math.max(0, this.chTime);
        if (this.chTime <= 0) {
          clearInterval(this._chIv);
          /* 超时自动选第一个 */
          if (picks[0]) BT.pickSkill(picks[0].id);
          this.hideChoice();
        }
      }, 1000);
    }
    const owned = (BT.run && BT.run.skills) ? BT.run.skills : {};
    /* 截图47：刷新按钮 + 当局剩余观看次数 */
    this.rfLeft = (this.rfLeft == null ? 1 : this.rfLeft);
    const rfB = $('#chRefresh');
    if (rfB) {
      rfB.innerHTML = '🔄 刷新';
      rfB.disabled = this.rfLeft <= 0;
      rfB.style.opacity = this.rfLeft > 0 ? '1' : '.45';
    }
    const rfN = $('#chRfNum');
    if (rfN) rfN.textContent = '当局剩余观看次数 ' + Math.max(0, this.rfLeft) + '/1';
    $('#chCards').innerHTML = picks.map((s) => {
      const isNew = !owned[s.id];
      const L = ((BT.run && BT.run.skills ? BT.run.skills[s.id] : 0) || 0);
      const el = EX.elements.find((x) => x.k === s.el) || { c: '#ffd76a' };
      const kindTxt = s.kind === 'passive' ? '被动强化（自动生效）' : s.kind === 'summon' ? '召唤' : '主动释放';
      return `<button class="ccard" data-pick="${s.id}">
        ${isNew ? '<i class="cc-new">新</i>' : ''}
        <i style="background:${el.c}22">${s.img
          ? `<img src="${s.img}" style="width:38px;height:38px;border-radius:8px;object-fit:cover">`
          : s.icon}</i>
        <div class="ci"><div class="cn"><span style="color:${el.c}">${s.n}</span>
          ${L ? `<span class="tag y">Lv.${L}→${L + 1}</span>`
              : (isNew ? '' : '<span class="tag g">未学习</span>')}</div>
          <div class="cd2">${s.desc}</div>
          <div class="cl">${isNew ? '<b style="color:#ff5c7a">学习' + s.n + '</b>' : kindTxt} · ${s.up}</div>
        </div>
        <div class="ch-arrow">▼</div></button>`;
    }).join('');
    $$('#chCards .ccard').forEach((b) => {
      /* 表37 埋点：skill_select */
      try { OPS.track('skill_select', { sk: b.dataset.pick }); } catch (e) {}
      b.onclick = () => { $('#choice').classList.remove('on'); BT.pickSkill(b.dataset.pick); };
    });
    $('#choice').classList.add('on');
  },
  hideChoice() { clearInterval(this._chIv); $('#choice').classList.remove('on'); },

  /* ---------- 结算 ---------- */
  /* 章节 CG 过场（首次进入该章节播放一次） */
  showCG(cg, ch, chapterName, onGo) {
    const m = $('#cgModal');
    if (!m || !cg) { if (onGo) onGo(); return; }
    const im = $('#cgImg');
    if (im) {
      im.onerror = () => { im.style.display = 'none'; };
      im.style.display = '';
      im.src = cg.src;
    }
    const c1 = $('#cgCh'); if (c1) c1.textContent = '第 ' + ch + ' 章';
    const c2 = $('#cgName'); if (c2) c2.textContent = chapterName || '';
    const c3 = $('#cgDesc'); if (c3) c3.textContent = (EX.chapterDesc || {})[ch] || '';
    const go = $('#cgGo');
    if (go) go.onclick = () => { m.classList.remove('on'); if (onGo) onGo(); };
    m.classList.add('on');
    try { OPS.track('cg_show', { ch: ch }); } catch (e) {}
    if (window.SND) SND.play('upgrade');
  },

  /* 升级弹窗（截图52：发光圆形徽章数字 + 奖励 R币） */
  showLvUp(lv, rw) {
    const b = $('#lvup');
    if (!b) return;
    $('#lvupNum').textContent = lv;
    $('#lvupRw').innerHTML = '获得 <b style="color:var(--yel)">' + (rw || 200) + '</b> R币';
    b.classList.add('on');
    if (window.SND) SND.play('upgrade');
    clearTimeout(this._lvT);
    this._lvT = setTimeout(() => b.classList.remove('on'), 2200);
  },

  showResult(res, d) {
    const win = res === 'win';
    /* 表37 埋点：level_finish */
    try { OPS.track('level_finish', { win: win, t: Math.floor(d.time || 0) }); } catch (e) {}
    /* 截图51/52：标题「恭喜获得」+ 剩余血量% + 新纪录 */
    $('#rsTitle').textContent = win ? '恭 喜 获 得' : (res === 'lose' ? '防 线 失 守' : '撤 离 战 场');
    $('#rsTitle').className = 'rs-t ' + (win ? 'win' : 'lose');
    const r = BT.run || {};
    const hpPct = r.wallMax ? Math.round(Math.max(0, r.wallHp) / r.wallMax * 100) : 0;
    const best = (this.P.bestHpPct || {})[(r.def || {}).id] || 0;
    const isNew = win && hpPct > best;
    if (isNew) { this.P.bestHpPct = this.P.bestHpPct || {}; this.P.bestHpPct[(r.def || {}).id] = hpPct; }
    $('#rsLevel').innerHTML = `剩余血量：<b style="color:var(--grn)">${hpPct}%</b>`
      + (isNew ? ' <span class="rs-new">新纪录</span>' : '')
      + ((r.def || {}).n ? ' · ' + r.def.n : '');
    /* 奖励（截图51：EXP / 枪械部件 / 技能 / 宝石 / 图纸 / R币） */
    const rw = d.rw || {};
    $('#rsGrid').innerHTML = `
      <div class="rs-i"><div class="v">${E.fmt(rw.exp || 15)}</div><div class="l">EXP</div></div>
      <div class="rs-i"><div class="v">${E.fmt(rw.gold)}</div><div class="l">R币</div></div>
      <div class="rs-i"><div class="v">${d.kills}</div><div class="l">击杀</div></div>
      <div class="rs-i"><div class="v">${rw.parts || 0}</div><div class="l">1阶枪械部件</div></div>`;
    /* 技能伤害统计（截图51） */
    const dm = $('#rsDmg');
    if (dm) {
      const st = (r.skillDmg || {});
      const ks = Object.keys(st);
      dm.innerHTML = ks.length ? `<div class="rsd-t">技能伤害</div>` + ks.map((k) => {
        const sk = (EX.skills || []).find((x) => x.id === k);
        const sec = Math.max(1, Math.floor(r.time || 1));
        return `<div class="rsd-r"><span>${sk ? sk.n : k}</span>
          <b>${E.fmt(st[k])}</b><i>${E.fmt(Math.round(st[k] / sec))}/s</i></div>`;
      }).join('') : '';
    }
    /* 今日剩余次数（截图51） */
    const tn = $('#rsTimes');
    if (tn) {
      /* BUG修复：此前用广告剩余次数(10)当挑战次数，显示成「10/3」 */
      const left = E.runLeft ? E.runLeft(this.P) : 3;
      tn.textContent = '今日剩余次数：' + Math.max(0, left) + '/3';
    }
    $('#rsNext').style.display = win && !BT.run.endless ? '' : 'none';
    /* 广告：双倍奖励 / 复活 */
    const adBox = $('#rsAd');
    if (adBox) {
      if (win) adBox.innerHTML = `<button class="btn c blk" id="rsAd2x">📺 看广告双倍奖励（剩 ${E.adLeft(this.P, 'AD02')} 次）</button>`;
      else adBox.innerHTML = `<button class="btn c blk" id="rsAdRev">📺 看广告原地复活（剩 ${E.adLeft(this.P, 'AD01')} 次）</button>`;
      const b2 = $('#rsAd2x');
      if (b2) b2.onclick = () => {
        const r = E.useAd(this.P, 'AD02'); if (!r.ok) return this.toast(r.msg, 'err');
      try { OPS.track('ad_watch', {}); } catch (e) {}
        this.P.gold += Math.floor((d.rw.gold || 0));
        this.toast('奖励翻倍！金币 +' + E.fmt(d.rw.gold), 'ok');
        b2.disabled = true; b2.textContent = '已领取双倍'; this.home(); MAIN.save();
      };
      const br = $('#rsAdRev');
      if (br) br.onclick = () => {
        const r = E.useAd(this.P, 'AD01'); if (!r.ok) return this.toast(r.msg, 'err');
        try { OPS.track('ad_watch', {}); } catch (e) {}
        try { OPS.track('resurrect', {}); } catch (e) {}
        /* 表26 用例5：原地复活（保留波次/击杀/技能，仅回满血量）
         * 此前是 startBattle() 重开整关，进度全部丢失 */
        const rv = BT.revive ? BT.revive() : { ok: false, msg: '复活失败' };
        if (!rv.ok) return this.toast(rv.msg, 'err');
        this.hideResult();
        this.toast('💚 ' + rv.msg + '（今日剩 ' + E.adLeft(this.P, 'AD01') + ' 次）', 'ok');
        if (window.SND) SND.play('upgrade');
      };
    }
    $('#result').classList.add('on');
  },
  pickFreeSlot() {
    const r = BT.run; if (!r) return null;
    for (const s of EX.turretSlots) {
      const has = r.turrets.find((t) => t.k === s.k);
      if (!has) return s.k;
    }
    /* 全满则升级第一个 */
    return r.turrets.length ? r.turrets[0].k : null;
  },
  hideResult() { $('#result').classList.remove('on'); },
};

window.UI = UI;
