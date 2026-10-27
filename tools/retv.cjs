// 新维度：函数「返回值被丢弃」审计
// 思路：某函数明明 return 了有意义的值，调用处却写成语句（不接返回值），
// 往往是「以为它原地修改、实际它返回新值」的经典 bug（如 safeAmt 邮件金币污染）。
const fs = require('fs'), path = require('path'), acorn = require('acorn');
const ROOT = '/data/workspace/zombie/js';
const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.js')).map(f => path.join(ROOT, f));

// 1) 收集「有返回值」的函数定义名
const returners = new Map(); // name -> [file]
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let ast; try { ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); } catch (e) { continue; }
  const walk = (n, fn) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(x => walk(x, fn)); return; }
    fn(n);
    for (const k in n) { if (k === 'loc' || k === 'parent') continue; walk(n[k], fn); }
  };
  const hasValuedReturn = (body) => {
    let ok = false;
    const scan = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(scan); return; }
      if (n.type === 'ReturnExpression' || n.type === 'ReturnStatement') {
        if (n.type === 'ReturnStatement' && n.argument) ok = true;
      }
      // 不进入嵌套函数定义
      if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
        if (n.body && n.body !== body && n !== body) return;
      }
      for (const k in n) { if (k === 'loc') continue; scan(n[k]); }
    };
    scan(body);
    return ok;
  };
  walk(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name) {
      if (hasValuedReturn(n.body)) {
        if (!returners.has(n.id.name)) returners.set(n.id.name, []);
        returners.get(n.id.name).push(path.basename(f));
      }
    }
    // 对象方法 { foo(x){ ... return v } }
    if (n.type === 'Property' && n.key && (n.key.type === 'Identifier') &&
        (n.value.type === 'FunctionExpression' || n.value.type === 'ArrowFunctionExpression')) {
      if (hasValuedReturn(n.value.body)) {
        const k = n.key.name;
        if (!returners.has(k)) returners.set(k, []);
        returners.get(k).push(path.basename(f));
      }
    }
    // 赋值式 X.foo = function(...){}
  });
}

// 2) 扫描所有调用点，找「语句位置」调用（返回值被丢弃）
const out = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  let ast; try { ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); } catch (e) { continue; }
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'ExpressionStatement' && n.expression && n.expression.type === 'CallExpression') {
      const c = n.expression;
      let name = null;
      if (c.callee.type === 'Identifier') name = c.callee.name;
      else if (c.callee.type === 'MemberExpression' && c.callee.property.type === 'Identifier') name = c.callee.property.name;
      if (name && returners.has(name)) {
        const L = n.loc.start.line;
        // 过滤：明显不需要返回值的（console / log / toast / render 等）
        out.push({ file: path.basename(f), line: L, name, text: (lines[L - 1] || '').trim().slice(0, 150), def: returners.get(name).join(',') });
      }
    }
    for (const k in n) { if (k === 'loc') continue; walk(n[k]); }
  };
  walk(ast);
}
console.log('有返回值的函数数:', returners.size);
console.log('返回值被丢弃的调用点:', out.length);
const skip = /^(log|toast|render|draw|play|set|push|add|save|send|show|hide|open|close|stop|start|init|update|apply|emit|on|bind|unbind|remove|delete|clear|reset|focus|blur|scroll|append|insert|remove|click|trigger|sort|forEach|map|filter|warn|error|info|debug)$/i;
const filt = out.filter(o => !skip.test(o.name));
console.log('过滤后候选:', filt.length);
fs.writeFileSync('/data/workspace/zombie/_RET.json', JSON.stringify({ all: out, filt }, null, 1));
const byName = {};
filt.forEach(o => { (byName[o.name] = byName[o.name] || []).push(o); });
Object.keys(byName).sort((a, b) => byName[b].length - byName[a].length).slice(0, 40).forEach(k => {
  console.log('\n### ' + k + '  (' + byName[k].length + ' 处, 定义于 ' + returners.get(k).join(',') + ')');
  byName[k].slice(0, 6).forEach(o => console.log('   ' + o.file + ':' + o.line + '  ' + o.text));
});
