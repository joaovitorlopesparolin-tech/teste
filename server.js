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
const os = require('os');

const db = require('./lib/db');
const domain = require('./lib/domain');
const ai = require('./lib/ai');
const xlsx = require('./lib/xlsx');
const sync = require('./lib/sync');
const contaazul = require('./lib/contaazul');
const casync = require('./lib/casync');
const { seedIfEmpty, hashPassword, checkPassword, isLegacyHash, MODULES } = require('./lib/seed');

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
/* Escapa texto para as poucas páginas HTML montadas aqui no servidor
   (o retorno da autorização da Conta Azul). */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  // Expiração deslizante: a sessão vale enquanto for usada (renova a cada acesso,
  // gravado no máximo 1x/hora para não inflar o arquivo de dados).
  const now = Date.now();
  if (!sess.lastUsed || now - new Date(sess.lastUsed).getTime() > 3600e3) {
    db.update('sessions', sess.id, { lastUsed: new Date(now).toISOString() });
  }
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
  if (!record) return record;
  const sensivel = can(user, 'finance_sensitive');
  if (sensivel) return record;
  const financeiro = can(user, 'cashflow') || can(user, 'receivables') || can(user, 'payables');
  const r = Object.assign({}, record);

  // Custos, margens e salários: só para 'dados financeiros sensíveis'
  if (collection === 'products') { delete r.custoBase; }
  if (collection === 'sales') { delete r.custoBaseTotal; delete r.custosAdicionais; delete r.resultado; }
  if (collection === 'employees') { delete r.salario; delete r.beneficios; }
  if (collection === 'stockItems') { delete r.custoUnit; }

  // Nenhum acesso financeiro (ex.: Produção): também não vê preços, totais
  // nem condições de pagamento — só o conteúdo técnico/operacional.
  if (!financeiro) {
    const limpaItens = itens => (itens || []).map(i => {
      const x = Object.assign({}, i);
      delete x.valorUnit; delete x.total; delete x.preco;
      return x;
    });
    if (collection === 'sales' || collection === 'serviceOrders' || collection === 'quotes') {
      delete r.valorTotal; delete r.total; delete r.pagamento; delete r.custosAdicionais;
      if (r.itens) r.itens = limpaItens(r.itens);
    }
    if (collection === 'products') { delete r.preco; }
    if (collection === 'serviceCatalog') { delete r.preco; }
    if (collection === 'stockItems') { delete r.custoUnit; }
  }
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
  freights: { perm: 'payables', label: 'Frete' },
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

/**
 * Sugere um responsável: primeiro usuário ativo cujo perfil tem a permissão
 * pedida (preferindo perfis específicos — Financeiro, Produção — antes do
 * Administrador, que fica como último recurso).
 */
function suggestAssignee(perm) {
  const roles = db.all('roles');
  const users = db.all('users').filter(u => u.active);
  const roleOf = u => roles.find(r => r.id === u.roleId);
  const specific = users.find(u => {
    const r = roleOf(u);
    return r && r.permissions.includes(perm) && !r.permissions.includes('admin');
  });
  if (specific) return specific.id;
  const admin = users.find(u => {
    const r = roleOf(u);
    return r && r.permissions.includes('admin');
  });
  return admin ? admin.id : null;
}

/**
 * Avisos das contas recorrentes (COPEL, Sanepar, consórcio…):
 * a pendência nasce alguns dias ANTES do vencimento (padrão 4, configurável
 * por conta), já com dono sugerido (perfil financeiro) e link do site.
 * A baixa é automática quando o boleto do mês é cadastrado em Contas a pagar.
 */
function ensureRecurringTasks() {
  const hoje = domain.today();
  const nextM = new Date(hoje + 'T12:00:00');
  nextM.setMonth(nextM.getMonth() + 1);
  const meses = [hoje.slice(0, 7), nextM.toISOString().slice(0, 7)];
  for (const rec of db.all('recurring').filter(r => r.ativo)) {
    const aviso = Number(rec.diasAviso) || 4;
    for (const month of meses) {
      const due = `${month}-${String(rec.diaVencimento || 10).padStart(2, '0')}`;
      if (domain.addDays(due, -aviso) > hoje) continue;   // ainda é cedo para avisar
      if (due < domain.addDays(hoje, -45)) continue;      // vencimento antigo demais
      if (db.all('tasks').some(t => t.recurringId === rec.id && t.refMonth === month)) continue;
      db.insert('tasks', {
        titulo: `Pagar/emitir boleto — ${rec.nome} (vence dia ${rec.diaVencimento || 10})`,
        descricao: rec.instrucao || '',
        prioridade: 'urgente',
        assigneeId: suggestAssignee('payables'),
        status: 'aberta',
        recurringId: rec.id,
        refMonth: month,
        due,
        link: rec.link || '',
        origem: 'conta recorrente'
      });
    }
  }
}

/** Cadastrou o boleto do mês em Contas a pagar → a pendência se conclui sozinha. */
function completeRecurringTask(recurringId, vencimento) {
  if (!recurringId) return;
  const month = String(vencimento || '').slice(0, 7);
  for (const t of db.all('tasks').filter(t =>
    t.recurringId === Number(recurringId) && t.status === 'aberta' && (!month || t.refMonth <= month))) {
    db.update('tasks', t.id, { status: 'concluida', concluidaEm: domain.today(), origem: 'conta recorrente · baixa automática' });
  }
}

/* ===================================================================== */
/* Vínculos de um cadastro                                               */
/* ===================================================================== */

/**
 * Onde cada cadastro é referenciado. É esta tabela que permite responder
 * "dá para apagar?" sem sair caçando à mão em cada tela — e que garante
 * que apagar um cliente duplicado nunca leve junto a venda dele.
 * [coleção, campo, rótulo humano]
 */
const VINCULOS = {
  clients: [
    ['sales', 'clienteId', 'venda(s)'], ['quotes', 'clienteId', 'orçamento(s)'],
    ['serviceOrders', 'clienteId', 'ordem(ns) de serviço'], ['headEntries', 'clienteId', 'entrada(s) de cabeçote'],
    ['assets', 'clienteId', 'bem(ns) guardado(s)'], ['receivables', 'clienteId', 'conta(s) a receber'],
    ['freights', 'clienteId', 'frete(s)'], ['supplierExpenses', 'clienteId', 'gasto(s) de fornecedor']
  ],
  suppliers: [
    ['purchases', 'fornecedorId', 'compra(s)'], ['payables', 'fornecedorId', 'conta(s) a pagar'],
    ['supplierExpenses', 'fornecedorId', 'gasto(s) do mês'], ['supplierInvoices', 'fornecedorId', 'fatura(s) mensal(is)']
  ],
  products: [
    ['sales', 'itens.productId', 'venda(s)'], ['productionOrders', 'productId', 'ordem(ns) de produção'],
    ['models3d', 'produtoId', 'modelo(s) 3D']
  ],
  stockItems: [
    ['stockMoves', 'itemId', 'movimentação(ões) de estoque'], ['sales', 'itens.stockItemId', 'venda(s)']
  ],
  employees: [['hrPayments', 'employeeId', 'lançamento(s) de RH']],
  serviceCatalog: [['quotes', 'itens.catalogId', 'orçamento(s)'], ['serviceOrders', 'itens.catalogId', 'ordem(ns) de serviço']],
  headEntries: [['quotes', 'entryId', 'orçamento(s)'], ['serviceOrders', 'entryId', 'ordem(ns) de serviço'], ['assets', 'entryId', 'bem(ns)']],
  assets: [['headEntries', 'assetId', 'entrada(s)']]
};

/** Cadastros que aceitam ser inativados em vez de apagados. */
const INATIVAVEIS = { clients: 'ativo', suppliers: 'ativo', products: 'ativo', employees: 'ativo', serviceCatalog: 'ativo', stockItems: 'ativo' };

/** Conta as referências a um registro. Devolve [{colecao, rotulo, qtd}]. */
function vinculosDe(colecao, id) {
  const regras = VINCULOS[colecao] || [];
  const alvo = Number(id);
  const out = [];
  for (const [col, campo, rotulo] of regras) {
    let qtd;
    if (campo.includes('.')) {
      const [lista, chave] = campo.split('.');
      qtd = db.all(col).filter(r => (r[lista] || []).some(i => Number(i[chave]) === alvo)).length;
    } else {
      qtd = db.all(col).filter(r => Number(r[campo]) === alvo).length;
    }
    if (qtd) out.push({ colecao: col, rotulo, qtd });
  }
  return out;
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

/** Acesso ao bloco financeiro (faturamento, contas, caixa): perfis com
    financeiro ou dados sensíveis. Produção fica só com o operacional —
    os valores nem são calculados nem enviados. */
function canFinanceiro(user) {
  return can(user, 'cashflow') || can(user, 'finance_sensitive');
}

function dashboard(user) {
  const t = domain.today();
  const month = t.slice(0, 7);
  const inMonth = d => d && String(d).slice(0, 7) === month;

  const sales = db.all('sales').filter(s => s.status !== 'cancelado');
  const os = db.all('serviceOrders');
  const salesMonth = sales.filter(s => inMonth(s.dataPedido));
  const osMonth = os.filter(o => inMonth(o.dataFinalizacao) && o.status !== 'cancelado');

  /* Bloco operacional — o que todo perfil com dashboard enxerga */
  const base = {
    mes: month,
    vendasMes: { qtd: salesMonth.length },
    servicosMes: { qtd: osMonth.length },
    orcamentosAguardando: db.all('quotes').filter(q => q.status === 'aberto').length,
    servicosAndamento: os.filter(o => ['em_analise', 'em_andamento', 'aguardando_peca'].includes(o.status)).length,
    cabecotesAguardandoProducao: db.all('productionOrders').filter(p => p.status === 'nao_produzido').length,
    pedidosAguardandoEnvio: sales.filter(s => ['pronto'].includes(s.status)).length,
    pedidosNaoEntregues: sales.filter(s => !['entregue', 'cancelado'].includes(s.status)).length,
    bensDeClientes: db.all('assets').filter(a => a.status === 'na_empresa').length,
    minhasPendencias: db.all('tasks').filter(tk => tk.status === 'aberta' && (!tk.assigneeId || tk.assigneeId === user.id))
      .sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1).slice(0, 20)
  };

  /* Bloco financeiro — calculado apenas para quem pode ver */
  if (canFinanceiro(user)) {
    const receiv = withOverdue(db.all('receivables'));
    const pay = withOverdue(db.all('payables'));
    const flows = db.all('cashflow');
    const faturamentoVendas = salesMonth.reduce((s, v) => s + (v.valorTotal || 0), 0);
    const faturamentoServicos = osMonth.reduce((s, o) => s + (o.valorTotal || 0), 0);
    const fat = faturamentoVendas + faturamentoServicos;
    base.faturamentoMes = fat;
    base.vendasMes.valor = faturamentoVendas;
    base.servicosMes.valor = faturamentoServicos;
    base.contasReceber = receiv.filter(r => r.status === 'aberto').reduce((s, r) => s + r.valor, 0);
    base.contasPagar = pay.filter(p => p.status === 'aberto').reduce((s, p) => s + p.valor, 0);
    base.vencidosReceber = receiv.filter(r => r.status === 'vencida').reduce((s, r) => s + r.valor, 0);
    base.vencidosPagar = pay.filter(p => p.status === 'vencida').reduce((s, p) => s + p.valor, 0);
    base.saldoCaixa = flows.reduce((s, f) => s + (f.tipo === 'entrada' ? f.valor : -f.valor), 0);

    if (can(user, 'finance_sensitive')) {
      const custoVendas = salesMonth.reduce((s, v) => s + (domain.saleResult(v).custoReal || 0), 0);
      const lucroEstimado = salesMonth.reduce((s, v) => s + domain.saleResult(v).resultado, 0);
      base.lucroEstimadoMes = lucroEstimado;
      base.margemMes = fat > 0 ? (lucroEstimado / fat) * 100 : 0;
      base.custoVendasMes = custoVendas;
    }
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
/* Quem está do outro lado da conexão.
   Na nuvem o sistema fica atrás do servidor da hospedagem, e aí toda
   requisição chega com o mesmo endereço — sem isto, o bloqueio por tentativas
   trancaria todo mundo junto. O cabeçalho X-Forwarded-For traz o endereço real,
   mas só é levado em conta quando JAQUES_TRUST_PROXY=1: fora da nuvem qualquer
   um poderia forjá-lo e escapar do bloqueio. */
function clientIp(req) {
  if (process.env.JAQUES_TRUST_PROXY === '1') {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress || '?';
}

/* Proteção contra força bruta: máx. 10 senhas erradas por IP a cada 15 minutos. */
const loginFailures = new Map();
function bruteForceBlocked(ip) {
  const rec = loginFailures.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > 15 * 60 * 1000) { loginFailures.delete(ip); return false; }
  return rec.count >= 10;
}
function noteLoginFailure(ip) {
  const rec = loginFailures.get(ip);
  if (rec && Date.now() - rec.first <= 15 * 60 * 1000) rec.count++;
  else loginFailures.set(ip, { count: 1, first: Date.now() });
}

route('POST', '/api/login', null, async (req, res) => {
  const ip = clientIp(req);
  if (bruteForceBlocked(ip)) {
    return send(res, 429, { error: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' });
  }
  const { username, password } = await readBody(req);
  const user = db.all('users').find(u => u.username === String(username || '').toLowerCase().trim());
  if (!user || !checkPassword(password, user.password)) {
    noteLoginFailure(ip);
    return send(res, 401, { error: 'Usuário ou senha inválidos' });
  }
  loginFailures.delete(ip);
  if (!user.active) return send(res, 401, { error: 'Usuário inativo' });
  // Senha certa e cadastro ainda no formato antigo: converte agora, em silêncio.
  if (isLegacyHash(user.password)) db.update('users', user.id, { password: hashPassword(password) });
  // Expira sessões sem uso há mais de 30 dias (quem usa o sistema permanece conectado).
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  for (const s of db.all('sessions').filter(s => new Date(s.lastUsed || s.createdAt).getTime() < cutoff)) {
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
    settings: { quoteValidityDays: db.settings.quoteValidityDays, companyName: db.settings.companyName,
      empresa: db.settings.empresa || {} },
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

/* Segredos nunca saem do servidor: o GET devolve só máscara.
   Vale para a chave do assistente e para as credenciais da Conta Azul —
   o bloco inteiro sai daqui, e a tela usa /api/contaazul/status. */
function settingsForClient() {
  const s = Object.assign({}, db.settings);
  s.aiKeyMasked = s.aiApiKey ? '••••' + String(s.aiApiKey).slice(-4) : '';
  delete s.aiApiKey;
  delete s.contaazul;
  return s;
}

route('GET', '/api/settings', 'admin', async (req, res) => ok(res, settingsForClient()));
route('PUT', '/api/settings', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  const s = db.settings;
  if (b.quoteValidityDays !== undefined) s.quoteValidityDays = Number(b.quoteValidityDays) || 30;
  if (b.companyName) s.companyName = b.companyName;
  // Dados da empresa (remetente das etiquetas de envio) — cadastrados uma vez
  if (b.empresa && typeof b.empresa === 'object') {
    const e = s.empresa || (s.empresa = {});
    for (const k of ['razaoSocial', 'endereco', 'numero', 'bairro', 'cidade', 'estado', 'complemento', 'telefone']) {
      if (b.empresa[k] !== undefined) e[k] = String(b.empresa[k] || '').slice(0, 120);
    }
    // documentos guardados só com números
    if (b.empresa.cnpj !== undefined) e.cnpj = String(b.empresa.cnpj || '').replace(/\D/g, '').slice(0, 14);
    if (b.empresa.cep !== undefined) e.cep = String(b.empresa.cep || '').replace(/\D/g, '').slice(0, 8);
  }
  if (b.aiProvider !== undefined) s.aiProvider = b.aiProvider === 'claude' ? 'claude' : 'gemini';
  if (b.aiModel !== undefined) s.aiModel = String(b.aiModel || '').trim();
  if (b.aiApiKey === null) s.aiApiKey = '';                       // remoção explícita
  else if (typeof b.aiApiKey === 'string' && b.aiApiKey.trim()) s.aiApiKey = b.aiApiKey.trim();
  let backupAgora = false;
  if (b.backupDir !== undefined) {
    const dir = String(b.backupDir || '').trim();
    if (!dir) { s.backupDir = ''; s.lastCloudBackup = null; }
    else {
      // Valida na hora: cria a pasta (se preciso) e testa a escrita.
      try {
        fs.mkdirSync(dir, { recursive: true });
        const probe = path.join(dir, '.teste-de-escrita-jaques.tmp');
        fs.writeFileSync(probe, 'ok');
        fs.unlinkSync(probe);
      } catch (e) {
        return bad(res, `Não consegui gravar nessa pasta (${e.message}). Confira o caminho — ex.: G:\\Meu Drive\\Backup Jaques Motorsport`);
      }
      backupAgora = dir !== s.backupDir;
      s.backupDir = dir;
    }
  }
  db.save();
  audit(user, 'alterou', 'settings', 1, 'Configurações do sistema');
  if (backupAgora) cloudBackup(true); // primeiro backup imediato — o arquivo já aparece no Drive
  ok(res, settingsForClient());
});

/* ---- backup na nuvem ---- */
route('GET', '/api/backup/status', 'admin', async (req, res) => {
  const localDir = path.join(db.DATA_DIR, 'backups');
  let locais = [];
  try { locais = fs.readdirSync(localDir).filter(f => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch (e) {}
  ok(res, {
    local: { arquivos: locais.length, ultimo: locais[locais.length - 1] || null },
    cloud: { dir: db.settings.backupDir || '', last: db.settings.lastCloudBackup || null },
    sugestoes: cloudCandidates().map(c => path.join(c, 'Backup Jaques Motorsport'))
  });
});

/* ---- importação da planilha de gastos (Excel semanal) ---- */
/* Layout esperado (o da planilha GASTOS OFICINA): uma aba por semana;
   à esquerda A=data B=descrição C=valor D=nota E=cartão (gastos);
   à direita G=data H=item I=valor J=descrição (entradas).            */

const CAT_SAIDA_REGRAS = [
  [/SALARIO|SAL[AÁ]RIO|ADIANTAMENTO|FGTS|F[EÉ]RIAS|13/, 'salarios'],
  [/IRRF|SIMPLES|IMPOSTO|DARF|\bDAS\b|TRIBUT|INSS/, 'impostos'],
  [/COPEL|ENERGIA/, 'energia'],
  [/SANEPAR|[AÁ]GUA/, 'agua'],
  [/VIVO|CLARO|\bTIM\b|CELULAR|TELEFONE/, 'telefone'],
  [/INTERNET/, 'internet'],
  [/ALUGUEL/, 'aluguel'],
  [/FRETE|RODONAVES|EXPRESSO|CORREIO|TRANSPORTADORA/, 'custo_direto'],
  [/USINAGEM|\bSOLDA\b|RETIFICA|TERCEIR/, 'terceirizacao'],
  [/FERRAMENTA|\bCNC\b|MANUTEN/, 'manutencao'],
  [/MERCADO|LIMPEZA|ESCRITORIO|ESCRIT[OÓ]RIO|PAPELARIA|VIAGEM|GASOLINA|COMBUSTIVEL|COMBUST[IÍ]VEL|MULTA|ANIVERSARIO|HONORARIO|HONOR[AÁ]RIO|CONTAB/, 'despesa_operacional'],
  [/\bJAU\b|RETIFOZ|RETFOZ|FERRAGENS|MANGOPAR|\bOCTA\b|SEDE|VALVULA|V[AÁ]LVULA|GUIA|JUNTA|TUCHO|COMANDO|MOLA|CASCO|PIST[AÃ]O|ANEL|RETENTOR|VEDADOR/, 'componentes']
];
function categoriaSaida(txt) {
  const t = String(txt).toUpperCase();
  for (const [re, cat] of CAT_SAIDA_REGRAS) if (re.test(t)) return cat;
  return 'materiais';
}
function categoriaEntrada(txt) {
  return /VENDA|PEDIDO/i.test(String(txt)) ? 'venda_cabecote' : 'servico';
}

function parseGastosXlsx(buf) {
  const wb = xlsx.parse(buf);
  if (!wb.sheets.length) throw new Error('não encontrei abas na planilha');
  const rows = [], avisos = [];
  const dateOk = v => {
    const d = xlsx.asDate(v);
    return d && d >= '2020-01-01' && d <= '2035-12-31' ? d : null;
  };
  for (const sh of wb.sheets) {
    for (let r = 1; r < sh.rows.length; r++) {
      const row = sh.rows[r] || {};
      // gastos (bloco da esquerda)
      const dA = dateOk(row[0]);
      const desc = typeof row[1] === 'string' ? row[1].trim() : '';
      if (dA && desc) {
        if (typeof row[2] === 'number' && row[2] > 0) {
          rows.push({
            tipo: 'saida', data: dA, origem: desc, valor: Math.round(row[2] * 100) / 100,
            nota: row[3] === true, cartao: row[4] === true, aba: sh.name, categoria: categoriaSaida(desc)
          });
        } else {
          avisos.push(`Aba ${sh.name}: “${desc.slice(0, 40)}” sem valor numérico — ignorada`);
        }
      }
      // entradas (bloco da direita) — exige item preenchido (filtra totais soltos)
      const dG = dateOk(row[6]);
      const item = typeof row[7] === 'string' ? row[7].trim() : '';
      if (dG && item && typeof row[8] === 'number' && row[8] > 0) {
        const extra = typeof row[9] === 'string' && row[9].trim() ? ' — ' + row[9].trim() : '';
        rows.push({
          tipo: 'entrada', data: dG, origem: item + extra, valor: Math.round(row[8] * 100) / 100,
          aba: sh.name, categoria: categoriaEntrada(item)
        });
      }
    }
  }
  // Chave estável por linha: reimportar o mesmo arquivo não duplica nada.
  const seen = {};
  for (const x of rows) {
    const base = `xls|${x.tipo}|${x.data}|${x.valor.toFixed(2)}|${x.origem.toUpperCase().replace(/\s+/g, ' ').slice(0, 120)}`;
    seen[base] = (seen[base] || 0) + 1;
    x.importKey = seen[base] === 1 ? base : `${base}#${seen[base]}`;
  }
  return { rows, avisos };
}

route('POST', '/api/cashflow/import-xlsx', 'cashflow', async (req, res, user) => {
  // Recebe o .xlsx e devolve a análise (nada é gravado nesta etapa).
  const chunks = [];
  let size = 0, aborted = false;
  req.on('data', c => {
    size += c.length;
    if (size > 40 * 1024 * 1024) {
      aborted = true;
      send(res, 413, { error: 'Planilha grande demais (limite: 40 MB)' });
      res.on('finish', () => req.destroy());
      return;
    }
    if (!aborted) chunks.push(c);
  });
  req.on('end', () => {
    if (aborted) return;
    try {
      const { rows, avisos } = parseGastosXlsx(Buffer.concat(chunks));
      const existentes = new Set(db.all('cashflow').map(f => f.importKey).filter(Boolean));
      for (const x of rows) x.jaExiste = existentes.has(x.importKey);
      const soma = list => Math.round(list.reduce((s, x) => s + x.valor, 0) * 100) / 100;
      const saidas = rows.filter(x => x.tipo === 'saida');
      const entradas = rows.filter(x => x.tipo === 'entrada');
      ok(res, {
        rows, avisos,
        resumo: {
          saidas: saidas.length, entradas: entradas.length,
          totalSaidas: soma(saidas), totalEntradas: soma(entradas),
          novos: rows.filter(x => !x.jaExiste).length,
          repetidos: rows.filter(x => x.jaExiste).length,
          novosSaidas: soma(saidas.filter(x => !x.jaExiste)),
          novosEntradas: soma(entradas.filter(x => !x.jaExiste))
        }
      });
    } catch (e) {
      bad(res, 'Não consegui ler a planilha: ' + e.message);
    }
  });
  req.on('error', () => {});
});

route('POST', '/api/cashflow/import-confirm', 'cashflow', async (req, res, user) => {
  const b = await readBody(req);
  const rows = Array.isArray(b.rows) ? b.rows : [];
  const existentes = new Set(db.all('cashflow').map(f => f.importKey).filter(Boolean));
  let inseridos = 0, pulados = 0;
  for (const x of rows) {
    if (!x || (x.tipo !== 'entrada' && x.tipo !== 'saida')) continue;
    const valor = Number(x.valor);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.data || '')) || !(valor > 0)) continue;
    const key = String(x.importKey || '').slice(0, 200);
    if (key && existentes.has(key)) { pulados++; continue; }
    db.insert('cashflow', {
      tipo: x.tipo, valor: Math.round(valor * 100) / 100, data: x.data,
      conta: x.cartao ? 'cartão de crédito' : 'principal',
      categoria: String(x.categoria || (x.tipo === 'saida' ? 'materiais' : 'servico')).slice(0, 40),
      origem: String(x.origem || 'Importado').slice(0, 160),
      documento: x.nota ? 'com NF' : '',
      refType: 'importPlanilha', refId: null,
      descricao: `Importado da planilha${x.aba ? ' (aba ' + String(x.aba).slice(0, 30) + ')' : ''}`,
      importKey: key || null
    });
    if (key) existentes.add(key);
    inseridos++;
  }
  audit(user, 'importou', 'cashflow', null, `Planilha de gastos: ${inseridos} lançamento(s) novos, ${pulados} já existiam`);
  ok(res, { inseridos, pulados });
});

/* ---- modelos 3D (escaneamentos / CAD exportado como malha) ---- */
const MODELS_DIR = path.join(db.DATA_DIR, 'models');
const MODEL_EXTS = ['stl', 'obj', 'ply'];

route('POST', '/api/models3d/upload', 'products', async (req, res, user, params, query) => {
  const nome = String(query.nome || 'modelo').slice(0, 140);
  const ext = (nome.split('.').pop() || '').toLowerCase();
  if (!MODEL_EXTS.includes(ext)) {
    return bad(res, 'Formato não suportado. Exporte do CAD como STL, OBJ ou PLY (no SolidWorks: Salvar como → STL).');
  }
  const MAX = 200 * 1024 * 1024;
  const MSG_GRANDE = 'Arquivo grande demais (limite: 200 MB). Exporte de novo com resolução Média/Medium — fica leve e a diferença visual é imperceptível.';
  // O navegador informa o tamanho antes de enviar: recusa na hora, com mensagem clara.
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX) return send(res, 413, { error: MSG_GRANDE });
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const fname = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
  const fpath = path.join(MODELS_DIR, fname);
  let size = 0, aborted = false;
  const ws = fs.createWriteStream(fpath);
  req.on('data', chunk => {
    if (aborted) return;
    size += chunk.length;
    if (size > MAX) {
      aborted = true;
      ws.destroy();
      fs.unlink(fpath, () => {});
      send(res, 413, { error: MSG_GRANDE });
      res.on('finish', () => req.destroy()); // deixa a resposta chegar antes de derrubar
      return;
    }
    ws.write(chunk);
  });
  req.on('end', () => {
    if (aborted) return;
    ws.end(() => {
      const rec = db.insert('models3d', {
        nome, arquivo: fname, ext, size,
        produtoId: query.produtoId ? Number(query.produtoId) : null,
        criadoEm: new Date().toISOString()
      });
      audit(user, 'criou', 'models3d', rec.id, `Modelo 3D ${nome} (${(size / 1048576).toFixed(1)} MB)`);
      ok(res, rec);
    });
  });
  req.on('error', () => { aborted = true; ws.destroy(); fs.unlink(fpath, () => {}); });
});

route('GET', '/api/models3d', 'dashboard', async (req, res) => ok(res, db.all('models3d')));

route('PUT', '/api/models3d/:id', 'products', async (req, res, user, params) => {
  const b = await readBody(req);
  const patch = {};
  if (b.nome) patch.nome = String(b.nome).slice(0, 140);
  if (b.produtoId !== undefined) patch.produtoId = b.produtoId ? Number(b.produtoId) : null;
  const rec = db.update('models3d', params.id, patch);
  if (!rec) return notFound(res);
  audit(user, 'alterou', 'models3d', rec.id, rec.nome);
  ok(res, rec);
});

route('DELETE', '/api/models3d/:id', 'products', async (req, res, user, params) => {
  const m = db.get('models3d', params.id);
  if (!m) return notFound(res);
  fs.unlink(path.join(MODELS_DIR, m.arquivo), () => {});
  db.remove('models3d', m.id);
  audit(user, 'excluiu', 'models3d', m.id, m.nome);
  ok(res, { ok: true });
});

route('GET', '/api/models3d/:id/file', 'dashboard', async (req, res, user, params) => {
  const m = db.get('models3d', params.id);
  if (!m) return notFound(res);
  const fpath = path.join(MODELS_DIR, m.arquivo);
  if (!fs.existsSync(fpath)) return notFound(res);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': fs.statSync(fpath).size,
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(fpath).pipe(res);
});

/* ---- acesso pelo celular: endereços do computador na rede local ---- */
route('GET', '/api/network', 'admin', async (req, res) => {
  const ips = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.')) ips.push(ni.address);
    }
  }
  // redes domésticas primeiro (192.168.x.x é o caso comum de Wi-Fi)
  ips.sort((a, b) => (b.startsWith('192.168.') ? 1 : 0) - (a.startsWith('192.168.') ? 1 : 0));
  ok(res, { port: PORT, ips });
});

route('POST', '/api/backup/now', 'admin', async (req, res, user) => {
  ensureDailyBackup();
  const r = cloudBackup(true);
  audit(user, 'backup', 'settings', 1, r.ok ? `Backup manual → ${r.file}` : `Backup manual falhou: ${r.error || 'nuvem não configurada'}`);
  ok(res, r);
});

/* Baixa o banco inteiro como um arquivo só.
   É o backup que dá para guardar fora do sistema — e é assim que os dados
   saem de um computador para entrar em outro (ou na nuvem). */
route('GET', '/api/backup/download', 'admin', async (req, res, user) => {
  db.persistNow();
  const conteudo = fs.readFileSync(db.DB_FILE);
  const nome = `jaques-backup-${new Date().toISOString().slice(0, 10)}.json`;
  audit(user, 'backup', 'settings', 1, 'Backup baixado');
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nome}"`,
    'Content-Length': conteudo.length
  });
  res.end(conteudo);
});

/* Restaura um backup por cima do banco atual.
   Antes de trocar qualquer coisa, o banco de agora é guardado em
   data/backups — se o arquivo enviado estiver errado, nada se perde. */
route('POST', '/api/backup/restore', 'admin', async (req, res, user) => {
  const corpo = await readBody(req);
  const novo = corpo && corpo.banco;
  if (!novo || typeof novo !== 'object' || Array.isArray(novo)) {
    return bad(res, 'Arquivo inválido: não parece um backup do sistema.');
  }
  if (!Array.isArray(novo.users) || !novo.users.length) {
    return bad(res, 'Arquivo inválido: nenhum usuário dentro dele. Um backup sem usuários deixaria o sistema sem ninguém para entrar.');
  }
  const faltando = ['clients', 'settings'].filter(c => !Array.isArray(novo[c]));
  if (faltando.length) return bad(res, `Arquivo inválido: faltam as tabelas ${faltando.join(', ')}.`);

  const backupDir = path.join(db.DATA_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const salvaguarda = path.join(backupDir, `antes-da-restauracao-${Date.now()}.json`);
  db.persistNow();
  if (fs.existsSync(db.DB_FILE)) fs.copyFileSync(db.DB_FILE, salvaguarda);

  for (const c of db.COLLECTIONS) if (!Array.isArray(novo[c])) novo[c] = [];
  if (!novo._seq) novo._seq = {};
  const tmp = db.DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(novo, null, 1));
  fs.renameSync(tmp, db.DB_FILE);
  db.reload();

  console.log('Banco restaurado. Cópia do anterior:', salvaguarda);
  audit(user, 'restore', 'settings', 1,
    `Backup restaurado por ${user.name} — cópia do anterior em ${path.basename(salvaguarda)}`);
  ok(res, {
    ok: true,
    salvaguarda: path.basename(salvaguarda),
    usuarios: novo.users.length,
    clientes: novo.clients.length
  });
});

/* ================= Conta Azul — conexão oficial (OAuth 2.0) =================
   O Client Secret e os tokens nunca saem do servidor. O navegador só recebe
   o estado da conexão e o endereço para onde deve mandar o usuário. */

route('GET', '/api/contaazul/status', 'admin', async (req, res) => {
  ok(res, contaazul.status());
});

route('PUT', '/api/contaazul/config', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  const c = contaazul.config();
  // Antes de sobrescrever a credencial, guarda a anterior. Se um
  // preenchimento automático do navegador (ou um engano) passar por cima,
  // o valor antigo continua recuperável em data/db.json → contaazul.anteriores.
  for (const k of ['clientId', 'clientSecret']) {
    const novo = typeof b[k] === 'string' ? b[k].trim() : '';
    if (novo && c[k] && novo !== c[k]) {
      (c.anteriores = c.anteriores || {})[k] = { valor: c[k], em: new Date().toISOString() };
    }
  }
  if (typeof b.clientId === 'string' && b.clientId.trim()) c.clientId = b.clientId.trim();
  if (typeof b.clientSecret === 'string' && b.clientSecret.trim()) c.clientSecret = b.clientSecret.trim();
  if (typeof b.redirectUri === 'string' && b.redirectUri.trim()) c.redirectUri = b.redirectUri.trim();
  // Campos avançados: em branco volta ao padrão.
  for (const k of ['autorizarUrl', 'tokenUrl', 'apiBase', 'escopo']) {
    if (typeof b[k] === 'string') c[k] = b[k].trim();
  }
  db.save();
  audit(user, 'update', 'settings', 1, 'Credenciais da Conta Azul atualizadas');
  ok(res, contaazul.status());
});

/* Devolve o endereço da tela de autorização da Conta Azul. Quem abre é o
   navegador do usuário — o servidor nunca vê a senha da Conta Azul. */
route('POST', '/api/contaazul/connect', 'admin', async (req, res) => {
  if (!contaazul.configurado()) {
    return bad(res, 'Preencha antes o Client ID, o Client Secret e o endereço de retorno.');
  }
  ok(res, { url: contaazul.urlAutorizacao() });
});

/* Para onde a Conta Azul devolve o usuário depois de autorizar.
   Quem chega aqui é o navegador, vindo de fora e sem token do sistema — por
   isso a rota é aberta, e quem faz o papel de credencial é o "state", que só
   este servidor gerou e que vale uma vez só. */
async function contaazulRetorno(req, res, query) {
  const pagina = (titulo, corpo, cor) => send(res, 200, `<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="utf-8"><title>Conta Azul — ${titulo}</title>
    <style>body{font:15px/1.5 system-ui,sans-serif;background:#0b0b0c;color:#ededea;
      display:grid;place-items:center;height:100vh;margin:0;text-align:center}
      .cx{max-width:460px;padding:32px;border:1px solid #26262b;border-radius:16px;background:#121214}
      h1{font-size:19px;margin:0 0 10px;color:${cor}} p{color:#9a9aa1;margin:0 0 16px}
      a{color:#e43146}</style></head><body><div class="cx">
    <h1>${titulo}</h1>${corpo}
    <p><a href="/#/admin">Voltar ao sistema</a></p></div></body></html>`,
    { 'Content-Type': 'text/html; charset=utf-8' });

  if (query.error) {
    return pagina('Autorização não concluída',
      `<p>A Conta Azul respondeu: <b>${esc(query.error_description || query.error)}</b></p>`, '#e43146');
  }
  if (!contaazul.consumirState(query.state)) {
    return pagina('Retorno não reconhecido',
      '<p>Este retorno não corresponde a nenhum pedido de conexão feito aqui, ou demorou mais de 10 minutos. Comece de novo pelo botão <b>Conectar</b>.</p>', '#e43146');
  }
  if (!query.code) {
    return pagina('Retorno incompleto', '<p>A Conta Azul não enviou o código de autorização.</p>', '#e43146');
  }
  try {
    await contaazul.trocarCodigo(query.code);
    try {
      const eu = await contaazul.quemSou();
      const c = contaazul.config();
      c.conta = { nome: eu.name || eu['cognito:username'] || '', email: eu.email || '' };
      db.save();
    } catch (e) { /* conectou; só não deu para descobrir o nome da conta */ }
    audit({ id: 0, name: 'sistema' }, 'update', 'settings', 1, 'Conta Azul conectada');
    return pagina('Conta Azul conectada',
      '<p>Pode fechar esta aba e voltar ao sistema.</p>', '#3fb950');
  } catch (e) {
    const c = contaazul.config();
    c.ultimoErro = e.message;
    db.save();
    return pagina('Não consegui concluir', `<p>${esc(e.message)}</p>`, '#e43146');
  }
}
route('GET', '/api/contaazul/callback', null, async (req, res, user, params, query) =>
  contaazulRetorno(req, res, query));

/* Conclui a autorização a partir do código colado à mão.
   É o caminho para quando o app está cadastrado para voltar no site da
   Conta Azul em vez de aqui: o usuário copia o endereço da barra do
   navegador, que traz "?code=…", e cola. */
route('POST', '/api/contaazul/codigo', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  const code = contaazul.codigoDe(b.texto);
  if (!code) {
    return bad(res, 'Não achei o código nesse texto. Cole o endereço inteiro da barra do navegador, aquele que tem "code=".');
  }
  try {
    await contaazul.trocarCodigo(code);
    try {
      const eu = await contaazul.quemSou();
      const c = contaazul.config();
      c.conta = { nome: eu.name || eu['cognito:username'] || '', email: eu.email || '' };
      db.save();
    } catch (e) { /* conectou; só não deu para descobrir o nome da conta */ }
    audit(user, 'update', 'settings', 1, 'Conta Azul conectada (código colado)');
    ok(res, { ok: true, status: contaazul.status() });
  } catch (e) {
    /* De propósito não grava o erro: gravar mexe nos dados, a tela se
       redesenha sozinha e o painel com o campo do código some — e o código
       vale só 3 minutos. O erro volta na resposta, que é o que importa. */
    ok(res, { ok: false, error: e.message });
  }
});

/* Conecta com um refresh token colado à mão — o exemplo de cURL do portal
   traz um pronto para o app de desenvolvimento. É a conexão definitiva sem
   a corrida dos 3 minutos: valida na hora, renovando de verdade. */
route('POST', '/api/contaazul/refresh-manual', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  const token = String(b.token || '').trim();
  if (token.length < 20) return bad(res, 'Cole o refresh_token completo, como está no exemplo de cURL do portal.');
  contaazul.refreshManual(token);
  try {
    await contaazul.renovar();               // prova real: gera o primeiro access token
    try {
      const eu = await contaazul.quemSou();
      const c = contaazul.config();
      c.conta = { nome: eu.name || eu['cognito:username'] || '', email: eu.email || '' };
      db.save();
    } catch (e) { /* conectou; só não deu para descobrir o nome da conta */ }
    audit(user, 'update', 'settings', 1, 'Conta Azul conectada (refresh token do portal)');
    ok(res, { ok: true, status: contaazul.status() });
  } catch (e) {
    ok(res, { ok: false, error: e.message });
  }
});

/* O portal da Conta Azul mostra o token do app de desenvolvimento uma única
   vez. Guardar aqui permite explorar a API da conta de teste enquanto a
   autorização completa não está concluída. */
route('POST', '/api/contaazul/token-manual', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  const token = String(b.token || '').trim();
  if (token.length < 20) return bad(res, 'Cole o access_token completo, do jeito que o portal mostrou.');
  contaazul.tokenManual(token, b.minutos);
  audit(user, 'update', 'settings', 1, 'Conta Azul — token de teste guardado');
  ok(res, contaazul.status());
});

route('POST', '/api/contaazul/test', 'admin', async (req, res) => {
  try {
    // A prova real da conexão é obter um token válido (renova se preciso).
    await contaazul.tokenValido();
    const c = contaazul.config();
    try {
      const eu = await contaazul.quemSou();
      c.conta = { nome: eu.name || eu['cognito:username'] || '', email: eu.email || '' };
    } catch (e) { /* identificação é cortesia; a conexão está de pé */ }
    c.ultimoErro = '';
    db.save();
    ok(res, { ok: true, conta: c.conta || null });
  } catch (e) {
    ok(res, { ok: false, error: e.message });
  }
});

route('POST', '/api/contaazul/disconnect', 'admin', async (req, res, user) => {
  contaazul.desconectar();
  audit(user, 'update', 'settings', 1, 'Conta Azul desconectada');
  ok(res, contaazul.status());
});

/* Ferramenta de leitura, para conferirmos junto o formato real de cada
   recurso antes de escrever a sincronização. Só GET e só administrador:
   não altera nada na Conta Azul. */
route('POST', '/api/contaazul/explorar', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  const caminho = String(b.caminho || '').trim();
  if (!caminho.startsWith('/')) return bad(res, 'Informe o caminho do recurso, começando com "/".');
  try {
    const r = await contaazul.chamar(caminho, { method: 'GET' });
    audit(user, 'view', 'settings', 1, `Conta Azul — leitura de ${caminho}`);
    ok(res, { status: r.status, corpo: r.json !== null ? r.json : String(r.text || '').slice(0, 4000) });
  } catch (e) {
    ok(res, { status: 0, erro: e.message });
  }
});

/* ---- sincronização real: Clientes → Pessoas ---- */

/* Sonda o formato + mostra o que iria. Nada é enviado. */
route('POST', '/api/contaazul/sync/clientes/ensaio', 'admin', async (req, res, user) => {
  const ensaio = casync.ensaioClientes({ amostra: 5 });
  let sonda = null;
  try { sonda = await casync.sondarPessoas(); }
  catch (e) { sonda = { status: 0, corpo: e.message }; }
  audit(user, 'view', 'settings', 1, 'Conta Azul — ensaio de envio de clientes');
  ok(res, Object.assign({ sonda }, ensaio));
});

/* Envia de verdade. { limite: 1 } é o teste com um cliente só. */
route('POST', '/api/contaazul/sync/clientes/enviar', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  const r = await casync.enviarClientes({ ids: b.ids, limite: b.limite });
  audit(user, 'update', 'settings', 1,
    `Conta Azul — envio de clientes: ${r.enviados} ok, ${r.falhas} falha(s)`);
  ok(res, r);
});

/* ---- integrações externas (preparação p/ Conta Azul) ----
   Só leitura do estado de sincronização; nenhuma chamada externa ainda. */
/* O plano de sincronização: o que iria, para onde, e o que já foi.
   É calculado só com dados locais — não toca na Conta Azul. */
/* Consulta de vínculos antes de excluir — a tela usa isto para avisar
   exatamente o que está preso ao cadastro. */
route('GET', '/api/vinculos/:colecao/:id', 'dashboard', async (req, res, user, params) => {
  const col = params.colecao;
  if (!REST[col]) return notFound(res);
  if (!can(user, REST[col].perm)) return forbidden(res);
  const rec = db.get(col, params.id);
  if (!rec) return notFound(res);
  const vinc = vinculosDe(col, params.id);
  ok(res, {
    vinculos: vinc,
    total: vinc.reduce((s, v) => s + v.qtd, 0),
    podeInativar: !!INATIVAVEIS[col],
    campoAtivo: INATIVAVEIS[col] || null,
    ativo: INATIVAVEIS[col] ? rec[INATIVAVEIS[col]] !== false : null
  });
});

route('GET', '/api/sync/plano', 'admin', async (req, res) => {
  ok(res, {
    sistema: 'contaazul',
    conectado: contaazul.conectado(),
    sentidos: sync.SENTIDOS,
    tipos: sync.plano('contaazul')
  });
});

route('PUT', '/api/sync/config', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  try {
    sync.definirSentido(String(b.entidade || ''), String(b.sentido || ''));
  } catch (e) { return bad(res, e.message); }
  audit(user, 'update', 'settings', 1, `Sincronização: ${b.entidade} → ${b.sentido}`);
  ok(res, { sistema: 'contaazul', conectado: contaazul.conectado(), sentidos: sync.SENTIDOS, tipos: sync.plano('contaazul') });
});

/* ---- etiquetas de envio: registro de emissão (vínculo com pedido/OS) ---- */
route('POST', '/api/labels', 'dashboard', async (req, res, user) => {
  const b = await readBody(req);
  const origem = b.origem === 'serviceOrders' ? 'serviceOrders' : 'sales';
  const refId = Number(b.refId) || null;
  const rec = db.insert('labels', {
    origem, refId, ref: String(b.ref || '').slice(0, 60),
    clienteId: b.clienteId ? Number(b.clienteId) : null,
    emitidaEm: new Date().toISOString(), emitidaPor: user.name
  });
  // marca no próprio pedido/OS e deixa rastro na linha do tempo
  const doc = refId ? db.get(origem, refId) : null;
  if (doc) db.update(origem, refId, { etiquetaEmitidaEm: rec.emitidaEm });
  audit(user, 'etiqueta', origem, refId, `Etiqueta de envio gerada — ${rec.ref}`);
  ok(res, rec);
});

route('GET', '/api/labels', 'dashboard', async (req, res) => ok(res, db.all('labels').slice(-100)));

/* ---- sinal de alteração: as telas abertas se atualizam sozinhas ----
   /api/events mantém uma conexão aberta e avisa NA HORA que alguém
   alterou algo. /api/rev fica como reserva, caso a conexão caia. */
route('GET', '/api/rev', 'dashboard', async (req, res) => ok(res, { rev: db.rev() }));

const liveClients = new Set();
route('GET', '/api/events', 'dashboard', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 5000\n\n');
  res.write(`data: {"rev":${db.rev()}}\n\n`);
  const cli = { res };
  liveClients.add(cli);
  req.on('close', () => liveClients.delete(cli));
  req.on('error', () => liveClients.delete(cli));
});

/* Vigia o contador de alterações e avisa todas as telas conectadas. */
let lastBroadcast = db.rev();
let keepAliveTick = 0;
setInterval(() => {
  if (!liveClients.size) { lastBroadcast = db.rev(); return; }
  const r = db.rev();
  const mudou = r !== lastBroadcast;
  if (mudou) lastBroadcast = r;
  keepAliveTick++;
  const msg = mudou ? `data: {"rev":${r}}\n\n` : (keepAliveTick % 25 === 0 ? ': ping\n\n' : null);
  if (!msg) return;
  for (const cli of [...liveClients]) {
    try { cli.res.write(msg); } catch (e) { liveClients.delete(cli); }
  }
}, 700);

/* ---- pendências: individuais por padrão ---- */
/* Cada um recebe as SUAS pendências, as sem dono (pode assumir) e as que
   ele mesmo delegou a outros. Só quem tem 'admin' enxerga o quadro da
   equipe inteira. */
route('GET', '/api/tasks', 'tasks', async (req, res, user) => {
  let list = db.all('tasks');
  if (!can(user, 'admin')) {
    list = list.filter(t => !t.assigneeId || t.assigneeId === user.id || t.criadoPorId === user.id);
  }
  ok(res, list);
});

route('POST', '/api/tasks', 'tasks', async (req, res, user) => {
  const b = await readBody(req);
  if (!b.titulo || !String(b.titulo).trim()) return bad(res, 'Dê um título à pendência');
  const rec = db.insert('tasks', {
    titulo: String(b.titulo).slice(0, 200),
    descricao: String(b.descricao || '').slice(0, 600),
    prioridade: ['urgente', 'semana', 'normal', 'aguardando'].includes(b.prioridade) ? b.prioridade : 'normal',
    assigneeId: b.assigneeId ? Number(b.assigneeId) : null,
    due: b.due || '',
    link: String(b.link || '').slice(0, 300),
    origem: String(b.origem || 'manual').slice(0, 60),
    status: 'aberta',
    criadoPorId: user.id,
    criadoPorNome: user.name
  });
  const paraQuem = rec.assigneeId ? (db.get('users', rec.assigneeId) || {}).name : null;
  audit(user, 'criou', 'tasks', rec.id, rec.titulo + (paraQuem ? ` → atribuída a ${paraQuem}` : ''));
  ok(res, rec);
});

/* ---- assistente de IA ---- */

/**
 * Monta um retrato compacto dos dados para a IA responder perguntas.
 * Cada bloco só entra se o usuário tiver permissão no módulo — o mesmo
 * controle das telas vale para o assistente (Produção não vê financeiro).
 */
function assistantContext(user) {
  const t = domain.today();
  const month = t.slice(0, 7);
  const money = v => Math.round((v || 0) * 100) / 100;
  const fin = can(user, 'finance_sensitive');
  const ctx = {
    hoje: t,
    empresa: db.settings.companyName,
    usuario: { nome: user.name, cargo: user.cargo || '' }
  };

  const d = dashboard(user);
  ctx.resumoDoMes = {
    mes: d.mes, faturamento: money(d.faturamentoMes),
    vendas: d.vendasMes, servicos: d.servicosMes,
    orcamentosAguardando: d.orcamentosAguardando,
    servicosEmAndamento: d.servicosAndamento,
    cabecotesAguardandoProducao: d.cabecotesAguardandoProducao,
    pedidosNaoEntregues: d.pedidosNaoEntregues,
    bensDeClientesNaEmpresa: d.bensDeClientes
  };
  if (fin) {
    ctx.resumoDoMes.lucroEstimado = money(d.lucroEstimadoMes);
    ctx.resumoDoMes.margemPct = money(d.margemMes);
  }

  if (can(user, 'tasks')) {
    ctx.pendenciasAbertas = db.all('tasks').filter(x => x.status === 'aberta')
      .sort((a, b) => ((a.due || '9999') < (b.due || '9999') ? -1 : 1)).slice(0, 25)
      .map(x => ({ titulo: x.titulo, prioridade: x.prioridade, prazo: x.due || '', responsavel: x.assigneeId ? ((db.get('users', x.assigneeId) || {}).name || '') : 'todos' }));
  }

  if (can(user, 'clients')) {
    const clients = db.all('clients');
    ctx.clientes = {
      total: clients.length,
      lista: clients.slice(0, 150).map(c => ({ nome: c.nome, cidade: c.cidade || '', estado: c.estado || '', telefone: c.telefone || '' }))
    };
  }

  if (can(user, 'quotes')) {
    ctx.orcamentosAbertos = db.all('quotes').filter(q => q.status === 'aberto').slice(-20)
      .map(q => ({ numero: q.numero, cliente: (db.get('clients', q.clienteId) || {}).nome || '', modelo: q.modelo || '', valor: money(q.total), data: q.dataOrcamento }));
  }

  if (can(user, 'sales')) {
    ctx.vendasRecentes = db.all('sales').filter(s => s.status !== 'cancelado').slice(-15)
      .map(s => ({ numero: s.numero, cliente: (db.get('clients', s.clienteId) || {}).nome || '', valor: money(s.valorTotal), status: s.status, data: s.dataPedido,
        itens: (s.itens || []).map(i => `${i.produto || ''} ${i.stage || ''}`.trim()).join(' + ') }));
  }

  if (can(user, 'os')) {
    ctx.ordensDeServicoAtivas = db.all('serviceOrders')
      .filter(o => ['em_analise', 'em_andamento', 'aguardando_peca', 'aguardando_pagamento'].includes(o.status)).slice(-20)
      .map(o => ({ numero: o.numero, cliente: (db.get('clients', o.clienteId) || {}).nome || '', modelo: o.modelo || '', status: o.status, valor: money(o.valorTotal) }));
  }

  if (can(user, 'production')) {
    ctx.producaoPendente = db.all('productionOrders').filter(p => p.status !== 'pronto').slice(-20)
      .map(p => ({ pedido: p.pedidoNumero, cliente: p.clienteNome, produto: `${p.tipo || ''} ${p.stage || ''}`.trim(), comando: p.comando, tucho: p.tucho, status: p.status, previsao: p.previsaoEntrega || '' }));
  }

  if (can(user, 'stock')) {
    const items = db.all('stockItems');
    ctx.estoque = items.slice(0, 80).map(i => ({ item: i.nome, qtd: i.qtd || 0, minimo: i.minimo || 0, abaixoDoMinimo: (i.qtd || 0) < (i.minimo || 0) }));
  }

  if (can(user, 'payables')) {
    const pays = withOverdue(db.all('payables')).filter(p => p.status === 'aberto' || p.status === 'vencida')
      .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
    ctx.contasAPagar = {
      totalEmAberto: money(pays.reduce((s, p) => s + p.valor, 0)),
      vencidas: money(pays.filter(p => p.status === 'vencida').reduce((s, p) => s + p.valor, 0)),
      proximas: pays.slice(0, 20).map(p => ({ descricao: p.descricao, valor: money(p.valor), vencimento: p.vencimento, pagarNoDia: p.dataProgramada || '', status: p.status }))
    };
  }

  if (can(user, 'receivables')) {
    const recs = withOverdue(db.all('receivables')).filter(r => r.status === 'aberto' || r.status === 'vencida')
      .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
    ctx.contasAReceber = {
      totalEmAberto: money(recs.reduce((s, r) => s + r.valor, 0)),
      vencidas: money(recs.filter(r => r.status === 'vencida').reduce((s, r) => s + r.valor, 0)),
      proximas: recs.slice(0, 20).map(r => ({ descricao: r.descricao, cliente: (db.get('clients', r.clienteId) || {}).nome || '', valor: money(r.valor), vencimento: r.vencimento, status: r.status }))
    };
  }

  if (can(user, 'cashflow')) {
    const flows = db.all('cashflow');
    ctx.caixa = {
      saldoAtual: money(flows.reduce((s, f) => s + (f.tipo === 'entrada' ? f.valor : -f.valor), 0)),
      ultimosLancamentos: flows.slice(-12).map(f => ({ data: f.data, tipo: f.tipo, valor: money(f.valor), categoria: f.categoria, origem: f.origem }))
    };
  }

  if (can(user, 'projection')) {
    const proj = domain.projection(t);
    ctx.projecao = proj.janelas.map(j => ({ dias: j.dias, aReceber: money(j.aReceber), aPagar: money(j.aPagar), saldoProjetado: money(j.saldoProjetado) }));
  }

  if (can(user, 'suppliers')) {
    const exps = db.all('supplierExpenses').filter(e => String(e.data || '').slice(0, 7) === month);
    ctx.fornecedoresGastoNoMes = db.all('suppliers').map(f => ({
      fornecedor: f.nome,
      gastoNoMes: money(exps.filter(e => e.fornecedorId === f.id).reduce((s, e) => s + (e.valor || 0), 0))
    })).filter(x => x.gastoNoMes > 0);
  }

  if (can(user, 'hr')) {
    ctx.equipe = db.all('employees').filter(e => e.ativo !== false)
      .map(e => fin ? { nome: e.nome, cargo: e.cargo || '', salario: money(e.salario) } : { nome: e.nome, cargo: e.cargo || '' });
  }

  if (fin && can(user, 'dre')) {
    const r = domain.dre(month);
    ctx.dreDoMes = {
      receitaCaixa: money(r.receita.total), custos: money(r.custos.total), lucroBruto: money(r.lucroBruto),
      despesasOperacionais: money(r.despesasOperacionais.total), despesasFinanceiras: money(r.despesasFinanceiras.total),
      lucroLiquido: money(r.lucroLiquido), margemLiquidaPct: money(r.margemLiquida),
      receitaCompetencia: money(r.receitaCompetencia.total)
    };
  }

  return ctx;
}

function assistantSystemPrompt(user) {
  const fin = can(user, 'finance_sensitive');
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const hoje = domain.today();
  const diaSemana = dias[domain.parseDay(hoje).getDay()];
  return `Você é o assistente interno do sistema de gestão da ${db.settings.companyName} — empresa de cabeçotes de alta performance (venda de cabeçotes prontos Unilateral/Crossflow Stage 1 a 3, serviços de preparação e retrabalho de cabeçotes de clientes).
Hoje é ${diaSemana}, ${hoje.split('-').reverse().join('/')}.
Quem pergunta: ${user.name}${user.cargo ? ' (' + user.cargo + ')' : ''}.

REGRAS:
- Responda SEMPRE em português do Brasil, direto e claro, como um colega de trabalho prestativo.
- Use SOMENTE os dados do JSON abaixo. NUNCA invente números, clientes, datas ou valores.
- Dinheiro no formato R$ 1.234,56 e datas no formato dd/mm/aaaa.
- Para listas, use marcadores; para comparações com vários números, use tabela markdown simples.
- Se os dados fornecidos não respondem à pergunta, diga isso e indique em qual tela do sistema a pessoa encontra (ex.: "veja em Financeiro → Contas a pagar").
- Perguntas sobre como usar o sistema: explique com base nos módulos listados.
- Nos pagamentos programados, a empresa paga às sextas-feiras: a data de pagamento é a sexta anterior ao vencimento.${fin ? '' : `
- O perfil deste usuário NÃO tem acesso a custos, margens, salários e resultados. Se perguntarem sobre isso, explique educadamente que o perfil de acesso não permite ver dados financeiros sensíveis.`}

MÓDULOS DO SISTEMA: Dashboard, Análises (gráficos), Minhas pendências, Clientes, Orçamentos, Vendas/Pedidos, Entrada de cabeçotes, Bens de clientes, Ordens de serviço, Produção, Estoque próprio, Produtos e custos, Compras (com leitura de NF-e), Fornecedores (fechamento mensal), Contas a pagar (agenda de sextas-feiras), Contas a receber (boletos parcelados), Fluxo de caixa, Projeção, DRE, RH, Relatórios (impressão), Administração.

DADOS ATUAIS DO SISTEMA (JSON):
${JSON.stringify(assistantContext(user))}`;
}

route('GET', '/api/assistant/status', 'dashboard', async (req, res, user) => {
  ok(res, {
    configured: !!db.settings.aiApiKey,
    provider: db.settings.aiProvider || 'gemini',
    canConfigure: can(user, 'admin')
  });
});

route('POST', '/api/assistant', 'dashboard', async (req, res, user) => {
  const b = await readBody(req);
  const question = String(b.question || '').trim().slice(0, 2000);
  if (!question) return bad(res, 'Escreva uma pergunta');
  if (!db.settings.aiApiKey) {
    return bad(res, 'O assistente ainda não foi configurado. Peça a um administrador para cadastrar a chave da API em Administração → Configurações.');
  }
  // Histórico curto para dar continuidade à conversa sem estourar o contexto.
  const history = (Array.isArray(b.history) ? b.history : []).slice(-8)
    .filter(m => m && typeof m.text === 'string' && m.text.trim())
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: String(m.text).slice(0, 4000) }));
  const messages = history.concat([{ role: 'user', text: question }]);
  try {
    const r = await ai.ask(
      { provider: db.settings.aiProvider || 'gemini', key: db.settings.aiApiKey, model: db.settings.aiModel },
      assistantSystemPrompt(user), messages
    );
    audit(user, 'assistente', 'assistant', null, question.slice(0, 140));
    ok(res, { answer: r.text, model: r.model });
  } catch (e) {
    send(res, 502, { error: e.message });
  }
});

/* Testa a chave (a informada no corpo ou a já salva) sem precisar salvar antes. */
route('POST', '/api/assistant/test', 'admin', async (req, res, user) => {
  const b = await readBody(req);
  const cfg = {
    provider: (b.provider || db.settings.aiProvider) === 'claude' ? 'claude' : 'gemini',
    key: (typeof b.key === 'string' && b.key.trim()) ? b.key.trim() : db.settings.aiApiKey,
    model: b.model !== undefined ? b.model : db.settings.aiModel
  };
  if (!cfg.key) return bad(res, 'Informe a chave da API (ou salve uma antes de testar)');
  try {
    const r = await ai.ask(cfg, 'Você é um assistente de teste. Responda em português, em uma única frase curta.',
      [{ role: 'user', text: 'Conexão de teste do sistema Jaques Motorsport. Confirme que você está funcionando.' }]);
    ok(res, { ok: true, provider: cfg.provider, model: r.model, answer: r.text.slice(0, 200) });
  } catch (e) {
    send(res, 502, { error: e.message });
  }
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
/* Replica um orçamento como modelo: novo registro independente, com os
   serviços, itens, valores e observações do original — e número novo, data
   de hoje, status aberto, sem aprovação nem vínculo com a entrada original.
   O orçamento de origem não é tocado. */
route('POST', '/api/quotes/:id/replicate', 'quotes', async (req, res, user, params) => {
  const b = await readBody(req);
  const origem = db.get('quotes', params.id);
  if (!origem) return notFound(res);
  const cliente = db.get('clients', b.clienteId || origem.clienteId);
  if (!cliente) return bad(res, 'Escolha o cliente do novo orçamento.');
  const numero = db.nextNumber('orcamento', 1);
  const rec = db.insert('quotes', {
    numero,
    clienteId: cliente.id, cpfCnpj: cliente.cpfCnpj || '',
    entryId: null,                              // a entrada de cabeçote era do original
    dataChegada: '',
    dataOrcamento: domain.today(),
    validadeDias: origem.validadeDias || db.settings.quoteValidityDays,
    previsaoEntrega: '',
    modelo: origem.modelo || '',
    problema: origem.problema || '',
    descricaoServico: origem.descricaoServico || '',
    itens: JSON.parse(JSON.stringify(origem.itens || [])),
    custosAdicionais: origem.custosAdicionais || 0,
    observacoes: origem.observacoes || '',
    total: origem.total,
    status: 'aberto',
    replicadoDe: origem.numero
  });
  audit(user, 'criou', 'quotes', rec.id,
    `Orçamento nº ${numero} replicado do nº ${origem.numero} — ${cliente.nome} — R$ ${Number(origem.total || 0).toFixed(2)}`);
  ok(res, rec);
});

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
    responsavelId: b.responsavelId || suggestAssignee('production'),
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

/* ---- custos do serviço (OS) ----
   custoBase: estimativa por linha (mão de obra, materiais, componentes,
   terceirização, outros). custoReal: o que foi efetivamente gasto.
   O resultado usa o real quando existe; senão, a estimativa. */
const TIPOS_CUSTO_OS = ['mao_obra', 'materiais', 'componentes', 'terceirizacao', 'outros'];

function somaCustos(lista) {
  return (lista || []).reduce((s, c) => s + (Number(c.valor) || 0), 0);
}

/** Resultado do serviço: valor − custo (real se houver, senão estimado). */
function resultadoOS(os) {
  const bruto = Number(os.valorTotal) || 0;
  const estimado = somaCustos(os.custoBase);
  const real = somaCustos(os.custoReal);
  const usado = (os.custoReal || []).length ? real : estimado;
  const resultado = bruto - usado;
  return {
    bruto, custoEstimado: estimado, custoReal: real,
    usouReal: (os.custoReal || []).length > 0, custoUsado: usado,
    resultado, margem: bruto > 0 ? (resultado / bruto) * 100 : 0,
    desvio: (os.custoReal || []).length ? real - estimado : 0
  };
}

route('GET', '/api/os/:id/custos', 'finance_sensitive', async (req, res, user, params) => {
  const os = db.get('serviceOrders', params.id);
  if (!os) return notFound(res);
  ok(res, {
    tipos: TIPOS_CUSTO_OS,
    custoBase: os.custoBase || [], custoReal: os.custoReal || [],
    resultado: resultadoOS(os)
  });
});

route('PUT', '/api/os/:id/custos', 'finance_sensitive', async (req, res, user, params) => {
  const b = await readBody(req);
  const os = db.get('serviceOrders', params.id);
  if (!os) return notFound(res);
  const limpa = lista => (Array.isArray(lista) ? lista : [])
    .filter(c => c && (c.descricao || c.valor))
    .map(c => ({
      tipo: TIPOS_CUSTO_OS.includes(c.tipo) ? c.tipo : 'outros',
      descricao: String(c.descricao || '').slice(0, 160),
      valor: Number(c.valor) || 0
    }));
  const patch = {};
  if (b.custoBase !== undefined) patch.custoBase = limpa(b.custoBase);
  if (b.custoReal !== undefined) patch.custoReal = limpa(b.custoReal);
  const rec = db.update('serviceOrders', os.id, patch);
  audit(user, 'alterou', 'serviceOrders', os.id,
    `Custos da OS nº ${os.numero} — estimado R$ ${somaCustos(rec.custoBase).toFixed(2)}, real R$ ${somaCustos(rec.custoReal).toFixed(2)}`);
  ok(res, { custoBase: rec.custoBase || [], custoReal: rec.custoReal || [], resultado: resultadoOS(rec) });
});

/* ---- editar / duplicar / cancelar OS ---- */
route('PUT', '/api/os/:id', 'os', async (req, res, user, params) => {
  const antes = db.get('serviceOrders', params.id);
  if (!antes) return notFound(res);
  const b = await readBody(req);

  const temFinanceiro = db.all('receivables').some(r => r.refType === 'serviceOrders' && r.refId === antes.id && r.status === 'paga')
    || db.all('cashflow').some(c => c.refType === 'serviceOrders' && c.refId === antes.id);
  const mudaValor = b.valorTotal !== undefined && Number(b.valorTotal) !== antes.valorTotal;
  if (mudaValor && temFinanceiro) {
    return bad(res, 'Esta OS já tem pagamento registrado. Estorne o recebimento antes de mudar o valor — assim o caixa não fica diferente da OS.');
  }

  const patch = {};
  for (const k of ['modelo', 'problema', 'descricaoServico', 'observacoes', 'previsaoEntrega', 'identificacao', 'nfRetorno']) {
    if (b[k] !== undefined) patch[k] = b[k];
  }
  if (b.clienteId !== undefined) {
    const c = db.get('clients', b.clienteId);
    if (!c) return bad(res, 'Cliente inválido');
    patch.clienteId = c.id;
  }
  if (b.responsavelId !== undefined) patch.responsavelId = b.responsavelId || null;
  if (b.itens !== undefined) {
    const { items, total, extras } = computeQuoteTotals(b.itens, b.custosAdicionais);
    patch.itens = items; patch.custosAdicionais = extras; patch.valorTotal = total;
    if (temFinanceiro && total !== antes.valorTotal) {
      return bad(res, 'Esta OS já tem pagamento registrado. Estorne o recebimento antes de mudar os serviços.');
    }
  } else if (b.valorTotal !== undefined) {
    patch.valorTotal = Number(b.valorTotal) || 0;
  }

  const NOMES = { clienteId: 'Cliente', modelo: 'Modelo', valorTotal: 'Valor', previsaoEntrega: 'Previsão',
                  descricaoServico: 'Descrição', problema: 'Problema', observacoes: 'Observações' };
  const mudou = Object.keys(patch)
    .filter(k => NOMES[k] && JSON.stringify(antes[k] ?? '') !== JSON.stringify(patch[k] ?? ''))
    .map(k => `${NOMES[k]}: ${antes[k] ?? '—'} → ${patch[k] === '' ? '—' : patch[k]}`);
  if (patch.itens) mudou.push(`Serviços: ${(antes.itens || []).length} → ${patch.itens.length}`);

  const hist = (antes.historico || []).concat([{
    at: new Date().toISOString(), por: user.name,
    evento: 'OS editada' + (mudou.length ? ' — ' + mudou.join('; ') : '')
  }]);
  patch.historico = hist;
  const os = db.update('serviceOrders', antes.id, patch);
  audit(user, 'alterou', 'serviceOrders', os.id, `OS nº ${os.numero} editada${mudou.length ? ' — ' + mudou.join('; ') : ''}`);
  ok(res, os);
});

route('POST', '/api/os/:id/duplicate', 'os', async (req, res, user, params) => {
  const origem = db.get('serviceOrders', params.id);
  if (!origem) return notFound(res);
  const b = await readBody(req);
  const cliente = db.get('clients', b.clienteId || origem.clienteId);
  if (!cliente) return bad(res, 'Cliente inválido');
  const numero = db.nextNumber('os', 1);
  const os = db.insert('serviceOrders', {
    numero,
    quoteId: null, entryId: null, clienteId: cliente.id,
    identificacao: '',
    modelo: origem.modelo, problema: origem.problema, descricaoServico: origem.descricaoServico,
    itens: JSON.parse(JSON.stringify(origem.itens || [])),
    custosAdicionais: origem.custosAdicionais || 0,
    custoBase: JSON.parse(JSON.stringify(origem.custoBase || [])),  // a estimativa serve de modelo
    custoReal: [],                                                  // o real é sempre desta OS
    observacoes: origem.observacoes || '',
    valorTotal: origem.valorTotal,
    status: 'em_analise',
    previsaoEntrega: '', responsavelId: suggestAssignee('production'),
    dataFinalizacao: null, pagamentoStatus: 'pendente',
    nfRetorno: '', envioStatus: 'na_empresa',
    duplicadaDe: origem.numero,
    historico: [{ at: new Date().toISOString(), por: user.name, evento: `OS criada como cópia da nº ${origem.numero}` }]
  });
  audit(user, 'criou', 'serviceOrders', os.id, `OS nº ${numero} duplicada da nº ${origem.numero} — ${cliente.nome}`);
  ok(res, os);
});

route('DELETE', '/api/os/:id', 'os', async (req, res, user, params) => {
  const os = db.get('serviceOrders', params.id);
  if (!os) return notFound(res);
  const recs = db.all('receivables').filter(r => r.refType === 'serviceOrders' && r.refId === os.id);
  const pagas = recs.filter(r => r.status === 'paga');
  const caixa = db.all('cashflow').filter(c => c.refType === 'serviceOrders' && c.refId === os.id);
  if (pagas.length || caixa.length) {
    return bad(res, `Esta OS já tem ${pagas.length + caixa.length} movimentação(ões) financeira(s) registrada(s). Em vez de excluir, use Cancelar — o histórico e o financeiro ficam preservados.`);
  }
  for (const r of recs) db.remove('receivables', r.id);
  if (os.quoteId) db.update('quotes', os.quoteId, { osId: null });
  if (os.entryId) db.update('headEntries', os.entryId, { osId: null, status: 'orcado' });
  db.remove('serviceOrders', os.id);
  audit(user, 'excluiu', 'serviceOrders', os.id, `OS nº ${os.numero} excluída — ${recs.length} recebível(is) em aberto removido(s)`);
  ok(res, { ok: true });
});

route('POST', '/api/os/:id/cancel', 'os', async (req, res, user, params) => {
  const b = await readBody(req);
  const os = db.get('serviceOrders', params.id);
  if (!os) return notFound(res);
  if (os.status === 'cancelada') return bad(res, 'Esta OS já está cancelada.');
  // Recebíveis em aberto são cancelados; os recebidos ficam (o dinheiro entrou).
  const recs = db.all('receivables').filter(r => r.refType === 'serviceOrders' && r.refId === os.id && r.status !== 'paga');
  for (const r of recs) db.update('receivables', r.id, { status: 'cancelada' });
  const hist = (os.historico || []).concat([{
    at: new Date().toISOString(), por: user.name,
    evento: `OS cancelada${b.motivo ? ' — ' + b.motivo : ''}${recs.length ? ` (${recs.length} parcela(s) em aberto cancelada(s))` : ''}`
  }]);
  db.update('serviceOrders', os.id, { status: 'cancelada', historico: hist });
  audit(user, 'cancelou', 'serviceOrders', os.id, `OS nº ${os.numero} cancelada${b.motivo ? ' — ' + b.motivo : ''}`);
  ok(res, db.get('serviceOrders', os.id));
});

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

/* ---- vendas ----
   Uma venda tem itens de dois tipos:
     kind 'cabecote' — produto fabricado; consome componentes na PRODUÇÃO
                       (quando a ordem fica "pronto"), não na venda;
     kind 'peca'     — item do estoque próprio revendido; baixa na hora.
   A distinção importa para o estoque não ser baixado duas vezes. */

/** Monta e valida os itens da venda. Devolve { itens, valorTotal, custoBaseTotal } ou { erro }. */
function montarItensVenda(lista) {
  let valorTotal = 0, custoBaseTotal = 0;
  const itens = [];
  for (const i of lista) {
    const qtd = Math.max(1, Number(i.qtd) || 1);
    if (i.kind === 'peca') {
      const it = db.get('stockItems', i.stockItemId);
      if (!it) return { erro: 'Peça do estoque inválida' };
      const unit = Number(i.valorUnit) || 0;
      const tot = qtd * unit;
      valorTotal += tot;
      custoBaseTotal += qtd * (Number(it.custoUnit) || 0);
      itens.push({ kind: 'peca', stockItemId: it.id, produto: it.nome, qtd, valorUnit: unit, total: tot });
      continue;
    }
    const prod = db.get('products', i.productId);
    if (!prod) return { erro: 'Produto inválido' };
    const v = domain.validateConfig(prod.stage, i.comando, i.tucho);
    if (!v.ok) return { erro: v.error };
    const unit = Number(i.valorUnit) || prod.preco || 0;
    const tot = qtd * unit;
    valorTotal += tot;
    custoBaseTotal += qtd * (prod.custoBase || 0);
    itens.push({ kind: 'cabecote', productId: prod.id, produto: prod.nome, tipo: prod.tipo, stage: prod.stage,
                 comando: i.comando, tucho: String(i.tucho), qtd, valorUnit: unit, total: tot });
  }
  return { itens, valorTotal, custoBaseTotal };
}

/** Baixa (ou devolve) o estoque das peças de uma venda, uma única vez. */
function estoquePecasDaVenda(sale, user, { devolver } = {}) {
  const jaBaixado = !!sale.estoquePecasBaixado;
  if (devolver ? !jaBaixado : jaBaixado) return;
  for (const it of (sale.itens || []).filter(x => x.kind === 'peca')) {
    moveStock(it.stockItemId, devolver ? 'entrada' : 'saida', it.qtd, 'sales', sale.id,
      `${devolver ? 'Estorno da venda' : 'Venda'} nº ${sale.numero}`, user);
  }
  db.update('sales', sale.id, { estoquePecasBaixado: !devolver });
}

/** Desfaz tudo que uma venda gerou: produção não iniciada, recebíveis em
    aberto, caixa e estoque de peças. Devolve o que não pôde ser desfeito. */
function reverterVenda(sale, user) {
  const travas = [];

  // Produção: só remove o que ainda não consumiu componentes.
  const pos = db.all('productionOrders').filter(p => p.saleId === sale.id);
  for (const po of pos) {
    if (po.estoqueBaixado) travas.push(`ordem de produção #${po.id} já consumiu componentes do estoque`);
    else db.remove('productionOrders', po.id);
  }

  // Recebíveis: em aberto são removidos; recebidos viram trava.
  const recs = db.all('receivables').filter(r => r.refType === 'sales' && r.refId === sale.id);
  for (const r of recs) {
    if (r.status === 'paga' && !r.auto) travas.push(`parcela "${r.descricao}" já foi recebida`);
    else db.remove('receivables', r.id);
  }

  // Recebimentos avulsos lançados na venda.
  if ((sale.recebimentos || []).length) travas.push(`${sale.recebimentos.length} recebimento(s) já registrado(s)`);

  if (travas.length) return travas;

  // Sem travas: limpa caixa e devolve as peças ao estoque.
  for (const c of db.all('cashflow').filter(c => c.refType === 'sales' && c.refId === sale.id)) {
    db.remove('cashflow', c.id);
  }
  estoquePecasDaVenda(sale, user, { devolver: true });
  return null;
}

/** Cria as ordens de produção dos cabeçotes de uma venda. */
function gerarProducaoDaVenda(sale, cliente, user) {
  const itens = sale.itens || [], numero = sale.numero;
  // Ordens de produção (uma por unidade de cabeçote) com checklist automático.
  for (const item of itens.filter(i => i.kind !== 'peca')) {
    for (let u = 0; u < item.qtd; u++) {
      db.insert('productionOrders', {
        saleId: sale.id, pedidoNumero: numero, clienteNome: cliente.nome,
        productId: item.productId, produto: item.produto,
        tipo: item.tipo, stage: item.stage, comando: item.comando, tucho: item.tucho,
        checklist: domain.productionChecklist(item.tipo, item.stage, item.comando, item.tucho),
        status: 'nao_produzido', responsavelId: suggestAssignee('production'),
        previsaoEntrega: sale.previsaoEntrega
      });
    }
  }
}

/** Cria contas a receber / caixa de uma venda, conforme a forma de pagamento. */
function gerarFinanceiroDaVenda(sale, cliente, user) {
  const { valorTotal, numero, pagamento } = sale;
  const b = {};
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
      // auto: lançado pelo próprio sistema junto com a venda (não é uma baixa
      // que alguém confirmou), então pode ser desfeito ao editar/excluir.
      status: 'paga', auto: true, dataRecebimento: sale.dataPedido, parcela: 1, parcelas: 1
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
}

route('POST', '/api/sales', 'sales', async (req, res, user) => {
  const b = await readBody(req);
  const cliente = db.get('clients', b.clienteId);
  if (!cliente) return bad(res, 'Cliente é obrigatório');
  if (!Array.isArray(b.itens) || !b.itens.length) return bad(res, 'A venda precisa de ao menos um item');

  const montado = montarItensVenda(b.itens);
  if (montado.erro) return bad(res, montado.erro);
  const { itens, valorTotal, custoBaseTotal } = montado;

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
    recebimentos: [],          // pagamentos parciais: [{valor, data, forma, obs}]
    observacoes: b.observacoes || '',
    status: 'nao_produzido' // nao_produzido → preparacao → usinagem → montagem → pronto → enviado → entregue
  });

  // Peças do estoque saem na hora da venda (cabeçotes saem na produção).
  estoquePecasDaVenda(sale, user);
  gerarProducaoDaVenda(sale, cliente, user);
  gerarFinanceiroDaVenda(sale, cliente, user);

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

/* Editar venda: atualiza o lançamento existente. Se mexer em itens, valor
   ou pagamento, desfaz o que a venda gerou e refaz — nunca duplica. */
route('PUT', '/api/sales/:id', 'sales', async (req, res, user, params) => {
  const antes = db.get('sales', params.id);
  if (!antes) return notFound(res);
  const b = await readBody(req);

  const mexeEstruturaOuDinheiro = b.itens !== undefined || b.pagamento !== undefined;
  let itens = antes.itens, valorTotal = antes.valorTotal, custoBaseTotal = antes.custoBaseTotal;
  if (b.itens !== undefined) {
    if (!Array.isArray(b.itens) || !b.itens.length) return bad(res, 'A venda precisa de ao menos um item');
    const m = montarItensVenda(b.itens);
    if (m.erro) return bad(res, m.erro);
    ({ itens, valorTotal, custoBaseTotal } = m);
  }

  if (mexeEstruturaOuDinheiro) {
    const travas = reverterVenda(antes, user);
    if (travas) {
      return bad(res, 'Não dá para alterar os itens ou o pagamento desta venda porque ' + travas.join('; ') +
        '. Desfaça o recebimento (ou o estoque da produção) antes, ou edite apenas os dados cadastrais.');
    }
  }

  const cliente = b.clienteId ? db.get('clients', b.clienteId) : db.get('clients', antes.clienteId);
  if (!cliente) return bad(res, 'Cliente inválido');
  const pagamento = b.pagamento !== undefined ? Object.assign({}, b.pagamento) : antes.pagamento;
  pagamento.taxa = Number(pagamento.taxa) || 0;
  pagamento.valorLiquido = valorTotal - pagamento.taxa;

  const patch = {
    clienteId: cliente.id,
    cidade: b.cidade !== undefined ? b.cidade : antes.cidade,
    estado: b.estado !== undefined ? b.estado : antes.estado,
    dataPedido: b.dataPedido || antes.dataPedido,
    previsaoEntrega: b.previsaoEntrega !== undefined ? b.previsaoEntrega : antes.previsaoEntrega,
    itens, valorTotal, custoBaseTotal, pagamento,
    custosAdicionais: b.custosAdicionais !== undefined ? b.custosAdicionais : antes.custosAdicionais,
    observacoes: b.observacoes !== undefined ? b.observacoes : antes.observacoes
  };
  if (mexeEstruturaOuDinheiro) patch.estoquePecasBaixado = false;

  const sale = db.update('sales', antes.id, patch);

  if (mexeEstruturaOuDinheiro) {
    estoquePecasDaVenda(sale, user);
    gerarProducaoDaVenda(sale, cliente, user);
    gerarFinanceiroDaVenda(sale, cliente, user);
  }

  const mudou = [];
  if (antes.valorTotal !== sale.valorTotal) mudou.push(`Valor: ${antes.valorTotal} → ${sale.valorTotal}`);
  if (antes.clienteId !== sale.clienteId) mudou.push('Cliente alterado');
  if (JSON.stringify(antes.itens) !== JSON.stringify(sale.itens)) mudou.push(`Itens: ${antes.itens.length} → ${sale.itens.length}`);
  audit(user, 'alterou', 'sales', sale.id, `Pedido nº ${sale.numero} editado${mudou.length ? ' — ' + mudou.join('; ') : ''}`);
  ok(res, sale);
});

/* Duplicar: nova venda independente, com a original como modelo. */
route('POST', '/api/sales/:id/duplicate', 'sales', async (req, res, user, params) => {
  const origem = db.get('sales', params.id);
  if (!origem) return notFound(res);
  const b = await readBody(req);
  const cliente = db.get('clients', b.clienteId || origem.clienteId);
  if (!cliente) return bad(res, 'Cliente inválido');

  const m = montarItensVenda(origem.itens.map(i => i.kind === 'peca'
    ? { kind: 'peca', stockItemId: i.stockItemId, qtd: i.qtd, valorUnit: i.valorUnit }
    : { productId: i.productId, comando: i.comando, tucho: i.tucho, qtd: i.qtd, valorUnit: i.valorUnit }));
  if (m.erro) return bad(res, m.erro);

  const numero = db.nextNumber('pedido', 1);
  const sale = db.insert('sales', {
    numero, clienteId: cliente.id,
    cidade: cliente.cidade || '', estado: cliente.estado || '',
    dataPedido: b.dataPedido || domain.today(),
    previsaoEntrega: '', dataEnvio: null,
    itens: m.itens, valorTotal: m.valorTotal, custoBaseTotal: m.custoBaseTotal,
    custosAdicionais: [],
    pagamento: { forma: (origem.pagamento || {}).forma || 'pix', taxa: 0, valorLiquido: m.valorTotal },
    recebimentos: [],
    observacoes: origem.observacoes || '',
    status: 'nao_produzido',
    duplicadoDe: origem.numero
  });
  estoquePecasDaVenda(sale, user);
  gerarProducaoDaVenda(sale, cliente, user);
  gerarFinanceiroDaVenda(sale, cliente, user);
  audit(user, 'criou', 'sales', sale.id, `Pedido nº ${numero} duplicado do nº ${origem.numero} — ${cliente.nome}`);
  ok(res, sale);
});

route('DELETE', '/api/sales/:id', 'sales', async (req, res, user, params) => {
  const sale = db.get('sales', params.id);
  if (!sale) return notFound(res);
  const travas = reverterVenda(sale, user);
  if (travas) {
    return bad(res, 'Esta venda não pode ser excluída porque ' + travas.join('; ') +
      '. Cancele o recebimento (Contas a receber) ou estorne a produção antes — assim o estoque e o caixa não ficam errados.');
  }
  db.remove('sales', sale.id);
  audit(user, 'excluiu', 'sales', sale.id, `Pedido nº ${sale.numero} excluído — produção, recebíveis e estoque de peças estornados`);
  ok(res, { ok: true });
});

/* Recebimento parcial: entrada + saldo na entrega, por exemplo.
   O saldo continua em contas a receber e na projeção. */
route('POST', '/api/sales/:id/receive', 'receivables', async (req, res, user, params) => {
  const b = await readBody(req);
  const sale = db.get('sales', params.id);
  if (!sale) return notFound(res);
  const valor = Number(b.valor) || 0;
  if (valor <= 0) return bad(res, 'Informe o valor recebido.');
  const recebido = (sale.recebimentos || []).reduce((s, r) => s + r.valor, 0);
  const saldo = Math.round((sale.valorTotal - recebido) * 100) / 100;
  if (valor > saldo + 0.005) {
    return bad(res, `O saldo em aberto é R$ ${saldo.toFixed(2)} — não dá para receber R$ ${valor.toFixed(2)}.`);
  }
  const data = b.data || domain.today();
  const rec = { valor, data, forma: b.forma || 'pix', obs: b.obs || '' };
  const lista = (sale.recebimentos || []).concat([rec]);
  db.update('sales', sale.id, { recebimentos: lista });
  db.insert('cashflow', {
    tipo: 'entrada', valor, data, conta: b.conta || 'principal',
    categoria: 'venda_cabecote', origem: `Pedido nº ${sale.numero} — recebimento parcial`,
    documento: '', refType: 'sales', refId: sale.id, descricao: `Recebimento (${rec.forma})`
  });

  // A cobrança cheia da venda dá lugar ao saldo — senão o mesmo dinheiro
  // apareceria duas vezes em Contas a receber (o total E o que falta).
  for (const r of db.all('receivables').filter(r =>
    r.refType === 'sales' && r.refId === sale.id && r.origem !== 'saldo' && r.status !== 'paga')) {
    db.remove('receivables', r.id);
  }

  // O que ainda falta vira/atualiza a conta a receber do saldo.
  const novoSaldo = Math.round((sale.valorTotal - lista.reduce((s, r) => s + r.valor, 0)) * 100) / 100;
  const saldoAberto = db.all('receivables').find(r =>
    r.refType === 'sales' && r.refId === sale.id && r.origem === 'saldo' && r.status !== 'paga');
  if (novoSaldo > 0.005) {
    const dados = {
      clienteId: sale.clienteId, origem: 'saldo', refType: 'sales', refId: sale.id,
      descricao: `Pedido nº ${sale.numero} — saldo em aberto`,
      forma: b.forma || 'pix', valor: novoSaldo,
      vencimento: b.vencimentoSaldo || sale.previsaoEntrega || domain.addDays(data, 30),
      status: 'aberto', parcela: 1, parcelas: 1
    };
    if (saldoAberto) db.update('receivables', saldoAberto.id, { valor: novoSaldo, vencimento: dados.vencimento });
    else db.insert('receivables', dados);
  } else if (saldoAberto) {
    db.update('receivables', saldoAberto.id, { status: 'paga', dataRecebimento: data });
  }

  audit(user, 'recebeu', 'sales', sale.id,
    `Pedido nº ${sale.numero} — recebido R$ ${valor.toFixed(2)} (${rec.forma}); saldo R$ ${novoSaldo.toFixed(2)}`);
  ok(res, { recebido: lista.reduce((s, r) => s + r.valor, 0), saldo: novoSaldo });
});

route('POST', '/api/sales/:id/unreceive', 'receivables', async (req, res, user, params) => {
  const b = await readBody(req);
  const sale = db.get('sales', params.id);
  if (!sale) return notFound(res);
  const idx = Number(b.index);
  const lista = (sale.recebimentos || []).slice();
  if (!lista[idx]) return bad(res, 'Recebimento não encontrado.');
  const [removido] = lista.splice(idx, 1);
  db.update('sales', sale.id, { recebimentos: lista });
  // Estorna a entrada correspondente no caixa (mesma data e valor).
  const cx = db.all('cashflow').find(c => c.refType === 'sales' && c.refId === sale.id &&
    c.valor === removido.valor && c.data === removido.data && c.tipo === 'entrada');
  if (cx) db.remove('cashflow', cx.id);
  const novoSaldo = Math.round((sale.valorTotal - lista.reduce((s, r) => s + r.valor, 0)) * 100) / 100;
  const saldoRec = db.all('receivables').find(r => r.refType === 'sales' && r.refId === sale.id && r.origem === 'saldo');
  if (saldoRec) db.update('receivables', saldoRec.id, { valor: novoSaldo, status: 'aberto', dataRecebimento: null });
  audit(user, 'estornou', 'sales', sale.id, `Recebimento de R$ ${removido.valor.toFixed(2)} desfeito — saldo R$ ${novoSaldo.toFixed(2)}`);
  ok(res, { saldo: novoSaldo });
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
/**
 * Gera as contas a pagar de uma compra, respeitando o agendamento escolhido
 * (sexta anterior, imediato, a cada 30 dias, início do mês, data combinada).
 * Usada na criação e na edição — a edição apaga as parcelas em aberto e
 * chama isto de novo, o que garante que nunca exista obrigação duplicada.
 */
function gerarContasPagarDaCompra(rec, { intervaloDias } = {}) {
  const tipo = rec.tipoPagamento || 'programado';
  const base = domain.programarPagamento(tipo, rec.data, rec.vencimento || '', {
    diaMes: rec.agendamentoDia, dataManual: rec.agendamentoData
  });
  const parcels = rec.parcelas > 1
    ? domain.generateInstallments(rec.data, rec.valor, rec.parcelas, intervaloDias || 30)
    : [{ parcela: 1, parcelas: 1, vencimento: base.vencimento, valor: rec.valor }];
  for (const p of parcels) {
    // Com várias parcelas, cada uma agenda pela própria data de vencimento;
    // com uma só, vale o cálculo base (que já partiu do vencimento certo).
    const prog = rec.parcelas > 1
      ? domain.programarPagamento(tipo, rec.data, p.vencimento,
          { diaMes: rec.agendamentoDia, dataManual: rec.agendamentoData })
      : base;
    db.insert('payables', {
      descricao: `Compra ${rec.fornecedorNome || ''} ${rec.documentoNumero ? 'NF ' + rec.documentoNumero : ''}`.trim()
        + (p.parcelas > 1 ? ` — parcela ${p.parcela}/${p.parcelas}` : ''),
      categoria: rec.categoria, fornecedorId: rec.fornecedorId,
      valor: p.valor, vencimento: p.vencimento,
      tipoPagamento: tipo,
      dataProgramada: prog.dataProgramada,
      status: 'aberto', refType: 'purchases', refId: rec.id, documento: rec.documentoNumero
    });
  }
}

route('POST', '/api/purchases', 'purchases', async (req, res, user) => {
  const b = await readBody(req);
  const forn = b.fornecedorId ? db.get('suppliers', b.fornecedorId) : null;
  const valor = Number(b.valor) || (b.itens || []).reduce((s, i) => s + (Number(i.total) || 0), 0);
  let rec;
  try {
    rec = db.insert('purchases', {
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
      // programado | imediato | a_cada_30 | inicio_mes | outro
      tipoPagamento: b.tipoPagamento || 'programado',
      agendamentoDia: b.agendamentoDia ? Number(b.agendamentoDia) : null,
      agendamentoData: b.agendamentoData || '',
      vinculo: b.vinculo || { tipo: 'sem_vinculo', refId: null },
      status: 'registrada'
    });
    if (b.gerarContasPagar !== false && valor > 0) {
      gerarContasPagarDaCompra(rec, { intervaloDias: b.intervaloDias });
    }
  } catch (e) {
    if (rec) db.remove('purchases', rec.id);
    return bad(res, e.message);
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
/* O que um fornecedor tem em aberto: as compras cujas contas a pagar ainda
   não foram quitadas + os gastos diários do fechamento mensal. Calculado
   sempre a partir dos lançamentos — nunca digitado à mão. */
function abertoDoFornecedor(fornecedorId) {
  const compras = db.all('purchases').filter(c => c.fornecedorId === Number(fornecedorId));
  const itens = [];
  for (const c of compras) {
    const parcelas = db.all('payables').filter(p => p.refType === 'purchases' && p.refId === c.id);
    // Sem conta a pagar gerada, a compra conta como aberta pelo próprio valor.
    const emAberto = parcelas.length
      ? parcelas.filter(p => p.status !== 'pago' && p.status !== 'cancelado')
      : [{ valor: c.valor, vencimento: c.vencimento || '', status: 'aberto' }];
    if (!emAberto.length) continue;
    const vinc = c.vinculo || {};
    itens.push({
      origem: 'compra', id: c.id, data: c.data,
      descricao: (c.itens || []).map(i => i.descricao).filter(Boolean).join(', ')
        || App_categoriaNome(c.categoria),
      vinculo: vinc.refNome || (vinc.tipo ? vinc.tipo : ''),
      documento: c.documentoNumero ? `${(c.documentoTipo || '').toUpperCase()} ${c.documentoNumero}` : '',
      valor: emAberto.reduce((s, p) => s + (Number(p.valor) || 0), 0),
      parcelas: parcelas.length,
      status: parcelas.length ? 'aguardando pagamento' : 'sem conta a pagar'
    });
  }
  for (const e of db.all('supplierExpenses').filter(e => e.fornecedorId === Number(fornecedorId) && e.status === 'aberto')) {
    itens.push({
      origem: 'gasto', id: e.id, data: e.data, descricao: e.descricao,
      vinculo: e.osRef || (e.clienteId ? (db.get('clients', e.clienteId) || {}).nome || '' : ''),
      documento: '', valor: Number(e.valor) || 0, parcelas: 0, status: 'aberto'
    });
  }
  itens.sort((a, b) => (a.data || '') < (b.data || '') ? -1 : 1);
  return { total: itens.reduce((s, i) => s + i.valor, 0), itens };
}

/* Nome legível da categoria de compra, para a descrição da conferência. */
function App_categoriaNome(k) {
  const m = {
    componentes: 'Componentes', materiais: 'Materiais', mao_obra_direta: 'Mão de obra direta',
    terceirizacao: 'Terceirização', custo_producao: 'Outros custos de produção',
    pos_operacao: 'Pós-operação', manutencao: 'Manutenção',
    despesa_operacional: 'Despesas operacionais', outros: 'Outros', custo_direto: 'Custos diretos'
  };
  return m[k] || k || 'Compra';
}

/* Panorama de um fornecedor: total em aberto + o detalhamento que permite
   conferir a cobrança do mês contra o que a empresa registrou. */
route('GET', '/api/suppliers/:id/open', 'purchases', async (req, res, user, params) => {
  const forn = db.get('suppliers', params.id);
  if (!forn) return notFound(res);
  const r = abertoDoFornecedor(forn.id);
  ok(res, { fornecedor: { id: forn.id, nome: forn.nome }, total: r.total, itens: r.itens });
});

/* Totais de todos os fornecedores de uma vez (para a lista). */
route('GET', '/api/suppliers/open-summary', 'purchases', async (req, res) => {
  const out = {};
  for (const f of db.all('suppliers')) out[f.id] = abertoDoFornecedor(f.id).total;
  ok(res, out);
});

/* ---- edição de compra ----
   Regras inegociáveis do pedido:
   - editar ATUALIZA o lançamento, nunca cria outro;
   - as contas a pagar ligadas são atualizadas, nunca duplicadas;
   - o histórico guarda quem alterou, quando e cada valor antes → depois. */
route('PUT', '/api/purchases/:id', 'purchases', async (req, res, user, params) => {
  const antes = db.get('purchases', params.id);
  if (!antes) return notFound(res);
  const b = await readBody(req);

  const ligadas = db.all('payables').filter(p => p.refType === 'purchases' && p.refId === antes.id);
  const pagas = ligadas.filter(p => p.status === 'pago');

  const forn = b.fornecedorId ? db.get('suppliers', b.fornecedorId) : null;
  const valor = b.valor !== undefined
    ? (Number(b.valor) || (b.itens || []).reduce((s, i) => s + (Number(i.total) || 0), 0))
    : antes.valor;

  const patch = {
    fornecedorId: forn ? forn.id : (b.fornecedorId === null ? null : antes.fornecedorId),
    fornecedorNome: forn ? forn.nome : (b.fornecedorNome !== undefined ? b.fornecedorNome : antes.fornecedorNome),
    data: b.data || antes.data,
    itens: b.itens !== undefined ? b.itens : antes.itens,
    valor,
    formaPagamento: b.formaPagamento !== undefined ? b.formaPagamento : antes.formaPagamento,
    vencimento: b.vencimento !== undefined ? b.vencimento : antes.vencimento,
    parcelas: b.parcelas !== undefined ? (Number(b.parcelas) || 1) : antes.parcelas,
    documentoTipo: b.documentoTipo || antes.documentoTipo,
    documentoNumero: b.documentoNumero !== undefined ? b.documentoNumero : antes.documentoNumero,
    categoria: b.categoria || antes.categoria,
    observacoes: b.observacoes !== undefined ? b.observacoes : antes.observacoes,
    tipoPagamento: b.tipoPagamento || antes.tipoPagamento || 'programado',
    agendamentoDia: b.agendamentoDia !== undefined ? (b.agendamentoDia ? Number(b.agendamentoDia) : null) : antes.agendamentoDia,
    agendamentoData: b.agendamentoData !== undefined ? b.agendamentoData : antes.agendamentoData,
    vinculo: b.vinculo !== undefined ? b.vinculo : antes.vinculo
  };

  // O que muda o dinheiro (valor, parcelas, vencimento, agendamento) só pode
  // mudar enquanto nenhuma parcela foi paga — senão o caixa já registrado
  // divergiria do lançamento. O caminho é desfazer o pagamento antes.
  const mudouFinanceiro =
    patch.valor !== antes.valor ||
    patch.parcelas !== antes.parcelas ||
    patch.vencimento !== antes.vencimento ||
    patch.tipoPagamento !== (antes.tipoPagamento || 'programado') ||
    patch.agendamentoDia !== (antes.agendamentoDia || null) ||
    (patch.agendamentoData || '') !== (antes.agendamentoData || '') ||
    patch.data !== antes.data;
  if (mudouFinanceiro && pagas.length) {
    return bad(res, `Esta compra já tem ${pagas.length} parcela(s) paga(s). Valor, parcelas, vencimento e agendamento não podem mudar depois do pagamento — desfaça o pagamento na tela de Contas a pagar e edite em seguida. Os demais campos (categoria, vínculo, descrição…) podem ser editados normalmente.`);
  }

  // Histórico antes → depois, campo a campo, só do que mudou.
  const NOMES = {
    fornecedorNome: 'Fornecedor', data: 'Data', valor: 'Valor', formaPagamento: 'Forma de pagamento',
    vencimento: 'Vencimento', parcelas: 'Parcelas', documentoTipo: 'Tipo de documento',
    documentoNumero: 'Nº do documento', categoria: 'Categoria', observacoes: 'Observações',
    tipoPagamento: 'Agendamento', agendamentoDia: 'Dia do pagamento', agendamentoData: 'Data combinada'
  };
  const mudancas = [];
  for (const k of Object.keys(NOMES)) {
    const a = antes[k], d = patch[k];
    if (JSON.stringify(a ?? '') !== JSON.stringify(d ?? '')) {
      mudancas.push(`${NOMES[k]}: ${a === undefined || a === null || a === '' ? '—' : a} → ${d === '' || d == null ? '—' : d}`);
    }
  }
  const vincAntes = JSON.stringify(antes.vinculo || {}), vincDepois = JSON.stringify(patch.vinculo || {});
  if (vincAntes !== vincDepois) {
    const nome = v => v && v.tipo ? `${v.tipo}${v.refNome ? ' (' + v.refNome + ')' : ''}` : '—';
    mudancas.push(`Vínculo: ${nome(antes.vinculo)} → ${nome(patch.vinculo)}`);
  }
  if (JSON.stringify(antes.itens || []) !== JSON.stringify(patch.itens || [])) {
    mudancas.push(`Itens: ${(antes.itens || []).length} → ${(patch.itens || []).length} linha(s)`);
  }

  let rec;
  try {
    // Valida o agendamento ANTES de gravar qualquer coisa.
    domain.programarPagamento(patch.tipoPagamento, patch.data, patch.vencimento || '',
      { diaMes: patch.agendamentoDia, dataManual: patch.agendamentoData });

    rec = db.update('purchases', antes.id, patch);

    if (mudouFinanceiro) {
      // Regenera as parcelas em aberto a partir do zero: apagar + recriar é o
      // que garante que nunca fique obrigação duplicada nem órfã.
      for (const p of ligadas.filter(p => p.status !== 'pago')) db.remove('payables', p.id);
      gerarContasPagarDaCompra(rec, { intervaloDias: b.intervaloDias });
    } else {
      // Só metadados: propaga aos lançamentos ligados (inclusive pagos —
      // categoria e documento são classificação, não dinheiro).
      for (const p of ligadas) {
        const sufixo = (String(p.descricao || '').match(/ — parcela \d+\/\d+$/) || [''])[0];
        db.update('payables', p.id, {
          categoria: rec.categoria, fornecedorId: rec.fornecedorId, documento: rec.documentoNumero,
          descricao: `Compra ${rec.fornecedorNome || ''} ${rec.documentoNumero ? 'NF ' + rec.documentoNumero : ''}`.trim() + sufixo
        });
      }
    }
  } catch (e) {
    return bad(res, e.message);
  }

  audit(user, 'alterou', 'purchases', rec.id,
    `Compra editada${mudancas.length ? ' — ' + mudancas.join('; ') : ''}`);
  ok(res, rec);
});

/* ================= Fretes pagos pela empresa =================
   Custo de logística das vendas em que a empresa banca o envio.
   Vinculado à venda, entra no lucro real dela (venda − taxa − custo −
   frete) e na DRE como "Frete de venda / Logística". */
route('POST', '/api/freights', 'payables', async (req, res, user) => {
  const b = await readBody(req);
  const sale = b.saleId ? db.get('sales', b.saleId) : null;
  const cliente = b.clienteId ? db.get('clients', b.clienteId) : (sale ? db.get('clients', sale.clienteId) : null);
  const valor = Number(b.valor) || 0;
  if (valor <= 0) return bad(res, 'Informe o valor do frete.');
  const rec = db.insert('freights', {
    clienteId: cliente ? cliente.id : null,
    saleId: sale ? sale.id : null,
    produto: b.produto || (sale ? (sale.itens || []).map(i => i.produto).join(', ') : ''),
    dataEnvio: b.dataEnvio || domain.today(),
    transportadora: b.transportadora || '',
    conhecimento: b.conhecimento || '',
    origem: b.origem || (db.settings.empresa && db.settings.empresa.cidade) || '',
    destino: b.destino || (cliente ? [cliente.cidade, cliente.estado].filter(Boolean).join('/') : ''),
    valor,
    formaPagamento: b.formaPagamento || 'pix',
    dataPagamento: b.dataPagamento || '',
    observacoes: b.observacoes || '',
    status: 'aberto'
  });
  if (b.pagoAgora) {
    const data = b.dataPagamento || domain.today();
    db.update('freights', rec.id, { status: 'pago', dataPagamento: data });
    db.insert('cashflow', {
      tipo: 'saida', valor, data, conta: b.conta || 'principal',
      categoria: 'frete_venda',
      origem: `Frete — ${rec.transportadora || 'envio'}${sale ? ` (Pedido nº ${sale.numero})` : ''}`,
      documento: rec.conhecimento, refType: 'freights', refId: rec.id,
      descricao: 'Frete pago pela empresa'
    });
  }
  audit(user, 'criou', 'freights', rec.id,
    `Frete ${rec.transportadora || ''} R$ ${valor.toFixed(2)}${sale ? ` — Pedido nº ${sale.numero}` : ''}${b.pagoAgora ? ' (pago)' : ''}`);
  ok(res, db.get('freights', rec.id));
});

route('POST', '/api/freights/:id/pay', 'payables', async (req, res, user, params) => {
  const b = await readBody(req);
  const f = db.get('freights', params.id);
  if (!f) return notFound(res);
  if (f.status === 'pago') return bad(res, 'Este frete já está pago.');
  const data = b.data || domain.today();
  const sale = f.saleId ? db.get('sales', f.saleId) : null;
  db.update('freights', f.id, { status: 'pago', dataPagamento: data });
  db.insert('cashflow', {
    tipo: 'saida', valor: f.valor, data, conta: b.conta || 'principal',
    categoria: 'frete_venda',
    origem: `Frete — ${f.transportadora || 'envio'}${sale ? ` (Pedido nº ${sale.numero})` : ''}`,
    documento: f.conhecimento, refType: 'freights', refId: f.id,
    descricao: 'Frete pago pela empresa'
  });
  audit(user, 'pagou', 'freights', f.id, `Frete R$ ${Number(f.valor).toFixed(2)} em ${data}`);
  ok(res, { ok: true });
});

/* Desfaz o pagamento: estorna a saída de caixa e volta para aberto. */
route('POST', '/api/freights/:id/unpay', 'payables', async (req, res, user, params) => {
  const f = db.get('freights', params.id);
  if (!f) return notFound(res);
  if (f.status !== 'pago') return bad(res, 'Este frete não está pago.');
  const lanc = db.all('cashflow').filter(c => c.refType === 'freights' && c.refId === f.id);
  for (const c of lanc) db.remove('cashflow', c.id);
  db.update('freights', f.id, { status: 'aberto', dataPagamento: '' });
  audit(user, 'estornou', 'freights', f.id, `Pagamento de frete desfeito — ${lanc.length} lançamento(s) de caixa estornado(s)`);
  ok(res, { ok: true, estornados: lanc.length });
});

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
    recurringId: b.recurringId ? Number(b.recurringId) : null
  });
  completeRecurringTask(rec.recurringId, rec.vencimento); // dá baixa na pendência do mês
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

/* Edita uma parcela. Se ela já foi recebida, o dinheiro já entrou no caixa:
   a alteração exige confirmação explícita (confirmar: true) e o lançamento
   de caixa ligado acompanha o novo valor. Tudo fica no histórico. */
route('PUT', '/api/receivables/:id', 'receivables', async (req, res, user, params) => {
  const antes = db.get('receivables', params.id);
  if (!antes) return notFound(res);
  const b = await readBody(req);

  const patch = {};
  for (const k of ['descricao', 'forma', 'vencimento', 'observacoes']) {
    if (b[k] !== undefined) patch[k] = b[k];
  }
  if (b.valor !== undefined) patch.valor = Number(b.valor) || 0;
  if (b.clienteId !== undefined) {
    const c = db.get('clients', b.clienteId);
    if (!c) return bad(res, 'Cliente não encontrado.');
    patch.clienteId = c.id;
  }

  const NOMES = { clienteId: 'Cliente', descricao: 'Descrição', forma: 'Forma', valor: 'Valor',
                  vencimento: 'Vencimento', observacoes: 'Observações' };
  const mudancas = Object.keys(patch)
    .filter(k => JSON.stringify(antes[k] ?? '') !== JSON.stringify(patch[k] ?? ''))
    .map(k => `${NOMES[k]}: ${antes[k] ?? '—'} → ${patch[k] === '' ? '—' : patch[k]}`);
  if (!mudancas.length) return ok(res, antes);

  const mexeuDinheiro = patch.valor !== undefined && patch.valor !== antes.valor;
  if (antes.status === 'paga') {
    if (!b.confirmar) {
      return send(res, 409, {
        error: 'Esta parcela já possui movimentação financeira (recebida). Deseja realmente alterar seus dados?',
        precisaConfirmar: true
      });
    }
    if (mexeuDinheiro) {
      // O caixa acompanha, para os relatórios não divergirem do recebível.
      for (const c of db.all('cashflow').filter(c => c.refType === 'receivables' && c.refId === antes.id)) {
        db.update('cashflow', c.id, { valor: patch.valor });
      }
      mudancas.push('(entrada de caixa ligada ajustada junto)');
    }
  }

  const rec = db.update('receivables', antes.id, patch);
  audit(user, 'alterou', 'receivables', rec.id,
    `${antes.descricao || 'Parcela'} editada — ${mudancas.join('; ')}${antes.status === 'paga' ? ' [parcela já recebida — alteração confirmada]' : ''}`);
  ok(res, rec);
});

/* Exclui uma conta a receber lançada por engano.
   Sem recebimento, sai limpo. Com recebimento, só sai se o usuário
   confirmar — e aí a entrada correspondente sai do caixa junto, para o
   financeiro não ficar com dinheiro que não existe. */
route('DELETE', '/api/receivables/:id', 'receivables', async (req, res, user, params) => {
  const r = db.get('receivables', params.id);
  if (!r) return notFound(res);
  const caixa = db.all('cashflow').filter(c => c.refType === 'receivables' && c.refId === r.id);
  const recebida = r.status === 'paga' || caixa.length > 0;

  if (recebida && String((req.headers['x-confirmar'] || '')).toLowerCase() !== 'sim') {
    return send(res, 409, {
      error: `Esta parcela já tem recebimento registrado (R$ ${Number(r.valor).toFixed(2)}` +
             (r.dataRecebimento ? ` em ${r.dataRecebimento}` : '') +
             `). Excluir vai retirar também ${caixa.length} entrada(s) do caixa. Confirma?`,
      precisaConfirmar: true, entradasCaixa: caixa.length
    });
  }
  for (const c of caixa) db.remove('cashflow', c.id);
  db.remove('receivables', r.id);
  audit(user, 'excluiu', 'receivables', r.id,
    `${r.descricao || 'Parcela'} — R$ ${Number(r.valor).toFixed(2)} excluída` +
    (caixa.length ? ` (${caixa.length} entrada(s) de caixa estornada(s))` : ''));
  ok(res, { ok: true, estornadas: caixa.length });
});

/* Recalcula as parcelas futuras de um grupo (os boletos de uma venda).
   As já recebidas não são tocadas: o valor recebido é abatido do novo
   total e o restante é redistribuído nas novas parcelas em aberto. */
route('POST', '/api/receivables/replan', 'receivables', async (req, res, user) => {
  const b = await readBody(req);
  const ids = Array.isArray(b.ids) ? b.ids.map(Number) : [];
  const grupo = ids.map(id => db.get('receivables', id)).filter(Boolean);
  if (!grupo.length) return bad(res, 'Nenhuma parcela informada.');

  const pagas = grupo.filter(r => r.status === 'paga');
  const abertas = grupo.filter(r => r.status !== 'paga' && r.status !== 'cancelada');
  if (!abertas.length) return bad(res, 'Todas as parcelas deste grupo já foram recebidas ou canceladas.');

  const totalNovo = Number(b.valorTotal) || grupo.reduce((s, r) => s + r.valor, 0);
  const jaRecebido = pagas.reduce((s, r) => s + r.valor, 0);
  const restante = Math.round((totalNovo - jaRecebido) * 100) / 100;
  if (restante <= 0) return bad(res, `O novo total (R$ ${totalNovo.toFixed(2)}) é menor ou igual ao já recebido (R$ ${jaRecebido.toFixed(2)}). Nada sobraria para as parcelas futuras.`);

  const totalParcelas = Math.max(pagas.length + 1, Number(b.parcelas) || grupo.length);
  const futuras = totalParcelas - pagas.length;
  const intervalo = Number(b.intervaloDias) || 30;

  const modelo = abertas[0];
  const base = (modelo.descricao || 'Boleto').replace(/ — parcela \d+\/\d+$/, '');

  // Datas: a partir da primeira data informada, ou recalculadas da data-base.
  const parcels = domain.generateInstallments(
    b.primeiraData ? domain.addDays(b.primeiraData, -intervalo) : (b.dataVenda || domain.today()),
    restante, futuras, intervalo);

  for (const r of abertas) db.remove('receivables', r.id);
  const criadas = [];
  for (const p of parcels) {
    const n = pagas.length + p.parcela;
    criadas.push(db.insert('receivables', {
      clienteId: modelo.clienteId, origem: modelo.origem || 'venda',
      refType: modelo.refType || null, refId: modelo.refId || null,
      descricao: `${base} — parcela ${n}/${totalParcelas}`,
      forma: b.forma || modelo.forma || 'boleto',
      valor: p.valor, vencimento: p.vencimento,
      status: 'aberto', parcela: n, parcelas: totalParcelas
    }));
  }
  // Renumera as pagas para o novo total de parcelas, sem tocar em valor/data.
  for (const r of pagas) {
    db.update('receivables', r.id, {
      parcelas: totalParcelas,
      descricao: `${base} — parcela ${r.parcela}/${totalParcelas}`
    });
  }

  audit(user, 'alterou', 'receivables', null,
    `Parcelas recalculadas: ${grupo.length} → ${totalParcelas} (${pagas.length} já recebida(s) preservada(s)); ` +
    `total R$ ${totalNovo.toFixed(2)}, restante R$ ${restante.toFixed(2)} em ${futuras}x; ` +
    `vencimentos ${criadas.map(c => c.vencimento).join(', ')}`);
  ok(res, { pagas: pagas.length, criadas });
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

/* ---- análises / BI ---- */
/**
 * Agregados para os gráficos. Cada bloco só é incluído se o usuário tiver a
 * permissão correspondente (produção não recebe caixa nem resultado, etc.).
 */
route('GET', '/api/analytics', 'dashboard', async (req, res, user, params, query) => {
  const meses = Math.min(24, Math.max(3, Number(query.meses) || 12));
  const now = new Date();
  const months = [];
  for (let i = meses - 1; i >= 0; i--) {
    months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  }
  const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const label = m => NOMES[Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4);
  const inWindow = d => d && months.includes(String(d).slice(0, 7));

  const sales = db.all('sales').filter(s => s.status !== 'cancelado');
  const oss = db.all('serviceOrders').filter(o => o.status !== 'cancelado');
  const out = { janelaMeses: meses };

  // Faturamento mensal: só para quem tem acesso ao financeiro (Produção não recebe valores)
  if (canFinanceiro(user)) {
    out.faturamento = months.map(m => ({
      mes: label(m),
      vendas: sales.filter(s => String(s.dataPedido || '').slice(0, 7) === m).reduce((a, s) => a + (s.valorTotal || 0), 0),
      servicos: oss.filter(o => String(o.dataFinalizacao || '').slice(0, 7) === m).reduce((a, o) => a + (o.valorTotal || 0), 0)
    }));
  }

  if (can(user, 'cashflow')) {
    const flows = db.all('cashflow');
    out.caixa = months.map(m => ({
      mes: label(m),
      entradas: flows.filter(f => f.tipo === 'entrada' && String(f.data || '').slice(0, 7) === m).reduce((a, f) => a + f.valor, 0),
      saidas: flows.filter(f => f.tipo === 'saida' && String(f.data || '').slice(0, 7) === m).reduce((a, f) => a + f.valor, 0)
    }));
  }

  if (can(user, 'projection')) {
    const receiv = withOverdue(db.all('receivables')).filter(r => r.status === 'aberto' || r.status === 'vencida');
    const pay = withOverdue(db.all('payables')).filter(p => p.status !== 'pago');
    const t = domain.today();
    out.vencidos = {
      aReceber: receiv.filter(r => r.vencimento < t).reduce((a, r) => a + r.valor, 0),
      aPagar: pay.filter(p => p.vencimento < t).reduce((a, p) => a + p.valor, 0)
    };
    out.projecaoSemanal = [];
    let ini = t;
    for (let w = 0; w < 8; w++) {
      const fim = domain.addDays(ini, 6);
      out.projecaoSemanal.push({
        semana: ini.slice(8, 10) + '/' + ini.slice(5, 7),
        aReceber: receiv.filter(r => r.vencimento >= ini && r.vencimento <= fim).reduce((a, r) => a + r.valor, 0),
        aPagar: pay.filter(p => p.vencimento >= ini && p.vencimento <= fim).reduce((a, p) => a + p.valor, 0)
      });
      ini = domain.addDays(ini, 7);
    }
  }

  if (can(user, 'sales')) {
    const accP = {}, accE = {};
    for (const s of sales.filter(s => inWindow(s.dataPedido))) {
      for (const i of s.itens || []) {
        const k = i.produto;
        accP[k] = accP[k] || { produto: k.replace('Cabeçote ', ''), qtd: 0, valor: 0 };
        accP[k].qtd += i.qtd; accP[k].valor += i.total;
      }
      const uf = s.estado || '—';
      accE[uf] = accE[uf] || { uf, qtd: 0, valor: 0 };
      accE[uf].qtd += (s.itens || []).reduce((a, i) => a + i.qtd, 0);
      accE[uf].valor += s.valorTotal || 0;
    }
    out.produtos = Object.values(accP).sort((a, b) => b.valor - a.valor);
    let estados = Object.values(accE).sort((a, b) => b.valor - a.valor);
    if (estados.length > 8) {
      const resto = estados.slice(7);
      estados = estados.slice(0, 7);
      estados.push({ uf: 'Outros', qtd: resto.reduce((a, e) => a + e.qtd, 0), valor: resto.reduce((a, e) => a + e.valor, 0) });
    }
    out.estados = estados;
    // Sem acesso financeiro: os gráficos ficam por quantidade — valores nem trafegam
    if (!canFinanceiro(user)) {
      out.produtos = out.produtos.map(p => ({ produto: p.produto, qtd: p.qtd }));
      out.estados = out.estados.map(e => ({ uf: e.uf, qtd: e.qtd }));
    }
  }

  // Funil da oficina (etapas ordenadas — contagens atuais)
  const entries = db.all('headEntries');
  out.funil = [
    { etapa: 'Recebido / em análise', qtd: entries.filter(e => ['recebido', 'em_analise', 'aguardando_orcamento'].includes(e.status)).length },
    { etapa: 'Orçado — aguardando aprovação', qtd: db.all('quotes').filter(q => q.status === 'aberto').length },
    { etapa: 'Em serviço', qtd: oss.filter(o => ['em_analise', 'em_andamento', 'aguardando_peca'].includes(o.status)).length },
    { etapa: 'Aguardando pagamento', qtd: oss.filter(o => o.status === 'aguardando_pagamento' || (o.status === 'finalizado' && o.pagamentoStatus === 'pendente')).length },
    { etapa: 'Finalizado no período', qtd: oss.filter(o => inWindow(o.dataFinalizacao)).length }
  ];

  if (can(user, 'finance_sensitive')) {
    out.resultado = months.map(m => ({
      mes: label(m),
      resultado: sales.filter(s => String(s.dataPedido || '').slice(0, 7) === m)
        .reduce((a, s) => a + domain.saleResult(s).resultado, 0)
    }));
  }

  /* ---- Bloco operacional: só contagens, sem nenhum valor ----
     É o que sustenta as Análises do perfil Produção. */
  const op = {};

  // Movimento da oficina: cabeçotes que entraram × OS finalizadas por mês
  op.movimento = months.map(m => ({
    mes: label(m),
    entradas: entries.filter(e => String(e.dataChegada || '').slice(0, 7) === m).length,
    finalizadas: oss.filter(o => String(o.dataFinalizacao || '').slice(0, 7) === m).length
  }));

  // Serviços mais executados (itens das OS do período) — puro volume
  const accS = {};
  for (const o of oss) {
    if (!inWindow(o.dataFinalizacao) && !['em_analise', 'em_andamento', 'aguardando_peca'].includes(o.status)) continue;
    for (const i of o.itens || []) {
      const k = String(i.nome || '').trim() || '—';
      accS[k] = (accS[k] || 0) + (Number(i.qtd) || 1);
    }
  }
  op.servicosTop = Object.entries(accS).map(([nome, qtd]) => ({ nome, qtd }))
    .sort((a, b) => b.qtd - a.qtd).slice(0, 10);

  // Situação atual das ordens de produção
  const pos = db.all('productionOrders');
  const ST_PROD = [['nao_produzido', 'Não produzido'], ['preparacao', 'Preparação'],
    ['usinagem', 'Usinagem'], ['montagem', 'Montagem'], ['pronto', 'Pronto']];
  op.statusProducao = ST_PROD.map(([k, l]) => ({ etapa: l, qtd: pos.filter(p => p.status === k).length }));

  // Cabeçotes produzidos por configuração (quantidade, sem preço)
  const accC = {};
  for (const s of sales.filter(s => inWindow(s.dataPedido))) {
    for (const i of s.itens || []) {
      const k = `${i.tipo === 'crossflow' ? 'Crossflow' : 'Unilateral'} Stage ${i.stage}`;
      accC[k] = (accC[k] || 0) + (Number(i.qtd) || 1);
    }
  }
  op.configuracoes = Object.entries(accC).map(([config, qtd]) => ({ config, qtd })).sort((a, b) => b.qtd - a.qtd);

  // Assistência de pista por evento: quantas pessoas e dias por etapa (sem R$)
  const accE2 = {};
  for (const p of db.all('hrPayments').filter(p => p.tipo === 'pista')) {
    const ev = p.evento || 'Sem evento';
    accE2[ev] = accE2[ev] || { evento: ev, pessoas: 0, dias: 0, data: p.data || '' };
    accE2[ev].pessoas++;
    accE2[ev].dias += Number(p.dias) || 1;
    if ((p.data || '') > accE2[ev].data) accE2[ev].data = p.data;
  }
  op.pista = Object.values(accE2).sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 10);

  out.operacional = op;
  ok(res, out);
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

/* Desfaz o pagamento: estorna a saída de caixa que ele gerou e devolve o
   lançamento para "pendente", liberando edição e exclusão. */
route('POST', '/api/hrPayments/:id/unpay', 'hr', async (req, res, user, params) => {
  const h = db.get('hrPayments', params.id);
  if (!h) return notFound(res);
  if (h.status !== 'pago') return bad(res, 'Este lançamento não está pago.');
  const lancamentos = db.all('cashflow').filter(c => c.refType === 'hrPayments' && c.refId === h.id);
  for (const c of lancamentos) db.remove('cashflow', c.id);
  db.update('hrPayments', h.id, { status: 'pendente', dataPagamento: null });
  audit(user, 'estornou', 'hrPayments', h.id,
    `Pagamento desfeito — R$ ${Number(h.valor || 0).toFixed(2)}; ${lancamentos.length} lançamento(s) de caixa estornado(s)`);
  ok(res, { ok: true, estornados: lancamentos.length });
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
  /* Um lançamento de RH já pago gerou uma saída no caixa. Alterar o valor ou
     apagar o lançamento deixaria essa saída órfã ou com valor divergente —
     primeiro se desfaz o pagamento (que estorna o caixa), depois se edita. */
  if ((collection === 'hrPayments' || collection === 'freights') && (method === 'PUT' || method === 'DELETE')) {
    const atual = db.get(collection, id);
    if (atual && atual.status === 'pago') {
      return bad(res, 'Este lançamento já foi pago e gerou uma saída no caixa. Use “Desfazer pagamento” antes de editar ou excluir.');
    }
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
    // (sales, serviceOrders e receivables têm rota própria de exclusão, com estorno.)
    if (['quotes', 'cashflow', 'payables', 'supplierInvoices'].includes(collection)) {
      return bad(res, 'Este registro não pode ser excluído — use cancelamento/estorno para manter a rastreabilidade');
    }
    /* Cadastro em uso não some: apagá-lo deixaria vendas, compras e
       lançamentos apontando para o vazio. O caminho é inativar. */
    const vinc = vinculosDe(collection, id);
    if (vinc.length) {
      const lista = vinc.map(v => `${v.qtd} ${v.rotulo}`).join(', ');
      return send(res, 409, {
        error: `Este cadastro está em uso: ${lista}. Excluir deixaria esses registros sem referência — ` +
               (INATIVAVEIS[collection]
                 ? 'use "Inativar" para tirá-lo das listas sem perder o histórico.'
                 : 'não é possível excluí-lo enquanto houver vínculos.'),
        vinculos: vinc, podeInativar: !!INATIVAVEIS[collection]
      });
    }
    db.remove(collection, id);
    audit(user, 'excluiu', collection, Number(id),
      cfg.label + ' #' + id + (rec.nome ? ': ' + rec.nome : ''));
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
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
          res.end(d2);
        });
      }
      return notFound(res);
    }
    // no-cache: após uma atualização do sistema, o navegador sempre busca a
    // versão nova dos arquivos (evita tela antiga presa no cache).
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const urlPath = decodeURIComponent(u.pathname);
  const query = Object.fromEntries(u.searchParams.entries());

  // Proteções básicas de navegador, que passam a valer quando o sistema fica
  // acessível pela internet: nada de adivinhar tipo de arquivo, nada de abrir
  // o sistema dentro de um site de terceiros, e o endereço interno não vaza
  // no cabeçalho de origem ao clicar num link para fora.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');

  try {
    /* A Conta Azul devolve o usuário no endereço cadastrado no portal dela,
       que nem sempre é o caminho padrão daqui. Atendemos no caminho que
       estiver configurado, seja ele qual for. */
    if (req.method === 'GET' && !urlPath.startsWith('/api/')) {
      const retorno = contaazul.caminhoRetorno();
      if (retorno && retorno !== '/' && urlPath === retorno) {
        return await contaazulRetorno(req, res, query);
      }
    }
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

/* ===================================================================== */
/* Backup automático (local + pasta de nuvem sincronizada)               */
/* ===================================================================== */
/* Uma cópia de data/db.json por dia em data/backups/, mantendo as 30    */
/* últimas. Se uma pasta de nuvem estiver configurada (Google Drive para */
/* Computador, OneDrive, Dropbox…), a cópia diária também vai para lá —  */
/* o aplicativo de sincronização sobe o arquivo para a nuvem sozinho.    */
/* Roda no start e é reavaliado a cada 6 horas.                          */

/** Pastas de nuvem que costumam existir no computador (só as que existem). */
function cloudCandidates() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const list = [];
  if (process.env.OneDrive) list.push(process.env.OneDrive);
  for (const n of ['OneDrive', 'Google Drive', 'Meu Drive', 'My Drive', 'Dropbox']) {
    if (home) list.push(path.join(home, n));
  }
  for (const letra of ['G:', 'H:', 'I:']) {
    for (const n of ['Meu Drive', 'My Drive']) list.push(letra + path.sep + n);
  }
  return [...new Set(list)].filter(p => {
    try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
  });
}

/** Copia o banco para a pasta de nuvem configurada (1 arquivo por dia, 60 mantidos). */
function cloudBackup(force) {
  const dir = db.settings.backupDir;
  if (!dir) return { ok: false, naoConfigurado: true };
  const dataFile = db.DB_FILE;
  try {
    if (!fs.existsSync(dataFile)) return { ok: false, error: 'ainda não há dados para copiar' };
    fs.mkdirSync(dir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const target = path.join(dir, `jaques-backup-${today}.json`);
    if (!force && fs.existsSync(target)) return { ok: true, file: target, jaExistia: true };
    db.persistNow();
    fs.copyFileSync(dataFile, target);
    const old = fs.readdirSync(dir).filter(f => /^jaques-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (old.length > 60) fs.unlinkSync(path.join(dir, old.shift()));
    db.settings.lastCloudBackup = { at: new Date().toISOString(), ok: true, file: target };
    db.save();
    console.log('Backup na nuvem:', target);
    return { ok: true, file: target };
  } catch (e) {
    db.settings.lastCloudBackup = { at: new Date().toISOString(), ok: false, error: e.message };
    db.save();
    console.error('Falha no backup na nuvem:', e.message);
    return { ok: false, error: e.message };
  }
}

function ensureDailyBackup() {
  try {
    const dataFile = db.DB_FILE;
    if (!fs.existsSync(dataFile)) return;
    const backupDir = path.join(db.DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const target = path.join(backupDir, `db-${today}.json`);
    if (!fs.existsSync(target)) {
      db.persistNow();
      fs.copyFileSync(dataFile, target);
      console.log('Backup diário criado:', target);
    }
    const old = fs.readdirSync(backupDir).filter(f => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (old.length > 30) fs.unlinkSync(path.join(backupDir, old.shift()));
  } catch (e) { console.error('Falha no backup diário:', e.message); }
  cloudBackup(false);
}
ensureDailyBackup();
setInterval(ensureDailyBackup, 6 * 3600 * 1000);

process.on('SIGINT', () => { db.persistNow(); process.exit(0); });
process.on('SIGTERM', () => { db.persistNow(); process.exit(0); });

server.listen(PORT, () => {
  console.log(`Jaques Motorsport — Sistema de Gestão rodando em http://localhost:${PORT}`);
  console.log('Login inicial: admin / admin123 (troque a senha no primeiro acesso)');
});
