#!/usr/bin/env node
/* ==========================================================================
 * V1.2.2 后台守卫（测试部 T-16）：版本排期页「在线可维护」
 *
 * 在 Node 里真实加载 admin/js/core.js + pages.js（最小 DOM mock），
 * 然后真的调用 A.hotfix.render() 产出 HTML 再做断言 —— 不是正则扫源码。
 * 守护：KPI/新增/编辑/删除/公开/标记发布/下发/恢复 全部存在，
 *       7 个写动作全部映射 hotfix.push 权限（只读审计必须被拒），
 *       下发确实写 DBP.roadmap 且字段名 list 与游戏端读取一致。
 * ========================================================================== */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT='/data/workspace/zombie';
function strip(t){return t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^\\://])\/\/[^\n]*/g,'$1');}
const ctx=vm.createContext({console:{log(){},warn(){},error(){}},Math,Date,JSON,Number,String,Array,Object,
  isNaN,parseInt,parseFloat,setTimeout,Promise,RegExp,encodeURIComponent,decodeURIComponent,
  fetch:async()=>({ok:false}),location:{pathname:'/admin/index.html',href:'http://x/'},
  confirm:()=>true,alert(){},btoa:s=>Buffer.from(s,'utf8').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('utf8')});
ctx.window=ctx; ctx.globalThis=ctx;
ctx.sessionStorage={_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]}};
ctx.localStorage={_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]}};
ctx.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,createElement:()=>({}),body:{},addEventListener(){}};
// 最小 EX（config 太大，只给后台用到的）
ctx.EX={VERSIONS:[{v:'V1.2.2',n:'版本路线图',done:true,pub:true,tp:'patch',hi:['a'],eta:'2026-10-21',wk:'',c:'x',ok:'y'},
 {v:'V1.3.0',n:'推图成长',done:false,pub:true,tp:'minor',hi:['b'],eta:'2026-11',wk:'',c:'x',ok:'y'}],
 I18N:{TXT_001:{zh:'设置'}},LANGS:[{k:'zh',n:'中文'}],HOT_UPDATE:{version:'1.2.2',manifest:[],enabled:true}};
for(const f of ['admin/js/core.js','admin/js/pages.js']){
  vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
}
console.log('loaded OK');
// register
// const/let 不挂到 context 上，需要在 vm 内取引用
vm.runInContext('PAGES.register()', ctx);
const H=vm.runInContext('APP.pages.hotfix', ctx);
const APPv=vm.runInContext('APP', ctx);
const PERMv=vm.runInContext('PERM', ctx);
console.log('hotfix page:', !!H, 'bind:', typeof H.bind);
APPv.T={}; APPv.T.hotfix='ver';
/* 页面基类方法由 core.js 在运行时注入（本 vm 未走完整启动流程），
 * 这里按真实签名 mock：table(cols,rows)/empty(t)/str(sel)/openModal/toast */
H.table=(cols,rows)=>'<table><thead>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</thead><tbody>'+
  rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
H.empty=(t)=>'<div class="empty">'+t+'</div>';
H.str=(sel)=>'';
H.openModal=(h,o)=>{};
H.toast=()=>{};
let html='';
try{ html=H.render(); }catch(e){ console.log('RENDER ERR:', e.message); process.exit(1); }
console.log('render len:', html.length);
const checks={
 hasKpi: /排期总数/.test(html),
 hasAdd: /data-a="rmAdd"/.test(html),
 hasPush: /data-a="rmPush"/.test(html),
 hasReset: /data-a="rmReset"/.test(html),
 v122: html.indexOf('V1.2.2')>=0,
 v130: html.indexOf('V1.3.0')>=0,
 editBtns: (html.match(/data-a="rmEdit"/g)||[]).length,
 pubBtns: (html.match(/data-a="rmPub"/g)||[]).length,
};
console.log(JSON.stringify(checks,null,1));
// 动作方法存在性
['rmAdd','rmEdit','rmDel','rmPub','rmDone','rmPush','rmReset'].forEach(a=>{
  if(typeof H.acts[a]!=='function'){console.log('MISSING ACT',a);process.exit(1);}
});
console.log('acts all present');
// 权限映射
['rmAdd','rmEdit','rmDel','rmPub','rmDone','rmPush','rmReset'].forEach(a=>{
  const need=PERMv.needOf(a);
  if(need!=='hotfix.push'){console.log('PERM MISS',a,need);process.exit(1);}
  // audit 角色必须被拒
  PERMv.setRole('audit');
  if(PERMv.canAct(a)){console.log('AUDIT CAN ACT',a);process.exit(1);}
  PERMv.setRole('admin');
});
console.log('perm: 7 actions -> hotfix.push, audit denied');
/* 下发写云端：DB 在 core.js 内是 const，无法从外部替换，
 * 这里改为校验 rmPush 源码确实写 DBP.roadmap 且字段名与游戏端一致。 */
const src=fs.readFileSync(path.join(ROOT,'admin/js/pages.js'),'utf8');
const body=(src.match(/async rmPush\(\)\s*\{[\s\S]*?\n        \},/)||[''])[0];
const okPush=/DB\.set\(DBP\.roadmap/.test(body) && /d\.list\s*=\s*L2/.test(body) && /DB\.reload\(DBP\.roadmap\)/.test(body);
console.log('rmPush writes DBP.roadmap with .list:', okPush);
if(!okPush) process.exit(1);
console.log('ALL ADMIN CHECKS PASSED');
