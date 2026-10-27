// 新维度：真实 DOM 快速连点「计量守恒」压测
// 与 G3(每个按钮点 1 次) 的差别：这里同一按钮点 N 次且不等面板重渲染，
// 专门抓「扣费/发放不成比例」——即连点第 2 次起被吞、或一次点击扣两份。
const { chromium } = require('playwright');
const PANELS = ['shop','role','bag','gun','chip','task','core','codex','base','legion',
                'talent','set','rank','mail','friends','act','tavern','exped','ashop','gem'];
const N = 4;

const VEC = `(() => {
  const P = window.P; if (!P) return null;
  const sum = o => { if (!o) return 0; try { return Object.values(o).reduce((a,b)=>a+(Number(b)||0),0); } catch(e){ return -1; } };
  const arrSum = a => { if (!Array.isArray(a)) return 0; return a.reduce((s,x)=>s+(Number(x&&x.n)||0),0); };
  const v = {
    gold: Number(P.gold)||0, dia: Number(P.diamond)||0, stam: Number(P.stamina)||0,
    ach: Number(P.ach)||0, xp: Number(P.xp)||0,
    bag: arrSum(P.bag), mat: sum(P.mat), chip: Array.isArray(P.chip)?P.chip.length:0,
    gem: sum(P.gem), tp: Number(P.tp)||0,
  };
  return v;
})()`;

const STOCK = `(() => {
  const P = window.P; if (!P) return 'noP';
  P.gold = 5e9; P.diamond = 5e7; P.stamina = 100; P.ach = 5e6; P.tp = 500;
  P.mat = P.mat || {}; P.mat.I04 = 200; P.mat.M01 = 2000; P.mat.M02 = 2000; P.mat.M03 = 2000;
  try { window.E && E.save && E.save(P); } catch(e) {}
  return 'ok';
})()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport:{width:393,height:852} });
  const errs = [];
  const NOISE = /Failed to load resource|net::ERR|Access to fetch|CORS|githubusercontent/i;
  pg.on('pageerror', e => { const s=String(e).split('\n')[0].slice(0,140); if(!NOISE.test(s)) errs.push(s); });
  pg.on('console', m => { if(m.type()==='error'){ const s=m.text().slice(0,120); if(!NOISE.test(s)) errs.push('[con] '+s); } });
  await pg.addInitScript(() => { window.confirm = () => false; window.alert = () => {}; window.onbeforeunload = null; });

  await pg.goto('http://127.0.0.1:8951/index.html',{waitUntil:'load'});
  await pg.waitForTimeout(2000);
  await pg.evaluate(async()=>{
    localStorage.setItem('zb_uid','ZZ_REP');
    try{ await window.MAIN.login('连点测试','男'); }catch(e){}
  });
  await pg.waitForTimeout(2600);
  console.log('库存注入:', await pg.evaluate(STOCK));

  const findings = [];
  let clicks = 0;

  for (const k of PANELS) {
    await pg.evaluate(kk=>{ try{ UI.open(kk); }catch(e){ throw e; } }, k);
    await pg.waitForTimeout(500);
    const cnt = await pg.evaluate(()=>{
      const root=document.getElementById('panel'); if(!root) return 0;
      return [...root.querySelectorAll('button,[class*="btn"]')].filter(el=>{
        const q=el.getBoundingClientRect();
        return q.width>=8&&q.height>=8&&!el.disabled&&getComputedStyle(el).visibility!=='hidden';}).length;
    });
    for (let i=0;i<Math.min(cnt,8);i++) {
      // 重新开面板，保证按钮存在
      await pg.evaluate(kk=>{ try{ UI.open(kk); }catch(e){} }, k);
      await pg.waitForTimeout(320);
      const name = await pg.evaluate(idx=>{
        const root=document.getElementById('panel'); if(!root) return null;
        const els=[...root.querySelectorAll('button,[class*="btn"]')].filter(el=>{
          const q=el.getBoundingClientRect();
          return q.width>=8&&q.height>=8&&!el.disabled&&getComputedStyle(el).visibility!=='hidden';});
        if(!els[idx]) return null;
        return (els[idx].innerText||'').trim().slice(0,20) || els[idx].id || '?';
      }, i);
      if (!name) continue;

      const e0 = errs.length;
      const snaps = [];
      let miss = false;
      for (let c=0;c<N;c++) {
        const before = await pg.evaluate(VEC);
        // 界面标价：按钮文案里的数字（如「升级 · 4919 金币」）—— 用于核对"标价 vs 实扣"
        const label = await pg.evaluate(idx=>{
          const root=document.getElementById('panel'); if(!root) return '';
          const els=[...root.querySelectorAll('button,[class*="btn"]')].filter(el=>{
            const q=el.getBoundingClientRect();
            return q.width>=8&&q.height>=8&&!el.disabled&&getComputedStyle(el).visibility!=='hidden';});
          return els[idx] ? (els[idx].innerText||'') : '';
        }, i);
        const clicked = await pg.evaluate(idx=>{
          const root=document.getElementById('panel'); if(!root) return false;
          const els=[...root.querySelectorAll('button,[class*="btn"]')].filter(el=>{
            const q=el.getBoundingClientRect();
            return q.width>=8&&q.height>=8&&!el.disabled&&getComputedStyle(el).visibility!=='hidden';});
          if(!els[idx]) return false;
          els[idx].click(); return true;
        }, i);
        if (!clicked) { miss = true; break; }
        clicks++;
        await pg.waitForTimeout(140);
        const after = await pg.evaluate(VEC);
        snaps.push({before, after, label});
        // 关掉可能弹出的模态（只点取消/关闭）
        await pg.evaluate(()=>{
          document.querySelectorAll('.mask,.modal,.pop-mask,.dlg,.popup').forEach(m=>{
            if(m.id==='panel'||m.contains(document.getElementById('panel'))) return;
            const c2=[...m.querySelectorAll('button')].find(x=>/取消|关闭|知道了|不用了|确定/.test(x.innerText||''));
            if(c2) c2.click();
          });
        });
        await pg.waitForTimeout(90);
      }
      if (miss || snaps.length < 2) continue;

      // 不变量 1：任何时刻不得出现负数 / 非有限值
      snaps.forEach((s,ci)=>{
        if (!s.after) return;
        Object.keys(s.after).forEach(f=>{
          const v = s.after[f];
          if (typeof v === 'number' && (!isFinite(v) || v < 0))
            findings.push({panel:k, btn:name, kind:'非法值', detail:f+'='+v+' @第'+(ci+1)+'击'});
        });
      });

      // 不变量 2：每次点击的资源变化量应稳定 —— 第2次起要么与第1次同量，要么为0(被拦)。
      // 若出现「第1次扣X、第2次扣2X」这类不成比例，说明连点竞态。
      const d1 = {};
      Object.keys(snaps[0].after||{}).forEach(f=>{ d1[f] = (snaps[0].after[f]||0)-(snaps[0].before[f]||0); });
      const moved = Object.keys(d1).filter(f=>d1[f]!==0);
      // 注意：升级/强化类按钮的价格本就按倍率逐次递增（buildCost = cost0*grow^(lv-1)），
      // 连点第 N 次扣费变大是正常设计。判据改为【相邻两次的变化量之比要平滑】：
      // 若 d2/d1 与 d3/d2 相差悬殊（>1.8 倍），说明中间某次被吞或重复扣。
      const ds = snaps.map(s => {
        const o = {}; moved.forEach(f => { o[f] = s && s.after ? (s.after[f]||0)-(s.before[f]||0) : 0; });
        return o;
      });
      moved.forEach(f=>{
        const seq = ds.map(x=>x[f]);
        for (let j=1;j<seq.length-1;j++){
          const a=seq[j], b=seq[j+1];
          if (!a || !b) continue;                    // 0 = 被上限拦下，正常
          if (a*b < 0) findings.push({panel:k, btn:name, kind:'增减方向反转', detail:f+' '+a+' -> '+b});
          else { const r1=b/a, r2=seq[j-1]?a/seq[j-1]:0;
            if (r2 && (r1/r2 > 1.8 || r1/r2 < 1/1.8))
              findings.push({panel:k, btn:name, kind:'变化量突变', detail:f+' 序列 '+seq.join(',')});
          }
        }
      });
      // 不变量 3：标价 vs 实扣 —— 按钮上写「升级 · 4919 金币」就必须只扣 4919。
      // 这是可证伪的：把扣费改成 2×cost，标价不变而实扣翻倍，必然被抓。
      snaps.forEach((s,ci)=>{
        if (!s.after || !s.before) return;
        // 界面数字走 E.fmt 的中文单位（16.4万 / 1.50亿），必须还原成真值再比对，
        // 否则"标价 16.4万 vs 实扣 163970"会被误判成不符。
        const UNIT = { '万':1e4, '亿':1e8, '兆':1e12, '京':1e16, '垓':1e20, '秭':1e24 };
        const nums = (String(s.label||'').match(/[0-9][0-9,\.]*\s*[万亿兆京垓秭]?/g)||[]).map(t=>{
          const m = String(t).match(/([0-9][0-9,\.]*)\s*([万亿兆京垓秭]?)/);
          if (!m) return NaN;
          let v = parseFloat(m[1].replace(/,/g,''));
          if (m[2]) v *= (UNIT[m[2]] || 1);
          return v;
        }).filter(x=>isFinite(x)&&x>0);
        if (!nums.length) return;
        Object.keys(s.before).forEach(f=>{
          const d = (s.after[f]||0)-(s.before[f]||0);
          if (d >= -2) return;                              // 只看扣费
          const hit = nums.some(x => Math.abs(Math.abs(d)-x) <= Math.max(2, x*0.02));
          if (!hit) findings.push({panel:k, btn:name, kind:'实扣与标价不符', detail:f+' 实扣'+(-d)+' 标价['+nums.join(',')+'] 文案"'+String(s.label).trim().slice(0,24)+'" @第'+(ci+1)+'击'});
        });
      });
      if (errs.length > e0)
        findings.push({panel:k, btn:name, kind:'连点报错', detail:errs.slice(e0,e0+1).join('').slice(0,120)});
    }
  }

  console.log('\n连点总次数:', clicks);
  console.log('发现问题:', findings.length);
  findings.forEach(f=>console.log('  X ['+f.kind+'] '+f.panel+' / '+f.btn+' :: '+f.detail));
  if (!findings.length) console.log('  全部守恒，无异常');
  await b.close();
})();
