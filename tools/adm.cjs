// 新维度：运营后台(admin)全量页面/页签渲染审计
// 后台历史上几乎没被端到端测过。这里只读渲染（不点任何写操作按钮），
// 抓：JS 报错、空页面、异常文本(NaN/undefined/[object Object])、越界、破图。
const { chromium } = require('playwright');

/* V1.3.8 体检修复：原先硬连 127.0.0.1:8951，服务器没起就抛 ERR_CONNECTION_REFUSED
 * 直接崩溃 —— 体检工具只能看到一段堆栈，分不清"后台真有 BUG"和"环境没准备好"。
 * 改为自启静态服务器 + 环境不足时显式 SKIP（绝不伪装成通过）。 */
const PORT = 8951;
function skip(reason) {
  console.log('[ADM] SKIP —— ' + reason);
  console.log('RESULT: PASS=0 FAIL=0 SKIP=1');
  process.exit(0);
}

(async () => {
  let srv = null;
  try { srv = await require('./_srv.cjs').start(); }
  catch (e) {
    const net = require('net');
    const alive = await new Promise((res) => {
      const s = net.connect(PORT, '127.0.0.1');
      s.on('connect', () => { s.destroy(); res(true); });
      s.on('error', () => res(false));
      setTimeout(() => { s.destroy(); res(false); }, 1000);
    });
    if (!alive) skip('静态服务器起不来且端口不可达：' + e.message);
  }
  let b;
  /* 浏览器启动重试：与 vistate 同源的批次内 flaky（资源刚被前一个守卫释放，
   * chromium 抢不到）。重试仍失败必须 SKIP，不得把「没跑成」报成通过。 */
  let launchErr = null;
  for (let i = 0; i < 2 && !b; i++) {
    try {
      b = await chromium.launch({ executablePath:'/usr/bin/google-chrome',
        args:['--no-sandbox','--disable-dev-shm-usage'] });
    } catch (e) { launchErr = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  if (!b) { if (srv) srv.close(); skip('浏览器不可用（已重试1次）：' + (launchErr && launchErr.message)); }
  const pg = await b.newPage({ viewport:{width:1440,height:900} });
  const errs = [];
  const NOISE = /Failed to load resource|net::ERR|Access to fetch|CORS|githubusercontent|gh-proxy|ERR_NAME/i;
  pg.on('pageerror', e => { const s=String(e).split('\n')[0].slice(0,160); if(!NOISE.test(s)) errs.push(s); });
  pg.on('console', m => { if(m.type()==='error'){ const s=m.text().slice(0,140); if(!NOISE.test(s)) errs.push('[con] '+s); } });
  // 只读原则：拦截一切写后端
  await pg.addInitScript(() => {
    sessionStorage.setItem('zb_admin_ok', '1');
    window.confirm = () => false; window.alert = () => {}; window.onbeforeunload = null;
  });

  await pg.goto('http://127.0.0.1:8951/admin/index.html', { waitUntil:'load' });
  await pg.waitForTimeout(3000);
  // 关掉审计写盘（登录时会写一条审计，之后一律停用）
  await pg.evaluate(() => { try { window.AUDIT && (AUDIT.log = () => {}); } catch(e){} });
  await pg.waitForTimeout(1200);

  const info = await pg.evaluate(() => {
    try {
      return { pages: Object.keys(APP.pages || {}), net: (typeof Net!=='undefined' && !!Net.online),
               n: (APP.PLIST||[]).length };
    } catch(e) { return { err: String(e).slice(0,120) }; }
  });
  console.log('后台页面:', JSON.stringify(info.pages));
  console.log('云端:', info.net, ' 玩家数:', info.n);

  const findings = [];
  let audited = 0;              // 已遍历的「页面/页签组合」数，作为断言计数的分母
  const pages = info.pages || [];
  for (const key of pages) {
    // 该页面的所有分段(页签)
    const segs = await pg.evaluate(k => {
      try {
        APP.cur = k; APP.render();
        const box = document.getElementById('body');
        if (!box) return [];
        return [...box.querySelectorAll('.seg [data-k], .seg button[data-k]')].map(e=>e.dataset.k);
      } catch(e) { return ['__ERR__' + String(e).slice(0,80)]; }
    }, key);
    const list = segs.length ? segs : [null];
    for (const s of list) {
      audited++;
      if (typeof s === 'string' && s.indexOf('__ERR__') === 0) {
        findings.push({ page:key, seg:'-', kind:'渲染抛异常', detail:s.slice(7) }); continue;
      }
      const e0 = errs.length;
      await pg.evaluate(([k, ss]) => { APP.cur = k; if (ss) APP.T[k] = ss; APP.render(); }, [key, s]);
      await pg.waitForTimeout(700);
      /* 等本页所有 <img> 真正加载结束（成功或失败）后再判定破图。
       *
       * 事故形态（本轮实测）：同一份代码连跑三次，出现 22 条破图 / 0 条 / 0 条
       * 三种结果——被点名的 hud_switch.png、ic_avatar.jpg、i_gold.jpg 等 17 个文件
       * 在 assets/icon/ 下全部真实存在，单独复现（含页签）也是 0 破图、无 404。
       * 根因：render() 后只等 700ms 就判定，图片请求还在路上时
       * naturalWidth 为 0，会被当成「加载失败」。
       * 后果比误报更麻烦：真破图混在这批噪音里没人信，
       * 假破图又会让运营去查根本不存在的问题——两头都不可信。
       * 因此判定前必须等 settled，并且**失败要给得出完整路径**（见下）。 */
      await pg.evaluate(() => Promise.all(
        [...document.images].map(im => im.complete ? Promise.resolve()
          : new Promise(res => {
              const t = setTimeout(res, 4000);
              const done = () => { clearTimeout(t); res(); };
              im.addEventListener('load', done, { once:true });
              im.addEventListener('error', done, { once:true });
            }))
      )).catch(() => {});
      let r;
      try {
        r = await pg.evaluate(() => {
          const box = document.getElementById('body');
          if (!box) return null;
          const txt = box.innerText || '';
          const vis = el => { const q = el.getBoundingClientRect();
            return q.width>1 && q.height>1 && getComputedStyle(el).visibility!=='hidden'; };
          const res = { empty: txt.trim().length < 8, nan: [], broken: [], out: [] };
          ['NaN','undefined','[object Object]','Infinity'].forEach(w => { if (txt.includes(w)) res.nan.push(w); });
          /* V1.3.8 变异验证抓出的真缺口：
           * 原先只扫 #body 内部的 img —— 后台页头(header)里的图标（菜单/返回/设置）
           * 压根不在扫描范围内，那里破图、异常文本一律看不见。
           * 变异验证实测：把页头图标改成不存在的路径，本工具照样全绿（假通过）。
           * 现改为扫整个 document.body，并把"页头破图"单独标记，便于定位。 */
          [['#body', box.querySelectorAll('img')], ['header', document.querySelectorAll('header img')]]
            .forEach(([where, imgs]) => {
              imgs.forEach(im => {
                /* 破图要给出可定位的路径，不能只给文件名：
                 * 本轮 22 条误报里出现的都是 hud_switch.png、i_gold.jpg 这类通用名，
                 * 光看文件名无法判断是「文件真没了」还是「路径拼错」还是「还在加载」，
                 * 只能靠猜。这里保留去掉 origin 后的完整路径（含 ?v= 戳），
                 * 一眼能看出是 assets/ 下的真缺失，还是 ../assets/ 这类前缀错误。 */
                if (im.src && im.complete && im.naturalWidth === 0)
                  res.broken.push((where === 'header' ? '页头:' : '') +
                    String(im.src).replace(/^https?:\/\/[^/]+/, '').slice(0, 60));
              });
            });
          const pb = box.getBoundingClientRect();
          // 只统计【真正溢出到可视区外】的元素：若祖先有 overflow:auto/hidden/scroll
          // （如 .tw 表格滚动容器），其子元素虽 rect 超出，但已被容器裁切并可横向滚动，
          // 属正常设计，不算越界 —— 否则一张宽表会误报上百条。
          const clipped = el => {
            let n = el.parentElement;
            while (n && n !== box) {
              const o = getComputedStyle(n).overflowX;
              if (o === 'auto' || o === 'hidden' || o === 'scroll') return true;
              n = n.parentElement;
            }
            return false;
          };
          box.querySelectorAll('*').forEach(el => {
            if (!vis(el)) return;
            const q = el.getBoundingClientRect();
            if (q.right > pb.right + 4 && !clipped(el)) res.out.push('<'+el.tagName.toLowerCase()+'.'+String(el.className||'').slice(0,16)+'> r'+Math.round(q.right)+'/'+Math.round(pb.right)+' w'+Math.round(q.width));
          });
          return res;
        });
      } catch(e) { findings.push({ page:key, seg:s||'-', kind:'检测抛异常', detail:String(e).slice(0,100) }); continue; }
      if (!r) { findings.push({ page:key, seg:s||'-', kind:'无内容容器', detail:'' }); continue; }
      if (r.empty) findings.push({ page:key, seg:s||'-', kind:'空页面', detail:'' });
      if (r.nan.length) findings.push({ page:key, seg:s||'-', kind:'异常文本', detail:r.nan.join(',') });
      if (r.broken.length) findings.push({ page:key, seg:s||'-', kind:'破图', detail:r.broken.slice(0,3).join(',') });
      if (r.out.length) {
        const dump = await pg.evaluate(() => {
          const box=document.getElementById('body');
          const tb=box.querySelector('table');
          if(!tb) return 'no-table';
          return 'rows='+tb.querySelectorAll('tr').length+' head='+[...(tb.querySelectorAll('thead th')||[])].map(x=>(x.textContent||'').trim()).join('|')
            +' r1='+[...((tb.querySelectorAll('tbody tr')[0]||{children:[]}).children)].map(x=>(x.textContent||'').trim().slice(0,18)).join('|');
        });
        findings.push({ page:key, seg:s||'-', kind:'横向越界 '+r.out.length, detail:r.out.slice(0,2).join(' ')+' >> '+dump });
      }
      if (errs.length > e0) findings.push({ page:key, seg:s||'-', kind:'JS报错', detail:errs.slice(e0,e0+1).join('').slice(0,140) });
    }
  }

  /* 覆盖面为 0 = 审计根本没跑起来，必须算失败。
   * 否则「PASS=0 FAIL=0」会被下游读成「零缺陷」，比崩溃更危险。 */
  if (!audited) findings.push({ page:'-', seg:'-', kind:'覆盖面为0', detail:'后台未渲染出任何页面/页签，本轮审计等于没跑' });

  console.log('\n后台审计发现问题:', findings.length);
  findings.forEach(f=>console.log('  X ['+f.kind+'] '+f.page+(f.seg!=='-'?'/'+f.seg:'')+' :: '+f.detail));
  if (!findings.length) console.log('  全部页面渲染正常');
  await b.close();
  if (srv) srv.close();
  /* 断言口径修正：原来恒为 PASS=1 FAIL=n，断言数不随覆盖面变化 ——
   * 后台少渲染 10 个页面，报告仍是「PASS 1」，覆盖面缩水完全看不出来。
   * 改为以「已审计的页面/页签组合数」为 PASS 计数：
   * 只要某个页面渲染不出来（少一个组合），PASS 就会掉，体检员的「断言缩水」
   * 检查才能真正生效。 */
  console.log('审计覆盖面: ' + audited + ' 个页面/页签组合');
  console.log('RESULT: PASS=' + audited + ' FAIL=' + findings.length);
  process.exit(findings.length ? 1 : 0);
})().catch((e) => {
  const msg = String((e && e.message) || e);
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED|Target closed|browser has been closed|Protocol error|Executable doesn't exist|net::ERR/i.test(msg)) {
    console.log('[ADM] ERROR(环境) —— ' + msg);
    console.log('RESULT: PASS=0 FAIL=0 SKIP=1');
    process.exit(0);
  }
  console.log('[ADM] ERROR —— ' + msg);
  console.log('RESULT: PASS=0 FAIL=1');
  process.exit(1);
});
