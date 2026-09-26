/* =====================================================================
 * ops.js —— 表02第15项 热更新 / 表37 运营埋点 / 表39 多语言 / 表38 版本
 * =================================================================== */
(function (root) {
  'use strict';

  const KEY_HOT = 'z_hot_ver';
  const KEY_TRACK = 'z_track_buf';
  const KEY_LANG = 'z_lang';

  const OPS = {
    /* ---------------- 热更新（表02 第15项 / 表23 第9项） ---------------- */
    curVer() {
      const H = (window.EX && EX.HOT_UPDATE) || { version: '1' };
      return H.version;
    },
    /* 启动时检查：与本地记录版本不一致 → 有更新 */
    checkUpdate() {
      const H = (window.EX && EX.HOT_UPDATE) || null;
      if (!H || !H.enabled) return { updated: false };
      const now = H.version;
      let old = null;
      try { old = localStorage.getItem(KEY_HOT); } catch (e) { old = null; }
      if (old === now) return { updated: false, ver: now };
      /* 版本变了：刷新缓存版本号并提示 */
      try { localStorage.setItem(KEY_HOT, now); } catch (e) {}
      return { updated: !!old, ver: now, from: old };
    },
    /* 给资源 URL 附加热更新版本号 */
    res(p) {
      if (window.EX && EX.resUrl) return EX.resUrl(p);
      const v = this.curVer();
      return p + '?v=' + v;
    },
    /* 清单总大小（用于展示） */
    manifestInfo() {
      const H = (window.EX && EX.HOT_UPDATE) || { manifest: [] };
      const list = H.manifest || [];
      return { n: list.length, ver: H.version };
    },

    /* ---------------- 运营埋点（表37：12 个事件） ---------------- */
    track(ev, param) {
      if (!window.EX) return;
      const def = (EX.TRACK_EVENTS || []).find((x) => x.id === ev);
      /* 只上报 P0/P1，P2 也记但标记低优先 */
      let buf = [];
      try { buf = JSON.parse(localStorage.getItem(KEY_TRACK) || '[]'); } catch (e) { buf = []; }
      buf.push({
        ev: ev, n: def ? def.n : ev, p: param || {},
        t: Date.now(), pr: def ? def.pr : 'P2',
      });
      /* 最多留 500 条，防止无限增长 */
      if (buf.length > 500) buf = buf.slice(-500);
      try { localStorage.setItem(KEY_TRACK, JSON.stringify(buf)); } catch (e) {}
      /* 同时写入玩家存档（随存档上传云端）
       * 数据链路 BUG 修复：此前埋点只存在【玩家自己浏览器的 localStorage】里，
       * 后台「数据埋点」页读的是运营自己电脑的缓冲 —— 全服玩家的埋点
       * 从来没有上报过一次，运营报表看到的永远是 0 条或只有自己的数据。
       * 现在附在存档上（最多 30 条，控制存档体积），后台汇总即可看到全服数据。 */
      try {
        const p = window.P;
        if (p && p.uid) {
          if (!Array.isArray(p._bi)) p._bi = [];
          p._bi.push({ ev: ev, n: def ? def.n : ev, t: Date.now(), pr: def ? def.pr : 'P2' });
          if (p._bi.length > 30) p._bi = p._bi.slice(-30);
        }
      } catch (e) {}
    },
    trackBuf() {
      try { return JSON.parse(localStorage.getItem(KEY_TRACK) || '[]'); } catch (e) { return []; }
    },
    /* 按事件聚合统计 */
    trackStat() {
      const buf = this.trackBuf();
      const m = {};
      buf.forEach((x) => {
        if (!m[x.ev]) m[x.ev] = { n: x.n || x.ev, cnt: 0, pr: x.pr, last: 0 };
        m[x.ev].cnt++;
        m[x.ev].last = Math.max(m[x.ev].last, x.t);
      });
      return m;
    },
    clearTrack() {
      try { localStorage.removeItem(KEY_TRACK); } catch (e) {}
    },

    /* ---------------- 多语言（表39） ---------------- */
    getLang() {
      try { return localStorage.getItem(KEY_LANG) || 'zh'; } catch (e) { return 'zh'; }
    },
    setLang(k) {
      try { localStorage.setItem(KEY_LANG, k); } catch (e) {}
    },
    t(id) {
      if (!window.EX) return id;
      return EX.txt(id, this.getLang());
    },

    /* ---------------- 版本排期（表38） ---------------- */
    versions() { return (window.EX && EX.VERSIONS) || []; },
    /* 当前游戏版本：取最后一个已完成版本 */
    curVersion() {
      const v = this.versions();
      const done = v.filter((x) => x.done);
      return done.length ? done[done.length - 1] : v[0] || null;
    },
  };

  root.OPS = OPS;
})(window);
