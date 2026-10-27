#!/usr/bin/env node
/**
 * 【新维度】DOM id 引用一致性审计
 * 渲染用 innerHTML 拼 id="x"，紧接着 getElementById('x') 绑定事件。
 * 若 id 拼错 / 条件分支下未渲染 → getElementById 返回 null → 按钮点了完全没反应，
 * 且不报错，是最难发现的"死按钮"。逐个点击测试的覆盖率受按钮可见性限制，
 * 这里用静态全量扫描补齐：
 *   1. 收集所有 id="..."  定义（含模板里拼接的）
 *   2. 收集所有 getElementById('...') / querySelector('#...') 引用
 *   3. 引用了但从未定义 → 疑似死按钮
 */
const fs=require('fs');
const DIRS=['js'];
const files=[];
(function walk(d){for(const f of fs.readdirSync(d)){const p=d+'/'+f;
  if(fs.statSync(p).isDirectory())walk(p);else if(/\.(js|html)$/.test(f))files.push(p);}})('js');
files.push('index.html');

let defs=new Set(), refs=new Map(); // id -> [文件:行]
for(const f of files){
  const s=fs.readFileSync(f,'utf8');
  // id="xxx"  以及 id=\`xxx\`  id='xxx'
  for(const m of s.matchAll(/id\s*=\s*["'`]([^"'`$]*)\$\{?[^"'`]*/g)){}
  for(const m of s.matchAll(/id\s*=\s*["'`]([^"'`]*)["'`]/g)){ if(m[1]) defs.add(m[1]); }
  for(const m of s.matchAll(/\bid\s*=\s*[`'"]([^`'"]*?)\$\{/g)){}
  // 带模板变量的 id="a${x}"：把静态前缀也收进来，作为"可能定义"
  for(const m of s.matchAll(/id\s*=\s*[`'"]([^`'"]*)\$\{([^}]*)\}([^`'"]*)[`'"]/g)){
    defs.add('@TPL:'+m[1]+'|'+m[3]); }
  for(const m of s.matchAll(/getElementById\(\s*['"`]([^'"`]+)['"`]/g)){
    if(!refs.has(m[1]))refs.set(m[1],[]); refs.get(m[1]).push(f); }
  for(const m of s.matchAll(/querySelector\(\s*['"`]#([A-Za-z0-9_-]+)['"`]/g)){
    if(!refs.has(m[1]))refs.set(m[1],[]); refs.get(m[1]).push(f); }
}
const miss=[];
for(const [id,fs_] of refs){
  if(defs.has(id))continue;
  // 模板拼接的：检查是否有同前缀的模板定义
  let hit=false;
  for(const d of defs){ if(d.startsWith('@TPL:')){
    const [pre,post]=d.slice(5).split('|');
    if(id.startsWith(pre)&&id.endsWith(post)&&id.length>=pre.length+post.length){hit=true;break;}
  }}
  if(!hit) miss.push(id+'  <- '+[...new Set(fs_)].join(','));
}
console.log('定义 id %d 个，引用 %d 个', defs.size, refs.size);
console.log('\n=== 引用了但从未定义（疑似死按钮）===');
miss.sort().forEach(x=>console.log('  '+x));
console.log('共 %d 处', miss.length);
