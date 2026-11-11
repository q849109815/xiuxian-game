/* [redesign.cjs] 立规原因：V1.3.87 功能界面/战斗界面重做后，需一条常驻判据证明
 * 「22 个入口一个不少、抽屉与 Tab 不是死按钮、多余说明确已删除、改动没有外溢到其他面板」。
 * 判据：以本工具自身断言输出为准；R10 消费 _vis/_shot_v1387.json 真实 Chrome 取证，不硬编码 PASS。
 * 退出码：0=全过 / 1=有未过项 / 2=崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。
 * AI Agent 使用说明：改 index.html / css/style.css / js/ui.js 后必跑；FAIL 项带断言编号，可直接定位。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = '/data/workspace/zombie';
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
let pass = 0, fail = 0;
const ck = (id, name, cond, detail) => {
  if (cond) { pass++; console.log('PASS ' + id + ' ' + name); }
  else { fail++; console.log('FAIL ' + id + ' ' + name + (detail ? ' :: ' + detail : '')); }
};
try {
  const html = rd('index.html'), css = rd('css/style.css'), ui = rd('js/ui.js');
  const shotPath = path.join(ROOT, '_vis', '_shot_v1387.json');
  const shot = fs.existsSync(shotPath) ? JSON.parse(fs.readFileSync(shotPath, 'utf8')) : null;

  /* R1 UX：22 个入口一个不少，且全在 .hm-menu 内（main.js 的 .hm-menu .hmb 绑定才命中） */
  const keys = [...html.matchAll(/class="hmb" data-p="([^"]+)"/g)].map(x => x[1]);
  ck('R1', '22 个功能入口全部保留且无重复', keys.length === 22 && new Set(keys).size === 22,
    'count=' + keys.length + ' uniq=' + new Set(keys).size);
  const menuSeg = html.slice(html.indexOf('id="hmMenu"'), html.indexOf('id="hmToday"'));
  ck('R2', '22 个入口全部位于 #hmMenu 内', (menuSeg.match(/class="hmb" data-p=/g) || []).length === 22);

  /* R3 UX：低频 12 个收进抽屉且默认收起，toggle 存在 */
  const drawer = html.match(/<div class="hmg-b hmg-more" id="hmMore" hidden>([\s\S]*?)<\/div>/);
  ck('R3', '全部功能抽屉默认收起且含 12 个入口', !!drawer && (drawer[1].match(/class="hmb" data-p=/g) || []).length === 12);
  ck('R4', '次频 4 个独立成行（不留空洞格）', /id="hmgMid"/.test(html) &&
    (html.match(/<div class="hmg-b hmg-mid" id="hmgMid">([\s\S]*?)<\/div>/) || ['', ''])[1].split('class="hmb"').length - 1 === 4);
  ck('R5', '抽屉开合与 Tab 跳转有真实绑定（非死按钮）',
    /getElementById\('hmMoreBtn'\)/.test(ui) && /hasAttribute\('hidden'\)/.test(ui) &&
    /#hmTabs \[data-p\]/.test(ui) && /UI\.open\(t\.dataset\.p\)/.test(ui));
  const tabs = [...html.matchAll(/class="tab[^"]*" data-p="([^"]+)"/g)].map(x => x[1]);
  ck('R6', '底部 4 个 Tab 齐备且指向已有面板', tabs.length === 4 && tabs.join(',') === 'home,task,bag,shop');

  /* R7 UX：多余标语/说明/次要标签已删，靠布局而非文字 */
  ck('R7', '战斗状态条「本局」次要标签已删', !/class="bs-lb"/.test(html));
  ck('R8', '技能选择页「局内技能选择」说明行已删', !/class="ch-sub"/.test(html));
  ck('R9', '出击/无尽副行说明由样式收敛，DOM 保留不报错', /\.ha-sub\{display:none\}/.test(css));
  ck('R10', '身份条信息未丢（名字/等级/战力/进度/三资源/设置）',
    ['hmName', 'hmLv', 'hmPower', 'hmLevel', 'cuGold', 'cuDia', 'hmStamina', 'hmSet'].every(id => html.includes('id="' + id + '"')));

  /* R11 DX：改动作用域限定，不外溢到其它 24 个面板 */
  const marks = ['V1.3.87 界面重做 · 功能界面', 'V1.3.87 界面重做 · 战斗界面',
    'V1.3.87b 视觉复核修正', 'V1.3.87c 可操作性复核'];
  ck('R11', '新增样式四段标记各恰好一处且备份可回滚',
    marks.every(k => css.split(k).length - 1 === 1) &&
    fs.existsSync(path.join(ROOT, '_vis', 'pre_v1387', 'index.html')),
    marks.map(k => css.split(k).length - 1).join('/'));
  ck('R12', '交互层不读写存档、不改战斗状态',
    /V1\.3\.87 界面重做 · 交互层/.test(ui) && !/_apply_v1387|E\.save\(|BT\.run\s*=/.test(ui.slice(ui.indexOf('V1.3.87 界面重做 · 交互层'))));

  /* R13 AX：点击热区 >=44，战场 canvas 与震屏归零逻辑未被触碰 */
  ck('R13', '可点热区规则 >=44px 已固化', /V1\.3\.87c 可操作性复核/.test(css) &&
    /width:44px;height:44px/.test(css) && /\.hm-set\{width:44px;height:44px/.test(css));
  const btSrc = rd('js/battle.js');
  ck('R14', 'canvas 与震屏 save/restore 配对逻辑未被本轮改动',
    html.includes('<canvas id="C"></canvas>') && /c\.save\(\)/.test(btSrc) && /c\.restore\(\)/.test(btSrc) &&
    fs.existsSync(path.join(ROOT, 'tools', 'btlayout.cjs')));

  /* R15 AX：消费真实 Chrome 取证，不允许硬编码 PASS */
  ck('R15', '真实浏览器取证 PASS（0 越界/0 破图/0 报错/热区全达标）',
    !!shot && shot.homeState.entries === 22 && shot.drawer.shown === 12 &&
    shot.homeDiag.overflowCount === 0 && shot.btDiag.overflowCount === 0 && shot.chDiag.overflowCount === 0 &&
    shot.homeDiag.brokenImgs.length === 0 && shot.btDiag.brokenImgs.length === 0 && shot.chDiag.brokenImgs.length === 0 &&
    shot.homeDiag.smallCount === 0 && shot.btDiag.smallCount === 0 && shot.chDiag.smallCount === 0 &&
    shot.pageErrors === 0 && shot.choiceReal === true &&
    shot.tabRes.every(t => t.on), shot ? JSON.stringify({ e: shot.homeState.entries, d: shot.drawer.shown, err: shot.pageErrors }) : 'no snapshot');

  console.log('SUMMARY PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail === 0 ? 0 : 1);
} catch (e) {
  console.log('FAIL R0 守卫崩溃（前提未就绪或源码不可读）:: ' + e.message);
  console.log('SUMMARY PASS=' + pass + ' FAIL=' + (fail + 1));
  process.exit(2);
}
