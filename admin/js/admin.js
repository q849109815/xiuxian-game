/* =========================================================
 * admin.js —— 星海飞驰管理后台
 * ========================================================= */
const PWD = 'fj19941224';
const D = (s) => document.querySelector(s);
const DD = (s) => Array.from(document.querySelectorAll(s));

let PLIST = [], CUR = null, PG = 'dash';

function toast(m, t) {
  const d = document.createElement('div');
  d.className = 'toast ' + (t || ''); d.textContent = m;
  D('#admToasts').appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transition = '.3s'; setTimeout(() => d.remove(), 300); }, 2000);
}

/* ============ 登录 ============ */
window.addEventListener('load', async () => {
  D('#alBtn').onclick = () => {
    if (D('#alPwd').value !== PWD) return toast('口令有误', 'err');
    D('#admLogin').classList.add('off');
    D('#admMain').classList.add('on');
    initAdmin();
  };
  D('#alPwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') D('#alBtn').click(); });
  await Net.init().catch(() => {});
  D('#alNet').textContent = (Net.online ? '● 已连接 ' : '○ 离线 ') + Net.endpoint.replace('https://', '');
});

async function initAdmin() {
  await CFG.load().catch(() => {});
  D('#atNet').textContent = Net.online ? '●' : '○';
  D('#atNet').classList.toggle('off', !Net.online);
  bindNav();
  loadPlayers();
  render();
}

function bindNav() {
  DD('.an-it').forEach((b) => b.onclick = () => {
    PG = b.dataset.pg;
    DD('.an-it').forEach((x) => x.classList.toggle('on', x.dataset.pg === PG));
    D('#atTitle').textContent = b.querySelector('span').textContent;
    D('#admNav').classList.remove('on'); D('#admMask').classList.remove('on');
    if (PG === 'players' || PG === 'dash') loadPlayers();
    render();
  });
  D('#atMenu').onclick = () => { D('#admNav').classList.toggle('on'); D('#admMask').classList.toggle('on'); };
  D('#admMask').onclick = () => { D('#admNav').classList.remove('on'); D('#admMask').classList.remove('on'); };
}

async function loadPlayers() {
  const names = await Net.list('data/ss/players');
  PLIST = [];
  const files = (names || []).filter((x) => x.endsWith('.json')).slice(0, 60);
  for (const f of files) {
    try { const r = await Net.read('data/ss/players/' + f); if (r && r.data) PLIST.push(r.data); } catch (e) {}
  }
  PLIST.sort((a, b) => (b.realm || 0) - (a.realm || 0));
}

function render() { const f = PAGES[PG]; if (f) D('#admBody').innerHTML = f(); bindPage(); }

function bindPage() {
  const f = BINDS[PG]; if (f) f();
}

const playerPath = (p) => 'data/ss/players/' + p.uid + '.json';
async function saveP(p) {
  const ok = await Net.write(playerPath(p), p, '[admin] 修改 ' + p.name);
  toast(ok ? '已保存【' + p.name + '】' : '保存失败（已排队）', ok ? 'ok' : 'err');
}

/* ============================================================
 * 页面
 * ========================================================== */
const PAGES = {
  dash() {
    if (!PLIST.length) return '<div class="empty"><div class="ic">👥</div>暂无玩家数据</div>';
    const total = PLIST.length;
    const online = PLIST.filter((p) => Date.now() - (p.lastSeen || 0) < 600000).length;
    const sumStone = PLIST.reduce((s, p) => s + (p.stone || 0), 0);
    const avgRealm = (PLIST.reduce((s, p) => s + (p.realm || 0), 0) / total).toFixed(1);
    // 境界分布
    const dist = {};
    PLIST.forEach((p) => { const n = CFG.realmName(p.realm || 0); dist[n] = (dist[n] || 0) + 1; });
    const dk = Object.keys(dist);
    const maxD = Math.max(...Object.values(dist), 1);
    // 战力 TOP
    const top = PLIST.slice().sort((a, b) => E.power(b) - E.power(a)).slice(0, 10);
    return `
    <div class="grid g4">
      <div class="stat"><div class="v">${total}</div><div class="l">总玩家</div></div>
      <div class="stat"><div class="v">${online}</div><div class="l">10分钟内活跃</div></div>
      <div class="stat"><div class="v">${E.fmt(sumStone)}</div><div class="l">灵石总量</div></div>
      <div class="stat"><div class="v">${avgRealm}</div><div class="l">平均境界序</div></div>
    </div>
    <div class="card">
      <div class="card-t">境界分布</div>
      <div class="bchart">
        ${dk.map((k) => `<div class="bc"><b>${dist[k]}</b><i style="height:${dist[k] / maxD * 78}px"></i><span>${k}</span></div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-t">战力 TOP10</div>
      ${top.map((p, i) => `<div class="pl-item" data-sel="${p.uid}">
        <div class="pl-av">${p.avatar || '🧙'}</div>
        <div class="pl-info"><div class="pl-nm">${i + 1}. ${p.name}</div>
        <div class="pl-sub">${CFG.realmName(p.realm || 0)} ${EX.layerName(p.realm || 0, p.layer || 0)}</div></div>
        <div><span class="tag y">${E.fmt(E.power(p))}</span></div>
      </div>`).join('')}
    </div>
    <div class="card">
      <div class="card-t">灵根分布</div>
      ${Object.entries(PLIST.reduce((m, p) => { m[p.rootName || p.root] = (m[p.rootName || p.root] || 0) + 1; return m; }, {}))
        .map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v} 人</b></div>`).join('')}
    </div>`;
  },

  players() {
    return `
    <div class="card">
      <div class="card-t">玩家列表 <span class="sub">${PLIST.length} 人</span></div>
      <input class="inp" id="plSearch" placeholder="搜索道号 / UID">
      <button class="btn c blk" id="plBtnSearch">搜索</button>
    </div>
    <div id="plList">
      ${PLIST.length ? PLIST.map((p) => `
        <div class="pl-item" data-sel="${p.uid}">
          <div class="pl-av">${p.avatar || '🧙'}</div>
          <div class="pl-info">
            <div class="pl-nm">${p.name} ${p.ban ? '<span class="tag r">封禁</span>' : ''}</div>
            <div class="pl-sub">${CFG.realmName(p.realm || 0)} ${EX.layerName(p.realm || 0, p.layer || 0)} · 战力 ${E.fmt(E.power(p))}</div>
            <div class="pl-tags">
              <span class="tag y">💎${E.fmt(p.stone || 0)}</span>
              <span class="tag b">🪙${E.fmt(p.jade || 0)}</span>
              <span class="tag g">击杀${p.stats?.kills || 0}</span>
              <span class="tag">${p.sect ? p.sect.n : '无仙盟'}</span>
            </div>
            <div class="pl-sub" style="margin-top:3px;color:var(--txt3)">UID:${p.uid} · ${new Date(p.lastSeen || 0).toLocaleString()}</div>
          </div>
        </div>`).join('') : '<div class="empty"><div class="ic">👥</div>暂无玩家（先去游戏创建角色）</div>'}
    </div>
    <div id="plEdit"></div>`;
  },

  batch() {
    return `
    <div class="card">
      <div class="card-t">📮 全服邮件 <span class="sub">发给所有玩家</span></div>
      <div class="lbl">标题</div>
      <input class="inp" id="mTitle" value="仙门通告" placeholder="邮件标题">
      <div class="lbl">内容</div>
      <input class="inp" id="mBody" value="感谢各位道友的支持！" placeholder="邮件正文">
      <div class="lbl">附件（可选）</div>
      <div class="grid g4">
        <div><div class="lbl">灵石</div><input class="inp" id="mStone" type="number" value="0"></div>
        <div><div class="lbl">仙玉</div><input class="inp" id="mJade" type="number" value="0"></div>
        <div><div class="lbl">修为(分)</div><input class="inp" id="mExp" type="number" value="0"></div>
        <div><div class="lbl">物品名</div><input class="inp" id="mItem" placeholder="如：筑基丹"></div>
      </div>
      <button class="btn p blk" id="btnSendMail">📮 发给全服（${PLIST.length} 人）</button>
    </div>
    <div class="card">
      <div class="card-t">⚡ 全服双倍开关</div>
      <div class="grid g3">
        <button class="btn c" data-dbl="exp">修为双倍</button>
        <button class="btn c" data-dbl="stone">灵石双倍</button>
        <button class="btn c" data-dbl="drop">掉落双倍</button>
      </div>
      <div class="lbl" id="dblState">当前：读取中…</div>
    </div>
    <div class="card">
      <div class="card-t">🔧 批量维护</div>
      <div class="grid g2">
        <button class="btn" id="btnUnbanAll">解封全体</button>
        <button class="btn" id="btnHealAll">全服回满气血</button>
        <button class="btn" id="btnRecalc">重算全服战力</button>
        <button class="btn d" id="btnCleanInactive">清理30天未活跃</button>
      </div>
    </div>`;
  },

  currency() {
    if (!CUR) return `<div class="card">
      <div class="card-t">💰 货币管理</div>
      <input class="inp" id="curUid" placeholder="输入玩家 UID 或 道号">
      <button class="btn c blk" id="btnCurLoad">读取玩家</button>
      <div class="lbl">提示：UID 可在「玩家管理」列表查看</div></div>`;
    const p = CUR;
    return `
    <div class="card">
      <div class="card-t">💰 ${p.name} <span class="sub">UID:${p.uid}</span></div>
      <div class="kv"><span>灵石</span><b class="up">${E.fmt(p.stone || 0)}</b></div>
      <div class="kv"><span>仙玉</span><b>${E.fmt(p.jade || 0)}</b></div>
      <div class="grid g2">
        <div><div class="lbl">灵石</div><input class="inp" id="cStone" type="number" value="${p.stone || 0}"></div>
        <div><div class="lbl">仙玉</div><input class="inp" id="cJade" type="number" value="${p.jade || 0}"></div>
      </div>
      <button class="btn p blk" id="btnCurSave">保存货币</button>
      <div class="grid g2" style="margin-top:8px">
        <button class="btn c" id="btnCurMax">一键全满(9999万)</button>
        <button class="btn d" id="btnCurZero">一键清零</button>
      </div>
    </div>
    <div class="card">
      <div class="card-t">资源</div>
      <div class="kv"><span>境界</span><b>${CFG.realmName(p.realm || 0)} ${EX.layerName(p.realm || 0, p.layer || 0)}</b></div>
      <div class="kv"><span>修为</span><b>${E.fmt(p.exp || 0)}</b></div>
      <div class="kv"><span>战力</span><b class="up">${E.fmt(E.power(p))}</b></div>
      <div class="grid g2">
        <div><div class="lbl">境界序号(0-14)</div><input class="inp" id="cRealm" type="number" value="${p.realm || 0}"></div>
        <div><div class="lbl">小层</div><input class="inp" id="cLayer" type="number" value="${p.layer || 0}"></div>
      </div>
      <button class="btn p blk" id="btnRealmSave">保存境界</button>
    </div>`;
  },

  grant() {
    if (!CUR) return `<div class="card">
      <div class="card-t">🎁 内容发放</div>
      <input class="inp" id="gUid" placeholder="输入玩家 UID 或 道号">
      <button class="btn c blk" id="btnGLoad">读取玩家</button></div>`;
    const p = CUR;
    const cats = {
      '法宝': (CFG.core.skills || []).filter((x) => x.type === '法宝'),
      '功法': (CFG.core.skills || []).filter((x) => ['主修功法', '剑诀', '神识功法', '入门心法', '遁术', '神魂功法', '剑阵'].includes(x.type)),
      '丹药': (CFG.core.items || []).filter((x) => x.type === '丹药'),
      '装备': (CFG.core.skills || []).filter((x) => x.type === '装备'),
      '灵宠': (CFG.core.pets || []).filter((x) => ['灵宠', '灵虫'].includes(x.type)),
      '傀儡': (CFG.core.pets || []).filter((x) => x.type === '傀儡'),
      '伙伴': (CFG.core.partners || []).filter((x) => ['伙伴', '主角'].includes(x.type)),
      '称号': EX.titles,
    };
    return `
    <div class="card">
      <div class="card-t">🎁 发给 ${p.name} <span class="sub">直接入库</span></div>
      <div class="lbl">类别</div>
      <select class="sel" id="gCat">${Object.keys(cats).map((k) => `<option>${k}</option>`).join('')}</select>
      <div class="lbl">搜索</div>
      <input class="inp" id="gSearch" placeholder="输入名称筛选">
      <div id="gList" style="max-height:320px;overflow-y:auto;margin-top:8px"></div>
    </div>`;
  },

  titles() {
    if (!CUR) return `<div class="card">
      <div class="card-t">🎖️ 称号管理</div>
      <input class="inp" id="tUid" placeholder="输入玩家 UID 或 道号">
      <button class="btn c blk" id="btnTLoad">读取玩家</button></div>`;
    const p = CUR;
    return `<div class="card">
      <div class="card-t">🎖️ ${p.name} 的称号</div>
      ${EX.titles.map((t) => {
        const own = (p.titles || []).includes(t.id);
        return `<div class="pl-item" style="${own ? '' : 'opacity:.5'}">
          <div class="pl-info"><div class="pl-nm">${t.n} ${p.titleCur === t.id ? '<span class="tag y">当前</span>' : own ? '<span class="tag g">拥有</span>' : ''}</div>
          <div class="pl-sub">${Object.entries(t.buff || {}).map(([k, v]) => k + '+' + Math.round(v * 100) + '%').join(' ')} · ${t.cond}</div></div>
          <button class="btn sm ${own ? 'd' : 'c'}" data-tt="${t.id}">${own ? '撤销' : '授予'}</button>
        </div>`;
      }).join('')}
    </div>`;
  },

  story() {
    const st = CFG.core.story || [];
    return `<div class="card">
      <div class="card-t">📖 剧情任务大纲 <span class="sub">${st.length} 条（只读）</span></div>
      <div class="lbl">资料来源：20_剧情任务大纲</div>
    </div>
    ${st.map((s) => `<div class="pl-item">
      <div class="pl-info"><div class="pl-nm">${s.id} ${s.name} <span class="tag b">${s.chapter}</span></div>
      <div class="pl-sub">${s.desc || ''}</div>
      <div class="pl-sub" style="color:var(--gold)">奖励：${s.reward || ''} · 需：${s.need || ''}</div></div>
    </div>`).join('')}`;
  },

  config() {
    return `
    <div class="card">
      <div class="card-t">🎛️ 常用数值</div>
      <div class="lbl">挂机修为倍率（当前 1.0）</div>
      <input class="inp" id="cfExpRate" type="number" step="0.1" value="1.0">
      <div class="lbl">挂机灵石倍率（当前 1.0）</div>
      <input class="inp" id="cfStoneRate" type="number" step="0.1" value="1.0">
      <div class="lbl">突破基础成功率（当前 0.55）</div>
      <input class="inp" id="cfBreakRate" type="number" step="0.05" value="0.55">
      <button class="btn p blk" id="btnCfgSave">保存数值配置</button>
      <div class="lbl">说明：修改后写入 data/ss/config.json，游戏端需在设置里刷新（暂为预留）</div>
    </div>
    <div class="card">
      <div class="card-t">📢 全服公告</div>
      <input class="inp" id="cfNotice" placeholder="公告内容">
      <button class="btn c blk" id="btnNotice">发布公告</button>
    </div>`;
  },

  data() {
    return `
    <div class="card">
      <div class="card-t">🗄️ 数据维护</div>
      <div class="grid g2">
        <button class="btn c" id="btnRebuild">重建排行榜</button>
        <button class="btn c" id="btnBackup">全服备份</button>
        <button class="btn" id="btnClearLb">清空排行榜</button>
        <button class="btn d" id="btnWipe">清空全部存档</button>
      </div>
    </div>
    <div class="card">
      <div class="card-t">📊 数据统计</div>
      <div class="kv"><span>玩家总数</span><b>${PLIST.length}</b></div>
      <div class="kv"><span>存档路径</span><b style="font-size:11px">data/ss/players/</b></div>
      <div class="kv"><span>排行榜</span><b style="font-size:11px">data/ss/leaderboard.json</b></div>
      <div class="kv"><span>仓库</span><b style="font-size:11px">${GH.owner}/${GH.repo}</b></div>
    </div>`;
  },

  sys() {
    const st = Net.online
      ? '<span style="color:#7ae89a">● 已连接</span>'
      : '<span style="color:#ff8fa4">○ 离线（读不到仓库数据）</span>';
    return `
    <div class="card">
      <div class="card-t">🌐 网络状态</div>
      <div class="kv"><span>状态</span><b>${st}</b></div>
      <div class="kv"><span>当前端点</span><b style="font-size:11px">${Net.endpoint.replace('https://', '')}</b></div>
      <div class="kv"><span>待上传</span><b>${Net.queueLen}</b></div>
      <div class="kv"><span>仓库</span><b style="font-size:11px">${GH.owner}/${GH.repo}</b></div>
      <button class="btn blk" id="btnReNet">重新检测</button>
      <button class="btn blk" id="btnDiag">逐端点诊断</button>
      <button class="btn blk" id="btnFlush">立即补传</button>
      <div class="lbl">离线常见原因：① 国内访问 api.github.com 被墙/很慢 ② Token 过期或权限不足 ③ 浏览器插件拦截。点「逐端点诊断」看哪个通道能通。</div>
    </div>
    <div class="card">
      <div class="card-t">🔬 端点诊断结果</div>
      <div id="diagBox"><div class="lbl">点上方「逐端点诊断」开始测试全部通道…</div></div>
    </div>
    <div class="card">
      <div class="card-t">🚀 自定义加速地址（推荐）</div>
      <div class="lbl">部署 Cloudflare Worker 后把地址填这里，可彻底解决国内连不上 GitHub 的问题。</div>
      <textarea class="inp" id="sysEps" rows="3" placeholder="https://xxx.workers.dev">${(GH.extra || []).join('\n')}</textarea>
      <button class="btn c blk" id="btnSaveEps">保存加速地址</button>
      <details style="margin-top:8px">
        <summary class="lbl" style="cursor:pointer;color:var(--cy)">▶ 展开：Cloudflare Worker 部署步骤（3分钟）</summary>
        <div class="lbl" style="margin-top:6px;line-height:1.7">
          1. 注册 <b>dash.cloudflare.com</b>（邮箱即可，不用域名不用绑卡）<br>
          2. 左侧 <b>Workers &amp; Pages</b> → <b>Create</b> → <b>Create Worker</b><br>
          3. 名字填 <b>xx-proxy</b> → 点 <b>Deploy</b><br>
          4. 点 <b>Edit code</b>，左边代码<b>全删</b>，粘贴下面这段 → <b>Save and Deploy</b><br>
          5. 复制顶部 <b>https://xx-proxy.你的账号.workers.dev</b>，填到上面输入框 → 保存
        </div>
        <textarea class="inp" rows="10" readonly style="font-size:10px;font-family:monospace">export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '') {
      return new Response('OK', { headers: { 'content-type': 'text/plain' } });
    }
    let auth = request.headers.get('authorization');
    if ((!auth || auth.replace('Bearer','').trim() === '') && env.GH_TOKEN) auth = 'Bearer ' + env.GH_TOKEN;
    const headers = new Headers();
    for (const k of ['accept','content-type','x-github-api-version','user-agent']) {
      const v = request.headers.get(k); if (v) headers.set(k, v);
    }
    if (auth) headers.set('authorization', auth);
    const init = { method: request.method, headers };
    if (['POST','PUT','PATCH','DELETE'].includes(request.method)) init.body = await request.text();
    const target = 'https://api.github.com' + url.pathname + url.search;
    const res = await fetch(target, init);
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': '*',
      },
    });
  }
};</textarea>
        <div class="lbl" style="margin-top:6px">可选：在 Worker 的 <b>Settings → Variables → Add secret</b> 里加 <b>GH_TOKEN</b>（值=你的 GitHub Token），这样前端就不暴露 Token 了。</div>
      </details>
    </div>
    <div class="card">
      <div class="card-t">🔑 账号</div>
      <div class="kv"><span>管理口令</span><b>******</b></div>
      <div class="lbl">修改口令请编辑 admin/js/admin.js 的 PWD 常量</div>
      <button class="btn d blk" id="btnLogout">退出后台</button>
    </div>`;
  },
};

/* ============================================================
 * 绑定
 * ========================================================== */
const BINDS = {
  players() {
    const sel = (uid) => {
      CUR = PLIST.find((p) => p.uid === uid) || null;
      const box = D('#plEdit');
      if (!CUR) { box.innerHTML = ''; return; }
      const p = CUR;
      box.innerHTML = `<div class="card">
        <div class="card-t">编辑 ${p.name} <span class="sub">UID:${p.uid}</span></div>
        <div class="lbl">道号</div><input class="inp" id="eName" value="${p.name}">
        <div class="lbl">境界序号(0-14) / 小层</div>
        <div class="grid g2">
          <input class="inp" id="eRealm" type="number" value="${p.realm || 0}">
          <input class="inp" id="eLayer" type="number" value="${p.layer || 0}">
        </div>
        <div class="lbl">灵石 / 仙玉</div>
        <div class="grid g2">
          <input class="inp" id="eStone" type="number" value="${p.stone || 0}">
          <input class="inp" id="eJade" type="number" value="${p.jade || 0}">
        </div>
        <div class="grid g2">
          <button class="btn p" id="btnESave">保存</button>
          <button class="btn c" id="btnEHeal">回满气血</button>
          <button class="btn" id="btnEBan">${p.ban ? '解封' : '封禁'}</button>
          <button class="btn d" id="btnEDel">删除存档</button>
        </div>
      </div>`;
      D('#btnESave').onclick = () => {
        p.name = D('#eName').value || p.name;
        p.realm = Math.max(0, Math.min(14, +D('#eRealm').value || 0));
        p.layer = Math.max(0, +D('#eLayer').value || 0);
        p.stone = Math.max(0, +D('#eStone').value || 0);
        p.jade = Math.max(0, +D('#eJade').value || 0);
        saveP(p); loadPlayers().then(() => render());
      };
      D('#btnEHeal').onclick = () => { p.hp = E.maxHp(p); p.mp = E.maxMp(p); saveP(p); };
      D('#btnEBan').onclick = () => { p.ban = !p.ban; saveP(p); render(); };
      D('#btnEDel').onclick = () => { if (confirm('确定删除【' + p.name + '】的存档？')) { toast('删除需手动在仓库操作', 'err'); } };
      DD('.pl-item').forEach((x) => x.classList.toggle('on', x.dataset.sel === uid));
    };
    const doSearch = () => {
      const k = (D('#plSearch').value || '').trim().toLowerCase();
      if (!k) return;
      const hit = PLIST.find((p) => (p.name || '').toLowerCase().includes(k) || (p.uid || '').includes(k));
      if (hit) { sel(hit.uid); toast('已选中【' + hit.name + '】', 'ok'); }
      else toast('未找到', 'err');
    };
    DD('[data-sel]').forEach((b) => b.onclick = () => sel(b.dataset.sel));
    const s = D('#btnPlSearch') || D('#btnPlSearch');
    if (D('#plSearch')) D('#plSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    const bs = document.getElementById('plBtnSearch');
    if (bs) bs.onclick = doSearch;
  },

  batch() {
    const mail = D('#btnSendMail');
    if (mail) mail.onclick = async () => {
      const t = D('#mTitle').value || '仙门通告';
      const b = D('#mBody').value || '';
      const stone = +D('#mStone').value || 0, jade = +D('#mJade').value || 0;
      const exp = +D('#mExp').value || 0, item = D('#mItem').value.trim();
      let n = 0;
      for (const p of PLIST) {
        p.mail = p.mail || [];
        p.mail.unshift({ title: t, body: b, stone, jade, exp, item, at: Date.now(), read: false });
        if (p.mail.length > 20) p.mail.length = 20;
        if (await Net.write(playerPath(p), p, '[admin] 邮件 ' + t)) n++;
        await new Promise((r) => setTimeout(r, 1200));
      }
      toast('已发送 ' + n + '/' + PLIST.length + ' 封', n ? 'ok' : 'err');
    };
    DD('[data-dbl]').forEach((b) => b.onclick = async () => {
      const k = b.dataset.dbl;
      const r = await Net.read('data/ss/config.json');
      const c = (r && r.data) || {};
      c.double = c.double || {};
      c.double[k] = !c.double[k];
      await Net.write('data/ss/config.json', c, '[admin] 双倍 ' + k);
      toast(k + ' 双倍：' + (c.double[k] ? '开启' : '关闭'), 'ok');
      render();
    });
    const u = D('#btnUnbanAll');
    if (u) u.onclick = async () => { let n = 0; for (const p of PLIST) if (p.ban) { p.ban = false; if (await Net.write(playerPath(p), p, '[admin] 解封')) n++; await new Promise(r => setTimeout(r, 1200)); } toast('解封 ' + n + ' 人', 'ok'); };
    const h = D('#btnHealAll');
    if (h) h.onclick = async () => { let n = 0; for (const p of PLIST) { p.hp = E.maxHp(p); p.mp = E.maxMp(p); if (await Net.write(playerPath(p), p, '[admin] 回满')) n++; await new Promise(r => setTimeout(r, 1200)); } toast('回满 ' + n + ' 人', 'ok'); };
    const c = D('#btnCleanInactive');
    if (c) c.onclick = () => toast('请手动清理（安全起见未开放批量删除）', 'err');
    const st = D('#dblState');
    if (st) Net.read('data/ss/config.json').then((r) => {
      const d = (r && r.data && r.data.double) || {};
      st.textContent = '当前：修为' + (d.exp ? '✔' : '✘') + ' 灵石' + (d.stone ? '✔' : '✘') + ' 掉落' + (d.drop ? '✔' : '✘');
    });
  },

  currency() {
    const l = D('#btnCurLoad') || document.getElementById('btnCurLoad');
    if (l) l.onclick = () => {
      const k = (D('#curUid').value || '').trim();
      CUR = PLIST.find((p) => p.uid === k || p.name === k);
      if (!CUR) return toast('未找到玩家', 'err');
      render();
    };
    const s = document.getElementById('btnCurSave');
    if (s) s.onclick = () => {
      CUR.stone = Math.max(0, +D('#cStone').value || 0);
      CUR.jade = Math.max(0, +D('#cJade').value || 0);
      saveP(CUR);
    };
    const m = document.getElementById('btnCurMax');
    if (m) m.onclick = () => { CUR.stone = 99990000; CUR.jade = 999900; saveP(CUR); render(); };
    const z = document.getElementById('btnCurZero');
    if (z) z.onclick = () => { CUR.stone = 0; CUR.jade = 0; saveP(CUR); render(); };
    const rs = document.getElementById('btnRealmSave');
    if (rs) rs.onclick = () => {
      CUR.realm = Math.max(0, Math.min(14, +D('#cRealm').value || 0));
      CUR.layer = Math.max(0, +D('#cLayer').value || 0);
      CUR.exp = 0; saveP(CUR);
    };
  },

  grant() {
    const l = document.getElementById('btnGLoad');
    if (l) l.onclick = () => {
      const k = (D('#gUid').value || '').trim();
      CUR = PLIST.find((p) => p.uid === k || p.name === k);
      if (!CUR) return toast('未找到玩家', 'err');
      render();
    };
    const draw = () => {
      const cat = D('#gCat').value;
      const kw = (D('#gSearch').value || '').trim();
      const cats = {
        '法宝': (CFG.core.skills || []).filter((x) => x.type === '法宝'),
        '功法': (CFG.core.skills || []).filter((x) => ['主修功法', '剑诀', '神识功法', '入门心法', '遁术', '神魂功法', '剑阵'].includes(x.type)),
        '丹药': (CFG.core.items || []).filter((x) => x.type === '丹药'),
        '装备': (CFG.core.skills || []).filter((x) => x.type === '装备'),
        '灵宠': (CFG.core.pets || []).filter((x) => ['灵宠', '灵虫'].includes(x.type)),
        '傀儡': (CFG.core.pets || []).filter((x) => x.type === '傀儡'),
        '伙伴': (CFG.core.partners || []).filter((x) => ['伙伴', '主角'].includes(x.type)),
        '称号': EX.titles,
      };
      let list = cats[cat] || [];
      if (kw) list = list.filter((x) => (x.name || x.n || '').includes(kw));
      const box = D('#gList');
      box.innerHTML = list.slice(0, 40).map((x) => {
        const nm = x.name || x.n;
        return `<div class="pl-item"><div class="pl-info"><div class="pl-nm">${nm} ${x.q ? `<span class="tag y">${x.q}</span>` : ''}</div>
          <div class="pl-sub">${x.eff || x.skill || x.cond || ''}</div></div>
          <button class="btn sm c" data-give="${nm}">发放</button></div>`;
      }).join('') || '<div class="empty">无匹配</div>';
      DD('[data-give]').forEach((b) => b.onclick = () => {
        const nm = b.dataset.give;
        const p = CUR;
        if (cat === '称号') { const t = EX.titles.find((x) => x.n === nm); (p.titles = p.titles || []).push(t.id); }
        else if (cat === '灵宠') { (p.pets = p.pets || []).push({ id: x_id(nm, CFG.core.pets), n: nm, lv: 1, type: '灵宠' }); }
        else if (cat === '傀儡') { (p.puppets = p.puppets || []).push({ id: x_id(nm, CFG.core.pets), n: nm, lv: 1, dur: 100 }); }
        else if (cat === '伙伴') { (p.partners = p.partners || []).push({ id: x_id(nm, CFG.core.partners), n: nm, q: 'SSR', star: 1 }); }
        else if (cat === '功法') { (p.skills = p.skills || []).push(x_id(nm, CFG.core.skills)); }
        else E.addItem(p, nm, 1);
        saveP(p);
      });
    };
    if (D('#gCat')) { D('#gCat').onchange = draw; D('#gSearch').oninput = draw; draw(); }
  },

  titles() {
    const l = document.getElementById('btnTLoad');
    if (l) l.onclick = () => {
      const k = (D('#tUid').value || '').trim();
      CUR = PLIST.find((p) => p.uid === k || p.name === k);
      if (!CUR) return toast('未找到玩家', 'err');
      render();
    };
    DD('[data-tt]').forEach((b) => b.onclick = () => {
      const id = b.dataset.tt, p = CUR;
      p.titles = p.titles || [];
      const i = p.titles.indexOf(id);
      if (i >= 0) { p.titles.splice(i, 1); if (p.titleCur === id) p.titleCur = p.titles[0] || null; }
      else { p.titles.push(id); if (!p.titleCur) p.titleCur = id; }
      saveP(p); render();
    });
  },

  config() {
    const s = document.getElementById('btnCfgSave');
    if (s) s.onclick = async () => {
      const c = {
        expRate: +D('#cfExpRate').value || 1,
        stoneRate: +D('#cfStoneRate').value || 1,
        breakRate: +D('#cfBreakRate').value || 0.55,
      };
      await Net.write('data/ss/config.json', c, '[admin] 数值配置');
      toast('已保存', 'ok');
    };
    const n = document.getElementById('btnNotice');
    if (n) n.onclick = async () => {
      const t = D('#cfNotice').value.trim();
      if (!t) return toast('请输入公告', 'err');
      await Net.write('data/ss/notice.json', { text: t, at: Date.now() }, '[admin] 公告');
      toast('公告已发布', 'ok');
    };
  },

  data() {
    const r = document.getElementById('btnRebuild');
    if (r) r.onclick = async () => {
      const list = PLIST.map((p) => ({ uid: p.uid, name: p.name, realm: CFG.realmName(p.realm || 0), power: E.power(p), at: Date.now() }))
        .sort((a, b) => b.power - a.power).slice(0, 100);
      await Net.write('data/ss/leaderboard.json', { list, at: Date.now() }, '[admin] 重建排行榜');
      toast('排行榜已重建（' + list.length + '人）', 'ok');
    };
    const b = document.getElementById('btnBackup');
    if (b) b.onclick = async () => {
      await Net.write('data/ss/backup_' + Date.now() + '.json', PLIST, '[admin] 备份');
      toast('已备份 ' + PLIST.length + ' 个存档', 'ok');
    };
    const c = document.getElementById('btnClearLb');
    if (c) c.onclick = async () => { await Net.write('data/ss/leaderboard.json', { list: [] }, '[admin] 清空排行榜'); toast('已清空', 'ok'); };
    const w = document.getElementById('btnWipe');
    if (w) w.onclick = () => toast('请手动删除仓库 data/ss/players/ 目录', 'err');
  },

  sys() {
    const r = document.getElementById('btnReNet');
    if (r) r.onclick = async () => { await Net.reset(); D('#atNet').textContent = Net.online ? '●' : '○'; D('#atNet').classList.toggle('off', !Net.online); render(); };

    const bd = D('#btnDiag');
    if (bd) bd.onclick = async () => {
      const box = D('#diagBox'); if (!box) return;
      box.innerHTML = '<div class="lbl">测试中…（每个端点最多 6 秒）</div>';
      const list = await Net.diagnose();
      const okN = list.filter((x) => x.ok).length;
      box.innerHTML = `
        <div class="lbl" style="margin-bottom:6px">${okN} / ${list.length} 个通道可用 ${okN ? '<span style="color:#7ae89a">（已自动切到最快的）</span>' : '<span style="color:#ff8fa4">（全部不通 → 必须配加速地址）</span>'}</div>
        ${list.map((x) => `<div class="kv">
          <span style="font-size:10px;word-break:break-all">${x.ep.replace('https://', '')}</span>
          <b style="font-size:10px;color:${x.ok ? '#7ae89a' : '#ff8fa4'}">${x.ok ? '✔' : '✘'} ${x.st} ${x.ms}ms</b>
        </div>`).join('')}`;
      await Net.reset();
      render();
    };

    const be = D('#btnSaveEps');
    if (be) be.onclick = () => {
      const v = (D('#sysEps').value || '').split('\n').map((x) => x.trim()).filter(Boolean);
      GH.extra = v;
      try { localStorage.setItem('ss_extra', JSON.stringify(v)); } catch (e) {}
      alert('已保存 ' + v.length + ' 个加速地址，正在重新检测…');
      Net.reset();
    };
    const f = document.getElementById('btnFlush');
    if (f) f.onclick = async () => { const n = await Net.flush(); toast('补传 ' + n + ' 条', 'ok'); };
    const l = document.getElementById('btnLogout');
    if (l) l.onclick = () => location.reload();
  },
};

function x_id(nm, arr) { const x = (arr || []).find((y) => (y.name || y.n) === nm); return x ? (x.id || nm) : nm; }
