/**
 * Dados iniciais do sistema (executado automaticamente no primeiro start).
 * Inclui: perfis de permissão, usuário administrador, catálogo de serviços
 * com os preços do modelo atual de orçamento, produtos (6 configurações),
 * componentes de estoque e fornecedores de fechamento mensal.
 */
'use strict';

const crypto = require('crypto');
const db = require('./db');

/* ---------------- Senhas ----------------
   As senhas são guardadas com scrypt, que é lento de propósito: mesmo que o
   arquivo de dados vazasse, testar senha por senha custaria caro. Isso passa a
   importar de verdade quando o sistema fica acessível pela internet.

   O formato antigo (sha256) continua sendo aceito para ninguém ficar trancado
   do lado de fora; no primeiro acerto da senha, o cadastro é convertido —
   ver upgradeLegacyHash no login. */
const SCRYPT = { N: 16384, r: 8, p: 1 };
const SCRYPT_BYTES = 32;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_BYTES, SCRYPT).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/* Compara sem deixar o tempo de resposta denunciar quanto do hash bateu. */
function sameHash(calculado, guardado) {
  const alvo = Buffer.from(guardado, 'hex');
  return alvo.length === calculado.length && crypto.timingSafeEqual(calculado, alvo);
}

function checkPassword(password, stored) {
  if (!stored) return false;
  const partes = String(stored).split('$');
  try {
    if (partes[0] === 'scrypt') {
      const [, salt, hash] = partes;
      return sameHash(crypto.scryptSync(String(password), salt, SCRYPT_BYTES, SCRYPT), hash);
    }
    const [salt, hash] = partes;               // formato antigo: salt$sha256(salt:senha)
    if (!hash) return false;
    return sameHash(crypto.createHash('sha256').update(salt + ':' + password).digest(), hash);
  } catch (e) {
    return false;
  }
}

/** O cadastro ainda está no formato antigo e merece ser convertido? */
function isLegacyHash(stored) {
  return !!stored && !String(stored).startsWith('scrypt$');
}

/**
 * Permissões do sistema: [chave, rótulo, grupo].
 *
 * O grupo serve só para organizar a tela de perfis. Acrescentar uma linha
 * aqui é tudo que uma funcionalidade nova precisa para virar permissão:
 * ela aparece sozinha na Administração e entra sozinha em quem tem acesso
 * completo (ver sincronizarAcessoCompleto, abaixo).
 *
 * Nenhuma chave pode ser removida ou renomeada: elas ficam gravadas nos
 * perfis do banco da empresa e sumir com uma tiraria acesso de quem já a tem.
 */
const MODULES = [
  // ---- Dia a dia ----
  ['dashboard', 'Dashboard', 'Dia a dia'],
  ['tasks', 'Minhas pendências', 'Dia a dia'],
  ['entries', 'Entrada de cabeçotes', 'Dia a dia'],
  ['os', 'Ordens de serviço', 'Dia a dia'],
  // ---- Comercial ----
  ['clients', 'Clientes', 'Comercial'],
  ['credits', 'Créditos de clientes', 'Comercial'],
  ['quotes', 'Orçamentos', 'Comercial'],
  ['sales', 'Vendas', 'Comercial'],
  // ---- Oficina e materiais ----
  ['production', 'Produção', 'Oficina e materiais'],
  ['assets', 'Bens de clientes', 'Oficina e materiais'],
  ['stock', 'Estoque próprio', 'Oficina e materiais'],
  ['stock_history', 'Histórico de movimentações de estoque', 'Oficina e materiais'],
  ['products', 'Produtos e custos', 'Oficina e materiais'],
  ['purchases', 'Compras', 'Oficina e materiais'],
  ['suppliers', 'Fornecedores', 'Oficina e materiais'],
  // ---- Financeiro ----
  ['agenda', 'Agenda financeira', 'Financeiro'],
  ['payables', 'Contas a pagar', 'Financeiro'],
  ['freights', 'Fretes', 'Financeiro'],
  ['receivables', 'Contas a receber', 'Financeiro'],
  ['cashflow', 'Fluxo de caixa', 'Financeiro'],
  ['projection', 'Projeção financeira', 'Financeiro'],
  ['dre', 'DRE / Resultado', 'Financeiro'],
  // ---- Gestão ----
  ['hr', 'RH', 'Gestão'],
  ['reports', 'Relatórios', 'Gestão'],
  ['finance_sensitive', 'Dados financeiros sensíveis (custos, margens, salários)', 'Gestão'],
  // ---- Direção: alterações de maior impacto ----
  ['payables_edit', 'Editar contas a pagar já lançadas', 'Direção'],
  ['cashflow_edit', 'Editar lançamentos do fluxo de caixa', 'Direção'],
  ['stock_history_edit', 'Corrigir o histórico de estoque', 'Direção'],
  ['credits_manage', 'Lançar, usar e estornar créditos de clientes', 'Direção'],
  ['admin', 'Administração (usuários, permissões, auditoria, configurações)', 'Direção']
];

/**
 * "Acesso completo" precisa continuar completo quando o sistema cresce.
 * Quem tem 'admin' já passa em qualquer verificação (ver can(), no server),
 * mas os perfis guardam a lista marcada — e é ela que a tela de permissões
 * mostra. Isto acerta a lista de quem tem acesso completo com o MODULES
 * atual, em toda subida do sistema, sem tocar nos demais perfis.
 */
function sincronizarAcessoCompleto(db) {
  const todas = MODULES.map(m => m[0]);
  for (const r of db.all('roles')) {
    if (!r.permissions || !r.permissions.includes('admin')) continue;
    const faltando = todas.filter(p => !r.permissions.includes(p));
    if (faltando.length) db.update('roles', r.id, { permissions: r.permissions.concat(faltando) });
  }
}

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
    permissions: ['dashboard', 'tasks', 'clients', 'credits', 'entries', 'assets', 'quotes', 'os', 'sales',
      'purchases', 'suppliers', 'agenda', 'payables', 'freights', 'receivables', 'cashflow', 'projection',
      'stock_history', 'reports', 'finance_sensitive'],
    builtin: true
  });
  db.insert('roles', {
    name: 'Produção',
    // 'clients' incluído para exibir nomes de clientes em entradas/OS/pedidos;
    // dados financeiros sensíveis continuam bloqueados (sem finance_sensitive).
    permissions: ['dashboard', 'tasks', 'clients', 'entries', 'assets', 'os', 'production', 'sales',
      'stock', 'stock_history', 'reports'],
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
  db.insert('recurring', { nome: 'COPEL', categoria: 'energia', diaVencimento: 10, valorEstimado: 0, instrucao: 'Boleto precisa ser emitido no site da COPEL', link: 'https://www.copel.com', diasAviso: 4, ativo: true });
  db.insert('recurring', { nome: 'Sanepar', categoria: 'agua', diaVencimento: 10, valorEstimado: 0, instrucao: 'Boleto precisa ser emitido no site da Sanepar', link: 'https://site.sanepar.com.br', diasAviso: 4, ativo: true });
  db.insert('recurring', { nome: 'Consórcio (veículos da empresa)', categoria: 'consorcio', diaVencimento: 15, valorEstimado: 0, instrucao: 'Boleto precisa ser retirado no portal do consórcio', link: '', diasAviso: 4, ativo: true });

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

module.exports = { seedIfEmpty, reseed, hashPassword, checkPassword, isLegacyHash, MODULES,
  sincronizarAcessoCompleto };
