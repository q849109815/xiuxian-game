#!/usr/bin/env node
/* V1.3.84 排期登记 + CHANGELOG 详述。
 * 铁律：排期权威源是 js/config.js，先写主源再 rmsync 同步 players 分支，
 *       方向反了会被主源覆盖（历史错题 ×5）。每条必须有六部门 dp。 */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const CFG = path.join(ROOT, 'js/config.js'), CH = path.join(ROOT, 'CHANGELOG.md');
let c = fs.readFileSync(CFG, 'utf8');
if (c.includes("v: 'V1.3.84'")) { console.log('ROADMAP 已登记'); }
else {
  const i = c.indexOf("v: 'V1.3.83'");
  if (i < 0) { console.error('ROADMAP_FAIL 未找到 V1.3.83'); process.exit(1); }
  // 该条目对象结束：缩进 4 空格的 },
  const j = c.indexOf('\n    },', i);
  if (j < 0) { console.error('ROADMAP_FAIL 未找到条目结尾'); process.exit(1); }
  const entry = `
    { v: 'V1.3.84', n: '交互操作性整改（二）', wk: '已发布', eta: '2026-11-10', tp: 'patch', c: '真实浏览器逐屏量操作性：修任务面板「前往任务」文案与落点不符（实际打开关卡选择）；商店卡片删掉重复的静态限购说明、压紧 245→202px、购买按钮加金色主色以便一眼可辨、限购状态行改为可见不被挤没', ms: '文案=行为、按钮看得出能点、信息不重复', ok: 'interop2 22/0、变异 5/5 全捕获且还原 md5 一致、重复 3 次无抖动；真实 Chrome 前后台 0 报错；archguard 241/0、pushcov 7/0、releaseguard 17/0、cacheguard 8/0、layoutguard 168/0', pr: 'P0', done: true, pub: true,
      hi: ['任务页按钮写「前往关卡」且点了真去关卡选择，不再文不对题', '商店一屏能看全 6 件商品，购买按钮与描述条一眼可分', '「今日可买 N 次」真实可见，不再为压缩布局把信息挤成 0 宽'],
      dp: { 策划: '判定哪些文字是冗余、哪些状态必须由按钮自身表达', 美术: '购买按钮主色、图标尺寸与状态行视觉层级', 程序: '渲染层去重、按钮状态文案、作用域限定 CSS 不误伤其他面板', 音频: '本轮无改动', 测试: '真实浏览器交互取证、interop2 守卫 22 项、变异 5/5、重复测试与全量回归', 运营: '排期登记、双源同步、发布复核与缓存冲刷' }
    },`;
  c = c.slice(0, j + '\n    },'.length) + entry + c.slice(j + '\n    },'.length);
  fs.writeFileSync(CFG, c);
  console.log('ROADMAP_OK 已插入 V1.3.84（含六部门 dp）');
}
// CHANGELOG 详述
let ch = fs.readFileSync(CH, 'utf8');
const one = '- V1.3.84 交互操作性整改：任务按钮文案与行为对齐、商店卡片去重压紧、购买按钮可辨识、状态行不丢失；interop2 守卫 22 项 + 变异 5/5';
if (ch.includes(one)) {
  ch = ch.replace(one, `- 真实浏览器逐屏审计「逻辑性/操作性」：24 前端面板 + 15 后台页 0 报错，21 个渲染段控件绑定 21/21、无死按钮。
- 修真逻辑错：任务面板内两处「前往任务」按钮实际打开「关卡选择」，文案与落点不符 → 改为「前往关卡」，点击路径实测 label=前往关卡 / landed=level。
- 商店卡片重做：描述里静态「· 每日N次」与底部动态「今日可买 N 次」重复 6 处全部剥离（配置数据不动，展示层去重）；限购达上限时按钮直写「已达上限」而非灰着仍显示价格；价格与状态归入 .gbuy 同一容器；卡片实测 245→202px，一屏看全 6 件商品。
- 过程中自查出并修掉自己造成的回归：首版把状态行与价格挤同一行，窄列下状态被压成 0 宽（信息丢失）→ 改独立可见一行，新增 R7 断言强制宽度>20px，实测 102px。
- 购买按钮此前与描述条同为深棕渐变、玩家分不清哪个能点 → 加金色描边与文字；新样式限定 .shop-cell 作用域，不误伤背包/角色/图鉴复用 .gcell 的面板。
- 三体验对账：UX 少一遍废话、动作看得懂、状态不丢；DX 全令牌化（修 archguard 3 处硬编码）、判据集中；AX interop2 22 项断言消费真实 Chrome 取证（沙盒无 jsdom，老 _render.cjs 本就跑不起来）、新工具登记上传清单与固定看板。
- 验证：interop2 22/0、变异 5/5 全捕获且还原 md5 一致、重复 3 次无抖动；archguard 241/0、pushcov 7/0、static 10/0、layoutguard 168/0、cacheguard 8/0、releaseguard 17/0、ux3 10/0、vis2 12/0、dashcons 19/0。`);
  fs.writeFileSync(CH, ch);
  console.log('CHANGELOG_OK 已补详述');
}
// 双源同步
const r = cp.spawnSync('node', [path.join(ROOT, 'tools/rmsync.cjs')], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
console.log('RMSYNC', (r.stdout || '').trim().slice(0, 200), 'exit=' + r.status);
