/* =========================================================
 * p4.js —— 销户 / 重置密码 / 批量销户 / 账号总览
 * ========================================================= */

/* ---------- 销户（删除存档 + 标记账号注销） ---------- */
APP.pages['acc-destroy'] = {
  g: '账号管理', n: '销户', i: '🗑️', perm: 'account.destroy',
  render() {
    const p = this.SEL;
    return `<div class="ph"><h2>🗑️ 销户</h2><span class="tagx">不可恢复</span></div>
      <div class="card"><div class="lbl" style="color:var(--red);text-align:left;line-height:1.7">
        ⚠ 销户会执行以下操作，且<b>无法恢复</b>：<br>
        ① 把云端账号记录标记为「已注销 + 封禁」，该账号无法再登录<br>
        ② 删除该玩家的云端存档（等级 / 装备 / 道具全部清除）<br>
        ③ 从战力榜 / 无尽榜中移除该玩家<br>
        ④ 操作强制记入 GM 审计日志
      </div></div>
      <div class="card"><div class="card-t">① 选择要注销的玩家</div>
        ${this.searchBar('dkKey')}
        <div class="plist">${this.view().slice(0, 20).map((x) => this.pcard(x)).join('') || '<div class="lbl">无玩家</div>'}</div>
      </div>
      ${p ? `<div class="card"><div class="card-t">② 确认注销 <span class="sub">${U.esc(p.name)} · ${U.esc(p.uid)}</span></div>
        <div class="kv"><span>账号名</span><b id="dkAcct">${U.esc(this.acctNameOf(p) || '读取中…')}</b></div>
        <div class="kv"><span>等级</span><b>Lv.${p.lv || 1}</b></div>
        <div class="kv"><span>战力</span><b class="y">${U.fmt(U.pw(p))}</b></div>
        <div class="kv"><span>存档路径</span><b style="font-size:10px">data/zb/players/${U.esc(p.uid)}.json</b></div>
        <div class="fld"><label>注销原因</label><select id="dkWhy">
          <option>玩家主动申请</option><option>违规处理</option>
          <option>重复账号清理</option><option>测试数据清理</option><option>其他</option></select></div>
        <div class="fld"><label>备注</label><input id="dkNote" placeholder="补充说明"></div>
        <div class="fld"><label>操作人</label><input id="dkOp" value="admin"></div>
        <div class="kv" style="color:var(--red)"><span>二次确认（输入 DELETE）</span>
          <b><input id="dkOk" placeholder="DELETE" style="width:120px"></b></div>
        <button class="btn d blk" id="dkGo">🗑️ 确认销户</button>
        <button class="btn n blk" onclick="APP.SEL=null;APP.render()">← 切换玩家</button>
      </div>` : '<div class="card"><div class="lbl">请先选择玩家</div></div>'}
      ${this.destroyLogHtml()}`;
  },
  bind() {
    this.bindSearch('dkKey'); this.bindSel();
    (async () => {
      const p = this.SEL; if (!p) return;
      const n = await this.acctNameOfAsync(p);
      const el = D('#dkAcct');
      if (el) el.textContent = n || '(云端无账号记录)';
    })();
    const go = D('#dkGo');
    if (go) go.onclick = async () => {
      const p = this.SEL; if (!p) return;
      if ((this.val('#dkOk') || '').trim().toUpperCase() !== 'DELETE') {
        return this.toast('请输入 DELETE 二次确认', 'err');
      }
      if (!confirm('确定注销「' + p.name + '」？存档将永久删除！')) return;
      const why = this.val('#dkWhy'), note = this.val('#dkNote'), op = this.val('#dkOp');
      const name = p.name, uid = p.uid;
      /* 1) 标记云端账号记录为已注销 */
      let acctMarked = false;
      try {
        const u = await DB.get('data/zb/users/' + uid + '.json', null);
        if (u && u.id) {
          u.banned = true; u.destroyed = true; u.destroyAt = Date.now();
          u.destroyWhy = why; u.destroyOp = op;
          acctMarked = await DB.set('data/zb/users/' + uid + '.json', u, '销户标记');
        }
      } catch (e) {}
      /* 2) 删除云端存档
       * 补充：若删除失败（GitHub 权限/网络），至少在存档里打上注销标记，
       * 这样玩家列表会显示「已注销」，游戏端也能拦截登录，
       * 不会看起来"销户了还好好地在那儿"。
       * 致命 BUG 修复：Net.del 在 GET 取不到 sha、或各代理端点 DELETE 均失败时
       * 会「返回 false」而不抛异常。此前写成
       *     try { await Net.del(...); delOk = true; } catch(e) {}
       * 只要没抛异常就认为删除成功 —— 实际文件还在 GitHub 上，
       * 界面却提示「存档已删」。玩家下次刷新列表又出现了，
       * 于是反复销户、重复记账（用户实测点了 4 次仍存在）。
       * 现在以返回值为准，失败明确提示。 */
      let delOk = false;
      try { delOk = (await Net.del(PDIR + uid + '.json')) === true; } catch (e) { delOk = false; }
      if (!delOk) {
        /* 删除失败 → 落标记兜底（存档还在，但状态已生效） */
        try {
          const sp = await DB.get(PDIR + uid + '.json', null);
          if (sp && sp.uid) {
            sp.destroyed = true; sp.destroyAt = Date.now(); sp.destroyWhy = why;
            await DB.set(PDIR + uid + '.json', sp, '销户标记（存档删除失败）');
          }
        } catch (e) {}
      }
      /* 3) 从榜单移除 */
      let rankClean = 0;
      try {
        const lb = await DB.get(DBP.rank, { list: [] });
        const n0 = (lb.list || []).length;
        lb.list = (lb.list || []).filter((x) => x.uid !== uid);
        rankClean = n0 - lb.list.length;
        if (rankClean) await DB.set(DBP.rank, lb, '销户清理战力榜');
        const en = await DB.get(DBP.endless, { list: [] });
        en.list = (en.list || []).filter((x) => x.uid !== uid);
        await DB.set(DBP.endless, en, '销户清理无尽榜');
      } catch (e) {}
      /* 4) 从本地列表移除 */
      this.PLIST = this.PLIST.filter((x) => x.uid !== uid);
      /* 5) 审计日志 */
      const risk = await DB.get(DBP.risk, { banLog: [], destroyLog: [] });
      risk.destroyLog = risk.destroyLog || [];
      risk.destroyLog.unshift({ uid, name, why, note, op, at: Date.now() });
      await DB.set(DBP.risk, risk, '销户日志');
      AUDIT.log('销户', uid, name + ' 原因:' + why + ' 存档删除:' + (delOk ? '是' : '否')
        + ' 账号标记:' + (acctMarked ? '是' : '否') + ' 榜单清理:' + rankClean + ' 操作人:' + op);
      this.SEL = null;
      if (delOk) {
        this.toast('已销户：' + name + '（存档已删除）', 'ok');
      } else {
        this.toast('账号已标记注销，但云端存档删除失败（网络/权限），请点「重新扫描」后重试', 'err');
      }
      this.render();
    };
  },
};

/* 由玩家存档反查账号名
 *
 * 严重 BUG 修复：此前只读管理员【本机】localStorage 的 zb_ucache ——
 * 那是玩家自己登录时留下的凭据缓存，运营人员的电脑上从来没有，
 * 因此永远返回空字符串。重置密码一开始就
 *   if (!name) return toast('未查到该玩家的账号名，无法重置')
 * 直接退出 —— 重置密码功能 100% 不可用（实测 hash 从未被改写）。
 *
 * 现在改为三级回退：
 *   ① 云端账号文件 data/zb/users/{uid}.json 的 name（权威来源）
 *   ② 本机 zb_ucache 缓存
 *   ③ 存档里记录的 ext.acctName
 */
APP.acctCache = {};
APP.acctNameOf = function (p) {
  if (!p) return '';
  if (this.acctCache[p.uid]) return this.acctCache[p.uid];
  try {
    const c = JSON.parse(localStorage.getItem('zb_ucache') || '{}');
    if (c[p.uid] && c[p.uid].name) return c[p.uid].name;
  } catch (e) {}
  return (p.ext && p.ext.acctName) || '';
};
/* 异步版本：从云端账号文件读取（真实来源） */
APP.acctNameOfAsync = async function (p) {
  if (!p || !p.uid) return '';
  if (this.acctCache[p.uid]) return this.acctCache[p.uid];
  let name = '';
  try {
    const u = await DB.get('data/zb/users/' + p.uid + '.json', null);
    if (u && u.name) name = u.name;
  } catch (e) {}
  if (!name) {
    try {
      const c = JSON.parse(localStorage.getItem('zb_ucache') || '{}');
      if (c[p.uid] && c[p.uid].name) name = c[p.uid].name;
    } catch (e) {}
  }
  if (!name) name = (p.ext && p.ext.acctName) || '';
  if (name) this.acctCache[p.uid] = name;
  return name;
};

APP.destroyLogHtml = function () {
  const risk = DB.cache[DBP.risk] || {};
  const l = (risk.destroyLog || []).slice(0, 12);
  return `<div class="card"><div class="card-t">销户记录 <span class="sub">${l.length} 条</span></div>
    ${l.map((x) => `<div class="row"><div class="zav sm" style="background:linear-gradient(150deg,#ff5f6d,#a02030)">🗑</div>
      <div class="rl"><b>${U.esc(x.name || x.uid)}</b>
        <span>${U.esc(x.why)} · ${U.esc(x.op || '')} · ${U.dt(x.at)}</span></div></div>`).join('')
    || '<div class="lbl">暂无销户记录</div>'}</div>`;
};

/* ---------- 重置密码 ---------- */
APP.pages['acc-resetpwd'] = {
  g: '账号管理', n: '重置密码', i: '🔑', perm: 'account.resetpwd',
  render() {
    const p = this.SEL;
    return `<div class="ph"><h2>🔑 重置密码</h2><span class="tagx">玩家忘记密码</span></div>
      <div class="card"><div class="card-t">① 选择玩家</div>
        ${this.searchBar('rpKey')}
        <div class="plist">${this.view().slice(0, 20).map((x) => this.pcard(x)).join('') || '<div class="lbl">无玩家</div>'}</div>
      </div>
      ${p ? `<div class="card"><div class="card-t">② 设置新密码 <span class="sub">${U.esc(p.name)}</span></div>
        <div class="kv"><span>账号名</span><b id="rpAcct">${U.esc(this.acctNameOf(p) || '读取中…')}</b></div>
        <div class="kv"><span>UID</span><b style="font-size:10px">${U.esc(p.uid)}</b></div>
        <div class="fld"><label>新密码</label><input id="rpNew" value="123456" placeholder="至少 6 位"></div>
        <div class="fld"><label>操作人</label><input id="rpOp" value="admin"></div>
        <div class="lbl">重置后请把新密码告知玩家，建议其登录后立即修改</div>
        <button class="btn blk" id="rpGo">🔑 重置密码</button>
        <button class="btn n blk" onclick="APP.SEL=null;APP.render()">← 切换玩家</button>
      </div>` : '<div class="card"><div class="lbl">请先选择玩家</div></div>'}`;
  },
  bind() {
    this.bindSearch('rpKey'); this.bindSel();
    /* 异步从云端账号文件回填真实账号名（不能只靠本机缓存） */
    (async () => {
      const p = this.SEL; if (!p) return;
      const n = await this.acctNameOfAsync(p);
      const el = D('#rpAcct');
      if (el) el.textContent = n || '(云端无账号记录)';
    })();
    const go = D('#rpGo');
    if (go) go.onclick = async () => {
      const p = this.SEL; if (!p) return;
      const np = this.val('#rpNew');
      if (!np || np.length < 6) return this.toast('新密码至少 6 位', 'err');
      const name = await this.acctNameOfAsync(p);
      if (!name) return this.toast('未查到该玩家的账号名（云端无 users 记录），无法重置', 'err');
      /* 重新计算 hash（与前端 UA.hash 保持一致） */
      const h = await this.pwdHash(np, name);
      const u = await DB.get('data/zb/users/' + p.uid + '.json', null);
      if (!u || !u.id) return this.toast('云端无该账号记录', 'err');
      u.hash = h; u.pwdResetAt = Date.now(); u.pwdResetOp = this.val('#rpOp');
      if (await DB.set('data/zb/users/' + p.uid + '.json', u, '重置密码')) {
        AUDIT.log('重置密码', p.uid, name + ' 操作人:' + this.val('#rpOp'));
        this.toast('密码已重置为 ' + np, 'ok');
      }
    };
  },
};

/* 与 js/user.js UA.hash 完全一致的哈希实现 */
APP.pwdHash = async function (pwd, name) {
  const raw = 'ZP|' + String(name).trim().toLowerCase() + '|' + String(pwd);
  try {
    if (window.crypto && crypto.subtle && crypto.subtle.digest && window.TextEncoder) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
    }
  } catch (e) {}
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 ^= c; h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) >>> 0;
    h2 = ((h2 << 5) + h2 + c) >>> 0;
  }
  return 'f' + h1.toString(36) + h2.toString(36);
};

/* ---------- 批量销户（清理不活跃 / 测试账号） ---------- */
APP.pages['acc-batchdestroy'] = {
  g: '账号管理', n: '批量销户', i: '🧹', perm: 'account.destroy',
  render() {
    return `<div class="ph"><h2>🧹 批量销户</h2><span class="tagx">清理不活跃账号</span></div>
      <div class="card"><div class="card-t">筛选条件</div>
        <div class="f3">
          <div class="fld"><label>未登录超过(天)</label><input id="bdDay" type="number" value="30"></div>
          <div class="fld"><label>等级上限</label><input id="bdLv" type="number" value="5"></div>
          <div class="fld"><label>通关数上限</label><input id="bdC" type="number" value="2"></div>
        </div>
        <div class="lbl" id="bdCount">—</div>
        <button class="btn n sm" id="bdScan">🔍 重新扫描</button>
      </div>
      <div class="card"><div class="card-t">执行</div>
        <div class="fld"><label>注销原因</label><select id="bdWhy">
          <option>长期不活跃清理</option><option>测试数据清理</option>
          <option>重复账号清理</option><option>其他</option></select></div>
        <div class="kv" style="color:var(--red)"><span>二次确认（输入 DELETE）</span>
          <b><input id="bdOk" placeholder="DELETE" style="width:120px"></b></div>
        <button class="btn d blk" id="bdGo">🧹 批量销户</button>
      </div>
      ${this.destroyLogHtml()}`;
  },
  bind() {
    const calc = () => {
      const day = this.num('#bdDay'), lv = this.num('#bdLv'), cl = this.num('#bdC');
      const after = Date.now() - day * 864e5;
      const hit = this.PLIST.filter((p) => (p.lastSeen || 0) < after
        && (p.lv || 1) <= lv && Object.keys(p.cleared || {}).length <= cl);
      const e = D('#bdCount');
      if (e) e.textContent = '符合条件：' + hit.length + ' 个账号';
      return hit;
    };
    ['bdDay', 'bdLv', 'bdC'].forEach((id) => { const el = D('#' + id); if (el) el.oninput = calc; });
    if (D('#bdDay')) calc();
    const sc = D('#bdScan');
    if (sc) sc.onclick = () => { calc(); this.toast('已重新扫描', 'ok'); };
    const go = D('#bdGo');
    if (go) go.onclick = async () => {
      const hit = calc();
      if (!hit.length) return this.toast('无符合条件账号', 'err');
      if ((this.val('#bdOk') || '').trim().toUpperCase() !== 'DELETE') {
        return this.toast('请输入 DELETE 二次确认', 'err');
      }
      if (!confirm('确定批量注销 ' + hit.length + ' 个账号？存档将永久删除！')) return;
      const why = this.val('#bdWhy');
      const risk = await DB.get(DBP.risk, { destroyLog: [] });
      risk.destroyLog = risk.destroyLog || [];
      let ok = 0;
      for (const p of hit) {
        try {
          const u = await DB.get('data/zb/users/' + p.uid + '.json', null);
          if (u && u.id) {
            u.banned = true; u.destroyed = true; u.destroyAt = Date.now(); u.destroyWhy = why;
            await DB.set('data/zb/users/' + p.uid + '.json', u, '批量销户');
          }
        } catch (e) {}
        /* 同样以返回值为准，避免"假成功"计数 */
        try { if ((await Net.del(PDIR + p.uid + '.json')) === true) ok++; } catch (e) {}
        risk.destroyLog.unshift({ uid: p.uid, name: p.name, why, op: 'batch', at: Date.now() });
      }
      await DB.set(DBP.risk, risk, '批量销户日志');
      /* 清理榜单 */
      try {
        const ids = new Set(hit.map((x) => x.uid));
        const lb = await DB.get(DBP.rank, { list: [] });
        lb.list = (lb.list || []).filter((x) => !ids.has(x.uid));
        await DB.set(DBP.rank, lb, '批量销户清理榜单');
        const en = await DB.get(DBP.endless, { list: [] });
        en.list = (en.list || []).filter((x) => !ids.has(x.uid));
        await DB.set(DBP.endless, en, '批量销户清理无尽榜');
      } catch (e) {}
      this.PLIST = this.PLIST.filter((p) => !hit.some((x) => x.uid === p.uid));
      AUDIT.log('批量销户', hit.length + '个', why + ' 成功删除 ' + ok);
      this.toast('已批量销户 ' + ok + ' 个', 'ok'); this.render();
    };
  },
};

/* ---------- 账号总览（用户表） ---------- */
APP.pages['acc-users'] = {
  g: '账号管理', n: '账号总览', i: '📇', perm: 'account.query',
  render() {
    const users = APP.USERLIST || [];
    return `<div class="ph"><h2>📇 账号总览</h2><span class="tagx">${users.length} 个注册账号</span></div>
      <div class="card"><div class="card-t">注册账号 <span class="sub">云端 data/zb/users/</span></div>
        <button class="btn n sm" id="auScan">🔍 扫描云端账号</button>
        ${users.map((u) => `<div class="row"><div class="zav sm">${u.destroyed ? '🗑' : u.banned ? '🚫' : '👤'}</div>
          <div class="rl"><b>${U.esc(u.name)}</b>
            <span>昵称 ${U.esc(u.nick || '')} · ${U.esc(u.gender === 'f' ? '女' : '男')} · 注册 ${U.dt(u.created)} · 最后 ${U.ago(u.last)}</span></div>
          <span class="chipx ${u.destroyed ? '' : u.banned ? 'r' : 'g'}">${u.destroyed ? '已注销' : u.banned ? '封禁' : '正常'}</span>
          <button class="btn n sm" data-ausel="${U.esc(u.id)}">查存档</button>
          ${u.destroyed ? '' : `<button class="btn d sm" data-auban="${U.esc(u.id)}">封禁</button>`}</div>`).join('')
          || '<div class="lbl">点「扫描云端账号」读取（需要能连 GitHub）</div>'}
      </div>`;
  },
  bind() {
    const sc = D('#auScan');
    if (sc) sc.onclick = async () => {
      let files = [];
      try { files = await Net.list('data/zb/users'); } catch (e) {}
      const out = [];
      for (const f of (files || []).filter((x) => x.endsWith('.json')).slice(0, 100)) {
        try {
          const r = await Net.read('data/zb/users/' + f);
          if (r && r.data && r.data.id) out.push(r.data);
        } catch (e) {}
      }
      out.sort((a, b) => (b.created || 0) - (a.created || 0));
      APP.USERLIST = out;
      this.toast('扫到 ' + out.length + ' 个账号', 'ok'); this.render();
    };
    DA('#body [data-ausel]').forEach((b) => { b.onclick = () => {
      this.SEL = this.PLIST.find((p) => p.uid === b.dataset.ausel) || null;
      if (!this.SEL) return this.toast('该账号暂无存档', 'err');
      this.go('acc-asset');
    }; });
    DA('#body [data-auban]').forEach((b) => { b.onclick = async () => {
      const u = await DB.get('data/zb/users/' + b.dataset.auban + '.json', null);
      if (!u || !u.id) return this.toast('账号记录不存在', 'err');
      u.banned = !u.banned;
      u.banAt = Date.now();
      if (await DB.set('data/zb/users/' + b.dataset.auban + '.json', u, u.banned ? '封禁账号' : '解封账号')) {
        AUDIT.log(u.banned ? '封禁账号' : '解封账号', u.name, '');
        this.toast(u.banned ? '已封禁' : '已解封', 'ok'); this.render();
      }
    }; });
  },
};
