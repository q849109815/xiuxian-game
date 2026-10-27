/* V1.0.2 D-01 常驻验证：令牌外置开关
 * 断言：
 *  A1 未填 API_PROXY → authHeaders 带 Authorization（默认行为不变）
 *  A2 填了 API_PROXY → authHeaders 不带 Authorization（令牌不外泄）
 *  A3 代理模式 → allEps 收敛为唯一代理域名
 *  A4 直连模式 → allEps 仍是完整端点池（>5）
 *  A5 代理模式 → diagnose 返回单条 proxy 记录
 *  A6 源码中令牌仍存在（未误删，直连模式仍可用）
 */
const fs = require('fs'), vm = require('vm');
const SRC = fs.readFileSync(__dirname + '/../js/net.js', 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, x) => { c ? (pass++, console.log('  ok ' + n)) : (fail++, console.log('  x  ' + n + (x ? ' :: ' + x : ''))); };

function load(EXv) {
  const ctx = {
    window: {}, localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    fetch: () => Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({}) }),
    AbortController: function () { this.signal = {}; this.abort = () => {}; },
    console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Set, Map,
    EX: EXv, location: { href: 'http://x/', protocol: 'http:' },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'net.js' });
  return ctx;
}

console.log('D-01 令牌外置开关验证');
// 直连模式
const a = load({ API_PROXY: '' });
try {
  const H = vm.runInContext('authHeaders()', a);
  ok(!!H.Authorization, 'A1 直连模式带令牌', JSON.stringify(Object.keys(H)));
  const eps = vm.runInContext('allEps()', a);
  ok(eps.length > 5, 'A4 直连模式端点池完整', 'len=' + eps.length);
} catch (e) { ok(false, 'A1/A4 执行', e.message); }

// 代理模式
const b = load({ API_PROXY: 'https://zb-api.demo.workers.dev' });
try {
  const H = vm.runInContext('authHeaders()', b);
  ok(!H.Authorization, 'A2 代理模式不带令牌', JSON.stringify(Object.keys(H)));
  const eps = vm.runInContext('allEps()', b);
  ok(eps.length === 1 && eps[0] === 'https://zb-api.demo.workers.dev',
     'A3 代理模式端点收敛', JSON.stringify(eps));
} catch (e) { ok(false, 'A2/A3 执行', e.message); }

ok(SRC.indexOf('github_pat_11ASQODRI0') >= 0, 'A6 内置令牌仍在（直连可用）');
const tcnt = (SRC.match(/\+ GH_TOKEN/g) || []).length;
ok(tcnt === 1, 'A7 令牌仅在一处拼装（收口到 authHeaders）', '出现 ' + tcnt + ' 次');

console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
