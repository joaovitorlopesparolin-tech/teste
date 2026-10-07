/* Estoque próprio: cascos usinados, componentes e movimentações */
'use strict';

App.registerView('stock', async (view) => {
  App.setTitle('Estoque próprio', 'Somente produtos da empresa — bens de clientes ficam em módulo separado');
  /* A permissão de histórico pode ser concedida sozinha: quem só a tem
     enxerga as movimentações, não a posição nem o cadastro dos itens. */
  const veItens = App.can('stock');
  const [items, moves] = await Promise.all([
    veItens ? App.get('/stockItems') : Promise.resolve([]),
    App.get('/stock/history')
  ]);
  const fin = App.can('finance_sensitive');
  /* Corrigir o histórico é função da Direção — normalmente por lançamento
     retroativo, em que o sistema baixaria de novo algo que já saiu. */
  const podeCorrigir = App.can('stock_history_edit');

  const CATS = {
    casco_unilateral: 'Cascos usinados — Unilateral',
    casco_crossflow: 'Cascos usinados — Fluxo cruzado',
    valvula: 'Válvulas', mola: 'Molas', prato: 'Pratos', trava: 'Travas',
    tucho35: 'Tuchos 35 mm', tucho37: 'Tuchos 37 mm', comando: 'Comandos', outro: 'Outros componentes'
  };

  const catNome = i => CATS[i.categoria] || i.categoria || '—';
  const valorEmEstoque = i => (Number(i.custoUnit) || 0) * (Number(i.qtd) || 0);

  const cols = [
    { h: 'Item', sort: i => i.nome || '', sortDesc: false,
      cell: i => `<b>${App.esc(i.nome)}</b>${App.seloInativo(i)}` +
        (i.codigo ? `<div class="small muted mono">${App.esc(i.codigo)}</div>` : '') },
    { h: 'Categoria', sort: i => catNome(i), sortDesc: false,
      cell: i => `<span class="small muted">${catNome(i)}</span>` },
    { h: 'Quantidade', class: 'num', sort: i => Number(i.qtd) || 0, cell: i =>
      `<b class="${i.qtd <= 0 ? 'neg' : (i.minimo && i.qtd <= i.minimo ? 'neg' : '')}">${i.qtd}</b>${i.minimo ? `<span class="small muted"> / mín ${i.minimo}</span>` : ''}` },
    ...(fin ? [{ h: 'Custo unit.', class: 'num', sort: i => Number(i.custoUnit) || 0,
                 cell: i => 'R$ ' + App.money(i.custoUnit || 0) },
               { h: 'Valor em estoque', class: 'num', sort: i => valorEmEstoque(i),
                 cell: i => 'R$ ' + App.money(valorEmEstoque(i)) }] : []),
    { h: '', class: 'num', cell: i => i.ativo === false
      ? `<button class="btn sm ghost" onclick="Stock.reativar(${i.id})" title="Reativar item">↩️ Reativar</button>`
      : `
      <button class="btn sm" onclick="Stock.move(${i.id}, 'entrada')">+ Entrada</button>
      <button class="btn sm" onclick="Stock.move(${i.id}, 'saida')">− Saída</button>
      <button class="btn sm ghost" onclick="Stock.edit(${i.id})" title="Editar cadastro">✏️</button>
      <button class="btn sm ghost" title="Excluir item" onclick="Stock.del(${i.id})">🗑️</button>` }
  ];

  const low = items.filter(i => i.minimo && i.qtd <= i.minimo && i.ativo !== false);

  /* Antes a tela era uma tabela por categoria, sem busca e sem ordenação.
     Agora é UMA lista, em ordem alfabética, com a categoria como coluna e
     como filtro — o mesmo formato das outras abas. */
  let ordemItens = { chave: 'Item', desc: false };

  view.innerHTML = `
    ${veItens ? `<div class="toolbar">
      <button class="btn primary" onclick="Stock.edit()">+ Novo item</button>
      <select id="st-cat" style="max-width:260px" title="Filtrar por categoria">
        <option value="">Todas as categorias</option>
        ${Object.entries(CATS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
      <select id="st-situacao" style="max-width:190px" title="Itens ativos, inativos ou todos">
        <option value="ativos">Itens ativos</option>
        <option value="baixo">Abaixo do mínimo</option>
        <option value="inativos">Itens inativos</option>
        <option value="todos">Ativos e inativos</option>
      </select>
      <input class="search" id="st-busca" style="max-width:320px"
        placeholder="🔎 Buscar por nome, código, categoria…">
      <button class="btn sm ghost" id="st-limpar" title="Limpar a busca e os filtros">Limpar filtros</button>
      <div class="spacer"></div>
      ${low.length ? `<span class="badge danger">${low.length} item(ns) abaixo do mínimo — comprar</span>` : ''}
      <span class="muted small" id="st-contagem"></span>
      <button class="btn" onclick="Stock.print()">🖨️ Imprimir</button>
    </div>
    <div class="small muted" style="margin:-4px 0 10px">Clique no cabeçalho da coluna para ordenar — a ordenação é só da visualização, não muda nada no cadastro.</div>
    <div id="st-lista"></div>` : ''}
    <div class="section-title">Histórico de movimentações
      ${podeCorrigir ? '<span class="small muted">— a Direção pode corrigir ou estornar lançamentos retroativos</span>' : ''}</div>
    <div class="toolbar" style="margin-bottom:8px">
      <input class="search" id="mv-busca" placeholder="🔎 Buscar por item, origem, fornecedor, NF ou observação…" style="max-width:340px">
      <span class="spacer"></span>
      <span class="small muted" id="mv-contagem"></span>
    </div>
    <div id="mv-lista"></div>`;

  /* Nome, código e categoria — e o que mais estiver cadastrado no item.
     Sem acento e em qualquer ordem, como nas outras buscas do sistema. */
  const CAMPOS_ITEM = ['nome', 'codigo', 'observacoes', catNome,
    i => i.ativo === false ? 'inativo' : 'ativo',
    i => String(i.qtd), i => String(i.minimo || '')];

  const itensVisiveis = () => {
    const cat = document.getElementById('st-cat').value;
    const sit = document.getElementById('st-situacao').value;
    const base = items.filter(i => {
      if (cat && i.categoria !== cat) return false;
      if (sit === 'ativos') return i.ativo !== false;
      if (sit === 'inativos') return i.ativo === false;
      if (sit === 'baixo') return i.ativo !== false && i.minimo && i.qtd <= i.minimo;
      return true;
    });
    return App.filtraPor(base, document.getElementById('st-busca').value, CAMPOS_ITEM);
  };

  const renderItens = () => {
    if (!veItens) return;
    const lista = itensVisiveis();
    const soma = lista.reduce((s, i) => s + valorEmEstoque(i), 0);
    document.getElementById('st-contagem').textContent =
      `${lista.length} item(ns)` + (fin ? ` · R$ ${App.money(soma)} em estoque` : '');
    document.getElementById('st-lista').innerHTML = App.table(lista, cols, {
      emptyMsg: document.getElementById('st-busca').value
        ? 'Nenhum item encontrado com esse texto'
        : 'Nenhum item nesta seleção',
      sortState: ordemItens,
      onSort: (o) => { ordemItens = o; renderItens(); }
    });
  };

  if (veItens) {
    ['st-cat', 'st-situacao'].forEach(id =>
      document.getElementById(id).addEventListener('change', renderItens));
    document.getElementById('st-busca').addEventListener('input', renderItens);
    document.getElementById('st-limpar').onclick = () => {
      document.getElementById('st-busca').value = '';
      document.getElementById('st-cat').value = '';
      document.getElementById('st-situacao').value = 'ativos';
      ordemItens = { chave: 'Item', desc: false };
      renderItens();
    };
    renderItens();
  }

  /* Mais recente primeiro é o que interessa no histórico. */
  let ordemMoves = { chave: 'Data', desc: true };

  const ORIGEM = m => m.estornada ? 'Estornada'
    : m.refType === 'productionOrders' ? 'Produção'
      : m.refType === 'purchases' ? 'Compra'
        : m.refType === 'sales' ? 'Venda' : 'Manual';

  const colsMoves = () => [
      { h: 'Data', sort: m => m.data || '', cell: m => App.date(m.data) },
      { h: 'Item', sort: m => m.itemNome || '', sortDesc: false, cell: m => App.esc(m.itemNome) },
      { h: 'Tipo', sort: m => (m.estornada ? 'estornada' : m.tipo) || '', sortDesc: false, cell: m => m.estornada
        ? '<span class="badge cancelada">Estornada</span>'
        : (m.tipo === 'entrada' ? '<span class="badge ok">Entrada</span>' : '<span class="badge warn">Saída</span>') },
      { h: 'Qtd', class: 'num', sort: m => Number(m.qtd) || 0, cell: m => `<span class="${m.estornada ? 'muted' : ''}">${m.qtd}</span>` },
      { h: 'Efeito no saldo', class: 'num', sort: m => Number(m.efeito) || 0, cell: m => m.efeito === 0
        ? '<span class="muted">0</span>'
        : `<span class="${m.efeito > 0 ? 'pos' : 'neg'}">${m.efeito > 0 ? '+' : ''}${m.efeito}</span>` },
      { h: 'Origem', sort: m => ORIGEM(m), sortDesc: false,
        cell: m => `<span class="small muted">${App.esc(ORIGEM(m))}${m.obs ? ' — ' + App.esc(m.obs) : ''}</span>` +
          /* Entrada por compra carrega de onde veio a peça: fornecedor, NF
             e custo. É o que responde "por quanto eu comprei isto". */
          (m.refType === 'purchases' ? `<div class="small muted">${
            [m.fornecedorNome ? App.esc(m.fornecedorNome) : '',
             m.documento ? `${App.esc((m.documentoTipo || 'doc').toUpperCase())} ${App.esc(m.documento)}` : '',
             m.compraId ? 'compra #' + m.compraId : '',
             (Number(m.custoUnit) || 0) > 0 && fin
               ? `R$ ${App.money(m.custoUnit)}/un · total R$ ${App.money(m.custoTotal || 0)}` : ''
            ].filter(Boolean).join(' · ')}</div>` : '') },
      { h: 'Correção', cell: m => m.corrigidaPor || m.estornadaPor
        ? `<span class="small">${App.esc(m.corrigidaPor || m.estornadaPor)}<div class="muted">${
            App.esc(m.motivoCorrecao || m.motivoEstorno || '')}</div></span>`
        : '<span class="muted small">—</span>' },
      ...(podeCorrigir ? [{ h: '', class: 'num', cell: m => `
        ${m.estornada ? '' : `<button class="btn sm ghost" onclick="Stock.corrigir(${m.id})" title="Corrigir esta movimentação">✎</button>`}
        <button class="btn sm ghost" onclick="Stock.estornar(${m.id})" title="${m.estornada ? 'Reativar' : 'Estornar'} a movimentação">${m.estornada ? '↻' : '🚫'}</button>` }] : [])
  ];

  const renderMoves = () => {
    const cols = colsMoves();
    const q = App.normaliza(document.getElementById('mv-busca').value);
    const achadas = !q ? moves : moves.filter(m =>
      App.normaliza([m.itemNome, ORIGEM(m), m.obs, m.data,
        m.fornecedorNome, m.documento, m.compraId ? 'compra ' + m.compraId : ''].join(' ')).includes(q));
    /* Ordena ANTES de cortar em 200: senão "mais antigas primeiro" mostraria
       as mais antigas só entre as 200 mais novas. */
    const list = App.ordenaComo(achadas, cols, ordemMoves).slice(0, 200);
    document.getElementById('mv-contagem').textContent =
      `${achadas.length} movimentação(ões)` + (achadas.length > 200 ? ' — mostrando 200' : '');
    document.getElementById('mv-lista').innerHTML = App.table(list, cols, {
      emptyMsg: 'Nenhuma movimentação',
      sortState: ordemMoves,
      onSort: (o) => { ordemMoves = o; renderMoves(); }
    });
  };
  renderMoves();
  document.getElementById('mv-busca').addEventListener('input', renderMoves);

  window.Stock = {
    edit(id) {
      const i = id ? items.find(x => x.id === id) : {};
      App.form(id ? 'Editar item' : 'Novo item de estoque', [
        { name: 'nome', label: 'Nome', value: i.nome, required: true, full: true },
        /* Código da peça (o do fornecedor, o do catálogo, o que a oficina
           usa). Opcional — quem não tem continua achando pelo nome. */
        { name: 'codigo', label: 'Código / referência (opcional)', value: i.codigo || '' },
        { name: 'categoria', label: 'Categoria', type: 'select', value: i.categoria || 'outro',
          options: Object.entries(CATS).map(([v, l]) => ({ value: v, label: l })) },
        { name: 'minimo', label: 'Estoque mínimo (alerta de compra)', type: 'number', value: i.minimo || 0 },
        ...(App.can('finance_sensitive') ? [{ name: 'custoUnit', label: 'Custo unitário (R$)', type: 'number', step: '0.01', value: i.custoUnit || 0 }] : [])
      ], async d => {
        if (id) await App.put('/stockItems/' + id, d);
        else await App.post('/stockItems', Object.assign(d, { qtd: 0 }));
        App.closeModal(); App.toast('Item salvo', 'ok'); App.route();
      });
    },
    del(id) {
      const i = items.find(x => x.id === id);
      App.excluirCadastro('stockItems', id, i && i.nome);
    },
    reativar(id) {
      const i = items.find(x => x.id === id);
      App.reativar('stockItems', id, i && i.nome);
    },
    /* Correção do histórico (Direção). O saldo do item não é digitado: o
       servidor aplica só a diferença entre o que a movimentação dizia e o
       que passa a dizer, para a correção não virar uma segunda baixa. */
    corrigir(movId) {
      const m = moves.find(x => x.id === movId);
      if (!m) return;
      App.form(`Corrigir movimentação #${m.id} — ${m.itemNome}`, [
        { name: 'tipo', label: 'Tipo', type: 'select', value: m.tipo,
          options: [{ value: 'entrada', label: 'Entrada' }, { value: 'saida', label: 'Saída' }] },
        { name: 'qtd', label: 'Quantidade', type: 'number', value: m.qtd, required: true },
        { name: 'data', label: 'Data da movimentação', type: 'date', value: m.data, required: true },
        { name: 'refType', label: 'Origem', type: 'select', value: m.refType || 'manual', full: true,
          options: [
            { value: 'manual', label: 'Manual / ajuste' },
            { value: 'sales', label: 'Venda' },
            { value: 'purchases', label: 'Compra' },
            { value: 'productionOrders', label: 'Produção' }] },
        { name: 'obs', label: 'Observação da movimentação', value: m.obs || '', full: true },
        { name: 'motivo', label: 'Motivo da correção (obrigatório — fica na auditoria)', required: true, full: true }
      ], async d => {
        d.qtd = Number(d.qtd);
        const r = await App.put(`/stock/history/${movId}`, d);
        App.closeModal();
        App.toast(`Movimentação corrigida — saldo do item ${r.ajusteNoSaldo >= 0 ? '+' : ''}${r.ajusteNoSaldo} (agora ${r.saldoItem})`, 'ok');
        App.route();
      });
    },
    estornar(movId) {
      const m = moves.find(x => x.id === movId);
      if (!m) return;
      const reativando = !!m.estornada;
      App.form(`${reativando ? 'Reativar' : 'Estornar'} movimentação #${m.id} — ${m.itemNome}`, [
        { name: 'motivo', label: 'Motivo (obrigatório — fica na auditoria)', required: true, full: true }
      ], async d => {
        const r = await App.post(`/stock/history/${movId}/estornar`, d);
        App.closeModal();
        App.toast(`Movimentação ${r.estornada ? 'estornada' : 'reativada'} — saldo do item agora ${r.saldoItem}`, 'ok');
        App.route();
      });
    },
    move(id, tipo) {
      const i = items.find(x => x.id === id);
      App.form(`${tipo === 'entrada' ? 'Entrada' : 'Saída'} — ${i.nome} (atual: ${i.qtd})`, [
        { name: 'qtd', label: 'Quantidade', type: 'number', required: true, full: true },
        { name: 'obs', label: 'Motivo / observação', full: true }
      ], async d => {
        await App.post(`/stock/${id}/move`, { tipo, qtd: Number(d.qtd), obs: d.obs });
        App.closeModal(); App.toast('Movimentação registrada', 'ok'); App.route();
      });
    },
    /* Imprime exatamente o que está na tela: mesma busca, mesmos filtros,
       mesma ordem dos cabeçalhos. */
    print() {
      const lista = App.ordenaComo(itensVisiveis(), cols, ordemItens);
      const busca = document.getElementById('st-busca').value;
      const cat = document.getElementById('st-cat').value;
      const soma = lista.reduce((s, i) => s + valorEmEstoque(i), 0);
      App.print('Posição de estoque próprio'
        + (cat ? ' — ' + CATS[cat] : '')
        + (busca ? ` — busca: “${busca}”` : ''),
        `<table><tr><th>Item</th><th>Código</th><th>Categoria</th><th class="num">Qtd</th><th class="num">Mínimo</th>${
          fin ? '<th class="num">Custo unit.</th><th class="num">Valor em estoque</th>' : ''}</tr>
        ${lista.map(i => `<tr><td>${App.esc(i.nome)}${i.ativo === false ? ' (inativo)' : ''}</td>
          <td>${App.esc(i.codigo || '—')}</td><td>${catNome(i)}</td>
          <td class="num">${i.qtd}</td><td class="num">${i.minimo || '—'}</td>${
          fin ? `<td class="num">R$ ${App.money(i.custoUnit || 0)}</td><td class="num">R$ ${App.money(valorEmEstoque(i))}</td>` : ''}</tr>`).join('')}</table>`,
        `${lista.length} item(ns)` + (fin ? ` — R$ ${App.money(soma)} em estoque` : ''));
    }
  };
});
