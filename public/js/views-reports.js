/* Central de relatórios com filtros, impressão e exportação */
'use strict';

App.registerView('reports', async (view) => {
  App.setTitle('Relatórios', 'Filtre, visualize, imprima ou exporte — inclui a função IMPRIMIR PENDÊNCIAS');

  const [sales, oss, entries, pos, clients, receivables, payables, purchases, stockItems, assets, expenses] =
    await Promise.all([
      App.get('/sales'), App.get('/serviceOrders'), App.get('/headEntries'),
      App.get('/productionOrders'), App.get('/clients'),
      App.can('receivables') ? App.get('/receivables') : [],
      App.can('payables') ? App.get('/payables') : [],
      App.can('purchases') ? App.get('/purchases') : [],
      App.can('stock') ? App.get('/stockItems') : [],
      App.get('/assets'),
      App.can('suppliers') ? App.get('/supplierExpenses') : []
    ]);
  App.cache.clients = clients;

  const cname = id => App.clientName(id, clients);
  const stLabel = s => (App.STATUS[s] || [s])[0];

  /* Cada relatório: {grupo, nome, filtros aplicáveis, rows(), cols} */
  const REPORTS = {
    /* -------- produção -------- */
    prod_pendencias: {
      g: 'Produção', nome: '🔥 IMPRIMIR PENDÊNCIAS — tudo que precisa ser feito',
      rows: f => [].concat(
        entries.filter(e => !['finalizado', 'aprovado'].includes(e.status)).map(e =>
          ({ tipo: 'Cabeçote de cliente', ref: e.codigo, cliente: cname(e.clienteId), detalhe: (e.modelo || '') + ' — ' + (e.defeito || ''), status: stLabel(e.status), data: e.dataChegada })),
        oss.filter(o => ['em_analise', 'em_andamento', 'aguardando_peca'].includes(o.status)).map(o =>
          ({ tipo: 'Serviço (OS)', ref: 'OS ' + o.numero, cliente: cname(o.clienteId), detalhe: (o.itens || []).map(i => i.nome).join(', '), status: stLabel(o.status), data: o.previsaoEntrega })),
        pos.filter(p => p.status !== 'pronto' && p.status !== 'cancelado').map(p =>
          ({ tipo: 'Produção (venda)', ref: 'OP #' + p.id + ' / Pedido ' + p.pedidoNumero, cliente: p.clienteNome, detalhe: p.produto + ' · ' + p.comando + ' · tucho ' + p.tucho, status: stLabel(p.status), data: p.previsaoEntrega }))
      ),
      cols: [['tipo', 'Tipo'], ['ref', 'Referência'], ['cliente', 'Cliente'], ['detalhe', 'O que fazer'], ['status', 'Status'], ['data', 'Data', 'date']]
    },
    prod_entradas: {
      g: 'Produção', nome: 'Cabeçotes de clientes (entradas)', temStatus: ['recebido', 'em_analise', 'aguardando_orcamento', 'orcado', 'aprovado', 'finalizado'],
      rows: f => entries.filter(e => byDate(f, e.dataChegada) && byStatus(f, e.status) && byClient(f, e.clienteId))
        .map(e => ({ ref: e.codigo, data: e.dataChegada, cliente: cname(e.clienteId), modelo: e.modelo, problema: e.defeito, status: stLabel(e.status) })),
      cols: [['ref', 'ID'], ['data', 'Chegada', 'date'], ['cliente', 'Cliente'], ['modelo', 'Modelo'], ['problema', 'Problema'], ['status', 'Status']]
    },
    prod_os: {
      g: 'Produção', nome: 'Serviços (OS) — em andamento / aguardando peças / não finalizados',
      temStatus: ['em_analise', 'em_andamento', 'aguardando_peca', 'finalizado', 'aguardando_pagamento'],
      rows: f => oss.filter(o => byStatus(f, o.status, ['em_analise', 'em_andamento', 'aguardando_peca']) && byClient(f, o.clienteId) && byResp(f, o.responsavelId))
        .map(o => ({ ref: 'OS ' + o.numero, cliente: cname(o.clienteId), modelo: o.modelo, servicos: (o.itens || []).map(i => i.nome).join(', '), resp: App.userName(o.responsavelId), previsao: o.previsaoEntrega, status: stLabel(o.status) })),
      cols: [['ref', 'OS'], ['cliente', 'Cliente'], ['modelo', 'Modelo'], ['servicos', 'Serviços'], ['resp', 'Responsável'], ['previsao', 'Previsão', 'date'], ['status', 'Status']]
    },
    prod_pedidos: {
      g: 'Produção', nome: 'Cabeçotes vendidos — pipeline de produção/entrega',
      temStatus: ['nao_produzido', 'preparacao', 'usinagem', 'montagem', 'pronto', 'enviado', 'entregue'],
      rows: f => sales.filter(s => s.status !== 'cancelado' && byDate(f, s.dataPedido) && byStatus(f, s.status) && byClient(f, s.clienteId))
        .map(s => ({ ref: 'Pedido ' + s.numero, data: s.dataPedido, cliente: cname(s.clienteId),
          itens: s.itens.map(i => `${i.qtd}× ${i.produto} (${i.comando}/${i.tucho}mm)`).join('; '),
          previsao: s.previsaoEntrega, status: stLabel(s.status) })),
      cols: [['ref', 'Pedido'], ['data', 'Data', 'date'], ['cliente', 'Cliente'], ['itens', 'Itens'], ['previsao', 'Previsão', 'date'], ['status', 'Status']]
    },
    /* -------- vendas -------- */
    vendas_periodo: {
      g: 'Vendas', nome: 'Vendas por período',
      rows: f => sales.filter(s => s.status !== 'cancelado' && byDate(f, s.dataPedido) && byClient(f, s.clienteId))
        .map(s => ({ ref: s.numero, data: s.dataPedido, cliente: cname(s.clienteId), cidade: s.cidade, uf: s.estado,
          qtd: s.itens.reduce((a, i) => a + i.qtd, 0), valor: s.valorTotal })),
      cols: [['ref', 'Nº'], ['data', 'Data', 'date'], ['cliente', 'Cliente'], ['cidade', 'Cidade'], ['uf', 'UF'], ['qtd', 'Qtd', 'num'], ['valor', 'Faturamento', 'money']],
      totais: ['qtd', 'valor']
    },
    vendas_produto: {
      g: 'Vendas', nome: 'Vendas por produto / Stage / unilateral × fluxo cruzado',
      rows: f => {
        const acc = {};
        for (const s of sales) {
          if (s.status === 'cancelado' || !byDate(f, s.dataPedido)) continue;
          for (const i of s.itens) {
            const k = i.produto;
            acc[k] = acc[k] || { produto: i.produto, tipo: i.tipo === 'crossflow' ? 'Fluxo cruzado' : 'Unilateral', stage: 'Stage ' + i.stage, qtd: 0, valor: 0 };
            acc[k].qtd += i.qtd; acc[k].valor += i.total;
          }
        }
        return Object.values(acc).sort((a, b) => b.valor - a.valor);
      },
      cols: [['produto', 'Produto'], ['tipo', 'Tipo'], ['stage', 'Stage'], ['qtd', 'Qtd vendida', 'num'], ['valor', 'Faturamento', 'money']],
      totais: ['qtd', 'valor']
    },
    vendas_regiao: {
      g: 'Vendas', nome: 'Vendas por estado / cidade',
      rows: f => {
        const acc = {};
        for (const s of sales) {
          if (s.status === 'cancelado' || !byDate(f, s.dataPedido)) continue;
          const k = (s.estado || '??') + ' — ' + (s.cidade || '??');
          acc[k] = acc[k] || { uf: s.estado || '?', cidade: s.cidade || '?', pedidos: 0, valor: 0 };
          acc[k].pedidos++; acc[k].valor += s.valorTotal;
        }
        return Object.values(acc).sort((a, b) => b.valor - a.valor);
      },
      cols: [['uf', 'UF'], ['cidade', 'Cidade'], ['pedidos', 'Pedidos', 'num'], ['valor', 'Faturamento', 'money']],
      totais: ['pedidos', 'valor']
    },
    /* -------- clientes -------- */
    clientes_aberto: {
      g: 'Clientes', nome: 'Clientes com valores em aberto',
      rows: f => {
        const acc = {};
        for (const r of receivables) {
          if (r.status !== 'aberto' && r.status !== 'vencida') continue;
          acc[r.clienteId] = acc[r.clienteId] || { cliente: cname(r.clienteId), aberto: 0, vencido: 0 };
          if (r.vencimento < App.today()) acc[r.clienteId].vencido += r.valor;
          else acc[r.clienteId].aberto += r.valor;
        }
        return Object.values(acc).sort((a, b) => (b.aberto + b.vencido) - (a.aberto + a.vencido));
      },
      cols: [['cliente', 'Cliente'], ['aberto', 'Em aberto', 'money'], ['vencido', 'Vencido', 'money']],
      totais: ['aberto', 'vencido']
    },
    /* -------- financeiro -------- */
    fin_pagar: {
      g: 'Financeiro', nome: 'Contas a pagar em aberto',
      rows: f => payables.filter(p => p.status !== 'pago')
        .map(p => ({ conta: p.descricao, categoria: p.categoria, vencimento: p.vencimento, programado: p.dataProgramada, valor: p.valor, status: stLabel(p.status) })),
      cols: [['conta', 'Conta'], ['categoria', 'Categoria'], ['vencimento', 'Vencimento', 'date'], ['programado', 'Pagamento programado', 'date'], ['valor', 'Valor', 'money'], ['status', 'Status']],
      totais: ['valor']
    },
    fin_receber: {
      g: 'Financeiro', nome: 'Contas a receber em aberto',
      rows: f => receivables.filter(r => r.status === 'aberto' || r.status === 'vencida')
        .map(r => ({ cliente: cname(r.clienteId), descricao: r.descricao, vencimento: r.vencimento, valor: r.valor, status: stLabel(r.vencimento < App.today() ? 'vencida' : r.status) })),
      cols: [['cliente', 'Cliente'], ['descricao', 'Descrição'], ['vencimento', 'Vencimento', 'date'], ['valor', 'Valor', 'money'], ['status', 'Status']],
      totais: ['valor']
    },
    /* -------- fornecedores -------- */
    forn_gastos: {
      g: 'Fornecedores', nome: 'Gastos por fornecedor (compras + despesas de fechamento)',
      rows: f => {
        const acc = {};
        for (const p of purchases) {
          if (!byDate(f, p.data)) continue;
          const k = p.fornecedorNome || '—';
          acc[k] = acc[k] || { fornecedor: k, compras: 0, valor: 0 };
          acc[k].compras++; acc[k].valor += p.valor;
        }
        for (const e of expenses) {
          if (!byDate(f, e.data)) continue;
          const s = (App.cache.suppliers || []).find(x => x.id === e.fornecedorId);
          const k = s ? s.nome : 'Fornecedor #' + e.fornecedorId;
          acc[k] = acc[k] || { fornecedor: k, compras: 0, valor: 0 };
          acc[k].compras++; acc[k].valor += e.valor;
        }
        return Object.values(acc).sort((a, b) => b.valor - a.valor);
      },
      cols: [['fornecedor', 'Fornecedor'], ['compras', 'Lançamentos', 'num'], ['valor', 'Total gasto', 'money']],
      totais: ['valor']
    },
    /* -------- estoque -------- */
    estoque_posicao: {
      g: 'Estoque', nome: 'Posição de estoque próprio',
      rows: f => stockItems.map(i => ({ item: i.nome, categoria: i.categoria, qtd: i.qtd, minimo: i.minimo || 0,
        situacao: i.minimo && i.qtd <= i.minimo ? 'COMPRAR' : 'OK' })),
      cols: [['item', 'Item'], ['categoria', 'Categoria'], ['qtd', 'Qtd', 'num'], ['minimo', 'Mínimo', 'num'], ['situacao', 'Situação']]
    },
    estoque_terceiros: {
      g: 'Estoque', nome: 'Bens de clientes na empresa',
      rows: f => assets.filter(a => a.status === 'na_empresa')
        .map(a => ({ bem: a.identificacao, cliente: cname(a.clienteId), entrada: a.dataEntrada, motivo: a.motivo,
          doc: a.semDocumentoFiscal ? 'SEM DOCUMENTO' : ((a.docFiscal && a.docFiscal.numero) || '—') })),
      cols: [['bem', 'Identificação'], ['cliente', 'Cliente'], ['entrada', 'Entrada', 'date'], ['motivo', 'Motivo'], ['doc', 'Doc. fiscal']]
    }
  };

  const byDate = (f, d) => (!f.de || (d && d >= f.de)) && (!f.ate || (d && d <= f.ate));
  const byStatus = (f, s, def) => f.status ? s === f.status : (def ? def.includes(s) || !def : true);
  const byClient = (f, id) => !f.cliente || id === Number(f.cliente);
  const byResp = (f, id) => !f.resp || id === Number(f.resp);

  // cache suppliers for report
  if (App.can('suppliers')) App.cache.suppliers = await App.get('/suppliers');

  const groups = {};
  for (const [k, r] of Object.entries(REPORTS)) (groups[r.g] = groups[r.g] || []).push([k, r]);

  view.innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <h3>ESCOLHA O RELATÓRIO</h3>
        <select id="rep-sel" size="12" style="height:auto">
          ${Object.entries(groups).map(([g, list]) =>
            `<optgroup label="${g}">${list.map(([k, r]) => `<option value="${k}">${App.esc(r.nome)}</option>`).join('')}</optgroup>`).join('')}
        </select>
      </div>
      <div class="card">
        <h3>FILTROS</h3>
        <div class="formgrid">
          <label class="field"><span>De</span><input type="date" id="rep-de"></label>
          <label class="field"><span>Até</span><input type="date" id="rep-ate"></label>
          <label class="field"><span>Status</span><select id="rep-status"><option value="">Todos</option></select></label>
          <label class="field"><span>Cliente</span>
            <select id="rep-cliente"><option value="">Todos</option>
            ${clients.map(c => `<option value="${c.id}">${App.esc(c.nome)}</option>`).join('')}</select></label>
          <label class="field"><span>Responsável</span>
            <select id="rep-resp"><option value="">Todos</option>
            ${App.meta.users.filter(u => u.active).map(u => `<option value="${u.id}">${App.esc(u.name)}</option>`).join('')}</select></label>
        </div>
        <div class="toolbar" style="margin:6px 0 0">
          <button class="btn primary" onclick="Rep.run()">Gerar relatório</button>
          <button class="btn" onclick="Rep.printIt()">🖨️ IMPRIMIR</button>
          <button class="btn" onclick="Rep.csv()">⬇ Exportar Excel/CSV</button>
        </div>
      </div>
    </div>
    <div id="rep-out" style="margin-top:16px"></div>`;

  let current = null;

  const fmtCell = (v, kind) => kind === 'money' ? 'R$ ' + App.money(v) : kind === 'date' ? App.date(v) : App.esc(v == null ? '—' : v);

  window.Rep = {
    run() {
      const key = document.getElementById('rep-sel').value;
      if (!key) return App.toast('Selecione um relatório', 'err');
      const rep = REPORTS[key];
      const f = {
        de: document.getElementById('rep-de').value,
        ate: document.getElementById('rep-ate').value,
        status: document.getElementById('rep-status').value,
        cliente: document.getElementById('rep-cliente').value,
        resp: document.getElementById('rep-resp').value
      };
      const rows = rep.rows(f);
      current = { rep, rows, f };
      const totals = rep.totais ? rep.cols.map(([k, , kind]) =>
        rep.totais.includes(k) ? (kind === 'money' ? 'R$ ' + App.money(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)) : rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)) : '') : null;
      document.getElementById('rep-out').innerHTML = `
        <div class="section-title">${App.esc(rep.nome)} <span class="muted small">(${rows.length} linha(s))</span></div>
        <div class="tablewrap"><table>
          <thead><tr>${rep.cols.map(([, h, kind]) => `<th class="${kind === 'money' || kind === 'num' ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${rep.cols.map(([k, , kind]) =>
            `<td class="${kind === 'money' || kind === 'num' ? 'num' : ''}">${fmtCell(r[k], kind)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${rep.cols.length}" class="empty">Nada encontrado com esses filtros</td></tr>`}</tbody>
          ${totals ? `<tfoot><tr style="background:var(--accent-dim)">${totals.map((t, i) =>
            `<td class="${i > 0 ? 'num' : ''}"><b>${i === 0 && !t ? 'TOTAL' : t}</b></td>`).join('')}</tr></tfoot>` : ''}
        </table></div>`;
    },
    printIt() {
      if (!current) this.run();
      if (!current) return;
      const { rep, rows, f } = current;
      const filtros = [f.de && 'de ' + App.date(f.de), f.ate && 'até ' + App.date(f.ate),
        f.status && 'status: ' + f.status, f.cliente && 'cliente: ' + cname(Number(f.cliente))].filter(Boolean).join(' · ') || 'sem filtros';
      App.print(rep.nome.replace('🔥 ', ''),
        `<table><tr>${rep.cols.map(([, h]) => `<th>${h}</th>`).join('')}</tr>
        ${rows.map(r => `<tr>${rep.cols.map(([k, , kind]) => `<td class="${kind === 'money' || kind === 'num' ? 'num' : ''}">${fmtCell(r[k], kind)}</td>`).join('')}</tr>`).join('')}</table>`,
        `${rows.length} linha(s) — filtros: ${filtros}`);
    },
    csv() {
      if (!current) this.run();
      if (!current) return;
      const { rep, rows } = current;
      App.exportCsv('relatorio.csv', rows.map(r => {
        const o = {};
        for (const [k, h, kind] of rep.cols) o[h] = kind === 'date' ? App.date(r[k]) : kind === 'money' ? String(r[k]).replace('.', ',') : r[k];
        return o;
      }));
    }
  };

  document.getElementById('rep-sel').addEventListener('change', e => {
    const rep = REPORTS[e.target.value];
    const sel = document.getElementById('rep-status');
    sel.innerHTML = '<option value="">Todos</option>' +
      (rep.temStatus || []).map(s => `<option value="${s}">${stLabel(s)}</option>`).join('');
    Rep.run();
  });
});
