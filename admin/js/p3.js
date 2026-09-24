/* =========================================================
 * p3.js —— 日志查询 / 服务器运维 / 权限管理 / 敏感风控
 * ========================================================= */

/* 全局错误捕获（服务器报错日志） */
window.addEventListener('error', (e) => {
  try {
    const b = JSON.parse(localStorage.getItem('zb_errlog') || '[]');
    b.unshift({ at: Date.now(), msg: String(e.message || ''), src: String(e.filename || ''),
      line: e.lineno || 0, stack: String((e.error && e.error.stack) || '').slice(0, 400) });
    if (b.length > 200) b.length = 200;
    localStorage.setItem('zb_errlog', JSON.stringify(b));
  } catch (err) {}
});
window.addEventListener('unhandledrejection', (e) => {
  try {
    const b = JSON.parse(localStorage.getItem('zb_errlog') || '[]');
    b.unshift({ at: Date.now(), msg: 'Promise: ' + String((e.reason && e.reason.message) || e.reason || ''),
      src: 'promise', line: 0, stack: '' });
    if (b.length > 200) b.length = 200;
    localStorage.setItem('zb_errlog', JSON.stringify(b));
  } catch (err) {}
});

/* =========================================================
 * 十、日志查询
 * ========================================================= */

/* 玩家操作日志 */
APP.pages['log-player'] = {
  g: '日志查询', n: '玩家操作', i: '🧾', perm: 'log.view',
  render() {
    const p = this.SEL;
    let rows = '';
    if (p) {
      const lg = p.logs || [];
      rows = lg.length ? lg.slice(0, 60).map((x) => `<div class="row">
        <div class="zav sm">${x.t === 'kill' ? '☠' : x.t === 'pick' ? '🎁' :
          x.t === 'gunup' ? '🔫' : x.t === 'chip' ? '🔲' : x.t === 'shop' ? '🏪' : '📌'}</div>
        <div class="rl"><b>${U.esc(x.d || x.t)}</b><span>${U.dt(x.at)}</span></div></div>`).join('')
        : '<div class="lbl">该玩家暂无操作日志（需在游戏端开启行为记录）</div>';
    } else {
      rows = '<div class="lbl">选择玩家查看其操作日志</div>';
    }
    /* 本机埋点 */
    const buf = window.OPS ? OPS.trackBuf() : [];
    return `<div class="ph"><h2>🧾 玩家操作日志</h2><span class="tagx">拾取/击杀/升级/合成/兑换</span></div>
      <div class="card"><div class="card-t">① 选择玩家</div>
        ${this.searchBar('lpKey')}
        <div class="plist">${this.view().slice(0, 16).map((x) => this.pcard(x)).join('') || '<div class="lbl">无</div>'}</div>
      </div>
      <div class="card"><div class="card-t">② 操作记录 ${p ? `<span class="sub">${U.esc(p.name)}</span>` : ''}</div>
        ${rows}
        ${p ? '<button class="btn d sm" id="lpClear">清空该玩家日志</button>' : ''}
      </div>
      <div class="card"><div class="card-t">本机埋点流水 <span class="sub">表37 · ${buf.length} 条</span></div>
        ${buf.slice(-15).reverse().map((x) => `<div class="row">
          <div class="zav sm">📊</div>
          <div class="rl"><b>${U.esc(x.n || x.ev)}</b><span>${U.esc(JSON.stringify(x.p || {}))} · ${U.ago(x.t)}</span></div>
          <span class="chipx">${x.pr}</span></div>`).join('') || '<div class="lbl">暂无</div>'}
        <div class="lbl">埋点存于各玩家浏览器本地；跨设备需在游戏端把关键行为写入存档 p.logs</div>
      </div>`;
  },
  bind() {
    this.bindSearch('lpKey'); this.bindSel();
    const c = D('#lpClear');
    if (c) c.onclick = async () => {
      const p = this.SEL; if (!p) return;
      p.logs = [];
      if (await this.save(p)) { this.toast('已清空', 'ok'); this.render(); }
    };
  },
};

/* GM 操作日志 */
APP.pages['log-gm'] = {
  g: '日志查询', n: 'GM 操作', i: '🛠️', perm: 'log.gm',
  render() {
    const l = AUDIT.list();
    const kw = this.gmKw || '';
    const list = kw ? l.filter((x) => (x.act + x.target + x.detail).indexOf(kw) >= 0) : l;
    const cloud = DB.cache[DBP.gmlog] || { list: [] };
    let pending = []; try { pending = JSON.parse(localStorage.getItem('zb_gm_buf') || '[]'); } catch (e) { pending = []; }
    return `<div class="ph"><h2>🛠️ GM 操作日志</h2><span class="tagx">${l.length} 条本地 / ${(cloud.list || []).length} 条云端</span></div>
      <div class="card"><div class="card-t">操作记录 <span class="sub">不可删除，审计用</span></div>
        <div class="sb"><input id="lgKey" placeholder="搜索操作/目标" value="${U.esc(kw)}"></div>
        <div style="overflow-x:auto"><table class="tb"><thead><tr>
          <th>时间</th><th>操作类型</th><th>目标 UID</th><th>详情</th></tr></thead>
        <tbody>${list.slice(0, 80).map((x) => `<tr>
          <td style="font-size:10px">${U.dt(x.at)}</td>
          <td>${U.esc(x.act)}</td>
          <td style="font-size:10px">${U.esc(x.target)}</td>
          <td style="font-size:10px">${U.esc(x.detail)}</td></tr>`).join('')
          || '<tr><td colspan="4"><div class="lbl">暂无记录</div></td></tr>'}</tbody></table></div>
      </div>
      <div class="card"><div class="card-t">云端同步 <span class="sub">待上传 ${pending.length} 条</span></div>
        <button class="btn blk" id="lgUp">☁️ 上传本地日志到云端</button>
        <button class="btn n blk" id="lgDl">📥 导出审计报告</button>
        <button class="btn d blk" id="lgClr">🗑 清空本地记录</button>
      </div>
      <div class="card"><div class="card-t">云端日志（最近 15 条）</div>
        ${(cloud.list || []).slice(0, 15).map((x) => `<div class="row">
          <div class="zav sm">🛠️</div>
          <div class="rl"><b>${U.esc(x.act)}</b><span>${U.esc(x.target)} · ${U.dt(x.at)}</span></div></div>`).join('')
          || '<div class="lbl">暂无云端日志</div>'}
      </div>`;
  },
  bind() {
    const k = D('#lgKey');
    if (k) k.oninput = () => { this.gmKw = k.value; this.render(); };
    const u = D('#lgUp'); if (u) u.onclick = () => AUDIT.syncCloud().then(() => this.render());
    const d = D('#lgDl'); if (d) d.onclick = () => AUDIT.export();
    const c = D('#lgClr'); if (c) c.onclick = () => { AUDIT.clear(); this.render(); };
  },
};

/* 服务器报错日志 */
APP.pages['log-err'] = {
  g: '日志查询', n: '报错日志', i: '🐛', perm: 'log.view',
  render() {
    let l = [];
    try { l = JSON.parse(localStorage.getItem('zb_errlog') || '[]'); } catch (e) {}
    const lv = this.errLv || 'ALL';
    const list = lv === 'ALL' ? l : l.filter((x) => (lv === 'ERROR' ? true : false));
    return `<div class="ph"><h2>🐛 服务器报错日志</h2><span class="tagx">${l.length} 条</span></div>
      <div class="card"><div class="card-t">日志级别</div>
        <select id="leLv" style="width:150px">
          <option value="ALL"${lv === 'ALL' ? ' selected' : ''}>全部</option>
          <option value="ERROR"${lv === 'ERROR' ? ' selected' : ''}>ERROR</option>
        </select>
        <button class="btn n sm" id="leClr" style="margin-left:8px">清空</button>
      </div>
      <div class="card"><div class="card-t">异常记录 <span class="sub">前端运行时捕获</span></div>
        ${list.slice(0, 40).map((x) => `<div class="row">
          <div class="zav sm" style="background:linear-gradient(150deg,#ff5f6d,#a02030)">!</div>
          <div class="rl"><b>${U.esc(x.msg || '未知错误')}</b>
            <span>${U.esc(x.src)}:${x.line} · ${U.dt(x.at)}</span></div></div>
          ${x.stack ? `<pre class="json" style="margin-top:4px;font-size:9px">${U.esc(x.stack.slice(0, 300))}</pre>` : ''}`).join('')
          || '<div class="lbl">暂无异常记录</div>'}
      </div>
      <div class="card"><div class="lbl">⚠ 单机架构无服务端，此处捕获的是后台/游戏前端运行时异常。
        真实服务端报错需接入日志服务。</div></div>`;
  },
  bind() {
    const s = D('#leLv');
    if (s) s.onchange = () => { this.errLv = s.value; this.render(); };
    const c = D('#leClr');
    if (c) c.onclick = () => { localStorage.removeItem('zb_errlog'); this.toast('已清空', 'ok'); this.render(); };
  },
};

/* =========================================================
 * 十一、服务器运维
 * ========================================================= */

/* 服务器启停 */
APP.pages['ops-server'] = {
  g: '服务器运维', n: '启停维护', i: '🖥️', perm: 'server.control',
  render() {
    const sv = DB.cache[DBP.server] || { mode: '开放', msg: '', until: 0 };
    return `<div class="ph"><h2>🖥️ 服务器启停</h2><span class="tagx">${U.esc(sv.mode || '开放')}</span></div>
      <div class="card"><div class="card-t">维护模式</div>
        <div class="kv"><span>当前状态</span><b class="${sv.mode === '开放' ? 'g' : 'r'}">${U.esc(sv.mode || '开放')}</b></div>
        <div class="fld"><label>模式</label><select id="osMode">
          <option${sv.mode === '开放' ? ' selected' : ''}>开放</option>
          <option${sv.mode === '维护' ? ' selected' : ''}>维护</option></select></div>
        <div class="fld"><label>维护公告</label><input id="osMsg" value="${U.esc(sv.msg || '')}" placeholder="服务器维护中，预计XX分钟后开放"></div>
        <div class="fld"><label>预计维护时长(分钟)</label><input id="osMin" type="number" value="30"></div>
        <button class="btn o blk" id="osGo">💾 保存并生效</button>
        <div class="lbl">维护模式下，游戏端会显示公告并阻止进入战斗（需游戏端读取 server.json）</div>
      </div>
      <div class="card"><div class="card-t">连接状态</div>
        <div class="kv"><span>云端</span><b class="${Net.online ? 'g' : 'r'}">${Net.online ? '已连接' : '离线'}</b></div>
        <div class="kv"><span>端点</span><b style="font-size:10px">${U.esc((Net.endpoint || '').replace('https://', ''))}</b></div>
        <button class="btn n blk" id="osRe">🔄 重新检测</button>
        <button class="btn n blk" id="osDiag">🔍 逐端点诊断</button>
        <div id="osDiagBox"><div class="lbl">点「逐端点诊断」测试全部通道</div></div>
      </div>`;
  },
  bind() {
    const go = D('#osGo');
    if (go) go.onclick = async () => {
      const db = await DB.get(DBP.server, {});
      db.mode = this.val('#osMode'); db.msg = this.val('#osMsg');
      db.until = Date.now() + this.num('#osMin') * 6e4;
      if (await DB.set(DBP.server, db, '设置维护模式')) {
        AUDIT.log('设置维护模式', db.mode, db.msg);
        this.toast('已保存', 'ok'); this.render();
      }
    };
    const re = D('#osRe');
    if (re) re.onclick = async () => { await Net.init(); this.net(); this.render(); this.toast(Net.online ? '已连接' : '仍离线', Net.online ? 'ok' : 'err'); };
    const dg = D('#osDiag');
    if (dg) dg.onclick = async () => {
      const box = D('#osDiagBox'); if (!box) return;
      box.innerHTML = '<div class="lbl">测试中…</div>';
      const eps = [].concat((GH && GH.endpoints) || [], (GH && GH.extra) || []);
      const uniq = Array.from(new Set(eps.filter(Boolean))).slice(0, 20);
      const out = [];
      for (const e of uniq) {
        const t0 = Date.now(); let ok = false, st = '';
        try {
          const r = await fetch(e.replace(/\/$/, '') + '/rate_limit');
          st = 'HTTP ' + r.status;
          ok = [200, 401, 403, 404].indexOf(r.status) >= 0;
        } catch (err) { st = '失败'; }
        out.push({ e, ok, st, ms: Date.now() - t0 });
      }
      box.innerHTML = out.map((o) => `<div class="row">
        <div class="zav sm">${o.ok ? '✔' : '✘'}</div>
        <div class="rl"><b style="font-size:10px">${U.esc(o.e.replace('https://', '').slice(0, 40))}</b>
          <span>${o.st} · ${o.ms}ms</span></div></div>`).join('') || '<div class="lbl">无端点</div>';
    };
  },
};

/* 分服合服 */
APP.pages['ops-merge'] = {
  g: '服务器运维', n: '分服合服', i: '🔀', perm: 'server.merge',
  render() {
    const sv = {};
    this.PLIST.forEach((p) => { const s = (p.ext && p.ext.server) || 'S1'; sv[s] = (sv[s] || 0) + 1; });
    const keys = Object.keys(sv);
    return `<div class="ph"><h2>🔀 分服合服管理</h2><span class="tagx">${keys.length} 个服</span></div>
      <div class="card"><div class="card-t">当前分服</div>
        ${keys.map((s) => `<div class="kv"><span>${U.esc(s)}</span><b>${sv[s]} 人</b></div>`).join('')
          || '<div class="lbl">全部玩家默认在 S1</div>'}
      </div>
      <div class="card"><div class="card-t">执行合服</div>
        <div class="f2">
          <div class="fld"><label>源服</label><select id="omFrom">${keys.map((s) => `<option>${U.esc(s)}</option>`).join('')}</select></div>
          <div class="fld"><label>目标服</label><select id="omTo">${keys.map((s) => `<option>${U.esc(s)}</option>`).join('')}</select></div>
        </div>
        <div class="fld"><label>合服时间(小时,0=立即)</label><input id="omT" type="number" value="0"></div>
        <div class="kv"><span>冲突昵称自动重命名</span><b><input type="checkbox" id="omRen" checked></b></div>
        <button class="btn o blk" id="omGo">🔀 执行合服</button>
        <div class="lbl">合服会把源服玩家的 ext.server 改为目标服；昵称冲突时自动加后缀</div>
      </div>
      <div class="card"><div class="card-t">合服奖励</div>
        <div class="f2">
          <div class="fld"><label>物品</label>${U.picker('omItem', 'gold')}</div>
          <div class="fld"><label>数量</label><input id="omN" type="number" value="500"></div>
        </div>
        <button class="btn blk" id="omRw">🎁 发放合服奖励</button>
      </div>`;
  },
  bind() {
    const go = D('#omGo');
    if (go) go.onclick = async () => {
      const f = this.val('#omFrom'), t = this.val('#omTo');
      if (f === t) return this.toast('源服与目标服相同', 'err');
      const hit = this.PLIST.filter((p) => ((p.ext && p.ext.server) || 'S1') === f);
      if (!hit.length) return this.toast('源服无玩家', 'err');
      if (!confirm('确定把 ' + f + '（' + hit.length + '人）合入 ' + t + '？')) return;
      /* 合服时间：此前 omT 输入框填了完全不读 —— 无论填几小时都立即执行。
       * 现在 0=立即；>0 则登记为定时任务，到点后自动执行（打开后台时检查）。 */
      const delayH = Math.max(0, this.num('#omT'));
      if (delayH > 0) {
        const cfg = await DB.get(DBP.server, {});
        cfg.merge = cfg.merge || [];
        cfg.merge.push({ from: f, to: t, at: Date.now() + delayH * 3600e3, ren: !!(D('#omRen') && D('#omRen').checked), n: hit.length });
        if (await DB.set(DBP.server, cfg, '计划合服 ' + f + '→' + t)) {
          AUDIT.log('计划合服', f + '→' + t, delayH + '小时后执行，' + hit.length + '人');
          this.toast('已计划：' + delayH + ' 小时后自动合服（到点打开后台即执行）', 'ok');
          this.render();
        }
        return;
      }
      let n = 0;
      for (const p of hit) {
        p.ext = p.ext || {}; p.ext.server = t;
        if (D('#omRen').checked) {
          const dup = this.PLIST.some((x) => x.uid !== p.uid && x.name === p.name
            && ((x.ext && x.ext.server) || 'S1') === t);
          if (dup) p.name = p.name + '_' + f;
        }
        if (await this.save(p)) n++;
      }
      AUDIT.log('合服', f + '→' + t, n + '人');
      this.toast('已合服 ' + n + ' 人', 'ok');
      await this.loadPlayers({ force: true }); this.render();
    };
    const rw = D('#omRw');
    if (rw) rw.onclick = async () => {
      const id = this.val('#omItem'), n = this.num('#omN');
      if (!confirm('给全部 ' + this.PLIST.length + ' 名玩家发放合服奖励？')) return;
      let ok = 0;
      for (const p of this.PLIST) { this.grant(p, id, n); if (await this.save(p)) ok++; }
      AUDIT.log('发放合服奖励', ok + '人', U.itemName(id) + '×' + n);
      this.toast('已发放 ' + ok + ' 人', 'ok');
    };
  },
};

/* 数据库备份 */
/* 自动备份：单机架构无 cron，改为"每次打开后台时按周期检查并补做" */
APP.BK_AUTO = 24;
APP.BK_LAST = 0;
/* 到点自动执行已计划的合服 */
APP.runDueMerge = async function () {
  try {
    const cfg = await DB.get(DBP.server, {});
    if (!cfg.merge || !cfg.merge.length) return;
    const now = Date.now();
    const due = (cfg.merge || []).filter((m) => (m.at || 0) <= now);
    const keep = (cfg.merge || []).filter((m) => (m.at || 0) > now);
    if (!due.length) { cfg.merge = keep; return; }
    for (const m of due) {
      const hit = (this.PLIST || []).filter((p) => ((p.ext && p.ext.server) || 'S1') === m.from);
      let n = 0;
      for (const p of hit) {
        p.ext = p.ext || {}; p.ext.server = m.to;
        if (m.ren) {
          const dup = (this.PLIST || []).some((x) => x.uid !== p.uid && x.name === p.name
            && ((x.ext && x.ext.server) || 'S1') === m.to);
          if (dup) p.name = p.name + '_' + m.from;
        }
        if (await this.save(p)) n++;
      }
      AUDIT.log('自动合服', m.from + '→' + m.to, n + '人');
    }
    cfg.merge = keep;
    await DB.set(DBP.server, cfg, '清理已完成合服计划');
    await this.loadPlayers({ force: true });
  } catch (e) {}
};
APP.autoBackupIfDue = async function (after) {
  try {
    const cfg = await DB.get(DBP.server, {});
    const h = Number(cfg.bkAuto != null ? cfg.bkAuto : APP.BK_AUTO) || 0;
    APP.BK_AUTO = h;
    APP.BK_LAST = Number(cfg.bkLast || 0);
    if (!h) return;                       // 0 = 关闭
    if (!APP.BK_LAST) return;             // 无任何备份记录时不做（避免一进来就写）
    if (Date.now() - APP.BK_LAST < h * 3600e3) return;   // 未到期
    /* 到期 → 自动备份一次 */
    const name = 'backup_auto_' + Date.now();
    const ok = await DB.set('data/zb/' + name + '.json',
      { n: (this.PLIST || []).length, at: Date.now(), list: this.PLIST }, '自动备份（周期' + h + 'h）');
    if (ok) {
      cfg.bkLast = Date.now();
      await DB.set(DBP.server, cfg, '更新备份时间');
      APP.BK_LAST = cfg.bkLast;
      AUDIT.log('自动备份', name, (this.PLIST || []).length + '份');
      if (after) after();
    }
  } catch (e) {}
};

APP.pages['ops-backup'] = {
  g: '服务器运维', n: '数据备份', i: '💾', perm: 'backup.manage',
  render() {
    const snaps = this.snaps || [];
    return `<div class="ph"><h2>💾 数据库备份</h2><span class="tagx">${this.PLIST.length} 份存档</span></div>
      <div class="card"><div class="card-t">手动备份</div>
        <div class="fld"><label>快照名称</label><input id="obName" value="backup_${new Date().toISOString().slice(0, 10)}"></div>
        <div class="kv"><span>包含存档数</span><b>${this.PLIST.length}</b></div>
        <button class="btn g blk" id="obGo">📦 立即备份</button>
        <button class="btn n blk" id="obScan">🔍 扫描已有快照</button>
      </div>
      <div class="card"><div class="card-t">备份快照 <span class="sub">${snaps.length} 个</span></div>
        ${snaps.map((s) => `<div class="row"><div class="zav sm">📦</div>
          <div class="rl"><b>${U.esc(s.name)}</b><span>${U.dt(s.at)} · ${s.n} 份</span></div>
          <button class="btn n sm" data-obdl="${U.esc(s.name)}">下载</button>
          <button class="btn d sm" data-obdel="${U.esc(s.name)}">删除</button></div>`).join('')
          || '<div class="lbl">点「扫描已有快照」读取</div>'}
      </div>
      <div class="card"><div class="card-t">自动备份周期</div>
        <div class="fld"><label>周期(小时,0=关闭)</label><input id="obAuto" type="number" value="${APP.BK_AUTO}"></div>
        <button class="btn n sm" id="obAutoSave">💾 保存</button>
        <div class="lbl">保存后，每次打开后台会自动检查：距上次备份超过该周期即自动备份一次（无需外部 cron）。上一次备份：${APP.BK_LAST ? U.dt(APP.BK_LAST) : '无记录'}</div>
      </div>`;
  },
  bind() {
    const scan = async () => {
      let files = [];
      try { files = await Net.list('data/zb'); } catch (e) {}
      const bks = (files || []).filter((x) => x.indexOf('backup') >= 0);
      const out = [];
      for (const f of bks.slice(0, 12)) {
        try {
          const r = await Net.read('data/zb/' + f);
          if (r && r.data) out.push({ name: f, at: r.data.at, n: (r.data.list || []).length, data: r.data });
        } catch (e) {}
      }
      APP.snaps = out; this.render();
    };
    const go = D('#obGo');
    if (go) go.onclick = async () => {
      const name = (this.val('#obName') || ('backup_' + Date.now())).trim();
      const path = 'data/zb/' + (name.endsWith('.json') ? name : name + '.json');
      const ok = await DB.set(path, { n: this.PLIST.length, at: Date.now(), list: this.PLIST }, '全量备份');
      if (ok) {
        AUDIT.log('数据备份', name, this.PLIST.length + '份');
        try { const c = await DB.get(DBP.server, {}); c.bkLast = Date.now(); await DB.set(DBP.server, c, '更新备份时间'); APP.BK_LAST = c.bkLast; } catch (e) {}
        this.toast('已备份', 'ok'); scan();
      }
    };
    const sc = D('#obScan'); if (sc) sc.onclick = scan;
    /* 自动备份周期：此前 obAuto 只是个摆设输入框，填了既不保存也不生效。
     * 现在保存周期，并在每次进入本页时自动检查是否需要备份。 */
    const sv = D('#obAutoSave');
    if (sv) sv.onclick = async () => {
      const h = Math.max(0, this.num('#obAuto'));
      const cfg = await DB.get(DBP.server, {});
      cfg.bkAuto = h;
      if (await DB.set(DBP.server, cfg, '设置自动备份周期 ' + h + ' 小时')) {
        APP.BK_AUTO = h;
        AUDIT.log('设置自动备份周期', h + '小时', '');
        this.toast(h ? ('已保存：每 ' + h + ' 小时自动备份') : '已关闭自动备份', 'ok');
        this.render();
      }
    };
    /* 自动检查：距上次备份超过周期则自动备份（天然实现"定时"，不依赖外部 cron） */
    this.autoBackupIfDue(scan);
    DA('#body [data-obdl]').forEach((b) => { b.onclick = () => {
      const s = (APP.snaps || []).find((x) => x.name === b.dataset.obdl);
      if (!s) return;
      const blob = new Blob([JSON.stringify(s.data, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = s.name; a.click();
      this.toast('已下载', 'ok');
    }; });
    DA('#body [data-obdel]').forEach((b) => { b.onclick = async () => {
      if (!confirm('删除快照 ' + b.dataset.obdel + '？')) return;
      try { await Net.del('data/zb/' + b.dataset.obdel); } catch (e) {}
      this.toast('已删除', 'ok'); scan();
    }; });
  },
};

/* =========================================================
 * 十二、权限管理
 * ========================================================= */

/* 后台账号 */
APP.pages['perm-account'] = {
  g: '权限管理', n: '后台账号', i: '👤', perm: 'perm.manage',
  render() {
    const db = DB.cache[DBP.accounts] || { list: [] };
    const l = db.list || [];
    return `<div class="ph"><h2>👤 后台账号管理</h2><span class="tagx">${l.length} 个</span></div>
      <div class="card"><div class="card-t">新建账号</div>
        <div class="f2">
          <div class="fld"><label>账号</label><input id="paAcc" placeholder="登录账号"></div>
          <div class="fld"><label>姓名</label><input id="paName" placeholder="操作员姓名"></div>
        </div>
        <div class="f2">
          <div class="fld"><label>邮箱</label><input id="paMail" placeholder="email"></div>
          <div class="fld"><label>角色组</label><select id="paRole">
            ${Object.keys(PERM.ROLES).map((r) => `<option value="${r}">${PERM.ROLES[r].n}</option>`).join('')}</select></div>
        </div>
        <button class="btn blk" id="paGo">➕ 创建账号</button>
      </div>
      <div class="card"><div class="card-t">账号列表</div>
        ${l.map((a) => `<div class="row"><div class="zav sm">👤</div>
          <div class="rl"><b>${U.esc(a.acc)}</b><span>${U.esc(a.name)} · ${U.esc(a.mail || '')} · ${U.esc(PERM.ROLES[a.role] ? PERM.ROLES[a.role].n : a.role)}</span></div>
          <span class="chipx ${a.on === false ? '' : 'g'}">${a.on === false ? '禁用' : '启用'}</span>
          <button class="btn n sm" data-patog="${U.esc(a.acc)}">${a.on === false ? '启用' : '禁用'}</button></div>`).join('')
          || '<div class="lbl">暂无账号（当前使用统一口令登录）</div>'}
      </div>
      <div class="card"><div class="lbl">⚠ 当前后台为单口令模式，账号体系为配置记录，
        用于权限分组与审计归属；如要真实多用户登录需接入鉴权服务。</div></div>`;
  },
  bind() {
    const go = D('#paGo');
    if (go) go.onclick = async () => {
      const acc = this.val('#paAcc').trim();
      if (!acc) return this.toast('请填账号', 'err');
      const db = await DB.get(DBP.accounts, { list: [] });
      db.list = db.list || [];
      db.list.unshift({ acc: acc, name: this.val('#paName'), mail: this.val('#paMail'),
        role: this.val('#paRole'), on: true, at: Date.now() });
      if (await DB.set(DBP.accounts, db, '创建后台账号')) { this.toast('已创建', 'ok'); this.render(); }
    };
    DA('#body [data-patog]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.accounts, { list: [] });
      const a = (db.list || []).find((x) => x.acc === b.dataset.patog);
      if (a) a.on = a.on === false;
      await DB.set(DBP.accounts, db, '切换账号状态'); this.toast('已切换', 'ok'); this.render();
    }; });
  },
};

/* 角色权限 */
APP.pages['perm-role'] = {
  g: '权限管理', n: '角色权限', i: '🔑', perm: 'perm.manage',
  render() {
    const db = DB.cache[DBP.roles] || {};
    const custom = db.map || {};
    const all = Object.keys(APP.pages).map((k) => ({ k: k, n: APP.pages[k].n, g: APP.pages[k].g }));
    const groups = {};
    all.forEach((a) => { (groups[a.g] = groups[a.g] || []).push(a); });
    return `<div class="ph"><h2>🔑 角色权限分组</h2><span class="tagx">最小权限原则</span></div>
      <div class="card"><div class="card-t">当前角色 <span class="sub">${PERM.ROLES[PERM.curRole()].n}</span></div>
        <select id="prCur" style="width:200px">
          ${Object.keys(PERM.ROLES).map((r) => `<option value="${r}"${PERM.curRole() === r ? ' selected' : ''}>${PERM.ROLES[r].n}</option>`).join('')}
        </select>
        <div class="lbl">切换角色后左侧菜单会按权限显隐</div>
      </div>
      ${Object.keys(PERM.ROLES).map((r) => {
        const def = PERM.ROLES[r];
        const has = (custom[r] || def.p || []);
        return `<div class="card"><div class="card-t">${U.esc(def.n)} <span class="sub">${r}</span></div>
          ${Object.keys(groups).map((g) => `<div style="margin-bottom:6px">
            <div class="lbl" style="text-align:left;color:var(--yel);font-weight:700">${U.esc(g)}</div>
            <div>${groups[g].map((a) => {
              const on = has.indexOf('all') >= 0 || has.some((x) => x === a.k || (x.endsWith('.*') && a.k.indexOf(x.slice(0, -1)) === 0));
              return `<span class="chipx ${on ? 'g' : ''}" style="margin:2px">${on ? '✔' : '✘'} ${U.esc(a.n)}</span>`;
            }).join('')}</div></div>`).join('')}
        </div>`;
      }).join('')}
      <div class="card"><div class="lbl">权限按模块键（如 account.ban / mail.*）匹配，
        超级管理员拥有 all。修改权限分组需编辑 PERM.ROLES 后重新部署。</div></div>`;
  },
  bind() {
    const s = D('#prCur');
    if (s) s.onchange = () => { PERM.setRole(s.value); this.toast('已切换：' + PERM.ROLES[s.value].n, 'ok'); this.render(); };
  },
};

/* 操作审计 */
APP.pages['perm-audit'] = {
  g: '权限管理', n: '操作审计', i: '📜', perm: 'perm.audit',
  render() {
    const l = AUDIT.list();
    const kw = this.auKw || '';
    const list = kw ? l.filter((x) => (x.act + x.target + x.detail).indexOf(kw) >= 0) : l;
    return `<div class="ph"><h2>📜 操作审计</h2><span class="tagx">${l.length} 条 · 不可删除</span></div>
      <div class="card"><div class="card-t">筛选</div>
        <div class="sb"><input id="auKey" placeholder="按操作人/操作/目标筛选" value="${U.esc(kw)}"></div>
        <button class="btn n blk" id="auExp">📤 导出审计报告</button>
        <button class="btn blk" id="auUp">☁️ 同步到云端</button>
      </div>
      <div class="card"><div class="card-t">审计记录</div>
        <div style="overflow-x:auto"><table class="tb"><thead><tr>
          <th>时间</th><th>操作人</th><th>操作类型</th><th>目标</th><th>详情</th></tr></thead>
        <tbody>${list.slice(0, 100).map((x) => `<tr>
          <td style="font-size:10px">${U.dt(x.at)}</td>
          <td>${U.esc(x.who || '')}</td><td>${U.esc(x.act)}</td>
          <td style="font-size:10px">${U.esc(x.target)}</td>
          <td style="font-size:10px">${U.esc(x.detail)}</td></tr>`).join('')
          || '<tr><td colspan="5"><div class="lbl">暂无记录</div></td></tr>'}</tbody></table></div>
      </div>`;
  },
  bind() {
    const k = D('#auKey');
    if (k) k.oninput = () => { this.auKw = k.value; this.render(); };
    const e = D('#auExp'); if (e) e.onclick = () => AUDIT.export();
    const u = D('#auUp'); if (u) u.onclick = () => AUDIT.syncCloud().then(() => this.render());
  },
};

/* =========================================================
 * 十三、敏感风控
 * ========================================================= */

/* 外挂监控 */
APP.pages['risk-cheat'] = {
  g: '敏感风控', n: '外挂监控', i: '🕵️', perm: 'risk.cheat',
  render() {
    const rule = this.riskRule || { kps: 12, dmg: 50000, mat: 999999 };
    const hits = [];
    this.PLIST.forEach((p) => {
      const st = p.stats || {};
      const kills = st.kills || 0;
      const days = Math.max(1, Math.round((Date.now() - (p.created || Date.now())) / 864e5));
      const kpd = kills / days;
      const matTotal = Object.keys(p.mat || {}).reduce((s, k) => s + (p.mat[k] || 0), 0);
      const why = [];
      if (kpd > rule.kps * 100) why.push('日均击杀异常 ' + Math.round(kpd));
      if (U.pw(p) > rule.dmg) why.push('战力异常 ' + U.fmt(U.pw(p)));
      if (matTotal > rule.mat) why.push('材料异常 ' + U.fmt(matTotal));
      if (why.length) hits.push({ p: p, why: why });
    });
    return `<div class="ph"><h2>🕵️ 外挂监控面板</h2><span class="tagx">异常 ${hits.length} 人</span></div>
      <div class="card"><div class="card-t">检测规则</div>
        <div class="f3">
          <div class="fld"><label>日均击杀上限</label><input id="rcK" type="number" value="${rule.kps * 100}"></div>
          <div class="fld"><label>战力上限</label><input id="rcD" type="number" value="${rule.dmg}"></div>
          <div class="fld"><label>材料总量上限</label><input id="rcM" type="number" value="${rule.mat}"></div>
        </div>
        <button class="btn n blk" id="rcGo">🔍 重新扫描</button>
      </div>
      <div class="card"><div class="card-t">预警玩家 <span class="sub">${hits.length} 人</span></div>
        ${hits.map((h) => `<div class="row"><div class="zav sm">⚠</div>
          <div class="rl"><b>${U.esc(h.p.name)}</b><span>${h.why.join(' · ')}</span></div>
          <button class="btn d sm" data-rcban="${U.esc(h.p.uid)}">一键封禁</button>
          <button class="btn n sm" data-rcsel="${U.esc(h.p.uid)}">查看</button></div>`).join('')
          || '<div class="lbl">✅ 未检测到异常玩家</div>'}
      </div>`;
  },
  bind() {
    const go = D('#rcGo');
    if (go) go.onclick = () => {
      this.riskRule = { kps: this.num('#rcK') / 100, dmg: this.num('#rcD'), mat: this.num('#rcM') };
      this.toast('已重新扫描', 'ok'); this.render();
    };
    DA('#body [data-rcban]').forEach((b) => { b.onclick = async () => {
      const p = this.PLIST.find((x) => x.uid === b.dataset.rcban);
      if (!p) return;
      /* 与封禁管理页共用 setBan：账号文件也要写，否则玩家照样能登录 */
      const r = await this.setBan(p, true, { until: 0, type: '永久', reason: '外挂监控自动封禁', op: '风控' });
      AUDIT.log('风控封禁', p.uid, '外挂监控');
      this.toast(r.acctOk ? '已封禁 ' + p.name + '（账号已锁定）'
        : '已标记 ' + p.name + '，但账号记录未同步：' + (r.acctMsg || '未知'), r.acctOk ? 'ok' : 'err');
      this.render();
    }; });
    DA('#body [data-rcsel]').forEach((b) => { b.onclick = () => {
      this.SEL = this.PLIST.find((x) => x.uid === b.dataset.rcsel) || null;
      this.go('acc-asset');
    }; });
  },
};

/* 充值订单校验 */
APP.pages['risk-order'] = {
  g: '敏感风控', n: '订单校验', i: '🧾', perm: 'risk.order',
  render() {
    const db = DB.cache[DBP.order] || { list: [] };
    const l = db.list || [];
    const bad = l.filter((o) => o.status === '失败');
    const pend = l.filter((o) => o.status === '待发货');
    return `<div class="ph"><h2>🧾 充值订单校验</h2><span class="tagx">${l.length} 笔</span></div>
      <div class="stats">
        <div class="st"><b>${l.length}</b><span>总订单</span></div>
        <div class="st"><b>${pend.length}</b><span>待发货</span></div>
        <div class="st"><b>${bad.length}</b><span>失败/异常</span></div>
      </div>
      <div class="card"><div class="card-t">订单列表 <span class="sub">可对账标记</span></div>
        ${l.slice(0, 40).map((o) => `<div class="row"><div class="zav sm">💳</div>
          <div class="rl"><b>${U.esc(o.no)}</b>
            <span>${U.esc(o.uid)} · ${U.esc(o.ch || '')} · ${U.dt(o.at)}${o.checked ? ' · 已对账' : ''}</span></div>
          <span class="chipx ${o.status === '已发放' ? 'g' : o.status === '失败' ? '' : 'y'}">${U.esc(o.status)}</span>
          <b class="y">¥${o.amt}</b>
          ${o.checked ? '' : `<button class="btn n sm" data-ock="${U.esc(o.no)}">对账</button>`}</div>`).join('')
          || '<div class="lbl">暂无订单（可在「付费统计」手工录入）</div>'}
      </div>
      <div class="card"><div class="lbl">⚠ 单机架构无支付回调，无法自动核对真实充值。
        此处订单为手工录入，用于订单管理与对账演示。</div></div>`;
  },
  bind() {
    DA('#body [data-ock]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.order, { list: [] });
      const o = (db.list || []).find((x) => x.no === b.dataset.ock);
      if (o) { o.checked = true; o.checkedAt = Date.now(); }
      if (await DB.set(DBP.order, db, '订单对账')) { AUDIT.log('订单对账', b.dataset.ock, ''); this.toast('已标记对账', 'ok'); this.render(); }
    }; });
  },
};

/* 防刷监控 */
APP.pages['risk-brush'] = {
  g: '敏感风控', n: '防刷监控', i: '🛡️', perm: 'risk.brush',
  render() {
    const db = DB.cache[DBP.risk] || { blackIp: [], blackDev: [] };
    const ip = db.blackIp || [], dev = db.blackDev || [];
    /* 按注册时间聚合（近24小时新增） */
    const now = Date.now();
    const recent = {};
    this.PLIST.forEach((p) => {
      if (now - (p.created || 0) < 864e5) {
        const k = (p.ext && p.ext.ip) || '未知IP';
        recent[k] = (recent[k] || 0) + 1;
      }
    });
    const suspects = Object.keys(recent).filter((k) => recent[k] >= 3);
    return `<div class="ph"><h2>🛡️ 防刷监控</h2><span class="tagx">批量小号识别</span></div>
      <div class="stats">
        <div class="st"><b>${Object.keys(recent).length}</b><span>24h IP 分组</span></div>
        <div class="st"><b>${suspects.length}</b><span>可疑分组</span></div>
        <div class="st"><b>${ip.length}</b><span>黑名单 IP</span></div>
        <div class="st"><b>${dev.length}</b><span>黑名单设备</span></div>
      </div>
      <div class="card"><div class="card-t">可疑 IP 分组 <span class="sub">24h 内注册 ≥3</span></div>
        ${suspects.map((k) => `<div class="row"><div class="zav sm">🌐</div>
          <div class="rl"><b>${U.esc(k)}</b><span>24小时内注册 ${recent[k]} 个账号</span></div>
          <button class="btn d sm" data-bkip="${U.esc(k)}">拉黑 IP</button></div>`).join('')
          || '<div class="lbl">✅ 无可疑分组（或玩家未记录 IP，可在「玩家查询 → 账号资料」补录）</div>'}
      </div>
      <div class="card"><div class="card-t">黑名单管理</div>
        <div class="f2">
          <div class="fld"><label>IP</label><input id="rbIp" placeholder="输入 IP"></div>
          <div class="fld"><label>设备号</label><input id="rbDev" placeholder="输入设备 ID"></div>
        </div>
        <button class="btn d blk" id="rbAdd">➕ 加入黑名单</button>
        <div class="card-t" style="margin-top:10px">当前黑名单</div>
        ${ip.map((x) => `<div class="row"><div class="zav sm">🌐</div>
          <div class="rl"><b>${U.esc(x)}</b><span>IP</span></div>
          <button class="btn n sm" data-rmip="${U.esc(x)}">移除</button></div>`).join('')}
        ${dev.map((x) => `<div class="row"><div class="zav sm">📱</div>
          <div class="rl"><b>${U.esc(x)}</b><span>设备</span></div>
          <button class="btn n sm" data-rmdev="${U.esc(x)}">移除</button></div>`).join('')}
        ${(!ip.length && !dev.length) ? '<div class="lbl">黑名单为空</div>' : ''}
      </div>
      <div class="card"><div class="card-t">礼包码/邮件/广告防刷</div>
        <div class="lbl">礼包码限用次数在「礼包码 → 生成兑换码」配置；邮件限领由 claimed 记录控制；
          广告次数由存档 adUsed 控制（每日上限）。发现批量刷取可在此拉黑其 IP/设备。</div></div>`;
  },
  bind() {
    const add = D('#rbAdd');
    if (add) add.onclick = async () => {
      const db = await DB.get(DBP.risk, { blackIp: [], blackDev: [] });
      db.blackIp = db.blackIp || []; db.blackDev = db.blackDev || [];
      const i = this.val('#rbIp').trim(), d = this.val('#rbDev').trim();
      if (i && db.blackIp.indexOf(i) < 0) db.blackIp.push(i);
      if (d && db.blackDev.indexOf(d) < 0) db.blackDev.push(d);
      if (await DB.set(DBP.risk, db, '更新黑名单')) {
        AUDIT.log('加入黑名单', i || d, '');
        this.toast('已加入', 'ok'); this.render();
      }
    };
    DA('#body [data-bkip]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.risk, { blackIp: [], blackDev: [] });
      db.blackIp = db.blackIp || [];
      if (db.blackIp.indexOf(b.dataset.bkip) < 0) db.blackIp.push(b.dataset.bkip);
      if (await DB.set(DBP.risk, db, '拉黑IP')) { this.toast('已拉黑', 'ok'); this.render(); }
    }; });
    DA('#body [data-rmip]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.risk, {});
      db.blackIp = (db.blackIp || []).filter((x) => x !== b.dataset.rmip);
      await DB.set(DBP.risk, db, '移除黑名单'); this.toast('已移除', 'ok'); this.render();
    }; });
    DA('#body [data-rmdev]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.risk, {});
      db.blackDev = (db.blackDev || []).filter((x) => x !== b.dataset.rmdev);
      await DB.set(DBP.risk, db, '移除黑名单'); this.toast('已移除', 'ok'); this.render();
    }; });
  },
};
