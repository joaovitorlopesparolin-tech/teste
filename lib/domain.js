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
 * Ex.: venda 27/07, R$ 12.000, 3x, intervalo 20 dias →
 *      16/08 / 05/09 / 25/09, R$ 4.000 cada.
 * Centavos de arredondamento vão para a última parcela.
 */
function generateInstallments(saleDate, total, count, intervalDays) {
  count = Math.max(1, Number(count) || 1);
  intervalDays = Number(intervalDays) || 30;
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / count);
  const out = [];
  for (let i = 1; i <= count; i++) {
    const value = (i === count) ? cents - base * (count - 1) : base;
    out.push({
      parcela: i,
      parcelas: count,
      vencimento: addDays(saleDate, intervalDays * i),
      valor: value / 100
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Produtos: Stage × comando × tucho                                   */
/* ------------------------------------------------------------------ */

const STAGE_COMANDOS = {
  1: ['288'],
  2: ['290x300', '290x290'],
  3: ['300x308', '300x318', '316x320', '316x316', '308x320']
};

/** Tuchos válidos por stage/comando. Exceção: Stage 3 com 300x308 aceita 35 ou 37. */
function tuchoOptions(stage, comando) {
  stage = Number(stage);
  if (stage === 1 || stage === 2) return ['35'];
  if (stage === 3) return comando === '300x308' ? ['35', '37'] : ['37'];
  return [];
}

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

/**
 * Checklist da ordem de produção de um cabeçote vendido.
 * Operações extras entram automaticamente conforme a configuração:
 *  - Stage 3: retrabalho manual dos dutos de escape;
 *  - tucho 37 mm: abertura do alojamento dos tuchos para 37 mm.
 */
function productionChecklist(tipo, stage, comando, tucho) {
  const items = [
    `Separar casco usinado (${tipo === 'crossflow' ? 'fluxo cruzado' : 'unilateral'})`,
    'Separar válvulas',
    'Separar molas',
    'Separar pratos',
    'Separar travas',
    `Separar comando ${comando}`,
    `Separar tuchos ${tucho} mm`
  ];
  if (String(tucho) === '37') items.push('Abertura do alojamento dos tuchos para 37 mm');
  if (Number(stage) === 3) items.push('Retrabalho manual dos dutos de escape (melhoria de fluxo)');
  items.push('Montagem', 'Controle de qualidade', 'Embalagem', 'Expedição');
  return items.map(t => ({ item: t, done: false }));
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
  const osMes = db.all('serviceOrders').filter(o => inMonth(o.dataFinalizacao) && o.status !== 'cancelado');
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
  STAGE_COMANDOS, tuchoOptions, validateConfig, productionChecklist,
  saleResult, projection, PROJECTION_WINDOWS, dre, DRE_MAP
};
