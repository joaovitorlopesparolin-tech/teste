/**
 * Jaques Motorsport — Sistema de Gestão Interno
 * Servidor HTTP + API REST em Node.js puro (sem dependências externas).
 *
 * Iniciar:  npm start   (ou: node server.js)
 * Acesso:   http://localhost:3000   —   login inicial: admin / admin123
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('./lib/db');
const domain = require('./lib/domain');
const { seedIfEmpty, hashPassword, checkPassword, MODULES } = require('./lib/seed');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

seedIfEmpty();

/* ===================================================================== */
/* Utilitários HTTP                                                      */
/* ===================================================================== */

function send(res, status, data, headers) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers));
  res.end(body);
}
const ok = (res, data) => send(res, 200, data);
const bad = (res, msg) => send(res, 400, { error: msg });
const notFound = (res) => send(res, 404, { error: 'Não encontrado' });
const forbidden = (res, msg) => send(res, 403, { error: msg || 'Sem permissão para esta ação' });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 15e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

/* ===================================================================== */
/* Autenticação / permissões                                             */
/* ===================================================================== */

function authUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.headers['x-auth-token'] || '');
  if (!token) return null;
  const sess = db.all('sessions').find(s => s.token === token);
  if (!sess) return null;
  const user = db.get('users', sess.userId);
  if (!user || !user.active) return null;
  return user;
}

function permissionsOf(user) {
  const role = db.get('roles', user.roleId);
  return role ? role.permissions : [];
}
function can(user, perm) {
  return permissionsOf(user).includes(perm) || permissionsOf(user).includes('admin');
}

function audit(user, action, entity, entityId, details) {
  db.insert('audit', {
    at: new Date().toISOString(),
    userId: user ? user.id : null,
    userName: user ? user.name : 'sistema',
    action, entity, entityId: entityId || null,
    details: details || ''
  });
  // Mantém o log dentro de um tamanho razoável.
  const a = db.all('audit');
  if (a.length > 20000) a.splice(0, a.length - 20000);
}

/** Remove campos financeiros sensíveis para usuários sem a permissão finance_sensitive. */
function sanitize(user, collection, record) {
  if (!record || can(user, 'finance_sensitive')) return record;
  const r = Object.assign({}, record);
  if (collection === 'products') { delete r.custoBase; }
  if (collection === 'sales') { delete r.custoBaseTotal; delete r.custosAdicionais; delete r.resultado; }
  if (collection === 'employees') { delete r.salario; delete r.beneficios; }
  return r;
}

/* ===================================================================== */
/* Registro de coleções expostas via CRUD genérico                       */
/* ===================================================================== */
/* perm: permissão necessária. writeperm: se diferente da leitura.       */

const REST = {
  clients: { perm: 'clients', label: 'Cliente' },
  serviceCatalog: { perm: 'quotes', writePerm: 'admin', label: 'Serviço do catálogo' },
  products: { perm: 'sales', writePerm: 'finance_sensitive', label: 'Produto' },
  stockItems: { perm: 'stock', label: 'Item de estoque' },
  stockMoves: { perm: 'stock', label: 'Movimentação de estoque' },
  suppliers: { perm: 'suppliers', label: 'Fornecedor' },
  supplierExpenses: { perm: 'suppliers', label: 'Despesa de fornecedor' },
  recurring: { perm: 'payables', label: 'Conta recorrente' },
  tasks: { perm: 'tasks', label: 'Pendência' },
  employees: { perm: 'hr', label: 'Colaborador' },
  hrPayments: { perm: 'hr', label: 'Pagamento de RH' },
  assets: { perm: 'assets', label: 'Bem de cliente' },
  quotes: { perm: 'quotes', label: 'Orçamento' },
  headEntries: { perm: 'entries', label: 'Entrada de cabeçote' },
  serviceOrders: { perm: 'os', label: 'Ordem de serviço' },
  productionOrders: { perm: 'production', label: 'Ordem de produção' },
  sales: { perm: 'sales', label: 'Venda' },
  purchases: { perm: 'purchases', label: 'Compra' },
  supplierInvoices: { perm: 'suppliers', label: 'Fatura de fornecedor' },
  payables: { perm: 'payables', label: 'Conta a pagar' },
  receivables: { perm: 'receivables', label: 'Conta a receber' },
  cashflow: { perm: 'cashflow', label: 'Lançamento de caixa' }
};

/* ===================================================================== */
/* Regras auxiliares                                                     */
/* ===================================================================== */

/** Marca como vencidas as parcelas/contas em aberto com vencimento passado (derivado na leitura). */
function withOverdue(list) {
  const t = domain.today();
  return list.map(r => {
    if (r.status === 'aberto' && r.vencimento && r.vencimento < t) return Object.assign({}, r, { status: 'vencida' });
    return r;
  });
}

/** Gera lembretes/pendências mensais das contas recorrentes (COPEL, Sanepar, consórcio...). */
function ensureRecurringTasks() {
  const month = domain.today().slice(0, 7);
  for (const rec of db.all('recurring').filter(r => r.ativo)) {
    const exists = db.all('tasks').some(t => t.recurringId === rec.id && t.refMonth === month);
    if (!exists) {
      db.insert('tasks', {
        titulo: `Emitir/retirar boleto — ${rec.nome}`,
        descricao: rec.instrucao || '',
        prioridade: 'urgente',
        assigneeId: null,
        status: 'aberta',
        recurringId: rec.id,
        refMonth: month,
        due: `${month}-${String(rec.diaVencimento || 10).padStart(2, '0')}`,
        origem: 'conta recorrente'
      });
    }
  }
}

/** Movimenta estoque com registro da movimentação. */
function moveStock(itemId, tipo, qtd, refType, refId, obs, user) {
  const item = db.get('stockItems', itemId);
  if (!item) return null;
  const delta = tipo === 'entrada' ? qtd : -qtd;
  item.qtd = (item.qtd || 0) + delta;
  db.update('stockItems', item.id, { qtd: item.qtd });
  db.insert('stockMoves', { itemId, itemNome: item.nome, tipo, qtd, data: domain.today(), refType, refId, obs: obs || '' });
  if (user) audit(user, 'estoque', 'stockItems', itemId, `${tipo} de ${qtd} × ${item.nome}`);
  return item;
}

/* ===================================================================== */
/* Parser simplificado de NF-e (XML) para leitura automática de compras   */
/* ===================================================================== */

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : '';
}
function parseNfeXml(xml) {
  try {
    const emit = tag(xml, 'emit');
    const ide = tag(xml, 'ide');
    const out = {
      fornecedorNome: tag(emit, 'xNome'),
      fornecedorCnpj: tag(emit, 'CNPJ'),
      numeroNF: tag(ide, 'nNF'),
      data: (tag(ide, 'dhEmi') || tag(ide, 'dEmi')).slice(0, 10),
      valorTotal: parseFloat(tag(tag(xml, 'ICMSTot'), 'vNF')) || 0,
      itens: [], parcelas: []
    };
    const dets = xml.match(/<det[^>]*>[\s\S]*?<\/det>/g) || [];
    for (const det of dets) {
      out.itens.push({
        descricao: tag(det, 'xProd'),
        qtd: parseFloat(tag(det, 'qCom')) || 1,
        valorUnit: parseFloat(tag(det, 'vUnCom')) || 0,
        total: parseFloat(tag(det, 'vProd')) || 0
      });
    }
    const dups = xml.match(/<dup>[\s\S]*?<\/dup>/g) || [];
    for (const dup of dups) {
      out.parcelas.push({ vencimento: tag(dup, 'dVenc'), valor: parseFloat(tag(dup, 'vDup')) || 0 });
    }
    return out;
  } catch (e) { return null; }
}

/* ===================================================================== */
/* Dashboard                                                             */
/* ===================================================================== */

function dashboard(user) {
  const t = domain.today();
  const month = t.slice(0, 7);
  const inMonth = d => d && String(d).slice(0, 7) === month;

  const sales = db.all('sales').filter(s => s.status !== 'cancelado');
  const os = db.all('serviceOrders');
  const salesMonth = sales.filter(s => inMonth(s.dataPedido));
  const osMonth = os.filter(o => inMonth(o.dataFinalizacao) && o.status !== 'cancelado');
  const receiv = withOverdue(db.all('receivables'));
  const pay = withOverdue(db.all('payables'));
  const flows = db.all('cashflow');

  const faturamentoVendas = salesMonth.reduce((s, v) => s + (v.valorTotal || 0), 0);
  const faturamentoServicos = osMonth.reduce((s, o) => s + (o.valorTotal || 0), 0);

  const custoVendas = salesMonth.reduce((s, v) => s + (domain.saleResult(v).custoReal || 0), 0);
  const lucroEstimado = salesMonth.reduce((s, v) => s + domain.saleResult(v).resultado, 0) + faturamentoServicos * 0; // serviços: custo apurado via vínculos
  const fat = faturamentoVendas + faturamentoServicos;

  const base = {
    mes: month,
    faturamentoMes: fat,
    vendasMes: { qtd: salesMonth.length, valor: faturamentoVendas },
    servicosMes: { qtd: osMonth.length, valor: faturamentoServicos },
    contasReceber: receiv.filter(r => r.status === 'aberto').reduce((s, r) => s + r.valor, 0),
    contasPagar: pay.filter(p => p.status === 'aberto').reduce((s, p) => s + p.valor, 0),
    vencidosReceber: receiv.filter(r => r.status === 'vencida').reduce((s, r) => s + r.valor, 0),
    vencidosPagar: pay.filter(p => p.status === 'vencida').reduce((s, p) => s + p.valor, 0),
    saldoCaixa: flows.reduce((s, f) => s + (f.tipo === 'entrada' ? f.valor : -f.valor), 0),
    orcamentosAguardando: db.all('quotes').filter(q => q.status === 'aberto').length,
    servicosAndamento: os.filter(o => ['em_analise', 'em_andamento', 'aguardando_peca'].includes(o.status)).length,
    cabecotesAguardandoProducao: db.all('productionOrders').filter(p => p.status === 'nao_produzido').length,
    pedidosAguardandoEnvio: sales.filter(s => ['pronto'].includes(s.status)).length,
    pedidosNaoEntregues: sales.filter(s => !['entregue', 'cancelado'].includes(s.status)).length,
    bensDeClientes: db.all('assets').filter(a => a.status === 'na_empresa').length,
    minhasPendencias: db.all('tasks').filter(tk => tk.status === 'aberta' && (!tk.assigneeId || tk.assigneeId === user.id))
      .sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1).slice(0, 20)
  };
  if (can(user, 'finance_sensitive')) {
    base.lucroEstimadoMes = lucroEstimado;
    base.margemMes = fat > 0 ? (lucroEstimado / fat) * 100 : 0;
    base.custoVendasMes = custoVendas;
  }
  return base;
}

/* ===================================================================== */
/* Rotas especiais (fluxos de negócio)                                   */
/* ===================================================================== */

const routes = [];
function route(method, pattern, perm, handler) {
  routes.push({ method, regex: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), perm, handler });
}

/* ---- sessão ---- */
route('POST', '/api/login', null, async (req, res) => {
  const { username, password } = await readBody(req);
  const user = db.all('users').find(u => u.username === String(username || '').toLowerCase().trim());
  if (!user || !checkPassword(password, user.password)) return send(res, 401, { error: 'Usuário ou senha inválidos' });
  if (!user.active) return send(res, 401, { error: 'Usuário inativo' });
  // Expira sessões com mais de 30 dias para o arquivo de dados não crescer indefinidamente.
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  for (const s of db.all('sessions').filter(s => new Date(s.createdAt).getTime() < cutoff)) {
    db.remove('sessions', s.id);
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.insert('sessions', { token, userId: user.id });
  audit(user, 'login', 'users', user.id, 'Login no sistema');
  ensureRecurringTasks();
  ok(res, {
    token,
    user: { id: user.id, name: user.name, cargo: user.cargo, username: user.username, mustChangePassword: !!user.mustChangePassword },
    permissions: permissionsOf(user)
  });
});

route('POST', '/api/logout', null, async (req, res, user) => {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = db.all('sessions').find(x => x.token === token);
  if (s) db.remove('sessions', s.id);
  ok(res, { ok: true });
});

route('GET', '/api/me', 'dashboard', async (req, res, user) => {
  ok(res, { user: { id: user.id, name: user.name, cargo: user.cargo, username: user.username }, permissions: permissionsOf(user) });
});

route('POST', '/api/me/password', 'dashboard', async (req, res, user) => {
  const { atual, nova } = await readBody(req);
  if (!checkPassword(atual, user.password)) return bad(res, 'Senha atual incorreta');
  if (!nova || nova.length < 6) return bad(res, 'A nova senha deve ter ao menos 6 caracteres');
  db.update('users', user.id, { password: hashPassword(nova), mustChangePassword: false });
  audit(user, 'senha', 'users', user.id, 'Alterou a própria senha');
  ok(res, { ok: true });
});

/* ---- metadados p/ frontend ---- */
route('GET', '/api/meta', 'dashboard', async (req, res, user) => {
  ok(res, {
    modules: MODULES,
    stageComandos: domain.STAGE_COMANDOS,
    dreMap: domain.DRE_MAP,
    settings: { quoteValidityDays: db.settings.quoteValidityDays, companyName: db.settings.companyName },
    users: db.all('users').map(u => ({ id: u.id, name: u.name, cargo: u.cargo, active: u.active })),
    roles: db.all('roles').map(r => ({ id: r.id, name: r.name }))
  });
});

route('GET', '/api/meta/tuchos', 'sales', async (req, res, user, params, query) => {
  ok(res, { options: domain.tuchoOptions(query.stage, query.comando) });
});

route('GET', '/api/dashboard', 'dashboard', async (req, res, user) => {
  ensureRecurringTasks();
  ok(res, dashboard(user));
});

/* ---- administração ---- */
route('GET', '/api/users', 'admin', async (req, res) => {
  ok(res, db.all('users').map(u => ({ id: u.id, username: u.username, name: u.name, cargo: u.cargo, roleId: u.roleId, active: u.active })));
});
route('POST', '/api/users', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  if (!b.username || !b.password || !b.name) return bad(res, 'username, password e name são obrigatórios');
  if (db.all('users').some(u => u.username === b.username.toLowerCase())) return bad(res, 'Usuário já existe');
  const rec = db.insert('users', {
    username: b.username.toLowerCase().trim(), password: hashPassword(b.password),
    name: b.name, cargo: b.cargo || '', roleId: Number(b.roleId) || 3, active: b.active !== false, mustChangePassword: true
  });
  audit(user, 'criou', 'users', rec.id, `Usuário ${rec.username}`);
  ok(res, { id: rec.id });
});
route('PUT', '/api/users/:id', 'admin', async (req, res, user, params) => {
  const b = await readBody(req);
  if (Number(params.id) === user.id && b.active === false) {
    return bad(res, 'Você não pode desativar o seu próprio usuário');
  }
  const patch = {};
  for (const k of ['name', 'cargo', 'roleId', 'active']) if (b[k] !== undefined) patch[k] = k === 'roleId' ? Number(b[k]) : b[k];
  if (b.password) { patch.password = hashPassword(b.password); patch.mustChangePassword = true; }
  const rec = db.update('users', params.id, patch);
  if (!rec) return notFound(res);
  audit(user, 'alterou', 'users', rec.id, `Usuário ${rec.username}: ${Object.keys(patch).join(', ')}`);
  ok(res, { ok: true });
});

route('GET', '/api/roles', 'admin', async (req, res) => ok(res, db.all('roles')));
route('POST', '/api/roles', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  const rec = db.insert('roles', { name: b.name || 'Novo perfil', permissions: b.permissions || [] });
  audit(user, 'criou', 'roles', rec.id, rec.name);
  ok(res, rec);
});
route('PUT', '/api/roles/:id', 'admin', async (req, res, user, params) => {
  const b = await readBody(req);
  // O perfil administrador (id 1) nunca pode perder a permissão 'admin' —
  // evita que o sistema fique sem nenhum acesso administrativo.
  if (Number(params.id) === 1 && Array.isArray(b.permissions) && !b.permissions.includes('admin')) {
    return bad(res, 'O perfil Administrador não pode perder a permissão de administração');
  }
  const rec = db.update('roles', params.id, { name: b.name, permissions: b.permissions });
  if (!rec) return notFound(res);
  audit(user, 'alterou', 'roles', rec.id, `Permissões do perfil ${rec.name}`);
  ok(res, rec);
});

route('GET', '/api/audit', 'admin', async (req, res, user, params, query) => {
  let list = db.all('audit').slice().reverse();
  if (query.entity) list = list.filter(a => a.entity === query.entity && String(a.entityId) === String(query.entityId || a.entityId));
  ok(res, list.slice(0, Number(query.limit) || 300));
});

route('GET', '/api/settings', 'admin', async (req, res) => ok(res, db.settings));
route('PUT', '/api/settings', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  const s = db.settings;
  if (b.quoteValidityDays !== undefined) s.quoteValidityDays = Number(b.quoteValidityDays) || 30;
  if (b.companyName) s.companyName = b.companyName;
  db.save();
  audit(user, 'alterou', 'settings', 1, 'Configurações do sistema');
  ok(res, s);
});

/* ---- clientes: perfil consolidado ---- */
route('GET', '/api/clients/:id/profile', 'clients', async (req, res, user, params) => {
  const c = db.get('clients', params.id);
  if (!c) return notFound(res);
  const id = c.id;
  const compras = db.all('sales').filter(s => s.clienteId === id).map(s => sanitize(user, 'sales', s));
  const entradas = db.all('headEntries').filter(e => e.clienteId === id);
  const oss = db.all('serviceOrders').filter(o => o.clienteId === id);
  const orcamentos = db.all('quotes').filter(q => q.clienteId === id);
  const receb = withOverdue(db.all('receivables').filter(r => r.clienteId === id));
  const totalComprado = compras.reduce((s, v) => s + (v.valorTotal || 0), 0)
    + oss.filter(o => o.status !== 'cancelado').reduce((s, o) => s + (o.valorTotal || 0), 0);
  const totalPago = receb.filter(r => r.status === 'paga').reduce((s, r) => s + r.valor, 0);
  const emAberto = receb.filter(r => r.status === 'aberto').reduce((s, r) => s + r.valor, 0);
  const vencido = receb.filter(r => r.status === 'vencida').reduce((s, r) => s + r.valor, 0);
  const hist = db.all('audit').filter(a => a.action === 'timeline' && a.clientId === id).sort((a, b) => a.at < b.at ? 1 : -1);
  ok(res, {
    cliente: c, compras, entradas, ordens: oss, orcamentos, recebiveis: receb,
    financeiro: { totalComprado, totalPago, emAberto, vencido },
    historico: hist
  });
});

/* ---- entrada de cabeçotes ---- */
route('POST', '/api/entries', 'entries', async (req, res, user) => {
  const b = await readBody(req);
  const cliente = db.get('clients', b.clienteId);
  if (!cliente) return bad(res, 'Cliente é obrigatório (cadastre o cliente antes)');
  const numero = db.nextNumber('cabecote', 1001);
  const entry = db.insert('headEntries', {
    codigo: '#' + numero,
    clienteId: cliente.id,
    dataChegada: b.dataChegada || domain.today(),
    cidade: b.cidade || cliente.cidade || '',
    estado: b.estado || cliente.estado || '',
    peca: b.peca || 'Cabeçote',
    modelo: b.modelo || '',
    defeito: b.defeito || '',
    observacoes: b.observacoes || '',
    docFiscal: b.docFiscal || { tipo: 'sem_documento', numero: '' },
    entradaDireta: !!b.entradaDireta, // exceção: entrou sem orçamento
    status: 'recebido' // recebido → em_analise → aguardando_orcamento → orcado → aprovado → ...
  });
  // Todo cabeçote de cliente entra automaticamente como BEM DE TERCEIRO — nunca no estoque próprio.
  const asset = db.insert('assets', {
    clienteId: cliente.id,
    identificacao: `${entry.codigo} — ${entry.peca} ${entry.modelo}`.trim(),
    dataEntrada: entry.dataChegada,
    motivo: b.entradaDireta ? 'Serviço (entrada direta — exceção)' : 'Serviço/retrabalho',
    entryId: entry.id, osId: null,
    status: 'na_empresa',
    docFiscal: entry.docFiscal,
    semDocumentoFiscal: !entry.docFiscal || entry.docFiscal.tipo === 'sem_documento'
  });
  db.update('headEntries', entry.id, { assetId: asset.id });
  audit(user, 'criou', 'headEntries', entry.id, `Entrada ${entry.codigo} (${cliente.nome})`);
  const tl = db.insert('audit', {
    at: new Date().toISOString(), userId: user.id, userName: user.name,
    action: 'timeline', entity: 'headEntries', entityId: entry.id, clientId: cliente.id,
    details: `Cabeçote ${entry.codigo} recebido${asset.semDocumentoFiscal ? ' (sem documento fiscal de remessa)' : ''}`
  });
  ok(res, entry);
});

route('POST', '/api/entries/:id/status', 'entries', async (req, res, user, params) => {
  const b = await readBody(req);
  const rec = db.update('headEntries', params.id, { status: b.status });
  if (!rec) return notFound(res);
  audit(user, 'status', 'headEntries', rec.id, `Entrada ${rec.codigo} → ${b.status}`);
  ok(res, rec);
});

/* ---- devolução de bem de terceiro ---- */
route('POST', '/api/assets/:id/return', 'assets', async (req, res, user, params) => {
  const b = await readBody(req);
  const rec = db.get('assets', params.id);
  if (!rec) return notFound(res);
  db.update('assets', rec.id, { status: 'devolvido', dataSaida: b.dataSaida || domain.today(), nfRetorno: b.nfRetorno || '' });
  audit(user, 'devolução', 'assets', rec.id, `Bem devolvido ao cliente (${rec.identificacao})`);
  db.insert('audit', {
    at: new Date().toISOString(), userId: user.id, userName: user.name,
    action: 'timeline', entity: 'assets', entityId: rec.id, clientId: rec.clienteId,
    details: `Bem devolvido: ${rec.identificacao}${b.nfRetorno ? ' — NF retorno ' + b.nfRetorno : ''}`
  });
  ok(res, { ok: true });
});

/* ---- orçamentos ---- */
function computeQuoteTotals(itens, custosAdicionais) {
  let total = 0;
  const items = (itens || []).map(i => {
    const t = (Number(i.qtd) || 0) * (Number(i.valorUnit) || 0);
    total += t;
    return { serviceId: i.serviceId || null, nome: i.nome, qtd: Number(i.qtd) || 0, valorUnit: Number(i.valorUnit) || 0, total: t };
  });
  const extras = Number(custosAdicionais) || 0;
  return { items, total: total + extras, extras };
}

route('POST', '/api/quotes', 'quotes', async (req, res, user) => {
  const b = await readBody(req);
  const cliente = db.get('clients', b.clienteId);
  if (!cliente) return bad(res, 'Cliente é obrigatório');
  const entry = b.entryId ? db.get('headEntries', b.entryId) : null;
  const { items, total, extras } = computeQuoteTotals(b.itens, b.custosAdicionais);
  const numero = db.nextNumber('orcamento', 1);
  const rec = db.insert('quotes', {
    numero,
    clienteId: cliente.id, cpfCnpj: cliente.cpfCnpj || '',
    entryId: entry ? entry.id : null,
    dataChegada: entry ? entry.dataChegada : (b.dataChegada || ''),
    dataOrcamento: b.dataOrcamento || domain.today(),
    validadeDias: Number(b.validadeDias) || db.settings.quoteValidityDays,
    previsaoEntrega: b.previsaoEntrega || '',
    modelo: b.modelo || (entry ? entry.modelo : ''),
    problema: b.problema || (entry ? entry.defeito : ''),
    descricaoServico: b.descricaoServico || '',
    itens: items, custosAdicionais: extras,
    observacoes: b.observacoes || '',
    total, status: 'aberto'
  });
  if (entry) db.update('headEntries', entry.id, { status: 'orcado', quoteId: rec.id });
  audit(user, 'criou', 'quotes', rec.id, `Orçamento nº ${numero} — ${cliente.nome} — R$ ${total.toFixed(2)}`);
  db.insert('audit', {
    at: new Date().toISOString(), userId: user.id, userName: user.name, action: 'timeline',
    entity: 'quotes', entityId: rec.id, clientId: cliente.id,
    details: `Orçamento nº ${numero} criado (R$ ${total.toFixed(2)})`
  });
  ok(res, rec);
});

route('PUT', '/api/quotes/:id', 'quotes', async (req, res, user, params) => {
  const b = await readBody(req);
  const q = db.get('quotes', params.id);
  if (!q) return notFound(res);
  if (q.status !== 'aberto') return bad(res, 'Só é possível editar orçamentos em aberto');
  const { items, total, extras } = computeQuoteTotals(b.itens || q.itens, b.custosAdicionais !== undefined ? b.custosAdicionais : q.custosAdicionais);
  const rec = db.update('quotes', q.id, {
    validadeDias: b.validadeDias !== undefined ? Number(b.validadeDias) : q.validadeDias,
    previsaoEntrega: b.previsaoEntrega !== undefined ? b.previsaoEntrega : q.previsaoEntrega,
    modelo: b.modelo !== undefined ? b.modelo : q.modelo,
    problema: b.problema !== undefined ? b.problema : q.problema,
    descricaoServico: b.descricaoServico !== undefined ? b.descricaoServico : q.descricaoServico,
    observacoes: b.observacoes !== undefined ? b.observacoes : q.observacoes,
    itens: items, custosAdicionais: extras, total
  });
  audit(user, 'alterou', 'quotes', rec.id, `Orçamento nº ${rec.numero}`);
  ok(res, rec);
});

/** Aprovação do orçamento → gera OS aproveitando todos os dados, sem recadastro. */
route('POST', '/api/quotes/:id/approve', 'quotes', async (req, res, user, params) => {
  const q = db.get('quotes', params.id);
  if (!q) return notFound(res);
  if (q.status !== 'aberto') return bad(res, 'Orçamento não está em aberto');
  const b = await readBody(req);
  const numero = db.nextNumber('os', 1);
  const entry = q.entryId ? db.get('headEntries', q.entryId) : null;
  const os = db.insert('serviceOrders', {
    numero,
    quoteId: q.id, entryId: q.entryId, clienteId: q.clienteId,
    identificacao: entry ? entry.codigo : '',
    modelo: q.modelo, problema: q.problema, descricaoServico: q.descricaoServico,
    itens: q.itens, custosAdicionais: q.custosAdicionais,
    observacoes: q.observacoes,
    valorTotal: q.total,
    status: 'em_analise',
    previsaoEntrega: b.previsaoEntrega || q.previsaoEntrega || '',
    responsavelId: b.responsavelId || null,
    dataFinalizacao: null,
    pagamentoStatus: 'pendente',
    nfRetorno: '', envioStatus: 'na_empresa',
    historico: [{ at: new Date().toISOString(), por: user.name, evento: 'OS criada a partir do orçamento nº ' + q.numero }]
  });
  db.update('quotes', q.id, { status: 'aprovado', osId: os.id, dataAprovacao: domain.today() });
  if (entry) db.update('headEntries', entry.id, { status: 'aprovado', osId: os.id });
  if (entry && entry.assetId) db.update('assets', entry.assetId, { osId: os.id });
  audit(user, 'aprovou', 'quotes', q.id, `Orçamento nº ${q.numero} aprovado → OS nº ${numero}`);
  db.insert('audit', {
    at: new Date().toISOString(), userId: user.id, userName: user.name, action: 'timeline',
    entity: 'serviceOrders', entityId: os.id, clientId: q.clienteId,
    details: `Orçamento nº ${q.numero} aprovado — OS nº ${numero} aberta`
  });
  ok(res, os);
});

route('POST', '/api/quotes/:id/reject', 'quotes', async (req, res, user, params) => {
  const b = await readBody(req);
  const q = db.get('quotes', params.id);
  if (!q) return notFound(res);
  const status = b.status === 'cancelado' ? 'cancelado' : 'recusado';
  db.update('quotes', q.id, { status });
  audit(user, status === 'cancelado' ? 'cancelou' : 'recusou', 'quotes', q.id, `Orçamento nº ${q.numero}`);
  db.insert('audit', {
    at: new Date().toISOString(), userId: user.id, userName: user.name, action: 'timeline',
    entity: 'quotes', entityId: q.id, clientId: q.clienteId, details: `Orçamento nº ${q.numero} ${status}`
  });
  ok(res, { ok: true });
});

/* ---- ordens de serviço ---- */
const OS_STATUS = ['em_analise', 'em_andamento', 'aguardando_peca', 'finalizado', 'aguardando_pagamento', 'cancelado'];

route('POST', '/api/os/:id/status', 'os', async (req, res, user, params) => {
  const b = await readBody(req);
  const os = db.get('serviceOrders', params.id);
  if (!os) return notFound(res);
  const patch = { status: b.status };
  if (b.status === 'finalizado') patch.dataFinalizacao = b.data || domain.today();
  if (b.responsavelId !== undefined) patch.responsavelId = b.responsavelId;
  os.historico = os.historico || [];
  os.historico.push({ at: new Date().toISOString(), por: user.name, evento: 'Status → ' + b.status });
  db.update('serviceOrders', os.id, patch);
  audit(user, 'status', 'serviceOrders', os.id, `OS nº ${os.numero} → ${b.status}`);
  db.insert('audit', {
    at: new Date().toISOString(), userId: user.id, userName: user.name, action: 'timeline',
    entity: 'serviceOrders', entityId: os.id, clientId: os.clienteId, details: `OS nº ${os.numero}: status ${b.status}`
  });
  ok(res, db.get('serviceOrders', os.id));
});

route('POST', '/api/os/:id/envio', 'os', async (req, res, user, params) => {
  const b = await readBody(req);
  const os = db.get('serviceOrders', params.id);
  if (!os) return notFound(res);
  db.update('serviceOrders', os.id, { envioStatus: b.envioStatus, nfRetorno: b.nfRetorno !== undefined ? b.nfRetorno : os.nfRetorno });
  os.historico.push({ at: new Date().toISOString(), por: user.name, evento: 'Envio/entrega → ' + b.envioStatus });
  db.save();
  audit(user, 'envio', 'serviceOrders', os.id, `OS nº ${os.numero} → ${b.envioStatus}`);
  ok(res, { ok: true });
});

/**
 * Registro do pagamento de uma OS.
 * À vista → entra direto no caixa. Parcelado/boleto → gera contas a receber automáticas.
 */
route('POST', '/api/os/:id/payment', 'receivables', async (req, res, user, params) => {
  const b = await readBody(req);
  const os = db.get('serviceOrders', params.id);
  if (!os) return notFound(res);
  const cliente = db.get('clients', os.clienteId);
  const valor = Number(b.valor) || os.valorTotal || 0;
  if (b.parcelado) {
    const parcels = domain.generateInstallments(b.dataVenda || domain.today(), valor, b.parcelas, b.intervaloDias);
    for (const p of parcels) {
      db.insert('receivables', {
        clienteId: os.clienteId, origem: 'servico', refType: 'serviceOrders', refId: os.id,
        descricao: `OS nº ${os.numero} — parcela ${p.parcela}/${p.parcelas}`,
        forma: b.forma || 'boleto', valor: p.valor, vencimento: p.vencimento,
        status: 'aberto', parcela: p.parcela, parcelas: p.parcelas
      });
    }
    db.update('serviceOrders', os.id, { pagamentoStatus: 'parcelado', pagamento: { forma: b.forma, parcelas: b.parcelas, intervaloDias: b.intervaloDias, valor } });
  } else {
    db.insert('cashflow', {
      tipo: 'entrada', valor, data: b.data || domain.today(), conta: b.conta || 'principal',
      categoria: 'servico', origem: `OS nº ${os.numero}${cliente ? ' — ' + cliente.nome : ''}`,
      documento: b.documento || '', refType: 'serviceOrders', refId: os.id, descricao: 'Pagamento de serviço'
    });
    db.update('serviceOrders', os.id, { pagamentoStatus: 'pago', pagamento: { forma: b.forma || 'pix', valor, data: b.data || domain.today() } });
  }
  audit(user, 'pagamento', 'serviceOrders', os.id, `OS nº ${os.numero} — R$ ${valor.toFixed(2)} (${b.parcelado ? b.parcelas + 'x' : 'à vista'})`);
  db.insert('audit', {
    at: new Date().toISOString(), userId: user.id, userName: user.name, action: 'timeline',
    entity: 'serviceOrders', entityId: os.id, clientId: os.clienteId,
    details: `Pagamento registrado na OS nº ${os.numero}: R$ ${valor.toFixed(2)}`
  });
  ok(res, { ok: true });
});

/* ---- vendas ---- */
route('POST', '/api/sales', 'sales', async (req, res, user) => {
  const b = await readBody(req);
  const cliente = db.get('clients', b.clienteId);
  if (!cliente) return bad(res, 'Cliente é obrigatório');
  if (!Array.isArray(b.itens) || !b.itens.length) return bad(res, 'A venda precisa de ao menos um item');

  // Valida configurações e monta itens
  let valorTotal = 0, custoBaseTotal = 0;
  const itens = [];
  for (const i of b.itens) {
    const prod = db.get('products', i.productId);
    if (!prod) return bad(res, 'Produto inválido');
    const v = domain.validateConfig(prod.stage, i.comando, i.tucho);
    if (!v.ok) return bad(res, v.error);
    const qtd = Math.max(1, Number(i.qtd) || 1);
    const unit = Number(i.valorUnit) || prod.preco || 0;
    const tot = qtd * unit;
    valorTotal += tot;
    custoBaseTotal += qtd * (prod.custoBase || 0);
    itens.push({ productId: prod.id, produto: prod.nome, tipo: prod.tipo, stage: prod.stage, comando: i.comando, tucho: String(i.tucho), qtd, valorUnit: unit, total: tot });
  }

  const pagamento = b.pagamento || {};
  pagamento.taxa = Number(pagamento.taxa) || 0;
  pagamento.valorLiquido = valorTotal - pagamento.taxa;

  const numero = db.nextNumber('pedido', 1);
  const sale = db.insert('sales', {
    numero, clienteId: cliente.id,
    cidade: b.cidade || cliente.cidade || '', estado: b.estado || cliente.estado || '',
    dataPedido: b.dataPedido || domain.today(),
    previsaoEntrega: b.previsaoEntrega || '', dataEnvio: null,
    itens, valorTotal,
    custoBaseTotal,
    custosAdicionais: b.custosAdicionais || [], // [{desc, valor}] — frete grátis, brindes extras...
    pagamento,
    observacoes: b.observacoes || '',
    status: 'nao_produzido' // nao_produzido → preparacao → usinagem → montagem → pronto → enviado → entregue
  });

  // Ordens de produção (uma por unidade de cabeçote) com checklist automático.
  for (const item of itens) {
    for (let u = 0; u < item.qtd; u++) {
      db.insert('productionOrders', {
        saleId: sale.id, pedidoNumero: numero, clienteNome: cliente.nome,
        productId: item.productId, produto: item.produto,
        tipo: item.tipo, stage: item.stage, comando: item.comando, tucho: item.tucho,
        checklist: domain.productionChecklist(item.tipo, item.stage, item.comando, item.tucho),
        status: 'nao_produzido', responsavelId: null,
        previsaoEntrega: sale.previsaoEntrega
      });
    }
  }

  // Financeiro: contas a receber / caixa conforme forma de pagamento.
  const formaAVista = ['pix', 'dinheiro'].includes(pagamento.forma) && pagamento.condicao !== 'parcelado';
  if (pagamento.condicao === 'parcelado' && (pagamento.forma === 'boleto' || pagamento.forma === 'cheque')) {
    const parcels = domain.generateInstallments(sale.dataPedido, valorTotal, pagamento.parcelas, pagamento.intervaloDias);
    for (const p of parcels) {
      db.insert('receivables', {
        clienteId: cliente.id, origem: 'venda', refType: 'sales', refId: sale.id,
        descricao: `Pedido nº ${numero} — parcela ${p.parcela}/${p.parcelas}`,
        forma: pagamento.forma, valor: p.valor, vencimento: p.vencimento,
        status: 'aberto', parcela: p.parcela, parcelas: p.parcelas
      });
    }
  } else if (pagamento.forma === 'cartao' || pagamento.forma === 'link') {
    db.insert('receivables', {
      clienteId: cliente.id, origem: 'venda', refType: 'sales', refId: sale.id,
      descricao: `Pedido nº ${numero} — ${pagamento.forma} ${pagamento.parcelas || 1}x (líquido de taxa)`,
      forma: pagamento.forma, valor: pagamento.valorLiquido,
      vencimento: pagamento.dataPrevRecebimento || domain.addDays(sale.dataPedido, 30),
      status: 'aberto', parcela: 1, parcelas: 1, taxa: pagamento.taxa
    });
    if (pagamento.taxa > 0) {
      db.insert('cashflow', {
        tipo: 'saida', valor: pagamento.taxa, data: sale.dataPedido, conta: 'operadora',
        categoria: 'taxa_cartao', origem: `Pedido nº ${numero}`, documento: '',
        refType: 'sales', refId: sale.id, descricao: 'Taxa da operadora (cartão/link)'
      });
    }
  } else if (formaAVista) {
    db.insert('cashflow', {
      tipo: 'entrada', valor: valorTotal, data: sale.dataPedido, conta: b.conta || 'principal',
      categoria: 'venda_cabecote', origem: `Pedido nº ${numero} — ${cliente.nome}`,
      documento: '', refType: 'sales', refId: sale.id, descricao: 'Venda à vista'
    });
    db.insert('receivables', {
      clienteId: cliente.id, origem: 'venda', refType: 'sales', refId: sale.id,
      descricao: `Pedido nº ${numero} — à vista (${pagamento.forma})`,
      forma: pagamento.forma, valor: valorTotal, vencimento: sale.dataPedido,
      status: 'paga', dataRecebimento: sale.dataPedido, parcela: 1, parcelas: 1
    });
  } else {
    // fallback: um recebível único no vencimento informado
    db.insert('receivables', {
      clienteId: cliente.id, origem: 'venda', refType: 'sales', refId: sale.id,
      descricao: `Pedido nº ${numero}`, forma: pagamento.forma || 'outro',
      valor: valorTotal, vencimento: pagamento.vencimento || domain.addDays(sale.dataPedido, 7),
      status: 'aberto', parcela: 1, parcelas: 1
    });
  }

  audit(user, 'criou', 'sales', sale.id, `Pedido nº ${numero} — ${cliente.nome} — R$ ${valorTotal.toFixed(2)}`);
  db.insert('audit', {
    at: new Date().toISOString(), userId: user.id, userName: user.name, action: 'timeline',
    entity: 'sales', entityId: sale.id, clientId: cliente.id,
    details: `Pedido nº ${numero} registrado (R$ ${valorTotal.toFixed(2)})`
  });
  ok(res, sale);
});

const SALE_STATUS = ['nao_produzido', 'preparacao', 'usinagem', 'montagem', 'pronto', 'enviado', 'entregue', 'cancelado'];
route('POST', '/api/sales/:id/status', 'sales', async (req, res, user, params) => {
  const b = await readBody(req);
  const sale = db.get('sales', params.id);
  if (!sale) return notFound(res);
  if (!SALE_STATUS.includes(b.status)) return bad(res, 'Status inválido');
  const patch = { status: b.status };
  if (b.status === 'enviado') patch.dataEnvio = b.data || domain.today();
  db.update('sales', sale.id, patch);
  audit(user, 'status', 'sales', sale.id, `Pedido nº ${sale.numero} → ${b.status}`);
  ok(res, db.get('sales', sale.id));
});

route('GET', '/api/sales/:id/result', 'finance_sensitive', async (req, res, user, params) => {
  const sale = db.get('sales', params.id);
  if (!sale) return notFound(res);
  ok(res, domain.saleResult(sale));
});

/* ---- ordens de produção ---- */
route('POST', '/api/productionOrders/:id/check', 'production', async (req, res, user, params) => {
  const b = await readBody(req);
  const po = db.get('productionOrders', params.id);
  if (!po) return notFound(res);
  if (po.checklist[b.index] === undefined) return bad(res, 'Item inválido');
  po.checklist[b.index].done = !!b.done;
  po.checklist[b.index].por = user.name;
  po.checklist[b.index].em = new Date().toISOString();
  db.save();
  ok(res, po);
});

route('POST', '/api/productionOrders/:id/status', 'production', async (req, res, user, params) => {
  const b = await readBody(req);
  const po = db.get('productionOrders', params.id);
  if (!po) return notFound(res);
  const patch = { status: b.status };
  if (b.responsavelId !== undefined) patch.responsavelId = b.responsavelId;
  db.update('productionOrders', po.id, patch);
  // Ao concluir a produção, dá baixa automática dos componentes no estoque próprio.
  if (b.status === 'pronto' && !po.estoqueBaixado) {
    const cascoCat = po.tipo === 'crossflow' ? 'casco_crossflow' : 'casco_unilateral';
    const wanted = [
      it => it.categoria === cascoCat,
      it => it.categoria === 'valvula' && /admiss/i.test(it.nome),
      it => it.categoria === 'valvula' && /escape/i.test(it.nome),
      it => it.categoria === 'mola',
      it => it.categoria === 'prato',
      it => it.categoria === 'trava',
      it => it.categoria === (po.tucho === '37' ? 'tucho37' : 'tucho35'),
      it => it.categoria === 'comando' && it.nome.includes(po.comando)
    ];
    for (const match of wanted) {
      const item = db.all('stockItems').find(match);
      if (item) moveStock(item.id, 'saida', 1, 'productionOrders', po.id, `Produção pedido nº ${po.pedidoNumero}`, user);
    }
    db.update('productionOrders', po.id, { estoqueBaixado: true });
  }
  audit(user, 'status', 'productionOrders', po.id, `Ordem de produção #${po.id} → ${b.status}`);
  ok(res, db.get('productionOrders', po.id));
});

/* ---- estoque: ajustes manuais ---- */
route('POST', '/api/stock/:id/move', 'stock', async (req, res, user, params) => {
  const b = await readBody(req);
  const item = moveStock(Number(params.id), b.tipo === 'entrada' ? 'entrada' : 'saida', Math.abs(Number(b.qtd) || 0), 'manual', null, b.obs, user);
  if (!item) return notFound(res);
  ok(res, item);
});

/* ---- compras ---- */
route('POST', '/api/purchases', 'purchases', async (req, res, user) => {
  const b = await readBody(req);
  const forn = b.fornecedorId ? db.get('suppliers', b.fornecedorId) : null;
  const valor = Number(b.valor) || (b.itens || []).reduce((s, i) => s + (Number(i.total) || 0), 0);
  const rec = db.insert('purchases', {
    fornecedorId: forn ? forn.id : null, fornecedorNome: forn ? forn.nome : (b.fornecedorNome || ''),
    data: b.data || domain.today(),
    itens: b.itens || [], valor,
    formaPagamento: b.formaPagamento || '',
    vencimento: b.vencimento || '',
    parcelas: Number(b.parcelas) || 1,
    documentoTipo: b.documentoTipo || 'sem_documento', // nf | recibo | comprovante | sem_documento | outro
    documentoNumero: b.documentoNumero || '',
    categoria: b.categoria || 'componentes',
    observacoes: b.observacoes || '',
    vinculo: b.vinculo || { tipo: 'uso_interno', refId: null }, // cliente | orcamento | os | pedido | producao | uso_interno
    status: 'registrada'
  });

  // Contas a pagar (parceladas se necessário), com agenda de sexta-feira.
  if (b.gerarContasPagar !== false && valor > 0) {
    const venc = b.vencimento || domain.addDays(rec.data, 30);
    const parcels = rec.parcelas > 1
      ? domain.generateInstallments(rec.data, valor, rec.parcelas, b.intervaloDias || 30)
      : [{ parcela: 1, parcelas: 1, vencimento: venc, valor }];
    for (const p of parcels) {
      const imediato = b.tipoPagamento === 'imediato';
      db.insert('payables', {
        descricao: `Compra ${rec.fornecedorNome || ''} ${rec.documentoNumero ? 'NF ' + rec.documentoNumero : ''}`.trim()
          + (p.parcelas > 1 ? ` — parcela ${p.parcela}/${p.parcelas}` : ''),
        categoria: rec.categoria, fornecedorId: rec.fornecedorId,
        valor: p.valor, vencimento: p.vencimento,
        tipoPagamento: imediato ? 'imediato' : 'programado',
        dataProgramada: imediato ? rec.data : domain.previousFriday(p.vencimento),
        status: 'aberto', refType: 'purchases', refId: rec.id, documento: rec.documentoNumero
      });
    }
  }

  // Entrada opcional no estoque próprio.
  if (Array.isArray(b.entradasEstoque)) {
    for (const e of b.entradasEstoque) {
      if (e.itemId && e.qtd > 0) moveStock(Number(e.itemId), 'entrada', Number(e.qtd), 'purchases', rec.id, 'Compra', user);
    }
  }

  audit(user, 'criou', 'purchases', rec.id, `Compra ${rec.fornecedorNome} — R$ ${valor.toFixed(2)} (${rec.documentoTipo})`);
  ok(res, rec);
});

/** Leitura automática de NF-e (XML) — sempre com conferência antes de confirmar. */
route('POST', '/api/purchases/parse-nfe', 'purchases', async (req, res, user) => {
  const b = await readBody(req);
  if (!b.xml) return bad(res, 'Envie o conteúdo XML da NF-e');
  const parsed = parseNfeXml(b.xml);
  if (!parsed || (!parsed.fornecedorNome && !parsed.numeroNF)) return bad(res, 'Não foi possível interpretar o XML. Confira o arquivo ou lance manualmente.');
  const forn = db.all('suppliers').find(s => s.cnpj && s.cnpj.replace(/\D/g, '') === parsed.fornecedorCnpj);
  ok(res, Object.assign(parsed, { fornecedorId: forn ? forn.id : null }));
});

/* ---- fornecedores: fechamento mensal ---- */
route('GET', '/api/suppliers/:id/open', 'suppliers', async (req, res, user, params) => {
  const exps = db.all('supplierExpenses').filter(e => e.fornecedorId === Number(params.id) && e.status === 'aberto');
  ok(res, { despesas: exps, total: exps.reduce((s, e) => s + e.valor, 0) });
});

/**
 * Fechamento da fatura mensal do fornecedor: compara o valor cobrado com os
 * registros internos e aponta divergência antes de permitir o pagamento.
 */
route('POST', '/api/supplierInvoices', 'suppliers', async (req, res, user) => {
  const b = await readBody(req);
  const forn = db.get('suppliers', b.fornecedorId);
  if (!forn) return bad(res, 'Fornecedor inválido');
  const exps = db.all('supplierExpenses').filter(e => e.fornecedorId === forn.id && e.status === 'aberto');
  const valorRegistrado = exps.reduce((s, e) => s + e.valor, 0);
  const valorCobrado = Number(b.valorCobrado) || 0;
  const diferenca = valorCobrado - valorRegistrado;
  const rec = db.insert('supplierInvoices', {
    fornecedorId: forn.id, fornecedorNome: forn.nome,
    mes: b.mes || domain.today().slice(0, 7),
    valorCobrado, valorRegistrado, diferenca,
    status: Math.abs(diferenca) < 0.005 ? 'conferida' : 'divergente',
    expenseIds: exps.map(e => e.id),
    vencimento: b.vencimento || '',
    observacoes: b.observacoes || ''
  });
  audit(user, 'fechamento', 'supplierInvoices', rec.id,
    `Fatura ${forn.nome} ${rec.mes}: cobrado R$ ${valorCobrado.toFixed(2)} × registrado R$ ${valorRegistrado.toFixed(2)}`
    + (rec.status === 'divergente' ? ` — DIVERGÊNCIA R$ ${diferenca.toFixed(2)}` : ''));
  ok(res, rec);
});

/** Confirma a fatura (após conferência) e gera a conta a pagar na agenda de sexta. */
route('POST', '/api/supplierInvoices/:id/confirm', 'suppliers', async (req, res, user, params) => {
  const b = await readBody(req);
  const inv = db.get('supplierInvoices', params.id);
  if (!inv) return notFound(res);
  if (inv.payableId) return bad(res, 'Fatura já confirmada');
  const valorFinal = Number(b.valorFinal) || inv.valorCobrado;
  for (const eid of inv.expenseIds) db.update('supplierExpenses', eid, { status: 'faturado', faturaId: inv.id });
  const venc = b.vencimento || inv.vencimento || domain.addDays(domain.today(), 10);
  const payable = db.insert('payables', {
    descricao: `Fatura mensal ${inv.fornecedorNome} — ${inv.mes}`,
    categoria: 'componentes', fornecedorId: inv.fornecedorId,
    valor: valorFinal, vencimento: venc,
    tipoPagamento: 'programado', dataProgramada: domain.previousFriday(venc),
    status: 'aberto', refType: 'supplierInvoices', refId: inv.id
  });
  db.update('supplierInvoices', inv.id, { status: 'confirmada', payableId: payable.id, valorFinal });
  audit(user, 'confirmou', 'supplierInvoices', inv.id, `Fatura ${inv.fornecedorNome} ${inv.mes} — R$ ${valorFinal.toFixed(2)}`);
  ok(res, { ok: true, payableId: payable.id });
});

/* ---- contas a pagar ---- */
route('POST', '/api/payables', 'payables', async (req, res, user) => {
  const b = await readBody(req);
  if (!b.descricao || !b.valor || !b.vencimento) return bad(res, 'Descrição, valor e vencimento são obrigatórios');
  const imediato = b.tipoPagamento === 'imediato';
  const rec = db.insert('payables', {
    descricao: b.descricao, categoria: b.categoria || 'despesa_operacional',
    fornecedorId: b.fornecedorId || null,
    valor: Number(b.valor), vencimento: b.vencimento,
    tipoPagamento: imediato ? 'imediato' : 'programado',
    dataProgramada: imediato ? (b.data || domain.today()) : domain.previousFriday(b.vencimento),
    status: 'aberto', documento: b.documento || '', observacoes: b.observacoes || '',
    recurringId: b.recurringId || null
  });
  audit(user, 'criou', 'payables', rec.id, `${rec.descricao} — R$ ${rec.valor.toFixed(2)} (venc. ${rec.vencimento}, pgto ${rec.dataProgramada})`);
  // Pagamento imediato já sai do caixa na data em que ocorreu.
  if (imediato && b.pagarAgora) {
    db.update('payables', rec.id, { status: 'pago', dataPagamento: rec.dataProgramada });
    db.insert('cashflow', {
      tipo: 'saida', valor: rec.valor, data: rec.dataProgramada, conta: b.conta || 'principal',
      categoria: rec.categoria, origem: rec.descricao, documento: rec.documento,
      refType: 'payables', refId: rec.id, descricao: 'Pagamento imediato'
    });
  }
  ok(res, rec);
});

route('POST', '/api/payables/:id/pay', 'payables', async (req, res, user, params) => {
  const b = await readBody(req);
  const p = db.get('payables', params.id);
  if (!p) return notFound(res);
  if (p.status === 'pago') return bad(res, 'Conta já paga');
  const data = b.data || domain.today();
  db.update('payables', p.id, { status: 'pago', dataPagamento: data });
  db.insert('cashflow', {
    tipo: 'saida', valor: p.valor, data, conta: b.conta || 'principal',
    categoria: p.categoria, origem: p.descricao, documento: p.documento || '',
    refType: 'payables', refId: p.id, descricao: 'Pagamento de conta'
  });
  audit(user, 'pagou', 'payables', p.id, `${p.descricao} — R$ ${p.valor.toFixed(2)} em ${data}`);
  ok(res, { ok: true });
});

/** Agenda de sexta-feira: contas agrupadas por data programada. */
route('GET', '/api/payables/agenda', 'payables', async (req, res) => {
  const abertos = withOverdue(db.all('payables')).filter(p => p.status !== 'pago');
  const grupos = {};
  for (const p of abertos) {
    const d = p.dataProgramada || p.vencimento;
    (grupos[d] = grupos[d] || []).push(p);
  }
  const dias = Object.keys(grupos).sort().map(d => ({
    data: d,
    total: grupos[d].reduce((s, p) => s + p.valor, 0),
    contas: grupos[d]
  }));
  ok(res, dias);
});

/* ---- contas a receber ---- */
route('POST', '/api/receivables/generate', 'receivables', async (req, res, user) => {
  const b = await readBody(req);
  const cliente = db.get('clients', b.clienteId);
  if (!cliente) return bad(res, 'Cliente é obrigatório');
  const parcels = domain.generateInstallments(b.dataVenda || domain.today(), b.valor, b.parcelas, b.intervaloDias);
  const out = [];
  for (const p of parcels) {
    out.push(db.insert('receivables', {
      clienteId: cliente.id, origem: b.origem || 'venda', refType: b.refType || null, refId: b.refId || null,
      descricao: `${b.descricao || 'Boleto'} — parcela ${p.parcela}/${p.parcelas}`,
      forma: b.forma || 'boleto', valor: p.valor, vencimento: p.vencimento,
      status: 'aberto', parcela: p.parcela, parcelas: p.parcelas
    }));
  }
  audit(user, 'gerou', 'receivables', null, `${parcels.length} parcela(s) de ${cliente.nome} — total R$ ${Number(b.valor).toFixed(2)}`);
  ok(res, out);
});

route('POST', '/api/receivables/:id/receive', 'receivables', async (req, res, user, params) => {
  const b = await readBody(req);
  const r = db.get('receivables', params.id);
  if (!r) return notFound(res);
  if (r.status === 'paga') return bad(res, 'Parcela já recebida');
  const data = b.data || domain.today();
  db.update('receivables', r.id, { status: 'paga', dataRecebimento: data });
  const categoria = r.origem === 'servico' ? 'servico' : 'venda_cabecote';
  db.insert('cashflow', {
    tipo: 'entrada', valor: r.valor, data, conta: b.conta || 'principal',
    categoria, origem: r.descricao, documento: '',
    refType: 'receivables', refId: r.id, descricao: 'Recebimento'
  });
  audit(user, 'recebeu', 'receivables', r.id, `${r.descricao} — R$ ${r.valor.toFixed(2)} em ${data}`);
  ok(res, { ok: true });
});

route('POST', '/api/receivables/:id/cancel', 'receivables', async (req, res, user, params) => {
  const r = db.get('receivables', params.id);
  if (!r) return notFound(res);
  db.update('receivables', r.id, { status: 'cancelada' });
  audit(user, 'cancelou', 'receivables', r.id, r.descricao);
  ok(res, { ok: true });
});

/* ---- financeiro: projeção e DRE ---- */
route('GET', '/api/projection', 'projection', async (req, res) => ok(res, domain.projection()));
route('GET', '/api/dre', 'dre', async (req, res, user, params, query) => {
  ok(res, domain.dre(query.mes || domain.today().slice(0, 7)));
});

/* ---- RH ---- */
route('POST', '/api/hrPayments/:id/pay', 'hr', async (req, res, user, params) => {
  const b = await readBody(req);
  const h = db.get('hrPayments', params.id);
  if (!h) return notFound(res);
  if (h.status === 'pago') return bad(res, 'Já pago');
  const data = b.data || domain.today();
  const cat = h.tipo === 'salario' ? 'salarios' : h.tipo === 'beneficio' ? 'beneficios' : 'salarios';
  db.update('hrPayments', h.id, { status: 'pago', dataPagamento: data });
  db.insert('cashflow', {
    tipo: 'saida', valor: h.valor, data, conta: b.conta || 'principal',
    categoria: cat, origem: `RH — ${h.descricao || h.tipo}`, documento: '',
    refType: 'hrPayments', refId: h.id, descricao: 'Pagamento de RH'
  });
  audit(user, 'pagou', 'hrPayments', h.id, `${h.tipo} — R$ ${h.valor.toFixed(2)}`);
  ok(res, { ok: true });
});

/* ---- rastreabilidade: linha do tempo de um cabeçote/entidade ---- */
route('GET', '/api/trace/:entity/:id', 'dashboard', async (req, res, user, params) => {
  const list = db.all('audit').filter(a =>
    (a.entity === params.entity && String(a.entityId) === String(params.id)) ||
    (a.action === 'timeline' && a.entity === params.entity && String(a.entityId) === String(params.id))
  ).sort((a, b) => a.at < b.at ? -1 : 1);
  ok(res, list);
});

/* ===================================================================== */
/* CRUD genérico                                                          */
/* ===================================================================== */

async function handleRest(req, res, user, collection, id) {
  const cfg = REST[collection];
  if (!cfg) return notFound(res);
  const method = req.method;
  const needed = (method === 'GET') ? cfg.perm : (cfg.writePerm || cfg.perm);
  if (!can(user, needed)) return forbidden(res, `Sem permissão: ${cfg.label}`);

  if (method === 'GET' && !id) {
    let list = db.all(collection);
    if (collection === 'receivables' || collection === 'payables') list = withOverdue(list);
    return ok(res, list.map(r => sanitize(user, collection, r)));
  }
  if (method === 'GET') {
    const rec = db.get(collection, id);
    return rec ? ok(res, sanitize(user, collection, rec)) : notFound(res);
  }
  if (method === 'POST') {
    const body = await readBody(req);
    delete body.id;
    const rec = db.insert(collection, body);
    audit(user, 'criou', collection, rec.id, cfg.label + (body.nome ? ': ' + body.nome : body.titulo ? ': ' + body.titulo : ' #' + rec.id));
    return ok(res, rec);
  }
  if (method === 'PUT') {
    const body = await readBody(req);
    delete body.id; delete body.createdAt;
    const before = db.get(collection, id);
    if (!before) return notFound(res);
    const changed = Object.keys(body).filter(k => JSON.stringify(before[k]) !== JSON.stringify(body[k]));
    const rec = db.update(collection, id, body);
    audit(user, 'alterou', collection, rec.id, `${cfg.label} #${rec.id}` + (changed.length ? ` — campos: ${changed.join(', ')}` : ''));
    return ok(res, rec);
  }
  if (method === 'DELETE') {
    const rec = db.get(collection, id);
    if (!rec) return notFound(res);
    // Entidades com efeitos financeiros/históricos não são apagadas, apenas canceladas.
    if (['sales', 'quotes', 'serviceOrders', 'cashflow', 'receivables', 'payables', 'supplierInvoices'].includes(collection)) {
      return bad(res, 'Este registro não pode ser excluído — use cancelamento/estorno para manter a rastreabilidade');
    }
    db.remove(collection, id);
    audit(user, 'excluiu', collection, Number(id), cfg.label + ' #' + id);
    return ok(res, { ok: true });
  }
  notFound(res);
}

/* ===================================================================== */
/* Servidor                                                              */
/* ===================================================================== */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json'
};

function serveStatic(req, res, urlPath) {
  let p = urlPath === '/' ? '/index.html' : urlPath;
  p = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(PUBLIC_DIR, p);
  if (!file.startsWith(PUBLIC_DIR)) return notFound(res);
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA: qualquer rota desconhecida devolve o index.
      if (!path.extname(p)) {
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, d2) => {
          if (e2) return notFound(res);
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(d2);
        });
      }
      return notFound(res);
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const urlPath = decodeURIComponent(u.pathname);
  const query = Object.fromEntries(u.searchParams.entries());

  try {
    if (!urlPath.startsWith('/api/')) return serveStatic(req, res, urlPath);

    // Rotas especiais primeiro.
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = urlPath.match(r.regex);
      if (!m) continue;
      let user = null;
      if (r.perm !== null) {
        user = authUser(req);
        if (!user) return send(res, 401, { error: 'Sessão expirada — faça login novamente' });
        if (!can(user, r.perm)) return forbidden(res);
      }
      return await r.handler(req, res, user, m.groups || {}, query);
    }

    // CRUD genérico: /api/<collection>[/<id>]
    const parts = urlPath.split('/').filter(Boolean); // ['api', collection, id?]
    if (parts.length >= 2 && REST[parts[1]]) {
      const user = authUser(req);
      if (!user) return send(res, 401, { error: 'Sessão expirada — faça login novamente' });
      return await handleRest(req, res, user, parts[1], parts[2]);
    }

    notFound(res);
  } catch (e) {
    console.error(req.method, urlPath, e);
    send(res, 500, { error: 'Erro interno: ' + e.message });
  }
});

process.on('SIGINT', () => { db.persistNow(); process.exit(0); });
process.on('SIGTERM', () => { db.persistNow(); process.exit(0); });

server.listen(PORT, () => {
  console.log(`Jaques Motorsport — Sistema de Gestão rodando em http://localhost:${PORT}`);
  console.log('Login inicial: admin / admin123 (troque a senha no primeiro acesso)');
});
