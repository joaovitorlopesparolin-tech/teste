/**
 * Camada de persistência simples baseada em arquivo JSON.
 * Sem dependências externas — adequada ao porte de um sistema interno.
 * Todas as coleções ficam em data/db.json; gravação é atômica (tmp + rename).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const COLLECTIONS = [
  'users', 'roles', 'sessions', 'audit', 'settings',
  'clients', 'headEntries', 'assets',
  'serviceCatalog', 'quotes', 'serviceOrders',
  'products', 'stockItems', 'stockMoves',
  'sales', 'productionOrders',
  'suppliers', 'purchases', 'supplierExpenses', 'supplierInvoices',
  'payables', 'recurring', 'receivables', 'cashflow',
  'tasks', 'employees', 'hrPayments', 'models3d'
];

let db = null;
let saveTimer = null;

function emptyDb() {
  const d = { _seq: {} };
  for (const c of COLLECTIONS) d[c] = [];
  return d;
}

function load() {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      for (const c of COLLECTIONS) if (!Array.isArray(db[c])) db[c] = [];
      if (!db._seq) db._seq = {};
    } catch (e) {
      // Arquivo corrompido: preserva uma cópia e recomeça.
      fs.copyFileSync(DB_FILE, DB_FILE + '.corrupt.' + Date.now());
      db = emptyDb();
    }
  } else {
    db = emptyDb();
  }
  return db;
}

function persistNow() {
  if (!db) return;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

function save() {
  // Debounce curto: várias mutações na mesma requisição geram uma gravação só.
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { persistNow(); } catch (e) { console.error('Falha ao gravar db.json:', e.message); }
  }, 50);
}

function nextId(collection) {
  const d = load();
  d._seq[collection] = (d._seq[collection] || 0) + 1;
  return d._seq[collection];
}

/** Número sequencial "humano" independente do id (ex.: numeração de orçamentos, OS, cabeçotes). */
function nextNumber(key, start) {
  const d = load();
  const k = 'num:' + key;
  d._seq[k] = (d._seq[k] || (start ? start - 1 : 0)) + 1;
  return d._seq[k];
}

function all(collection) { return load()[collection]; }
function get(collection, id) { return load()[collection].find(r => r.id === Number(id)) || null; }

function insert(collection, record) {
  const d = load();
  record.id = nextId(collection);
  if (!record.createdAt) record.createdAt = new Date().toISOString();
  d[collection].push(record);
  save();
  return record;
}

function update(collection, id, patch) {
  const rec = get(collection, id);
  if (!rec) return null;
  Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
  save();
  return rec;
}

function remove(collection, id) {
  const d = load();
  const i = d[collection].findIndex(r => r.id === Number(id));
  if (i === -1) return false;
  d[collection].splice(i, 1);
  save();
  return true;
}

module.exports = {
  COLLECTIONS, load, save, persistNow,
  all, get, insert, update, remove, nextId, nextNumber,
  get settings() {
    const d = load();
    if (!d.settings.length) d.settings.push({ id: 1, quoteValidityDays: 30, companyName: 'Jaques Motorsport' });
    return d.settings[0];
  }
};
