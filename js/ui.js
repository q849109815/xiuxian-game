/* =========================================================
 * ui.js —— 界面渲染层
 * ========================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const UI = {
  P: null,            // 玩家存档
  curPanel: null,     // 当前面板 key
  curTab: {},         // 每个面板的当前 tab
  selEquip: null,     // 选中的装备部位
  selItem: -1,        // 选中的背包物品

  /* ---------------- 屏幕切换 ---------------- */
  show(id) {
    $$('.screen').forEach((s) => s.classList.remove('on'));
    const el = document.getElementById(id);
    if (el) el.classList.add('on');
  },

  toast(msg, cls) {
    const box = $('#toasts'); if (!box) return;
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || '');
    d.innerHTML = msg;
    box.appendChild(d);
    setTimeout(() => d.remove(), cls === 'boss' ? 2800 : 2100);
    while (box.children.length > 4 && box.firstElementChild) box.firstElementChild.remove();
  },

  /* ================= 主界面 ================= */
  home() {
    const p = this.P; if (!p) return;
    const avEl = $('#hmAvIco');
    if (p.avatarImg) {
      avEl.style.backgroundImage = 'url(' + p.avatarImg + ')';
      avEl.style.backgroundSize = 'cover';
      avEl.style.backgroundPosition = 'center top';
      avEl.style.width = '100%'; avEl.style.height = '100%';
      avEl.style.borderRadius = '50%';
      avEl.textContent = '';
    } else {
      avEl.textContent = p.avatar || '👨‍🚀';
    }
    $('#hmLv').textContent = 'Lv.' + (p.lv || 1);
    $('#hmName').textContent = p.name;
    $('#hmPower').textContent = E.fmt(E.power(p));
    $('#cuGold').textContent = E.fmt(p.gold);
    $('#cuDia').textContent = E.fmt(p.diamond);
    const lv = p.level || 1;
    $('#hmLevel').textContent = '第 ' + lv + ' 关';
    $('#hmLevelName').textContent = E.levelName(lv).split('· ')[1] || '';
    // 基地
    $('#hmBase').innerHTML = EX.base.map((b) => {
      let dot = '';
      if (b.id === 'lab' && Object.keys(p.techs || {}).length) dot = '<div class="dot"></div>';
      if (b.id === 'wall' && p.wallLv > 1) dot = '';
      return `<button class="bs" data-base="${b.id}">${dot}<i>${b.icon}</i><b>${b.n}</b><span>${b.desc}</span></button>`;
    }).join('');
    $$('#hmBase .bs').forEach((el) => {
      el.onclick = () => this.openBase(el.dataset.base);
    });
  },

  openBase(id) {
    if (id === 'lab') return this.open('tech');
    if (id === 'wall') return this.open('wall');
    if (id === 'tavern') return this.open('merc');
    if (id === 'canteen') return this.open('canteen');
    if (id === 'rank') return this.open('rank');
    if (id === 'fort') return this.open('fort');
  },

  /* ================= 面板 ================= */
  PANELS: {
    role: ['角色', ['装备', '属性', '背包']],
    gun: ['枪械', ['强化', '更换']],
    bag: ['背包', ['全部', '装备', '宝石']],
    merc: ['佣兵', ['招募', '出战']],
    shop: ['商城', ['礼包', '兑换']],
    set: ['设置', ['账号', '网络']],
    tech: ['研究所', ['科技']],
    wall: ['防线', ['强化']],
    canteen: ['食堂', ['补给']],
    rank: ['排行榜', ['全服']],
    fort: ['远征堡垒', ['远征']],
    gem: ['宝石镶嵌', ['镶嵌']],
  },

  open(key, tab) {
    this.curPanel = key;
    const def = this.PANELS[key];
    if (!def) return;
    if (tab) this.curTab[key] = tab;
    if (!this.curTab[key]) this.curTab[key] = def[1][0];
    $('#pnTitle').textContent = def[0];
    $('#pnTabs').innerHTML = def[1].map((t) =>
      `<button class="pt ${t === this.curTab[key] ? 'on' : ''}" data-t="${t}">${t}</button>`).join('');
    $$('#pnTabs .pt').forEach((b) => {
      b.onclick = () => { this.curTab[key] = b.dataset.t; this.open(key); };
    });
    $('#pnBody').innerHTML = this.render(key, this.curTab[key]);
    $('#panel').classList.add('on');
    this.bind(key, this.curTab[key]);
  },
  close() { $('#panel').classList.remove('on'); this.curPanel = null; },

  render(key, tab) {
    const p = this.P; if (!p) return '<div class="empty">无数据</div>';
    const f = this['r_' + key];
    return f ? f.call(this, p, tab) : '<div class="empty">待开发</div>';
  },

  bind(key, tab) {
    const p = this.P; if (!p) return;
    const f = this['b_' + key];
    if (f) f.call(this, p, tab);
  },

  /* ---------- 角色/装备 ---------- */
  r_role(p, tab) {
    if (tab === '装备') {
      const g = EX.slots.map((s) => {
        const it = p.equip[s.k];
        const qc = it ? E.qColor(it.q) : '#555';
        return `<div class="eq ${this.selEquip === s.k ? 'on' : ''}" data-eq="${s.k}"
            style="border-color:${it ? qc : 'rgba(120,150,190,.22)'}">
          ${it ? `<div class="q" style="background:${qc}33;color:${qc}">${it.q}</div>` : ''}
          ${it && it.lv ? `<div class="f">+${it.lv}</div>` : ''}
          ${p.gems[s.k] ? `<div class="gem">💎</div>` : ''}
          <i>${s.icon}</i><b>${s.n}</b>
        </div>`;
      }).join('');
      let detail = '<div class="lbl">选择装备部位查看详情与操作</div>';
      if (this.selEquip && p.equip[this.selEquip]) {
        const it = p.equip[this.selEquip];
        const qc = E.qColor(it.q);
        const gem = p.gems[this.selEquip];
        const gdef = gem ? EX.gems.find((x) => x.id === gem) : null;
        detail = `
        <div class="card">
          <div class="card-t"><span style="color:${qc}">${it.q}品 · ${EX.slots.find(s=>s.k===this.selEquip).n}</span><span class="sub">+${it.lv}</span></div>
          <div class="kv"><span>攻击</span><b>+${it.atk}</b></div>
          <div class="kv"><span>防御</span><b>+${it.def}</b></div>
          <div class="kv"><span>生命</span><b>+${it.hp}</b></div>
          ${(it.subs||[]).map((s)=>`<div class="kv"><span>词条·${s.n}</span><b style="color:var(--green)">+${(s.v*100).toFixed(1)}%</b></div>`).join('')}
          <div class="kv"><span>宝石</span><b>${gdef?gdef.n:'未镶嵌'}</b></div>
          <div class="row" style="margin-top:8px">
            <button class="btn c sm" id="eqForge">锻造 ${E.fmt(E.forgeCost(it))}</button>
            <button class="btn sm" id="eqUp">升品</button>
            <button class="btn sm" id="eqRr">洗炼</button>
          </div>
          <div class="row" style="margin-top:6px">
            <button class="btn sm" id="eqGem">镶宝石</button>
            <button class="btn d sm" id="eqOff">卸下</button>
          </div>
        </div>`;
      }
      return `<div class="eqgrid">${g}</div>${detail}
      <div class="card">
        <div class="card-t">战力与属性</div>
        <div class="kv"><span>战力</span><b style="color:var(--gold)">${E.fmt(E.power(p))}</b></div>
        <div class="kv"><span>通关进度</span><b>第 ${p.level||1} 关</b></div>
        <div class="kv"><span>无尽最佳</span><b>第 ${p.endlessBest||0} 层</b></div>
        <div class="kv"><span>累计击杀</span><b>${E.fmt(p.stats?.kills||0)}</b></div>
      </div>`;
    }
    if (tab === '属性') {
      const a = E.attrs(p);
      return `<div class="card">
        <div class="card-t">战斗属性</div>
        <div class="kv"><span>攻击力</span><b style="color:var(--gold)">${E.fmt(a.atk)}</b></div>
        <div class="kv"><span>　基础(枪械)</span><b>${E.fmt(a.base)}</b></div>
        <div class="kv"><span>　总倍率</span><b style="color:var(--green)">×${a.mult.toFixed(2)}</b></div>
        <div class="kv"><span>射程</span><b>${Math.round(a.range)}</b></div>
        <div class="kv"><span>射速</span><b>${a.rate.toFixed(2)} /秒</b></div>
        <div class="kv"><span>穿透</span><b>${a.pierce}</b></div>
        <div class="kv"><span>齐射</span><b>${a.spread}</b></div>
        <div class="kv"><span>暴击率</span><b>${(a.crit*100).toFixed(1)}%</b></div>
        <div class="kv"><span>暴击伤害</span><b>${(a.critDmg*100).toFixed(0)}%</b></div>
        <div class="kv"><span>冷却缩减</span><b>${(a.cdr*100).toFixed(1)}%</b></div>
        <div class="kv"><span>防线生命</span><b>${E.fmt(a.wallHp)}</b></div>
        <div class="kv"><span>金币加成</span><b>${((a.goldMul-1)*100).toFixed(0)}%</b></div>
      </div>
      <div class="card">
        <div class="card-t">养成来源</div>
        <div class="lbl">攻击 = 枪械基础 × 总倍率 + 装备固定值<br>
        倍率来源：装备品质/锻造、副词条、科技、佣兵出战<br>
        枪械强化是攻击成长的主要来源，每关通关后优先强化。</div>
      </div>`;
    }
    // 背包
    return this.r_bag(p, '全部');
  },
  b_role(p, tab) {
    $$('#pnBody .eq').forEach((el) => {
      el.onclick = () => { this.selEquip = el.dataset.eq; this.open('role', tab); };
    });
    const of = $('#eqOff'); if (of) of.onclick = () => {
      const k = this.selEquip; if (!k || !p.equip[k]) return;
      p.bag.push(p.equip[k]); p.equip[k] = null; delete p.gems[k];
      this.toast('已卸下', 'ok'); this.selEquip = null; this.open('role', tab); this.home();
    };
    const fo = $('#eqForge'); if (fo) fo.onclick = () => {
      const r = E.forge(p, this.selEquip); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { this.open('role', tab); this.home(); }
    };
    const up = $('#eqUp'); if (up) up.onclick = () => {
      const r = E.upQuality(p, this.selEquip); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { this.open('role', tab); this.home(); }
    };
    const rr = $('#eqRr'); if (rr) rr.onclick = () => {
      const r = E.reroll(p, this.selEquip); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { this.open('role', tab); }
    };
    const gm = $('#eqGem'); if (gm) gm.onclick = () => { this.selEquip && this.open('gem'); };
  },

  /* ---------- 宝石 ---------- */
  r_gem(p) {
    const slot = this.selEquip || 'head';
    const it = p.equip[slot];
    return `<div class="card">
      <div class="card-t">镶嵌部位</div>
      <div class="kv"><span>当前</span><b>${EX.slots.find(s=>s.k===slot).n}</b></div>
      <div class="kv"><span>品质要求</span><b>${it && E.qi(it.q)>=2 ? '✔ 可镶嵌' : '✘ 需蓝色以上'}</b></div>
    </div>
    <div class="card">
      <div class="card-t">选择宝石</div>
      ${EX.gems.map((g)=>`<div class="item">
        <div class="ic" style="font-size:16px">💎</div>
        <div class="info"><div class="nm">${g.n}</div><div class="sub">${g.desc}</div></div>
        <div class="act"><button class="btn c sm" data-gem="${g.id}">镶嵌</button></div>
      </div>`).join('')}
    </div>`;
  },
  b_gem(p) {
    $$('#pnBody [data-gem]').forEach((b) => {
      b.onclick = () => {
        const r = E.socketGem(p, this.selEquip, b.dataset.gem);
        this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.close(); this.open('role', '装备'); this.home(); }
      };
    });
  },

  /* ---------- 背包 ---------- */
  r_bag(p, tab) {
    let list = p.bag || [];
    if (tab === '装备') list = list.filter((x) => x.slot);
    if (tab === '宝石') list = [];
    if (!list.length) return '<div class="empty"><span class="ic">🎒</span>背包空空如也<br><span style="font-size:10px">通关可掉落装备</span></div>';
    return list.map((it, i) => {
      const qc = E.qColor(it.q);
      const sn = it.slot ? (EX.slots.find(s=>s.k===it.slot)||{}).n : '道具';
      return `<div class="item">
        <div class="ic" style="border:1.5px solid ${qc}">${it.slot?(EX.slots.find(s=>s.k===it.slot)||{}).icon:'📦'}</div>
        <div class="info">
          <div class="nm"><span style="color:${qc}">${it.q}</span> ${sn} ${it.lv?'+'+it.lv:''}</div>
          <div class="sub">攻+${it.atk} 防+${it.def} 血+${it.hp}</div>
        </div>
        <div class="act">
          ${it.slot?`<button class="btn c sm" data-wear="${i}">装备</button>`:''}
          <button class="btn d sm" data-dec="${i}">分解</button>
        </div>
      </div>`;
    }).join('');
  },
  b_bag(p) {
    $$('#pnBody [data-wear]').forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.wear, it = p.bag[i]; if (!it || !it.slot) return;
        const old = p.equip[it.slot];
        p.equip[it.slot] = it; p.bag.splice(i, 1);
        if (old) p.bag.push(old);
        this.toast('装备成功', 'ok'); this.open('bag', this.curTab.bag); this.home();
      };
    });
    $$('#pnBody [data-dec]').forEach((b) => {
      b.onclick = () => {
        const r = E.decompose(p, +b.dataset.dec); this.toast(r.msg, r.ok ? 'ok' : 'err');
        if (r.ok) { this.open('bag', this.curTab.bag); this.home(); }
      };
    });
  },

  /* ---------- 枪械 ---------- */
  r_gun(p, tab) {
    if (tab === '更换') {
      return `<div class="card">
        <div class="card-t">枪械库</div>
        ${EX.guns.map((g)=>{
          const has = p.gun === g.id;
          const qc = E.qColor(g.q);
          return `<div class="item">
            <div class="ic" style="border:1.5px solid ${qc}">${g.icon}</div>
            <div class="info">
              <div class="nm"><span style="color:${qc}">${g.q}</span> ${g.n}</div>
              <div class="sub">伤害${g.dmg} 射速${g.rate}/s 射程${g.range} 穿透${g.pierce}</div>
            </div>
            <div class="act">${has?'<span class="tag g">使用中</span>':`<button class="btn c sm" data-gun="${g.id}">切换</button>`}</div>
          </div>`;}).join('')}
      </div>`;
    }
    const g = E.gun(p), a = E.attrs(p), cost = E.gunUpgradeCost(p);
    return `<div class="card">
      <div class="card-t">当前枪械 <span class="sub">Lv.${p.gunLv}</span></div>
      <div class="item" style="border:none;background:none;padding:0;margin-bottom:8px">
        <div class="ic" style="font-size:24px">${g.icon}</div>
        <div class="info"><div class="nm">${g.n}</div><div class="sub">基础伤害 ${g.dmg} → 当前 ${E.fmt(a.base)}</div></div>
      </div>
      <div class="kv"><span>枪械伤害</span><b style="color:var(--gold)">${E.fmt(a.base)}</b></div>
      <div class="kv"><span>射速</span><b>${a.rate.toFixed(2)}/秒</b></div>
      <div class="kv"><span>射程</span><b>${Math.round(a.range)}</b></div>
      <div class="kv"><span>穿透</span><b>${a.pierce}</b></div>
      <div class="bar"><i style="width:${Math.min(100,(p.gunLv%10)*10)}%"></i></div>
      <button class="btn c blk" id="gunUp" ${p.gold<cost?'disabled':''}>强化 · ${E.fmt(cost)} 金币</button>
      <div class="lbl">枪械强化是攻击力成长的核心来源，每级约 +20%。</div>
    </div>`;
  },
  b_gun(p, tab) {
    const u = $('#gunUp'); if (u) u.onclick = () => {
      const r = E.upgradeGun(p); this.toast(r.msg, r.ok ? 'ok' : 'err');
      if (r.ok) { this.open('gun', tab); this.home(); }
    };
    $$('#pnBody [data-gun]').forEach((b) => {
      b.onclick = () => { p.gun = b.dataset.gun; this.toast('已切换枪械', 'ok'); this.open('gun', '更换'); this.home(); };
    });
  },

  /* ---------- 佣兵 ---------- */
  r_merc(p, tab) {
    if (tab === '出战') {
      const owned = p.mercs || [];
      if (!owned.length) return '<div class="empty"><span class="ic">👥</span>尚未招募佣兵</div>';
      return owned.map((m) => {
        const d = EX.mercs.find((x) => x.id === m.id); if (!d) return '';
        return `<div class="item">
          <div class="ic" style="border:1.5px solid ${E.qColor(d.q)}">${d.icon}</div>
          <div class="info">
            <div class="nm"><span style="color:${E.qColor(d.q)}">${d.q}</span> ${d.n} <span class="tag y">Lv.${m.lv}</span></div>
            <div class="sub">${d.desc} · 攻${Math.round(d.atk*(1+(m.lv-1)*0.16))}</div>
          </div>
          <div class="act">
            <button class="btn ${m.out?'':'c'} sm" data-out="${m.id}">${m.out?'休整':'出战'}</button>
            <button class="btn sm" data-upm="${m.id}">升级</button>
          </div>
        </div>`;
      }).join('') + '<div class="lbl">同时最多 2 名佣兵出战（当前 ' + owned.filter(m=>m.out).length + ' 名），出战佣兵按百分比提升战力。</div>';
    }
    return `<div class="card">
      <div class="card-t">酒馆 · 招募</div>
      ${EX.mercs.map((m)=>{
        const own = (p.mercs||[]).some(x=>x.id===m.id);
        const c = E.recruitCost(m.id);
        return `<div class="item">
          <div class="ic" style="border:1.5px solid ${E.qColor(m.q)}">${m.icon}</div>
          <div class="info">
            <div class="nm"><span style="color:${E.qColor(m.q)}">${m.q}</span> ${m.n}</div>
            <div class="sub">${m.desc}</div>
          </div>
          <div class="act">${own?'<span class="tag g">已拥有</span>':
            `<button class="btn c sm" data-rec="${m.id}">${E.fmt(c.gold)}🪙${c.diamond?' +'+c.diamond+'💎':''}</button>`}</div>
        </div>`;}).join('')}
    </div>
    <div class="lbl">佣兵不可操作，会自动攻击敌人。工程师可修复防线，超时空可秒杀精英。</div>`;
  },
  b_merc(p, tab) {
    $$('#pnBody [data-rec]').forEach((b) => {
      b.onclick = () => { const r = E.recruit(p, b.dataset.rec); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('merc', tab); this.home(); } };
    });
    $$('#pnBody [data-out]').forEach((b) => {
      b.onclick = () => {
        const m = p.mercs.find(x => x.id === b.dataset.out); if (!m) return;
        if (!m.out && p.mercs.filter(x=>x.out).length >= 2) return this.toast('最多 2 名出战', 'err');
        m.out = !m.out; this.open('merc', '出战'); this.home();
      };
    });
    $$('#pnBody [data-upm]').forEach((b) => {
      b.onclick = () => { const r = E.upMerc(p, b.dataset.upm); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('merc', '出战'); this.home(); } };
    });
  },

  /* ---------- 研究所 ---------- */
  r_tech(p) {
    return `<div class="card">
      <div class="card-t">科技研发 <span class="sub">永久提升属性</span></div>
      ${EX.techs.map((t)=>{
        const cur = p.techs[t.id]||0;
        const c = E.techCost(t.id,cur);
        const full = cur>=t.max;
        return `<div class="item">
          <div class="ic">${t.icon}</div>
          <div class="info">
            <div class="nm">${t.n} <span class="tag y">Lv.${cur}/${t.max}</span></div>
            <div class="sub">${t.desc}</div>
            <div class="bar"><i style="width:${cur/t.max*100}%"></i></div>
          </div>
          <div class="act">${full?'<span class="tag g">已满</span>':
            `<button class="btn ${p.gold>=c?'c':''} sm" data-tech="${t.id}" ${p.gold<c?'disabled':''}>${E.fmt(c)}</button>`}</div>
        </div>`;}).join('')}
    </div>`;
  },
  b_tech(p) {
    $$('#pnBody [data-tech]').forEach((b) => {
      b.onclick = () => { const r = E.upTech(p, b.dataset.tech); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('tech'); this.home(); } };
    });
  },

  /* ---------- 防线 ---------- */
  r_wall(p) {
    const a = E.attrs(p), c = E.wallCost(p);
    return `<div class="card">
      <div class="card-t">城墙 <span class="sub">Lv.${p.wallLv}</span></div>
      <div class="kv"><span>防线生命</span><b style="color:var(--green)">${E.fmt(a.wallHp)}</b></div>
      <div class="kv"><span>强化消耗</span><b>${E.fmt(c)} 金币</b></div>
      <button class="btn c blk" id="wallUp" ${p.gold<c?'disabled':''}>强化防线</button>
      <div class="lbl">防线生命归零即战斗失败。升级城墙可大幅提升容错。</div>
    </div>
    <div class="card">
      <div class="card-t">防线说明</div>
      <div class="lbl">僵尸会持续冲击防线造成伤害。<br>
      击杀敌人可回收少量生命（需「杀怪加血」词条/宝石）。<br>
      局内升级选择「防线强化」也可临时提升。</div>
    </div>`;
  },
  b_wall(p) {
    const b = $('#wallUp'); if (b) b.onclick = () => {
      const r = E.upWall(p); this.toast(r.msg, r.ok ? 'ok' : 'err'); if (r.ok) { this.open('wall'); this.home(); }
    };
  },

  /* ---------- 食堂 ---------- */
  r_canteen(p) {
    const last = p.lastMeal || 0;
    const can = Date.now() - last > 3600000;
    return `<div class="card">
      <div class="card-t">每日补给</div>
      <div class="kv"><span>体力补给</span><b>${can?'可领取':'已领取'}</b></div>
      <div class="kv"><span>奖励</span><b>🪙 2000 · 💎 20</b></div>
      <button class="btn c blk" id="mealBtn" ${can?'':'disabled'}>${can?'领取补给':'冷却中（1小时）'}</button>
    </div>
    <div class="card">
      <div class="card-t">签到</div>
      <div class="lbl">每日首次登录自动发放签到奖励。</div>
    </div>`;
  },
  b_canteen(p) {
    const b = $('#mealBtn'); if (b) b.onclick = () => {
      p.gold += 2000; p.diamond += 20; p.lastMeal = Date.now();
      this.toast('领取成功：金币+2000 钻石+20', 'ok'); this.open('canteen'); this.home();
    };
  },

  /* ---------- 排行榜 ---------- */
  r_rank(p) {
    const lb = (window.LB || []);
    if (!lb.length) return '<div class="empty"><span class="ic">🏆</span>暂无排行数据<br><span style="font-size:10px">通关后将自动上传</span></div>';
    return lb.map((x, i) => `<div class="item">
      <div class="ic" style="font-size:15px;background:${i<3?'linear-gradient(135deg,#ffe9a8,#f0a020)':'rgba(10,16,28,.7)'};color:${i<3?'#2a1a00':'#fff'}">${i+1}</div>
      <div class="info"><div class="nm">${x.n}</div><div class="sub">第 ${x.lv} 关 · 战力 ${E.fmt(x.pw)}</div></div>
      <div class="act"><span class="tag y">${E.fmt(x.pw)}</span></div>
    </div>`).join('');
  },

  /* ---------- 远征 ---------- */
  r_fort(p) {
    return `<div class="card">
      <div class="card-t">派遣远征</div>
      <div class="lbl">派遣佣兵外出搜集资源，离线也可获得收益。</div>
      <div class="kv"><span>可派遣佣兵</span><b>${(p.mercs||[]).length} 名</b></div>
      <button class="btn c blk" id="fortGo">开始远征（2小时）</button>
      <div class="kv" style="margin-top:8px"><span>远征收益</span><b>🪙 金币 · 装备</b></div>
    </div>`;
  },
  b_fort(p) {
    const b = $('#fortGo'); if (b) b.onclick = () => {
      if (!(p.mercs || []).length) return this.toast('需先招募佣兵', 'err');
      p.fortEnd = Date.now() + 7200000;
      this.toast('远征开始，2小时后可收取', 'ok');
    };
  },

  /* ---------- 商城 ---------- */
  r_shop(p, tab) {
    if (tab === '兑换') {
      return `<div class="card">
        <div class="card-t">兑换码</div>
        <input id="codeInp" placeholder="输入兑换码" style="width:100%;padding:10px;border-radius:9px;
          background:rgba(10,16,28,.85);border:1px solid var(--line);color:var(--txt);font-size:13px;outline:none">
        <button class="btn c blk" id="codeBtn">兑 换</button>
        <div class="lbl">可用兑换码：VIP666、VIP888、SVIP999、xjskp888、dz789</div>
      </div>`;
    }
    const packs = [
      { n: '新手礼包', i: '🎁', d: '金币 ×5000 + 钻石 ×50', g: 5000, dm: 50, p: 0 },
      { n: '成长基金', i: '💰', d: '金币 ×30000 + 钻石 ×200', g: 30000, dm: 200, p: 30 },
      { n: '至尊礼包', i: '👑', d: '金币 ×150000 + 钻石 ×800', g: 150000, dm: 800, p: 128 },
    ];
    return `<div class="card">
      <div class="card-t">礼包商城</div>
      ${packs.map((k, i) => `<div class="item">
        <div class="ic">${k.i}</div>
        <div class="info"><div class="nm">${k.n}</div><div class="sub">${k.d}</div></div>
        <div class="act"><button class="btn c sm" data-pack="${i}">${k.p ? '💎'+k.p : '免费'}</button></div>
      </div>`).join('')}
    </div>
    <div class="card">
      <div class="card-t">资源说明</div>
      <div class="lbl">金币：强化枪械、锻造装备、升级科技、建造炮台<br>
      钻石：招募高级佣兵、购买礼包</div>
    </div>`;
  },
  b_shop(p, tab) {
    $$('#pnBody [data-pack]').forEach((b) => {
      b.onclick = () => {
        const packs = [{ g: 5000, dm: 50, p: 0 }, { g: 30000, dm: 200, p: 30 }, { g: 150000, dm: 800, p: 128 }];
        const k = packs[+b.dataset.pack];
        if (k.p > p.diamond) return this.toast('钻石不足', 'err');
        p.diamond -= k.p; p.gold += k.g; p.diamond += k.dm;
        this.toast('购买成功：金币+' + E.fmt(k.g) + ' 钻石+' + k.dm, 'ok');
        this.open('shop', tab); this.home();
      };
    });
    const cb = $('#codeBtn');
    if (cb) cb.onclick = () => {
      const v = ($('#codeInp').value || '').trim().toUpperCase();
      const codes = { VIP666: [8000, 60], VIP888: [15000, 100], SVIP999: [30000, 200], XJSKP888: [20000, 150], DZ789: [50000, 300] };
      if (!codes[v]) return this.toast('兑换码无效', 'err');
      if ((p.usedCodes || []).indexOf(v) >= 0) return this.toast('该码已使用', 'err');
      p.usedCodes = p.usedCodes || []; p.usedCodes.push(v);
      p.gold += codes[v][0]; p.diamond += codes[v][1];
      this.toast('兑换成功：金币+' + E.fmt(codes[v][0]) + ' 钻石+' + codes[v][1], 'ok');
      this.open('shop', '兑换'); this.home();
    };
  },

  /* ---------- 设置 ---------- */
  r_set(p, tab) {
    if (tab === '网络') {
      return `<div class="card">
        <div class="card-t">网络状态</div>
        <div class="kv"><span>状态</span><b style="color:${Net.online?'var(--green)':'#ff8fa4'}">${Net.online?'● 已连接':'○ 离线'}</b></div>
        <div class="kv"><span>端点</span><b style="font-size:10px">${Net.endpoint.replace('https://','')}</b></div>
        <div class="kv"><span>待上传</span><b>${Net.queueLen}</b></div>
        <button class="btn blk" id="setReNet">重新检测</button>
        <button class="btn blk" id="setDiag">逐端点诊断</button>
        <div id="diagBox"><div class="lbl">点「逐端点诊断」测试全部通道</div></div>
      </div>
      <div class="card">
        <div class="card-t">自定义加速地址</div>
        <textarea id="setEps" rows="2" placeholder="https://xxx.workers.dev"
          style="width:100%;padding:8px;border-radius:8px;background:rgba(10,16,28,.85);
          border:1px solid var(--line);color:var(--txt);font-size:11px;outline:none">${(GH.extra||[]).join('\n')}</textarea>
        <button class="btn c blk" id="setSaveEps">保存加速地址</button>
        <div class="lbl">部署 Cloudflare Worker 后填入，可解决国内连不上 GitHub 的问题。Worker 代码在仓库 worker/src/index.js</div>
      </div>`;
    }
    return `<div class="card">
      <div class="card-t">账号信息</div>
      <div class="kv"><span>代号</span><b>${p.name}</b></div>
      <div class="kv"><span>UID</span><b style="font-size:10px">${p.uid}</b></div>
      <div class="kv"><span>等级</span><b>Lv.${p.lv}</b></div>
      <div class="kv"><span>创建时间</span><b style="font-size:10px">${new Date(p.created||Date.now()).toLocaleString()}</b></div>
      <div class="kv"><span>累计击杀</span><b>${E.fmt(p.stats?.kills||0)}</b></div>
      <div class="kv"><span>累计场次</span><b>${p.stats?.runs||0}</b></div>
      <div class="kv"><span>BOSS 击杀</span><b>${p.stats?.boss||0}</b></div>
    </div>
    <div class="card">
      <div class="card-t">改名</div>
      <input id="setName" maxlength="8" value="${p.name}" style="width:100%;padding:10px;border-radius:9px;
        background:rgba(10,16,28,.85);border:1px solid var(--line);color:var(--txt);font-size:13px;outline:none">
      <button class="btn c blk" id="setSaveName">保存（首次免费）</button>
    </div>
    <div class="card">
      <div class="card-t">数据</div>
      <button class="btn blk" id="setSave">立即保存存档</button>
      <button class="btn d blk" id="setReset">重置存档（清空全部进度）</button>
      <div class="lbl">存档保存于云端 GitHub 仓库，换设备登录同一代号即可继续。</div>
    </div>
    <div class="card">
      <div class="card-t">后台管理</div>
      <button class="btn blk" id="setAdmin">进入管理后台</button>
    </div>`;
  },
  b_set(p, tab) {
    const sn = $('#setSaveName'); if (sn) sn.onclick = () => {
      const v = ($('#setName').value || '').trim();
      if (v.length < 2) return this.toast('代号至少 2 个字', 'err');
      if (!p.renamed) { p.name = v; p.renamed = 1; this.toast('改名成功', 'ok'); }
      else if (p.diamond >= 100) { p.diamond -= 100; p.name = v; this.toast('改名成功（消耗100钻石）', 'ok'); }
      else return this.toast('改名需 100 钻石', 'err');
      this.open('set', '账号'); this.home();
    };
    const sv = $('#setSave'); if (sv) sv.onclick = async () => {
      await MAIN.save(); this.toast('存档已上传', 'ok');
    };
    const rs = $('#setReset'); if (rs) rs.onclick = () => {
      if (!confirm('确定清空全部进度？此操作不可恢复！')) return;
      localStorage.removeItem('zb_uid');
      location.reload();
    };
    const ad = $('#setAdmin'); if (ad) ad.onclick = () => { location.href = 'admin/'; };
    const rn = $('#setReNet'); if (rn) rn.onclick = async () => {
      this.toast('检测中…'); await Net.reset(); this.open('set', '网络');
    };
    const dg = $('#setDiag'); if (dg) dg.onclick = async () => {
      const box = $('#diagBox'); box.innerHTML = '<div class="lbl">测试中…</div>';
      const list = await Net.diagnose();
      const ok = list.filter(x => x.ok).length;
      box.innerHTML = `<div class="lbl" style="margin-bottom:5px">${ok}/${list.length} 个通道可用</div>` +
        list.map(x => `<div class="kv"><span style="font-size:9px;word-break:break-all">${x.ep.replace('https://','')}</span>
          <b style="font-size:9px;color:${x.ok?'var(--green)':'#ff8fa4'}">${x.ok?'✔':'✘'} ${x.st}</b></div>`).join('');
      await Net.reset(); this.open('set', '网络');
    };
    const se = $('#setSaveEps'); if (se) se.onclick = () => {
      const v = ($('#setEps').value || '').split('\n').map(x => x.trim()).filter(Boolean);
      GH.extra = v; try { localStorage.setItem('zb_extra', JSON.stringify(v)); } catch (e) {}
      alert('已保存 ' + v.length + ' 个加速地址'); Net.reset();
    };
  },

  /* ================= 战斗 HUD ================= */
  btInit(p, levelNo, endless) {
    $('#btLevel').textContent = endless ? ('无尽 第 ' + levelNo + ' 层') : ('第 ' + levelNo + ' 关');
    $('#btGold').textContent = '0';
    $('#btKill').textContent = '0';
    this.btRenderSkills();
    this.btRenderBuild();
  },
  btRenderSkills() {
    const r = BT.run; if (!r) return;
    const box = $('#btSkill');
    box.innerHTML = r.actives.map((id) => {
      const s = EX.skills.find((x) => x.id === id); if (!s) return '';
      const cd = r.cds[id] || 0;
      const ready = cd <= 0 && r.energy >= s.cost;
      return `<button class="sk ${ready ? 'ready' : ''}" data-sk="${id}">
        <i>${s.icon}</i>
        <div class="lv">${r.skills[id] || 1}</div>
        <div class="cost">${s.cost}</div>
        ${cd > 0 ? `<div class="cd">${Math.ceil(cd)}</div>` : ''}
      </button>`;
    }).join('');
    $$('#btSkill .sk').forEach((b) => {
      b.onclick = () => BT.cast(b.dataset.sk);
    });
  },
  btRenderBuild() {
    const r = BT.run; if (!r) return;
    $('#btBuild').innerHTML = BT.TURRET_TYPES.map((t, i) =>
      `<button class="bb" data-tur="${i}"><i>${t.icon}</i><b>${t.cost}</b></button>`).join('');
    $$('#btBuild .bb').forEach((b) => {
      b.onclick = () => {
        const idx = r.turretSlots.findIndex((s) => !s.t);
        if (idx < 0) return this.toast('炮台位已满', 'err');
        const res = BT.buildTurret(idx, +b.dataset.tur);
        this.toast(res.msg, res.ok ? 'ok' : 'err');
        if (res.ok) this.btRenderBuild();
      };
    });
  },
  btTick() {
    const r = BT.run; if (!r) return;
    $('#btWave').textContent = '第 ' + r.wave + ' / ' + r.waveTotal + ' 波';
    const s = Math.floor(r.time);
    $('#btTime').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    $('#btLv').textContent = r.lv;
    $('#btXpBar').style.width = Math.min(100, r.xp / r.xpNeed * 100) + '%';
    $('#btGold').textContent = E.fmt(r.gold);
    $('#btKill').textContent = r.kills;
    $('#btEnergy').style.height = (r.energy / r.energyMax * 100) + '%';
    this.btRenderSkills();
  },

  /* ---------- 技能三选一 ---------- */
  showSkillChoice(picks) {
    $('#chCards').innerHTML = picks.map((s) => {
      const L = (BT.run.skills[s.id] || 0);
      const el = EX.elements.find((x) => x.k === s.el) || { c: '#ffd76a' };
      const kindTxt = s.kind === 'active' ? '主动技能' : s.kind === 'gun' ? '枪械强化' : '被动强化';
      return `<button class="ccard" data-pick="${s.id}">
        <i style="background:${el.c}22">${s.icon}</i>
        <div class="ci">
          <div class="cn"><span style="color:${el.c}">${s.n}</span>
            <span class="tag" style="background:${el.c}22;color:${el.c}">${s.el||'物'}</span>
            ${L ? `<span class="tag y">Lv.${L}→${L+1}</span>` : '<span class="tag g">NEW</span>'}</div>
          <div class="cd2">${s.desc}</div>
          <div class="cl">${kindTxt}${s.kind==='active'?` · 耗能${s.cost} · CD${s.cd}s`:''}</div>
        </div>
      </button>`;
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
    $('#rsLevel').textContent = BT.run.endless ? ('无尽 第 ' + BT.run.levelNo + ' 层')
      : (E.levelName(BT.run.levelNo));
    const mm = Math.floor((d.time || 0) / 60), ss = Math.floor((d.time || 0) % 60);
    $('#rsGrid').innerHTML = `
      <div class="rs-i"><div class="v">${d.kills}</div><div class="l">击杀僵尸</div></div>
      <div class="rs-i"><div class="v">${mm}:${String(ss).padStart(2,'0')}</div><div class="l">战斗时长</div></div>
      <div class="rs-i"><div class="v">${E.fmt(d.rw.gold)}</div><div class="l">获得金币</div></div>
      <div class="rs-i"><div class="v">${d.rw.diamond}</div><div class="l">获得钻石</div></div>`;
    $('#rsNext').style.display = win ? '' : 'none';
    $('#result').classList.add('on');
  },
  hideResult() { $('#result').classList.remove('on'); },
};

window.UI = UI;
