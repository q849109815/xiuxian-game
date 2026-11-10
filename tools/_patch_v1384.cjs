#!/usr/bin/env node
/* V1.3.84 交互操作性整改补丁（一次性执行，幂等）：
 *  A 任务面板「前往任务」→「前往关卡」：按钮实际打开 level/章节，文案与行为必须一致。
 *  B 商店卡片重做：剥离描述里静态「· 每日N次」（动态状态行已表达）、
 *    限购达上限时按钮直接写「已达上限」、价格与状态并入同一行、卡片收紧。
 * 三体验：UX 少一遍废话且动作看得懂；DX 去重集中在渲染层不动配置数据；
 *         AX 锚点可机读，供 interop2 守卫与变异验证消费。 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const U = path.join(ROOT, 'js/ui.js'), C = path.join(ROOT, 'css/style.css');
let u = fs.readFileSync(U, 'utf8'), c = fs.readFileSync(C, 'utf8');
const before = { u: u.length, c: c.length };
const log = [];

// A 文案与行为一致（仅任务面板内两处 id=goTask）
const oldA = '<button class="btn" id="goTask" style="width:100%;margin-top:8px">前往任务</button>';
const newA = '<button class="btn" id="goTask" style="width:100%;margin-top:8px">前往关卡</button>';
const nA = u.split(oldA).length - 1;
u = u.split(oldA).join(newA);
log.push('A goTask 文案 ' + nA + ' 处');

// B1 按钮文案：限购达上限不再显示价格
const oldBtn = `        const btnTxt = stamFull ? '体力已满'
          : ownMsg ? (ownMsg.indexOf('背包') >= 0 ? '背包已满' : '已拥有')
          : passOn ? '已激活'
          : (g.price === 0 ? '免费领取' : (g.cur === 'diamond' ? '💎' : '🪙') + g.price);`;
const newBtn = `        /* V1.3.84：限购已达上限时按钮仍显示「💎200」但灰着，玩家要读下面红字才知道原因。
         * 与任务页「已领取」同口径：按钮自身就该说出状态，而不是让人去别处找解释。 */
        const btnTxt = blocked ? '已达上限'
          : stamFull ? '体力已满'
          : ownMsg ? (ownMsg.indexOf('背包') >= 0 ? '背包已满' : '已拥有')
          : passOn ? '已激活'
          : (g.price === 0 ? '免费领取' : (g.cur === 'diamond' ? '💎' : '🪙') + g.price);
        /* 描述里的「· 每日N次」是静态规则，底部状态行 lm.msg 是当天动态余量，
         * 两者同时出现 = 同一件事说两遍。展示层剥离，配置数据不动。 */
        const descShort = String(g.desc || '').replace(/\\s*[·•]\\s*每日\\s*\\d+\\s*次\\s*$/, '').trim();`;
if (!u.includes(oldBtn)) { console.error('PATCH_FAIL B1 未命中'); process.exit(1); }
u = u.replace(oldBtn, newBtn); log.push('B1 按钮状态文案 + descShort');

// B2 卡片结构重做
const oldCell = `        return \`<div class="gcell">
          \${g.img ? \`<img src="\${g.img}">\` : \`<div class="gi">\${g.icon}</div>\`}
          <div class="gn">\${g.n}\${g.rmb ? \`<span class="tag y" style="font-size:var(--fs-xs)">\${g.rmb}</span>\` : ''}</div>
          \${g.desc ? \`<div class="lbl" style="font-size:var(--fs-xs);line-height:1.3;margin:2px 0;
            display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">\${g.desc}</div>\` : ''}
          \${(E.isRechargeGoods && E.isRechargeGoods(g, tab) && !p.firstRech)
            ? \`<div class="lbl" style="font-size:var(--fs-xs);color:var(--c-amber-100)">🎉 首充双倍 → 💎\${Number(g.give.diamond) * 2}</div>\` : ''}
          <button class="btn sm" data-buy="\${g.id}" \${(can && !noBuy) ? '' : 'disabled'}
            style="font-size:var(--fs-xs);padding:3px 6px;margin-top:2px">
            \${btnTxt}</button>
          \${lm ? \`<div class="lbl" style="font-size:var(--fs-xs);color:\${lm.ok ? '#7ee38a' : '#ff8a8a'}">\${lm.msg}</div>\` : ''}
          \${stamFull ? \`<div class="lbl" style="font-size:var(--fs-xs);color:var(--c-red-400)">体力已满 \${Math.floor(p.stamina||0)}/\${EX.STAMINA_MAX}</div>\` : ''}
        </div>\`;`;
const newCell = `        return \`<div class="gcell">
          \${g.img ? \`<img src="\${g.img}">\` : \`<div class="gi">\${g.icon}</div>\`}
          <div class="gn">\${g.n}\${g.rmb ? \`<span class="tag y" style="font-size:var(--fs-xs)">\${g.rmb}</span>\` : ''}</div>
          \${descShort ? \`<div class="lbl gd" title="\${descShort}">\${descShort}</div>\` : ''}
          \${(E.isRechargeGoods && E.isRechargeGoods(g, tab) && !p.firstRech)
            ? \`<div class="lbl" style="font-size:var(--fs-xs);color:var(--c-amber-100)">🎉 首充双倍 → 💎\${Number(g.give.diamond) * 2}</div>\` : ''}
          <div class="gbuy">
            <button class="btn sm" data-buy="\${g.id}" \${(can && !noBuy) ? '' : 'disabled'}>\${btnTxt}</button>
            <span class="gst \${(blocked || stamFull || !can) ? 'warn' : ''}">\${lm ? lm.msg : (!can ? '货币不足' : '')}</span>
          </div>
        </div>\`;`;
if (!u.includes(oldCell)) { console.error('PATCH_FAIL B2 未命中'); process.exit(1); }
u = u.replace(oldCell, newCell); log.push('B2 卡片结构');

// B3 样式：收紧卡片、价格与状态同行
const CSS_MARK = '/* V1.3.84 操作性整改：商店卡片 */';
if (!c.includes(CSS_MARK)) {
  c += `\n${CSS_MARK}\n.gcell{display:flex;flex-direction:column}\n.gcell .gd{font-size:var(--fs-xs);line-height:1.35;margin:2px 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.7em}\n.gcell .gbuy{display:flex;align-items:center;gap:5px;margin-top:auto}\n.gcell .gbuy .btn{flex:0 0 auto;font-size:var(--fs-xs);padding:3px 7px;margin:0;white-space:nowrap}\n.gcell .gst{font-size:var(--fs-xs);color:#7ee38a;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n.gcell .gst.warn{color:#ff8a8a}\n`;
  log.push('B3 样式追加');
}
fs.writeFileSync(U, u); fs.writeFileSync(C, c);
console.log('PATCH_OK', log.join(' | '));
console.log('SIZE ui.js', before.u, '->', u.length, ' style.css', before.c, '->', c.length);
