/* tools/charsnd.cjs ——【V1.3.1】角色专属音效守卫
 *
 * 背景：16 个角色切换时播的都是通用 pickup 音。
 * 角色定位（医疗/重装/狙击/工程/爆破…）此前只有文字描述，
 * 没有任何听觉反馈 —— "换角色"在体验上等于没发生。
 *
 * 本守卫做四件事：
 *   A. 每个角色都配了 sfx + sfxBend（不得漏配）
 *   B. 音型必须在 audio.js 的 charSfx switch 里真实实现（防"配了不响"）
 *   C. (sfx, sfxBend) 组合两两不同 —— 保证 16 个角色两两可辨
 *   D. ui.js 角色切换处真接线，且保留 pickup 回退
 *
 * 用法：node tools/charsnd.cjs   （退出码 0=通过，1=失败）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n + (extra ? ' → ' + extra : '')); } };

const cfg = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
const aud = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');

/* ---------- 解析角色 ---------- */
const chars = [];
{
  const i = cfg.indexOf('\n  chars: [');
  const j = cfg.indexOf('\n  ],', i);
  const seg = cfg.slice(i, j);
  const re = /\{ id: '(C\d\d)',\s*sfx: '([a-z]+)',\s*sfxBend: (\d),/g;
  let m;
  while ((m = re.exec(seg))) chars.push({ id: m[1], sfx: m[2], bend: +m[3] });
}

console.log('=== V1.3.1 角色专属音效守卫 ===');
console.log('解析到角色: ' + chars.length);

/* A. 全部角色配齐 */
ok('A1 角色总数 16', chars.length === 16, '实际 ' + chars.length);
ok('A2 无角色漏配 sfx', chars.every((c) => c.sfx && c.sfx.length > 0));
ok('A3 sfxBend 只能是 0/1', chars.every((c) => c.bend === 0 || c.bend === 1));

/* B. 音型必须在 audio.js 真实实现（剥离注释，防注释里的 case 骗过断言） */
const body = aud.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const k = body.indexOf('charSfx(charId)');
ok('B1 audio.js 存在 charSfx', k > 0);
const seg2 = body.slice(k, body.indexOf('\n  },', k));
const cases = [...seg2.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]);
const used = [...new Set(chars.map((c) => c.sfx))].sort();
console.log('  已实现音型: ' + cases.join(', '));
console.log('  角色用到音型: ' + used.join(', '));
used.forEach((t) => {
  ok('B2 音型已实现: ' + t, cases.includes(t), 'switch 里没有 case ' + t);
});
ok('B3 存在 default 回退', /default:\s*this\.play\('pickup'\)/.test(seg2));

/* C. 组合两两不同（保证两两可辨） */
const combo = chars.map((c) => c.sfx + ':' + c.bend);
ok('C1 音型组合两两不同', new Set(combo).size === combo.length,
  '重复 ' + combo.length + '→' + new Set(combo).size);

/* C2. 真实调用合成器 —— 不同音型必须产生不同的发声序列 */
{
  const calls = [];
  const ctxStub = { createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }) };
  const S = {
    ctx: {}, sfxOn: true, MIN_GAP: {}, _last: {},
    tone(f, d, o) { calls.push('tone:' + Math.round(f) + ':' + (o && o.type || '')); },
    noise(d, o) { calls.push('noise:' + Math.round((o && o.freq) || 0)); },
    play(n) { calls.push('play:' + n); },
    charSfx: null,
  };
  // 真实执行 audio.js 里的 charSfx 函数体
  const st = aud.indexOf('charSfx(charId) {');
  let d = 0, e = -1;                       // 花括号计数，精确定位方法体结尾
  for (let x = aud.indexOf('{', st); x < aud.length; x++) {
    if (aud[x] === '{') d++;
    else if (aud[x] === '}') { d--; if (d === 0) { e = x + 1; break; } }
  }
  const fnSrc = aud.slice(st, e);
  // eslint-disable-next-line no-new-func
  const fn = new Function('EX', 'return {' + fnSrc + '};')({ chars: chars.map((c) => ({ id: c.id, sfx: c.sfx, sfxBend: c.bend })) });
  Object.assign(S, { charSfx: fn.charSfx });
  /* setTimeout 里的第二/三声必须同步收集，否则只比到第一声，
   * 断言会变松（抓不出"只有首音不同、后续全一样"的缺陷）。 */
  const realST = global.setTimeout;
  global.setTimeout = (fn) => { fn(); return 0; };
  const sigMap = {};
  chars.forEach((c) => {
    calls.length = 0;
    S.charSfx(c.id);
    sigMap[c.id] = calls.join('|');
  });
  global.setTimeout = realST;
  const sigs = Object.values(sigMap);
  ok('C2 16 个角色发声序列两两不同', new Set(sigs).size === 16,
    '唯一序列 ' + new Set(sigs).size + '/16');
  ok('C3 每个角色都真的发声', chars.every((c) => sigMap[c.id].length > 0));
  ok('C4 未配 sfx 时回退 pickup', (() => {
    calls.length = 0;
    S.charSfx('C99');
    return calls.join('|') === 'play:pickup';
  })(), calls.join('|'));
}

/* D. ui.js 接线（剥离注释） */
{
  const u = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const sw = u.indexOf("E.switchChar(p, el.dataset.chsel)");
  ok('D1 找到角色切换点', sw > 0);
  const seg3 = u.slice(sw, sw + 700);
  ok('D2 切换时调用 charSfx', /SND\.charSfx\(/.test(seg3));
  ok('D3 保留 pickup 回退', /else\s+SND\.play\('pickup'\)/.test(seg3));
}

console.log('\n--- ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
