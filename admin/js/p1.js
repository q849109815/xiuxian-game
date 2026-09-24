/* =========================================================
 * p1.js —— 账号管理 / 邮件系统 / 礼包码 / GM 指令
 * ========================================================= */

/* =========================================================
 * 一、账号管理
 * ========================================================= */

/* 1. 玩家账号查询 */
APP.pages['acc-query'] = {
  g: '账号管理', n: '玩家查询', i: '🔍', perm: 'account.query',
  render() {
    const list = this.view();
    return `<div class="ph"><h2>🔍 玩家账号查询</h2><span class="tagx">${list.length} / ${this.PLIST.length}</span></div>
      <div class="card">
        <div class="sb">
          <input id="qKey" placeholder="UID / 昵称 / 手机号" value="${U.esc(this.FILTER)}">
          <button class="btn n sm" id="qReload">刷新</button>
        </div>
        <div style="overflow-x:auto"><table class="tb"><thead><tr>
          <th>昵称</th><th>UID</th><th>区服</th><th>等级</th><th>战力</th><th>注册</th><th>最后登录</th><th>渠道</th><th>版本</th><th>状态</th>
        </tr></thead><tbody>
        ${list.slice(0, 80).map((p) => {
          const e = p.ext || {};
          return `<tr data-sel="${U.esc(p.uid)}" style="cursor:pointer">
            <td>${U.esc(p.name)}</td><td style="font-size:10px">${U.esc(p.uid)}</td>
            <td>${U.esc(e.server || 'S1')}</td><td>${p.lv || 1}</td><td>${U.fmt(U.pw(p))}</td>
            <td style="font-size:10px">${U.dt(p.created)}</td>
            <td style="font-size:10px">${U.ago(p.lastSeen)}</td>
            <td>${U.esc(e.channel || '—')}</td><td>${U.esc(e.ver || '—')}</td>
            <td>${p.ban ? '<span style="color:var(--red)">封禁</span>' : '<span style="color:var(--green)">正常</span>'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="10"><div class="lbl">无匹配玩家</div></td></tr>'}
        </tbody></table></div>
        ${list.length > 80 ? '<div class="lbl">仅显示前 80 条</div>' : ''}
      </div>
      ${this.SEL ? this.accDetail() : '<div class="card"><div class="lbl">点击表格行查看详情</div></div>'}`;
  },
  bind() {
    const s = D('#qKey'); if (s) s.oninput = () => { this.FILTER = s.value; this.render(); };
    const r = D('#qReload');
    if (r) r.onclick = async () => { this.toast('正在拉取…', 'ok'); await this.loadPlayers({ force: true }); this.toast('已刷新 '+this.PLIST.length+' 名玩家', 'ok'); };
    DA('#body tr[data-sel]').forEach((t) => { t.onclick = () => {
      this.SEL = this.PLIST.find((p) => p.uid === t.dataset.sel) || null; this.render();
    }; });
    const sv = D('#accExtSave');
    if (sv) sv.onclick = async () => {
      const p = this.SEL; if (!p) return;
      p.ext = p.ext || {};
      p.ext.phone = this.val('#exPhone'); p.ext.device = this.val('#exDevice');
      p.ext.ip = this.val('#exIp'); p.ext.channel = this.val('#exChannel');
      p.ext.ver = this.val('#exVer'); p.ext.server = this.val('#exServer');
      if (await this.save(p)) { AUDIT.log('编辑账号资料', p.uid, '资料更新'); this.toast('已保存', 'ok'); this.render(); }
    };
  },
};
/* 详情（共用） */
APP.accDetail = function () {
  const p = this.SEL; if (!p) return '';
  const e = p.ext || {};
  return `<div class="card"><div class="card-t">账号详情 <span class="sub">${U.esc(p.uid)}</span></div>
    <div class="row"><div class="zav">${U.esc((p.avatar || '🧑').slice(0, 2))}</div>
      <div class="rl"><b>${U.esc(p.name)}</b><span>Lv.${p.lv || 1} · 战力 ${U.fmt(U.pw(p))} · ${p.gender === 'f' ? '女' : '男'}</span></div>
      ${p.ban ? '<span class="ban" style="color:var(--red);font-size:11px">封禁中</span>' : ''}</div>
    <div class="kv"><span>注册时间</span><b>${U.dt(p.created)}</b></div>
    <div class="kv"><span>最后登录</span><b>${U.dt(p.lastSeen)}</b></div>
    <div class="kv"><span>累计击杀</span><b class="y">${(p.stats && p.stats.kills) || 0}</b></div>
    <div class="kv"><span>通关关卡</span><b>${Object.keys(p.cleared || {}).length}</b></div>
    <div class="card-t" style="margin-top:12px">账号资料 <span class="sub">单机架构未采集的字段可手工补录</span></div>
    <div class="f2">
      <div class="fld"><label>手机号</label><input id="exPhone" value="${U.esc(e.phone || '')}"></div>
      <div class="fld"><label>设备 ID</label><input id="exDevice" value="${U.esc(e.device || '')}"></div>
    </div>
    <div class="f2">
      <div class="fld"><label>IP 地址</label><input id="exIp" value="${U.esc(e.ip || '')}"></div>
      <div class="fld"><label>渠道</label><input id="exChannel" value="${U.esc(e.channel || '')}"></div>
    </div>
    <div class="f2">
      <div class="fld"><label>客户端版本</label><input id="exVer" value="${U.esc(e.ver || '')}"></div>
      <div class="fld"><label>服务器 ID</label><input id="exServer" value="${U.esc(e.server || 'S1')}"></div>
    </div>
    <button class="btn blk" id="accExtSave">💾 保存资料</button>
  </div>`;
};

/* 2. 账号资产查看 */
APP.pages['acc-asset'] = {
  g: '账号管理', n: '资产查看', i: '💰', perm: 'account.asset',
  render() {
    if (!this.SEL) {
      return `<div class="ph"><h2>💰 账号资产查看</h2></div>
        ${this.searchBar('asKey')}
        <div class="plist">${this.view().slice(0, 24).map((p) => this.pcard(p)).join('') || '<div class="lbl">无玩家</div>'}</div>`;
    }
    const p = this.SEL;
    const gun = (EX.guns || []).find((g) => g.id === p.gun) || {};
    const matRows = Object.keys(p.mat || {}).filter((k) => (p.mat[k] || 0) > 0)
      .map((k) => `<div class="kv"><span>${U.esc(U.itemName(k))}</span><b>${p.mat[k]}</b></div>`).join('')
      || '<div class="lbl">无材料</div>';
    const chipRows = Object.keys(p.chips || {}).map((k) => {
      const c = p.chips[k];
      return `<div class="kv"><span>🔲 ${U.esc(c.n || k)}</span><b>Lv.${c.lv || 1}</b></div>`;
    }).join('') || '<div class="lbl">无芯片</div>';
    const talentRows = Object.keys(p.talents || {}).map((k) => {
      const t = (EX.talents || []).find((x) => x.id === k);
      return `<div class="kv"><span>${U.esc(t ? t.n : k)}</span><b class="g">Lv.${p.talents[k]}</b></div>`;
    }).join('') || '<div class="lbl">无天赋</div>';
    return `<div class="ph"><h2>💰 账号资产 <span style="font-size:12px;color:var(--txt3)">${U.esc(p.name)}</span></h2>
      <span class="tagx">${U.esc(p.uid)}</span></div>

      <div class="stats">
        <div class="st"><b>${U.fmt(p.gold)}</b><span>金币</span></div>
        <div class="st"><b>${U.fmt(p.diamond)}</b><span>钻石</span></div>
        <div class="st"><b>${U.fmt(p.ach || 0)}</b><span>成就点</span></div>
        <div class="st"><b>${Math.floor(p.stamina || 0)}</b><span>体力</span></div>
        <div class="st"><b>${U.fmt(p.evToken || 0)}</b><span>活动代币</span></div>
        <div class="st"><b>${U.fmt(U.pw(p))}</b><span>战力</span></div>
      </div>

      <div class="card"><div class="card-t">当前武器 <span class="sub">等级/进阶/词条</span></div>
        <div class="row"><div class="zav">${gun.icon || '🔫'}</div>
          <div class="rl"><b>${U.esc(gun.n || p.gun)}</b>
            <span>Lv.${p.gunLv || 1} · 进阶 ${p.gunAdv || 0} 阶 · ${U.esc(gun.q || '')}品</span></div></div>
        ${(E.gunAffixes ? E.gunAffixes(p) : []).map((af) => {
          const a = EX.affixOf(af.id); if (!a) return '';
          return `<div class="kv"><span><span class="chipx">${a.q}</span> ${U.esc(EX.affixTxt(af))}</span><b class="g">${U.esc(a.eff)}</b></div>`;
        }).join('') || '<div class="lbl">无词条</div>'}
        <div class="card-t" style="margin-top:10px">已拥有武器 ${(p.gunOwn || []).length} 把</div>
        <div>${(p.gunOwn || []).map((g) => {
          const gg = (EX.guns || []).find((x) => x.id === g);
          return `<span class="chipx">${gg ? U.esc(gg.n) : g}</span>`;
        }).join(' ')}</div>
      </div>

      <div class="card"><div class="card-t">材料 / 碎片</div>${matRows}</div>
      <div class="card"><div class="card-t">芯片背包 <span class="sub">${Object.keys(p.chips || {}).length}</span></div>${chipRows}</div>
      <div class="card"><div class="card-t">已解锁天赋</div>${talentRows}</div>
      <div class="card"><div class="card-t">皮肤 <span class="sub">${APP.skinArr(p).length}</span></div>
        <div>${APP.skinArr(p).map((s) => {
          const sk = (EX.skins || []).find((x) => x.id === s);
          return `<span class="chipx">${sk ? U.esc(sk.n) : U.esc(String(s))}</span>`;
        }).join(' ') || '<div class="lbl">无</div>'}</div></div>
      <div class="card"><div class="card-t">角色 <span class="sub">${(p.chars || []).length} 个 · 当前 ${U.esc(p.char)}</span></div>
        <div>${(p.chars || []).map((c) => {
          const cc = (EX.chars || []).find((x) => x.id === c);
          return `<span class="chipx ${c === p.char ? 'y' : ''}">${cc ? U.esc(cc.n) : c}${p.charStar ? ' ★' + p.charStar : ''}</span>`;
        }).join(' ')}</div></div>
      <div class="card"><div class="card-t">邮件 <span class="sub">${(p.mail || []).length} 封</span></div>
        ${(p.mail || []).slice(0, 8).map((m) => `<div class="kv"><span>${U.esc(m.t || '邮件')}</span>
          <b>${m.got ? '已领取' : '未领取'}</b></div>`).join('') || '<div class="lbl">无邮件</div>'}</div>
      <button class="btn n blk" onclick="APP.SEL=null;APP.render()">← 切换玩家</button>`;
  },
  bind() {
    this.bindSearch('asKey');
    this.bindSel();
  },
};

/* 3. 道具补发 */
APP.pages['acc-compensate'] = {
  g: '账号管理', n: '道具补发', i: '📦', perm: 'account.compensate',
  render() {
    const p = this.SEL;
    return `<div class="ph"><h2>📦 道具补发</h2><span class="tagx">补偿用</span></div>
      ${!p ? `${this.searchBar('cpKey')}<div class="plist">${this.view().slice(0, 20).map((x) => this.pcard(x)).join('') || '<div class="lbl">无玩家</div>'}</div>`
        : `<div class="card"><div class="card-t">补发给 <span class="sub">${U.esc(p.name)} · ${U.esc(p.uid)}</span></div>
        <div class="fld"><label>物品</label>${U.picker('cpItem', 'gold')}</div>
        <div class="f2">
          <div class="fld"><label>数量</label><input id="cpN" type="number" value="100" min="1"></div>
          <div class="fld"><label>补发类型</label><select id="cpType">
            <option value="永久">永久</option><option value="临时">临时（带有效期）</option></select></div>
        </div>
        <div class="f2">
          <div class="fld"><label>有效期（天，临时时填）</label><input id="cpExp" type="number" value="7"></div>
          <div class="fld"><label>操作人</label><input id="cpOp" value="admin"></div>
        </div>
        <div class="fld"><label>补发原因</label><input id="cpReason" placeholder="如：BUG 补偿 / 客服补发"></div>
        <div class="kv"><span>同时发送邮件通知</span><b><input type="checkbox" id="cpMail" checked></b></div>
        <button class="btn blk" id="cpGo">📦 确认补发</button>
        <button class="btn n blk" onclick="APP.SEL=null;APP.render()">← 切换玩家</button>
      </div>

      <div class="card"><div class="card-t">批量补发 <span class="sub">按筛选条件</span></div>
        <div class="f3">
          <div class="fld"><label>等级下限</label><input id="cpLv1" type="number" value="1"></div>
          <div class="fld"><label>等级上限</label><input id="cpLv2" type="number" value="999"></div>
          <div class="fld"><label>最少通关数</label><input id="cpCh" type="number" value="0"></div>
        </div>
        <div class="f2">
          <div class="fld"><label>物品</label>${U.picker('cpItem2', 'gold')}</div>
          <div class="fld"><label>数量</label><input id="cpN2" type="number" value="100"></div>
        </div>
        <div class="fld"><label>原因</label><input id="cpR2" placeholder="批量补偿原因"></div>
        <div class="lbl" id="cpCount">—</div>
        <button class="btn o blk" id="cpGo2">📦 批量补发</button>
      </div>`}`;
  },
  bind() {
    this.bindSearch('cpKey'); this.bindSel();
    const go = D('#cpGo');
    if (go) go.onclick = async () => {
      const p = this.SEL; if (!p) return;
      const id = this.val('#cpItem'), n = this.num('#cpN');
      const type = this.val('#cpType'), exp = this.num('#cpExp');
      const why = this.val('#cpReason') || '未填写';
      const op = this.val('#cpOp') || 'admin';
      this.grant(p, id, n);
      if (type === '临时' && exp > 0) {
        p.tempItems = p.tempItems || [];
        p.tempItems.push({ id: id, n: n, exp: Date.now() + exp * 864e5 });
      }
      if (D('#cpMail').checked) {
        p.mail = p.mail || [];
        p.mail.unshift({ id: 'cp' + Date.now(), t: '补偿发放',
          b: '管理员为您补发：' + U.itemName(id) + ' ×' + n + '（原因：' + why + '）',
          rw: {}, got: false, at: Date.now() });
      }
      if (await this.save(p)) {
        AUDIT.log('道具补发', p.uid, U.itemName(id) + '×' + n + ' 原因:' + why + ' 操作人:' + op);
        this.toast('已补发 ' + U.itemName(id) + ' ×' + n, 'ok'); this.render();
      }
    };
    /* 批量 */
    const cnt = () => {
      const l1 = this.num('#cpLv1'), l2 = this.num('#cpLv2'), ch = this.num('#cpCh');
      const hit = this.PLIST.filter((p) => (p.lv || 1) >= l1 && (p.lv || 1) <= l2
        && Object.keys(p.cleared || {}).length >= ch);
      const e = D('#cpCount');
      if (e) e.textContent = '预估接收：' + hit.length + ' 人';
      return hit;
    };
    const upd = () => { cnt(); };
    ['cpLv1', 'cpLv2', 'cpCh'].forEach((id) => { const e = D('#' + id); if (e) e.oninput = upd; });
    if (D('#cpLv1')) cnt();
    const go2 = D('#cpGo2');
    if (go2) go2.onclick = async () => {
      const hit = cnt();
      if (!hit.length) return this.toast('无匹配玩家', 'err');
      if (!confirm('确定给 ' + hit.length + ' 名玩家补发？')) return;
      const id = this.val('#cpItem2'), n = this.num('#cpN2'), why = this.val('#cpR2') || '批量补偿';
      let ok = 0;
      for (const p of hit) {
        this.grant(p, id, n);
        if (await this.save(p)) ok++;
      }
      AUDIT.log('批量补发', hit.length + '人', U.itemName(id) + '×' + n + ' 原因:' + why);
      this.toast('已补发 ' + ok + ' 人', 'ok');
    };
  },
};

/* 4. 账号封禁 / 解封 */
APP.pages['acc-ban'] = {
  g: '账号管理', n: '封禁管理', i: '🚫', perm: 'account.ban',
  render() {
    const p = this.SEL;
    const risk = DB.cache[DBP.risk] || {};
    const logs = (risk.banLog || []).slice(0, 20);
    return `<div class="ph"><h2>🚫 账号封禁 / 解封</h2><span class="tagx">外挂 / 刷资源</span></div>
      ${!p ? `${this.searchBar('bnKey')}<div class="plist">${this.view().slice(0, 20).map((x) => this.pcard(x)).join('') || '<div class="lbl">无</div>'}</div>`
        : `<div class="card"><div class="card-t">${p.ban ? '解除封禁' : '封禁'} <span class="sub">${U.esc(p.name)}</span></div>
        <div class="kv"><span>当前状态</span><b class="${p.ban ? 'r' : 'g'}">${p.ban ? '已封禁' : '正常'}</b></div>
        <div class="f2">
          <div class="fld"><label>封禁类型</label><select id="bnType">
            <option value="临时">临时封禁</option><option value="永久">永久封禁</option></select></div>
          <div class="fld"><label>时长（小时，临时填）</label><input id="bnH" type="number" value="24"></div>
        </div>
        <div class="fld"><label>封禁原因</label><select id="bnReason">
          <option>使用外挂</option><option>刷取资源</option><option>恶意利用BUG</option>
          <option>违规言论</option><option>其他</option></select></div>
        <div class="fld"><label>备注</label><input id="bnNote" placeholder="补充说明"></div>
        <div class="fld"><label>操作人</label><input id="bnOp" value="admin"></div>
        <button class="btn ${p.ban ? 'g' : 'd'} blk" id="bnGo">${p.ban ? '✅ 解除封禁' : '🚫 执行封禁'}</button>
        <button class="btn n blk" onclick="APP.SEL=null;APP.render()">← 切换玩家</button>
      </div>`}
      <div class="card"><div class="card-t">封禁日志 <span class="sub">最近 ${logs.length} 条</span></div>
        ${logs.map((l) => `<div class="row"><div class="zav sm">${l.act === 'ban' ? '🚫' : '✅'}</div>
          <div class="rl"><b>${U.esc(l.uid)}</b><span>${U.esc(l.reason)} · ${U.esc(l.type)} · ${U.dt(l.at)}</span></div>
          <span class="chipx">${U.esc(l.op || '')}</span></div>`).join('') || '<div class="lbl">暂无记录</div>'}
      </div>`;
  },
  bind() {
    this.bindSearch('bnKey'); this.bindSel();
    const go = D('#bnGo');
    if (go) go.onclick = async () => {
      const p = this.SEL; if (!p) return;
      const risk = await DB.get(DBP.risk, { banLog: [], blackIp: [], blackDev: [] });
      risk.banLog = risk.banLog || [];
      if (p.ban) {
        risk.banLog.unshift({ uid: p.uid, act: 'unban', at: Date.now(), op: this.val('#bnOp') });
        AUDIT.log('解封账号', p.uid, '');
        await DB.set(DBP.risk, risk, '封禁日志');
        const r = await this.setBan(p, false, { op: this.val('#bnOp') });
        this.toast('已解封' + (r.acctOk ? '' : '（账号记录未同步：' + (r.acctMsg || '未知') + '）'), r.acctOk ? 'ok' : 'err');
        this.render();
      } else {
        const type = this.val('#bnType'), h = this.num('#bnH');
        const until = type === '永久' ? 0 : Date.now() + h * 36e5;
        risk.banLog.unshift({ uid: p.uid, act: 'ban', type: type, reason: this.val('#bnReason'),
          note: this.val('#bnNote'), at: Date.now(), op: this.val('#bnOp') });
        AUDIT.log('封禁账号', p.uid, type + ' ' + this.val('#bnReason'));
        await DB.set(DBP.risk, risk, '封禁日志');
        const r = await this.setBan(p, true, {
          until: until, type: type, reason: this.val('#bnReason'), op: this.val('#bnOp'),
        });
        /* 关键：账号文件写成功才是真的封住（游戏端登录读它） */
        this.toast(r.acctOk ? '已封禁（账号已锁定，无法登录）'
          : '已标记存档，但账号记录未同步：' + (r.acctMsg || '未知'), r.acctOk ? 'ok' : 'err');
        this.render();
      }
    };
  },
};

/* 5. 账号回档 */
APP.pages['acc-rollback'] = {
  g: '账号管理', n: '账号回档', i: '⏪', perm: 'account.rollback',
  render() {
    const p = this.SEL;
    const snaps = this.snaps || [];
    return `<div class="ph"><h2>⏪ 账号回档</h2><span class="tagx">严重作弊 / BUG</span></div>
      <div class="card"><div class="card-t">① 选择玩家</div>
        ${this.searchBar('rbKey')}
        <div class="plist">${this.view().slice(0, 16).map((x) => this.pcard(x)).join('') || '<div class="lbl">无</div>'}</div>
      </div>
      <div class="card"><div class="card-t">② 备份快照 <span class="sub">点「扫描快照」读取</span></div>
        <button class="btn n blk" id="rbScan">🔍 扫描备份快照</button>
        <div id="rbSnaps">${snaps.length ? snaps.map((s) => `
          <div class="row"><div class="zav sm">📦</div>
            <div class="rl"><b>${U.esc(s.name)}</b><span>${U.dt(s.at)} · ${s.n} 份存档</span></div>
            <button class="btn sm ${p ? '' : 'd'}" data-rb="${U.esc(s.name)}" ${p ? '' : 'disabled'}>回档到此</button></div>`).join('')
          : '<div class="lbl">未扫描</div>'}</div>
      </div>
      <div class="lbl">回档会用快照里的旧数据覆盖当前存档，操作前请确认</div>`;
  },
  bind() {
    this.bindSearch('rbKey'); this.bindSel();
    const sc = D('#rbScan');
    if (sc) sc.onclick = async () => {
      let files = [];
      try { files = await Net.list('data/zb'); } catch (e) {}
      const bks = (files || []).filter((x) => x.indexOf('backup') >= 0);
      const out = [];
      for (const f of bks.slice(0, 10)) {
        try {
          const r = await Net.read('data/zb/' + f);
          if (r && r.data && r.data.list) out.push({ name: f, at: r.data.at, n: r.data.list.length, data: r.data });
        } catch (e) {}
      }
      APP.snaps = out;
      this.toast('找到 ' + out.length + ' 个快照', 'ok'); this.render();
    };
    DA('#body [data-rb]').forEach((b) => { b.onclick = async () => {
      const p = this.SEL; if (!p) return;
      const snap = (APP.snaps || []).find((s) => s.name === b.dataset.rb);
      if (!snap) return;
      const old = (snap.data.list || []).find((x) => x.uid === p.uid);
      if (!old) return this.toast('该快照中没有此玩家', 'err');
      if (!confirm('确定把 ' + p.name + ' 回档到 ' + U.dt(snap.at) + '？')) return;
      const np = Object.assign({}, p, old, { uid: p.uid });
      Object.assign(p, np);
      p.lastSeen = Date.now();
      if (await this.save(p)) {
        AUDIT.log('账号回档', p.uid, '快照 ' + snap.name + ' 时间 ' + U.dt(snap.at));
        this.toast('已回档', 'ok'); this.render();
      }
    }; });
  },
};

/* =========================================================
 * 二、邮件系统
 * ========================================================= */
APP.mailForm = function (prefix, title) {
  return `<div class="fld"><label>标题</label><input id="${prefix}Title" value="${title || '系统邮件'}"></div>
    <div class="fld"><label>正文</label><textarea id="${prefix}Body" rows="3">感谢您的支持，请查收附件奖励。</textarea></div>
    <div class="f3">
      <div class="fld"><label>附件物品</label>${U.picker(prefix + 'Item', 'gold')}</div>
      <div class="fld"><label>数量</label><input id="${prefix}N" type="number" value="100"></div>
      <div class="fld"><label>发送者</label><input id="${prefix}From" value="系统"></div>
    </div>
    <div class="f3">
      <div class="fld"><label>生效时间(小时,0=立即)</label><input id="${prefix}Start" type="number" value="0"></div>
      <div class="fld"><label>有效期(天)</label><input id="${prefix}Exp" type="number" value="7"></div>
      <div class="fld"><label>弹窗提醒</label><select id="${prefix}Pop">
        <option value="1">是</option><option value="0">否</option></select></div>
    </div>`;
};
APP.mailPayload = function (prefix) {
  const item = this.val('#' + prefix + 'Item'), n = this.num('#' + prefix + 'N');
  const rw = {}; if (n > 0) rw[item] = n;
  const startH = this.num('#' + prefix + 'Start'), expD = this.num('#' + prefix + 'Exp');
  return {
    title: this.val('#' + prefix + 'Title') || '系统邮件',
    body: this.val('#' + prefix + 'Body') || '',
    rw: rw, from: this.val('#' + prefix + 'From') || '系统',
    startAt: Date.now() + startH * 36e5,
    expireAt: Date.now() + (startH / 24 + expD) * 864e5,
    popup: this.val('#' + prefix + 'Pop') === '1',
  };
};

/* 单发 */
APP.pages['mail-single'] = {
  g: '邮件系统', n: '单发邮件', i: '✉️', perm: 'mail.single',
  render() {
    const p = this.SEL;
    return `<div class="ph"><h2>✉️ 单发邮件</h2><span class="tagx">指定玩家</span></div>
      <div class="card"><div class="card-t">① 选择收件人</div>
        ${this.searchBar('msKey')}
        <div class="plist">${this.view().slice(0, 16).map((x) => this.pcard(x)).join('') || '<div class="lbl">无</div>'}</div>
      </div>
      <div class="card"><div class="card-t">② 邮件内容 ${p ? `<span class="sub">→ ${U.esc(p.name)}</span>` : ''}</div>
        ${APP.mailForm('ms', '补偿邮件')}
        <button class="btn blk" id="msGo" ${p ? '' : 'disabled'}>✉️ 发送</button>
        ${p ? '' : '<div class="lbl">请先选择收件人</div>'}
      </div>`;
  },
  bind() {
    this.bindSearch('msKey'); this.bindSel();
    const go = D('#msGo');
    if (go) go.onclick = async () => {
      const p = this.SEL; if (!p) return;
      const m = APP.mailPayload('ms');
      p.mail = p.mail || [];
      p.mail.unshift({ id: 'ms' + Date.now(), t: m.title, b: m.body, rw: m.rw,
        from: m.from, got: false, at: Date.now(), expireAt: m.expireAt, popup: m.popup });
      if (p.mail.length > 40) p.mail.length = 40;
      if (await this.save(p)) {
        AUDIT.log('单发邮件', p.uid, m.title);
        this.toast('已发送给 ' + p.name, 'ok'); this.render();
      }
    };
  },
};

/* 全服广播 */
APP.pages['mail-all'] = {
  g: '邮件系统', n: '全服广播', i: '📢', perm: 'mail.broadcast',
  render() {
    return `<div class="ph"><h2>📢 全服广播邮件</h2><span class="tagx">本服全体玩家</span></div>
      <div class="card"><div class="card-t">邮件内容 <span class="sub">写入全服邮件表，玩家登录时自动领取</span></div>
        ${APP.mailForm('ma', '版本福利')}
        <div class="fld"><label>服务器 ID</label><input id="maSid" value="S1"></div>
        <button class="btn blk" id="maGo">📢 发布全服邮件</button>
        <div class="lbl">覆盖 ${this.PLIST.length} 名在线存档玩家</div>
      </div>
      ${this.mailListHtml('broadcast')}`;
  },
  bind() {
    const go = D('#maGo');
    if (go) go.onclick = async () => {
      const m = APP.mailPayload('ma');
      const db = await DB.get(DBP.mail, { list: [] });
      db.list = db.list || [];
      db.list.unshift(Object.assign({ id: 'ma' + Date.now(), type: 'broadcast',
        sid: this.val('#maSid') || 'S1', claimed: [], createdAt: Date.now() }, m));
      if (await DB.set(DBP.mail, db, '发布全服邮件')) {
        AUDIT.log('全服广播邮件', 'ALL', m.title);
        this.toast('全服邮件已发布', 'ok'); this.render();
      }
    };
    this.bindMailOps();
  },
};
/* 定向批量 */
APP.pages['mail-batch'] = {
  g: '邮件系统', n: '定向批量', i: '🎯', perm: 'mail.batch',
  render() {
    return `<div class="ph"><h2>🎯 定向批量邮件</h2><span class="tagx">按条件筛选</span></div>
      <div class="card"><div class="card-t">① 筛选条件</div>
        <div class="f3">
          <div class="fld"><label>等级下限</label><input id="mbL1" type="number" value="1"></div>
          <div class="fld"><label>等级上限</label><input id="mbL2" type="number" value="999"></div>
          <div class="fld"><label>最少通关数</label><input id="mbC" type="number" value="0"></div>
        </div>
        <div class="f2">
          <div class="fld"><label>注册时间不早于(天)</label><input id="mbR" type="number" value="0"></div>
          <div class="fld"><label>服务器 ID</label><input id="mbSid" value="S1"></div>
        </div>
        <div class="lbl" id="mbCount">—</div>
      </div>
      <div class="card"><div class="card-t">② 邮件内容</div>
        ${APP.mailForm('mb', '定向福利')}
        <div class="kv"><span>失败重试</span><b><input type="checkbox" id="mbRetry" checked></b></div>
        <button class="btn o blk" id="mbGo">🎯 发布定向邮件</button>
      </div>
      ${this.mailListHtml('target')}`;
  },
  bind() {
    const calc = () => {
      const l1 = this.num('#mbL1'), l2 = this.num('#mbL2'), c = this.num('#mbC'), r = this.num('#mbR');
      const after = Date.now() - r * 864e5;
      const hit = this.PLIST.filter((p) => (p.lv || 1) >= l1 && (p.lv || 1) <= l2
        && Object.keys(p.cleared || {}).length >= c && (p.created || 0) >= after);
      const e = D('#mbCount');
      if (e) e.textContent = '预估接收人数：' + hit.length;
      return hit;
    };
    ['mbL1', 'mbL2', 'mbC', 'mbR'].forEach((id) => { const e = D('#' + id); if (e) e.oninput = calc; });
    if (D('#mbL1')) calc();
    const go = D('#mbGo');
    if (go) go.onclick = async () => {
      const hit = calc();
      if (!hit.length) return this.toast('无匹配玩家', 'err');
      const m = APP.mailPayload('mb');
      const db = await DB.get(DBP.mail, { list: [] });
      db.list = db.list || [];
      db.list.unshift(Object.assign({ id: 'mb' + Date.now(), type: 'target',
        filter: { lvMin: this.num('#mbL1'), lvMax: this.num('#mbL2'),
          clearedMin: this.num('#mbC'), regAfter: Date.now() - this.num('#mbR') * 864e5 },
        sid: this.val('#mbSid') || 'S1', uids: hit.map((x) => x.uid),
        claimed: [], retry: D('#mbRetry').checked, createdAt: Date.now() }, m));
      if (await DB.set(DBP.mail, db, '发布定向邮件')) {
        AUDIT.log('定向批量邮件', hit.length + '人', m.title);
        this.toast('定向邮件已发布（' + hit.length + ' 人）', 'ok'); this.render();
      }
    };
    this.bindMailOps();
  },
};
/* 邮件列表 + 撤回（共用） */
APP.mailListHtml = function (type) {
  const db = DB.cache[DBP.mail] || { list: [] };
  const list = (db.list || []).filter((m) => m.type === type).slice(0, 15);
  return `<div class="card"><div class="card-t">已发布 <span class="sub">${type === 'broadcast' ? '全服' : '定向'} · ${list.length} 封</span></div>
    ${list.map((m) => {
      const now = Date.now();
      const st = m.expireAt && m.expireAt < now ? '已过期'
        : m.startAt && m.startAt > now ? '待发送'
        : (m.claimed || []).length ? '已领取' : '已发送';
      const sc = st === '已过期' ? 'r' : st === '待发送' ? '' : 'g';
      return `<div class="row"><div class="zav sm">✉️</div>
        <div class="rl"><b>${U.esc(m.title)}</b>
          <span>${U.esc(m.body || '').slice(0, 30)} · 附件 ${U.esc(Object.keys(m.rw || {}).map((k) => U.itemName(k) + '×' + m.rw[k]).join('、') || '无')}</span></div>
        <span class="chipx ${sc}">${st}</span>
        ${(m.claimed || []).length ? '' : `<button class="btn d sm" data-revoke="${U.esc(m.id)}">撤回</button>`}</div>`;
    }).join('') || '<div class="lbl">暂无</div>'}</div>`;
};
APP.bindMailOps = function () {
  DA('#body [data-revoke]').forEach((b) => { b.onclick = async () => {
    const db = await DB.get(DBP.mail, { list: [] });
    db.list = (db.list || []).filter((m) => m.id !== b.dataset.revoke);
    if (await DB.set(DBP.mail, db, '撤回邮件')) {
      AUDIT.log('撤回邮件', b.dataset.revoke, '');
      this.toast('已撤回', 'ok'); this.render();
    }
  }; });
};
/* 邮件查询&撤回 */
APP.pages['mail-manage'] = {
  g: '邮件系统', n: '查询 / 撤回', i: '🗂️', perm: 'mail.query',
  render() {
    const db = DB.cache[DBP.mail] || { list: [] };
    const list = db.list || [];
    return `<div class="ph"><h2>🗂️ 邮件查询 & 撤回</h2><span class="tagx">${list.length} 封</span></div>
      <div class="card"><div class="card-t">全部邮件</div>
        <button class="btn n sm" id="mmReload">刷新</button>
        ${list.map((m) => {
          const now = Date.now();
          const st = m.expireAt && m.expireAt < now ? '已过期'
            : m.startAt && m.startAt > now ? '待发送'
            : (m.claimed || []).length ? '已领取' : '已发送';
          const recv = m.type === 'broadcast' ? this.PLIST.length : (m.uids || []).length;
          return `<div class="row"><div class="zav sm">${m.type === 'broadcast' ? '📢' : '🎯'}</div>
            <div class="rl"><b>${U.esc(m.title)}</b>
              <span>ID ${U.esc(m.id)} · 接收 ${recv} 人 · 已领 ${(m.claimed || []).length} · ${U.dt(m.createdAt)}</span></div>
            <span class="chipx">${st}</span>
            <button class="btn d sm" data-revoke="${U.esc(m.id)}">撤回</button></div>`;
        }).join('') || '<div class="lbl">暂无邮件</div>'}
      </div>`;
  },
  bind() {
    const r = D('#mmReload');
    if (r) r.onclick = async () => { await DB.reload(DBP.mail); this.render(); this.toast('已刷新', 'ok'); };
    this.bindMailOps();
  },
};

/* =========================================================
 * 三、礼包码系统
 * ========================================================= */

/* 模板配置 */
APP.pages['cdk-tpl'] = {
  g: '礼包码', n: '礼包模板', i: '📋', perm: 'cdkey.tpl',
  render() {
    const db = DB.cache[DBP.cdkey] || { templates: [] };
    const tpls = db.templates || [];
    return `<div class="ph"><h2>📋 礼包模板配置</h2><span class="tagx">${tpls.length} 个</span></div>
      <div class="card"><div class="card-t">新建模板</div>
        <div class="f2">
          <div class="fld"><label>模板名称</label><input id="ctName" placeholder="如：直播福利包"></div>
          <div class="fld"><label>限每人领取</label><select id="ctOnce">
            <option value="1">1 次</option><option value="0">不限</option></select></div>
        </div>
        <div class="f3">
          <div class="fld"><label>物品 1</label>${U.picker('ctI1', 'gold')}</div>
          <div class="fld"><label>数量</label><input id="ctN1" type="number" value="1000"></div>
          <div class="fld"><label>描述</label><input id="ctDesc" placeholder="模板说明"></div>
        </div>
        <div class="f2">
          <div class="fld"><label>物品 2</label>${U.picker('ctI2', '')}</div>
          <div class="fld"><label>数量 2</label><input id="ctN2" type="number" value="0"></div>
        </div>
        <div class="f2">
          <div class="fld"><label>物品 3</label>${U.picker('ctI3', '')}</div>
          <div class="fld"><label>数量 3</label><input id="ctN3" type="number" value="0"></div>
        </div>
        <button class="btn blk" id="ctGo">➕ 创建模板</button>
      </div>
      <div class="card"><div class="card-t">已有模板</div>
        ${tpls.map((t) => `<div class="row"><div class="zav sm">🎁</div>
          <div class="rl"><b>${U.esc(t.name)}</b><span>${U.esc(Object.keys(t.items || {}).map((k) => U.itemName(k) + '×' + t.items[k]).join('、'))} · ${t.once ? '限1次' : '不限'}</span></div>
          <span class="chipx">${U.esc(t.id)}</span>
          <button class="btn d sm" data-deltpl="${U.esc(t.id)}">删除</button></div>`).join('')
          || '<div class="lbl">暂无模板，先创建一个</div>'}
      </div>`;
  },
  bind() {
    const go = D('#ctGo');
    if (go) go.onclick = async () => {
      const name = this.val('#ctName').trim();
      if (!name) return this.toast('请填模板名称', 'err');
      const items = {};
      const i1 = this.val('#ctI1'), n1 = this.num('#ctN1');
      const i2 = this.val('#ctI2'), n2 = this.num('#ctN2');
      /* 严重 BUG 修复：此前物品 3 直接沿用物品 2 的数量（this.num('#ctN2')），
       * 且界面上根本没有「数量 3」输入框 ——
       * 选了物品 3 就会按物品 2 的数量发放，物品 2 填 0 时物品 3 直接被丢弃。
       * 现在物品 3 使用独立的 ctN3。 */
      const i3 = this.val('#ctI3'), n3 = this.num('#ctN3');
      if (i1 && n1 > 0) items[i1] = n1;
      if (i2 && n2 > 0) items[i2] = n2;
      if (i3 && n3 > 0) items[i3] = n3;
      if (!Object.keys(items).length) return this.toast('至少配置一个物品', 'err');
      const db = await DB.get(DBP.cdkey, { templates: [], codes: [] });
      db.templates = db.templates || [];
      db.templates.push({ id: 'TPL' + Date.now().toString(36).toUpperCase(), name: name,
        items: items, once: this.val('#ctOnce') === '1', desc: this.val('#ctDesc') });
      if (await DB.set(DBP.cdkey, db, '创建礼包模板')) {
        AUDIT.log('创建礼包模板', name, JSON.stringify(items));
        this.toast('模板已创建', 'ok'); this.render();
      }
    };
    DA('#body [data-deltpl]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.cdkey, { templates: [], codes: [] });
      db.templates = (db.templates || []).filter((t) => t.id !== b.dataset.deltpl);
      await DB.set(DBP.cdkey, db, '删除模板'); this.toast('已删除', 'ok'); this.render();
    }; });
  },
};

/* 生成兑换码 */
APP.pages['cdk-gen'] = {
  g: '礼包码', n: '生成兑换码', i: '🎟️', perm: 'cdkey.gen',
  render() {
    const db = DB.cache[DBP.cdkey] || { templates: [], codes: [] };
    const tpls = db.templates || [];
    return `<div class="ph"><h2>🎟️ 生成兑换码</h2><span class="tagx">CDKEY</span></div>
      <div class="card"><div class="card-t">生成参数</div>
        <div class="fld"><label>礼包模板</label><select id="cgTpl">
          ${tpls.length ? tpls.map((t) => `<option value="${U.esc(t.id)}">${U.esc(t.name)}（${U.esc(Object.keys(t.items || {}).map((k) => U.itemName(k) + '×' + t.items[k]).join('、'))}）</option>`).join('')
            : '<option value="">（请先创建模板）</option>'}
        </select></div>
        <div class="f3">
          <div class="fld"><label>生成数量</label><input id="cgN" type="number" value="10" min="1" max="200"></div>
          <div class="fld"><label>单码使用次数</label><input id="cgUse" type="number" value="1" min="1"></div>
          <div class="fld"><label>有效期(天)</label><input id="cgExp" type="number" value="30"></div>
        </div>
        <div class="f2">
          <div class="fld"><label>可兑换渠道</label><input id="cgCh" value="全渠道"></div>
          <div class="fld"><label>服务器范围</label><input id="cgSid" value="S1"></div>
        </div>
        <div class="kv"><span>绑定 UID（不填则不绑定）</span><b><input id="cgUid" placeholder="留空=通用码" style="width:150px"></b></div>
        <button class="btn blk" id="cgGo">🎟️ 生成</button>
      </div>
      <div class="card"><div class="card-t">最近生成的码 <span class="sub">可复制</span></div>
        <div id="cgOut"><div class="lbl">生成后显示在这里</div></div>
      </div>`;
  },
  bind() {
    const go = D('#cgGo');
    if (go) go.onclick = async () => {
      const tplId = this.val('#cgTpl');
      if (!tplId) return this.toast('请先创建礼包模板', 'err');
      const n = Math.max(1, Math.min(200, Math.floor(this.num('#cgN'))));
      const use = Math.max(1, Math.floor(this.num('#cgUse')));
      const exp = this.num('#cgExp');
      const db = await DB.get(DBP.cdkey, { templates: [], codes: [] });
      db.codes = db.codes || [];
      const made = [];
      for (let i = 0; i < n; i++) {
        const c = {
          code: U.code(12), tpl: tplId, maxUse: use, used: 0,
          exp: Date.now() + exp * 864e5,
          ch: this.val('#cgCh') || '全渠道', sid: this.val('#cgSid') || 'S1',
          bindUid: this.val('#cgUid').trim() || '', usedBy: [],
          status: '未使用', at: Date.now(),
        };
        db.codes.unshift(c); made.push(c.code);
      }
      if (await DB.set(DBP.cdkey, db, '生成礼包码 ' + n)) {
        AUDIT.log('生成礼包码', n + '个', '模板 ' + tplId);
        const box = D('#cgOut');
        if (box) box.innerHTML = `<textarea rows="8" style="width:100%;font-size:11px">${made.join('\n')}</textarea>
          <div class="lbl">共 ${made.length} 个，已同步到云端</div>`;
        this.toast('已生成 ' + n + ' 个码', 'ok');
      }
    };
  },
};

/* 查询 / 作废 */
APP.pages['cdk-query'] = {
  g: '礼包码', n: '查询 / 作废', i: '🔎', perm: 'cdkey.query',
  render() {
    const db = DB.cache[DBP.cdkey] || { codes: [] };
    const codes = db.codes || [];
    const kw = this.cdkKw || '';
    const list = codes.filter((c) => !kw || c.code.indexOf(kw.toUpperCase()) >= 0).slice(0, 60);
    const stat = { '未使用': 0, '已使用': 0, '作废': 0 };
    codes.forEach((c) => { const s = c.used >= c.maxUse ? '已使用' : (c.status === '作废' ? '作废' : '未使用'); stat[s] = (stat[s] || 0) + 1; });
    return `<div class="ph"><h2>🔎 礼包码查询</h2><span class="tagx">共 ${codes.length} 个</span></div>
      <div class="stats">
        <div class="st"><b>${stat['未使用']}</b><span>未使用</span></div>
        <div class="st"><b>${stat['已使用']}</b><span>已使用</span></div>
        <div class="st"><b>${stat['作废']}</b><span>已作废</span></div>
      </div>
      <div class="card">
        <div class="sb"><input id="ckKey" placeholder="搜索 CDKEY" value="${U.esc(kw)}">
          <button class="btn n sm" id="ckReload">刷新</button></div>
        <div style="overflow-x:auto"><table class="tb"><thead><tr>
          <th>CDKEY</th><th>模板</th><th>使用</th><th>兑换 UID</th><th>兑换时间</th><th>状态</th><th>操作</th>
        </tr></thead><tbody>
        ${list.map((c) => {
          const used = c.used >= c.maxUse;
          const st = c.status === '作废' ? '作废' : used ? '已使用' : '未使用';
          const tpl = (db.templates || []).find((t) => t.id === c.tpl);
          return `<tr><td style="font-size:10px"><b>${U.esc(c.code)}</b></td>
            <td>${U.esc(tpl ? tpl.name : c.tpl)}</td>
            <td>${c.used || 0}/${c.maxUse}</td>
            <td style="font-size:10px">${U.esc((c.usedBy || []).join(',') || '—')}</td>
            <td style="font-size:10px">${c.usedAt ? U.dt(c.usedAt) : '—'}</td>
            <td><span class="chipx ${st === '已使用' ? 'g' : st === '作废' ? '' : 'y'}">${st}</span></td>
            <td>${st === '作废' ? '' : `<button class="btn d sm" data-void="${U.esc(c.code)}">作废</button>`}</td></tr>`;
        }).join('') || '<tr><td colspan="7"><div class="lbl">无码</div></td></tr>'}
        </tbody></table></div>
      </div>`;
  },
  bind() {
    const r = D('#ckReload');
    if (r) r.onclick = async () => { await DB.reload(DBP.cdkey); this.render(); this.toast('已刷新', 'ok'); };
    const k = D('#ckKey');
    if (k) k.oninput = () => { this.cdkKw = k.value; this.render(); };
    DA('#body [data-void]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.cdkey, { codes: [] });
      const c = (db.codes || []).find((x) => x.code === b.dataset.void);
      if (c) c.status = '作废';
      if (await DB.set(DBP.cdkey, db, '作废礼包码')) {
        AUDIT.log('作废礼包码', b.dataset.void, '');
        this.toast('已作废', 'ok'); this.render();
      }
    }; });
  },
};

/* =========================================================
 * 四、GM 指令
 * ========================================================= */

/* 加属性 */
APP.pages['gm-attr'] = {
  g: 'GM 指令', n: '加属性', i: '⚡', perm: 'gm.attr',
  render() {
    const p = this.SEL;
    return `<div class="ph"><h2>⚡ GM 加属性</h2><span class="tagx">仅测试服</span></div>
      <div class="card"><div class="lbl" style="color:var(--red)">⚠ 正式服请关闭此功能，所有操作会记入日志</div></div>
      ${!p ? `${this.searchBar('gaKey')}<div class="plist">${this.view().slice(0, 16).map((x) => this.pcard(x)).join('') || '<div class="lbl">无</div>'}</div>`
        : `<div class="card"><div class="card-t">目标 <span class="sub">${U.esc(p.name)}</span></div>
        <div class="f2">
          <div class="fld"><label>属性</label><select id="gaAttr">
            <option value="lv">等级</option><option value="gold">金币</option>
            <option value="diamond">钻石</option><option value="ach">成就点</option>
            <option value="stamina">体力</option><option value="evToken">活动代币</option>
            <option value="charStar">角色星级</option><option value="gunLv">武器等级</option>
            <option value="xp">经验</option></select></div>
          <div class="fld"><label>增加值</label><input id="gaV" type="number" value="10"></div>
        </div>
        <div class="f2">
          <div class="fld"><label>持续时间(小时,0=永久)</label><input id="gaDur" type="number" value="0"></div>
          <div class="fld"><label>备注</label><input id="gaNote" placeholder="测试用途"></div>
        </div>
        <button class="btn o blk" id="gaGo">⚡ 执行</button>
        <button class="btn n blk" onclick="APP.SEL=null;APP.render()">← 切换玩家</button>
      </div>`}`;
  },
  bind() {
    this.bindSearch('gaKey'); this.bindSel();
    const go = D('#gaGo');
    if (go) go.onclick = async () => {
      const p = this.SEL; if (!p) return;
      const a = this.val('#gaAttr'), v = this.num('#gaV');
      p[a] = (p[a] || 0) + v;
      if (a === 'charStar') p.charStar = Math.min(5, p.charStar);
      if (await this.save(p)) {
        AUDIT.log('GM加属性', p.uid, a + ' +' + v + ' 备注:' + this.val('#gaNote'));
        this.toast(a + ' +' + v + ' 已生效', 'ok'); this.render();
      }
    };
  },
};

/* 解锁 */
APP.pages['gm-unlock'] = {
  g: 'GM 指令', n: '解锁内容', i: '🔓', perm: 'gm.unlock',
  render() {
    const p = this.SEL;
    return `<div class="ph"><h2>🔓 解锁关卡 / 武器</h2><span class="tagx">测试用</span></div>
      ${!p ? `${this.searchBar('guKey')}<div class="plist">${this.view().slice(0, 16).map((x) => this.pcard(x)).join('') || '<div class="lbl">无</div>'}</div>`
        : `<div class="card"><div class="card-t">目标 <span class="sub">${U.esc(p.name)}</span></div>
        <div class="fld"><label>解锁类型</label><select id="guT">
          <option value="level">全部关卡</option><option value="gun">全部武器</option>
          <option value="char">全部角色</option><option value="skin">全部皮肤</option>
          <option value="merc">全部佣兵</option><option value="talent">全部天赋</option></select></div>
        <div class="kv"><span>覆盖已有数据</span><b><input type="checkbox" id="guOw"></b></div>
        <button class="btn blk" id="guGo">🔓 执行解锁</button>
        <button class="btn g blk" id="guAll">🌟 一键全解锁</button>
        <button class="btn n blk" onclick="APP.SEL=null;APP.render()">← 切换玩家</button>
      </div>`}`;
  },
  bind() {
    this.bindSearch('guKey'); this.bindSel();
    const go = D('#guGo');
    if (go) go.onclick = async () => {
      const p = this.SEL; if (!p) return;
      const t = this.val('#guT');
      const ow = D('#guOw').checked;
      if (t === 'level') { p.cleared = p.cleared || {}; (EX.levels || []).forEach((l) => { if (ow || !p.cleared[l.id]) p.cleared[l.id] = 3; }); }
      else if (t === 'gun') p.gunOwn = ow ? (EX.guns || []).map((g) => g.id) : Array.from(new Set((p.gunOwn || []).concat((EX.guns || []).map((g) => g.id))));
      else if (t === 'char') p.chars = Array.from(new Set((p.chars || []).concat((EX.chars || []).map((c) => c.id))));
      else if (t === 'skin') p.skins = Array.from(new Set((p.skins || []).concat((EX.skins || []).map((s) => s.id))));
      else if (t === 'merc') p.mercs = Array.from(new Set((p.mercs || []).concat((EX.mercs || []).map((m) => m.id))));
      else if (t === 'talent') { p.talents = p.talents || {}; (EX.talents || []).forEach((x) => { p.talents[x.id] = x.max || 5; }); }
      if (await this.save(p)) { AUDIT.log('GM解锁', p.uid, t); this.toast('已解锁', 'ok'); this.render(); }
    };
    const all = D('#guAll');
    if (all) all.onclick = async () => {
      const p = this.SEL; if (!p) return;
      p.cleared = {}; (EX.levels || []).forEach((l) => { p.cleared[l.id] = 3; });
      p.gunOwn = (EX.guns || []).map((g) => g.id);
      p.chars = (EX.chars || []).map((c) => c.id);
      p.skins = (EX.skins || []).map((s) => s.id);
      p.mercs = (EX.mercs || []).map((m) => m.id);
      p.talents = {}; (EX.talents || []).forEach((x) => { p.talents[x.id] = x.max || 5; });
      if (await this.save(p)) { AUDIT.log('GM全解锁', p.uid, ''); this.toast('已全解锁', 'ok'); this.render(); }
    };
  },
};

/* 跳关卡 */
APP.pages['gm-level'] = {
  g: 'GM 指令', n: '设置通关', i: '🚩', perm: 'gm.level',
  render() {
    const p = this.SEL;
    const lvs = EX.levels || [];
    return `<div class="ph"><h2>🚩 跳关卡 / 通关记录</h2><span class="tagx">策划测试</span></div>
      ${!p ? `${this.searchBar('glKey')}<div class="plist">${this.view().slice(0, 16).map((x) => this.pcard(x)).join('') || '<div class="lbl">无</div>'}</div>`
        : `<div class="card"><div class="card-t">目标 <span class="sub">${U.esc(p.name)} · 已通关 ${Object.keys(p.cleared || {}).length} 关</span></div>
        <div class="f3">
          <div class="fld"><label>关卡</label><select id="glLv">
            ${lvs.map((l) => `<option value="${U.esc(l.id)}">${U.esc(l.id)} ${U.esc(l.n)}</option>`).join('')}</select></div>
          <div class="fld"><label>通关波次</label><input id="glWave" type="number" value="20"></div>
          <div class="fld"><label>星级(1-3)</label><input id="glStar" type="number" value="3" min="1" max="3"></div>
        </div>
        <div class="kv"><span>重置该关进度</span><b><input type="checkbox" id="glReset"></b></div>
        <button class="btn blk" id="glGo">🚩 设置</button>
        <button class="btn o blk" id="glAll">⏭ 全部关卡设为 3 星</button>
        <button class="btn d blk" id="glClear">🗑 清空通关记录</button>
        <button class="btn n blk" onclick="APP.SEL=null;APP.render()">← 切换玩家</button>
      </div>`}`;
  },
  bind() {
    this.bindSearch('glKey'); this.bindSel();
    const go = D('#glGo');
    if (go) go.onclick = async () => {
      const p = this.SEL; if (!p) return;
      p.cleared = p.cleared || {};
      const id = this.val('#glLv');
      if (D('#glReset').checked) delete p.cleared[id];
      else p.cleared[id] = Math.max(1, Math.min(3, this.num('#glStar')));
      if (await this.save(p)) { AUDIT.log('GM设置通关', p.uid, id); this.toast('已设置', 'ok'); this.render(); }
    };
    const all = D('#glAll');
    if (all) all.onclick = async () => {
      const p = this.SEL; if (!p) return;
      p.cleared = {}; (EX.levels || []).forEach((l) => { p.cleared[l.id] = 3; });
      if (await this.save(p)) { AUDIT.log('GM全通关', p.uid, ''); this.toast('已全部设为3星', 'ok'); this.render(); }
    };
    const cl = D('#glClear');
    if (cl) cl.onclick = async () => {
      const p = this.SEL; if (!p) return;
      if (!confirm('清空 ' + p.name + ' 的通关记录？')) return;
      p.cleared = {};
      if (await this.save(p)) { AUDIT.log('GM清空通关', p.uid, ''); this.toast('已清空', 'ok'); this.render(); }
    };
  },
};

/* 清背包 */
APP.pages['gm-clearbag'] = {
  g: 'GM 指令', n: '清空背包', i: '🧹', perm: 'gm.clear',
  render() {
    const p = this.SEL;
    return `<div class="ph"><h2>🧹 清空玩家背包</h2><span class="tagx">测试服</span></div>
      <div class="card"><div class="lbl" style="color:var(--red)">⚠ 正式服禁用，操作强制记入日志</div></div>
      ${!p ? `${this.searchBar('gcKey')}<div class="plist">${this.view().slice(0, 16).map((x) => this.pcard(x)).join('') || '<div class="lbl">无</div>'}</div>`
        : `<div class="card"><div class="card-t">目标 <span class="sub">${U.esc(p.name)}</span></div>
        <div class="kv"><span>材料总数</span><b>${Object.keys(p.mat || {}).reduce((s, k) => s + (p.mat[k] || 0), 0)}</b></div>
        <div class="kv"><span>消耗品总数</span><b>${Object.keys(p.use || {}).reduce((s, k) => s + (p.use[k] || 0), 0)}</b></div>
        <div class="kv"><span>芯片数</span><b>${Object.keys(p.chips || {}).length}</b></div>
        <div class="kv" style="color:var(--red)"><span>二次确认（输入 YES）</span><b><input id="gcOk" placeholder="YES" style="width:100px"></b></div>
        <button class="btn d blk" id="gcGo">🧹 确认清空</button>
        <button class="btn n blk" onclick="APP.SEL=null;APP.render()">← 切换玩家</button>
      </div>`}`;
  },
  bind() {
    this.bindSearch('gcKey'); this.bindSel();
    const go = D('#gcGo');
    if (go) go.onclick = async () => {
      const p = this.SEL; if (!p) return;
      if ((this.val('#gcOk') || '').trim().toUpperCase() !== 'YES') return this.toast('请输入 YES 二次确认', 'err');
      p.mat = {}; p.use = {}; p.chips = {}; p.bag = [];
      if (await this.save(p)) { AUDIT.log('GM清空背包', p.uid, '二次校验通过'); this.toast('已清空', 'ok'); this.render(); }
    };
  },
};
