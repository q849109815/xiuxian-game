/* [vis3.cjs] 立规原因：V1.3.88 修复的三类缺陷此前全部「守卫全绿但玩家看得见」——
 * ① 战斗语义变量 --bt-* 写在 :root 闭合花括号之后（裸声明被浏览器整段忽略），
 *    top:var(--bt-status-top) 回退 0，状态带/侧键全塌到顶栏，血条压住关卡名；
 * ② 底部换弹盘 <img> 无 src，只剩一个空方框；
 * ③ 24 个面板里 7 个下半屏裸黑（实测空白 283~612px），空状态只给 170/280px。
 * 既有守卫只问「面板能不能打开、有没有报错」，从不问这些信息层次与盒子高度。
 *
 * 判据：6 条静态源码断言 + 6 条真实 Chrome 量盒子断言，以本工具自身输出为准。
 * 退出码：0=全过 / 1=存在未过项 / 2=前提未就绪或崩溃（崩溃显式判失败，不静默报绿）。
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let P = 0, F = 0; const bad = [];
const ok = (c, n, d) => { if (c) { P++; console.log('PASS ' + n); } else { F++; bad.push(n + ' :: ' + d); console.log('FAIL ' + n + ' :: ' + d); } };

/* 变量必须落在 :root{} 块内：找第一个 :root{ 的配对闭合，判断变量声明位置 */
function insideRoot(src, needle) {
  const i = src.indexOf(':root{');
  if (i < 0) return false;
  let depth = 0, end = src.length;
  for (let j = i + 6; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { if (depth === 0) { end = j; break; } depth--; }
  }
  const p = src.indexOf(needle);
  return p > i && p < end;
}

(async () => {
  const tk = R('css/tokens.css'), st = R('css/style.css'), ix = R('index.html'), ui = R('js/ui.js'), adm = R('admin/css/admin.css');
  ok(insideRoot(tk, '--bt-status-top:58px;'), 'S1 战斗语义变量在 :root 内',
    '变量掉出作用域会让 top 回退 0，状态带与顶栏重叠（V1.3.87 事故本源）');
  ok(insideRoot(tk, '--bt-side-bottom:140px;') && st.indexOf('var(--bt-status-top)') > 0, 'S2 变量有消费点',
    '只定义不使用等于没修');
  ok(/#battle \.btb-mid\{flex-direction:column/.test(st), 'S3 顶栏关卡名/波次分层',
    '横排会把关卡名、波次、血条挤成一条');
  ok(/id="btGunImg"[^>]*src="assets\/icon\/nav_gun\.png/.test(ix), 'S4 换弹盘有默认武器图',
    '无 src 时玩家看到空方框');
  ok(ui.indexOf('dataset.gunSet') > 0, 'S5 武器图只替换一次',
    '逐帧重设 src 会重复请求与闪烁');
  ok(/#panel \.card>\.empty\{min-height:min\(62vh,520px\)/.test(st), 'S6 空状态铺满内容区',
    '只给 170/280px 会留半屏裸黑');
  ok(adm.indexOf('V1.3.88 后台视觉精细化') > 0, 'S7 后台内容区有层次',
    '大屏上内容只占左上小块、其余裸黑');

  const { chromium } = require('playwright');
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'] });
  try {
    const pg = await b.newPage({ viewport: { width: 393, height: 852 } });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    await pg.goto('file://' + ROOT + '/index.html', { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(2600);
    await pg.evaluate(() => {
      try {
        P = E.newPlayer('localdev', '测试员', 'm'); P.lv = 45; P.gold = 999999;
        P.diamond = 9999; P.stamina = 80; P.gunLv = 12; UID = 'localdev'; UI.P = P;
        if (window.E && E.ensureDicts) E.ensureDicts(P);
        UI.show('battle');
        if (typeof UI.updateBattleHud === 'function') UI.updateBattleHud({ mag: 30, wallHp: 8600, wallMax: 8600 });
      } catch (e) {}
    });
    await pg.waitForTimeout(400);
    const bt = await pg.evaluate(() => {
      const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const gi = document.querySelector('#btGunImg');
      const mid = document.querySelector('.btb-mid');
      return {
        topbar: r('.bt-topbar'), status: r('.bt-status'), side: r('.bt-side'),
        midDir: mid ? getComputedStyle(mid).flexDirection : '',
        gunSrc: gi ? gi.getAttribute('src') : null, gunW: gi ? gi.naturalWidth : 0
      };
    });
    const tb = bt.topbar, ss = bt.status;
    ok(!!ss && ss.y >= 50, 'D1 状态带落在顶栏下方',
      '实测 status.y=' + (ss ? Math.round(ss.y) : 'null') + '，应 >=50');
    ok(!(tb && ss && ss.y < tb.bottom - 6), 'D2 状态带不压顶栏文字',
      '血条与关卡名重叠是玩家直接可见的难看');
    ok(!!bt.side && bt.side.y > 400, 'D3 右侧功能键不压顶栏',
      '实测 side.y=' + (bt.side ? Math.round(bt.side.y) : 'null'));
    ok(bt.midDir === 'column', 'D4 顶栏信息两层排布', '实测 flexDirection=' + bt.midDir);
    ok(!!bt.gunSrc && bt.gunW > 0, 'D5 换弹图标真实加载',
      'src=' + bt.gunSrc + ' naturalWidth=' + bt.gunW);

    await pg.evaluate(() => { UI.show('home'); UI.open('mail'); });
    await pg.waitForTimeout(300);
    const emptyH = await pg.evaluate(() => {
      const e = document.querySelector('#pnBody .empty');
      return e ? Math.round(e.getBoundingClientRect().height) : 0;
    });
    ok(emptyH >= 400, 'D6 空状态不再只占顶部一小块', '实测高度=' + emptyH + 'px');
    ok(errs.length === 0, 'D7 真实渲染 0 报错', errs.slice(0, 3).join(' | '));
    await pg.close();
  } finally { await b.close(); }

  console.log('\n==========================================================');
  console.log('vis3: PASS ' + P + ' / FAIL ' + F);
  if (F) bad.forEach(x => console.log('  · ' + x));
  process.exit(F ? 1 : 0);
})().catch(e => { console.error('SHOT_CRASH', e.stack); console.log('vis3: 崩溃显式判失败（前提未就绪）'); process.exit(2); });
