/* =========================================================
 * qr.js —— 精简 QR Code 生成器（Byte 模式 / 纠错 M / 版本 1-6）
 * ---------------------------------------------------------
 * 纯前端实现，无外部依赖。生成的二维码真实可扫。
 * 限制：仅 Byte 模式（UTF-8），纠错级别 M，版本 1~6（最多 108 字节），
 *       足够容纳带参数的登录回调网址。
 * ========================================================= */
const QR = (function () {

  /* ---------- GF(256) 伽罗瓦域 ---------- */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /* ---------- 生成多项式 ---------- */
  function genPoly(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const ng = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        ng[j] ^= g[j];
        ng[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = ng;
    }
    return g;
  }

  /* ---------- RS 纠错码字 ---------- */
  function rsEncode(data, ecLen) {
    const g = genPoly(ecLen);
    const res = new Array(data.length + ecLen).fill(0);
    for (let i = 0; i < data.length; i++) res[i] = data[i];
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef === 0) continue;
      for (let j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], coef);
    }
    return res.slice(data.length);
  }

  /* ---------- 版本参数表（纠错级别 M，版本 1-6） ----------
   * [每块数据码字, 每块纠错码字, 块数]                     */
  const SPEC = {
    1: { data: 16, ec: 10, blocks: 1, align: [] },
    2: { data: 28, ec: 16, blocks: 1, align: [6, 18] },
    3: { data: 44, ec: 26, blocks: 1, align: [6, 22] },
    4: { data: 32, ec: 18, blocks: 2, align: [6, 26] },
    5: { data: 43, ec: 24, blocks: 2, align: [6, 30] },
    6: { data: 27, ec: 16, blocks: 4, align: [6, 34] },
  };

  /* ---------- UTF-8 转字节 ---------- */
  function utf8(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.codePointAt(i);
      if (c > 0xffff) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  /* ---------- 位流 ---------- */
  function BitBuf() { this.b = []; }
  BitBuf.prototype.put = function (val, len) {
    for (let i = len - 1; i >= 0; i--) this.b.push((val >>> i) & 1);
  };

  /* ---------- 选版本 ---------- */
  function pickVersion(byteLen) {
    for (let v = 1; v <= 6; v++) {
      const s = SPEC[v];
      const cap = s.data * s.blocks;
      /* 容量需要容纳：模式4位 + 长度8位 + 数据 + 终止符 */
      if (cap * 8 >= 4 + 8 + byteLen * 8) return v;
    }
    return 0;
  }

  /* =========================================================
   * 主入口：生成 0/1 矩阵（true = 深色模块）
   * ========================================================= */
  function matrix(text) {
    const bytes = utf8(String(text || ''));
    const ver = pickVersion(bytes.length);
    if (!ver) return null;
    const sp = SPEC[ver];
    const size = 17 + ver * 4;

    /* ---- 1. 数据编码 ---- */
    const bb = new BitBuf();
    bb.put(0b0100, 4);            // Byte 模式
    bb.put(bytes.length, 8);      // 字符计数（版本1-9 用 8 位）
    bytes.forEach((x) => bb.put(x, 8));
    const capBits = sp.data * sp.blocks * 8;
    /* 终止符 */
    for (let i = 0; i < 4 && bb.b.length < capBits; i++) bb.b.push(0);
    /* 补齐到字节 */
    while (bb.b.length % 8 !== 0) bb.b.push(0);
    /* 填充字节 */
    const pads = [0xec, 0x11];
    let pi = 0;
    while (bb.b.length < capBits) { bb.put(pads[pi % 2], 8); pi++; }

    /* ---- 2. 转码字 ---- */
    const dataCW = [];
    for (let i = 0; i < bb.b.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bb.b[i + j];
      dataCW.push(v);
    }

    /* ---- 3. 分块 + RS ---- */
    const blocks = [], ecBlocks = [];
    let off = 0;
    for (let b = 0; b < sp.blocks; b++) {
      const d = dataCW.slice(off, off + sp.data); off += sp.data;
      blocks.push(d);
      ecBlocks.push(rsEncode(d, sp.ec));
    }
    /* 交织 */
    const final = [];
    for (let i = 0; i < sp.data; i++) for (let b = 0; b < sp.blocks; b++) final.push(blocks[b][i]);
    for (let i = 0; i < sp.ec; i++) for (let b = 0; b < sp.blocks; b++) final.push(ecBlocks[b][i]);

    /* ---- 4. 建矩阵 ---- */
    const mod = [];
    const fn = [];   // 是否为功能图案
    for (let r = 0; r < size; r++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const setFn = (r, c, v) => { mod[r][c] = v; fn[r][c] = true; };

    /* 定位图案（三个角） */
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6))
          || (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setFn(rr, cc, inRing || inCore);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    /* 时序图案 */
    for (let i = 8; i < size - 8; i++) {
      const v = i % 2 === 0;
      if (!fn[6][i]) setFn(6, i, v);
      if (!fn[i][6]) setFn(i, 6, v);
    }

    /* 对齐图案 */
    sp.align.forEach((ar) => sp.align.forEach((ac) => {
      if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8)) return;
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
        const v = Math.max(Math.abs(r), Math.abs(c)) !== 1;
        setFn(ar + r, ac + c, v);
      }
    }));

    /* 深色模块（固定） */
    setFn(size - 8, 8, true);

    /* 格式信息预留区 */
    for (let i = 0; i <= 8; i++) {
      if (!fn[8][i]) setFn(8, i, false);
      if (!fn[i][8]) setFn(i, 8, false);
    }
    for (let i = 0; i < 8; i++) {
      setFn(8, size - 1 - i, false);
      setFn(size - 1 - i, 8, false);
    }

    /* ---- 5. 放置数据 ---- */
    let bitIdx = 0;
    const nextBit = () => (bitIdx < final.length * 8)
      ? ((final[bitIdx >> 3] >>> (7 - (bitIdx++ & 7))) & 1) : 0;

    let col = size - 1, up = true, row = size - 1;
    while (col > 0) {
      if (col === 6) col--;                    // 跳过垂直时序列
      for (;;) {
        for (let k = 0; k < 2; k++) {
          const c = col - k;
          if (!fn[row][c]) mod[row][c] = !!nextBit();
        }
        row += up ? -1 : 1;
        if (row < 0 || row >= size) { row -= up ? -1 : 1; up = !up; break; }
      }
      col -= 2;
    }

    /* ---- 6. 掩码 ---- */
    const MASKS = [
      (r, c) => (r + c) % 2 === 0,
      (r, c) => r % 2 === 0,
      (r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
      (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
      (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
    ];
    const apply = (m) => {
      const g = mod.map((a) => a.slice());
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
        if (!fn[r][c] && MASKS[m](r, c)) g[r][c] = !g[r][c];
      return g;
    };
    const penalty = (g) => {
      let p = 0;
      /* 规则1：连续同色 */
      for (let r = 0; r < size; r++) {
        let run = 1;
        for (let c = 1; c < size; c++) {
          if (g[r][c] === g[r][c - 1]) { run++; } else { if (run >= 5) p += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) p += 3 + (run - 5);
      }
      for (let c = 0; c < size; c++) {
        let run = 1;
        for (let r = 1; r < size; r++) {
          if (g[r][c] === g[r - 1][c]) { run++; } else { if (run >= 5) p += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) p += 3 + (run - 5);
      }
      /* 规则2：2x2 同色块 */
      for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
        const v = g[r][c];
        if (v === g[r][c + 1] && v === g[r + 1][c] && v === g[r + 1][c + 1]) p += 3;
      }
      /* 规则4：黑白比例 */
      let dark = 0;
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (g[r][c]) dark++;
      p += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
      return p;
    };
    let best = 0, bestG = apply(0), bestP = penalty(bestG);
    for (let m = 1; m < 8; m++) {
      const g = apply(m), pp = penalty(g);
      if (pp < bestP) { bestP = pp; bestG = g; best = m; }
    }

    /* ---- 7. 写格式信息（纠错 M = 00） ---- */
    const fmt = (ecBits, mask) => {
      let d = (ecBits << 3) | mask, rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) * 0x537);
      return (((d << 10) | rem) ^ 0x5412) & 0x7fff;
    };
    const fb = fmt(0b00, best);
    for (let i = 0; i < 15; i++) {
      const v = ((fb >>> i) & 1) === 1;
      /* 左上 */
      if (i < 6) bestG[i][8] = v;
      else if (i === 6) bestG[7][8] = v;
      else if (i === 7) bestG[8][8] = v;
      else if (i === 8) bestG[8][7] = v;
      else bestG[8][14 - i] = v;
      /* 右上 + 左下 */
      if (i < 8) bestG[8][size - 1 - i] = v;
      else bestG[size - 15 + i][8] = v;
    }
    return { m: bestG, size: size, version: ver };
  }

  /* ---------- 画到 canvas ---------- */
  function draw(canvas, text, opt) {
    const r = matrix(text);
    if (!r) return false;
    opt = opt || {};
    const quiet = opt.quiet == null ? 3 : opt.quiet;
    const n = r.size + quiet * 2;
    const dpr = (window.devicePixelRatio || 1);
    const cssW = opt.size || 168;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssW + 'px';
    const g = canvas.getContext('2d');
    if (!g) return false;
    g.fillStyle = opt.bg || '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    const px = canvas.width / n;
    g.fillStyle = opt.fg || '#000000';
    for (let row = 0; row < r.size; row++) {
      for (let col = 0; col < r.size; col++) {
        if (!r.m[row][col]) continue;
        g.fillRect(Math.round((col + quiet) * px), Math.round((row + quiet) * px),
          Math.ceil(px), Math.ceil(px));
      }
    }
    return true;
  }

  return { matrix: matrix, draw: draw };
})();

if (typeof window !== 'undefined') window.QR = QR;
