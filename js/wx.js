/* =========================================================
 * wx.js —— 微信登录 + 本机账户记忆
 * ---------------------------------------------------------
 * 说明（重要）：
 *   真正的微信 OAuth 登录需要：微信开放平台账号（企业资质，300元/年）
 *   + 已备案域名 + 后端服务器（接收 code，换 openid）。
 *   当前是纯静态 GitHub Pages，没有后端，所以：
 *
 *   · 现在实现的是「微信快捷登录」体验：一键登录 + 记住本机账户，
 *     下次打开自动进入，PC / 手机都免输入。
 *   · 若你要接真微信 OAuth，见本文件底部 WX.realOAuth() 注释，
 *     把 OA.appId 换成你的 AppID、OA.redirect 换成后端回调地址即可，
 *     其余逻辑（记住账户、自动登录）完全复用。
 * ========================================================= */

const WX = {
  /* ---- 真微信 OAuth 配置（有后端后填入即可启用） ---- */
  OA: {
    appId: '',        // 例：'wx1234567890abcdef'
    redirect: '',     // 例：'https://你的域名/api/wx/callback'
    enabled: false,   // 填入 appId 后改为 true 即走真实授权
  },

  KEY_UID: 'zb_uid',
  KEY_PHONE: 'zb_phone',
  KEY_WX: 'zb_wxbound',
  KEY_NAME: 'zb_name',
  KEY_GENDER: 'zb_gender',
  KEY_AUTO: 'zb_auto',

  /* ---------- 生成本机唯一账户 ID ---------- */
  uid() {
    let u = localStorage.getItem(this.KEY_UID);
    if (!u) {
      u = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      localStorage.setItem(this.KEY_UID, u);
    }
    return u;
  },

  /* ---------- 是否已绑定过微信（即是否记住了账户） ---------- */
  bound() {
    return localStorage.getItem(this.KEY_WX) === '1';
  },

  /* ---------- 取得记忆中的昵称 / 性别 ---------- */
  remembered() {
    return {
      name: localStorage.getItem(this.KEY_NAME) || '',
      gender: localStorage.getItem(this.KEY_GENDER) || 'm',
    };
  },

  /* ---------- 登录页提示文案 ---------- */
  tipText() {
    const p = this.phone();
    return p ? ('已绑定 ' + this.phoneMask() + '，下次打开自动进入')
             : '首次登录需微信授权并绑定手机号';
  },

  /* ---------- 手机号 ---------- */
  phone() { return localStorage.getItem(this.KEY_PHONE) || ''; },
  phoneMask() {
    const p = this.phone();
    return p ? p.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '';
  },

  /* =========================================================
   * 微信登录主流程（三步）
   *   ① 点「微信登录」→ 弹出微信授权页 → 点【允许】
   *   ② 首次登录 → 绑定手机号（输入手机号 + 验证码）
   *   ③ 进游戏；下次打开 → 微信一键登录，跳过 ①② 直接进
   * ========================================================= */
  async login() {
    const uid = this.uid();

    /* 已接入真微信 OAuth → 跳微信授权页 */
    if (this.OA.enabled && this.OA.appId && this.OA.redirect) {
      this.goOAuth();
      return { ok: false, pending: true };
    }

    /* ③ 已绑定过手机号 → 一键登录，不再弹窗 */
    if (this.bound() && this.phone()) {
      let nm = localStorage.getItem(this.KEY_NAME);
      if (!nm) { nm = this.randomWxName(); localStorage.setItem(this.KEY_NAME, nm); }
      const gd = localStorage.getItem(this.KEY_GENDER) || 'm';
      await this.sleep(320);
      return { ok: true, uid, name: nm, gender: gd, quick: true };
    }

    /* ① 微信授权页 */
    const allow = await this.showAuth();
    if (!allow) return { ok: false, msg: '已取消微信授权' };

    /* ② 绑定手机号 */
    const tel = await this.showTel();
    if (!tel) return { ok: false, msg: '未完成手机号验证' };

    /* 授权 + 绑定完成，记住账户 */
    localStorage.setItem(this.KEY_WX, '1');
    localStorage.setItem(this.KEY_AUTO, '1');
    localStorage.setItem(this.KEY_PHONE, tel.phone);

    let nm = localStorage.getItem(this.KEY_NAME);
    if (!nm) { nm = this.randomWxName(); localStorage.setItem(this.KEY_NAME, nm); }
    const gd = localStorage.getItem(this.KEY_GENDER) || (tel.gender || 'm');

    return { ok: true, uid, name: nm, gender: gd };
  },

  /* =========================================================
   * ① 微信授权弹窗（模拟微信客户端授权页）
   * ========================================================= */
  showAuth() {
    return new Promise((res) => {
      const box = document.getElementById('wxAuth');
      const yes = document.getElementById('wxaAllow');
      const no = document.getElementById('wxaCancel');
      if (!box || !yes) { res(true); return; }   /* 兼容：无浮层则直接通过 */
      box.classList.add('on');
      const done = (v) => {
        box.classList.remove('on');
        yes.onclick = null; no.onclick = null; box.onclick = null;
        yes.disabled = false; yes.textContent = '允许';
        res(v);
      };
      yes.onclick = () => {
        yes.disabled = true; yes.textContent = '授权中…';
        setTimeout(() => done(true), 520);
      };
      no.onclick = () => done(false);
      box.onclick = (e) => { if (e.target === box) done(false); };
    });
  },

  /* =========================================================
   * ② 手机号绑定页
   * ========================================================= */
  showTel() {
    return new Promise((res) => {
      const box = document.getElementById('wxTel');
      if (!box) { res({ phone: '' }); return; }
      const ph = document.getElementById('wxtPhone');
      const cd = document.getElementById('wxtCode');
      const send = document.getElementById('wxtSend');
      const go = document.getElementById('wxtGo');
      const back = document.getElementById('wxtBack');
      const tip = document.getElementById('wxtTip');
      const agree = document.getElementById('wxtAgree');
      let timer = null;

      ph.value = ''; cd.value = ''; tip.textContent = '';
      send.disabled = false; send.textContent = '获取验证码';
      go.disabled = false; go.textContent = '登 录';
      box.classList.add('on');
      setTimeout(() => ph.focus(), 320);

      const say = (m, ok) => {
        tip.textContent = m;
        tip.style.color = ok ? '#07c160' : '#e64340';
      };
      const done = (v) => {
        if (timer) clearInterval(timer);
        box.classList.remove('on');
        send.onclick = null; go.onclick = null; back.onclick = null;
        res(v);
      };
      const valid = (v) => /^1[3-9]\d{9}$/.test(v || '');

      /* 获取验证码 */
      send.onclick = () => {
        if (!valid(ph.value.trim())) { say('请输入正确的手机号'); ph.focus(); return; }
        let n = 60;
        send.disabled = true; send.textContent = n + 's 后重发';
        if (timer) clearInterval(timer);
        timer = setInterval(() => {
          n--;
          if (n <= 0) { clearInterval(timer); send.disabled = false; send.textContent = '重新获取'; }
          else send.textContent = n + 's 后重发';
        }, 1000);
        say('验证码已发送至 ' + ph.value.trim().replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'), true);
        cd.focus();
      };

      /* 登录 / 绑定 */
      go.onclick = () => {
        const p = (ph.value || '').trim();
        const c = (cd.value || '').trim();
        if (!valid(p)) { say('请输入正确的手机号'); ph.focus(); return; }
        if (!/^\d{6}$/.test(c)) { say('请输入 6 位数字验证码'); cd.focus(); return; }
        if (agree && !agree.checked) { say('请先阅读并同意用户协议'); return; }
        go.disabled = true; go.textContent = '登录中…';
        setTimeout(() => {
          /* 演示环境：任意 6 位数字均通过；接真短信服务后改为校验接口 */
          const g = parseInt(c.slice(-1), 10) % 2 === 0 ? 'f' : 'm';
          localStorage.setItem(this.KEY_GENDER, g);
          done({ phone: p, gender: g });
        }, 420);
      };

      back.onclick = () => done(null);
    });
  },

  /* ---------- 跳微信授权页（真 OAuth 时用） ---------- */
  goOAuth() {
    const cb = encodeURIComponent(this.OA.redirect);
    const state = encodeURIComponent(this.uid());
    const url = 'https://open.weixin.qq.com/connect/oauth2/authorize'
      + '?appid=' + this.OA.appId
      + '&redirect_uri=' + cb
      + '&response_type=code&scope=snsapi_userinfo'
      + '&state=' + state + '#wechat_redirect';
    window.location.href = url;
  },

  /* ---------- 微信风格随机昵称 ---------- */
  randomWxName() {
    const a = ['末日', '废土', '钢铁', '烈焰', '寒冰', '雷霆', '暗夜', '狂风',
      '孤狼', '猎手', '先锋', '铁血', '暴走', '寂静', '苍穹'];
    const b = ['幸存者', '猎手', '战士', '守望', '行者', '旅人', '枪神', '指挥官',
      '守卫', '先锋官', '老兵', '游侠'];
    return a[Math.floor(Math.random() * a.length)]
      + b[Math.floor(Math.random() * b.length)]
      + Math.floor(Math.random() * 90 + 10);
  },

  /* ---------- 保存昵称性别（手动建号 / 改名时调用） ---------- */
  saveProfile(name, gender) {
    localStorage.setItem(this.KEY_NAME, name);
    localStorage.setItem(this.KEY_GENDER, gender);
    localStorage.setItem(this.KEY_WX, '1');
    localStorage.setItem(this.KEY_AUTO, '1');
  },

  /* ---------- 退出 / 切换账户 ---------- */
  logout() {
    localStorage.removeItem(this.KEY_WX);
    localStorage.removeItem(this.KEY_AUTO);
    localStorage.removeItem(this.KEY_UID);
    localStorage.removeItem(this.KEY_NAME);
    localStorage.removeItem(this.KEY_PHONE);
    if (window.UI && UI.toast) UI.toast('已退出，可重新登录', 'ok');
    setTimeout(() => { location.reload(); }, 500);
  },

  /* ---------- 是否应自动登录 ---------- */
  shouldAuto() {
    return localStorage.getItem(this.KEY_AUTO) === '1' && this.bound() && !!this.phone();
  },

  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },
};

/* =========================================================
 * 接真微信 OAuth 的方法（有后端后启用）
 * ---------------------------------------------------------
 * 1. 微信开放平台（open.weixin.qq.com）创建「网站应用」，拿到 AppID / AppSecret
 * 2. 后端写一个接口 /api/wx/callback：
 *      - 收 code
 *      - 用 code + AppSecret 换 access_token / openid
 *      - 用 openid 查或建你的玩家存档
 *      - 返回一个 token 或 uid 给前端
 * 3. 前端把 OA.appId / OA.redirect 填好、OA.enabled = true
 * 4. 登录跳微信扫码页 → 用户确认 → 回跳你的后端 → 后端把 uid 写回页面
 *    前端收到 uid 后调用 WX.onOAuthDone(uid, nickname, gender)
 * ========================================================= */
WX.onOAuthDone = function (uid, name, gender) {
  localStorage.setItem(WX.KEY_UID, uid);
  localStorage.setItem(WX.KEY_NAME, name || WX.randomWxName());
  localStorage.setItem(WX.KEY_GENDER, gender || 'm');
  localStorage.setItem(WX.KEY_WX, '1');
  localStorage.setItem(WX.KEY_AUTO, '1');
  if (window.MAIN) MAIN.enterWith(uid, name, gender);
};

window.WX = WX;
