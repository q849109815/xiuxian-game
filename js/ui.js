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
  PANELS: {
    role: ['角色', ['角色', '皮肤']],
    gun: ['武器', ['强化', '武器库']],
    chip: ['芯片', ['装配', '背包']],
    talent: ['天赋', ['天赋']],
    task: ['任务', ['主线', '每日', '每周', '成就']],
    bag: ['背包', ['材料', '消耗品']],
    shop: ['商城', ['礼包', '直购']],
    act: ['活动', ['活动']],
    rank: ['排行榜', ['全服']],
    set: ['设置', ['账号', '网络', '数值']],
    level: ['关卡选择', ['章节']],
    base: ['基地建筑', ['建筑']],
    tavern: ['酒馆招募', ['佣兵']],
    core: ['核心技能', ['技能']],
    legion: ['军团', ['军团', '成员']],
    exped: ['远征堡垒', ['远征', '巡逻']],
  },

  open(key, tab) {
    if (window.SND) SND.play('panel');
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
  /* ---------- 酒馆：招募佣兵（真实玩法：基地酒馆） ---------- */
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
      return `<div class="card"><div class="card-t">${lg.n}</div>
        <div class="kv"><span>军团等级</span><b>Lv.${lg.lv || 1}</b></div>
        <div class="kv"><span>人数</span><b>${(lg.members || []).length}/${lg.cap || 50}</b></div>
        <div class="kv"><span>我的贡献</span><b>${E.fmt(p.legionExp || 0)}</b></div>
        <div class="sub" style="padding:6px 2px">捐献资源可提升军团等级，解锁军团商店与军团副本。</div>
        <button class="btn" id="lgDonate" style="width:100%;margin-top:6px">🪙 捐献 5000 金币（+100 贡献）</button>
      </div>`;
    }
    return `<div class="card"><div class="card-t">加入军团</div>
      <div class="sub" style="padding:4px 2px">军团可提供属性加成、军团副本与军团商店。</div>
      ${EX.legions.map((l) => `<div class="mc-card">
        <div class="mi">${l.icon}</div>
        <div class="mn"><b>${l.n}</b><span>${l.desc}</span>
          <span>人数 ${l.mem} · 需要战力 ${E.fmt(l.need)}</span></div>
        <button data-join="${l.id}" ${E.power(this.P) < l.need ? 'disabled' : ''}>加入</button>
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
      const rw = { gold: e.gold, ['M0' + ((Math.floor(Math.random() * 5)) + 1)]: e.mat };
      for (const k in rw) { if (k === 'gold') p.gold += rw[k]; else p.mat[k] = (p.mat[k] || 0) + rw[k]; }
      E.save(p); this.toast('远征完成，获得奖励', 'ok');
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
  r_role(p, tab) {
    if (tab === '皮肤') {
      return `<div class="card"><div class="card-t">皮肤 <span class="sub">钻石解锁，切换角色后需重新选</span></div>
      ${EX.skins.filter((s) => s.char === (p.char || 'C01')).map((s) => {
        const own = (p.skins || []).indexOf(s.id) >= 0;
        const on = p.skin === s.id;
        return `<div class="item"><div class="ic">${s.img
          ? `<img src="${s.img}" style="width:34px;height:44px;border-radius:6px;object-fit:cover">`
          : `<span style="font-size:20px">${s.icon}</span>`}</div>
          <div class="info"><div class="nm">${s.n} ${s.bonus ? '<span class="tag y">' + s.desc + '</span>' : ''}</div>
          <div class="sub">${s.desc}</div></div>
          <div class="act">${on ? '<span class="tag g">穿着中</span>'
            : own ? `<button class="btn c sm" data-wear="${s.id}">穿上</button>`
            : `<button class="btn sm" data-buyskin="${s.id}">💎${s.price}</button>`}</div></div>`;
      }).join('')}</div>`;
    }
    const a = E.attrs(p);
    const ci = (E.char(p) || {}).img;
    return `<div class="card"><div class="card-t">当前先锋官</div>
      <div style="text-align:center;padding:6px 0">
        ${ci ? `<img src="${ci}" style="width:88px;height:88px;border-radius:14px;border:2px solid var(--gold);object-fit:cover"
             onerror="this.outerHTML='<div style=\'font-size:52px\'>${E.char(p).icon}</div>'">`
             : `<div style="font-size:52px">${E.char(p).icon}</div>`}
        <div style="color:var(--gold);font-weight:700;margin-top:4px">${E.char(p).n}</div>
        <div style="font-size:10px;color:#7d8ca8">${E.skin(p).n}</div>
      </div></div>
      <div class="card"><div class="card-t">角色选择 <span class="sub">通关解锁</span></div>
      ${EX.chars.map((c) => {
        const ok = E.charUnlocked(p, c.id);
        const on = p.char === c.id;
        return `<div class="item"><div class="ic">${c.img
            ? `<img src="${c.img}" style="width:30px;height:30px;border-radius:7px;object-fit:cover">`
            : `<span style="font-size:20px">${c.icon}</span>`}</div>
          <div class="info"><div class="nm">${c.n} ${on ? '<span class="tag g">使用中</span>' : ''}</div>
          <div class="sub">生命${c.hp} 移速${c.spd} 护甲${c.armor} 暴击${(c.crit * 100).toFixed(0)}%</div>
          <div class="sub">${c.desc}</div>
          ${ok ? '' : `<div class="sub" style="color:#ff8fa4">需通关 ${c.unlockLv} 解锁</div>`}</div>
          <div class="act">${on ? '' : ok ? `<button class="btn c sm" data-char="${c.id}">切换</button>` : '<span class="tag r">未解锁</span>'}</div></div>`;
      }).join('')}</div>
      <div class="card"><div class="card-t">当前属性</div>
      <div class="kv"><span>角色</span><b>${a.charName}</b></div>
      <div class="kv"><span>战力</span><b style="color:var(--gold)">${E.fmt(E.power(p))}</b></div>
      <div class="kv"><span>武器</span><b>${a.gunName}</b></div>
      <div class="kv"><span>攻击力</span><b>${E.fmt(a.atk)}</b></div>
      <div class="kv"><span>生命值</span><b>${E.fmt(a.hp)}</b></div>
      <div class="kv"><span>护甲</span><b>${a.armor}</b></div>
      <div class="kv"><span>移动速度</span><b>${a.moveSpd}</b></div>
      <div class="kv"><span>暴击率</span><b>${(a.crit * 100).toFixed(1)}%</b></div>
      <div class="kv"><span>暴击伤害</span><b>${(a.critDmg * 100).toFixed(0)}%</b></div>
      <div class="kv"><span>吸血</span><b>${(a.ls * 100).toFixed(1)}%</b></div>
      <div class="kv"><span>复活次数</span><b>${a.revive}</b></div></div>
      <div class="card"><div class="card-t">进度</div>
      <div class="kv"><span>通关关卡</span><b>${Object.keys(p.cleared || {}).length} / ${EX.levels.length}</b></div>
      <div class="kv"><span>总星数</span><b>${E.totalStars(p)}</b></div>
      <div class="kv"><span>成就点</span><b>${E.fmt(p.ach || 0)}</b></div>
      <div class="kv"><span>无尽最佳</span><b>${p.endlessBest || 0} 层</b></div>
      <div class="kv"><span>累计击杀</span><b>${E.fmt((p.stats && p.stats.kills) || 0)}</b></div></div>`;
  },
  b_role(p) {
    $$('#pnBody [data-char]').forEach((b) => {
      b.onclick = () => { const r = E.switchChar(p, b.dataset.char); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('role', '角色'); this.home(); } };
    });
    $$('#pnBody [data-wear]').forEach((b) => {
      b.onclick = () => { p.skin = b.dataset.wear; this.toast('已更换外观', 'ok'); this.open('role', '皮肤'); this.home(); };
    });
    $$('#pnBody [data-buyskin]').forEach((b) => {
      b.onclick = () => { const r = E.buySkin(p, b.dataset.buyskin); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('role', '皮肤'); this.home(); } };
    });
  },

  /* ---------- 武器 ---------- */
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
      <div class="card"><div class="card-t">已解锁词条</div>
      ${Object.keys(p.gunStats || {}).length ? Object.values(p.gunStats || {}).map((st) => {
        const d = EX.gunStats.find((x) => x.k === st.k);
        return `<div class="kv"><span>${d ? d.n : st.k}</span><b style="color:var(--green)">+${d && d.unit === '%' ? (st.v * 100).toFixed(1) + '%' : st.v.toFixed(2)}</b></div>`;
      }).join('') : '<div class="lbl">尚未进阶，暂无词条</div>'}</div>`;
  },
  b_gun(p, tab) {
    const u = $('#gunUp'); if (u) u.onclick = () => {
      const r = E.upgradeGun(p); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('gun', tab); this.home(); }
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
    return `<div class="card"><div class="card-t">芯片槽 <span class="sub">${Object.keys(p.chips || {}).length}/6</span></div>
      <div class="lvgrid">${EX.chipSlots.map((s) => {
        const c = p.chips[s.k];
        return `<button class="lvc ${this.selChipSlot === s.k ? 'cur' : ''}" data-slot="${s.k}">
          <i style="font-size:18px;font-style:normal;display:block">${c ? '🔲' : '➕'}</i>
          <b style="font-size:9px;color:${c ? EX.qColor[c.q] : '#6b7899'}">${c ? c.q + '品' : '空'}</b></button>`;
      }).join('')}</div></div>
      <div class="card"><div class="card-t">可装备芯片</div>
      ${(p.bag || []).length ? (p.bag || []).map((c) => `<div class="item">
        <div class="ic" style="border:1.5px solid ${EX.qColor[c.q]}">
          <img src="assets/icon/i_chip.jpg" style="width:30px;height:30px;border-radius:6px;object-fit:cover"
               onerror="this.outerHTML='🔲'"></div>
        <div class="info"><div class="nm" style="color:${EX.qColor[c.q]}">${E.chipName(c)}</div></div>
        <div class="act"><button class="btn c sm" data-wear="${c.id}">装上</button></div></div>`).join('')
        : '<div class="lbl">背包内暂无芯片</div>'}</div>
      <div class="card"><div class="card-t">芯片图鉴 <span class="sub">资料 8 种</span></div>
      ${EX.chips.map((d) => `<div class="kv"><span style="color:${EX.qColor[d.q]}">${d.n}</span>
        <b style="font-size:10px">主+${(d.main.v * 100).toFixed(0)}%${d.subPool.length ? ' · 词条' + d.subPool.length : ''} · ${d.src}</b></div>`).join('')}</div>`;
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
  r_task(p, tab) {
    E.resetTasks(p);
    const map = { '主线': 'main', '每日': 'daily', '每周': 'weekly', '成就': 'achieve' };
    const list = EX.tasks[map[tab] || 'main'] || [];
    const claimedKey = { '主线': 'mainClaimed', '每日': 'dailyClaimed', '每周': 'weeklyClaimed', '成就': 'achieveClaimed' }[tab];
    const claimed = p.tasks[claimedKey] || [];
    return `<div class="card"><div class="card-t">${tab}任务 <span class="sub">${list.length} 条</span></div>
    ${list.map((t) => {
      const cur = E.taskProg(p, t), need = t.cond.v === 0 ? 1 : (typeof t.cond.v === 'string' ? 1 : t.cond.v);
      const done = E.taskDone(p, t);
      const got = claimed.indexOf(t.id) >= 0;
      return `<div class="item"><div class="ic">${done ? '✅' : '⏳'}</div>
        <div class="info"><div class="nm">${t.id} ${t.n}</div><div class="sub">${t.desc || ''}</div>
        <div class="bar"><i style="width:${Math.min(100, cur / need * 100)}%"></i></div>
        <div class="sub">${E.fmt(cur)} / ${need}</div></div>
        <div class="act">${got ? '<span class="tag g">已领取</span>' :
          `<button class="btn ${done ? 'c' : ''} sm" data-claim="${t.id}" ${done ? '' : 'disabled'}>${this.rwTxt(t.rw)}</button>`}</div></div>`;
    }).join('')}</div>
    <div class="card"><div class="card-t">成就点</div>
      <div class="kv"><span>当前成就点</span><b style="color:var(--gold)">${E.fmt(p.ach || 0)}</b></div></div>`;
  },
  b_task(p, tab) {
    $$('#pnBody [data-claim]').forEach((b) => {
      b.onclick = () => {
        const map = { '主线': 'main', '每日': 'daily', '每周': 'weekly', '成就': 'achieve' };
        const r = E.claimTask(p, map[tab] || 'main', b.dataset.claim);
        this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('task', tab); this.home(); }
      };
    });
  },

  /* ---------- 背包 ---------- */
  r_bag(p, tab) {
    if (tab === '消耗品') {
      return `<div class="card"><div class="card-t">消耗品</div>
      ${EX.items.filter((x) => x.type === '消耗').map((it) => {
        const n = (p.use || {})[it.id] || 0;
        return `<div class="item"><div class="ic">${it.img
          ? `<img src="${it.img}" style="width:30px;height:30px;border-radius:6px;object-fit:cover">`
          : it.icon}</div>
          <div class="info"><div class="nm">${it.n} <span class="tag">${n}</span></div>
          <div class="sub">${it.use || ''}</div><div class="sub">来源：${it.src}</div></div>
          <div class="act"><button class="btn sm" data-use="${it.id}" ${n ? '' : 'disabled'}>使用</button></div></div>`;
      }).join('')}</div>`;
    }
    const a = E.attrs(p);
    return `<div class="card"><div class="card-t">货币</div>
      <div class="kv"><span>金币</span><b style="color:var(--gold)">${E.fmt(p.gold)}</b></div>
      <div class="kv"><span>钻石</span><b style="color:var(--blue)">${E.fmt(p.diamond)}</b></div>
      <div class="kv"><span>成就点</span><b>${E.fmt(p.ach || 0)}</b></div>
      <div class="kv"><span>体力</span><b>${Math.floor(p.stamina || 0)} / ${EX.STAMINA_MAX}</b></div></div>
      <div class="card"><div class="card-t">材料 <span class="sub">武器进阶 / 合成</span></div>
      ${EX.items.filter((x) => x.type === '材料' || x.type === '碎片').map((it) => {
        const n = (p.mat || {})[it.id] || 0;
        const im = it.img ? `<img src="${it.img}" style="width:22px;height:22px;border-radius:5px;object-fit:cover;vertical-align:middle;margin-right:4px">` : (it.icon + ' ');
        return `<div class="kv"><span>${im}${it.n}</span><b>${E.fmt(n)}</b></div>`;
      }).join('')}</div>
      <div class="card"><div class="card-t">已装芯片加成</div>
      ${['atk', 'hp', 'armor', 'crit', 'critDmg', 'ls', 'rate'].map((k) => {
        const v = E.chipVal(p, k); if (!v) return '';
        const nm = { atk: '攻击', hp: '生命', armor: '护甲', crit: '暴击率', critDmg: '暴击伤害', ls: '吸血', rate: '攻速' }[k];
        return `<div class="kv"><span>${nm}</span><b style="color:var(--green)">+${(v * 100).toFixed(1)}%</b></div>`;
      }).join('') || '<div class="lbl">尚未装备芯片</div>'}</div>
      <div class="card"><div class="card-t">邮件 <span class="sub">${(p.mail || []).filter((m) => !m.got).length} 封未读</span></div>
      ${(p.mail || []).length ? p.mail.slice(-5).reverse().map((m) => `<div class="item">
        <div class="ic">📮</div><div class="info"><div class="nm">${m.t}</div><div class="sub">${m.b || ''}</div>
        <div class="sub">🪙${m.gold || 0} 💎${m.dia || 0}</div></div>
        <div class="act">${m.got ? '<span class="tag g">已领</span>' : ''}</div></div>`).join('')
        : '<div class="lbl">暂无邮件</div>'}</div>`;
  },
  b_bag(p, tab) {
    $$('#pnBody [data-use]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.use;
        if (!(p.use || {})[id]) return;
        p.use[id]--;
        if (id === 'I01') this.toast('使用了急救包（恢复生命 50%）', 'ok');
        else if (id === 'I02') this.toast('使用了护盾发生器', 'ok');
        else this.toast('使用了攻击增幅药剂（攻击+30%，30秒）', 'ok');
        this.open('bag', tab);
      };
    });
  },

  /* ---------- 商城 ---------- */
  r_shop(p, tab) {
    const list = EX.shop.filter((k) => tab === '礼包'
      ? (k.type === '礼包' || k.type === '月卡' || k.type === '战令') : (k.type === '直购'));
    return `<div class="card"><div class="card-t">商城 <span class="sub">${tab}</span></div>
    ${list.map((k) => `<div class="item"><div class="ic">${k.icon}</div>
      <div class="info"><div class="nm">${k.n} <span class="tag">${k.type}</span>${k.limit ? '<span class="tag r">限购' + k.limit + '</span>' : ''}</div>
      <div class="sub">${this.rwTxt(k.rw) || k.desc || ''}</div></div>
      <div class="act"><button class="btn c sm" data-buy="${k.id}">${k.price ? '¥' + k.price : '免费'}</button></div></div>`).join('')}</div>
      <div class="lbl">网页版为单机体验，点击直接发放（不产生真实支付）。</div>`;
  },
  b_shop(p, tab) {
    $$('#pnBody [data-buy]').forEach((b) => {
      b.onclick = () => {
        const k = EX.shop.find((x) => x.id === b.dataset.buy); if (!k) return;
        if (k.limit && (p.shopBuy || {})[k.id] >= k.limit) return this.toast('已达限购次数', 'err');
        p.shopBuy = p.shopBuy || {}; p.shopBuy[k.id] = (p.shopBuy[k.id] || 0) + 1;
        for (const key in k.rw || {}) {
          const v = k.rw[key];
          if (key === 'gold') p.gold += v;
          else if (key === 'diamond') p.diamond += v;
          else if (key === 'skin') { p.skins = p.skins || []; if (p.skins.indexOf(v) < 0) p.skins.push(v); }
          else if (key === 'chipRed') { for (let i = 0; i < v; i++) p.bag.push(E.rollChipById('CH06')); }
          else p.mat[key] = (p.mat[key] || 0) + v;
        }
        this.toast('购买成功：' + k.n, 'ok'); this.open('shop', tab); this.home();
      };
    });
  },

  /* ---------- 活动 ---------- */
  r_act(p) {
    return `<div class="card"><div class="card-t">活动 <span class="sub">${EX.activities.length} 个</span></div>
    ${EX.activities.map((a) => `<div class="item"><div class="ic">${a.icon}</div>
      <div class="info"><div class="nm">${a.id} ${a.n} <span class="tag">${a.type}</span></div>
      <div class="sub">${a.desc}</div><div class="sub">时间：${a.time} · 奖励：${a.rw}</div>
      <div class="sub">规则：${a.rule}</div></div>
      <div class="act"><button class="btn c sm" data-act="${a.id}">参与</button></div></div>`).join('')}</div>`;
  },
  b_act(p) {
    $$('#pnBody [data-act]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.act;
        if (id === 'EV03') {
          p.signin = (p.signin || 0) + 1;
          p.diamond += 20; p.mat.M01 = (p.mat.M01 || 0) + 10;
          this.toast('签到成功：钻石+20 金属+10（连续 ' + p.signin + ' 天）', 'ok');
          this.open('act'); this.home();
        } else { this.close(); startBattle('normal'); }
      };
    });
  },

  /* ---------- 排行榜 ---------- */
  r_rank(p) {
    const lb = window.LB || [];
    if (!lb.length) return '<div class="empty"><span class="ic">🏆</span>暂无排行数据<br><span style="font-size:10px">通关后自动上传，每小时刷新</span></div>';
    return lb.map((x, i) => `<div class="item">
      <div class="ic" style="font-size:15px;background:${i < 3 ? 'linear-gradient(135deg,#ffe9a8,#f0a020)' : 'rgba(10,16,28,.7)'};color:${i < 3 ? '#2a1a00' : '#fff'}">${i + 1}</div>
      <div class="info"><div class="nm">${x.n}</div><div class="sub">${x.lv || '—'} · 无尽 ${x.eb || 0} 层</div></div>
      <div class="act"><span class="tag y">${E.fmt(x.pw)}</span></div></div>`).join('');
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
          <div class="act">${lock ? '<span class="tag r">未解锁</span>' : `<button class="btn c sm" data-lv="${l.id}">挑战</button>`}</div></div>`;
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
    if (tab === '数值') {
      return `<div class="card"><div class="card-t">伤害公式 <span class="sub">资料 10 条</span></div>
        ${EX.formulas.map((f) => `<div class="kv"><span style="font-size:10px">${f.n}</span><b style="font-size:10px">${f.f}</b></div>`).join('')}</div>
        <div class="card"><div class="card-t">成长曲线</div>
        ${EX.growth.map((g) => `<div class="kv"><span style="font-size:10px">${g.n}</span><b style="font-size:10px">${g.curve}</b></div>`).join('')}</div>`;
    }
    return `<div class="card"><div class="card-t">账号信息</div>
      <div class="kv"><span>代号</span><b>${p.name}</b></div>
      <div class="kv"><span>UID</span><b style="font-size:10px">${p.uid}</b></div>
      <div class="kv"><span>角色</span><b>${E.char(p).n}</b></div>
      <div class="kv"><span>通关关卡</span><b>${Object.keys(p.cleared || {}).length} / ${EX.levels.length}</b></div>
      <div class="kv"><span>体力</span><b>${Math.floor(p.stamina || 0)}/${EX.STAMINA_MAX} <button class="btn sm" id="setAdStam">看广告+10</button></b></div>
      <div class="kv"><span>成就点</span><b>${E.fmt(p.ach || 0)}</b></div>
      <div class="kv"><span>累计击杀</span><b>${E.fmt((p.stats && p.stats.kills) || 0)}</b></div></div>
      <div class="card"><div class="card-t">引导进度 <span class="sub">${Object.keys(p.guide || {}).length}/${EX.guides.length}</span></div>
      ${EX.guides.filter((g) => g.must).map((g) => `<div class="kv"><span style="font-size:10px">${g.n}</span>
        <b style="font-size:10px;color:${(p.guide || {})[g.id] ? 'var(--green)' : '#6b7899'}">${(p.guide || {})[g.id] ? '✔ 已完成' : '待引导'}</b></div>`).join('')}</div>
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
    const st = $('#setAdStam'); if (st) st.onclick = () => {
      const r = E.useAd(p, 'AD03');
      if (!r.ok) return this.toast(r.msg, 'err');
      E.addStamina(p, 10); this.toast('体力 +10（今日剩余 ' + E.adLeft(p, 'AD03') + ' 次）', 'ok');
      this.open('set', '账号'); this.home();
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
    $('#btLevel').textContent = endless ? '无尽模式' : (d ? d.n : E.levelName(levelId));
    $('#btKill').textContent = '0';
    $('#btGold').textContent = '0';
    $('#btLv').textContent = '1';
    $('#btSkills').innerHTML = '';
  },
  btTick() {
    const r = BT.run; if (!r) return;
    /* 顶部关卡 / 波次 */
    const blv = $('#btLevel');
    if (blv) blv.textContent = r.endless ? ('无尽 ' + r.wave + ' 层') : (r.def.n || ('第 ' + r.wave + ' 波'));
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
    $('#btLv').textContent = r.lv;
    /* 顶部波次 */
    const bw = $('#btWave'); if (bw) bw.textContent = r.wave;
    const bwm = $('#btWaveMax'); if (bwm) bwm.textContent = r.waveTotal;
    /* 左上英雄立绘 + 战力 */
    const hi = $('#btHeroImg');
    if (hi && !hi.src) { const av = (E.char(this.P) || {}).img; if (av) hi.src = av; }
    const bpw = $('#btPower'); if (bpw) bpw.textContent = E.fmt(E.power(this.P));
    const bd = $('#btDia'); if (bd) bd.textContent = E.fmt(this.P.diamond || 0);
    /* 武器图标 */
    const gi = $('#btGunImg');
    if (gi && !gi.src) { const g = E.gun(this.P); if (g && g.img) gi.src = g.img; }
    /* 倍速按钮 */
    const sp = $('#btSpeed'); if (sp) sp.textContent = '×' + (BT.speed || 1);
    /* 防线血条 */
    const wb = $('#btWallBar'), wt = $('#btWallTxt');
    if (wb) {
      const wm = r.wallMax || r.maxHp, wv = r.wallHp != null ? r.wallHp : r.hp;
      wb.style.width = Math.max(0, wv / wm * 100) + '%';
      if (wt) wt.textContent = Math.ceil(Math.max(0, wv)) + '/' + Math.round(wm);
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
    $('#chCards').innerHTML = picks.map((s) => {
      const L = (BT.run.skills[s.id] || 0);
      const el = EX.elements.find((x) => x.k === s.el) || { c: '#ffd76a' };
      const kindTxt = s.kind === 'passive' ? '被动强化（自动生效）' : s.kind === 'summon' ? '召唤' : '主动释放';
      return `<button class="ccard" data-pick="${s.id}">
        <i style="background:${el.c}22">${s.img
          ? `<img src="${s.img}" style="width:38px;height:38px;border-radius:8px;object-fit:cover">`
          : s.icon}</i>
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
    $('#rsLevel').textContent = (BT.run && BT.run.def) ? BT.run.def.n : '';
    const mm = Math.floor((d.time || 0) / 60), ss = Math.floor((d.time || 0) % 60);
    $('#rsGrid').innerHTML = `
      <div class="rs-i"><div class="v">${d.kills}</div><div class="l">击杀僵尸</div></div>
      <div class="rs-i"><div class="v">${mm}:${String(ss).padStart(2, '0')}</div><div class="l">战斗时长</div></div>
      <div class="rs-i"><div class="v">${E.fmt(d.rw.gold)}</div><div class="l">获得金币</div></div>
      <div class="rs-i"><div class="v">${E.fmt(d.rw.diamond || 0)}</div><div class="l">获得钻石</div></div>`;
    $('#rsNext').style.display = win && !BT.run.endless ? '' : 'none';
    /* 广告：双倍奖励 / 复活 */
    const adBox = $('#rsAd');
    if (adBox) {
      if (win) adBox.innerHTML = `<button class="btn c blk" id="rsAd2x">📺 看广告双倍奖励（剩 ${E.adLeft(this.P, 'AD02')} 次）</button>`;
      else adBox.innerHTML = `<button class="btn c blk" id="rsAdRev">📺 看广告原地复活（剩 ${E.adLeft(this.P, 'AD01')} 次）</button>`;
      const b2 = $('#rsAd2x');
      if (b2) b2.onclick = () => {
        const r = E.useAd(this.P, 'AD02'); if (!r.ok) return this.toast(r.msg, 'err');
        this.P.gold += Math.floor((d.rw.gold || 0));
        this.toast('奖励翻倍！金币 +' + E.fmt(d.rw.gold), 'ok');
        b2.disabled = true; b2.textContent = '已领取双倍'; this.home(); MAIN.save();
      };
      const br = $('#rsAdRev');
      if (br) br.onclick = () => {
        const r = E.useAd(this.P, 'AD01'); if (!r.ok) return this.toast(r.msg, 'err');
        this.hideResult(); startBattle(battleMode, BT.run.def.id);
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
