/**
 * Dados iniciais do sistema (executado automaticamente no primeiro start).
 * Inclui: perfis de permissão, usuário administrador, catálogo de serviços
 * com os preços do modelo atual de orçamento, produtos (6 configurações),
 * componentes de estoque e fornecedores de fechamento mensal.
 */
'use strict';

const crypto = require('crypto');
const db = require('./db');

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(12).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
  return salt + '$' + hash;
}

function checkPassword(password, stored) {
  if (!stored) return false;
  const [salt] = stored.split('$');
  return hashPassword(password, salt) === stored;
}

/** Módulos que aparecem no controle de permissões (configurável por perfil). */
const MODULES = [
  ['dashboard', 'Dashboard'],
  ['tasks', 'Minhas pendências'],
  ['clients', 'Clientes'],
  ['entries', 'Entrada de cabeçotes'],
  ['assets', 'Bens de clientes'],
  ['quotes', 'Orçamentos'],
  ['os', 'Ordens de serviço'],
  ['production', 'Produção'],
  ['sales', 'Vendas'],
  ['products', 'Produtos e custos'],
  ['stock', 'Estoque próprio'],
  ['purchases', 'Compras'],
  ['suppliers', 'Fornecedores'],
  ['payables', 'Contas a pagar'],
  ['receivables', 'Contas a receber'],
  ['cashflow', 'Fluxo de caixa'],
  ['projection', 'Projeção financeira'],
  ['dre', 'DRE / Resultado'],
  ['hr', 'RH'],
  ['reports', 'Relatórios'],
  ['finance_sensitive', 'Dados financeiros sensíveis (custos, margens, salários)'],
  ['admin', 'Administração (usuários, permissões, auditoria, configurações)']
];

const SERVICE_CATALOG = [
  // Serviços com preço-base definido no modelo atual
  ['Abrir alojamento de sedes', 45.00],
  ['Alinhamento de mancais', 40.00],
  ['Assentamento de válvulas', 45.00],
  ['Banho químico', 200.00],
  ['Aumento da furação do prisioneiro', 25.00],
  ['Guia especial', 450.00],
  ['Jogo de molas', 340.00],
  ['Montagem', 150.00],
  ['Limpeza', 200.00],
  ['Plaina do cabeçote', 200.00],
  ['Regulagem de válvula', 40.00],
  ['Retentor do comando', 40.00],
  ['Retrabalho coletor de admissão', 800.00],
  ['Sede bruta', 40.00],
  ['Solda escape', 20.00],
  ['Substituir sedes', 190.00],
  ['Tampão cabeçote', 190.00],
  ['Tucho de cabeçote', 82.00],
  ['Válvula de admissão', 220.00],
  ['Válvula de escape', 220.00],
  // Serviços/componentes ainda sem preço definido (cadastrados para configuração posterior)
  ['Abrir alojamento de tuchos', 0],
  ['Adaptar sedes', 0],
  ['Adap. O-ring MH 10 AN', 0],
  ['Bucha de reforço do escape', 0],
  ['Cabeçote Flow 4 Race', 0],
  ['Casco usado', 0],
  ['Comando de válvula', 0],
  ['Fresa para rosca de vela', 0],
  ['Guia de válvula', 0],
  ['Jogo de pratos/travas', 0],
  ['Mandrilhar mancais', 0],
  ['Mão de obra retrabalho', 0],
  ['Retífica de sede', 0],
  ['Retífica de válvulas', 0],
  ['Retirada das sedes', 0],
  ['Retrabalho dos dutos', 0],
  ['Retrabalho câmera de combustão', 0],
  ['Rosca M8 para lubrificação', 0],
  ['Serviço de fresa', 0],
  ['Serviço de torno', 0],
  ['Sede berílio', 0],
  ['Solda da câmera de combustão', 0],
  ['Trava de válvula', 0],
  ['Tornear sedes', 0],
  ['Vedador', 0],
  ['Frete', 0]
];

const STOCK_ITEMS = [
  ['Casco usinado — Unilateral', 'casco_unilateral'],
  ['Casco usinado — Fluxo cruzado', 'casco_crossflow'],
  ['Válvula de admissão', 'valvula'],
  ['Válvula de escape', 'valvula'],
  ['Jogo de molas', 'mola'],
  ['Pratos', 'prato'],
  ['Travas', 'trava'],
  ['Tucho 35 mm', 'tucho35'],
  ['Tucho 37 mm', 'tucho37'],
  ['Comando 288', 'comando'],
  ['Comando 290x300', 'comando'],
  ['Comando 290x290', 'comando'],
  ['Comando 300x308', 'comando'],
  ['Comando 300x318', 'comando'],
  ['Comando 316x320', 'comando'],
  ['Comando 316x316', 'comando'],
  ['Comando 308x320', 'comando'],
  ['Retentor de comando', 'outro'],
  ['Guia de válvula', 'outro'],
  ['Sede', 'outro'],
  ['Embalagem', 'outro'],
  ['Brinde padrão', 'outro']
];

function seedIfEmpty() {
  const d = db.load();
  if (d.users.length) return false;

  // ---- Perfis de permissão -------------------------------------------------
  const allPerms = MODULES.map(m => m[0]);
  db.insert('roles', { name: 'Administrador / Direção', permissions: allPerms, builtin: true });
  db.insert('roles', {
    name: 'Financeiro / Administrativo',
    permissions: ['dashboard', 'tasks', 'clients', 'entries', 'assets', 'quotes', 'os', 'sales',
      'purchases', 'suppliers', 'payables', 'receivables', 'cashflow', 'projection',
      'reports', 'finance_sensitive'],
    builtin: true
  });
  db.insert('roles', {
    name: 'Produção',
    // 'clients' incluído para exibir nomes de clientes em entradas/OS/pedidos;
    // dados financeiros sensíveis continuam bloqueados (sem finance_sensitive).
    permissions: ['dashboard', 'tasks', 'clients', 'entries', 'assets', 'os', 'production', 'sales', 'stock', 'reports'],
    builtin: true
  });

  // ---- Usuário inicial -----------------------------------------------------
  db.insert('users', {
    username: 'admin',
    password: hashPassword('admin123'),
    name: 'Administrador',
    cargo: 'Direção',
    roleId: 1,
    active: true,
    mustChangePassword: true
  });

  // ---- Catálogo de serviços ------------------------------------------------
  for (const [nome, preco] of SERVICE_CATALOG) {
    db.insert('serviceCatalog', { nome, preco, ativo: true, precoDefinido: preco > 0 });
  }

  // ---- Estoque próprio -----------------------------------------------------
  for (const [nome, categoria] of STOCK_ITEMS) {
    db.insert('stockItems', { nome, categoria, qtd: 0, custoUnit: 0, minimo: 0 });
  }

  // ---- Produtos: 6 configurações comerciais --------------------------------
  for (const tipo of ['unilateral', 'crossflow']) {
    for (const stage of [1, 2, 3]) {
      db.insert('products', {
        nome: `Cabeçote ${tipo === 'crossflow' ? 'Fluxo Cruzado' : 'Unilateral'} — Stage ${stage}`,
        tipo, stage,
        preco: 0,       // preço de venda sugerido — editável
        custoBase: 0,   // custo-base gerencial (peças, embalagem, brinde, usinagem, mão de obra) — editável
        composicaoObs: 'Composição padrão: casco usinado, válvulas, molas, pratos, travas, comando e tuchos conforme configuração.'
      });
    }
  }

  // ---- Fornecedores com fechamento mensal ----------------------------------
  for (const nome of ['Jaú Auto Peças', 'Retifos', 'Ferragens Brasil', 'Mangopar']) {
    db.insert('suppliers', { nome, cnpj: '', telefone: '', email: '', fechamentoMensal: true, observacoes: '' });
  }

  // ---- Contas recorrentes --------------------------------------------------
  db.insert('recurring', { nome: 'COPEL', categoria: 'energia', diaVencimento: 10, valorEstimado: 0, instrucao: 'Boleto precisa ser emitido no site da COPEL', ativo: true });
  db.insert('recurring', { nome: 'Sanepar', categoria: 'agua', diaVencimento: 10, valorEstimado: 0, instrucao: 'Boleto precisa ser emitido no site da Sanepar', ativo: true });
  db.insert('recurring', { nome: 'Consórcio (veículos da empresa)', categoria: 'consorcio', diaVencimento: 15, valorEstimado: 0, instrucao: 'Boleto precisa ser retirado no portal do consórcio', ativo: true });

  db.settings; // garante criação do registro de configurações
  db.persistNow();
  return true;
}

function reseed() {
  const fs = require('fs');
  const path = require('path');
  const f = path.join(__dirname, '..', 'data', 'db.json');
  if (fs.existsSync(f)) fs.unlinkSync(f);
  seedIfEmpty();
  console.log('Banco recriado com dados iniciais. Login: admin / admin123');
}

module.exports = { seedIfEmpty, reseed, hashPassword, checkPassword, MODULES };
