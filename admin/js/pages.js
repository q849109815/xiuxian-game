/* =====================================================================
 * pages.js —— 运营后台全部页面（14 个模块）
 *   每个页面：{ n 名称, i 图标, g 分组, perm 权限, render(), acts{} }
 *   交互统一走 data-a 事件委托（core.js 分发）
 * =================================================================== */
'use strict';

const PAGES = {
  register() {
    const A = APP.pages;

    /* 页内页签状态 */
    APP.T = APP.T || {};
    const tab = (k, def) => { if (!APP.T[k]) APP.T[k] = def; return APP.T[k]; };

    /* =================================================================
     * 1. 账号系统
     * ================================================================= */
    A.account = {
      n: '账号系统', i: '👤', g: '账号', perm: 'account.query',
      render() {
        const list = this.view();
        return `
        <div class="card">
          <h3>运营概览<span class="tag">${U.esc(this.SRC_NOTE || '—')} · ${U.ago(this.PLIST_AT)}</span></h3>
          <div class="kpis">
            <div class="kpi"><div class="v">${this.PLIST.length}</div><div class="k">玩家总数</div></div>
            <div class="kpi"><div class="v">${this.PLIST.filter((p) => !p._noSave && !p._broken).length}</div><div class="k">有存档</div></div>
            <div class="kpi"><div class="v">${this.PLIST.filter((p) => p.ban).length}</div><div class="k">封禁中</div></div>
            <div class="kpi"><div class="v">${this.deadCount()}</div><div class="k">已注销</div></div>
            <div class="kpi"><div class="v">${this.PLIST.filter((p) => U.ago(p.lastSeen).indexOf('小时前') > 0 || U.ago(p.lastSeen).indexOf('分') > 0 || U.ago(p.lastSeen) === '刚刚').length}</div><div class="k">今日活跃</div></div>
          </div>
          <div class="btns">
            <button class="btn" data-a="reload">⟳ 重新拉取</button>
            <button class="btn pri" data-a="new">＋ 后台注册账号</button>
            <button class="btn" data-a="toggleDead">${this.SHOW_DEAD ? '隐藏' : '显示'}已注销(${this.deadCount()})</button>
            <button class="btn" data-a="exportCsv">⬇ 导出 CSV</button>
          </div>
        </div>

        <div class="card">
          <h3>玩家列表<span class="tag">${list.length} 人</span></h3>
          <div class="sb">
            <input id="q" placeholder="搜索 UID / 昵称 / 手机号 / 设备号" value="${U.esc(this.FILTER)}" data-i="q">
          </div>
          <div class="plist">${list.length ? list.map((p) => this.pcard(p)).join('') : '<div class="empty">没有匹配的玩家</div>'}</div>
        </div>

        ${this.SEL ? `
        <div class="card">
          <h3>账号操作<span class="tag">${U.esc(this.SEL.uid)}</span></h3>
          ${this.selBar()}
          <div class="btns">
            <button class="btn" data-a="detail">📋 账号详情</button>
            <button class="btn warn" data-a="resetpwd">🔑 重置密码</button>
            <button class="btn err" data-a="ban">🚫 封禁</button>
            <button class="btn ok" data-a="unban">✅ 解封</button>
            <button class="btn err" data-a="destroy">💀 注销账号</button>
          </div>
        </div>` : ''}`;
      },
      inputs: {
        q(t) { this.FILTER = t.value; this.render(); const n = D('#q'); if (n) { n.value = t.value; n.focus(); } },
      },
      acts: {
        sel(t) { this.SEL = this.PLIST.find((p) => p.uid === t.dataset.uid) || null; this.render(); },
        reload() { this.toast('拉取中…'); this.loadPlayers({ force: true }); },
        toggleDead() { this.SHOW_DEAD = !this.SHOW_DEAD; this.render(); },
        exportCsv() {
          const rows = this.view().map((p) => [p.uid, p.name, p.lv, U.pw(p), p.gold, p.diamond,
            p.stamina, U.dt(p.created), U.ago(p.lastSeen), p.ban ? '封禁' : p.destroyed ? '注销' : '正常']);
          U.download('玩家_' + U.d(Date.now()) + '.csv',
            U.csv(['UID', '昵称', '等级', '战力', '金币', '钻石', '体力', '注册', '活跃', '状态'], rows), 'text/csv');
          this.toast('已导出', 'ok');
        },
        new() {
          this.openModal(`
            <h3>后台注册账号</h3>
            <div class="fr"><label>账号</label><input id="mn_name" placeholder="登录账号（2-8字）"></div>
            <div class="fr"><label>昵称</label><input id="mn_nick" placeholder="游戏内昵称"></div>
            <div class="fr"><label>密码</label><input id="mn_pwd" placeholder="至少 6 位"></div>
            <div class="fr"><label>性别</label><select id="mn_g"><option value="m">男</option><option value="f">女</option></select></div>
            <div class="btns">
              <button class="btn pri" data-m="ok">注册</button>
              <button class="btn" data-m="close">取消</button>
            </div>`, {
            ok: async () => {
              const name = this.str('#mn_name'), nick = this.str('#mn_nick'), pwd = this.str('#mn_pwd');
              if (!name || !pwd) { this.toast('账号和密码必填', 'err'); return; }
              if (!window.UA || !UA.register) { this.toast('账号模块未加载', 'err'); return; }
              const r = await UA.register(name, pwd, nick || name, this.val('#mn_g') || 'm');
              if (!r || !r.ok) { this.toast('注册失败：' + (r && r.msg), 'err'); return; }
              AUDIT.log('注册账号', name, '后台代注册');
              this.toast('注册成功', 'ok');
              this.closeModal();
              this.loadPlayers({ force: true });
            },
          });
        },
        detail() {
          const p = this.SEL; if (!p) return;
          this.openModal(`<h3>账号详情</h3><pre class="json">${
            U.esc(JSON.stringify({
              uid: p.uid, name: p.name, lv: p.lv, 战力: U.pw(p),
              金币: p.gold, 钻石: p.diamond, 体力: p.stamina, 成就点: p.ach,
              注册: U.dt(p.created), 活跃: U.dt(p.lastSeen),
              封禁: p.ban ? (p.banReason || '是') : '否', 注销: p.destroyed ? '是' : '否',
              扩展: p.ext || {},
            }, null, 2))}</pre>
            <div class="btns"><button class="btn" data-m="close">关闭</button></div>`);
        },
        resetpwd() {
          const p = this.SEL; if (!p) return;
          this.openModal(`
            <h3>重置密码 · ${U.esc(p.name || '')}</h3>
            <div class="fr"><label>账号名</label><input id="rp_name" value="${U.esc(p.name || '')}" placeholder="登录账号名"></div>
            <div class="fr"><label>新密码</label><input id="rp_pwd" placeholder="至少 6 位"></div>
            <div class="hint">密码按账号名加盐哈希存储，无法反查原文，只能重置</div>
            <div class="btns">
              <button class="btn pri" data-m="ok">确认重置</button>
              <button class="btn" data-m="close">取消</button>
            </div>`, {
            ok: async () => {
              const name = this.str('#rp_name'), pwd = this.str('#rp_pwd');
              if (!name || pwd.length < 6) { this.toast('账号名必填，密码至少 6 位', 'err'); return; }
              try {
                const id = (window.UA && UA.acctId) ? UA.acctId(name) : String(name).trim().toLowerCase();
                const u = await DB.reload(UDIR + id + '.json');
                if (!u || !u.id) { this.toast('云端未找到该账号', 'err'); return; }
                u.hash = await UA.hash(pwd, name);
                u.pwdResetAt = Date.now(); u.pwdResetBy = 'admin';
                if (await DB.set(UDIR + id + '.json', u, '重置密码')) {
                  AUDIT.log('重置密码', name, '');
                  this.toast('已重置，请通知玩家新密码', 'ok');
                  this.closeModal();
                }
              } catch (e) { this.toast('失败：' + e.message, 'err'); }
            },
          });
        },
        ban() {
          const p = this.SEL; if (!p) return;
          this.openModal(`
            <h3>封禁 · ${U.esc(p.name || '')}</h3>
            <div class="fr"><label>类型</label><select id="bk_t">
              <option value="永久">永久</option><option value="7天">7 天</option><option value="30天">30 天</option></select></div>
            <div class="fr"><label>理由</label><input id="bk_r" placeholder="如：使用外挂"></div>
            <div class="btns">
              <button class="btn err" data-m="ok">确认封禁</button>
              <button class="btn" data-m="close">取消</button>
            </div>`, {
            ok: async () => {
              const t = this.val('#bk_t'); const until = t === '7天' ? Date.now() + 7 * 864e5
                : t === '30天' ? Date.now() + 30 * 864e5 : 0;
              const r = await this.setBan(p, true, { until, reason: this.str('#bk_r') || '违规', type: t });
              AUDIT.log('封禁', p.uid, this.str('#bk_r') || '违规');
              this.toast('已封禁（存档' + (r.okP ? '✓' : '✗') + ' 账号' + (r.okA ? '✓' : '✗') + ' 指令✓）', 'ok');
              this.closeModal(); this.render();
            },
          });
        },
        unban: async function () {
          const p = this.SEL; if (!p) return;
          const r = await this.setBan(p, false, {});
          AUDIT.log('解封', p.uid, '');
          this.toast('已解封', 'ok'); this.render();
        },
        destroy() {
          const p = this.SEL; if (!p) return;
          if (!this.confirm('确定注销并删除「' + (p.name || p.uid) + '」？\n此操作不可恢复！')) return;
          (async () => {
            p.destroyed = true; p.destroyWhy = '运营注销'; p.destroyAt = Date.now();
            await this.save(p, '注销账号');
            try { await Net.write(UDIR + p.uid + '.json',
              { id: p.uid, name: p.name, destroyed: true, destroyAt: Date.now() }, '注销账号'); } catch (e) {}
            try { await Net.del(PDIR + p.uid + '.json'); } catch (e) {}
            DB.clear();
            AUDIT.log('注销账号', p.uid, p.name);
            this.toast('已注销', 'ok');
            this.SEL = null;
            await this.loadPlayers({ force: true });
          })();
        },
      },
    };

    /* =================================================================
     * 2. 玩家存档
     * ================================================================= */
    A.psave = {
      n: '玩家存档', i: '💾', g: '账号', perm: 'save.view',
      render() {
        const list = this.view();
        const t = tab('psave', 'edit');
        const seg = (k, n) => `<button class="${t === k ? 'on' : ''}" data-a="tab" data-k="${k}">${n}</button>`;
        let body = '';
        if (t === 'edit') {
          body = this.SEL ? `
            <div class="fr"><label class="wide">金币</label><input id="e_gold" type="number" value="${this.SEL.gold || 0}"></div>
            <div class="fr"><label class="wide">钻石</label><input id="e_dia" type="number" value="${this.SEL.diamond || 0}"></div>
            <div class="fr"><label class="wide">体力</label><input id="e_stam" type="number" value="${this.SEL.stamina || 0}"></div>
            <div class="fr"><label class="wide">成就点</label><input id="e_ach" type="number" value="${this.SEL.ach || 0}"></div>
            <div class="fr"><label class="wide">等级</label><input id="e_lv" type="number" value="${this.SEL.lv || 1}"></div>
            <div class="fr"><label class="wide">武器等级</label><input id="e_gunlv" type="number" value="${this.SEL.gunLv || 1}"></div>
            <div class="fr"><label class="wide">无尽最佳</label><input id="e_eb" type="number" value="${this.SEL.endlessBest || 0}"></div>
            <div class="fr"><label class="wide">当前关卡</label><input id="e_cur" value="${U.esc(this.SEL.curLevel || '')}"></div>
            <div class="fr"><label class="wide">已解锁枪械</label><input id="e_gunown" value="${U.esc((this.SEL.gunOwn || []).join(','))}"></div>
            <div class="hint">多项用英文逗号分隔，如 W01,W02</div>
            <div class="btns">
              <button class="btn pri" data-a="saveEdit">💾 保存修改</button>
              <button class="btn" data-a="backup">📦 立即备份</button>
              <button class="btn err" data-a="resetSave">♻ 重置存档</button>
            </div>` : '<div class="empty">先在左侧点选玩家</div>';
        } else if (t === 'raw') {
          body = this.SEL
            ? `<pre class="json">${U.esc(JSON.stringify(this.SEL, null, 2))}</pre>
               <div class="btns"><button class="btn" data-a="copyRaw">📋 复制 JSON</button></div>`
            : '<div class="empty">先在左侧点选玩家</div>';
        } else if (t === 'backup') {
          body = `<div class="lbl">备份与回档：点击「立即备份」保存当前存档快照，可从快照恢复。</div>
            <div class="btns">
              <button class="btn pri" data-a="backup">＋ 备份当前</button>
              <button class="btn" data-a="listBak">⟳ 刷新备份列表</button>
            </div>
            <div id="bakBox" style="margin-top:10px"><div class="empty">点「刷新备份列表」查看</div></div>`;
        } else {
          body = `<div class="btns">
              <button class="btn" data-a="loadLog">⟳ 刷新日志</button>
              <button class="btn" data-a="upLog">⬆ 上传本地日志到云端</button>
              <button class="btn" data-a="exLog">⬇ 导出</button>
              <button class="btn err" data-a="clrLog">🗑 清空本地</button>
            </div>
            <div id="logBox" style="margin-top:10px">${AUDIT.list().slice(0, 60).map((x) =>
              `<div class="pill" style="margin:3px 0;display:block">${U.dt(x.at)} · ${U.esc(x.act)} · ${U.esc(x.target)} ${U.esc(x.detail)}</div>`).join('') || '<div class="empty">暂无</div>'}</div>`;
        }
        return `
        <div class="card">
          <h3>选择玩家<span class="tag">${list.length} 人</span></h3>
          <div class="sb"><input id="q2" placeholder="搜索 UID / 昵称" value="${U.esc(this.FILTER)}" data-i="q"></div>
          <div class="plist">${list.length ? list.map((p) => this.pcard(p)).join('') : '<div class="empty">无</div>'}</div>
        </div>
        <div class="card">
          <h3>${this.SEL ? U.esc(this.SEL.name || '') : '未选择'}<span class="tag">${this.SEL ? U.esc(this.SEL.uid) : ''}</span></h3>
          <div class="seg" style="margin-bottom:10px">
            ${seg('edit', 'GM 改属性')}${seg('raw', '原始 JSON')}${seg('backup', '备份 / 回档')}${seg('log', '操作日志')}
          </div>
          ${body}
        </div>`;
      },
      inputs: { q(t) { this.FILTER = t.value; this.render(); const n = D('#q2'); if (n) { n.value = t.value; n.focus(); } } },
      acts: {
        sel(t) { this.SEL = this.PLIST.find((p) => p.uid === t.dataset.uid) || null; this.render(); },
        tab(t) { APP.T.psave = t.dataset.k; this.render(); },
        async saveEdit() {
          const p = this.SEL; if (!p) return;
          p.gold = this.num('#e_gold'); p.diamond = this.num('#e_dia');
          p.stamina = this.num('#e_stam'); p.ach = this.num('#e_ach');
          p.lv = this.num('#e_lv'); p.gunLv = this.num('#e_gunlv');
          p.endlessBest = this.num('#e_eb'); p.curLevel = this.str('#e_cur') || p.curLevel;
          const go = this.str('#e_gunown');
          if (go) p.gunOwn = go.split(',').map((s) => s.trim()).filter(Boolean);
          if (await this.save(p, 'GM 改属性')) {
            AUDIT.log('GM改属性', p.uid, '金币' + p.gold + ' 钻石' + p.diamond);
            this.toast('已保存', 'ok');
          }
        },
        async backup() {
          const p = this.SEL; if (!p) return;
          const path = 'data/zb/backup/' + p.uid + '/' + Date.now() + '.json';
          if (await DB.set(path, JSON.parse(JSON.stringify(p)), '备份存档')) {
            AUDIT.log('备份存档', p.uid, '');
            this.toast('已备份', 'ok');
          }
        },
        async listBak() {
          const p = this.SEL; if (!p) return;
          const ns = await TMO(Net.list('data/zb/backup/' + p.uid + '/'), 12000, []);
          const box = D('#bakBox'); if (!box) return;
          const fs = (ns || []).filter((x) => x.endsWith('.json')).sort().reverse();
          if (!fs.length) { box.innerHTML = this.empty('还没有备份'); return; }
          box.innerHTML = this.table(['时间', '等级', '金币', '操作'],
            fs.map((f) => [U.dt(parseInt(f, 10)), '—', '—',
              `<button class="btn sm" data-a="restore" data-f="${U.esc(f)}">回档到此</button>`]));
          /* 表格里的按钮靠外层委托（data-a 已在 #body 上） */
        },
        async restore(t) {
          const p = this.SEL; if (!p) return;
          if (!this.confirm('确定把「' + (p.name || p.uid) + '」回档到该备份？')) return;
          const r = await TMO(Net.read('data/zb/backup/' + p.uid + '/' + t.dataset.f), 12000, null);
          if (!r || !r.data) { this.toast('读取备份失败', 'err'); return; }
          if (await this.pushOp(p.uid, { t: 'restore', data: r.data })) {
            AUDIT.log('回档', p.uid, t.dataset.f);
            this.toast('回档指令已下发（玩家在线 5 分钟内生效）', 'ok');
          }
        },
        async resetSave() {
          const p = this.SEL; if (!p) return;
          if (!this.confirm('确定重置「' + (p.name || p.uid) + '」的全部进度？')) return;
          const np = E.newPlayer(p.uid, p.name || '玩家', p.gender);
          np.created = p.created || Date.now();
          if (await this.save(np, '重置存档')) {
            AUDIT.log('重置存档', p.uid, '');
            this.toast('已重置', 'ok');
            await this.loadPlayers({ force: true });
          }
        },
        copyRaw() {
          const p = this.SEL; if (!p) return;
          try { navigator.clipboard.writeText(JSON.stringify(p, null, 2)); this.toast('已复制', 'ok'); }
          catch (e) { this.toast('复制失败', 'err'); }
        },
        loadLog() { this.render(); },
        upLog() { AUDIT.upload(); },
        exLog() { AUDIT.export(); },
        clrLog() { AUDIT.clear(); this.render(); },
      },
    };

    /* =================================================================
     * 3. 运营指令
     * ================================================================= */
    A.ops = {
      n: '运营指令', i: '⚡', g: '运营', perm: 'ops.grant',
      render() {
        const list = this.view();
        return `
        <div class="card">
          <h3>选择玩家<span class="tag">${list.length} 人</span></h3>
          <div class="sb"><input id="q3" placeholder="搜索 UID / 昵称" value="${U.esc(this.FILTER)}" data-i="q"></div>
          <div class="plist">${list.length ? list.map((p) => this.pcard(p)).join('') : '<div class="empty">无</div>'}</div>
        </div>
        <div class="card">
          <h3>补发物品<span class="tag">走指令队列，不会被玩家自动存档覆盖</span></h3>
          ${this.SEL ? this.selBar() : '<div class="empty">先在上方点选玩家</div>'}
          <div class="fr"><label class="wide">物品</label>${U.picker('op_item', 'gold')}</div>
          <div class="fr"><label class="wide">数量</label><input id="op_n" type="number" value="100"></div>
          <div class="fr"><label class="wide">限时(小时)</label><input id="op_exp" type="number" value="0" placeholder="0=永久"></div>
          <div class="fr"><label class="wide">附带邮件</label><input id="op_mt" placeholder="邮件标题（留空则不发）"></div>
          <div class="fr"><label class="wide">邮件正文</label><input id="op_mb" placeholder="邮件内容"></div>
          <div class="btns">
            <button class="btn pri" data-a="grant">📤 补发</button>
            <button class="btn warn" data-a="banNow">🚫 在线封禁</button>
            <button class="btn ok" data-a="unbanNow">✅ 在线解封</button>
            <button class="btn" data-a="opLog">📜 指令记录</button>
          </div>
        </div>`;
      },
      inputs: { q(t) { this.FILTER = t.value; this.render(); const n = D('#q3'); if (n) { n.value = t.value; n.focus(); } } },
      acts: {
        sel(t) { this.SEL = this.PLIST.find((p) => p.uid === t.dataset.uid) || null; this.render(); },
        async grant() {
          const p = this.SEL; if (!p) return;
          const item = this.val('#op_item'), n = this.num('#op_n');
          if (!item || !n) { this.toast('物品与数量必填', 'err'); return; }
          const op = { t: 'grant', item, n };
          const exp = this.num('#op_exp');
          if (exp > 0) op.exp = exp * 36e5;
          const mt = this.str('#op_mt');
          if (mt) op.mail = { t: mt, b: this.str('#op_mb') };
          if (await this.pushOp(p.uid, op)) {
            AUDIT.log('补发', p.uid, U.itemName(item) + '×' + n + (exp ? '（限时' + exp + 'h）' : ''));
            this.toast('已下发：' + U.itemName(item) + '×' + n, 'ok');
          }
        },
        banNow() {
          const p = this.SEL; if (!p) return;
          this.openModal(`
            <h3>在线封禁 · ${U.esc(p.name || '')}</h3>
            <div class="fr"><label>理由</label><input id="ob_r" placeholder="如：使用外挂"></div>
            <div class="hint">指令下发后，在线玩家 5 分钟内被强制登出</div>
            <div class="btns"><button class="btn err" data-m="ok">确认</button><button class="btn" data-m="close">取消</button></div>`, {
            ok: async () => {
              await this.pushOp(p.uid, { t: 'ban', until: 0, reason: this.str('#ob_r') || '违规' });
              AUDIT.log('在线封禁', p.uid, this.str('#ob_r'));
              this.toast('封禁指令已下发', 'ok'); this.closeModal();
            },
          });
        },
        async unbanNow() {
          const p = this.SEL; if (!p) return;
          await this.pushOp(p.uid, { t: 'unban' });
          AUDIT.log('在线解封', p.uid, '');
          this.toast('解封指令已下发', 'ok');
        },
        async opLog() {
          const p = this.SEL; if (!p) return;
          const f = await DB.reload(this.opPath(p.uid));
          const l = (f && f.list) || [];
          this.openModal(`<h3>指令记录 · ${U.esc(p.name || '')}</h3>
            ${l.length ? l.slice().reverse().slice(0, 40).map((x) =>
            `<div class="pill" style="margin:3px 0;display:block">${U.dt(x.at)} · ${U.esc(x.t)} ${
              x.t === 'grant' ? U.itemName(x.item) + '×' + x.n : ''}${x.reason ? ' · ' + U.esc(x.reason) : ''}</div>`).join('')
            : '<div class="empty">暂无指令</div>'}
            <div class="btns"><button class="btn" data-m="close">关闭</button></div>`);
        },
      },
    };

    /* =================================================================
     * 4. 排行榜
     * ================================================================= */
    A.rank = {
      n: '排行榜', i: '🏆', g: '运营', perm: 'rank.view',
      render() {
        const t = tab('rank', 'view');
        const seg = (k, n) => `<button class="${t === k ? 'on' : ''}" data-a="tab" data-k="${k}">${n}</button>`;
        let body = '';
        if (t === 'view') {
          body = `<div class="btns">
              <button class="btn pri" data-a="refresh">⟳ 刷新三榜</button>
              <button class="btn warn" data-a="rebuild">🔨 重建榜单</button>
            </div>
            <div id="rkBox" style="margin-top:10px"><div class="empty">点「刷新三榜」查看</div></div>`;
        } else if (t === 'rw') {
          body = `<div class="fr"><label class="wide">榜单</label><select id="rw_b">
              <option value="endless">无尽榜</option><option value="power">战力榜</option><option value="event">活动榜</option></select></div>
            <div class="fr"><label class="wide">名次区间</label><input id="rw_a" type="number" value="1" style="max-width:70px"> ~ <input id="rw_b2" type="number" value="3" style="max-width:70px"></div>
            <div class="fr"><label class="wide">奖励</label>${U.picker('rw_i', 'diamond')}</div>
            <div class="fr"><label class="wide">数量</label><input id="rw_n" type="number" value="100"></div>
            <div class="btns"><button class="btn pri" data-a="addRw">＋ 添加配置</button></div>
            <div id="rwBox" style="margin-top:10px"><div class="empty">点上方加载已有配置</div></div>`;
        } else {
          body = `<div class="lbl">按当前榜单名次，给上榜玩家发放已配置的排名奖励（走指令队列，自动到账）。</div>
            <div class="fr"><label class="wide">榜单</label><select id="st_b">
              <option value="endless">无尽榜</option><option value="power">战力榜</option><option value="event">活动榜</option></select></div>
            <div class="fr"><label class="wide">发奖名次</label><input id="st_top" type="number" value="10"></div>
            <div class="btns"><button class="btn warn" data-a="settle">💰 结算发奖</button></div>
            <div id="stBox" style="margin-top:10px"></div>`;
        }
        return `<div class="card">
          <h3>排行榜<span class="tag">无尽 / 战力 / 活动 三榜</span></h3>
          <div class="seg" style="margin-bottom:10px">
            ${seg('view', '榜单查看')}${seg('rw', '奖励配置')}${seg('settle', '奖励结算')}
          </div>${body}</div>`;
      },
      acts: {
        tab(t) { APP.T.rank = t.dataset.k; this.render(); },
        async refresh() {
          const box = D('#rkBox'); if (!box) return;
          box.innerHTML = '<div class="empty">读取中…</div>';
          const out = [];
          for (const [k, p, label] of [['endless', DBP.endless, '无尽榜'], ['power', DBP.rank, '战力榜']]) {
            const d = await DB.reload(p);
            const l = ((d && d.list) || []).slice(0, 20);
            out.push(`<h3 style="margin:12px 0 6px;font-size:13px">${label}（${((d && d.list) || []).length} 人）</h3>` +
              (l.length ? this.table(['#', '昵称', 'UID', '数值'],
                l.map((x, i) => [i + 1, U.esc(x.name || x.nick || '—'), U.esc(x.uid), U.fmt(x.v || x.eb || x.pw || 0)]))
                : '<div class="empty">空</div>'));
          }
          box.innerHTML = out.join('') + '<div class="hint">活动榜数据来自活动积分，随活动结算更新</div>';
          this.toast('已刷新', 'ok');
        },
        async rebuild() {
          if (!this.confirm('重建榜单？会按当前玩家存档重算名次（并入旧榜，不清空）。')) return;
          const box = D('#rkBox'); if (box) box.innerHTML = '<div class="empty">重建中…</div>';
          /* 各维度取前 100 名并集，避免战力高手被无尽高手挤掉 */
          const rows = this.PLIST.filter((p) => !p.destroyed && !p._noSave).map((p) => ({
            uid: p.uid, name: p.name, lv: p.lv || 1, pw: U.pw(p), eb: p.endlessBest || 0,
          }));
          const top = (key, n) => rows.slice().sort((a, b) => b[key] - a[key]).slice(0, n);
          const eSet = top('eb', 100), pSet = top('pw', 100);
          const seen = {};
          const merged = [];
          eSet.concat(pSet).forEach((x) => { if (!seen[x.uid]) { seen[x.uid] = 1; merged.push(x); } });
          const eOld = (await DB.reload(DBP.endless)) || {};
          const pOld = (await DB.reload(DBP.rank)) || {};
          const mergeOld = (old, arr, key) => {
            const m = {}; (old.list || []).forEach((x) => { if (x && x.uid) m[x.uid] = x; });
            arr.forEach((x) => {
              const o = m[x.uid];
              m[x.uid] = {
                uid: x.uid, name: x.name || (o && o.name) || '', lv: x.lv,
                v: Math.max(x[key], (o && o.v) || 0), at: Date.now(),
              };
            });
            return { list: Object.keys(m).map((k) => m[k]).sort((a, b) => b.v - a.v).slice(0, 200), updAt: Date.now() };
          };
          await DB.set(DBP.endless, mergeOld(eOld, merged, 'eb'), '重建无尽榜');
          await DB.set(DBP.rank, mergeOld(pOld, merged, 'pw'), '重建战力榜');
          AUDIT.log('重建榜单', '', merged.length + ' 人');
          this.toast('已重建', 'ok');
          this.acts.refresh.call(this);
        },
        async addRw() {
          const d = await DB.get(DBP.rankrw, { list: [] });
          d.list = d.list || [];
          d.list.push({
            id: 'rr' + Date.now().toString(36), board: this.val('#rw_b'),
            from: this.num('#rw_a'), to: this.num('#rw_b2'),
            item: this.val('#rw_i'), n: this.num('#rw_n'), at: Date.now(),
          });
          if (await DB.set(DBP.rankrw, d, '添加排名奖励')) {
            AUDIT.log('配置排名奖励', this.val('#rw_b'), this.num('#rw_a') + '~' + this.num('#rw_b2'));
            this.toast('已添加', 'ok');
            this.acts.listRw.call(this);
          }
        },
        async listRw() {
          const box = D('#rwBox'); if (!box) return;
          const d = await DB.reload(DBP.rankrw);
          const l = (d && d.list) || [];
          box.innerHTML = l.length ? this.table(['榜单', '名次', '奖励', '操作'],
            l.map((x) => [U.esc(x.board), x.from + '~' + x.to,
              U.itemName(x.item) + '×' + x.n,
              `<button class="btn sm err" data-a="delRw" data-id="${U.esc(x.id)}">删除</button>`]))
            : this.empty('还没有配置');
        },
        async delRw(t) {
          const d = await DB.get(DBP.rankrw, { list: [] });
          d.list = (d.list || []).filter((x) => x.id !== t.dataset.id);
          await DB.set(DBP.rankrw, d, '删除排名奖励');
          this.toast('已删除', 'ok');
          this.acts.listRw.call(this);
        },
        async settle() {
          const b = this.val('#st_b'), topN = this.num('#st_top');
          const rw = await DB.reload(DBP.rankrw);
          const list = (rw && rw.list) || [];
          const board = b === 'power' ? DBP.rank : DBP.endless;
          const d = await DB.reload(board);
          const rows = ((d && d.list) || []).slice(0, topN);
          if (!rows.length) { this.toast('榜单为空，先重建', 'err'); return; }
          let cnt = 0;
          for (let i = 0; i < rows.length; i++) {
            const rank = i + 1;
            const hits = list.filter((x) => x.board === b && rank >= x.from && rank <= x.to);
            for (const h of hits) {
              await this.pushOp(rows[i].uid, {
                t: 'grant', item: h.item, n: h.n,
                mail: { t: '排行榜奖励', b: '你在「' + b + '」榜第 ' + rank + ' 名' },
              });
              cnt++;
            }
          }
          AUDIT.log('排名发奖', b, '前' + topN + '名，共' + cnt + '条');
          const box = D('#stBox');
          if (box) box.innerHTML = '<div class="pill">已下发 ' + cnt + ' 条奖励指令</div>';
          this.toast('已下发 ' + cnt + ' 条', 'ok');
        },
      },
      bind() { if (APP.T.rank === 'rw') this.acts.listRw.call(this); },
    };

    /* =================================================================
     * 5. 邮件系统
     * ================================================================= */
    A.mail = {
      n: '邮件系统', i: '📮', g: '运营', perm: 'mail.send',
      render() {
        const t = tab('mail', 'send');
        const seg = (k, n) => `<button class="${t === k ? 'on' : ''}" data-a="tab" data-k="${k}">${n}</button>`;
        let body = '';
        if (t === 'send') {
          body = `
          <div class="fr"><label class="wide">发送范围</label><select id="m_type" data-c="type">
            <option value="all">全服邮件</option>
            <option value="target">定向邮件</option>
            <option value="single">单发给某玩家</option></select></div>
          <div id="m_target" style="display:none">
            <div class="fr"><label class="wide">指定 UID</label><input id="m_uids" placeholder="多个用逗号分隔"></div>
            <div class="fr"><label class="wide">等级区间</label><input id="m_lvmin" type="number" placeholder="最低" style="max-width:80px"> ~
              <input id="m_lvmax" type="number" placeholder="最高" style="max-width:80px"></div>
            <div class="fr"><label class="wide">战力≥</label><input id="m_pwmin" type="number" placeholder="按战力筛 UID" style="max-width:120px"></div>
            <div class="fr"><label class="wide">注册于</label><input id="m_reg" type="date" style="max-width:150px"> 之后</div>
            <div class="hint">战力/注册条件会先在本地筛出 UID 列表再写入，兼容前端筛选</div>
          </div>
          <div class="fr"><label class="wide">标题</label><input id="m_t" placeholder="邮件标题"></div>
          <div class="fr"><label class="wide">正文</label><textarea id="m_b" placeholder="邮件内容"></textarea></div>
          <div class="fr"><label class="wide">附件</label>${U.picker('m_i', '', '（无附件）')}</div>
          <div class="fr"><label class="wide">数量</label><input id="m_n" type="number" value="0"></div>
          <div class="fr"><label class="wide">生效(小时后)</label><input id="m_start" type="number" value="0"></div>
          <div class="fr"><label class="wide">有效期(天)</label><input id="m_exp" type="number" value="7"></div>
          <div class="btns"><button class="btn pri" data-a="sendMail">📤 发送</button></div>`;
        } else {
          body = `<div class="btns">
              <button class="btn" data-a="mReload">⟳ 刷新记录</button>
              <button class="btn" data-a="mExport">⬇ 导出</button>
            </div>
            <div id="mBox" style="margin-top:10px"><div class="empty">点「刷新记录」</div></div>`;
        }
        return `<div class="card">
          <h3>邮件<span class="tag">全服 / 定向 / 单发</span></h3>
          <div class="seg" style="margin-bottom:10px">${seg('send', '发送邮件')}${seg('log', '邮件记录')}</div>
          ${body}</div>`;
      },
      changes: {
        type(t) {
          const b = D('#m_target');
          if (b) b.style.display = (t.value === 'target' || t.value === 'single') ? '' : 'none';
        },
      },
      acts: {
        tab(t) { APP.T.mail = t.dataset.k; this.render(); },
        async sendMail() {
          const type = this.val('#m_type');
          const t = this.str('#m_t');
          if (!t) { this.toast('标题必填', 'err'); return; }
          const rw = {};
          const item = this.val('#m_i');
          if (item && this.num('#m_n') > 0) rw[item] = this.num('#m_n');
          const start = this.num('#m_start'), exp = this.num('#m_exp');
          const m = {
            id: 'm' + Date.now().toString(36), type: type === 'single' ? 'target' : type,
            title: t, body: this.str('#m_b'), rw,
            startAt: start > 0 ? Date.now() + start * 36e5 : 0,
            expireAt: exp > 0 ? Date.now() + exp * 864e5 : 0,
            claimed: [], at: Date.now(), by: 'admin',
          };
          if (type === 'single' || type === 'target') {
            let uids = this.str('#m_uids').split(',').map((s) => s.trim()).filter(Boolean);
            const pwmin = this.num('#m_pwmin'), regRaw = this.val('#m_reg');
            const lvmin = this.num('#m_lvmin'), lvmax = this.num('#m_lvmax');
            const regAfter = regRaw ? new Date(regRaw + 'T00:00:00').getTime() : 0;
            if (pwmin > 0 || regAfter || lvmin || lvmax) {
              this.PLIST.forEach((p) => {
                if (pwmin > 0 && U.pw(p) < pwmin) return;
                if (regAfter && (p.created || 0) < regAfter) return;
                if (lvmin && (p.lv || 1) < lvmin) return;
                if (lvmax && (p.lv || 1) > lvmax) return;
                if (uids.indexOf(p.uid) < 0) uids.push(p.uid);
              });
            }
            if (!uids.length) { this.toast('没有匹配到任何玩家', 'err'); return; }
            m.uids = uids;
            /* 等级区间同时写进 filter，前端也认 */
            m.filter = { lvMin: lvmin || null, lvMax: lvmax || null, regAfter: regAfter || null };
          }
          const d = await DB.reload(DBP.mail);
          d.list = d.list || [];
          d.list.unshift(m);
          if (d.list.length > 300) d.list.length = 300;
          if (await DB.set(DBP.mail, d, '发送邮件')) {
            AUDIT.log('发邮件', type, t + (m.uids ? '（' + m.uids.length + '人）' : '（全服）'));
            this.toast('已发送' + (m.uids ? '给 ' + m.uids.length + ' 人' : '（全服）'), 'ok');
          }
        },
        async mReload() {
          const box = D('#mBox'); if (!box) return;
          const d = await DB.reload(DBP.mail);
          const l = (d && d.list) || [];
          box.innerHTML = l.length ? this.table(['时间', '范围', '标题', '附件', '已领', '操作'],
            l.slice(0, 60).map((x) => [U.dt(x.at),
              x.type === 'all' ? '<span class="bd b">全服</span>' : '<span class="bd y">定向 ' + ((x.uids || []).length) + '人</span>',
              U.esc(x.title), Object.keys(x.rw || {}).map((k) => U.itemName(k) + '×' + x.rw[k]).join(' ') || '—',
              ((x.claimed || []).length),
              `<button class="btn sm err" data-a="mDel" data-id="${U.esc(x.id)}">删除</button>`]))
            : this.empty('暂无邮件');
        },
        async mDel(t) {
          const d = await DB.get(DBP.mail, { list: [] });
          d.list = (d.list || []).filter((x) => x.id !== t.dataset.id);
          await DB.set(DBP.mail, d, '删除邮件');
          this.toast('已删除', 'ok');
          this.acts.mReload.call(this);
        },
        async mExport() {
          const d = await DB.reload(DBP.mail);
          const rows = ((d && d.list) || []).map((x) => [U.dt(x.at), x.type, x.title, (x.claimed || []).length]);
          U.download('邮件_' + U.d(Date.now()) + '.csv', U.csv(['时间', '范围', '标题', '已领人数'], rows), 'text/csv');
          this.toast('已导出', 'ok');
        },
      },
      bind() { if (APP.T.mail === 'log') this.acts.mReload.call(this); },
    };

    /* =================================================================
     * 6. 礼包码
     * ================================================================= */
    A.cdkey = {
      n: '礼包码', i: '🎁', g: '运营', perm: 'cdkey.gen',
      render() {
        const t = tab('cdkey', 'tpl');
        const seg = (k, n) => `<button class="${t === k ? 'on' : ''}" data-a="tab" data-k="${k}">${n}</button>`;
        let body = '';
        if (t === 'tpl') {
          body = `<div class="fr"><label class="wide">模板名</label><input id="tp_n" placeholder="如：新手礼包"></div>
            <div class="fr"><label class="wide">物品1</label>${U.picker('tp_i1', 'gold')}</div>
            <div class="fr"><label class="wide">数量1</label><input id="tp_n1" type="number" value="100"></div>
            <div class="fr"><label class="wide">物品2</label>${U.picker('tp_i2', '', '（不需要）')}</div>
            <div class="fr"><label class="wide">数量2</label><input id="tp_n2" type="number" value="0"></div>
            <div class="fr"><label class="wide">物品3</label>${U.picker('tp_i3', '', '（不需要）')}</div>
            <div class="fr"><label class="wide">数量3</label><input id="tp_n3" type="number" value="0"></div>
            <div class="btns"><button class="btn pri" data-a="addTpl">＋ 新建模板</button></div>
            <div id="tpBox" style="margin-top:10px"></div>`;
        } else if (t === 'gen') {
          body = `<div class="fr"><label class="wide">模板</label><select id="gk_tpl"></select></div>
            <div class="fr"><label class="wide">生成数量</label><input id="gk_n" type="number" value="10"></div>
            <div class="fr"><label class="wide">每人次数</label><input id="gk_use" type="number" value="1"></div>
            <div class="fr"><label class="wide">总次数上限</label><input id="gk_max" type="number" value="100"></div>
            <div class="fr"><label class="wide">有效期(天)</label><input id="gk_exp" type="number" value="30"></div>
            <div class="fr"><label class="wide">绑定</label><select id="gk_bind">
              <option value="0">不绑定（通用码）</option><option value="1">绑定单个 UID</option></select></div>
            <div class="fr"><label class="wide">绑定 UID</label><input id="gk_uid" placeholder="通用码留空"></div>
            <div class="btns">
              <button class="btn pri" data-a="genKey">🎲 生成兑换码</button>
              <button class="btn" data-a="exKey">⬇ 导出未使用</button>
            </div>
            <div id="gkBox" style="margin-top:10px"></div>`;
        } else {
          body = `<div class="sb"><input id="ck_q" placeholder="搜索兑换码 / UID" data-i="ckq"></div>
            <div class="btns">
              <button class="btn" data-a="ckReload">⟳ 刷新</button>
              <button class="btn err" data-a="ckVoid">🚫 作废选中</button>
            </div>
            <div id="ckBox" style="margin-top:10px"><div class="empty">点「刷新」</div></div>`;
        }
        return `<div class="card">
          <h3>礼包码<span class="tag">模板 / 生成 / 作废 / 记录</span></h3>
          <div class="seg" style="margin-bottom:10px">${seg('tpl', '模板管理')}${seg('gen', '生成兑换码')}${seg('rec', '兑换记录')}</div>
          ${body}</div>`;
      },
      inputs: {
        ckq(t) { APP.CKQ = t.value; },
      },
      acts: {
        tab(t) { APP.T.cdkey = t.dataset.k; this.render(); },
        async addTpl() {
          const n = this.str('#tp_n');
          if (!n) { this.toast('模板名必填', 'err'); return; }
          const rw = {};
          for (const k of ['1', '2', '3']) {
            const i = this.val('#tp_i' + k), v = this.num('#tp_n' + k);
            if (i && v > 0) rw[i] = v;
          }
          if (!Object.keys(rw).length) { this.toast('至少配置一个物品', 'err'); return; }
          const d = await DB.reload(DBP.cdkey);
          d.tpls = d.tpls || [];
          d.tpls.push({ id: 'tp' + Date.now().toString(36), n, rw, at: Date.now() });
          if (await DB.set(DBP.cdkey, d, '新建礼包模板')) {
            AUDIT.log('新建礼包模板', n, JSON.stringify(rw));
            this.toast('已创建', 'ok');
            this.acts.listTpl.call(this);
          }
        },
        async listTpl() {
          const box = D('#tpBox'); if (!box) return;
          const d = await DB.reload(DBP.cdkey);
          const l = (d && d.tpls) || [];
          box.innerHTML = l.length ? this.table(['模板', '内容', '操作'],
            l.map((x) => [U.esc(x.n),
              Object.keys(x.rw).map((k) => U.itemName(k) + '×' + x.rw[k]).join('，'),
              `<button class="btn sm err" data-a="delTpl" data-id="${U.esc(x.id)}">删除</button>`]))
            : this.empty('还没有模板，先建一个');
        },
        async delTpl(t) {
          const d = await DB.get(DBP.cdkey, {});
          d.tpls = (d.tpls || []).filter((x) => x.id !== t.dataset.id);
          await DB.set(DBP.cdkey, d, '删除模板');
          this.toast('已删除', 'ok');
          this.acts.listTpl.call(this);
        },
        async genKey() {
          const tplId = this.val('#gk_tpl');
          const d = await DB.reload(DBP.cdkey);
          const tpl = ((d && d.tpls) || []).find((x) => x.id === tplId);
          if (!tpl) { this.toast('请先选择有效模板', 'err'); return; }
          const n = this.num('#gk_n') || 1;
          const exp = this.num('#gk_exp');
          const bind = this.val('#gk_bind') === '1' ? this.str('#gk_uid') : '';
          d.keys = d.keys || [];
          const made = [];
          for (let i = 0; i < n; i++) {
            const k = U.code(12);
            d.keys.unshift({
              code: k, tpl: tpl.id, tplName: tpl.n, rw: tpl.rw,
              use: this.num('#gk_use') || 1, max: this.num('#gk_max') || 0,
              exp: exp > 0 ? Date.now() + exp * 864e5 : 0,
              bind: bind, used: 0, users: [], void: false, at: Date.now(),
            });
            made.push(k);
          }
          if (d.keys.length > 2000) d.keys.length = 2000;
          if (await DB.set(DBP.cdkey, d, '生成兑换码 ' + n)) {
            AUDIT.log('生成兑换码', tpl.n, n + ' 个' + (bind ? ' 绑定' + bind : ''));
            const box = D('#gkBox');
            if (box) box.innerHTML = `<div class="hint">已生成 ${n} 个：</div><pre class="json">${U.esc(made.join('\n'))}</pre>`;
            this.toast('已生成 ' + n + ' 个', 'ok');
          }
        },
        async exKey() {
          const d = await DB.reload(DBP.cdkey);
          const rows = ((d && d.keys) || []).filter((x) => !x.void && (!x.max || x.used < x.max))
            .map((x) => [x.code, x.tplName, x.used + '/' + (x.max || '∞'), x.exp ? U.d(x.exp) : '永久']);
          U.download('兑换码_' + U.d(Date.now()) + '.csv',
            U.csv(['兑换码', '礼包', '已用', '过期'], rows), 'text/csv');
          this.toast('已导出', 'ok');
        },
        async ckReload() {
          const box = D('#ckBox'); if (!box) return;
          const d = await DB.reload(DBP.cdkey);
          let l = (d && d.keys) || [];
          const q = (APP.CKQ || '').trim().toLowerCase();
          if (q) l = l.filter((x) => (x.code || '').toLowerCase().indexOf(q) >= 0
            || (x.bind || '').toLowerCase().indexOf(q) >= 0);
          box.innerHTML = l.length ? this.table(['兑换码', '礼包', '已用', '绑定', '状态', '操作'],
            l.slice(0, 100).map((x) => [U.esc(x.code), U.esc(x.tplName || ''),
              x.used + '/' + (x.max || '∞'), U.esc(x.bind || '—'),
              x.void ? '<span class="bd r">已作废</span>' : (x.exp && x.exp < Date.now()) ? '<span class="bd n">已过期</span>' : '<span class="bd g">有效</span>',
              `<button class="btn sm err" data-a="voidOne" data-c2="${U.esc(x.code)}">作废</button>`]))
            : this.empty('暂无兑换码');
        },
        async voidOne(t) {
          const d = await DB.get(DBP.cdkey, {});
          const k = (d.keys || []).find((x) => x.code === t.dataset.c2);
          if (k) { k.void = true; k.voidAt = Date.now(); }
          await DB.set(DBP.cdkey, d, '作废兑换码');
          AUDIT.log('作废兑换码', t.dataset.c2, '');
          this.toast('已作废', 'ok');
          this.acts.ckReload.call(this);
        },
        ckVoid() { this.toast('请在下方列表点「作废」', 'warn'); },
      },
      bind() {
        const g = D('#gk_tpl');
        if (g) {
          DB.reload(DBP.cdkey).then((d) => {
            if (!g) return;
            g.innerHTML = ((d && d.tpls) || []).map((x) =>
              `<option value="${U.esc(x.id)}">${U.esc(x.n)}</option>`).join('') || '<option value="">（无模板）</option>';
          });
        }
        if (APP.T.cdkey === 'tpl') this.acts.listTpl.call(this);
        if (APP.T.cdkey === 'rec') this.acts.ckReload.call(this);
      },
    };

    /* =================================================================
     * 7. 运营配置（活动 / 成就商店 / 活动商店 / 排行榜奖励 / 数值热更）
     * ================================================================= */
    A.cfg = {
      n: '运营配置', i: '⚙️', g: '运营', perm: 'config.view',
      render() {
        const t = tab('cfg', 'act');
        const seg = (k, n) => `<button class="${t === k ? 'on' : ''}" data-a="tab" data-k="${k}">${n}</button>`;
        const map = { act: '活动', ach: '成就商店', ashop: '活动商店', rrw: '排行榜奖励', hot: '数值热更新' };
        return `<div class="card">
          <h3>${map[t]}<span class="tag">热更后立即对所有玩家生效</span></h3>
          <div class="seg" style="margin-bottom:10px">
            ${seg('act', '活动配置')}${seg('ach', '成就商店')}${seg('ashop', '活动商店')}
            ${seg('rrw', '排行榜奖励')}${seg('hot', '数值热更新')}
          </div>
          <div id="cfgBox"><div class="empty">读取中…</div></div>
        </div>`;
      },
      acts: {
        tab(t) { APP.T.cfg = t.dataset.k; this.render(); },
        /* ---- 活动 ---- */
        async loadAct() {
          const d = await DB.reload(DBP.activity);
          const l = (d && d.list) || [];
          this.setHtml('#cfgBox', `
            <div class="btns"><button class="btn pri" data-a="actAdd">＋ 新建活动</button></div>
            ${l.length ? this.table(['活动', '时间', '状态', '操作'], l.map((x) => {
            const on = (!x.startAt || x.startAt <= Date.now()) && (!x.endAt || x.endAt >= Date.now());
            return [U.esc(x.n || x.title || x.id),
              (x.startAt ? U.d(x.startAt) : '—') + ' ~ ' + (x.endAt ? U.d(x.endAt) : '—'),
              on ? '<span class="bd g">进行中</span>' : '<span class="bd n">已下架/未开始</span>',
              `<button class="btn sm" data-a="actToggle" data-id="${U.esc(x.id)}">${on ? '下架' : '开启'}</button>
                 <button class="btn sm err" data-a="actDel" data-id="${U.esc(x.id)}">删除</button>`];
          })) : this.empty('暂无活动')}`);
        },
        actAdd() {
          this.openModal(`<h3>新建活动</h3>
            <div class="fr"><label>名称</label><input id="ac_n"></div>
            <div class="fr"><label>开始</label><input id="ac_s" type="date"></div>
            <div class="fr"><label>结束</label><input id="ac_e" type="date"></div>
            <div class="fr"><label>奖励物品</label>${U.picker('ac_i', 'gold')}</div>
            <div class="fr"><label>数量</label><input id="ac_v" type="number" value="100"></div>
            <div class="btns"><button class="btn pri" data-m="ok">创建</button><button class="btn" data-m="close">取消</button></div>`, {
            ok: async () => {
              const n = this.str('#ac_n');
              if (!n) { this.toast('名称必填', 'err'); return; }
              const d = await DB.reload(DBP.activity);
              d.list = d.list || [];
              d.list.push({
                id: 'EV' + Date.now().toString(36).toUpperCase(), n,
                startAt: this.val('#ac_s') ? new Date(this.val('#ac_s') + 'T00:00:00').getTime() : 0,
                endAt: this.val('#ac_e') ? new Date(this.val('#ac_e') + 'T23:59:59').getTime() : 0,
                rw: { [this.val('#ac_i')]: this.num('#ac_v') }, at: Date.now(),
              });
              if (await DB.set(DBP.activity, d, '新建活动')) {
                AUDIT.log('新建活动', n, '');
                this.toast('已创建', 'ok'); this.closeModal();
                this.acts.loadAct.call(this);
              }
            },
          });
        },
        async actToggle(t) {
          const d = await DB.reload(DBP.activity);
          const x = (d.list || []).find((y) => y.id === t.dataset.id);
          if (!x) return;
          const now = Date.now();
          if (!x.endAt || x.endAt >= now) { x.endAt = now - 1; x.startAt = x.startAt || 0; }
          else { x.startAt = now; x.endAt = now + 30 * 864e5; }
          await DB.set(DBP.activity, d, '切换活动状态');
          AUDIT.log('活动上下架', x.n, '');
          this.toast('已切换', 'ok');
          this.acts.loadAct.call(this);
        },
        async actDel(t) {
          const d = await DB.reload(DBP.activity);
          d.list = (d.list || []).filter((x) => x.id !== t.dataset.id);
          await DB.set(DBP.activity, d, '删除活动');
          AUDIT.log('删除活动', t.dataset.id, '');
          this.toast('已删除', 'ok');
          this.acts.loadAct.call(this);
        },
        /* ---- 商店（成就 / 活动） ---- */
        async loadShop(which) {
          const path = which === 'ach' ? DBP.achshop : DBP.actshop;
          const d = await DB.reload(path);
          const l = (d && d.list) || [];
          this.setHtml('#cfgBox', `
            <div class="fr"><label class="wide">物品</label>${U.picker('sh_i', 'M01')}</div>
            <div class="fr"><label class="wide">价格</label><input id="sh_p" type="number" value="100"></div>
            <div class="fr"><label class="wide">币种</label><select id="sh_c">
              <option value="ach">成就点</option><option value="evToken">活动代币</option>
              <option value="gold">金币</option><option value="diamond">钻石</option></select></div>
            <div class="fr"><label class="wide">限购</label><select id="sh_l">
              <option value="0">不限</option><option value="day">每日</option>
              <option value="week">每周</option><option value="month">每月</option></select></div>
            <div class="btns"><button class="btn pri" data-a="shopAdd" data-w="${which}">＋ 上架商品</button></div>
            ${l.length ? this.table(['物品', '价格', '币种', '限购', '操作'],
              l.map((x) => [U.itemName(x.item || x.id) + '×' + (x.n || 1), x.price, U.esc(x.cur || 'ach'),
                x.per || '不限',
                `<button class="btn sm err" data-a="shopDel" data-w="${which}" data-id="${U.esc(x.id)}">下架</button>`]))
            : this.empty('暂无商品')}`);
        },
        async shopAdd(t) {
          const w = t.dataset.w;
          const path = w === 'ach' ? DBP.achshop : DBP.actshop;
          const d = await DB.reload(path);
          d.list = d.list || [];
          const per = this.val('#sh_l');
          d.list.push({
            id: 'sh' + Date.now().toString(36), item: this.val('#sh_i'), n: 1,
            price: this.num('#sh_p'), cur: this.val('#sh_c'),
            per: per === '0' ? null : per, at: Date.now(),
          });
          if (await DB.set(path, d, '上架商品')) {
            AUDIT.log('上架商品', w, U.itemName(this.val('#sh_i')));
            this.toast('已上架', 'ok');
            this.acts.loadShop.call(this, w);
          }
        },
        async shopDel(t) {
          const path = t.dataset.w === 'ach' ? DBP.achshop : DBP.actshop;
          const d = await DB.reload(path);
          d.list = (d.list || []).filter((x) => x.id !== t.dataset.id);
          await DB.set(path, d, '下架商品');
          this.toast('已下架', 'ok');
          this.acts.loadShop.call(this, t.dataset.w);
        },
        /* ---- 排行榜奖励 ---- */
        async loadRrw() {
          const d = await DB.reload(DBP.rankrw);
          const l = (d && d.list) || [];
          const cur = await DB.reload(DBP.cfg);
          this.setHtml('#cfgBox', `
            <div class="fr"><label class="wide">榜单</label><select id="rr_b">
              <option value="endless">无尽榜</option><option value="power">战力榜</option><option value="event">活动榜</option></select></div>
            <div class="fr"><label class="wide">名次</label><input id="rr_a" type="number" value="1" style="max-width:70px"> ~
              <input id="rr_z" type="number" value="3" style="max-width:70px"></div>
            <div class="fr"><label class="wide">奖励</label>${U.picker('rr_i', 'diamond')}</div>
            <div class="fr"><label class="wide">数量</label><input id="rr_n" type="number" value="100"></div>
            <div class="btns"><button class="btn pri" data-a="rrAdd">＋ 添加</button></div>
            ${l.length ? this.table(['榜单', '名次', '奖励', '操作'],
              l.map((x) => [U.esc(x.board), x.from + '~' + x.to, U.itemName(x.item) + '×' + x.n,
                `<button class="btn sm err" data-a="rrDel" data-id="${U.esc(x.id)}">删除</button>`]))
            : this.empty('还没配置排名奖励')}
            <h3 style="margin:16px 0 8px;font-size:13px">数值热更（cfg.json）</h3>
            <div class="fr"><label class="wide">键</label><input id="cf_k" placeholder="如 goldMul"></div>
            <div class="fr"><label class="wide">值</label><input id="cf_v" placeholder="如 1.2"></div>
            <div class="btns">
              <button class="btn pri" data-a="cfSet">保存键值</button>
              <button class="btn warn" data-a="cfAt">定时生效</button>
            </div>
            <pre class="json" style="margin-top:10px">${U.esc(JSON.stringify(cur || {}, null, 2))}</pre>`);
        },
        async rrAdd() {
          const d = await DB.reload(DBP.rankrw);
          d.list = d.list || [];
          d.list.push({
            id: 'rr' + Date.now().toString(36), board: this.val('#rr_b'),
            from: this.num('#rr_a'), to: this.num('#rr_z'),
            item: this.val('#rr_i'), n: this.num('#rr_n'), at: Date.now(),
          });
          if (await DB.set(DBP.rankrw, d, '配置排名奖励')) {
            AUDIT.log('配置排名奖励', this.val('#rr_b'), '');
            this.toast('已添加', 'ok');
            this.acts.loadRrw.call(this);
          }
        },
        async rrDel(t) {
          const d = await DB.reload(DBP.rankrw);
          d.list = (d.list || []).filter((x) => x.id !== t.dataset.id);
          await DB.set(DBP.rankrw, d, '删除排名奖励');
          this.toast('已删除', 'ok');
          this.acts.loadRrw.call(this);
        },
        async cfSet() {
          const k = this.str('#cf_k');
          if (!k) { this.toast('键名必填', 'err'); return; }
          let v = this.str('#cf_v');
          try { v = JSON.parse(v); } catch (e) { /* 保持字符串 */ }
          const d = await DB.reload(DBP.cfg);
          d[k] = v;
          if (await DB.set(DBP.cfg, d, '数值热更 ' + k)) {
            AUDIT.log('数值热更', k, String(v));
            this.toast('已保存：' + k + ' = ' + v, 'ok');
            this.acts.loadRrw.call(this);
          }
        },
        cfAt() {
          this.openModal(`<h3>定时生效</h3>
            <div class="fr"><label>生效时间</label><input id="ca_t" type="datetime-local"></div>
            <div class="hint">到点后由后台进入时自动应用；单机架构无常驻服务，需后台在线才会落库</div>
            <div class="btns"><button class="btn pri" data-m="ok">加入计划</button><button class="btn" data-m="close">取消</button></div>`, {
            ok: async () => {
              const at = this.val('#ca_t');
              if (!at) { this.toast('选择时间', 'err'); return; }
              const k = this.str('#cf_k'), v = this.str('#cf_v');
              if (!k) { this.toast('请先填写键名', 'err'); return; }
              const d = await DB.reload(DBP.hotfix);
              d.plan = d.plan || [];
              d.plan.push({ k, v, at: new Date(at).getTime(), done: false, at2: Date.now() });
              if (await DB.set(DBP.hotfix, d, '计划热更 ' + k)) {
                AUDIT.log('定时热更', k, at);
                this.toast('已加入计划', 'ok'); this.closeModal();
              }
            },
          });
        },
        async loadHot() {
          const d = await DB.reload(DBP.hotfix);
          const plan = (d && d.plan) || [];
          const now = Date.now();
          let changed = false;
          const cfg = await DB.reload(DBP.cfg);
          plan.forEach((x) => {
            if (!x.done && x.at <= now) {
              try { cfg[x.k] = JSON.parse(x.v); } catch (e) { cfg[x.k] = x.v; }
              x.done = true; changed = true;
            }
          });
          if (changed) await DB.set(DBP.cfg, cfg, '到点应用热更');
          this.setHtml('#cfgBox', `
            <div class="fr"><label class="wide">键</label><input id="hk_k" placeholder="如 dmgMul"></div>
            <div class="fr"><label class="wide">值</label><input id="hk_v" placeholder="如 1.5"></div>
            <div class="fr"><label class="wide">生效时间</label><input id="hk_at" type="datetime-local"></div>
            <div class="btns">
              <button class="btn pri" data-a="hkNow">立即生效</button>
              <button class="btn warn" data-a="hkPlan">加入定时计划</button>
            </div>
            <div style="margin-top:12px">
            ${plan.length ? this.table(['键', '值', '生效时间', '状态'],
              plan.slice().reverse().map((x) => [U.esc(x.k), U.esc(String(x.v)), U.dt(x.at),
                x.done ? '<span class="bd g">已生效</span>' : (x.at <= now ? '<span class="bd y">待写入</span>' : '<span class="bd b">等待中</span>')]))
            : this.empty('暂无计划')}</div>`);
        },
        async hkNow() {
          const k = this.str('#hk_k'); if (!k) { this.toast('键名必填', 'err'); return; }
          let v = this.str('#hk_v'); try { v = JSON.parse(v); } catch (e) {}
          const c = await DB.reload(DBP.cfg);
          c[k] = v;
          if (await DB.set(DBP.cfg, c, '热更 ' + k)) {
            AUDIT.log('数值热更', k, String(v));
            this.toast('已生效', 'ok');
            this.acts.loadHot.call(this);
          }
        },
        async hkPlan() {
          const k = this.str('#hk_k'), at = this.val('#hk_at');
          if (!k || !at) { this.toast('键名与时间必填', 'err'); return; }
          const d = await DB.reload(DBP.hotfix);
          d.plan = d.plan || [];
          d.plan.push({ k, v: this.str('#hk_v'), at: new Date(at).getTime(), done: false, at2: Date.now() });
          if (await DB.set(DBP.hotfix, d, '计划热更 ' + k)) {
            AUDIT.log('定时热更', k, at);
            this.toast('已加入计划', 'ok');
            this.acts.loadHot.call(this);
          }
        },
      },
      bind() {
        const t = APP.T.cfg;
        const fn = { act: 'loadAct', ach: 'loadShop', ashop: 'loadShop', rrw: 'loadRrw', hot: 'loadHot' }[t];
        if (fn) {
          if (t === 'ach' || t === 'ashop') this.acts[fn].call(this, t);
          else this.acts[fn].call(this);
        }
      },
    };

    /* =================================================================
     * 8. 服务器运维
     * ================================================================= */
    A.server = {
      n: '服务器运维', i: '🖥️', g: '运维', perm: 'server.view',
      render() {
        return `<div class="card">
          <h3>维护模式<span class="tag">开启后玩家无法进入战斗</span></h3>
          <div class="fr"><label class="wide">状态</label><select id="sv_mode">
            <option value="正常">正常</option><option value="维护">维护</option></select></div>
          <div class="fr"><label class="wide">提示文案</label><input id="sv_msg" placeholder="服务器维护中，请稍后再来"></div>
          <div class="fr"><label class="wide">预计时长</label><input id="sv_eta" placeholder="预计 2 小时"></div>
          <div class="btns"><button class="btn warn" data-a="svSave">💾 保存并生效</button></div>
        </div>
        <div class="card">
          <h3>连通性 / 配额监控<span class="tag">每次进入自动检测</span></h3>
          <div class="btns"><button class="btn" data-a="svCheck">🔍 立即检测</button></div>
          <div id="svBox" style="margin-top:10px"><div class="empty">点「立即检测」</div></div>
        </div>`;
      },
      acts: {
        async svSave() {
          const d = await DB.reload(DBP.server);
          d.mode = this.val('#sv_mode');
          d.msg = this.str('#sv_msg');
          d.eta = this.str('#sv_eta');
          d.updated = Date.now(); d.by = 'admin';
          if (await DB.set(DBP.server, d, '维护模式 ' + d.mode)) {
            AUDIT.log('维护模式', d.mode, d.msg);
            this.toast('已保存：' + d.mode, 'ok');
          }
        },
        async svCheck() {
          const box = D('#svBox'); if (!box) return;
          box.innerHTML = '<div class="empty">检测中…</div>';
          const t0 = Date.now();
          let ok = false, ms = 0, err = '';
          try {
            const r = await TMO(Net.read(DBP.server), 10000, null);
            ok = !!(r && r.data); ms = Date.now() - t0;
          } catch (e) { err = e.message; ms = Date.now() - t0; }
          const d = await DB.reload(DBP.server);
          const rows = [
            ['GitHub 存储', ok ? '<span class="bd g">可达 ' + ms + 'ms</span>' : '<span class="bd r">不可达 ' + U.esc(err) + '</span>'],
            ['当前端点', U.esc((typeof Net !== 'undefined' && Net.endpoint) || '—')],
            ['在线状态', (typeof Net !== 'undefined' && Net.online) ? '<span class="bd g">在线</span>' : '<span class="bd r">离线</span>'],
            ['凭据', (typeof Net !== 'undefined' && Net.authFail) ? '<span class="bd r">异常（401/403）</span>' : '<span class="bd g">正常</span>'],
            ['写队列长度', String((typeof Net !== 'undefined' && Net.queueLen) || 0)],
            ['API 配额', (typeof Net !== 'undefined' && Net.diagnose)
              ? '<span class="bd n">见下方诊断</span>' : '<span class="bd n">不可用</span>'],
            ['维护模式', (d && d.mode === '维护') ? '<span class="bd r">维护中</span>' : '<span class="bd g">正常</span>'],
          ];
          box.innerHTML = this.table(['项目', '结果'], rows);
          if (typeof Net !== 'undefined' && Net.diagnose) {
            try {
              const dg = await TMO(Promise.resolve(Net.diagnose()), 8000, null);
              if (dg) box.innerHTML += '<pre class="json" style="margin-top:10px">' + U.esc(JSON.stringify(dg, null, 2)) + '</pre>';
            } catch (e) {}
          }
        },
      },
      bind() { this.acts.svCheck.call(this); },
    };

    /* =================================================================
     * 9. 数据埋点
     * ================================================================= */
    A.bi = {
      n: '数据埋点', i: '📊', g: '运维', perm: 'bi.view',
      render() {
        return `<div class="card">
          <h3>埋点收集<span class="tag">本地缓冲 + 云端汇总</span></h3>
          <div class="btns">
            <button class="btn" data-a="biReload">⟳ 刷新</button>
            <button class="btn pri" data-a="biUpload">⬆ 上传本地埋点</button>
            <button class="btn err" data-a="biClear">🗑 清空本地缓冲</button>
          </div>
          <div id="biBox" style="margin-top:10px"><div class="empty">点「刷新」</div></div>
        </div>
        <div class="card">
          <h3>运营报表<span class="tag">留存 / 漏斗 / ARPU</span></h3>
          <div class="btns"><button class="btn" data-a="biReport">📈 生成报表</button>
            <button class="btn" data-a="biExport">⬇ 导出玩家 CSV</button></div>
          <div id="rpBox" style="margin-top:10px"></div>
        </div>`;
      },
      acts: {
        async biReload() {
          const box = D('#biBox'); if (!box) return;
          const local = (window.OPS && OPS.trackBuf) ? OPS.trackBuf() : [];
          const agg = {};
          local.forEach((x) => { agg[x.ev] = agg[x.ev] || { n: x.n || x.ev, c: 0, last: 0 }; agg[x.ev].c++; agg[x.ev].last = Math.max(agg[x.ev].last, x.t); });
          const defs = (EX.TRACK_EVENTS || []);
          const rows = defs.map((d) => {
            const a = agg[d.id] || { c: 0, last: 0 };
            return [U.esc(d.n || d.id), '<span class="bd ' + (d.pr === 'P0' ? 'r' : d.pr === 'P1' ? 'y' : 'n') + '">' + (d.pr || 'P2') + '</span>',
              String(a.c), a.last ? U.dt(a.last) : '—'];
          });
          const extra = Object.keys(agg).filter((k) => !defs.find((d) => d.id === k))
            .map((k) => [U.esc(agg[k].n), '<span class="bd n">自定义</span>', String(agg[k].c), U.dt(agg[k].last)].map((x) => x).slice(0, 4));
          box.innerHTML = `<div class="hint">本地缓冲 ${local.length} 条（最多 500），事件定义 ${defs.length} 个</div>` +
            this.table(['事件', '优先级', '次数', '最近'], rows.concat(extra));
        },
        async biUpload() {
          const local = (window.OPS && OPS.trackBuf) ? OPS.trackBuf() : [];
          if (!local.length) { this.toast('本地没有埋点数据', 'warn'); return; }
          const d = await DB.reload(DBP.bi);
          d.list = (d.list || []).concat(local).slice(-5000);
          d.updated = Date.now();
          if (await DB.set(DBP.bi, d, '上传埋点 ' + local.length)) {
            if (window.OPS && OPS.clearTrack) OPS.clearTrack();
            this.toast('已上传 ' + local.length + ' 条', 'ok');
            this.acts.biReload.call(this);
          }
        },
        biClear() {
          if (!confirm('清空本地埋点缓冲？')) return;
          if (window.OPS && OPS.clearTrack) OPS.clearTrack();
          this.toast('已清空', 'ok');
          this.acts.biReload.call(this);
        },
        biReport() {
          const box = D('#rpBox'); if (!box) return;
          const P = this.PLIST.filter((p) => !p._noSave && !p._broken && !p.destroyed);
          const now = Date.now(), D1 = 864e5;
          const reg = (n) => P.filter((p) => (p.created || 0) >= now - n * D1).length;
          const act = (n) => P.filter((p) => (p.lastSeen || 0) >= now - n * D1).length;
          const arpuDia = P.length ? (P.reduce((s, p) => s + (p.diamond || 0), 0) / P.length) : 0;
          const paid = P.filter((p) => (p.diamond || 0) > 100).length;
          /* 漏斗：注册 → 有存档 → 通关过 → 打到第3章 → 无尽 */
          const cleared1 = P.filter((p) => Object.keys(p.cleared || {}).length >= 1).length;
          const cleared10 = P.filter((p) => Object.keys(p.cleared || {}).length >= 10).length;
          const ch3 = P.filter((p) => Object.keys(p.cleared || {}).some((k) => String(k).indexOf('3-') === 0)).length;
          const endl = P.filter((p) => (p.endlessBest || 0) > 0).length;
          const fn = [
            ['注册', P.length, 100], ['建存档', P.length, 100],
            ['通关≥1关', cleared1, P.length ? cleared1 / P.length * 100 : 0],
            ['通关≥10关', cleared10, P.length ? cleared10 / P.length * 100 : 0],
            ['进入第3章', ch3, P.length ? ch3 / P.length * 100 : 0],
            ['打过无尽', endl, P.length ? endl / P.length * 100 : 0],
          ];
          box.innerHTML = `
            <div class="kpis" style="margin-bottom:12px">
              <div class="kpi"><div class="v">${reg(1)}</div><div class="k">今日注册</div></div>
              <div class="kpi"><div class="v">${reg(7)}</div><div class="k">7日注册</div></div>
              <div class="kpi"><div class="v">${act(1)}</div><div class="k">日活</div></div>
              <div class="kpi"><div class="v">${act(7)}</div><div class="k">周活</div></div>
              <div class="kpi"><div class="v">${U.fmt(arpuDia)}</div><div class="k">人均钻石</div></div>
              <div class="kpi"><div class="v">${paid}</div><div class="k">疑似付费</div></div>
            </div>
            <h3 style="font-size:13px;margin:0 0 8px">转化漏斗</h3>
            ${this.table(['阶段', '人数', '占比'], fn.map((x) => [x[0], x[1],
              `<div class="bar"><i style="width:${Math.min(100, x[2])}%"></i></div>${x[2].toFixed(1)}%`]))}`;
        },
        biExport() {
          const rows = this.PLIST.filter((p) => !p._noSave).map((p) => [
            p.uid, p.name, p.lv, U.pw(p), p.gold, p.diamond,
            Object.keys(p.cleared || {}).length, p.endlessBest || 0, U.d(p.created), U.ago(p.lastSeen)]);
          U.download('玩家报表_' + U.d(Date.now()) + '.csv',
            U.csv(['UID', '昵称', '等级', '战力', '金币', '钻石', '通关数', '无尽', '注册', '活跃'], rows), 'text/csv');
          this.toast('已导出', 'ok');
        },
      },
      bind() { this.acts.biReload.call(this); this.acts.biReport.call(this); },
    };

    /* =================================================================
     * 10. 热更新 / 版本 / 多语言
     * ================================================================= */
    A.hotfix = {
      n: '热更新 / 版本 / 多语言', i: '🔄', g: '运维', perm: 'hotfix.view',
      render() {
        const t = tab('hotfix', 'hot');
        const seg = (k, n) => `<button class="${t === k ? 'on' : ''}" data-a="tab" data-k="${k}">${n}</button>`;
        let body = '';
        if (t === 'hot') {
          const H = (EX && EX.HOT_UPDATE) || {};
          body = `<div class="kpis">
              <div class="kpi"><div class="v">${U.esc(H.version || '—')}</div><div class="k">当前热更版本</div></div>
              <div class="kpi"><div class="v">${((H.manifest) || []).length}</div><div class="k">清单条目</div></div>
              <div class="kpi"><div class="v">${H.enabled ? '开' : '关'}</div><div class="k">开关</div></div>
            </div>
            <div class="hint">改版本号需同步改 index.html 里的 ?v= 与 config.js 的 HOT_UPDATE.version，否则玩家拿不到新代码</div>
            <div class="fr"><label class="wide">新版本号</label><input id="hv_v" value="${U.esc(H.version || '')}"></div>
            <div class="btns">
              <button class="btn pri" data-a="hvSave">💾 记录版本号</button>
              <button class="btn" data-a="hvPush">📤 推送到云端</button>
            </div>
            <pre class="json" style="margin-top:10px">${U.esc(JSON.stringify(H, null, 2))}</pre>`;
        } else if (t === 'ver') {
          body = `<div id="vsBox">${(OPS.versions ? OPS.versions() : []).length
            ? this.table(['版本', '名称', '状态', '日期'],
              OPS.versions().map((v) => [U.esc(v.v || v.id || ''), U.esc(v.n || ''),
                v.done ? '<span class="bd g">已发布</span>' : '<span class="bd y">排期中</span>', U.esc(v.date || '—')]))
            : this.empty('配置表 VERSIONS 为空')}</div>
            <div class="hint">版本排期读取 EX.VERSIONS（config.js）</div>`;
        } else {
          const L = (EX && EX.LANGS) || [{ k: 'zh', n: '中文' }];
          const cur = (window.OPS && OPS.getLang) ? OPS.getLang() : 'zh';
          body = `<div class="fr"><label class="wide">当前语言</label><select id="lg_s">
              ${L.map((x) => `<option value="${U.esc(x.k)}"${x.k === cur ? ' selected' : ''}>${U.esc(x.n || x.k)}</option>`).join('')}
            </select></div>
            <div class="btns"><button class="btn pri" data-a="lgSave">💾 保存语言设置</button></div>
            <h3 style="font-size:13px;margin:16px 0 8px">文案表</h3>
            ${this.table(['ID', '中文'], Object.keys(((EX && EX.TXT) || {})).slice(0, 60).map((k) => [U.esc(k), U.esc(String(EX.TXT[k]))]))}`;
        }
        return `<div class="card">
          <h3>热更新 / 版本 / 多语言</h3>
          <div class="seg" style="margin-bottom:10px">${seg('hot', '热更新')}${seg('ver', '版本排期')}${seg('lang', '多语言')}</div>
          ${body}</div>`;
      },
      acts: {
        tab(t) { APP.T.hotfix = t.dataset.k; this.render(); },
        async hvSave() {
          const v = this.str('#hv_v');
          try { localStorage.setItem('z_hot_ver', v); } catch (e) {}
          AUDIT.log('记录热更版本', v, '');
          this.toast('已记录（需同步改前端代码才生效）', 'ok');
        },
        async hvPush() {
          const v = this.str('#hv_v');
          const d = await DB.reload(DBP.hotfix);
          d.ver = v; d.pushedAt = Date.now(); d.by = 'admin';
          if (await DB.set(DBP.hotfix, d, '推送热更版本 ' + v)) {
            AUDIT.log('推送热更版本', v, '');
            this.toast('已推送到云端 hotfix.json', 'ok');
          }
        },
        lgSave() {
          const k = this.val('#lg_s');
          if (window.OPS && OPS.setLang) OPS.setLang(k);
          AUDIT.log('切换语言', k, '');
          this.toast('已保存（游戏端语言切换仍在开发中）', 'warn');
        },
      },
    };

    /* =================================================================
     * 11. 商城 / 支付
     * ================================================================= */
    A.shop = {
      n: '商城 / 支付', i: '🛒', g: '运营', perm: 'shop.view',
      render() {
        const t = tab('shop', 'goods');
        const seg = (k, n) => `<button class="${t === k ? 'on' : ''}" data-a="tab" data-k="${k}">${n}</button>`;
        const body = t === 'goods'
          ? `<div class="btns"><button class="btn" data-a="shpReload">⟳ 刷新商品</button></div>
             <div id="spBox" style="margin-top:10px"><div class="empty">点「刷新商品」</div></div>`
          : `<div class="lbl">真付费尚未接入。此处为支付回调预留：接入后把订单写入 data/zb/order.json，
               后台可在此查看与补单。</div>
             <div class="fr"><label class="wide">订单号</label><input id="od_id" placeholder="订单号"></div>
             <div class="fr"><label class="wide">UID</label><input id="od_uid" placeholder="玩家 UID"></div>
             <div class="fr"><label class="wide">商品</label>${U.picker('od_i', 'diamond')}</div>
             <div class="fr"><label class="wide">数量</label><input id="od_n" type="number" value="100"></div>
             <div class="btns">
               <button class="btn pri" data-a="odAdd">＋ 登记订单</button>
               <button class="btn warn" data-a="odFix">🔧 补单（发放）</button>
               <button class="btn" data-a="odReload">⟳ 刷新订单</button>
             </div>
             <div id="odBox" style="margin-top:10px"></div>`;
        return `<div class="card">
          <h3>商城 / 支付<span class="tag">商品配置 / 支付回调</span></h3>
          <div class="seg" style="margin-bottom:10px">${seg('goods', '商品配置')}${seg('pay', '支付回调')}</div>
          ${body}</div>`;
      },
      acts: {
        tab(t) { APP.T.shop = t.dataset.k; this.render(); },
        async shpReload() {
          const box = D('#spBox'); if (!box) return;
          /* 商城主配置在游戏端 config.js 的 EX.shop，后台可热更覆盖 */
          const d = await DB.reload(DBP.shop);
          const ov = (d && d.list) || [];
          const base = (EX.shop || EX.shopItems || []);
          const rows = base.map((s) => {
            const o = ov.find((x) => x.id === s.id);
            return [U.esc(s.n || s.id), U.esc(s.id),
              o ? '<span class="bd y">' + o.price + '（已覆盖）</span>' : String(s.price || '—'),
              o && o.per ? U.esc(o.per) : U.esc(s.per || '不限'),
              `<button class="btn sm" data-a="spEdit" data-id="${U.esc(s.id)}">改价</button>`];
          });
          box.innerHTML = rows.length
            ? this.table(['商品', 'ID', '价格', '限购', '操作'], rows)
            : this.empty('配置表 EX.shop 为空');
        },
        spEdit(t) {
          this.openModal(`<h3>改价 · ${U.esc(t.dataset.id)}</h3>
            <div class="fr"><label>价格</label><input id="sp_p" type="number" value="0"></div>
            <div class="fr"><label>限购</label><select id="sp_per">
              <option value="">不限</option><option value="day">每日</option>
              <option value="week">每周</option><option value="month">每月</option></select></div>
            <div class="btns"><button class="btn pri" data-m="ok">保存</button><button class="btn" data-m="close">取消</button></div>`, {
            ok: async () => {
              const d = await DB.reload(DBP.shop);
              d.list = d.list || [];
              const id = t.dataset.id;
              let x = d.list.find((y) => y.id === id);
              if (!x) { x = { id }; d.list.push(x); }
              x.price = this.num('#sp_p'); x.per = this.val('#sp_per') || null;
              x.at = Date.now();
              if (await DB.set(DBP.shop, d, '改价 ' + id)) {
                AUDIT.log('商城改价', id, '价格' + x.price);
                this.toast('已保存', 'ok'); this.closeModal();
                this.acts.shpReload.call(this);
              }
            },
          });
        },
        async odAdd() {
          const id = this.str('#od_id'), uid = this.str('#od_uid');
          if (!id || !uid) { this.toast('订单号与 UID 必填', 'err'); return; }
          const d = await DB.reload('data/zb/order.json');
          d.list = d.list || [];
          d.list.unshift({
            id, uid, item: this.val('#od_i'), n: this.num('#od_n'),
            state: 'pending', at: Date.now(), by: 'admin',
          });
          if (d.list.length > 500) d.list.length = 500;
          if (await DB.set('data/zb/order.json', d, '登记订单')) {
            AUDIT.log('登记订单', id, uid);
            this.toast('已登记', 'ok');
            this.acts.odReload.call(this);
          }
        },
        async odFix() {
          const id = this.str('#od_id');
          const d = await DB.reload('data/zb/order.json');
          const o = (d.list || []).find((x) => x.id === id);
          if (!o) { this.toast('未找到订单', 'err'); return; }
          if (o.state === 'done') { this.toast('该订单已补过', 'warn'); return; }
          if (await this.pushOp(o.uid, { t: 'grant', item: o.item, n: o.n, mail: { t: '订单补发', b: '订单 ' + id } })) {
            o.state = 'done'; o.doneAt = Date.now();
            await DB.set('data/zb/order.json', d, '补单 ' + id);
            AUDIT.log('补单', id, o.uid);
            this.toast('已补发', 'ok');
            this.acts.odReload.call(this);
          }
        },
        async odReload() {
          const box = D('#odBox'); if (!box) return;
          const d = await DB.reload('data/zb/order.json');
          const l = (d && d.list) || [];
          box.innerHTML = l.length ? this.table(['订单', 'UID', '内容', '状态', '时间'],
            l.slice(0, 50).map((x) => [U.esc(x.id), U.esc(x.uid),
              U.itemName(x.item) + '×' + x.n,
              x.state === 'done' ? '<span class="bd g">已补发</span>' : '<span class="bd y">待处理</span>',
              U.dt(x.at)])) : this.empty('暂无订单');
        },
      },
      bind() {
        if (APP.T.shop === 'goods') this.acts.shpReload.call(this);
        else this.acts.odReload.call(this);
      },
    };

    /* =================================================================
     * 12. 广告
     * ================================================================= */
    A.ad = {
      n: '广告', i: '📺', g: '运营', perm: 'ad.cfg',
      render() {
        return `<div class="card">
          <h3>广告位配置<span class="tag">每日次数 / 奖励</span></h3>
          <div class="fr"><label class="wide">广告位</label><select id="ad_id">
            ${(EX.ads || [{ id: 'AD01', n: '复活' }, { id: 'AD02', n: '双倍收益' }, { id: 'AD03', n: '体力' }])
              .map((a) => `<option value="${U.esc(a.id)}">${U.esc(a.n || a.id)}</option>`).join('')}
          </select></div>
          <div class="fr"><label class="wide">每日上限</label><input id="ad_max" type="number" value="5"></div>
          <div class="fr"><label class="wide">奖励物品</label>${U.picker('ad_i', 'gold')}</div>
          <div class="fr"><label class="wide">奖励数量</label><input id="ad_n" type="number" value="100"></div>
          <div class="btns">
            <button class="btn pri" data-a="adSave">💾 保存配置</button>
            <button class="btn" data-a="adReload">⟳ 刷新</button>
          </div>
        </div>
        <div class="card">
          <h3>广告变现统计</h3>
          <div class="btns"><button class="btn" data-a="adStat">📈 统计</button></div>
          <div id="adBox" style="margin-top:10px"></div>
        </div>`;
      },
      acts: {
        async adSave() {
          const d = await DB.reload(DBP.ad);
          d.cfg = d.cfg || {};
          d.cfg[this.val('#ad_id')] = {
            max: this.num('#ad_max'), item: this.val('#ad_i'), n: this.num('#ad_n'), at: Date.now(),
          };
          if (await DB.set(DBP.ad, d, '配置广告位')) {
            AUDIT.log('配置广告位', this.val('#ad_id'), '上限' + this.num('#ad_max'));
            this.toast('已保存', 'ok');
            this.acts.adReload.call(this);
          }
        },
        async adReload() {
          const box = D('#adBox'); if (!box) return;
          const d = await DB.reload(DBP.ad);
          const c = (d && d.cfg) || {};
          box.innerHTML = Object.keys(c).length
            ? this.table(['广告位', '每日上限', '奖励'], Object.keys(c).map((k) => [U.esc(k), c[k].max, U.itemName(c[k].item) + '×' + c[k].n]))
            : this.empty('还没有配置');
        },
        adStat() {
          const box = D('#adBox'); if (!box) return;
          const P = this.PLIST.filter((p) => !p._noSave && !p._broken);
          let tot = 0, users = 0;
          const byAd = {};
          P.forEach((p) => {
            const u = p.adUsed || {};
            const n = Object.keys(u).length ? Object.keys(u).reduce((s, k) => s + (Number(u[k]) || 0), 0) : 0;
            if (n) users++;
            tot += n;
            Object.keys(u).forEach((k) => { byAd[k] = (byAd[k] || 0) + (Number(u[k]) || 0); });
          });
          box.innerHTML = `<div class="kpis" style="margin-bottom:10px">
              <div class="kpi"><div class="v">${tot}</div><div class="k">累计观看</div></div>
              <div class="kpi"><div class="v">${users}</div><div class="k">使用人数</div></div>
              <div class="kpi"><div class="v">${P.length ? (tot / P.length).toFixed(1) : 0}</div><div class="k">人均次数</div></div>
            </div>` + (Object.keys(byAd).length
            ? this.table(['广告位', '次数'], Object.keys(byAd).map((k) => [U.esc(k), byAd[k]]))
            : this.empty('暂无数据'));
        },
      },
      bind() { this.acts.adReload.call(this); },
    };

    /* =================================================================
     * 13. 社交（好友 / 聊天 / 在线状态 / 军团）
     * ================================================================= */
    A.social = {
      n: '社交', i: '👥', g: '运营', perm: 'social.view',
      render() {
        const t = tab('social', 'friend');
        const seg = (k, n) => `<button class="${t === k ? 'on' : ''}" data-a="tab" data-k="${k}">${n}</button>`;
        const body = t === 'friend'
          ? `<div class="btns"><button class="btn" data-a="scStat">📈 在线状态统计</button></div>
             <div id="scBox" style="margin-top:10px"></div>`
          : `<div class="btns"><button class="btn" data-a="lgReload">⟳ 刷新军团</button></div>
             <div id="lgBox" style="margin-top:10px"></div>`;
        return `<div class="card">
          <h3>社交<span class="tag">好友 / 聊天 / 军团</span></h3>
          <div class="seg" style="margin-bottom:10px">${seg('friend', '好友 / 在线')}${seg('legion', '军团管理')}</div>
          ${body}</div>`;
      },
      acts: {
        tab(t) { APP.T.social = t.dataset.k; this.render(); },
        scStat() {
          const box = D('#scBox'); if (!box) return;
          const P = this.PLIST.filter((p) => !p._noSave && !p._broken);
          const now = Date.now();
          const on = P.filter((p) => (p.lastSeen || 0) >= now - 30 * 60e3).length;
          const today = P.filter((p) => (p.lastSeen || 0) >= now - 864e5).length;
          let fr = 0, msg = 0;
          P.forEach((p) => {
            fr += ((p.friends || []).length) || Object.keys(p.friends || {}).length || 0;
            msg += ((p.chat || []).length) || 0;
          });
          box.innerHTML = `<div class="kpis">
              <div class="kpi"><div class="v">${on}</div><div class="k">30分钟内在线</div></div>
              <div class="kpi"><div class="v">${today}</div><div class="k">今日活跃</div></div>
              <div class="kpi"><div class="v">${fr}</div><div class="k">好友关系总数</div></div>
              <div class="kpi"><div class="v">${msg}</div><div class="k">聊天消息总数</div></div>
            </div>
            <h3 style="font-size:13px;margin:14px 0 8px">最近活跃</h3>
            ${this.table(['昵称', 'UID', '等级', '活跃'],
              P.slice().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)).slice(0, 20)
                .map((p) => [U.esc(p.name || '—'), U.esc(p.uid), p.lv || 1, U.ago(p.lastSeen)]))}`;
        },
        async lgReload() {
          const box = D('#lgBox'); if (!box) return;
          const P = this.PLIST.filter((p) => !p._noSave && !p._broken);
          const withLg = P.filter((p) => p.legion);
          box.innerHTML = `<div class="hint">共 ${withLg.length} 名玩家加入了军团</div>` +
            (withLg.length ? this.table(['玩家', '军团', '贡献', 'UID'],
              withLg.map((p) => {
                const l = p.legion || {};
                return [U.esc(p.name || '—'), U.esc(l.n || l.name || l.id || '—'),
                  U.fmt(l.contrib || l.ctb || 0), U.esc(p.uid)];
              })) : this.empty('暂无军团数据'));
        },
      },
      bind() {
        if (APP.T.social === 'friend') this.acts.scStat.call(this);
        else this.acts.lgReload.call(this);
      },
    };

    /* =================================================================
     * 14. 待开发 —— 公告管理
     * ================================================================= */
    A.notice = {
      n: '公告管理', i: '📢', g: '待开发', perm: 'notice.view',
      render() {
        return `<div class="card">
          <h3>公告管理<span class="tag">前端接口已预留，尚未接入</span></h3>
          <div class="lbl">当前状态：<span class="bd y">待开发</span>
            —— 公告内容可在此先配置好并存入 notice.json，等前端接入后即可展示。</div>
          <div class="fr"><label class="wide">公告标题</label><input id="nt_t" placeholder="如：版本更新公告"></div>
          <div class="fr"><label class="wide">内容</label><textarea id="nt_b" placeholder="公告正文"></textarea></div>
          <div class="fr"><label class="wide">类型</label><select id="nt_k">
            <option value="info">普通</option><option value="warn">重要</option><option value="hot">活动</option></select></div>
          <div class="fr"><label class="wide">展示至</label><input id="nt_e" type="date"></div>
          <div class="btns">
            <button class="btn pri" data-a="ntAdd">＋ 发布公告</button>
            <button class="btn" data-a="ntReload">⟳ 刷新列表</button>
          </div>
          <div id="ntBox" style="margin-top:10px"></div>
        </div>`;
      },
      acts: {
        async ntAdd() {
          const t = this.str('#nt_t');
          if (!t) { this.toast('标题必填', 'err'); return; }
          const d = await DB.reload(DBP.notice);
          d.list = d.list || [];
          d.list.unshift({
            id: 'nt' + Date.now().toString(36), title: t, body: this.str('#nt_b'),
            kind: this.val('#nt_k'), endAt: this.val('#nt_e') ? new Date(this.val('#nt_e') + 'T23:59:59').getTime() : 0,
            at: Date.now(), by: 'admin',
          });
          if (d.list.length > 100) d.list.length = 100;
          if (await DB.set(DBP.notice, d, '发布公告')) {
            AUDIT.log('发布公告', t, '');
            this.toast('已发布（待前端接入后展示）', 'ok');
            this.acts.ntReload.call(this);
          }
        },
        async ntReload() {
          const box = D('#ntBox'); if (!box) return;
          const d = await DB.reload(DBP.notice);
          const l = (d && d.list) || [];
          box.innerHTML = l.length ? this.table(['时间', '类型', '标题', '操作'],
            l.map((x) => [U.dt(x.at), U.esc(x.kind), U.esc(x.title),
              `<button class="btn sm err" data-a="ntDel" data-id="${U.esc(x.id)}">删除</button>`]))
            : this.empty('暂无公告');
        },
        async ntDel(t) {
          const d = await DB.reload(DBP.notice);
          d.list = (d.list || []).filter((x) => x.id !== t.dataset.id);
          await DB.set(DBP.notice, d, '删除公告');
          this.toast('已删除', 'ok');
          this.acts.ntReload.call(this);
        },
      },
      bind() { this.acts.ntReload.call(this); },
    };
  },
};
