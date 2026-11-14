#!/usr/bin/env node
/* =========================================================
 * onlinerver.cjs —— 云端真身「版本文字三次取样」常驻守卫
 * 立规原因（V1.3.95）：cloudver.cjs / ver3.cjs 的三次取样读的是本地受控副本，
 *   本地永远自洽，抓不到「线上半同步」「发布后改了文件却没升版本」这类真事故。
 *   V1.3.91 用户验证的是云端版本文字，V1.3.92 落地的铁律只覆盖了一半。
 * 判据：V1 份数恰 3 / V2 八个受控文件全取到 / V3 三份两两一致 /
 *   V4 每份内版本文字长度一致 / V5 非空 / V6 所有锚点值一致 /
 *   V7 锚点值 = 云端发布基线 / V8 CHANGELOG 取最新条目标题版本（口径自检）
 * 口径：CHANGELOG 取最后一个 `## V1.x.x` 标题，不取正文里引用的历史版本
 *   （V1.3.94 条目正文写「生效锚点集合 {1.3.93}」，取最后一个数字会得旧值）；
 *   roadmap.json 取最后一个版本串；其余与 cloudver.cjs 同款正则。
 * 前提：网络 / 凭证 / API 不可用一律 exit=2，不得静默报绿。
 * 退出码：0=全过 / 1=有未过项 / 2=前提未就绪
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https');
const SAMPLES = 3;
const REPO = 'q849109815/xiuxian-game';
const TOKEN_PATH = '/data/workspace/.ghtoken';
const CONTROLLED = [
  'index.html', 'admin/index.html', 'js/config.js', 'js/ui.js',
  'admin/js/core.js', 'CHANGELOG.md', 'tools/.lastrelease.json',
  'data/zb/roadmap.json'
];
const BASELINE_FILE = 'tools/.lastrelease.json';

function pickVersionTexts(text, file) {
  const out = [];
  const grab = re => { let m; while ((m = re.exec(text))) out.push(m[1]); };
  if (file === 'index.html' || file === 'admin/index.html') {
    grab(/\?v=(1\.3\.\d+)/g);
  } else if (file === 'js/config.js') {
    grab(/\bversion\s*[:=]\s*['"](1\.3\.\d+)['"]/g);
    grab(/\bver\s*[:=]\s*['"](1\.3\.\d+)['"]/g);
    grab(/\?v=(1\.3\.\d+)/g);
  } else if (file === 'js/ui.js' || file === 'admin/js/core.js') {
    grab(/\b(?:IMG_V|AIMG_V)\s*=\s*['"](1\.3\.\d+)['"]/g);
  } else if (file === BASELINE_FILE) {
    grab(/["']v["']\s*:\s*["'](1\.3\.\d+)["']/g);
  } else if (file === 'CHANGELOG.md') {
    const heads = [...text.matchAll(/^##\s*V(1\.3\.\d+)/gm)].map(x => x[1]);
    if (heads.length) out.push(heads[heads.length - 1]);
  } else {
    const all = [...text.matchAll(/1\.3\.\d+/g)].map(x => x[0]);
    if (all.length) out.push(all[all.length - 1]);
  }
  return out;
}

function fetchOne(file, token) {
  return new Promise((resolve, reject) => {
    const seg = file.split('/').map(encodeURIComponent).join('/');
    const req = https.request({
      hostname: 'api.github.com',
      path: '/repos/' + REPO + '/contents/' + seg + '?ref=main',
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'onlinerver' },
      timeout: 15000
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(file + ' HTTP ' + res.statusCode));
        try {
          const j = JSON.parse(buf);
          resolve(Buffer.from(j.content || '', 'base64').toString('utf8'));
        } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout ' + file)));
    req.on('error', reject);
    req.end();
  });
}

async function collectOnline() {
  const token = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  const snap = {};
  const texts = await Promise.all(CONTROLLED.map(f => fetchOne(f, token)));
  CONTROLLED.forEach((f, i) => { snap[f] = pickVersionTexts(texts[i], f); });
  return snap;
}

function norm(s) { return JSON.stringify(s); }

function verify(snaps) {
  const checks = []; let pass = 0, fail = 0;
  const ck = (name, ok, detail) => { checks.push({ name, ok, detail }); ok ? pass++ : fail++; };
  ck('V1 取样份数必须恰好 ' + SAMPLES, snaps.length === SAMPLES, 'got=' + snaps.length);
  const complete = snaps.length > 0 && snaps.every(s => s && CONTROLLED.every(f => Array.isArray(s[f]) && s[f].length > 0));
  ck('V2 八受控文件三份全取到且非空', complete, complete ? '8/8' : 'missing or empty');
  ck('V3 三次取样两两一致', snaps.length >= 2 && snaps.every(s => norm(s) === norm(snaps[0])),
     'snaps=' + snaps.map(norm).join(' | ').slice(0, 220));
  const all = [];
  snaps.forEach(s => { if (s) CONTROLLED.forEach(f => (s[f] || []).forEach(v => all.push(v))); });
  const lens = [...new Set(all.map(v => v.length))];
  ck('V4 版本文字长度一致', lens.length <= 1, 'lengths=' + lens.join(','));
  ck('V5 版本文字非空', all.length > 0, 'count=' + all.length);
  const vals = [...new Set(all)];
  ck('V6 所有生效锚点值一致', vals.length === 1, 'values=' + vals.join(','));
  const base = (snaps[0] && snaps[0][BASELINE_FILE] || [])[0] || null;
  ck('V7 锚点值等于云端发布基线', base !== null && vals.length === 1 && vals[0] === base,
     'anchor=' + vals.join(',') + ' baseline=' + base);
  const log = (snaps[0] && snaps[0]['CHANGELOG.md'] || [])[0] || null;
  ck('V8 CHANGELOG 取最新条目标题版本', log !== null && log === base, 'changelog=' + log + ' baseline=' + base);
  return { pass, fail, checks, SAMPLES, baseline: base, values: vals };
}

module.exports = { SAMPLES, CONTROLLED, BASELINE_FILE, pickVersionTexts, collectOnline, verify, norm };

if (require.main === module) {
  (async () => {
    try {
      const snaps = [];
      for (let i = 0; i < SAMPLES; i++) snaps.push(await collectOnline());
      const r = verify(snaps);
      r.checks.forEach(x => console.log((x.ok ? 'PASS ' : 'FAIL ') + x.name + '  ' + x.detail));
      console.log('onlinerver: SAMPLES=' + SAMPLES + ' baseline=' + r.baseline + ' values=' + r.values.join(',') + ' PASS=' + r.pass + ' FAIL=' + r.fail);
      process.exit(r.fail ? 1 : 0);
    } catch (e) {
      console.error('onlinerver PREREQ/CRASH: ' + e.message);
      process.exit(2);
    }
  })();
}
