/**
 * Regras de negócio da Jaques Motorsport.
 * Concentra tudo que é específico da operação: agenda de sextas-feiras,
 * geração de parcelas, combinações válidas de Stage/comando/tucho,
 * checklist de produção, custo/resultado de venda, DRE e projeções.
 */
'use strict';

const db = require('./db');

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

/** 'YYYY-MM-DD' -> Date em UTC meia-noite (evita fuso). */
function parseDay(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmtDay(date) { return date.toISOString().slice(0, 10); }
function addDays(s, n) {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDay(d);
}
function today() { return new Date().toISOString().slice(0, 10); }

/**
 * Agenda de pagamentos: a empresa paga às sextas-feiras.
 * Retorna a sexta-feira mais próxima ANTERIOR ao vencimento (estritamente antes),
 * garantindo pagamento antes de vencer. Se o próprio vencimento for sexta,
 * retorna a sexta anterior (paga com folga) — ex.: venc. qui 20/08 → sexta 14/08.
 */
function previousFriday(dueDate) {
  const d = parseDay(dueDate);
  d.setUTCDate(d.getUTCDate() - 1); // estritamente antes do vencimento
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return fmtDay(d);
}

/**
 * Dia N do mês seguinte à data-base (compras de agosto → início de setembro).
 * O dia é limitado a 28 para valer em qualquer mês.
 */
function inicioDoMesSeguinte(dataBase, dia) {
  const d = parseDay(dataBase);
  const alvo = Math.min(Math.max(1, Number(dia) || 5), 28);
  return fmtDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, alvo)));
}

/**
 * Agendamento de pagamento de uma compra — devolve { vencimento, dataProgramada }.
 *
 * tipo:
 *   'programado'  sexta-feira anterior ao vencimento (regra da casa)
 *   'imediato'    pago na data da compra (mercado, água, emergências)
 *   'a_cada_30'   fornecedor de acumulado mensal: vence 30 dias após a compra
 *                 e paga na sexta anterior; o fechamento consolida depois
 *   'inicio_mes'  fornecedor de fechamento: paga no dia escolhido do mês
 *                 seguinte ao da compra (opcoes.diaMes, padrão 5)
 *   'outro'       regra combinada com o fornecedor: a data é a informada
 *                 (opcoes.dataManual), obrigatória
 */
function programarPagamento(tipo, dataCompra, vencimento, opcoes = {}) {
  const compra = dataCompra || today();
  if (tipo === 'imediato') {
    return { vencimento: vencimento || compra, dataProgramada: compra };
  }
  if (tipo === 'a_cada_30') {
    const venc = vencimento || addDays(compra, 30);
    return { vencimento: venc, dataProgramada: previousFriday(venc) };
  }
  if (tipo === 'inicio_mes') {
    // Mês seguinte ao do vencimento (ou, sem vencimento, ao da compra):
    // compras de agosto → pagamento no início de setembro.
    const dataProg = inicioDoMesSeguinte(vencimento || compra, opcoes.diaMes);
    return { vencimento: vencimento || dataProg, dataProgramada: dataProg };
  }
  if (tipo === 'outro') {
    if (!opcoes.dataManual) throw new Error('No agendamento "Outro", informe a data de pagamento combinada.');
    return { vencimento: vencimento || opcoes.dataManual, dataProgramada: opcoes.dataManual };
  }
  // 'programado' (padrão): sexta anterior ao vencimento
  const venc = vencimento || addDays(compra, 30);
  return { vencimento: venc, dataProgramada: previousFriday(venc) };
}

/**
 * Geração automática de parcelas (boletos).
 *
 * Sem data do primeiro vencimento, a contagem parte da data da venda:
 *   venda 27/07, R$ 12.000, 3x, intervalo 20 dias → 16/08 / 05/09 / 25/09.
 *
 * Com `primeiroVencimento`, a 1ª parcela cai exatamente no dia informado e as
 * seguintes andam de `intervalDays` em `intervalDays` a partir dele:
 *   R$ 12.000, 3x, 30 dias, 1º em 10/10/2026 → 10/10 / 09/11 / 09/12,
 *   R$ 4.000,00 cada.
 *
 * Centavos de arredondamento vão para a última parcela.
 */
function generateInstallments(saleDate, total, count, intervalDays, primeiroVencimento) {
  count = Math.max(1, Number(count) || 1);
  intervalDays = Number(intervalDays) || 30;
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / count);
  const primeiro = primeiroVencimento ? String(primeiroVencimento).slice(0, 10) : '';
  const out = [];
  for (let i = 1; i <= count; i++) {
    const value = (i === count) ? cents - base * (count - 1) : base;
    out.push({
      parcela: i,
      parcelas: count,
      vencimento: primeiro
        ? addDays(primeiro, intervalDays * (i - 1))
        : addDays(saleDate, intervalDays * i),
      valor: value / 100
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Produtos: Stage × comando × tucho                                   */
/* ------------------------------------------------------------------ */

/* Tabela de origem, usada SÓ na migração da primeira subida desta versão.
   A partir dela, cada configuração guarda os seus próprios comandos e
   tuchos — administráveis em Produtos e custos, sem mexer no código. */
const STAGE_COMANDOS = {
  1: ['288'],
  2: ['290x300', '290x290'],
  3: ['300x308', '300x318', '316x320', '316x316', '308x320']
};

/* Comando novo das duas linhas no Stage 1 (acrescentado, nada é substituído). */
const COMANDO_NOVO_STAGE1 = '280x280';

/* Rótulo da configuração: Stage 3 (tucho 35) e Stage 3 Plus (tucho 37) são
   duas configurações distintas da mesma linha. */
function rotuloStage(stage, variante) {
  return `Stage ${Number(stage) || stage}${variante === 'plus' ? ' Plus' : ''}`;
}
function rotuloTipo(tipo) {
  return tipo === 'crossflow' ? 'Fluxo Cruzado' : 'Unilateral';
}
function nomeProduto(tipo, stage, variante) {
  return `Cabeçote ${rotuloTipo(tipo)} — ${rotuloStage(stage, variante)}`;
}

/* ------------------------------------------------------------------ */
/* Composição: que peças, e quantas, entram em cada cabeçote           */
/* ------------------------------------------------------------------ */
/* Cada linha da composição tem um papel:
     'fixo'    — aponta para um item do estoque (stockItemId);
     'comando' — resolvido na hora pelo comando escolhido na venda;
     'tucho'   — resolvido na hora pelo tucho (35 ou 37 mm) escolhido.
   Assim a mesma composição serve para todos os comandos da configuração,
   e o estoque baixa exatamente o comando que foi vendido. */
const PAPEIS = ['fixo', 'comando', 'tucho'];

/* Sugestão inicial de composição de um cabeçote AP de 8 válvulas.
   Entra marcada como NÃO CONFERIDA: a oficina revisa e ajusta em
   Produtos e custos. Antes desta versão o sistema baixava 1 de cada
   peça, o que não corresponde à montagem real. */
const COMPOSICAO_SUGERIDA = [
  { papel: 'casco', qtd: 1, obs: 'Casco usinado da linha (unilateral ou fluxo cruzado)' },
  { papel: 'comando', qtd: 1, obs: 'O comando escolhido na venda' },
  { papel: 'tucho', qtd: 8, obs: 'Um tucho por válvula' },
  { papel: 'valvula_adm', qtd: 4, obs: '' },
  { papel: 'valvula_esc', qtd: 4, obs: '' },
  { papel: 'mola', qtd: 1, obs: 'Cadastrado como jogo — confira se é 1 jogo ou 8 peças' },
  { papel: 'prato', qtd: 8, obs: 'Um prato por válvula' },
  { papel: 'trava', qtd: 16, obs: 'Duas travas por válvula' }
];

/** Tuchos válidos de uma configuração já migrada (ou, no legado, por stage). */
function tuchoOptions(stage, comando) {
  stage = Number(stage);
  if (stage === 1 || stage === 2) return ['35'];
  if (stage === 3) return comando === '300x308' ? ['35', '37'] : ['37'];
  return [];
}

/** Comandos e tuchos que a configuração aceita hoje. */
function opcoesDoProduto(prod) {
  if (!prod) return { comandos: [], tuchos: [] };
  const comandos = Array.isArray(prod.comandos) && prod.comandos.length
    ? prod.comandos.slice()
    : (STAGE_COMANDOS[Number(prod.stage)] || []).slice();
  const tuchos = Array.isArray(prod.tuchos) && prod.tuchos.length
    ? prod.tuchos.map(String)
    : (Number(prod.stage) === 3 ? ['35', '37'] : ['35']);
  return { comandos, tuchos };
}

/** Valida a configuração escolhida contra o que o produto aceita. */
function validarProduto(prod, comando, tucho) {
  if (!prod) return { ok: false, error: 'Produto inválido' };
  const { comandos, tuchos } = opcoesDoProduto(prod);
  const nome = prod.nome || nomeProduto(prod.tipo, prod.stage, prod.variante);
  if (!comandos.length) {
    return { ok: false, error: `${nome} não tem comandos cadastrados. Cadastre em Produtos e custos.` };
  }
  if (!comandos.includes(String(comando))) {
    return { ok: false, error: `Comando ${comando} não é válido para ${nome}. Válidos: ${comandos.join(', ')}` };
  }
  if (!tuchos.includes(String(tucho))) {
    return { ok: false, error: `Tucho ${tucho} mm não é válido para ${nome}. Válidos: ${tuchos.join(' ou ')} mm` };
  }
  return { ok: true };
}

/** Compatibilidade: validação pelo stage, para bancos ainda não migrados. */
function validateConfig(stage, comando, tucho) {
  stage = Number(stage);
  const comandos = STAGE_COMANDOS[stage];
  if (!comandos) return { ok: false, error: 'Stage inválido: ' + stage };
  if (!comandos.includes(comando)) {
    return { ok: false, error: `Comando ${comando} não é válido para Stage ${stage}. Válidos: ${comandos.join(', ')}` };
  }
  const tuchos = tuchoOptions(stage, comando);
  if (!tuchos.includes(String(tucho))) {
    return { ok: false, error: `Tucho ${tucho} mm não é válido para Stage ${stage} comando ${comando}. Válidos: ${tuchos.join(' ou ')} mm` };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Etapas da produção                                                  */
/* ------------------------------------------------------------------ */

/* A produção anda sempre na mesma ordem, seja cabeçote vendido ou
   serviço de cliente. Cada item do checklist carrega a sua etapa. */
const ETAPAS_PRODUCAO = [
  ['separacao', 'Separação'],
  ['usinagem', 'Operação / Usinagem'],
  ['montagem', 'Montagem'],
  ['finalizacao', 'Finalização'],
  ['envio', 'Pronto para envio']
];
const ETAPAS_ORDEM = ETAPAS_PRODUCAO.map(e => e[0]);

/** Etapa em que a ordem está: a primeira que ainda tem item pendente. */
function etapaAtual(checklist) {
  for (const chave of ETAPAS_ORDEM) {
    const daEtapa = (checklist || []).filter(c => c.etapa === chave);
    if (daEtapa.length && daEtapa.some(c => !c.done)) return chave;
  }
  return 'concluido';
}

/** Status da ordem derivado do checklist — a etapa e o andamento não divergem. */
function statusPorEtapa(checklist) {
  const lista = checklist || [];
  if (!lista.length) return 'nao_produzido';
  if (lista.every(c => c.done)) return 'pronto';
  if (!lista.some(c => c.done)) return 'nao_produzido';
  const etapa = etapaAtual(lista);
  return { separacao: 'preparacao', usinagem: 'usinagem', montagem: 'montagem',
           finalizacao: 'montagem', envio: 'pronto' }[etapa] || 'preparacao';
}

/**
 * Checklist da ordem de produção de um cabeçote vendido, organizado por etapa.
 * Operações extras entram automaticamente conforme a configuração:
 *  - Stage 3: retrabalho manual dos dutos de escape;
 *  - tucho 37 mm: abertura do alojamento dos tuchos para 37 mm.
 */
function productionChecklist(tipo, stage, comando, tucho, composicao, variante) {
  /* A separação sai da COMPOSIÇÃO cadastrada do produto: a bancada vê a
     peça e a quantidade exatas que o estoque vai baixar. Sem composição
     (banco antigo), cai na lista genérica de sempre. */
  const linhas = (composicao || []).filter(c => c && c.nome);
  const itens = linhas.length
    ? linhas.map(c => ['separacao', `Separar ${c.qtd}× ${c.nome}`])
    : [
      ['separacao', `Separar casco usinado (${tipo === 'crossflow' ? 'fluxo cruzado' : 'unilateral'})`],
      ['separacao', 'Separar válvulas'],
      ['separacao', 'Separar molas'],
      ['separacao', 'Separar pratos'],
      ['separacao', 'Separar travas'],
      ['separacao', `Separar comando ${comando}`],
      ['separacao', `Separar tuchos ${tucho} mm`]
    ];
  itens.push(['usinagem', `Conferir usinagem do casco — ${rotuloStage(stage, variante)}`]);
  if (String(tucho) === '37') itens.push(['usinagem', 'Abertura do alojamento dos tuchos para 37 mm']);
  if (Number(stage) === 3) itens.push(['usinagem', 'Retrabalho manual dos dutos de escape (melhoria de fluxo)']);
  itens.push(
    ['montagem', 'Montagem do cabeçote'],
    ['montagem', 'Regulagem e conferência de folgas'],
    ['finalizacao', 'Controle de qualidade'],
    ['finalizacao', 'Limpeza e acabamento'],
    ['finalizacao', 'Embalagem'],
    ['envio', 'Conferência final do pedido'],
    ['envio', 'Expedição / entrega ao transportador']
  );
  return itens.map(([etapa, item]) => ({ etapa, item, done: false }));
}

/**
 * Checklist do serviço de um cabeçote de cliente. As operações contratadas no
 * orçamento viram itens da etapa de usinagem — a equipe vê exatamente o que
 * foi vendido, sem ninguém redigitar.
 */
function serviceChecklist(os) {
  const itens = [
    ['separacao', 'Conferir cabeçote recebido e identificação'],
    ['separacao', 'Separar peças e materiais do serviço'],
    ['separacao', 'Desmontagem e limpeza']
  ];
  const operacoes = (os.itens || []).filter(i => i && i.nome);
  if (operacoes.length) {
    for (const i of operacoes) {
      const qtd = Number(i.qtd) || 1;
      itens.push(['usinagem', qtd > 1 ? `${qtd}× ${i.nome}` : String(i.nome)]);
    }
  } else {
    itens.push(['usinagem', os.descricaoServico || 'Executar o serviço combinado']);
  }
  itens.push(
    ['montagem', 'Montagem do cabeçote'],
    ['montagem', 'Regulagem e conferência de folgas'],
    ['finalizacao', 'Teste / controle de qualidade'],
    ['finalizacao', 'Limpeza e acabamento'],
    ['envio', 'Conferência final e liberação'],
    ['envio', 'Avisar o cliente / expedição']
  );
  return itens.map(([etapa, item]) => ({ etapa, item, done: false }));
}

/** Checklist antigo (lista simples) ganha etapas sem perder o que já foi marcado. */
function migrarChecklist(checklist) {
  return (checklist || []).map(c => {
    if (c.etapa) return c;
    const t = String(c.item || '').toLowerCase();
    let etapa = 'usinagem';
    if (/^separar|^conferir cabeçote|desmontagem|^separação/.test(t)) etapa = 'separacao';
    else if (/montagem|folga|regulagem/.test(t)) etapa = 'montagem';
    else if (/qualidade|limpeza|acabamento|embalagem|teste/.test(t)) etapa = 'finalizacao';
    else if (/expedi|envio|transportador|liberação|avisar/.test(t)) etapa = 'envio';
    return Object.assign({ etapa }, c);
  });
}

/* ------------------------------------------------------------------ */
/* Financeiro da venda                                                 */
/* ------------------------------------------------------------------ */

/**
 * Resultado da venda:
 *  valor líquido (valor − taxa de cartão/link) − (custo-base + custos adicionais).
 */
function saleResult(sale) {
  const bruto = Number(sale.valorTotal) || 0;
  const taxa = Number(sale.pagamento && sale.pagamento.taxa) || 0;
  const liquido = bruto - taxa;
  const custoBase = Number(sale.custoBaseTotal) || 0;
  const adicionais = (sale.custosAdicionais || []).reduce((s, c) => s + (Number(c.valor) || 0), 0);
  // Frete pago pela empresa para esta venda também reduz a margem:
  // venda − taxa − custo − frete = lucro real.
  const frete = db.all('freights')
    .filter(f => f.saleId === sale.id && f.status !== 'cancelado')
    .reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const custoReal = custoBase + adicionais + frete;
  const resultado = liquido - custoReal;
  const margem = bruto > 0 ? (resultado / bruto) * 100 : 0;
  return { bruto, taxa, liquido, custoBase, custosAdicionais: adicionais, frete, custoReal, resultado, margem };
}

/* ------------------------------------------------------------------ */
/* Projeção financeira e DRE                                           */
/* ------------------------------------------------------------------ */

const PROJECTION_WINDOWS = [7, 30, 60, 90, 180, 365];

function projection(refDate) {
  const ref = refDate || today();
  const receivables = db.all('receivables').filter(r => r.status === 'aberto' || r.status === 'vencida');
  const payables = db.all('payables').filter(p => p.status === 'aberto' || p.status === 'vencida');
  const out = { referencia: ref, janelas: [] };
  for (const dias of PROJECTION_WINDOWS) {
    const limite = addDays(ref, dias);
    // Janelas consideram apenas compromissos futuros; vencidos são destacados à parte.
    const aReceber = receivables.filter(r => r.vencimento >= ref && r.vencimento <= limite).reduce((s, r) => s + r.valor, 0);
    const aPagar = payables.filter(p => p.vencimento >= ref && p.vencimento <= limite).reduce((s, p) => s + p.valor, 0);
    out.janelas.push({ dias, limite, aReceber, aPagar, saldoProjetado: aReceber - aPagar });
  }
  out.vencidoReceber = receivables.filter(r => r.vencimento < ref).reduce((s, r) => s + r.valor, 0);
  out.vencidoPagar = payables.filter(p => p.vencimento < ref).reduce((s, p) => s + p.valor, 0);
  return out;
}

/** Categorias do fluxo de caixa mapeadas para as linhas da DRE gerencial. */
const DRE_MAP = {
  receita: {
    venda_cabecote: 'Vendas de cabeçotes',
    venda_peca: 'Vendas de peças',
    servico: 'Serviços'
  },
  custos: {
    componentes: 'Componentes', materiais: 'Materiais', custo_direto: 'Custos diretos',
    mao_obra_direta: 'Mão de obra direta', terceirizacao: 'Terceirizações',
    custo_producao: 'Outros custos de produção', pos_operacao: 'Pós-operação',
    frete_venda: 'Frete de venda / Logística'
  },
  despesasOperacionais: {
    salarios: 'Salários', beneficios: 'Benefícios', aluguel: 'Aluguel', energia: 'Energia',
    agua: 'Água', telefone: 'Telefone', internet: 'Internet', sistemas: 'Sistemas',
    marketing: 'Marketing', manutencao: 'Manutenção', impostos: 'Impostos',
    consorcio: 'Consórcio', despesa_operacional: 'Despesas operacionais', outros: 'Outros'
  },
  despesasFinanceiras: {
    taxa_cartao: 'Taxas de cartão', tarifas: 'Tarifas bancárias', juros: 'Juros',
    despesa_financeira: 'Outras despesas financeiras'
  }
};

/**
 * DRE gerencial por competência aproximada:
 * receita = vendas + OS finalizadas no mês (regime gerencial), custos/despesas
 * a partir de compras, fatura de fornecedores, contas pagas e RH classificados por categoria.
 * Aqui usamos o fluxo de caixa categorizado como fonte, que é alimentado por todos os módulos,
 * MAIS receitas por competência (vendas/serviços do mês) para a visão "Receita (competência)".
 */
function dre(month /* 'YYYY-MM' */) {
  const inMonth = d => d && String(d).slice(0, 7) === month;
  const flows = db.all('cashflow');

  const section = (mapKey, tipo) => {
    const map = DRE_MAP[mapKey];
    const lines = {};
    let total = 0;
    for (const f of flows) {
      if (f.tipo !== tipo || !inMonth(f.data)) continue;
      if (!map[f.categoria]) continue;
      const label = map[f.categoria];
      lines[label] = (lines[label] || 0) + f.valor;
      total += f.valor;
    }
    return { linhas: lines, total };
  };

  const receita = section('receita', 'entrada');
  const custos = section('custos', 'saida');
  const despOp = section('despesasOperacionais', 'saida');
  const despFin = section('despesasFinanceiras', 'saida');

  // Receita por competência (independe do caixa): vendas do mês + OS finalizadas no mês.
  const vendasMes = db.all('sales').filter(s => inMonth(s.dataPedido) && s.status !== 'cancelado');
  /* OS cancelada não é receita. Os registros antigos gravavam 'cancelado'
     e os novos gravam 'cancelada' — as duas formas ficam de fora. */
  const cancelada = o => o.status === 'cancelada' || o.status === 'cancelado';
  const osMes = db.all('serviceOrders').filter(o => inMonth(o.dataFinalizacao) && !cancelada(o));
  const receitaCompetencia = {
    vendas: vendasMes.reduce((s, v) => s + (v.valorTotal || 0), 0),
    servicos: osMes.reduce((s, o) => s + (o.valorTotal || 0), 0)
  };
  receitaCompetencia.total = receitaCompetencia.vendas + receitaCompetencia.servicos;

  const lucroBruto = receita.total - custos.total;
  const lucroLiquido = lucroBruto - despOp.total - despFin.total;
  return {
    mes: month,
    receita, custos, lucroBruto,
    despesasOperacionais: despOp, despesasFinanceiras: despFin,
    lucroLiquido,
    margemLiquida: receita.total > 0 ? (lucroLiquido / receita.total) * 100 : 0,
    receitaCompetencia
  };
}

module.exports = {
  parseDay, fmtDay, addDays, today,
  previousFriday, inicioDoMesSeguinte, programarPagamento, generateInstallments,
  STAGE_COMANDOS, COMANDO_NOVO_STAGE1, COMPOSICAO_SUGERIDA, PAPEIS,
  rotuloStage, rotuloTipo, nomeProduto, opcoesDoProduto, validarProduto,
  tuchoOptions, validateConfig, productionChecklist,
  ETAPAS_PRODUCAO, ETAPAS_ORDEM, etapaAtual, statusPorEtapa, serviceChecklist, migrarChecklist,
  saleResult, projection, PROJECTION_WINDOWS, dre, DRE_MAP
};
