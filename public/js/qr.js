/* Gerador de QR Code em JavaScript puro (sem dependências, funciona offline).
   Implementação do algoritmo padrão (ISO/IEC 18004): modo byte, correção de
   erro nível M, versões 1–6 — mais do que suficiente para endereços locais
   como http://192.168.0.15:3000. Usado na tela "Acesso pelo celular".
   Baseado no algoritmo público de QR (Denso Wave); QR Code é marca da Denso Wave. */
'use strict';

(function () {

  /* ---------------- GF(256) ---------------- */
  const EXP = new Array(256), LOG = new Array(256);
  for (let i = 0; i < 8; i++) EXP[i] = 1 << i;
  for (let i = 8; i < 256; i++) EXP[i] = EXP[i - 4] ^ EXP[i - 5] ^ EXP[i - 6] ^ EXP[i - 8];
  for (let i = 0; i < 255; i++) LOG[EXP[i]] = i;
  const glog = n => LOG[n];
  const gexp = n => { while (n < 0) n += 255; return EXP[n % 255]; };

  function polyMultiply(a, b) {
    const out = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
      if (a[i] !== 0 && b[j] !== 0) out[i + j] ^= gexp(glog(a[i]) + glog(b[j]));
    }
    return out;
  }
  function polyMod(a, b) {
    if (a.length - b.length < 0) return a;
    const ratio = glog(a[0]) - glog(b[0]);
    const out = a.slice();
    for (let i = 0; i < b.length; i++) out[i] ^= b[i] !== 0 ? gexp(glog(b[i]) + ratio) : 0;
    let start = 0;
    while (start < out.length && out[start] === 0) start++;
    return polyMod(out.slice(start), b);
  }

  /* ---------------- Blocos RS (nível M, versões 1–6) ---------------- */
  /* [quantidade de blocos, códigos por bloco, códigos de dados por bloco] */
  const RS_M = {
    1: [[1, 26, 16]],
    2: [[1, 44, 28]],
    3: [[1, 70, 44]],
    4: [[2, 50, 32]],
    5: [[2, 67, 43]],
    6: [[4, 43, 27]]
  };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };

  function rsBlocks(version) {
    const out = [];
    for (const [n, total, data] of RS_M[version]) {
      for (let i = 0; i < n; i++) out.push({ total, data });
    }
    return out;
  }

  /* ---------------- Buffer de bits ---------------- */
  function BitBuffer() {
    this.buf = []; this.length = 0;
    this.put = (num, len) => { for (let i = len - 1; i >= 0; i--) this.putBit(((num >>> i) & 1) === 1); };
    this.putBit = (bit) => {
      if (this.length === this.buf.length * 8) this.buf.push(0);
      if (bit) this.buf[Math.floor(this.length / 8)] |= (0x80 >>> (this.length % 8));
      this.length++;
    };
  }

  /* ---------------- Montagem dos dados ---------------- */
  function createData(version, bytes) {
    const blocks = rsBlocks(version);
    const totalData = blocks.reduce((s, b) => s + b.data, 0);
    const bb = new BitBuffer();
    bb.put(4, 4);                 // modo byte
    bb.put(bytes.length, 8);      // tamanho (8 bits nas versões 1–9)
    for (const b of bytes) bb.put(b, 8);
    if (bb.length > totalData * 8) throw new Error('Texto grande demais para o QR (' + bytes.length + ' bytes)');
    if (bb.length + 4 <= totalData * 8) bb.put(0, 4); // terminador
    while (bb.length % 8 !== 0) bb.putBit(false);
    let pad = true;
    while (bb.length < totalData * 8) { bb.put(pad ? 0xEC : 0x11, 8); pad = !pad; }

    // divide em blocos e calcula os códigos de correção de erro
    let offset = 0, maxDc = 0, maxEc = 0;
    const dcs = [], ecs = [];
    for (const blk of blocks) {
      const dc = bb.buf.slice(offset, offset + blk.data);
      offset += blk.data;
      const ecLen = blk.total - blk.data;
      let g = [1];
      for (let i = 0; i < ecLen; i++) g = polyMultiply(g, [1, gexp(i)]);
      const raw = dc.concat(new Array(ecLen).fill(0));
      let mod = polyMod(raw, g);
      const ec = new Array(ecLen).fill(0);
      for (let i = 0; i < mod.length; i++) ec[ecLen - mod.length + i] = mod[i];
      dcs.push(dc); ecs.push(ec);
      maxDc = Math.max(maxDc, dc.length); maxEc = Math.max(maxEc, ec.length);
    }
    const data = [];
    for (let i = 0; i < maxDc; i++) for (const dc of dcs) if (i < dc.length) data.push(dc[i]);
    for (let i = 0; i < maxEc; i++) for (const ec of ecs) if (i < ec.length) data.push(ec[i]);
    return data;
  }

  /* ---------------- Matriz ---------------- */
  function Matrix(version) {
    this.count = version * 4 + 17;
    this.m = Array.from({ length: this.count }, () => new Array(this.count).fill(null));
  }

  function setupFinder(mx, row, col) {
    for (let r = -1; r <= 7; r++) {
      if (row + r < 0 || row + r >= mx.count) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c < 0 || col + c >= mx.count) continue;
        mx.m[row + r][col + c] =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      }
    }
  }

  function setupPatterns(mx, version) {
    setupFinder(mx, 0, 0);
    setupFinder(mx, mx.count - 7, 0);
    setupFinder(mx, 0, mx.count - 7);
    // padrões de alinhamento
    const pos = ALIGN[version];
    for (const row of pos) for (const col of pos) {
      if (mx.m[row][col] !== null) continue;
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
        mx.m[row + r][col + c] = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
      }
    }
    // padrões de tempo
    for (let i = 8; i < mx.count - 8; i++) {
      if (mx.m[i][6] === null) mx.m[i][6] = i % 2 === 0;
      if (mx.m[6][i] === null) mx.m[6][i] = i % 2 === 0;
    }
  }

  function bch15(data) {
    const g = 0x537;
    const bitlen = n => { let len = 0; while (n) { len++; n >>>= 1; } return len; };
    let d = data << 10;
    while (bitlen(d) - bitlen(g) >= 0) d ^= g << (bitlen(d) - bitlen(g));
    return ((data << 10) | d) ^ 0x5412;
  }

  function setupFormat(mx, maskPattern) {
    const bits = bch15((0 << 3) | maskPattern); // nível M = 00
    for (let i = 0; i < 15; i++) {
      const mod = ((bits >> i) & 1) === 1;
      // vertical (coluna 8)
      if (i < 6) mx.m[i][8] = mod;
      else if (i < 8) mx.m[i + 1][8] = mod;
      else mx.m[mx.count - 15 + i][8] = mod;
      // horizontal (linha 8)
      if (i < 8) mx.m[8][mx.count - i - 1] = mod;
      else if (i < 9) mx.m[8][15 - i - 1 + 1] = mod;
      else mx.m[8][15 - i - 1] = mod;
    }
    mx.m[mx.count - 8][8] = true; // módulo escuro fixo
  }

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
    (r, c) => ((r * c) % 3 + (r + c) % 2) % 2 === 0
  ];

  function mapData(mx, data, maskPattern) {
    let inc = -1, row = mx.count - 1, bitIndex = 7, byteIndex = 0;
    for (let col = mx.count - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (;;) {
        for (let c = 0; c < 2; c++) {
          if (mx.m[row][col - c] === null) {
            let dark = false;
            if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
            if (MASKS[maskPattern](row, col - c)) dark = !dark;
            mx.m[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || row >= mx.count) { row -= inc; inc = -inc; break; }
      }
    }
  }

  /* Penalidade da máscara (regras padrão) — escolhe a máscara mais legível */
  function lostPoint(mx) {
    const n = mx.count, get = (r, c) => mx.m[r][c];
    let lost = 0;
    for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
      let same = 0;
      const dark = get(row, col);
      for (let r = -1; r <= 1; r++) {
        if (row + r < 0 || row + r >= n) continue;
        for (let c = -1; c <= 1; c++) {
          if (col + c < 0 || col + c >= n || (r === 0 && c === 0)) continue;
          if (dark === get(row + r, col + c)) same++;
        }
      }
      if (same > 5) lost += 3 + same - 5;
    }
    for (let row = 0; row < n - 1; row++) for (let col = 0; col < n - 1; col++) {
      let count = 0;
      if (get(row, col)) count++;
      if (get(row + 1, col)) count++;
      if (get(row, col + 1)) count++;
      if (get(row + 1, col + 1)) count++;
      if (count === 0 || count === 4) lost += 3;
    }
    for (let row = 0; row < n; row++) for (let col = 0; col < n - 6; col++) {
      if (get(row, col) && !get(row, col + 1) && get(row, col + 2) && get(row, col + 3)
        && get(row, col + 4) && !get(row, col + 5) && get(row, col + 6)) lost += 40;
    }
    for (let col = 0; col < n; col++) for (let row = 0; row < n - 6; row++) {
      if (get(row, col) && !get(row + 1, col) && get(row + 2, col) && get(row + 3, col)
        && get(row + 4, col) && !get(row + 5, col) && get(row + 6, col)) lost += 40;
    }
    let darkCount = 0;
    for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) if (get(row, col)) darkCount++;
    lost += Math.abs(100 * darkCount / n / n - 50) / 5 * 10;
    return lost;
  }

  /* ---------------- API ---------------- */
  function toBytes(text) {
    // UTF-8 (endereços http são ASCII, mas fica correto para qualquer texto)
    const out = [];
    for (const ch of unescape(encodeURIComponent(text))) out.push(ch.charCodeAt(0));
    return out;
  }

  /** Devolve a matriz (array de arrays de boolean) do QR para o texto. */
  function matrix(text) {
    const bytes = toBytes(text);
    let version = 0;
    for (let v = 1; v <= 6; v++) {
      const cap = rsBlocks(v).reduce((s, b) => s + b.data, 0) * 8;
      if (4 + 8 + bytes.length * 8 <= cap) { version = v; break; }
    }
    if (!version) throw new Error('Texto grande demais para o QR (' + bytes.length + ' bytes)');
    const data = createData(version, bytes);

    let best = null, bestLost = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const mx = new Matrix(version);
      setupPatterns(mx, version);
      setupFormat(mx, mask);
      mapData(mx, data, mask);
      const lp = lostPoint(mx);
      if (lp < bestLost) { bestLost = lp; best = mx; }
    }
    return best.m;
  }

  /** SVG pronto (fundo branco + zona de silêncio), para imprimir/escanear. */
  function svg(text, size) {
    const m = matrix(text);
    const n = m.length, quiet = 4, total = n + quiet * 2;
    size = size || 200;
    let rects = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (m[r][c]) rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}"
      shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  }

  const QR = { matrix, svg };
  if (typeof window !== 'undefined') window.QR = QR;
  if (typeof module !== 'undefined' && module.exports) module.exports = QR;
})();
