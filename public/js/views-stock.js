/* Estoque próprio: cascos usinados, componentes e movimentações */
'use strict';

App.registerView('stock', async (view) => {
  App.setTitle('Estoque próprio', 'Somente produtos da empresa — bens de clientes ficam em módulo separado');
  const [items, moves] = await Promise.all([App.get('/stockItems'), App.get('/stockMoves')]);
  moves.sort((a, b) => b.id - a.id);
  const fin = App.can('finance_sensitive');

  const CATS = {
    casco_unilateral: 'Cascos usinados — Unilateral',
    casco_crossflow: 'Cascos usinados — Fluxo cruzado',
    valvula: 'Válvulas', mola: 'Molas', prato: 'Pratos', trava: 'Travas',
    tucho35: 'Tuchos 35 mm', tucho37: 'Tuchos 37 mm', comando: 'Comandos', outro: 'Outros componentes'
  };

  const cols = [
    { h: 'Item', cell: i => `<b>${App.esc(i.nome)}</b>` },
    { h: 'Categoria', cell: i => `<span class="small muted">${CATS[i.categoria] || i.categoria}</span>` },
    { h: 'Quantidade', class: 'num', cell: i =>
      `<b class="${i.qtd <= 0 ? 'neg' : (i.minimo && i.qtd <= i.minimo ? 'neg' : '')}">${i.qtd}</b>${i.minimo ? `<span class="small muted"> / mín ${i.minimo}</span>` : ''}` },
    ...(fin ? [{ h: 'Custo unit.', class: 'num', cell: i => 'R$ ' + App.money(i.custoUnit || 0) },
               { h: 'Valor em estoque', class: 'num', cell: i => 'R$ ' + App.money((i.custoUnit || 0) * i.qtd) }] : []),
    { h: '', class: 'num', cell: i => `
      <button class="btn sm" onclick="Stock.move(${i.id}, 'entrada')">+ Entrada</button>
      <button class="btn sm" onclick="Stock.move(${i.id}, 'saida')">− Saída</button>
      <button class="btn sm ghost" onclick="Stock.edit(${i.id})">✎</button>
      <button class="btn sm ghost" title="Excluir item" onclick="Stock.del(${i.id})">🗑</button>` }
  ];

  const groups = Object.keys(CATS).map(cat => {
    const list = items.filter(i => i.categoria === cat);
    if (!list.length) return '';
    return `<div class="section-title">${CATS[cat]}</div>` + App.table(list, cols);
  }).join('');

  const low = items.filter(i => i.minimo && i.qtd <= i.minimo);

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Stock.edit()">+ Novo item</button>
      <div class="spacer"></div>
      ${low.length ? `<span class="badge danger">${low.length} item(ns) abaixo do mínimo — comprar</span>` : ''}
      <button class="btn" onclick="Stock.print()">🖨️ Imprimir</button>
    </div>
    ${groups}
    <div class="section-title">Últimas movimentações</div>
    ${App.table(moves.slice(0, 30), [
      { h: 'Data', cell: m => App.date(m.data) },
      { h: 'Item', cell: m => App.esc(m.itemNome) },
      { h: 'Tipo', cell: m => m.tipo === 'entrada' ? '<span class="badge ok">Entrada</span>' : '<span class="badge warn">Saída</span>' },
      { h: 'Qtd', class: 'num', cell: m => m.qtd },
      { h: 'Origem', cell: m => `<span class="small muted">${App.esc(m.refType === 'productionOrders' ? 'Produção' : m.refType === 'purchases' ? 'Compra' : 'Manual')}${m.obs ? ' — ' + App.esc(m.obs) : ''}</span>` }
    ], { emptyMsg: 'Nenhuma movimentação' })}`;

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
    async del(id) {
      const i = items.find(x => x.id === id);
      let msg = `Excluir o item "${i.nome}" do estoque?`;
      if (i.qtd) msg += ` Atenção: ele ainda tem ${i.qtd} unidade(s) em estoque.`;
      if (moves.some(m => m.itemId === id)) msg += ' As movimentações já registradas permanecem no histórico.';
      if (!await App.confirm(msg)) return;
      try {
        await App.del('/stockItems/' + id);
        App.toast('Item excluído do estoque', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
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
          const list = items.filter(i => i.categoria === cat);
          if (!list.length) return '';
          return `<h3>${CATS[cat]}</h3><table><tr><th>Item</th><th class="num">Qtd</th><th class="num">Mínimo</th></tr>
            ${list.map(i => `<tr><td>${App.esc(i.nome)}</td><td class="num">${i.qtd}</td><td class="num">${i.minimo || '—'}</td></tr>`).join('')}</table>`;
        }).join(''),
        items.length + ' itens');
    }
  };
});
