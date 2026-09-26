/* =========================================================
 * p2.js —— 配置热更新 / 活动管理 / 成就商店 / 排行榜 / 数据统计
 * ========================================================= */

/* =========================================================
 * 五、配置热更新
 * ========================================================= */

/* 配置文件上传 */
APP.pages['hot-upload'] = {
  g: '配置热更新', n: '配置上传', i: '📤', perm: 'hotfix.upload',
  render() {
    return `<div class="ph"><h2>📤 配置文件上传</h2><span class="tagx">无需重启生效</span></div>
      <div class="card"><div class="card-t">上传新配置</div>
        <div class="fld"><label>配置表名称</label><select id="huName">
          <option value="cfg">数值配置 cfg</option>
          <option value="activity">活动配置 activity</option>
          <option value="achshop">成就商店 achshop</option>
          <option value="actshop">活动商店 actshop</option>
          <option value="rankrw">排行榜奖励 rankrw</option>
        </select></div>
        <div class="fld"><label>版本号</label><input id="huVer" value="v${Date.now().toString(36)}"></div>
        <div class="fld"><label>JSON 内容</label>
          <textarea id="huJson" rows="8" placeholder='{"STAMINA_MAX":200}'></textarea></div>
        <div class="f2">
          <div class="fld"><label>生效时间(小时,0=立即)</label><input id="huAt" type="number" value="0"></div>
          <div class="fld"><label>生效范围</label><select id="huScope">
            <option value="全服">全服生效</option><option value="测试服">测试服预生效</option></select></div>
        </div>
        <div class="kv"><span>MD5 校验</span><b id="huMd5">—</b></div>
        <button class="btn blk" id="huGo">📤 上传并生效</button>
        <div class="lbl">上传后会备份旧版本，可随时回滚</div>
      </div>
      ${this.hotHistory()}`;
  },
  bind() {
    const j = D('#huJson');
    if (j) j.oninput = () => {
      const t = j.value || '';
      let h = 0;
      for (let i = 0; i < t.length; i++) { h = ((h << 5) - h + t.charCodeAt(i)) | 0; }
      const e = D('#huMd5');
      if (e) e.textContent = t.length ? ('0x' + (h >>> 0).toString(16)) : '—';
    };
    const go = D('#huGo');
    if (go) go.onclick = async () => {
      const raw = this.val('#huJson').trim();
      if (!raw) return this.toast('请填 JSON', 'err');
      let obj;
      try { obj = JSON.parse(raw); } catch (e) { return this.toast('JSON 格式错误：' + e.message, 'err'); }
      const name = this.val('#huName');
      const path = DBP[name] || DBP.cfg;
      const old = await DB.get(path, {});
      /* 备份旧版 */
      const hf = await DB.get(DBP.hotfix, { list: [] });
      hf.list = hf.list || [];
      hf.list.unshift({ id: 'HF' + Date.now(), name: name, path: path, ver: this.val('#huVer'),
        scope: this.val('#huScope'), at: Date.now(), old: (() => { try { return JSON.parse(JSON.stringify(old)); } catch (e) { return {}; } })(), new: obj });
      if (hf.list.length > 20) hf.list.length = 20;
      const merged = Object.assign({}, old, obj);
      merged._hotfix = { ver: this.val('#huVer'), at: Date.now() + this.num('#huAt') * 36e5, scope: this.val('#huScope') };
      if (await DB.set(path, merged, '热更 ' + name + ' ' + this.val('#huVer'))
        && await DB.set(DBP.hotfix, hf, '热更历史')) {
        AUDIT.log('配置热更', name, '版本 ' + this.val('#huVer') + ' 范围 ' + this.val('#huScope'));
        this.toast('已上传并生效', 'ok'); this.render();
      }
    };
    /* 热更历史里的【对比】【回滚】：此前没有任何绑定代码，点了没反应 */
    DA('#body [data-hfview]').forEach((b) => { b.onclick = () => {
      this.diffId = b.dataset.hfview;
      this.go('hot-diff');
    }; });
    DA('#body [data-hfback]').forEach((b) => { b.onclick = async () => {
      const r = await APP.doRollback(b.dataset.hfback);
      if (r.ok) this.toast(r.msg, 'ok'); else if (r.msg) this.toast(r.msg, 'err');
      this.render();
    }; });
  },
};
/* 回滚（共用）：此前只有 hot-rollback 页自己实现一份，
 * 而 hotHistory() 生成在「配置上传」页的【对比】【回滚】按钮
 * 从生成起就没有绑定代码 —— 点了完全没反应（死按钮）。
 * 现在抽出共用方法，两个入口都走同一套「整体还原」逻辑。 */
APP.doRollback = async function (id) {
  const hf = await DB.get(DBP.hotfix, { list: [] });
  const h = (hf.list || []).find((x) => x.id === id);
  if (!h) return { ok: false, msg: '未找到该热更记录' };
  if (!confirm('确定回滚 ' + h.name + ' ' + h.ver + '？')) return { ok: false };
  const path = h.path || DBP.cfg;
  /* 必须整体还原：热更若新增字段，旧文件没有该键，
   * Object.assign(cur, old) 会保留新值 → 回滚等于没回滚。 */
  let back = {}; try { back = JSON.parse(JSON.stringify(h.old || {})); } catch (e) { back = {}; }
  delete back._hotfix;
  if (await DB.set(path, back, '回滚 ' + h.ver)) {
    AUDIT.log('热更回滚', h.name, '回滚到 ' + h.ver + ' 之前');
    return { ok: true, msg: '已回滚 ' + h.ver };
  }
  return { ok: false, msg: '回滚失败（网络不可达）' };
};

APP.hotHistory = function () {
  const hf = DB.cache[DBP.hotfix] || { list: [] };
  const l = (hf.list || []).slice(0, 10);
  return `<div class="card"><div class="card-t">热更历史 <span class="sub">${l.length} 条</span></div>
    ${l.map((h) => `<div class="row"><div class="zav sm">📄</div>
      <div class="rl"><b>${U.esc(h.name)} <span class="chipx">${U.esc(h.ver)}</span></b>
        <span>${U.esc(h.scope)} · ${U.dt(h.at)} · 改动 ${Object.keys(h.new || {}).length} 字段</span></div>
      <button class="btn n sm" data-hfview="${U.esc(h.id)}">对比</button>
      <button class="btn d sm" data-hfback="${U.esc(h.id)}">回滚</button></div>`).join('')
    || '<div class="lbl">暂无热更记录</div>'}</div>`;
};

/* 配置对比 */
APP.pages['hot-diff'] = {
  g: '配置热更新', n: '配置对比', i: '🔍', perm: 'hotfix.diff',
  render() {
    const hf = DB.cache[DBP.hotfix] || { list: [] };
    const l = hf.list || [];
    const id = this.diffId || (l[0] && l[0].id);
    const h = l.find((x) => x.id === id);
    let rows = '<div class="lbl">选择一条热更记录查看差异</div>';
    if (h) {
      const keys = Array.from(new Set(Object.keys(h.old || {}).concat(Object.keys(h.new || {}))));
      rows = keys.filter((k) => k.indexOf('_') !== 0).map((k) => {
        const o = h.old ? h.old[k] : undefined;
        const n = h.new ? h.new[k] : undefined;
        const same = JSON.stringify(o) === JSON.stringify(n);
        return `<tr style="${same ? '' : 'background:rgba(255,201,60,.12)'}">
          <td><b>${U.esc(k)}</b></td>
          <td style="color:var(--txt3)">${U.esc(JSON.stringify(o))}</td>
          <td style="color:${same ? 'var(--txt3)' : 'var(--yel)'}">${U.esc(JSON.stringify(n))}</td>
          <td>${same ? '' : '<span class="chipx y">改动</span>'}</td></tr>`;
      }).join('');
    }
    return `<div class="ph"><h2>🔍 配置预览对比</h2><span class="tagx">高亮改动</span></div>
      <div class="card"><div class="card-t">选择记录</div>
        <select id="hdSel" style="width:100%">${l.map((x) =>
          `<option value="${U.esc(x.id)}"${x.id === id ? ' selected' : ''}>${U.esc(x.name)} ${U.esc(x.ver)} · ${U.dt(x.at)}</option>`).join('')
          || '<option>暂无</option>'}</select>
      </div>
      <div class="card"><div class="card-t">差异 <span class="sub">黄色为改动行</span></div>
        <div style="overflow-x:auto"><table class="tb"><thead><tr>
          <th>字段</th><th>旧值</th><th>新值</th><th>状态</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      </div>`;
  },
  bind() {
    const s = D('#hdSel');
    if (s) s.onchange = () => { this.diffId = s.value; this.render(); };
  },
};

/* 热更回滚 */
APP.pages['hot-rollback'] = {
  g: '配置热更新', n: '热更回滚', i: '⏮️', perm: 'hotfix.rollback',
  render() {
    const hf = DB.cache[DBP.hotfix] || { list: [] };
    const l = hf.list || [];
    return `<div class="ph"><h2>⏮️ 热更回滚</h2><span class="tagx">一键切回上一版</span></div>
      <div class="card"><div class="card-t">可回滚记录</div>
        ${l.map((h) => `<div class="row"><div class="zav sm">📄</div>
          <div class="rl"><b>${U.esc(h.name)} <span class="chipx">${U.esc(h.ver)}</span></b>
            <span>${U.esc(h.scope)} · ${U.dt(h.at)}</span></div>
          <button class="btn d sm" data-rollback="${U.esc(h.id)}">回滚</button></div>`).join('')
          || '<div class="lbl">暂无可回滚记录</div>'}
      </div>
      <div class="card"><div class="card-t">回滚说明</div>
        <div class="lbl">回滚会把对应配置表恢复到该次热更【之前】的旧值，并记入审计日志。</div></div>`;
  },
  bind() {
    DA('#body [data-rollback]').forEach((b) => { b.onclick = async () => {
      const r = await APP.doRollback(b.dataset.rollback);
      if (r.ok) this.toast(r.msg, 'ok'); else if (r.msg) this.toast(r.msg, 'err');
      this.render();
    }; });
  },
};

/* =========================================================
 * 六、活动管理
 * ========================================================= */

/* 活动创建 */
APP.pages['act-create'] = {
  g: '活动管理', n: '活动创建', i: '🎉', perm: 'activity.create',
  render() {
    return `<div class="ph"><h2>🎉 活动创建</h2><span class="tagx">限时活动</span></div>
      <div class="card"><div class="card-t">基本信息</div>
        <div class="f2">
          <div class="fld"><label>活动名称</label><input id="acName" placeholder="如：尸潮突袭"></div>
          <div class="fld"><label>活动 ID</label><input id="acId" value="ACT${Date.now().toString(36).toUpperCase()}"></div>
        </div>
        <div class="f2">
          <div class="fld"><label>开始时间(小时后,0=立即)</label><input id="acS" type="number" value="0"></div>
          <div class="fld"><label>持续天数</label><input id="acD" type="number" value="7"></div>
        </div>
        <div class="f2">
          <div class="fld"><label>参与等级下限</label><input id="acLv" type="number" value="1"></div>
          <div class="fld"><label>最少通关数</label><input id="acC" type="number" value="0"></div>
        </div>
        <div class="fld"><label>活动关卡</label><select id="acLevel">
          ${(EX.levels || []).slice(0, 30).map((l) => `<option value="${U.esc(l.id)}">${U.esc(l.id)} ${U.esc(l.n)}</option>`).join('')}</select></div>
        <div class="fld"><label>活动描述</label><input id="acDesc" placeholder="如：限定BOSS战，每日3次"></div>
        <div class="card-t" style="margin-top:10px">活动奖励
          <span class="sub">此前无奖励配置 → 游戏端 rw 恒为空，活动有但没东西可领</span></div>
        <div class="f2">
          <div class="fld"><label>奖励物品</label>${U.picker('acItem', 'gold')}</div>
          <div class="fld"><label>数量</label><input id="acN" type="number" value="100"></div>
        </div>
        <button class="btn blk" id="acGo">🎉 创建活动</button>
      </div>`;
  },
  bind() {
    const go = D('#acGo');
    if (go) go.onclick = async () => {
      const name = this.val('#acName').trim();
      if (!name) return this.toast('请填活动名称', 'err');
      const db = await DB.get(DBP.activity, { list: [] });
      db.list = db.list || [];
      const s = Date.now() + this.num('#acS') * 36e5;
      /* 奖励：表单此前完全没有奖励项，创建出的活动 rw 恒为空对象，
       * 玩家参与后什么也领不到。现在按物品+数量写入 rw。 */
      const rw = {};
      const it = this.val('#acItem'), n2 = this.num('#acN');
      if (it && n2 > 0) rw[it] = n2;
      db.list.unshift({ id: this.val('#acId'), name: name,
        desc: this.val('#acDesc') || '',
        rw: rw,
        startAt: s, endAt: s + this.num('#acD') * 864e5,
        cond: { lvMin: this.num('#acLv'), clearedMin: this.num('#acC') },
        levelId: this.val('#acLevel'), shop: [], status: '待开启', createdAt: Date.now() });
      if (await DB.set(DBP.activity, db, '创建活动 ' + name)) {
        AUDIT.log('创建活动', name, this.val('#acId'));
        this.toast('活动已创建', 'ok'); this.render();
      }
    };
  },
};

/* 活动启停 */
APP.pages['act-switch'] = {
  g: '活动管理', n: '活动启停', i: '🎚️', perm: 'activity.switch',
  render() {
    const db = DB.cache[DBP.activity] || { list: [] };
    const l = db.list || [];
    const now = Date.now();
    const calc = (a) => a.status === '强制下架' ? '强制下架'
      : now < a.startAt ? '待开启' : now > a.endAt ? '已结束' : '运行中';
    return `<div class="ph"><h2>🎚️ 活动启停</h2><span class="tagx">${l.length} 个活动</span></div>
      <div class="card"><div class="card-t">活动列表</div>
        <button class="btn n sm" id="asReload">刷新</button>
        ${l.map((a) => {
          const st = calc(a);
          const sc = st === '运行中' ? 'g' : st === '强制下架' ? '' : 'y';
          return `<div class="row"><div class="zav sm">🎉</div>
            <div class="rl"><b>${U.esc(a.name)}</b>
              <span>${U.esc(a.id)} · ${U.dt(a.startAt)} ~ ${U.dt(a.endAt)} · 关卡 ${U.esc(a.levelId || '—')}</span></div>
            <span class="chipx ${sc}">${st}</span>
            ${st === '强制下架' ? `<button class="btn g sm" data-acton="${U.esc(a.id)}">恢复</button>`
              : `<button class="btn d sm" data-actoff="${U.esc(a.id)}">下架</button>`}
            <button class="btn n sm" data-actdel="${U.esc(a.id)}">删除</button></div>`;
        }).join('') || '<div class="lbl">暂无活动</div>'}
      </div>
      <div class="card"><div class="card-t">下架提示文案</div>
        <div class="fld"><label>强制下架时玩家看到的提示</label><input id="asMsg" value="该活动已临时下架，敬请期待"></div>
        <button class="btn o blk" id="asSaveMsg">保存文案</button>
      </div>`;
  },
  bind() {
    const r = D('#asReload');
    if (r) r.onclick = async () => { await DB.reload(DBP.activity); this.render(); this.toast('已刷新', 'ok'); };
    DA('#body [data-actoff]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.activity, { list: [] });
      const a = (db.list || []).find((x) => x.id === b.dataset.actoff);
      if (a) { a.status = '强制下架'; a.offMsg = this.val('#asMsg'); }
      if (await DB.set(DBP.activity, db, '下架活动')) {
        AUDIT.log('活动下架', a ? a.name : b.dataset.actoff, this.val('#asMsg'));
        this.toast('已下架', 'ok'); this.render();
      }
    }; });
    DA('#body [data-acton]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.activity, { list: [] });
      const a = (db.list || []).find((x) => x.id === b.dataset.acton);
      if (a) a.status = '待开启';
      if (await DB.set(DBP.activity, db, '恢复活动')) { this.toast('已恢复', 'ok'); this.render(); }
    }; });
    DA('#body [data-actdel]').forEach((b) => { b.onclick = async () => {
      if (!confirm('删除该活动？')) return;
      const db = await DB.get(DBP.activity, { list: [] });
      db.list = (db.list || []).filter((x) => x.id !== b.dataset.actdel);
      if (await DB.set(DBP.activity, db, '删除活动')) { this.toast('已删除', 'ok'); this.render(); }
    }; });
    const sm = D('#asSaveMsg');
    if (sm) sm.onclick = async () => {
      const db = await DB.get(DBP.activity, { list: [] });
      db.offMsg = this.val('#asMsg');
      await DB.set(DBP.activity, db, '保存下架文案'); this.toast('已保存', 'ok');
    };
  },
};

/* 活动商店配置 */
APP.pages['act-shop'] = {
  g: '活动管理', n: '活动商店', i: '🏪', perm: 'activity.shop',
  render() {
    const db = DB.cache[DBP.actshop] || { list: [] };
    const l = db.list || [];
    const acts = (DB.cache[DBP.activity] || { list: [] }).list || [];
    return `<div class="ph"><h2>🏪 活动商店配置</h2><span class="tagx">${l.length} 件商品</span></div>
      <div class="card"><div class="card-t">新增商品</div>
        <div class="f2">
          <div class="fld"><label>所属活动</label><select id="ashAct">
            ${acts.length ? acts.map((a) => `<option value="${U.esc(a.id)}">${U.esc(a.name)}</option>`).join('')
              : '<option value="">（通用）</option>'}</select></div>
          <div class="fld"><label>兑换道具</label>${U.picker('ashItem', 'M02')}</div>
        </div>
        <div class="f3">
          <div class="fld"><label>数量</label><input id="ashN" type="number" value="10"></div>
          <div class="fld"><label>消耗代币</label><input id="ashCost" type="number" value="100"></div>
          <div class="fld"><label>单人总限购</label><input id="ashLim" type="number" value="1"></div>
        </div>
        <div class="f2">
          <div class="fld"><label>每日限购</label><input id="ashDay" type="number" value="0"></div>
          <div class="fld"><label>刷新间隔(小时,0=不刷新)</label><input id="ashRef" type="number" value="24"></div>
        </div>
        <button class="btn blk" id="ashGo">➕ 添加商品</button>
      </div>
      <div class="card"><div class="card-t">商品列表</div>
        ${l.map((it) => `<div class="row"><div class="zav sm">🎁</div>
          <div class="rl"><b>${U.esc(U.itemName(it.item))} ×${it.n}</b>
            <span>活动 ${U.esc(it.act || '通用')} · 限购 ${it.limit} · 每日 ${it.daily || 0} · 刷新 ${it.refresh || 0}h</span></div>
          <span class="chipx y">${it.cost} 代币</span>
          <button class="btn d sm" data-ashdel="${U.esc(it.id)}">删除</button></div>`).join('')
          || '<div class="lbl">暂无商品</div>'}
      </div>`;
  },
  bind() {
    const go = D('#ashGo');
    if (go) go.onclick = async () => {
      const db = await DB.get(DBP.actshop, { list: [] });
      db.list = db.list || [];
      const it2 = this.val('#ashItem'), n2 = this.num('#ashN'), c2 = this.num('#ashCost');
      /* 同成就商店：空记录会把游戏端活动商店的 12 件默认商品清成 0 */
      if (!it2) return this.toast('请先选择物品', 'err');
      if (!(n2 > 0)) return this.toast('数量必须大于 0', 'err');
      if (!(c2 >= 0)) return this.toast('价格不能为负', 'err');
      db.list.unshift({ id: 'AS' + Date.now(), act: this.val('#ashAct'),
        item: it2, n: n2, cost: c2,
        limit: this.num('#ashLim'), daily: this.num('#ashDay'), refresh: this.num('#ashRef') });
      if (await DB.set(DBP.actshop, db, '添加活动商品')) { this.toast('已添加', 'ok'); this.render(); }
    };
    DA('#body [data-ashdel]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.actshop, { list: [] });
      db.list = (db.list || []).filter((x) => x.id !== b.dataset.ashdel);
      await DB.set(DBP.actshop, db, '删除商品'); this.toast('已删除', 'ok'); this.render();
    }; });
  },
};

/* =========================================================
 * 七、成就商店管理
 * ========================================================= */
APP.pages['ach-shop'] = {
  g: '成就商店', n: '商品配置', i: '🏅', perm: 'achshop.config',
  render() {
    const db = DB.cache[DBP.achshop] || { list: [] };
    const l = db.list || [];
    return `<div class="ph"><h2>🏅 成就商店配置</h2><span class="tagx">${l.length} 件</span></div>
      <div class="card"><div class="card-t">新增兑换项</div>
        <div class="f2">
          <div class="fld"><label>兑换物品</label>${U.picker('ahItem', 'M03')}</div>
          <div class="fld"><label>数量</label><input id="ahN" type="number" value="5"></div>
        </div>
        <div class="f3">
          <div class="fld"><label>消耗成就点</label><input id="ahCost" type="number" value="100"></div>
          <div class="fld"><label>单人限购</label><input id="ahLim" type="number" value="1"></div>
          <div class="fld"><label>刷新周期(天,0=不刷)</label><input id="ahRef" type="number" value="7"></div>
        </div>
        <div class="fld"><label>解锁条件</label><input id="ahUnlock" placeholder="如：通关10关 / 留空=无条件"></div>
        <button class="btn blk" id="ahGo">➕ 添加</button>
      </div>
      <div class="card"><div class="card-t">当前配置</div>
        ${l.map((it) => `<div class="row"><div class="zav sm">🏅</div>
          <div class="rl"><b>${U.esc(U.itemName(it.item))} ×${it.n}</b>
            <span>限购 ${it.limit} · 刷新 ${it.refresh || 0}天 · ${U.esc(it.unlock || '无条件')}</span></div>
          <span class="chipx y">${it.cost} 点</span>
          <button class="btn d sm" data-ahdel="${U.esc(it.id)}">删除</button></div>`).join('')
          || '<div class="lbl">暂无配置</div>'}
      </div>
      <div class="card"><div class="lbl">玩家在游戏「兑换 → 成就商店」中消耗成就点兑换</div></div>`;
  },
  bind() {
    const go = D('#ahGo');
    if (go) go.onclick = async () => {
      const db = await DB.get(DBP.achshop, { list: [] });
      db.list = db.list || [];
      const it = this.val('#ahItem'), n = this.num('#ahN'), cost = this.num('#ahCost');
      /* 校验：此前点"添加"不校验，会产生 { item:'', n:0, cost:0 } 的空记录。
       * 这条空记录上传云端后，游戏端过滤掉它 → 成就商店 12 件商品被清成 0 件，
       * 玩家进商店什么都没有（线上已发生）。这里拦住空记录。 */
      if (!it) return this.toast('请先选择物品', 'err');
      if (!(n > 0)) return this.toast('数量必须大于 0', 'err');
      if (!(cost >= 0)) return this.toast('价格不能为负', 'err');
      db.list.unshift({ id: 'AH' + Date.now(), item: it, n: n,
        cost: cost, limit: this.num('#ahLim'), refresh: this.num('#ahRef'),
        unlock: this.val('#ahUnlock') });
      if (await DB.set(DBP.achshop, db, '添加成就商店商品')) {
        AUDIT.log('配置成就商店', U.itemName(it), cost + '点');
        this.toast('已添加', 'ok'); this.render();
      }
    };
    DA('#body [data-ahdel]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.achshop, { list: [] });
      db.list = (db.list || []).filter((x) => x.id !== b.dataset.ahdel);
      await DB.set(DBP.achshop, db, '删除成就商店商品'); this.toast('已删除', 'ok'); this.render();
    }; });
  },
};

/* =========================================================
 * 八、排行榜管理
 * ========================================================= */

/* 刷新控制 */
APP.pages['rank-refresh'] = {
  g: '排行榜', n: '刷新控制', i: '🏆', perm: 'rank.refresh',
  render() {
    const lb = DB.cache[DBP.rank] || {};
    const en = DB.cache[DBP.endless] || {};
    return `<div class="ph"><h2>🏆 排行榜刷新</h2><span class="tagx">手动重算</span></div>
      <div class="stats">
        <div class="st"><b>${(lb.list || []).length}</b><span>战力榜条目</span></div>
        <div class="st"><b>${(en.list || []).length}</b><span>无尽榜条目</span></div>
        <div class="st"><b>${U.ago(lb.updated)}</b><span>战力榜更新</span></div>
      </div>
      <div class="card"><div class="card-t">战力榜 <span class="sub">无尽生存 / 战力榜</span></div>
        <div class="fld"><label>榜单缓存时间(分钟)</label><input id="rrCache" type="number" value="${(lb.cacheMin != null ? lb.cacheMin : 60)}"></div>
        <button class="btn n sm" id="rrSaveCache">💾 保存缓存时间</button>
        <button class="btn blk" id="rrGo">🏆 重建战力榜</button>
        <button class="btn o blk" id="rrGo2">♾️ 重建无尽榜</button>
        <button class="btn g blk" id="rrGo3">🔄 全部重建</button>
      </div>
      <div class="card"><div class="card-t">当前战力榜 TOP 10</div>
        ${(lb.list || []).slice(0, 10).map((x, i) => `<div class="row">
          <div class="zav sm">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</div>
          <div class="rl"><b>${U.esc(x.name)}</b><span>Lv.${x.lv || 1} · ${U.esc(x.uid)}</span></div>
          <b style="color:var(--gold)">${U.fmt(x.pw)}</b></div>`).join('') || '<div class="lbl">暂无</div>'}
      </div>
      <div class="card"><div class="card-t">当前无尽榜 TOP 10</div>
        ${(en.list || []).slice(0, 10).map((x, i) => `<div class="row">
          <div class="zav sm">${i + 1}</div>
          <div class="rl"><b>${U.esc(x.name)}</b><span>${U.esc(x.uid)}</span></div>
          <b style="color:var(--gold)">无尽 ${Math.floor(x.t || 0)} 层</b></div>`).join('') || '<div class="lbl">暂无</div>'}
      </div>`;
  },
  bind() {
    const build = async (kind) => {
      /* 统一口径：榜单行一律由 E.rankRow 产出。
       * 此前两处各自手写半套键（战力榜 5 键、无尽榜 4 键），
       * 而游戏端面板要读 u/n/eb/pw/ev/lv —— 重建后 eb、pw 读不到，
       * 表现为「后台点一次重建，全服玩家无尽层数显示 0」。
       * char 是后台列表展示专用，补在统一行之后（不污染游戏端字段）。 */
      const RR = (p) => Object.assign(
        (window.E && E.rankRow)
          ? E.rankRow(p)
          : { uid: p.uid, u: p.uid, name: p.name, n: p.name, lv: p.lv || 1,
              pw: U.pw(p), eb: p.endlessBest || 0, t: p.endlessBest || 0,
              ev: p.evScore || 0, at: Date.now() },
        { char: p.char });
      /* 重建 = 重算，但必须【并入旧榜】而非整体覆盖：
       * 若某个玩家存档这次读取失败（PLIST_FAIL），整体覆盖会把他直接从榜上
       * 抹掉 —— 他打出来的历史最佳层数再也回不来。
       * 现在：以旧榜为底，用 PLIST 的新值合并覆盖，读不到的保留旧行。 */
      const rebuild = async (path, sortKey, label) => {
        const oldL = ((await DB.get(path, { list: [] })) || {}).list || [];
        const m = new Map();
        oldL.forEach((r) => { const k = r.uid || r.u; if (k) m.set(k, r); });
        this.PLIST.forEach((p) => {
          const k = p.uid; if (!k) return;
          const prev = m.get(k);
          m.set(k, (window.E && E.mergeRankRow) ? E.mergeRankRow(prev, RR(p))
            : Object.assign({}, prev, RR(p)));
        });
        const list = [...m.values()]
          .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)).slice(0, 50);
        await DB.set(path, { list: list, updated: Date.now() }, label);
        return list.length;
      };
      if (kind === 'pw' || kind === 'all') {
        const n = await rebuild(DBP.rank, 'pw', '重建战力榜');
        this.toast('战力榜已重建 ' + n + ' 条', 'ok');
      }
      if (kind === 'endless' || kind === 'all') {
        const n = await rebuild(DBP.endless, 't', '重建无尽榜');
        this.toast('无尽榜已重建 ' + n + ' 条', 'ok');
      }
      AUDIT.log('重建排行榜', kind, '');
      this.render();
    };
    /* 此前 rrCache 只是个摆设输入框，填了不保存、游戏端也无从读取 ——
     * 文档要求「设置榜单缓存时间」，现在落到云端并展示当前值。 */
    const sc2 = D('#rrSaveCache');
    if (sc2) sc2.onclick = async () => {
      const lb = await DB.get(DBP.rank, { list: [] });
      lb.cacheMin = Math.max(1, this.num('#rrCache'));
      if (await DB.set(DBP.rank, lb, '设置榜单缓存时间')) {
        AUDIT.log('榜单缓存时间', lb.cacheMin + '分钟', '');
        this.toast('已保存：' + lb.cacheMin + ' 分钟', 'ok'); this.render();
      }
    };
    const a = D('#rrGo'); if (a) a.onclick = () => build('pw');
    const b = D('#rrGo2'); if (b) b.onclick = () => build('endless');
    const c = D('#rrGo3'); if (c) c.onclick = () => build('all');
  },
};

/* 排行榜奖励配置 */
APP.pages['rank-reward'] = {
  g: '排行榜', n: '奖励配置', i: '🎖️', perm: 'rank.reward',
  render() {
    const db = DB.cache[DBP.rankrw] || { list: [] };
    const l = db.list || [];
    return `<div class="ph"><h2>🎖️ 排行榜奖励配置</h2><span class="tagx">按名次段</span></div>
      <div class="card"><div class="card-t">新增名次段</div>
        <div class="f3">
          <div class="fld"><label>榜单类型</label><select id="rwBoard">
            <option value="无尽生存榜">无尽生存榜</option>
            <option value="战力榜">战力榜</option>
            <option value="活动冲榜">活动冲榜</option></select></div>
          <div class="fld"><label>名次起</label><input id="rwA" type="number" value="1"></div>
          <div class="fld"><label>名次止</label><input id="rwB" type="number" value="3"></div>
        </div>
        <div class="f3">
          <div class="fld"><label>奖励物品</label>${U.picker('rwItem', 'diamond')}</div>
          <div class="fld"><label>数量</label><input id="rwN" type="number" value="500"></div>
          <div class="fld"><label>结算周期(天,0=无周期)</label><input id="rwT" type="number" value="7"></div>
        </div>
        <div class="fld"><label>奖励叠加</label><select id="rwS">
          <option value="0">不叠加</option><option value="1">叠加</option></select></div>
        <button class="btn blk" id="rwGo">➕ 添加名次段</button>
      </div>
      <div class="card"><div class="card-t">已配置</div>
        ${l.map((r) => `<div class="row"><div class="zav sm">🎖️</div>
          <div class="rl"><b>${U.esc(r.board || '无尽生存榜')} 第 ${r.a} - ${r.b} 名</b>
            <span>${U.esc(U.itemName(r.item))} ×${r.n} · 周期 ${r.settle || 0} 天 · ${r.stack ? '叠加' : '不叠加'}</span></div>
          <button class="btn d sm" data-rwdel="${U.esc(r.id)}">删除</button></div>`).join('')
          || '<div class="lbl">暂无配置</div>'}
      </div>
      <div class="card"><div class="lbl">榜单结算时自动按名次发邮件奖励</div></div>`;
  },
  bind() {
    const go = D('#rwGo');
    if (go) go.onclick = async () => {
      const db = await DB.get(DBP.rankrw, { list: [] });
      db.list = db.list || [];
      db.list.unshift({ id: 'RW' + Date.now(), board: this.val('#rwBoard') || '无尽生存榜',
        a: this.num('#rwA'), b: this.num('#rwB'),
        item: this.val('#rwItem'), n: this.num('#rwN'), settle: this.num('#rwT'),
        stack: this.val('#rwS') === '1' });
      if (await DB.set(DBP.rankrw, db, '配置排行榜奖励')) { this.toast('已添加', 'ok'); this.render(); }
    };
    DA('#body [data-rwdel]').forEach((b) => { b.onclick = async () => {
      const db = await DB.get(DBP.rankrw, { list: [] });
      db.list = (db.list || []).filter((x) => x.id !== b.dataset.rwdel);
      await DB.set(DBP.rankrw, db, '删除名次段'); this.toast('已删除', 'ok'); this.render();
    }; });
  },
};

/* =========================================================
 * 九、数据统计面板
 * ========================================================= */

/* 实时在线 */
APP.pages['stat-online'] = {
  g: '数据统计', n: '实时在线', i: '📶', perm: 'stat.view',
  render() {
    const now = Date.now();
    const on1h = this.PLIST.filter((p) => now - (p.lastSeen || 0) < 36e5).length;
    const on24 = this.PLIST.filter((p) => now - (p.lastSeen || 0) < 864e5).length;
    const servers = {};
    this.PLIST.forEach((p) => { const s = (p.ext && p.ext.server) || 'S1'; servers[s] = (servers[s] || 0) + 1; });
    const today = this.PLIST.filter((p) => now - (p.created || 0) < 864e5).length;
    return `<div class="ph"><h2>📶 实时在线人数</h2><span class="tagx">按最后登录推算</span></div>
      <div class="stats">
        <div class="st"><b>${on1h}</b><span>1小时内活跃</span></div>
        <div class="st"><b>${on24}</b><span>24小时内活跃</span></div>
        <div class="st"><b>${this.PLIST.length}</b><span>累计注册</span></div>
        <div class="st"><b>${today}</b><span>今日新增</span></div>
      </div>
      <div class="card"><div class="card-t">分服务器</div>
        ${Object.keys(servers).map((s) => {
          const n = servers[s];
          const act = this.PLIST.filter((p) => ((p.ext && p.ext.server) || 'S1') === s
            && now - (p.lastSeen || 0) < 864e5).length;
          return `<div class="bar"><div class="bn"><span>${U.esc(s)}</span><b>活跃 ${act} / 注册 ${n}</b></div>
            <div class="bg"><div class="bf" style="width:${n ? Math.round(act / n * 100) : 0}%"></div></div></div>`;
        }).join('') || '<div class="lbl">无数据</div>'}
      </div>
      <div class="card"><div class="card-t">设备平台占比</div>
        <div class="lbl">单机架构未采集设备信息（可在「玩家查询 → 账号资料」手工补录设备 ID 后统计）</div>
      </div>
      <div class="card"><div class="lbl">⚠ 说明：本后台以 GitHub 存档为数据源，没有常驻服务器，
        无法统计真实并发。「活跃」= 最后登录时间在统计窗口内的存档数。</div></div>`;
  },
  bind() {},
};

/* 留存统计 */
APP.pages['stat-retain'] = {
  g: '数据统计', n: '留存统计', i: '📈', perm: 'stat.view',
  render() {
    const now = Date.now();
    /* 留存 = 第 N 天回访 / 第 N 天前注册的同批人（同期群口径）
     *
     * 严重 BUG 修复：原实现在判定里加了
     *     || (p.lastSeen || 0) >= now - 864e5
     * 含义是「最近 24 小时活跃过就算留存」—— 与窗口天数无关。
     * 结果：只要玩家今天上线过，1/3/7/30 日留存全部命中，
     * 实测三个窗口都是 100%，留存曲线完全失真、无法用于运营决策。
     *
     * 现在按标准同期群算法：
     *   ① 分母 = 注册时间落在 [N+1 天前, N 天前) 这同一天的人
     *   ② 分子 = 其中最后登录时间晚于「注册时间 + N 天」的人
     * 这样 1/3/7/30 日留存才会呈现正常的递减曲线。 */
    const dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const calc = (days) => {
      /* 观察基准：days 天前的那个自然日 0 点 */
      const base = dayStart(now - days * 864e5);
      const born = this.PLIST.filter((p) => {
        const c = p.created || 0;
        return c >= base && c < base + 864e5;
      });
      if (!born.length) return { n: 0, r: 0, born: 0 };
      /* 口径修正：回访判定必须用自然日 0 点，不能用「注册时刻 + N×24 小时」。
       * BUG：此前写的是 lastSeen >= created + days*864e5 —— 把 24 小时的
       *   小时级偏移也算进去，导致留存率取决于玩家【注册时的钟点】：
       *   · 23:50 注册的人，次日 10:00 回来 ≠ 次日留存（要熬到 23:50 后）
       *   · 30 日留存更极端：基准日 20:00 注册的人需要 lastSeen ≥ 今天 20:00，
       *     而现在才 14:00 —— 他【根本不可能】被统计到，30 日留存永远为 0
       * 结果：留存率被系统性低估，且随统计时刻漂移，无法用于运营决策。
       * 现在按标准口径：第 N 日 = 注册日往后第 N 个自然日，当天 0 点起算。 */
      const back = born.filter((p) => (p.lastSeen || 0) >= dayStart((p.created || 0) + days * 864e5));
      return { n: back.length, r: Math.round(back.length / born.length * 100), born: born.length };
    };
    const r1 = calc(1), r3 = calc(3), r7 = calc(7), r30 = calc(30);
    const rows = [['次日留存(1日)', r1], ['3日留存', r3], ['7日留存', r7], ['30日留存', r30]];
    return `<div class="ph"><h2>📈 留存统计</h2><span class="tagx">分渠道</span></div>
      <div class="stats">
        ${rows.map(([n, o]) => `<div class="st"><b>${o.r}%</b><span>${n}</span></div>`).join('')}
      </div>
      <div class="card"><div class="card-t">明细</div>
        <table class="tb"><thead><tr><th>类型</th><th>基数</th><th>留存人数</th><th>留存率</th></tr></thead>
        <tbody>${rows.map(([n, o]) => `<tr><td>${n}</td><td>${o.born}</td><td>${o.n}</td>
          <td><b class="${o.r >= 30 ? 'g' : o.r >= 10 ? 'y' : 'r'}">${o.r}%</b></td></tr>`).join('')}</tbody></table>
      </div>
      <div class="card"><div class="card-t">分渠道</div>
        <div class="lbl">渠道字段在单机架构下未自动采集，可在「玩家查询 → 账号资料」补录后统计</div>
      </div>
      <div class="card"><div class="card-t">导出</div>
        <button class="btn n blk" id="rtExport">📊 导出留存报表 CSV</button>
      </div>`;
  },
  bind() {
    const e = D('#rtExport');
    if (e) e.onclick = () => {
      const rows = this.PLIST.map((p) => [p.uid, p.name, p.lv || 1,
        U.dt(p.created), U.dt(p.lastSeen)]);
      /* 走 U.csv：单元格转义（昵称含逗号/引号/换行不再破坏列）+ 带 BOM（Excel 中文不乱码） */
      const csv = U.csv(['UID', '昵称', '等级', '注册时间', '最后登录'], rows);
      U.download('留存数据.csv', csv, 'text/csv');
      this.toast('已导出 ' + this.PLIST.length + ' 条', 'ok');
    };
  },
};

/* 广告统计 */
APP.pages['stat-ad'] = {
  g: '数据统计', n: '广告统计', i: '📺', perm: 'stat.view',
  render() {
    /* 口径修复：p.adUsed 每天清零（游戏端 adLeft 里按 dailyKey 重置），
     * 而本页标签写的是「总观看次数 / 人均观看」——此前直接读 adUsed，
     * 于是后台看到的永远是【今日】数据，累计值一条都没有。
     * 现在：累计读 p.adTotal（不清零，游戏端 useAd 已同步累加），
     *      另起一栏展示今日 adUsed，两者不再混为一谈。 */
    const tally = (field) => {
      let revive = 0, dbl = 0, stam = 0, total = 0;
      this.PLIST.forEach((p) => {
        const a = p[field] || {};
        Object.keys(a).forEach((k) => {
          const v = a[k] || 0; total += v;
          if (k === 'AD01' || k === 'AD04') revive += v;
          else if (k === 'AD02') dbl += v;
          else stam += v;
        });
      });
      return { revive, dbl, stam, total };
    };
    const T = tally('adTotal'), D = tally('adUsed');
    const n = Math.max(1, this.PLIST.length);
    const bars = (t) => [['复活广告', t.revive], ['双倍奖励广告', t.dbl], ['体力/其他', t.stam]].map(([nm, v]) => {
      const max = Math.max(1, t.revive, t.dbl, t.stam);
      return `<div class="bar"><div class="bn"><span>${nm}</span><b>${v}</b></div>
        <div class="bg"><div class="bf" style="width:${Math.round(v / max * 100)}%"></div></div></div>`;
    }).join('');
    return `<div class="ph"><h2>📺 广告数据统计</h2><span class="tagx">场景分布</span></div>
      <div class="stats">
        <div class="st"><b>${T.total}</b><span>总观看次数(累计)</span></div>
        <div class="st"><b>${(T.total / n).toFixed(1)}</b><span>人均观看(累计)</span></div>
        <div class="st"><b>${D.total}</b><span>今日观看</span></div>
        <div class="st"><b>${T.revive}</b><span>复活广告</span></div>
        <div class="st"><b>${T.dbl}</b><span>双倍奖励</span></div>
        <div class="st"><b>${T.stam}</b><span>体力/其他</span></div>
      </div>
      <div class="card"><div class="card-t">累计场景分布</div>${bars(T)}</div>
      <div class="card"><div class="card-t">今日场景分布 <span class="sub">adUsed 每日重置</span></div>${bars(D)}</div>
      <div class="card"><div class="lbl">⚠ 单机架构未接入广告 SDK，曝光/点击/收益数据无法采集。
        此处统计的是游戏内「已观看次数」（存档 adUsed 字段）。</div></div>`;
  },
  bind() {},
};

/* 付费统计 */
APP.pages['stat-pay'] = {
  g: '数据统计', n: '付费统计', i: '💳', perm: 'stat.view',
  render() {
    const db = DB.cache[DBP.order] || { list: [] };
    const l = db.list || [];
    const done = l.filter((o) => o.status === '已发放');
    const amt = done.reduce((s, o) => s + (o.amt || 0), 0);
    const users = Array.from(new Set(done.map((o) => o.uid))).length;
    const arpu = this.PLIST.length ? (amt / this.PLIST.length).toFixed(2) : 0;
    const arppu = users ? (amt / users).toFixed(2) : 0;
    return `<div class="ph"><h2>💳 付费统计</h2><span class="tagx">${l.length} 笔订单</span></div>
      <div class="stats">
        <div class="st"><b>${users}</b><span>付费人数</span></div>
        <div class="st"><b>${amt}</b><span>总金额(元)</span></div>
        <div class="st"><b>${arpu}</b><span>ARPU</span></div>
        <div class="st"><b>${arppu}</b><span>ARPPU</span></div>
      </div>
      <div class="card"><div class="card-t">手工录入订单 <span class="sub">单机架构无支付回调</span></div>
        <div class="f3">
          <div class="fld"><label>订单号</label><input id="pyNo" value="ORD${Date.now()}"></div>
          <div class="fld"><label>玩家 UID</label><input id="pyUid" placeholder="u1"></div>
          <div class="fld"><label>金额(元)</label><input id="pyAmt" type="number" value="6"></div>
        </div>
        <div class="f2">
          <div class="fld"><label>支付渠道</label><input id="pyCh" value="微信"></div>
          <div class="fld"><label>状态</label><select id="pySt">
            <option>已发放</option><option>待发货</option><option>失败</option></select></div>
        </div>
        <button class="btn blk" id="pyGo">➕ 录入订单</button>
      </div>
      <div class="card"><div class="card-t">订单列表</div>
        ${l.slice(0, 30).map((o) => `<div class="row"><div class="zav sm">💳</div>
          <div class="rl"><b>${U.esc(o.no)}</b><span>${U.esc(o.uid)} · ${U.esc(o.ch)} · ${U.dt(o.at)}</span></div>
          <span class="chipx ${o.status === '已发放' ? 'g' : ''}">${U.esc(o.status)}</span>
          <b class="y">¥${o.amt}</b></div>`).join('') || '<div class="lbl">暂无订单</div>'}
      </div>
      <div class="card"><div class="lbl">⚠ 单机架构未接入 AppStore / 谷歌结算，无真实支付回调。
        此处订单由管理员手工录入，用于对账与统计演示。</div></div>`;
  },
  bind() {
    const go = D('#pyGo');
    if (go) go.onclick = async () => {
      const db = await DB.get(DBP.order, { list: [] });
      db.list = db.list || [];
      db.list.unshift({ no: this.val('#pyNo'), uid: this.val('#pyUid'),
        amt: this.num('#pyAmt'), ch: this.val('#pyCh'), status: this.val('#pySt'), at: Date.now() });
      if (await DB.set(DBP.order, db, '录入订单')) { this.toast('已录入', 'ok'); this.render(); }
    };
  },
};

/* 资源产出消耗大盘 */
APP.pages['stat-res'] = {
  g: '数据统计', n: '资源大盘', i: '🌐', perm: 'stat.view',
  render() {
    const sum = {};
    let gold = 0, dia = 0, ach = 0, token = 0;
    this.PLIST.forEach((p) => {
      Object.keys(p.mat || {}).forEach((k) => { sum[k] = (sum[k] || 0) + (p.mat[k] || 0); });
      gold += p.gold || 0; dia += p.diamond || 0; ach += p.ach || 0; token += p.evToken || 0;
    });
    const keys = Object.keys(sum).sort((a, b) => sum[b] - sum[a]);
    const max = Math.max(1, ...keys.map((k) => sum[k]));
    return `<div class="ph"><h2>🌐 资源产出消耗大盘</h2><span class="tagx">定位通胀</span></div>
      <div class="stats">
        <div class="st"><b>${U.fmt(gold)}</b><span>全服金币存量</span></div>
        <div class="st"><b>${U.fmt(dia)}</b><span>全服钻石存量</span></div>
        <div class="st"><b>${U.fmt(ach)}</b><span>成就点存量</span></div>
        <div class="st"><b>${U.fmt(token)}</b><span>活动代币存量</span></div>
      </div>
      <div class="card"><div class="card-t">材料存量分布</div>
        ${keys.map((k) => `<div class="bar">
          <div class="bn"><span>${U.esc(U.itemName(k))}</span><b>${U.fmt(sum[k])}</b></div>
          <div class="bg"><div class="bf" style="width:${Math.round(sum[k] / max * 100)}%"></div></div></div>`).join('')
          || '<div class="lbl">无数据</div>'}
      </div>
      <div class="card"><div class="card-t">人均持有</div>
        <div class="kv"><span>人均金币</span><b class="y">${U.fmt(this.PLIST.length ? gold / this.PLIST.length : 0)}</b></div>
        <div class="kv"><span>人均钻石</span><b class="y">${U.fmt(this.PLIST.length ? dia / this.PLIST.length : 0)}</b></div>
        <div class="kv"><span>人均材料总量</span><b>${U.fmt(this.PLIST.length ? keys.reduce((s, k) => s + sum[k], 0) / this.PLIST.length : 0)}</b></div>
      </div>
      <div class="card"><div class="lbl">⚠ 单机架构无法追踪逐笔产出/消耗流水，此处统计的是
        当前【存量】。如需流水大盘，需在游戏端埋点上报到云端（会显著增加 API 消耗）。</div></div>`;
  },
  bind() {},
};
