#!/usr/bin/env node
/**
 * tools/shopux.cjs ——【商城状态卡·购买入口】守卫
 *
 * 立规原因（不是凭空加的）：
 *   月卡 / 战令的「状态卡」与「商品卡」此前是两块割裂的 UI。
 *   状态卡在未开通时只给一句 24 字说明「未开通 · 在上方购买「月卡」后 30 天内每日可领」，
 *   而月卡商品实际渲染在【下方】—— 指引方向是错的，且状态卡里根本没有按钮，
 *   玩家必须自己滚下去找。这属于典型的「布局有病靠文字治」。
 *
 *   按项目铁律：删掉文字就看不懂，说明布局本身有问题，直接重做，而不是补更长的说明。
 *   现在状态卡内直接给购买入口，价格/ID 一律从商品表取，禁止硬编码。
 *
 * 用法：node tools/shopux.cjs   （退出码 0=通过，1=失败）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n + (extra ? '  ← ' + extra : '')); } };

/* ---------- 1. 真实商品表（eval config.js 的 shopGoods 块） ---------- */
function readShopGoods() {
  const s = R('js/config.js');
  const key = 'shopGoods: {';
  const start = s.indexOf(key);
  if (start < 0) throw new Error('未找到 shopGoods 块');
  let d = 0, i = start + key.length - 1, j = -1;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) { j = i + 1; break; } }
  }
  return eval('(' + s.slice(start + key.length - 1, j) + ')');
}
const G = readShopGoods();
const dg = G['直购'] || [];
const mc = dg.find((g) => g && g.monthly) || null;
const pa = dg.find((g) => g && g.pass === 'adv') || null;

console.log('=== 商城状态卡购买入口守卫 ===');
console.log('直购商品 ' + dg.length + ' 件 · 月卡 ' + (mc ? mc.id : '缺失') + ' · 战令进阶 ' + (pa ? pa.id : '缺失'));

/* ---------- A 商品表 ---------- */
ok(!!mc, 'A1 商品表存在月卡（monthly=true）');
ok(!!pa, 'A2 商品表存在战令进阶（pass=adv）');
ok(!!mc && mc.price > 0, 'A3 月卡有价格', mc && mc.price);
ok(!!pa && pa.price > 0, 'A4 战令进阶有价格', pa && pa.price);

const UISRC = R('js/ui.js');

/* ---------- B 源码接线（剥注释后仍成立） ---------- */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const U = strip(UISRC);

ok(/const\s+_dg\s*=\s*\(EX\.shopGoods\s*\|\|\s*\{\}\)\['直购'\]/.test(U), 'B1 从商品表动态取直购清单（防硬编码）');
ok(/const\s+_mc\s*=\s*_dg\.find\(/.test(U) && /const\s+_pa\s*=\s*_dg\.find\(/.test(U), 'B2 月卡/战令均从清单查找（防写死 id）');
ok(U.indexOf('data-buy="${_mc.id') >= 0, 'B3 月卡状态卡内有购买按钮（data-buy 取 _mc.id）');
ok(U.indexOf('data-buy="${_pa.id') >= 0, 'B4 战令状态卡内有购买按钮（data-buy 取 _pa.id）');

/* ---------- C 已删除的多余说明不得复活 ---------- */
const DEAD = [
  '未开通 · 在上方购买',
  '按通关关卡数解锁，',
  '购买「战令(进阶)」解锁高级奖励',
  '还没有好友，点击下方添加',
  '当前排期已全部发布',
  '<div class="empty">待开发</div>',
];
DEAD.forEach((t) => ok(UISRC.indexOf(t) < 0, 'C 已删文案未复活：' + t.slice(0, 20)));

/* ---------- D 真实渲染：把 r_shop 抽出来在 Node 里跑一遍 ---------- */
function methodBody(src, name) {
  const key = name + '(p, tab) {';
  const i = src.indexOf(key);
  if (i < 0) throw new Error('未找到方法 ' + name);
  let d = 0, k = i + key.length - 1, j = -1;
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) { j = k + 1; break; } }
  }
  return src.slice(i + key.length, j - 1);
}

/* mock 最小环境（只补 r_shop 真正用到的东西） */
const E = {
  fmt: (n) => String(Math.floor(Number(n) || 0)),
  monthCardLeft: (p) => (p && p.monthCard && p.monthCard.until > Date.now()) ? 12 : 0,
  passLevel: () => 3,
  PASS_TIERS: [{ lv: 1, n: 'T1' }, { lv: 5, n: 'T5' }],
  isRechargeGoods: () => false,
  giftCan: () => null,
  staminaFull: () => false,
};
const EX = { shopGoods: G, STAMINA_MAX: 100 };
const UI = {
  PANELS: { shop: [['shop'], ['每日', '直购']] },
  esc: (s) => String(s),
  shopOwned: () => '',
};
const AUTH_NOW = () => Date.now();

const P_OFF = { gold: 100, diamond: 99999, monthCard: null, passAdv: false };
const P_ON = { gold: 100, diamond: 99999, monthCard: { until: Date.now() + 86400000 * 5, last: '' }, passAdv: true };
function render(p, tab) {
  const fn = new Function('E', 'EX', 'UI', 'AUTH_NOW', 'p', 'tab', methodBody(UISRC, 'r_shop'));
  return fn.call(UI, E, EX, UI, AUTH_NOW, p, tab);
}
let html = '';
try { html = render(P_OFF, '直购'); }
catch (e) { ok(false, 'D0 r_shop 真实渲染可执行', e.message.slice(0, 120)); }

if (html) {
  ok(true, 'D0 r_shop 真实渲染可执行');
  /* 未开通月卡 → 必须出现购买按钮，且 id/价格来自商品表 */
  // 状态卡按钮带 blk（整宽），下方商品卡按钮是 btn sm —— 用类名区分，避免把商品列表算进来
  const RE_MC = new RegExp('class="btn blk" data-buy="' + (mc ? mc.id : 'SH05') + '"');
  const RE_PA = new RegExp('class="btn sm blk" data-buy="' + (pa ? pa.id : 'SH07') + '"');
  ok(RE_MC.test(html), 'D1 未开通时月卡状态卡内出现购买按钮 ' + (mc ? mc.id : ''));
  ok(mc && html.indexOf('💎' + mc.price) >= 0, 'D2 月卡按钮价格取自商品表', mc && mc.price);
  ok(pa && RE_PA.test(html), 'D3 未进阶时战令状态卡内出现购买按钮 ' + (pa ? pa.id : ''));
  ok(pa && html.indexOf('💎' + pa.price) >= 0, 'D4 战令按钮价格取自商品表', pa && pa.price);
  ok(html.indexOf('未开通') >= 0, 'D5 未开通时给出明确状态（而不是长说明）');
  /* 已开通 / 已进阶 → 不再重复卖 */
  let html2 = '';
  try { html2 = render(P_ON, '直购'); } catch (e) { ok(false, 'D6 已开通态可渲染', e.message.slice(0, 120)); }
  if (html2) {
    ok(true, 'D6 已开通态可渲染');
    ok(!RE_MC.test(html2), 'D7 已开通月卡状态卡不再显示开通按钮');
    ok(!RE_PA.test(html2), 'D8 已进阶战令状态卡不再显示升级按钮');
    ok(html2.indexOf('shMcClaim') >= 0, 'D9 已开通月卡显示领取按钮');
  }
}

console.log('\nRESULT: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
