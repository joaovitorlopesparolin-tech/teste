/**
 * Leitor mínimo de .xlsx em Node puro (sem dependências).
 *
 * Um .xlsx é um arquivo ZIP contendo XMLs. Aqui lemos o essencial para
 * importar planilhas de dados: strings compartilhadas, abas na ordem do
 * arquivo e o valor bruto de cada célula. Datas do Excel são números
 * seriais — use asDate() nas colunas que você sabe que são datas.
 */
'use strict';

const zlib = require('zlib');

/* ---------------- ZIP ---------------- */
function readZip(buf) {
  // End of Central Directory: assinatura 0x06054b50, varrendo do fim
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('O arquivo não é um .xlsx válido');
  const count = buf.readUInt16LE(e + 10);
  let off = buf.readUInt32LE(e + 16);
  const entries = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries[name] = { method, csize, lho };
    off += 46 + nameLen + extraLen + commentLen;
  }
  return function read(name) {
    const ent = entries[name];
    if (!ent) return null;
    const lnl = buf.readUInt16LE(ent.lho + 26);
    const lel = buf.readUInt16LE(ent.lho + 28);
    const start = ent.lho + 30 + lnl + lel;
    const data = buf.subarray(start, start + ent.csize);
    return ent.method === 0 ? data : zlib.inflateRawSync(data);
  };
}

/* ---------------- XML helpers ---------------- */
function decodeXml(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function attr(tag, name) {
  const m = tag.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : '';
}

/* Coluna "B" → 1, "AA" → 26… */
function colIndex(ref) {
  let n = 0;
  for (const ch of ref) {
    if (ch >= '0' && ch <= '9') break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}
function rowIndex(ref) {
  return parseInt(ref.replace(/^[A-Z]+/, ''), 10) - 1;
}

/* ---------------- Parse ---------------- */
/**
 * parse(buffer) → { sheets: [{ name, rows }] }
 * rows[r][c] = valor bruto: number | string | boolean | undefined.
 */
function parse(buf) {
  const read = readZip(buf);

  // strings compartilhadas
  const shared = [];
  const ss = read('xl/sharedStrings.xml');
  if (ss) {
    const xml = ss.toString('utf8');
    for (const si of xml.match(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>|<si\/>/g) || []) {
      let text = '';
      for (const t of si.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) || []) {
        text += decodeXml(t.replace(/^<t(?:\s[^>]*)?>/, '').replace(/<\/t>$/, ''));
      }
      shared.push(text);
    }
  }

  // abas: nome + r:id → alvo no rels
  const wbXml = (read('xl/workbook.xml') || Buffer.alloc(0)).toString('utf8');
  const relsXml = (read('xl/_rels/workbook.xml.rels') || Buffer.alloc(0)).toString('utf8');
  const rels = {};
  for (const rel of relsXml.match(/<Relationship\s[^>]*\/>/g) || []) {
    let target = attr(rel, 'Target').replace(/^\//, '');
    if (!target.startsWith('xl/')) target = 'xl/' + target;
    rels[attr(rel, 'Id')] = target;
  }
  const sheets = [];
  for (const sh of wbXml.match(/<sheet\s[^>]*\/>/g) || []) {
    const name = decodeXml(attr(sh, 'name'));
    const target = rels[attr(sh, 'r:id')];
    const data = target ? read(target) : null;
    if (!data) continue;
    sheets.push({ name, rows: parseSheet(data.toString('utf8'), shared) });
  }
  return { sheets };
}

function parseSheet(xml, shared) {
  const rows = [];
  for (const cell of xml.match(/<c\s[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
    const ref = attr(cell, 'r');
    if (!ref) continue;
    const r = rowIndex(ref), c = colIndex(ref);
    const t = attr(cell, 't');
    let value;
    if (t === 'inlineStr') {
      const m = cell.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
      value = m ? decodeXml(m[1]) : '';
    } else {
      const m = cell.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
      if (!m) continue; // célula vazia (só formatação)
      const v = m[1];
      if (t === 's') value = shared[Number(v)];
      else if (t === 'b') value = v === '1';
      else if (t === 'str') value = decodeXml(v);
      else {
        const n = Number(v);
        value = Number.isFinite(n) ? n : decodeXml(v);
      }
    }
    (rows[r] || (rows[r] = {}))[c] = value;
  }
  return rows;
}

/** Número serial do Excel → 'AAAA-MM-DD' (ou null se não parecer data). */
function asDate(v) {
  if (typeof v !== 'number' || v < 20000 || v > 80000) return null;
  const ms = Math.round((v - 25569) * 86400000); // 25569 = 01/01/1970 no calendário do Excel
  return new Date(ms).toISOString().slice(0, 10);
}

module.exports = { parse, asDate };
