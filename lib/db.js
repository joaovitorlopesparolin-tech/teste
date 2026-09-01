/**
 * Camada de persistência simples baseada em arquivo JSON.
 * Sem dependências externas — adequada ao porte de um sistema interno.
 * Todas as coleções ficam em data/db.json; gravação é atômica (tmp + rename).
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* Onde ficam os dados reais da empresa.
   No Windows é a pasta "data" ao lado do programa. Na nuvem, o programa é
   reinstalado a cada atualização e só o disco permanente sobrevive — por isso
   JAQUES_DATA_DIR aponta para esse disco. Sem essa variável, uma hospedagem
   na nuvem apagaria o banco a cada nova versão. */
const DATA_DIR = process.env.JAQUES_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const COLLECTIONS = [
  'users', 'roles', 'sessions', 'audit', 'settings',
  'clients', 'headEntries', 'assets',
  'serviceCatalog', 'quotes', 'serviceOrders',
  'products', 'stockItems', 'stockMoves',
  'sales', 'productionOrders',
  'suppliers', 'purchases', 'supplierExpenses', 'supplierInvoices',
  'payables', 'recurring', 'receivables', 'cashflow',
  'tasks', 'employees', 'hrPayments', 'models3d', 'labels', 'syncRefs', 'freights',
  /* Crédito que a empresa deve ao cliente — normalmente de uma compra feita
     com ele (que também é fornecedor) e combinada para abater depois. Não é
     conta a receber: aqui o saldo corre a favor do cliente. */
  'clientCredits',
  /* Programas da CNC ROMI D600: o cadastro que substitui a planilha —
     nome padronizado, nome original do programador, aplicação, status,
     resultado de bancada e histórico de quem mexeu. */
  'cncPrograms',
  /* Catálogo do módulo CNC: aplicações, cascos/origem, modelos/códigos e
     áreas de operação. Fica no banco, não no código, para a oficina cadastrar
     um cabeçote ou uma área novos sem depender de alteração no sistema. */
  'cncCatalogo'
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

/* Relê o arquivo do zero, descartando o que estava em memória.
   Usado depois de restaurar um backup por cima do banco. */
function reload() {
  db = null;
  revision++;
  return load();
}

function persistNow() {
  if (!db) return;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

/* Contador de alterações: cada gravação avança 1. As telas abertas
   comparam este número para saber que alguém mexeu em algo e se
   atualizarem sozinhas (trabalho simultâneo entre duas pessoas). */
let revision = 1;
function rev() { return revision; }

function save() {
  revision++;
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
  COLLECTIONS, DATA_DIR, DB_FILE, load, save, persistNow, reload, rev,
  all, get, insert, update, remove, nextId, nextNumber,
  get settings() {
    const d = load();
    if (!d.settings.length) d.settings.push({ id: 1, quoteValidityDays: 30, companyName: 'Jaques Motorsport' });
    const s = d.settings[0];
    // Dados da empresa (remetente das etiquetas) — preenchidos na primeira vez
    if (!s.empresa) {
      s.empresa = {
        razaoSocial: 'JBC PACHECO',
        cnpj: '14107770000142',
        endereco: 'AVENIDA FORTALEZA',
        numero: '884',
        bairro: 'JARDIM DAS LARANJEIRAS',
        cidade: 'FOZ DO IGUAÇU',
        estado: 'PR',
        cep: '85868110',
        complemento: '',
        telefone: ''
      };
      save();
    }
    return s;
  }
};
