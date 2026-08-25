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

  const cols = [
    { h: 'Item', cell: i => `<b>${App.esc(i.nome)}</b>${App.seloInativo(i)}` },
    { h: 'Categoria', cell: i => `<span class="small muted">${CATS[i.categoria] || i.categoria}</span>` },
    { h: 'Quantidade', class: 'num', cell: i =>
      `<b class="${i.qtd <= 0 ? 'neg' : (i.minimo && i.qtd <= i.minimo ? 'neg' : '')}">${i.qtd}</b>${i.minimo ? `<span class="small muted"> / mín ${i.minimo}</span>` : ''}` },
    ...(fin ? [{ h: 'Custo unit.', class: 'num', cell: i => 'R$ ' + App.money(i.custoUnit || 0) },
               { h: 'Valor em estoque', class: 'num', cell: i => 'R$ ' + App.money((i.custoUnit || 0) * i.qtd) }] : []),
    { h: '', class: 'num', cell: i => i.ativo === false
      ? `<button class="btn sm ghost" onclick="Stock.reativar(${i.id})" title="Reativar item">↩️ Reativar</button>`
      : `
      <button class="btn sm" onclick="Stock.move(${i.id}, 'entrada')">+ Entrada</button>
      <button class="btn sm" onclick="Stock.move(${i.id}, 'saida')">− Saída</button>
      <button class="btn sm ghost" onclick="Stock.edit(${i.id})" title="Editar cadastro">✏️</button>
      <button class="btn sm ghost" title="Excluir item" onclick="Stock.del(${i.id})">🗑️</button>` }
  ];

  const groups = Object.keys(CATS).map(cat => {
    const list = items.filter(i => i.categoria === cat && i.ativo !== false);
    if (!list.length) return '';
    return `<div class="section-title">${CATS[cat]}</div>` + App.table(list, cols);
  }).join('');
  const inativos = items.filter(i => i.ativo === false);

  const low = items.filter(i => i.minimo && i.qtd <= i.minimo && i.ativo !== false);

  view.innerHTML = `
    ${veItens ? `<div class="toolbar">
      <button class="btn primary" onclick="Stock.edit()">+ Novo item</button>
      <div class="spacer"></div>
      ${low.length ? `<span class="badge danger">${low.length} item(ns) abaixo do mínimo — comprar</span>` : ''}
      <button class="btn" onclick="Stock.print()">🖨️ Imprimir</button>
    </div>` : ''}
    ${veItens ? groups : ''}
    ${veItens && inativos.length ? `<div class="section-title">Itens inativos <span class="small muted">— não aparecem em novas vendas nem em movimentações; o histórico continua intacto</span></div>` + App.table(inativos, cols) : ''}
    <div class="section-title">Histórico de movimentações
      ${podeCorrigir ? '<span class="small muted">— a Direção pode corrigir ou estornar lançamentos retroativos</span>' : ''}</div>
    <div class="toolbar" style="margin-bottom:8px">
      <input id="mv-busca" placeholder="🔎 Buscar por item, origem ou observação…" style="max-width:340px">
      <span class="spacer"></span>
      <span class="small muted" id="mv-contagem"></span>
    </div>
    <div id="mv-lista"></div>`;

  const ORIGEM = m => m.estornada ? 'Estornada'
    : m.refType === 'productionOrders' ? 'Produção'
      : m.refType === 'purchases' ? 'Compra'
        : m.refType === 'sales' ? 'Venda' : 'Manual';

  const renderMoves = () => {
    const q = App.normaliza(document.getElementById('mv-busca').value);
    const list = (!q ? moves : moves.filter(m =>
      App.normaliza([m.itemNome, ORIGEM(m), m.obs, m.data].join(' ')).includes(q))).slice(0, 200);
    document.getElementById('mv-contagem').textContent = `${list.length} movimentação(ões)`;
    document.getElementById('mv-lista').innerHTML = App.table(list, [
      { h: 'Data', cell: m => App.date(m.data) },
      { h: 'Item', cell: m => App.esc(m.itemNome) },
      { h: 'Tipo', cell: m => m.estornada
        ? '<span class="badge cancelada">Estornada</span>'
        : (m.tipo === 'entrada' ? '<span class="badge ok">Entrada</span>' : '<span class="badge warn">Saída</span>') },
      { h: 'Qtd', class: 'num', cell: m => `<span class="${m.estornada ? 'muted' : ''}">${m.qtd}</span>` },
      { h: 'Efeito no saldo', class: 'num', cell: m => m.efeito === 0
        ? '<span class="muted">0</span>'
        : `<span class="${m.efeito > 0 ? 'pos' : 'neg'}">${m.efeito > 0 ? '+' : ''}${m.efeito}</span>` },
      { h: 'Origem', cell: m => `<span class="small muted">${App.esc(ORIGEM(m))}${m.obs ? ' — ' + App.esc(m.obs) : ''}</span>` },
      { h: 'Correção', cell: m => m.corrigidaPor || m.estornadaPor
        ? `<span class="small">${App.esc(m.corrigidaPor || m.estornadaPor)}<div class="muted">${
            App.esc(m.motivoCorrecao || m.motivoEstorno || '')}</div></span>`
        : '<span class="muted small">—</span>' },
      ...(podeCorrigir ? [{ h: '', class: 'num', cell: m => `
        ${m.estornada ? '' : `<button class="btn sm ghost" onclick="Stock.corrigir(${m.id})" title="Corrigir esta movimentação">✎</button>`}
        <button class="btn sm ghost" onclick="Stock.estornar(${m.id})" title="${m.estornada ? 'Reativar' : 'Estornar'} a movimentação">${m.estornada ? '↻' : '🚫'}</button>` }] : [])
    ], { emptyMsg: 'Nenhuma movimentação' });
  };
  renderMoves();
  document.getElementById('mv-busca').addEventListener('input', renderMoves);

  window.Stock = {
    edit(id) {
      const i = id ? items.find(x => x.id === id) : {};
      App.form(id ? 'Editar item' : 'Novo item de estoque', [
        { name: 'nome', label: 'Nome', value: i.nome, required: true, full: true },
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
    print() {
      App.print('Posição de estoque próprio',
        Object.keys(CATS).map(cat => {
          const list = items.filter(i => i.categoria === cat && i.ativo !== false);
          if (!list.length) return '';
          return `<h3>${CATS[cat]}</h3><table><tr><th>Item</th><th class="num">Qtd</th><th class="num">Mínimo</th></tr>
            ${list.map(i => `<tr><td>${App.esc(i.nome)}</td><td class="num">${i.qtd}</td><td class="num">${i.minimo || '—'}</td></tr>`).join('')}</table>`;
        }).join(''),
        App.ativos(items).length + ' itens');
    }
  };
});
