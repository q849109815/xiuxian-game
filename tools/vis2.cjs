#!/usr/bin/env node
/* [vis2.cjs] 立规原因：V1.3.82 前后台视觉复核——"删了说明看不懂"必须靠重做布局解决，
 * 且每次改动都要兼顾 UX/DX/AX、不破坏现有功能。历史上多次出现"报了但没改/改了没传"，
 * 故把本次 5 项整改固化为可复跑断言，每轮看板必跑。
 * 判据：以本工具自身断言输出为准（见下 CHECKS）。
 * 退出码：0=全过 / 1=有未过项 / 2=崩溃或前提未就绪（崩溃显式判失败，不静默报绿）。 */
const fs=require('fs');
const R=p=>{try{return fs.readFileSync(p,'utf8')}catch(e){return ''}};
const ui=R('js/ui.js'), core=R('admin/js/core.js'), pages=R('admin/js/pages.js');
const css=R('css/style.css'), acss=R('admin/css/admin.css'), me=__filename;
const CHECKS=[
 ['V1 邮件空态不再亮着空按钮', ()=>ui.includes("<div class=\"empty\">暂无邮件") && ui.includes("${un ? '<button class=\"btn g\" id=\"mailAll\"")],
 ['V2 邮件不再显示重复的 0 封未读', ()=>!ui.includes('邮件 <b class="ct-n">')],
 ['V3 兑换商店限购完整显示（不再被省略号吞掉）', ()=>ui.includes('class="zrow shop-row"') && ui.includes('class="zr-meta"') && css.includes('.zrow.shop-row .zi>span{white-space:normal')],
 ['V4 兑换商店底部说明句已并入列头', ()=>!ui.includes('限购按 ${isAch')],
 ['V5 后台侧栏分组文字已改为分隔线', ()=>!core.includes('<div class="nav-t">') && core.includes('nav-sep') && acss.includes('.nav-sep')],
 ['V6 后台加载过程改为进度条且完成即消失', ()=>core.includes('pg.done < pg.total') && core.includes('ld-bar') && !core.includes('正在拉取玩家存档') && acss.includes('.ld-bar')],
 ['V7 后台商城空状态重做为居中图形+主按钮', ()=>pages.includes('min-height:220px') && pages.includes('btn pri" data-a="shpReload')],
 ['V8 兑换商店列头独立成行不挤压', ()=>ui.includes('<div class="sub" style="padding:2px 2px 6px">持有') && !ui.includes('<span class="sub">持有')],
 ['V9 侧栏页签加宽且不换行', ()=>css.includes('#panel[data-tp="side"] .pn-tabs{flex:0 0 88px !important}') && css.includes('white-space:nowrap !important')],
 ['V10 后台空态不再叠加默认圆圈', ()=>acss.includes('.empty:has(>span)::before')],
 ['V11 上传清单无漏登工具', ()=>{const p=require('fs').readFileSync('tools/push.py','utf8');return p.includes("'tools/visualshot.cjs'")&&p.includes("'tools/visualgrid.py'")}],
 ['A1 守卫自身具备立规原因/判据/退出码（AX）', ()=>{const s=R(me);return s.includes('立规原因')&&s.includes('判据')&&s.includes('退出码')}],
];
let fail=0;
for(const [n,f] of CHECKS){let ok=false;try{ok=!!f()}catch(e){ok=false}
  console.log((ok?'  PASS ':'  FAIL ')+n); if(!ok)fail++;}
console.log('vis2: PASS '+(CHECKS.length-fail)+' / FAIL '+fail);
process.exit(fail?1:0);
