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
  // Quem pode ver valores em R$ (Produção não pode)
  const verValores = App.can('cashflow') || App.can('receivables') || App.can('payables') || App.can('finance_sensitive');

  /* Cada relatório: {grupo, nome, filtros aplicáveis, rows(), cols} */
  const REPORTS = {
    /* -------- produção -------- */
    prod_pendencias: {
      ver: () => true,
      filtros: [],
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
      ver: () => App.can('entries'),
      filtros: ['de', 'ate', 'status', 'cliente'],
      g: 'Produção', nome: 'Cabeçotes de clientes (entradas)', temStatus: ['recebido', 'em_analise', 'aguardando_orcamento', 'orcado', 'aprovado', 'finalizado'],
      rows: f => entries.filter(e => byDate(f, e.dataChegada) && byStatus(f, e.status) && byClient(f, e.clienteId))
        .map(e => ({ ref: e.codigo, data: e.dataChegada, cliente: cname(e.clienteId), modelo: e.modelo, problema: e.defeito, status: stLabel(e.status) })),
      cols: [['ref', 'ID'], ['data', 'Chegada', 'date'], ['cliente', 'Cliente'], ['modelo', 'Modelo'], ['problema', 'Problema'], ['status', 'Status']]
    },
    prod_os: {
      ver: () => App.can('os'),
      filtros: ['status', 'cliente', 'resp'],
      g: 'Produção', nome: 'Serviços (OS) — em andamento / aguardando peças / não finalizados',
      temStatus: ['em_analise', 'em_andamento', 'aguardando_peca', 'finalizado', 'aguardando_pagamento'],
      rows: f => oss.filter(o => byStatus(f, o.status, ['em_analise', 'em_andamento', 'aguardando_peca']) && byClient(f, o.clienteId) && byResp(f, o.responsavelId))
        .map(o => ({ ref: 'OS ' + o.numero, cliente: cname(o.clienteId), modelo: o.modelo, servicos: (o.itens || []).map(i => i.nome).join(', '), resp: App.userName(o.responsavelId), previsao: o.previsaoEntrega, status: stLabel(o.status) })),
      cols: [['ref', 'OS'], ['cliente', 'Cliente'], ['modelo', 'Modelo'], ['servicos', 'Serviços'], ['resp', 'Responsável'], ['previsao', 'Previsão', 'date'], ['status', 'Status']]
    },
    prod_pedidos: {
      ver: () => App.can('sales'),
      filtros: ['de', 'ate', 'status', 'cliente'],
      g: 'Produção', nome: 'Cabeçotes vendidos — pipeline de produção/entrega',
      temStatus: ['nao_produzido', 'preparacao', 'usinagem', 'montagem', 'pronto', 'enviado', 'entregue'],
      rows: f => sales.filter(s => s.status !== 'cancelado' && byDate(f, s.dataPedido) && byStatus(f, s.status) && byClient(f, s.clienteId))
        .map(s => ({ ref: 'Pedido ' + s.numero, data: s.dataPedido, cliente: cname(s.clienteId),
          itens: s.itens.map(i => `${i.qtd}× ${i.produto} (${i.comando}/${i.tucho}mm)`).join('; '),
          previsao: s.previsaoEntrega, status: stLabel(s.status) })),
      cols: [['ref', 'Pedido'], ['data', 'Data', 'date'], ['cliente', 'Cliente'], ['itens', 'Itens'], ['previsao', 'Previsão', 'date'], ['status', 'Status']]
    },
    prod_producao: {
      ver: () => App.can('production'),
      filtros: ['status'],
      g: 'Produção', nome: 'Ordens de produção — o que está na bancada',
      temStatus: ['nao_produzido', 'preparacao', 'usinagem', 'montagem', 'pronto'],
      rows: f => pos.filter(p => byStatus(f, p.status, ['nao_produzido', 'preparacao', 'usinagem', 'montagem']))
        .map(p => ({ ref: 'Pedido ' + p.pedidoNumero, cliente: p.clienteNome, produto: p.produto,
          comando: p.comando, tucho: (p.tucho || '') + ' mm', previsao: p.previsaoEntrega, status: stLabel(p.status) })),
      cols: [['ref', 'Pedido'], ['cliente', 'Cliente'], ['produto', 'Configuração'], ['comando', 'Comando'],
        ['tucho', 'Tucho'], ['previsao', 'Previsão', 'date'], ['status', 'Status']]
    },
    prod_servicos: {
      ver: () => App.can('os'),
      filtros: [],
      g: 'Produção', nome: 'Serviços mais executados (volume)',
      rows: f => {
        const acc = {};
        for (const o of oss) {
          if (o.status === 'cancelado') continue;
          for (const i of o.itens || []) {
            const k = String(i.nome || '').trim() || '—';
            acc[k] = acc[k] || { servico: k, vezes: 0, os: 0 };
            acc[k].vezes += Number(i.qtd) || 1;
            acc[k].os++;
          }
        }
        return Object.values(acc).sort((a, b) => b.vezes - a.vezes);
      },
      cols: [['servico', 'Serviço'], ['os', 'Nº de OS', 'num'], ['vezes', 'Vezes executado', 'num']],
      totais: ['os', 'vezes']
    },
    /* -------- vendas -------- */
    vendas_periodo: {
      ver: () => verValores,
      filtros: ['de', 'ate', 'cliente'],
      g: 'Vendas', nome: 'Vendas por período',
      rows: f => sales.filter(s => s.status !== 'cancelado' && byDate(f, s.dataPedido) && byClient(f, s.clienteId))
        .map(s => ({ ref: s.numero, data: s.dataPedido, cliente: cname(s.clienteId), cidade: s.cidade, uf: s.estado,
          qtd: s.itens.reduce((a, i) => a + i.qtd, 0), valor: s.valorTotal })),
      cols: [['ref', 'Nº'], ['data', 'Data', 'date'], ['cliente', 'Cliente'], ['cidade', 'Cidade'], ['uf', 'UF'], ['qtd', 'Qtd', 'num'], ['valor', 'Faturamento', 'money']],
      totais: ['qtd', 'valor']
    },
    vendas_produto: {
      ver: () => verValores,
      filtros: ['de', 'ate'],
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
      ver: () => verValores,
      filtros: ['de', 'ate'],
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
      ver: () => App.can('receivables'),
      filtros: [],
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
      ver: () => App.can('payables'),
      filtros: [],
      g: 'Financeiro', nome: 'Contas a pagar em aberto',
      rows: f => payables.filter(p => p.status !== 'pago')
        .map(p => ({ conta: p.descricao, categoria: p.categoria, vencimento: p.vencimento, programado: p.dataProgramada, valor: p.valor, status: stLabel(p.status) })),
      cols: [['conta', 'Conta'], ['categoria', 'Categoria'], ['vencimento', 'Vencimento', 'date'], ['programado', 'Pagamento programado', 'date'], ['valor', 'Valor', 'money'], ['status', 'Status']],
      totais: ['valor']
    },
    fin_receber: {
      ver: () => App.can('receivables'),
      filtros: [],
      g: 'Financeiro', nome: 'Contas a receber em aberto',
      rows: f => receivables.filter(r => r.status === 'aberto' || r.status === 'vencida')
        .map(r => ({ cliente: cname(r.clienteId), descricao: r.descricao, vencimento: r.vencimento, valor: r.valor, status: stLabel(r.vencimento < App.today() ? 'vencida' : r.status) })),
      cols: [['cliente', 'Cliente'], ['descricao', 'Descrição'], ['vencimento', 'Vencimento', 'date'], ['valor', 'Valor', 'money'], ['status', 'Status']],
      totais: ['valor']
    },
    /* -------- fornecedores -------- */
    forn_gastos: {
      ver: () => App.can('suppliers'),
      filtros: ['de', 'ate'],
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
      ver: () => App.can('stock'),
      filtros: [],
      g: 'Estoque', nome: 'Posição de estoque próprio',
      rows: f => stockItems.map(i => ({ item: i.nome, categoria: i.categoria, qtd: i.qtd, minimo: i.minimo || 0,
        situacao: i.minimo && i.qtd <= i.minimo ? 'COMPRAR' : 'OK' })),
      cols: [['item', 'Item'], ['categoria', 'Categoria'], ['qtd', 'Qtd', 'num'], ['minimo', 'Mínimo', 'num'], ['situacao', 'Situação']]
    },
    estoque_terceiros: {
      ver: () => App.can('assets'),
      filtros: [],
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

  // 🔥 Pendências fica no Acesso Rápido; o restante entra no acordeão por grupo
  // Só entram na lista os relatórios que o perfil pode ver
  for (const [k, r] of Object.entries(REPORTS)) if (r.ver && !r.ver()) delete REPORTS[k];
  const groups = {};
  for (const [k, r] of Object.entries(REPORTS)) {
    if (k === 'prod_pendencias') continue;
    (groups[r.g] = groups[r.g] || []).push([k, r]);
  }

  view.innerHTML = `
    <div class="grid cols-2">
      <div>
        <div class="card rep-quick">
          <div class="rq-label">ACESSO RÁPIDO</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <button class="btn primary" onclick="Rep.pick('prod_pendencias')">🔥 IMPRIMIR PENDÊNCIAS</button>
            <button class="btn" onclick="Rep.pick('prod_pendencias', true)">🖨️ Imprimir direto</button>
          </div>
          <p class="small muted" style="margin-top:8px">Tudo que precisa ser feito — cabeçotes aguardando,
          serviços em andamento e produção pendente — pronto para entregar aos colaboradores.</p>
        </div>
        <div class="card" style="margin-top:12px">
          <h3>ESCOLHA O RELATÓRIO</h3>
          <div id="rep-list">
            ${Object.entries(groups).map(([g, list]) => `
              <div class="rep-group">
                <button class="rep-ghead" data-g="${App.esc(g)}"><span class="chev">▸</span>${App.esc(g)}
                  <span class="rg-count">${list.length}</span></button>
                <div class="rep-gitems closed" data-g="${App.esc(g)}">
                  ${list.map(([k, r]) => `<button class="rep-item" data-k="${k}">${App.esc(r.nome)}</button>`).join('')}
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
      <div class="card" style="align-self:start">
        <h3>FILTROS <span class="small muted" id="rep-f-hint" style="text-transform:none;letter-spacing:0"></span></h3>
        <div class="formgrid" id="rep-filtros" style="grid-template-columns:1fr 1fr">
          <label class="field" data-f="de"><span>De</span><input type="date" id="rep-de"></label>
          <label class="field" data-f="ate"><span>Até</span><input type="date" id="rep-ate"></label>
          <label class="field" data-f="status"><span>Status</span><select id="rep-status"><option value="">Todos</option></select></label>
          <label class="field" data-f="cliente"><span>Cliente</span>
            <select id="rep-cliente"><option value="">Todos</option>
            ${clients.map(c => `<option value="${c.id}">${App.esc(c.nome)}</option>`).join('')}</select></label>
          <label class="field" data-f="resp"><span>Responsável</span>
            <select id="rep-resp"><option value="">Todos</option>
            ${App.meta.users.filter(u => u.active).map(u => `<option value="${u.id}">${App.esc(u.name)}</option>`).join('')}</select></label>
        </div>
        <div id="rep-f-resumo" class="small muted" style="margin:2px 0 10px"></div>
        <hr class="sep">
        <button class="btn primary" id="rep-gerar" style="width:100%;justify-content:center" onclick="Rep.run()">Gerar relatório</button>
        <div class="rep-after">
          <span id="rep-ready" class="small muted">Escolha um relatório à esquerda para começar</span>
          <div class="spacer"></div>
          <button class="btn sm" id="rep-print" disabled onclick="Rep.printIt()">🖨️ Imprimir</button>
          <button class="btn sm" id="rep-csv" disabled onclick="Rep.csv()">⬇ Excel/CSV</button>
        </div>
      </div>
    </div>
    <div id="rep-out" style="margin-top:16px"></div>`;

  let current = null;
  let selectedKey = null;

  const fmtCell = (v, kind) => kind === 'money' ? 'R$ ' + App.money(v) : kind === 'date' ? App.date(v) : App.esc(v == null ? '—' : v);

  /* ---- estado visual: filtros aplicáveis, ativos e prontidão ---- */
  const FILTER_IDS = { de: 'rep-de', ate: 'rep-ate', status: 'rep-status', cliente: 'rep-cliente', resp: 'rep-resp' };

  function syncFilterUI() {
    const rep = selectedKey ? REPORTS[selectedKey] : null;
    const aplicaveis = rep ? (rep.filtros || []) : Object.keys(FILTER_IDS);
    const ativos = [];
    for (const [f, id] of Object.entries(FILTER_IDS)) {
      const campo = document.querySelector(`.field[data-f="${f}"]`);
      const input = document.getElementById(id);
      const aplica = aplicaveis.includes(f);
      input.disabled = !aplica;
      campo.classList.toggle('dim', !aplica);
      campo.classList.toggle('filtro-on', aplica && !!input.value);
      if (aplica && input.value) {
        if (f === 'de') ativos.push('de ' + App.date(input.value));
        else if (f === 'ate') ativos.push('até ' + App.date(input.value));
        else {
          const nome = { status: 'status', cliente: 'cliente', resp: 'resp.' }[f];
          const opt = input.selectedOptions && input.selectedOptions[0];
          ativos.push(nome + ': ' + (opt ? opt.text : input.value));
        }
      }
    }
    document.getElementById('rep-f-hint').textContent = rep && !aplicaveis.length ? '— este relatório não usa filtros' : '';
    document.getElementById('rep-f-resumo').innerHTML = ativos.length
      ? '<b>Filtros ativos:</b> ' + ativos.map(a => App.esc(a)).join(' · ')
      : (rep && aplicaveis.length ? 'Nenhum filtro — mostrando tudo' : '');
  }

  function setReady(state, texto) {
    document.getElementById('rep-ready').innerHTML = texto;
    document.getElementById('rep-print').disabled = !state;
    document.getElementById('rep-csv').disabled = !state;
  }

  window.Rep = {
    pick(key, imprimirDireto) {
      selectedKey = key;
      // destaca o item escolhido e abre só o grupo dele
      document.querySelectorAll('.rep-item').forEach(b => b.classList.toggle('active', b.dataset.k === key));
      const rep = REPORTS[key];
      document.querySelectorAll('.rep-gitems').forEach(el => {
        const doGrupo = el.dataset.g === rep.g;
        if (doGrupo && el.querySelector('.rep-item.active')) el.classList.remove('closed');
      });
      document.querySelectorAll('.rep-ghead').forEach(h =>
        h.classList.toggle('open', !document.querySelector(`.rep-gitems[data-g="${CSS.escape(h.dataset.g)}"]`).classList.contains('closed')));
      // opções de status conforme o relatório
      const sel = document.getElementById('rep-status');
      sel.value = '';
      sel.innerHTML = '<option value="">Todos</option>' +
        (rep.temStatus || []).map(s => `<option value="${s}">${stLabel(s)}</option>`).join('');
      syncFilterUI();
      this.run();
      if (imprimirDireto) this.printIt();
    },
    run() {
      const key = selectedKey;
      if (!key) return App.toast('Escolha um relatório na lista à esquerda', 'err');
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
      setReady(true, `<span style="color:var(--ok)">✓ Pronto</span> — ${rows.length} linha(s), pode imprimir ou exportar`);
      syncFilterUI();
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

  /* acordeão dos grupos */
  document.getElementById('rep-list').addEventListener('click', e => {
    const head = e.target.closest('.rep-ghead');
    if (head) {
      const items = document.querySelector(`.rep-gitems[data-g="${CSS.escape(head.dataset.g)}"]`);
      items.classList.toggle('closed');
      head.classList.toggle('open', !items.classList.contains('closed'));
      return;
    }
    const item = e.target.closest('.rep-item');
    if (item) Rep.pick(item.dataset.k);
  });

  /* mudou um filtro → marca como ativo e pede nova geração */
  document.getElementById('rep-filtros').addEventListener('change', () => {
    syncFilterUI();
    if (current) setReady(false, '<span style="color:var(--warn)">Filtros alterados</span> — clique em Gerar relatório');
  });

  syncFilterUI();

  /* Veio do atalho "Imprimir pendências da produção" do dashboard */
  if (sessionStorage.getItem('jm_rep_quick')) {
    const modo = sessionStorage.getItem('jm_rep_quick');
    sessionStorage.removeItem('jm_rep_quick');
    Rep.pick('prod_pendencias', modo === 'print');
  }
});
