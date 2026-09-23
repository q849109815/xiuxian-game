/* =========================================================
 * admin.js —— 《向僵尸开炮》管理后台
 * ========================================================= */

const PWD = 'fj19941224';
const AKEY = 'zb_admin_ok';
const D = (s) => document.querySelector(s);
const DA = (s) => Array.from(document.querySelectorAll(s));
const $$ = DA;

let PLIST = [], PG = 'dash', SEL = null;

const A = {
  toast(m, c) {
    const b = D('#toasts'); if (!b) return;
    const d = document.createElement('div');
    d.className = 'toast ' + (c || ''); d.innerHTML = m; b.appendChild(d);
    setTimeout(() => d.remove(), 2200);
    while (b.children.length > 4 && b.firstElementChild) b.firstElementChild.remove();
  },

  async init() {
    if (sessionStorage.getItem(AKEY) === '1') { this.enter(); return; }
    D('#gtBtn').onclick = () => {
      if ((D('#gtPwd').value || '') !== PWD) { D('#gtErr').textContent = '口令错误'; return; }
      sessionStorage.setItem(AKEY, '1'); this.enter();
    };
    D('#gtPwd').onkeydown = (e) => { if (e.key === 'Enter') D('#gtBtn').click(); };
  },

  async enter() {
    D('#gate').classList.remove('on'); D('#wrap').classList.add('on');
    await CFG.load(); await Net.init().catch(() => {});
    this.net(); this.nav(); await this.loadPlayers(); this.render();
  },
  net() {
    const n = D('#hdNet');
    if (n) { n.textContent = Net.online ? '●' : '○'; n.classList.toggle('off', !Net.online); }
  },
  nav() {
    $$('.nv').forEach((b) => {
      b.onclick = () => {
        PG = b.dataset.pg;
        $$('.nv').forEach((x) => x.classList.remove('on')); b.classList.add('on');
        D('#nav').classList.remove('on'); D('#mask').classList.remove('on'); this.render();
      };
    });
    const m = D('#hdMenu'); if (m) m.onclick = () => { D('#nav').classList.toggle('on'); D('#mask').classList.toggle('on'); };
    const mk = D('#mask'); if (mk) mk.onclick = () => { D('#nav').classList.remove('on'); D('#mask').classList.remove('on'); };
  },
  async loadPlayers() {
    let names = [];
    try { names = await Net.list('data/zb/players'); } catch (e) {}
    PLIST = [];
    for (const f of (names || []).filter((x) => x.endsWith('.json')).slice(0, 80)) {
      try { const r = await Net.read('data/zb/players/' + f); if (r && r.data) PLIST.push(r.data); } catch (e) {}
    }
    PLIST.sort((a, b) => (b.level || 0) - (a.level || 0) || E.power(b) - E.power(a));
  },
  render() {
    const f = PAGES[PG];
    D('#body').innerHTML = f ? f.call(this) : '<div class="empty">页面不存在</div>';
    this.bind();
  },
  save(uid, p) { return Net.write('data/zb/players/' + uid + '.json', p, 'admin: 修改玩家 ' + (p.name || uid)); },
  bind() { const B = BINDS[PG]; if (B) B.call(this); },
};

/* ============================================================
 * 页面
 * ========================================================== */
const PAGES = {

  dash() {
    if (!PLIST.length) return '<div class="empty"><span class="ic">👥</span>暂无玩家数据</div>';
    const total = PLIST.length;
    const online = PLIST.filter((p) => Date.now() - (p.lastSeen || 0) < 600000).length;
    const sumGold = PLIST.reduce((s, p) => s + (p.gold || 0), 0);
    const avgLv = (PLIST.reduce((s, p) => s + (p.level || 0), 0) / total).toFixed(1);
    const maxLv = Math.max(...PLIST.map((p) => p.level || 0));
    const sumKill = PLIST.reduce((s, p) => s + ((p.stats && p.stats.kills) || 0), 0);
    const sumClear = PLIST.reduce((s, p) => s + Object.keys(p.cleared || {}).length, 0);
    const dist = {};
    PLIST.forEach((p) => {
      const k = '第' + E.chapterOf(p.level || 1) + '章';
      dist[k] = (dist[k] || 0) + 1;
    });
    const dk = Object.keys(dist).sort();
    const maxD = Math.max(...Object.values(dist), 1);
    const top = PLIST.slice().sort((a, b) => E.power(b) - E.power(a)).slice(0, 10);
    return `
    <div class="grid g3">
      <div class="stat"><div class="v">${total}</div><div class="l">总玩家</div></div>
      <div class="stat"><div class="v">${online}</div><div class="l">10分钟内活跃</div></div>
      <div class="stat"><div class="v">${maxLv}</div><div class="l">最高关卡</div></div>
      <div class="stat"><div class="v">${avgLv}</div><div class="l">平均关卡</div></div>
      <div class="stat"><div class="v">${E.fmt(sumGold)}</div><div class="l">金币总量</div></div>
      <div class="stat"><div class="v">${E.fmt(sumKill)}</div><div class="l">累计击杀</div></div>
    </div>
    <div class="card"><div class="card-t">章节分布 <span class="sub">累计通关 ${sumClear} 关</span></div>
      <div class="bchart">${dk.map((k) => `<div class="bc"><b>${dist[k]}</b><i style="height:${dist[k] / maxD * 62}px"></i><span>${k}</span></div>`).join('')}</div></div>
    <div class="card"><div class="card-t">战力 TOP10</div>
      ${top.map((p, i) => `<div class="pl" data-sel="${p.uid}">
        <div class="pl-n">${i + 1}. ${p.name || '—'} <span class="tag y">${E.fmt(E.power(p))}</span></div>
        <div class="pl-s">第 ${p.level || 1} 关 · 星 ${E.totalStars(p)} · 无尽 ${p.endlessBest || 0} 层</div></div>`).join('')}</div>
    <div class="card"><div class="card-t">最近活跃</div>
      ${PLIST.slice().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)).slice(0, 8).map((p) =>
        `<div class="pl" data-sel="${p.uid}"><div class="pl-n">${p.name || '—'} <span class="tag b">第${p.level || 1}关</span></div>
        <div class="pl-s">${new Date(p.lastSeen || 0).toLocaleString()}</div></div>`).join('')}</div>`;
  },

  players() {
    return `
    <div class="card"><div class="card-t">玩家列表 <span class="sub">${PLIST.length} 人</span></div>
      <input class="inp" id="plSearch" placeholder="搜索代号 / UID">
      <button class="btn c blk" id="plBtn">搜索</button></div>
    <div id="plList">
      ${PLIST.length ? PLIST.map((p) => `
        <div class="pl ${SEL === p.uid ? 'on' : ''}" data-sel="${p.uid}">
          <div class="pl-n">${p.name || '—'} <span class="tag y">第${p.level || 1}关</span></div>
          <div class="pl-s">UID:${p.uid} · 武器 Lv.${p.gunLv || 1} · ${new Date(p.lastSeen || 0).toLocaleString()}</div>
          <div class="pl-t">
            <span class="tag y">🪙${E.fmt(p.gold || 0)}</span>
            <span class="tag b">💎${E.fmt(p.diamond || 0)}</span>
            <span class="tag g">⚔${E.fmt(E.power(p))}</span>
            <span class="tag">☠${E.fmt((p.stats && p.stats.kills) || 0)}</span>
            <span class="tag">⭐${E.totalStars(p)}</span>
          </div></div>`).join('') : '<div class="empty"><span class="ic">👥</span>暂无玩家</div>'}</div>
    ${SEL ? playerEditHTML() : ''}`;
  },

  batch() {
    return `
    <div class="card"><div class="card-t">📮 全服邮件（带附件）</div>
      <input class="inp" id="bcTitle" placeholder="邮件标题" value="系统补偿">
      <textarea class="inp" id="bcBody" placeholder="邮件正文">感谢各位先锋官坚守防线，特发放补给一份！</textarea>
      <div class="grid g3" style="margin-top:8px">
        <div><div class="lbl">金币</div><input class="inp" id="bcGold" type="number" value="10000"></div>
        <div><div class="lbl">钻石</div><input class="inp" id="bcDia" type="number" value="100"></div>
        <div><div class="lbl">芯片数</div><input class="inp" id="bcChip" type="number" value="0"></div>
      </div>
      <div class="lbl">芯片品质：</div>
      <select id="bcQ" class="inp"><option>绿</option><option>蓝</option><option selected>紫</option><option>橙</option><option>红</option></select>
      <button class="btn c blk" id="bcSend">发给全部玩家（${PLIST.length} 人）</button></div>
    <div class="card"><div class="card-t">⚡ 全服增益开关</div>
      <div class="kv"><span>金币双倍</span><b id="stGold2x">—</b></div>
      <div class="kv"><span>经验双倍</span><b id="stXp2x">—</b></div>
      <button class="btn blk" id="bcGold2x">切换金币双倍</button>
      <button class="btn blk" id="bcXp2x">切换经验双倍</button></div>
    <div class="card"><div class="card-t">🧹 批量维护</div>
      <button class="btn blk" id="bcRank">重建排行榜</button>
      <button class="btn blk" id="bcBackup">立即全服备份</button>
      <button class="btn d blk" id="bcClearLb">清空排行榜</button></div>`;
  },

  grant() {
    const p = PLIST.find((x) => x.uid === SEL);
    return `
    <div class="card"><div class="card-t">🎁 内容发放</div>
      <select class="inp" id="grWho">
        ${PLIST.length ? PLIST.map((x) => `<option value="${x.uid}" ${SEL === x.uid ? 'selected' : ''}>${x.name}（第${x.level || 1}关）</option>`).join('') : '<option value="">暂无玩家</option>'}
      </select>
      <div class="lbl" style="color:var(--gold)">当前目标：${p ? p.name : '未选择'}</div></div>
    <div class="card"><div class="card-t">武器解锁 <span class="sub">全部 ${EX.guns.length} 把</span></div>
      <div class="grid g3">${EX.guns.map((g) => `<button class="btn sm" data-grgun="${g.id}">${g.icon}${g.n}</button>`).join('')}</div></div>
    <div class="card"><div class="card-t">芯片发放</div>
      <div class="lbl">品质：</div>
      <select class="inp" id="grQ"><option>绿</option><option>蓝</option><option selected>紫</option><option>橙</option><option>红</option></select>
      <div class="grid g3" style="margin-top:8px">
        <button class="btn sm" data-grchip="1">发放 1 块</button>
        <button class="btn sm" data-grchip="3">发放 3 块</button>
        <button class="btn sm" data-grchip="6">发放 6 块</button></div></div>
    <div class="card"><div class="card-t">外观发放</div>
      <div class="grid g3">${EX.skins.map((s) => `<button class="btn sm" data-grskin="${s.id}">${s.icon}${s.n}</button>`).join('')}</div></div>`;
  },

  skill() {
    return `
    <div class="card"><div class="card-t">✨ 局内技能 <span class="sub">${EX.skills.length} 个 · 三选一</span></div>
      <table class="tbl"><tr><th>技能</th><th>系</th><th>类型</th><th>互斥</th></tr>
      ${EX.skills.map((s) => `<tr><td>${s.icon} ${s.n}</td><td>${s.el}</td>
        <td>${s.kind === 'gun' ? '枪械' : s.kind === 'passive' ? '被动' : s.kind === 'aura' ? '光环' : '命中触发'}</td>
        <td>${s.conflict ? (EX.skills.find((x) => x.id === s.conflict) || {}).n : '—'}</td></tr>`).join('')}</table>
      <div class="lbl">每项最高 10 级，可叠加。闪电链与火环互斥（资料 10 表）。</div></div>
    <div class="card"><div class="card-t">⭐ 永久天赋 <span class="sub">${EX.talents.length} 项</span></div>
      <table class="tbl"><tr><th>天赋</th><th>效果</th><th>解锁</th><th>上限</th></tr>
      ${EX.talents.map((t) => `<tr><td>${t.icon} ${t.n}</td><td>${t.desc}</td><td>第${t.unlock + 1}关</td><td>${t.max}</td></tr>`).join('')}</table></div>
    <div class="card"><div class="card-t">🏗️ 基地建筑</div>
      <table class="tbl"><tr><th>建筑</th><th>效果</th><th>上限</th></tr>
      ${EX.buildings.map((b) => `<tr><td>${b.icon} ${b.n}</td><td>${b.desc}</td><td>Lv.${b.max}</td></tr>`).join('')}</table></div>`;
  },

  zombie() {
    return `
    <div class="card"><div class="card-t">🧟 僵尸 <span class="sub">${EX.zombies.length} 种</span></div>
      <table class="tbl"><tr><th>僵尸</th><th>血</th><th>速</th><th>伤</th><th>技能</th></tr>
      ${EX.zombies.map((z) => `<tr><td>${z.icon} ${z.n}</td><td>${z.hp}</td><td>${z.spd}</td><td>${z.dmg}</td>
        <td>${z.skill}：${z.sk}</td></tr>`).join('')}</table></div>
    <div class="card"><div class="card-t">👹 BOSS <span class="sub">${EX.bosses.length} 个</span></div>
      <table class="tbl"><tr><th>BOSS</th><th>血</th><th>阶段</th><th>技能</th></tr>
      ${EX.bosses.map((b) => `<tr><td>${b.icon} ${b.n}</td><td>${E.fmt(b.hp)}</td><td>${b.phases}</td>
        <td>${b.skills.map((s) => s.n).join('、')}</td></tr>`).join('')}</table>
      <div class="lbl">BOSS 在每章第 10 关出现，血量随章节系数放大。</div></div>
    <div class="card"><div class="card-t">🔫 武器 <span class="sub">${EX.guns.length} 把</span></div>
      <table class="tbl"><tr><th>武器</th><th>伤</th><th>射速</th><th>弹夹</th><th>换弹</th><th>穿透</th></tr>
      ${EX.guns.map((g) => `<tr><td>${g.icon} ${g.n}</td><td>${g.dmg}</td><td>${g.rate}/s</td><td>${g.mag}</td><td>${g.reload}s</td><td>${g.pierce}</td></tr>`).join('')}</table></div>
    <div class="card"><div class="card-t">📖 章节</div>
      <table class="tbl"><tr><th>章节</th><th>怪物池</th><th>BOSS</th><th>血量系数</th></tr>
      ${EX.chapters.map((c) => `<tr><td>${c.icon} ${c.n}</td><td>${c.pool.map((x) => (EX.zombies.find((z) => z.id === x) || {}).n).join('、')}</td>
        <td>${(EX.bosses.find((b) => b.id === c.boss) || {}).n}</td><td>×${c.hpMul}</td></tr>`).join('')}</table></div>`;
  },

  config() {
    const c = CFG.core || {};
    return `
    <div class="card"><div class="card-t">🎛️ 数值配置</div>
      <div class="kv"><span>游戏名</span><b>${c.name || '向僵尸开炮'}</b></div>
      <div class="kv"><span>版本</span><b>${c.ver || '1.0.0'}</b></div>
      <div class="kv"><span>关卡上限</span><b>${E.maxLevel()}</b></div></div>
    <div class="card"><div class="card-t">成长曲线</div>
      <div class="kv"><span>武器每级成长</span><b>+${(E.GUN_GROW * 100).toFixed(0)}%</b></div>
      <div class="kv"><span>基础生命</span><b>${E.HP_BASE}</b></div>
      <div class="kv"><span>基础移速</span><b>${E.MOVE_BASE}</b></div>
      <div class="kv"><span>章节血量系数</span><b>${EX.chapters.map((x) => '×' + x.hpMul).join(' ')}</b></div>
      <div class="lbl">武器成长需 ≥ 怪物血量成长，否则后期卡关。</div></div>
    <div class="card"><div class="card-t">原始 JSON 编辑</div>
      <textarea class="inp" id="cfJson" rows="6">${JSON.stringify(c, null, 1)}</textarea>
      <button class="btn c blk" id="cfSave">保存 core.json</button></div>`;
  },

  data() {
    return `
    <div class="card"><div class="card-t">🗄️ 数据维护</div>
      <div class="kv"><span>玩家存档</span><b>${PLIST.length} 个</b></div>
      <div class="kv"><span>存档路径</span><b style="font-size:10px">data/zb/players/</b></div>
      <div class="kv"><span>存档分支</span><b>players（不触发 Pages 重建）</b></div>
      <button class="btn blk" id="dtReload">重新加载玩家</button>
      <button class="btn blk" id="dtRank">重建排行榜</button>
      <button class="btn blk" id="dtBackup">全服备份</button>
      <button class="btn d blk" id="dtClearAll">清空全部玩家存档</button>
      <div class="lbl">清空前会先自动备份到 backups/ 目录。</div></div>
    <div class="card"><div class="card-t">备份记录</div>
      <div id="dtBak"><div class="lbl">点上方「全服备份」后显示</div></div></div>`;
  },

  sys() {
    return `
    <div class="card"><div class="card-t">🌐 网络状态</div>
      <div class="kv"><span>状态</span><b style="color:${Net.online ? 'var(--green)' : '#ff8fa4'}">${Net.online ? '● 已连接' : '○ 离线'}</b></div>
      <div class="kv"><span>端点</span><b style="font-size:10px">${Net.endpoint.replace('https://', '')}</b></div>
      <div class="kv"><span>仓库</span><b style="font-size:10px">${GH.owner}/${GH.repo}</b></div>
      <button class="btn blk" id="syReNet">重新检测</button>
      <button class="btn blk" id="syDiag">逐端点诊断</button>
      <div id="syDiagBox"><div class="lbl">点「逐端点诊断」测试全部通道</div></div></div>
    <div class="card"><div class="card-t">🚀 自定义加速地址</div>
      <textarea class="inp" id="syEps" rows="2" placeholder="https://xxx.workers.dev">${(GH.extra || []).join('\n')}</textarea>
      <button class="btn c blk" id="sySaveEps">保存加速地址</button>
      <div class="lbl">国内连不上 GitHub 时部署 Cloudflare Worker，地址填这里。</div></div>
    <div class="card"><div class="card-t">🔑 账号</div>
      <div class="kv"><span>管理口令</span><b>******</b></div>
      <div class="lbl">修改口令请编辑 admin/js/admin.js 的 PWD 常量</div>
      <button class="btn d blk" id="syLogout">退出后台</button></div>`;
  },
};

/* 玩家编辑卡片（独立函数） */
function playerEditHTML() {
  const p = PLIST.find((x) => x.uid === SEL);
  if (!p) return '';
  return `
  <div class="card"><div class="card-t">编辑：<span style="color:var(--gold)">${p.name}</span> <span class="sub">${p.uid}</span></div>
    <div class="grid g2">
      <div><div class="lbl">代号</div><input class="inp" id="edName" value="${p.name || ''}"></div>
      <div><div class="lbl">当前关卡</div><input class="inp" id="edLevel" type="number" value="${p.level || 1}"></div>
      <div><div class="lbl">金币</div><input class="inp" id="edGold" type="number" value="${p.gold || 0}"></div>
      <div><div class="lbl">钻石</div><input class="inp" id="edDia" type="number" value="${p.diamond || 0}"></div>
      <div><div class="lbl">武器等级</div><input class="inp" id="edGun" type="number" value="${p.gunLv || 1}"></div>
      <div><div class="lbl">无尽最佳</div><input class="inp" id="edEndless" type="number" value="${p.endlessBest || 0}"></div>
      <div><div class="lbl">芯片碎片</div><input class="inp" id="edShard" type="number" value="${p.shards || 0}"></div>
      <div><div class="lbl">武器</div>
        <select class="inp" id="edGunId">${EX.guns.map((g) => `<option value="${g.id}" ${p.gun === g.id ? 'selected' : ''}>${g.n}</option>`).join('')}</select></div>
    </div>
    <button class="btn c blk" id="edSave">保存修改</button>
    <div class="grid g2" style="margin-top:8px">
      <button class="btn" id="edMax">一键满资源</button>
      <button class="btn" id="edChip">发放 6 块红品芯片</button>
      <button class="btn" id="edTalent">一键满天赋</button>
      <button class="btn" id="edBuild">一键满建筑</button>
      <button class="btn" id="edClear">通关全部关卡(3星)</button>
      <button class="btn d" id="edReset">重置进度</button>
    </div>
    <button class="btn d blk" id="edDel">删除该存档</button>
    <div class="lbl">当前战力：${E.fmt(E.power(p))} · 攻击 ${E.fmt(E.attrs(p).atk)} · 生命 ${E.fmt(E.attrs(p).hp)}
      · 已装芯片 ${Object.keys(p.chips || {}).length} · 天赋点 ${Object.values(p.talents || {}).reduce((s, v) => s + v, 0)}</div></div>`;
}

/* ============================================================
 * 绑定
 * ========================================================== */
const BINDS = {

  dash() {
    $$('#body [data-sel]').forEach((el) => { el.onclick = () => { SEL = el.dataset.sel; PG = 'players'; this.render(); }; });
  },

  players() {
    const s = D('#plBtn');
    if (s) s.onclick = () => {
      const k = (D('#plSearch').value || '').trim().toLowerCase();
      if (!k) return this.render();
      const hit = PLIST.filter((p) => (p.name || '').toLowerCase().indexOf(k) >= 0 || (p.uid || '').indexOf(k) >= 0);
      D('#plList').innerHTML = hit.length ? hit.map((p) => `
        <div class="pl ${SEL === p.uid ? 'on' : ''}" data-sel="${p.uid}">
          <div class="pl-n">${p.name} <span class="tag y">第${p.level || 1}关</span></div>
          <div class="pl-s">UID:${p.uid}</div></div>`).join('') : '<div class="empty">未找到</div>';
      $$('#plList [data-sel]').forEach((el) => { el.onclick = () => { SEL = el.dataset.sel; this.render(); }; });
    };
    $$('#body [data-sel]').forEach((el) => { el.onclick = () => { SEL = el.dataset.sel; this.render(); }; });
    const sv = D('#edSave');
    if (sv) sv.onclick = async () => {
      const p = PLIST.find((x) => x.uid === SEL); if (!p) return;
      p.name = D('#edName').value || p.name;
      p.level = +D('#edLevel').value || 1;
      p.gold = +D('#edGold').value || 0;
      p.diamond = +D('#edDia').value || 0;
      p.gunLv = +D('#edGun').value || 1;
      p.endlessBest = +D('#edEndless').value || 0;
      p.shards = +D('#edShard').value || 0;
      p.gun = D('#edGunId').value;
      await this.save(SEL, p); this.toast('已保存', 'ok'); this.render();
    };
    const mx = D('#edMax'); if (mx) mx.onclick = async () => {
      const p = PLIST.find((x) => x.uid === SEL); if (!p) return;
      p.gold = 99999999; p.diamond = 999999; p.shards = 99999;
      await this.save(SEL, p); this.toast('资源已拉满', 'ok'); this.render();
    };
    const ec = D('#edChip'); if (ec) ec.onclick = async () => {
      const p = PLIST.find((x) => x.uid === SEL); if (!p) return;
      const slots = EX.chipSlots.map((s) => s.k);
      slots.forEach((k) => { p.chips[k] = E.rollChip('红', k); });
      await this.save(SEL, p); this.toast('已发放 6 块红品芯片并装配', 'ok'); this.render();
    };
    const et = D('#edTalent'); if (et) et.onclick = async () => {
      const p = PLIST.find((x) => x.uid === SEL); if (!p) return;
      EX.talents.forEach((t) => { p.talents[t.id] = t.max; });
      await this.save(SEL, p); this.toast('天赋已满级', 'ok'); this.render();
    };
    const eb = D('#edBuild'); if (eb) eb.onclick = async () => {
      const p = PLIST.find((x) => x.uid === SEL); if (!p) return;
      EX.buildings.forEach((b) => { p.build[b.id] = b.max; });
      await this.save(SEL, p); this.toast('建筑已满级', 'ok'); this.render();
    };
    const ec2 = D('#edClear'); if (ec2) ec2.onclick = async () => {
      const p = PLIST.find((x) => x.uid === SEL); if (!p) return;
      for (let i = 1; i <= E.maxLevel(); i++) p.cleared[i] = 3;
      p.level = E.maxLevel();
      await this.save(SEL, p); this.toast('已标记全部关卡 3 星通关', 'ok'); this.render();
    };
    const rs = D('#edReset'); if (rs) rs.onclick = async () => {
      if (!confirm('确定重置该玩家的全部进度？')) return;
      const p = PLIST.find((x) => x.uid === SEL); if (!p) return;
      await this.save(SEL, E.newPlayer(p.uid, p.name, p.gender));
      await this.loadPlayers(); this.toast('已重置', 'ok'); this.render();
    };
    const dl = D('#edDel'); if (dl) dl.onclick = async () => {
      if (!confirm('确定删除该存档？不可恢复！')) return;
      try { await Net.del('data/zb/players/' + SEL + '.json'); } catch (e) {}
      SEL = null; await this.loadPlayers(); this.toast('已删除', 'ok'); this.render();
    };
  },

  batch() {
    const sd = D('#bcSend');
    if (sd) sd.onclick = async () => {
      if (!PLIST.length) return this.toast('无玩家', 'err');
      const mail = {
        id: 'm' + Date.now(), t: D('#bcTitle').value || '系统邮件', b: D('#bcBody').value || '',
        gold: +D('#bcGold').value || 0, dia: +D('#bcDia').value || 0,
        chips: +D('#bcChip').value || 0, q: D('#bcQ').value || '紫', ts: Date.now(),
      };
      let n = 0;
      for (const p of PLIST) {
        p.mail = p.mail || []; p.mail.push(mail);
        await this.save(p.uid, p).catch(() => {}); n++;
      }
      this.toast('已发送给 ' + n + ' 位玩家', 'ok');
    };
    const g2 = D('#bcGold2x'); if (g2) g2.onclick = async () => { await this.toggleBuff('gold2x'); this.toast('已切换金币双倍', 'ok'); this.render(); };
    const x2 = D('#bcXp2x'); if (x2) x2.onclick = async () => { await this.toggleBuff('xp2x'); this.toast('已切换经验双倍', 'ok'); this.render(); };
    this.loadBuff();
    const rk = D('#bcRank'); if (rk) rk.onclick = async () => { await this.rebuildRank(); this.toast('排行榜已重建', 'ok'); };
    const bk = D('#bcBackup'); if (bk) bk.onclick = async () => { await this.backup(); };
    const cl = D('#bcClearLb'); if (cl) cl.onclick = async () => {
      await Net.write('data/zb/leaderboard.json', { list: [], updated: Date.now() });
      this.toast('排行榜已清空', 'ok');
    };
  },

  grant() {
    const w = D('#grWho'); if (w) w.onchange = () => { SEL = w.value; this.render(); };
    $$('#body [data-grgun]').forEach((b) => {
      b.onclick = async () => {
        const p = PLIST.find((x) => x.uid === SEL); if (!p) return this.toast('请先选择玩家', 'err');
        p.gun = b.dataset.grgun; await this.save(SEL, p); this.toast('已切换武器', 'ok');
      };
    });
    $$('#body [data-grchip]').forEach((b) => {
      b.onclick = async () => {
        const p = PLIST.find((x) => x.uid === SEL); if (!p) return this.toast('请先选择玩家', 'err');
        const q = D('#grQ') ? D('#grQ').value : '紫';
        for (let i = 0; i < +b.dataset.grchip; i++) p.bag.push(E.rollChip(q, null));
        await this.save(SEL, p); this.toast('已发放 ' + b.dataset.grchip + ' 块' + q + '品芯片', 'ok');
      };
    });
    $$('#body [data-grskin]').forEach((b) => {
      b.onclick = async () => {
        const p = PLIST.find((x) => x.uid === SEL); if (!p) return this.toast('请先选择玩家', 'err');
        p.skins = p.skins || [];
        if (p.skins.indexOf(b.dataset.grskin) < 0) p.skins.push(b.dataset.grskin);
        p.skin = b.dataset.grskin;
        await this.save(SEL, p); this.toast('已发放外观', 'ok');
      };
    });
  },

  config() {
    const sv = D('#cfSave');
    if (sv) sv.onclick = async () => {
      try {
        const o = JSON.parse(D('#cfJson').value);
        await Net.write('data/config/core.json', o, 'admin: 更新数值配置');
        CFG.core = o; this.toast('已保存', 'ok');
      } catch (e) { this.toast('JSON 格式错误', 'err'); }
    };
  },

  data() {
    const rl = D('#dtReload'); if (rl) rl.onclick = async () => { await this.loadPlayers(); this.toast('已重新加载', 'ok'); this.render(); };
    const rk = D('#dtRank'); if (rk) rk.onclick = async () => { await this.rebuildRank(); this.toast('排行榜已重建', 'ok'); };
    const bk = D('#dtBackup'); if (bk) bk.onclick = async () => { await this.backup(); };
    const ca = D('#dtClearAll'); if (ca) ca.onclick = async () => {
      if (!confirm('确定清空全部 ' + PLIST.length + ' 个玩家存档？会先自动备份！')) return;
      await this.backup();
      for (const p of PLIST) { try { await Net.del('data/zb/players/' + p.uid + '.json'); } catch (e) {} }
      await Net.write('data/zb/leaderboard.json', { list: [], updated: Date.now() });
      PLIST = []; SEL = null; this.toast('已清空全部存档', 'ok'); this.render();
    };
  },

  sys() {
    const rn = D('#syReNet'); if (rn) rn.onclick = async () => { this.toast('检测中…'); await Net.reset(); this.net(); this.render(); };
    const dg = D('#syDiag'); if (dg) dg.onclick = async () => {
      const box = D('#syDiagBox'); if (!box) return;
      box.innerHTML = '<div class="lbl">测试中…</div>';
      const list = await Net.diagnose();
      const ok = list.filter((x) => x.ok).length;
      box.innerHTML = `<div class="lbl" style="margin-bottom:5px">${ok}/${list.length} 个通道可用</div>` +
        list.map((x) => `<div class="kv"><span style="font-size:9px;word-break:break-all">${x.ep.replace('https://', '')}</span>
          <b style="font-size:9px;color:${x.ok ? 'var(--green)' : '#ff8fa4'}">${x.ok ? '✔' : '✘'} ${x.st}</b></div>`).join('');
      await Net.reset(); this.net();
    };
    const se = D('#sySaveEps'); if (se) se.onclick = () => {
      const v = (D('#syEps').value || '').split('\n').map((x) => x.trim()).filter(Boolean);
      GH.extra = v; try { localStorage.setItem('zb_extra', JSON.stringify(v)); } catch (e) {}
      alert('已保存 ' + v.length + ' 个加速地址'); Net.reset();
    };
    const lo = D('#syLogout'); if (lo) lo.onclick = () => { sessionStorage.removeItem(AKEY); location.reload(); };
  },
};

A.loadBuff = async function () {
  try {
    const r = await Net.read('data/zb/config.json');
    const c = (r && r.data) || {};
    const g = D('#stGold2x'), x = D('#stXp2x');
    if (g) g.innerHTML = c.gold2x ? '<span style="color:var(--green)">开启</span>' : '关闭';
    if (x) x.innerHTML = c.xp2x ? '<span style="color:var(--green)">开启</span>' : '关闭';
  } catch (e) {}
};
A.toggleBuff = async function (k) {
  let c = {};
  try { const r = await Net.read('data/zb/config.json'); c = (r && r.data) || {}; } catch (e) {}
  c[k] = !c[k];
  await Net.write('data/zb/config.json', c, 'admin: 切换 ' + k);
};
A.rebuildRank = async function () {
  const lb = PLIST.map((p) => ({ u: p.uid, n: p.name, lv: p.level || 1, pw: E.power(p), eb: p.endlessBest || 0 }));
  lb.sort((a, b) => b.lv - a.lv || b.pw - a.pw);
  await Net.write('data/zb/leaderboard.json', { list: lb.slice(0, 50), updated: Date.now() }, 'admin: 重建排行榜');
};
A.backup = async function () {
  const d = new Date();
  const name = 'backups/zb-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';
  await Net.write(name, { players: PLIST, at: Date.now() }, 'admin: 全服备份');
  const box = D('#dtBak');
  if (box) box.innerHTML = '<div class="lbl">已备份到 <b>' + name + '</b></div>';
  this.toast('备份完成：' + name, 'ok');
};

window.PAGES = PAGES; window.BINDS = BINDS;
Object.defineProperty(window, 'PLIST', { get: () => PLIST, set: (v) => { PLIST = v; } });
Object.defineProperty(window, 'PG', { get: () => PG, set: (v) => { PG = v; } });
Object.defineProperty(window, 'SEL', { get: () => SEL, set: (v) => { SEL = v; } });
window.A = A;
window.addEventListener('DOMContentLoaded', () => A.init());
