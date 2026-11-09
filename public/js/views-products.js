/* Produtos e custos: configurações dos cabeçotes, composição técnica,
   custo por peça e a conferência das baixas automáticas de estoque.

   Esta tela é a FONTE da verdade técnica. Comandos, tuchos e composição
   ficavam escritos no código; agora moram aqui, e venda, orçamento,
   produção, estoque e custo leem daqui. */
'use strict';

App.registerView('products', async (view) => {
  App.setTitle('Produtos e custos',
    'Configurações dos cabeçotes, composição de cada montagem, custos e conferência das baixas');

  const fin = App.can('finance_sensitive');
  const podeEditar = App.can('products') || fin;
  const ui = App.telaEstado('products', { aba: 'config', produtoId: null, comando: '', tucho: '' });

  const dados = await App.get('/products/configuracoes');
  const produtos = dados.produtos;
  if (!ui.produtoId || !produtos.some(p => p.id === ui.produtoId)) {
    ui.produtoId = (produtos.find(p => p.ativo) || produtos[0] || {}).id || null;
    ui.comando = ''; ui.tucho = '';
  }

  const abas = [['config', 'Configurações'], ['comp', 'Composição'], ['comandos', 'Comandos']]
    .concat(fin ? [['custos', 'Custos']] : [])
    .concat(App.can(['stock', 'stock_history']) ? [['baixas', '🔎 Conferência das baixas']] : [])
    .concat([['m3d', '🧊 Modelos 3D']]);

  view.innerHTML = `
    <div class="tabs" id="pr-tabs">
      ${abas.map(([k, l]) => `<button data-t="${k}"${k === ui.aba ? ' class="active"' : ''}>${l}</button>`).join('')}
    </div>
    <div id="pr-body"></div>`;

  const body = document.getElementById('pr-body');
  document.getElementById('pr-tabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('#pr-tabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    ui.aba = b.dataset.t;
    render();
  });

  const naoConferidos = produtos.filter(p => p.ativo && !p.composicaoConfirmada);
  const avisoConferir = naoConferidos.length ? `
    <div class="card" style="border-left:3px solid var(--warn)">
      <b>⚠ ${naoConferidos.length} configuração(ões) com composição ainda não conferida.</b>
      <p class="small" style="margin-top:6px">Até esta versão o sistema baixava <b>1 unidade de cada peça</b> por
      cabeçote, fosse qual fosse a montagem. A composição foi preenchida com uma <b>sugestão</b>
      (8 tuchos, 4 válvulas de admissão, 4 de escape, 8 pratos, 16 travas, 1 jogo de molas, 1 casco, 1 comando)
      e está marcada como não conferida. Abra a aba <b>Composição</b>, ajuste as quantidades reais da oficina e
      clique em <b>Confirmar composição</b>. Enquanto não confirmar, nada deixa de funcionar — é só o aviso que fica.</p>
    </div>` : '';

  function render() { (telas[ui.aba] || telas.config)(); }

  /* ================= CONFIGURAÇÕES ================= */
  function renderConfig() {
    const linha = (p) => {
      const problemas = [];
      if (!p.composicaoLinhas) problemas.push('sem composição');
      if (p.semVinculo) problemas.push(`${p.semVinculo} peça(s) sem item de estoque`);
      if (!p.composicaoConfirmada) problemas.push('composição não conferida');
      return problemas;
    };
    const cols = [
      { h: 'Configuração', cell: p => `<b>${App.esc(p.nome)}</b>${App.seloInativo(p)}
        ${p.composicaoObs ? `<div class="small muted">${App.esc(p.composicaoObs)}</div>` : ''}` },
      { h: 'Linha', cell: p => p.tipo === 'crossflow' ? 'Fluxo Cruzado' : 'Unilateral' },
      { h: 'Stage', cell: p => `<span class="badge accent">${App.esc(App.rotuloStage(p))}</span>` },
      { h: 'Comandos', cell: p => p.comandos.length
        ? p.comandos.map(c => `<span class="badge">${App.esc(c)}</span>`).join(' ')
        : '<span class="badge danger">nenhum</span>' },
      { h: 'Tucho', cell: p => p.tuchos.map(t => `${t} mm`).join(' ou ') },
      { h: 'Peças', class: 'num', cell: p => p.composicaoLinhas || '—' },
      ...(fin ? [
        { h: 'Preço de venda', class: 'num', cell: p => App.moneyHtml(p.preco) },
        { h: 'Custo-base', class: 'num', cell: p => `${App.moneyHtml(p.custoBase || 0)}${
          p.custoBaseAuto ? '<div class="small muted">pela composição</div>' : ''}` },
        { h: 'Custo da composição', class: 'num', cell: p => App.moneyHtml(p.custoComposicao || 0) },
        { h: 'Margem', class: 'num', cell: p => {
          if (!p.preco) return '—';
          const m = (p.preco - (p.custoBase || 0)) / p.preco * 100;
          return `<span class="${m >= 0 ? 'pos' : 'neg'}">${m.toFixed(1)}%</span>`;
        } }
      ] : []),
      { h: 'Situação', cell: p => {
        const probs = linha(p);
        return probs.length
          ? `<span class="small" style="color:var(--warn)">${probs.map(App.esc).join('<br>')}</span>`
          : '<span class="badge ok">pronta</span>';
      } },
      { h: '', class: 'num', cell: p => `
        <button class="btn sm ghost" onclick="Prod.verComposicao(${p.id})" title="Ver e editar a composição">🔧</button>
        ${podeEditar ? `<button class="btn sm" onclick="Prod.editConfig(${p.id})">✏️</button>` : ''}
        ${podeEditar ? (p.ativo === false
          ? `<button class="btn sm ghost" onclick="Prod.reativar(${p.id})" title="Reativar">↩️</button>`
          : `<button class="btn sm ghost" onclick="Prod.inativar(${p.id})" title="Desativar — não aparece em novas vendas">🚫</button>`) : ''}` }
    ];
    const ativos = produtos.filter(p => p.ativo !== false);
    const inativos = produtos.filter(p => p.ativo === false);

    body.innerHTML = `
      ${avisoConferir}
      <div class="toolbar">
        ${podeEditar ? '<button class="btn primary" onclick="Prod.editConfig()">+ Nova configuração</button>' : ''}
        <div class="spacer"></div>
        <span class="small muted">${ativos.length} configuração(ões) em uso</span>
      </div>
      ${App.table(ativos.filter(p => p.tipo === 'unilateral'), cols, { emptyMsg: 'Nenhuma configuração unilateral' })}
      <div class="section-title">FLUXO CRUZADO</div>
      ${App.table(ativos.filter(p => p.tipo === 'crossflow'), cols, { emptyMsg: 'Nenhuma configuração de fluxo cruzado' })}
      ${inativos.length ? `<div class="section-title">DESATIVADAS <span class="small muted">— fora das novas vendas; o histórico continua intacto</span></div>
        ${App.table(inativos, cols)}` : ''}
      <div class="card">
        <h3>O QUE MUDA QUANDO VOCÊ EDITA AQUI</h3>
        <p class="small muted">Comando novo, nomenclatura, tucho e composição passam a valer para os
        <b>próximos</b> orçamentos, vendas, ordens de produção, custos e baixas de estoque.
        Pedido, orçamento e ordem já existentes guardam a configuração com que nasceram e
        <b>não são alterados</b> — inclusive se um comando sair da lista de escolha.</p>
      </div>`;
    body.insertAdjacentHTML('afterbegin', '<div class="section-title" style="margin-top:0">UNILATERAL (LATERAL)</div>');
  }

  /* ================= COMPOSIÇÃO ================= */
  async function renderComposicao() {
    body.innerHTML = '<div class="card"><div class="empty">Carregando a composição…</div></div>';
    const q = [];
    if (ui.comando) q.push('comando=' + encodeURIComponent(ui.comando));
    if (ui.tucho) q.push('tucho=' + encodeURIComponent(ui.tucho));
    let d;
    try { d = await App.get(`/products/${ui.produtoId}/composicao${q.length ? '?' + q.join('&') : ''}`); }
    catch (e) { body.innerHTML = `<div class="card"><div class="empty">${App.esc(e.message)}</div></div>`; return; }
    window.Prod.comp = d;
    const p = d.produto;
    const papelNome = { fixo: 'Peça fixa', comando: 'O comando escolhido', tucho: 'O tucho escolhido' };

    const cols = [
      { h: 'Peça', cell: l => `<b>${App.esc(l.nome)}</b>
        ${l.papel !== 'fixo' ? `<div class="small muted">definida pela configuração da venda</div>` : ''}
        ${l.obs ? `<div class="small muted">${App.esc(l.obs)}</div>` : ''}` },
      { h: 'Como entra', cell: l => App.esc(papelNome[l.papel] || l.papel) },
      { h: 'Qtd por cabeçote', class: 'num', cell: l => `<b>${l.qtd}</b>` },
      { h: 'Em estoque', class: 'num', cell: l => l.emEstoque == null ? '—'
        : `<span class="${l.emEstoque < l.qtd ? 'neg' : ''}">${l.emEstoque}</span>` },
      ...(fin ? [
        { h: 'Custo unitário', class: 'num', cell: l => App.moneyHtml(l.custoUnit || 0) },
        { h: 'Custo na peça', class: 'num', cell: l => App.moneyHtml(l.custoTotal || 0) }
      ] : []),
      { h: 'Vínculo', cell: l => l.vinculado
        ? '<span class="badge ok">ligada ao estoque</span>'
        : `<span class="badge danger">sem vínculo</span><div class="small muted">${App.esc(l.motivo || '')}</div>` }
    ];

    body.innerHTML = `
      <div class="card">
        <div class="formgrid">
          <label class="field full"><span>Configuração</span>
            <select id="pc-prod">${produtos.map(x =>
              `<option value="${x.id}" ${x.id === ui.produtoId ? 'selected' : ''}>${App.esc(x.nome)}${x.ativo === false ? ' (desativada)' : ''}</option>`).join('')}</select></label>
          <label class="field"><span>Ver com o comando</span>
            <select id="pc-comando">${(p.comandos || []).map(c =>
              `<option value="${c}" ${c === d.comando ? 'selected' : ''}>${App.esc(c)}</option>`).join('')}</select></label>
          <label class="field"><span>Ver com o tucho</span>
            <select id="pc-tucho">${(p.tuchos || []).map(t =>
              `<option value="${t}" ${String(t) === String(d.tucho) ? 'selected' : ''}>${t} mm</option>`).join('')}</select></label>
        </div>
        <p class="small muted">A composição é a mesma para todos os comandos da configuração: as linhas
        <b>“o comando escolhido”</b> e <b>“o tucho escolhido”</b> viram, na hora da baixa, exatamente a peça
        que foi vendida. Trocar o comando aqui só muda o que esta tela mostra.</p>
        ${d.confirmada
          ? '<p class="small pos">✓ Composição conferida pela oficina.</p>'
          : '<p class="small" style="color:var(--warn)">⚠ Composição ainda não conferida — veio da sugestão inicial do sistema.</p>'}
      </div>

      ${App.table(d.linhas, cols, { emptyMsg: 'Esta configuração ainda não tem composição cadastrada' })}

      ${fin ? `
      <div class="card">
        <div class="grid cols-3">
          <div class="card kpi"><div class="label">Custo total da composição</div>
            <div class="value">R$ ${App.money(d.custoTotal || 0)}</div>
            <div class="hint">soma de quantidade × custo unitário</div></div>
          <div class="card kpi ${d.semCusto ? 'k-warn' : 'k-ok'}"><div class="label">Peças sem custo cadastrado</div>
            <div class="value">${d.semCusto}</div>
            <div class="hint">custo unitário zerado no estoque</div></div>
          <div class="card kpi ${d.semVinculo ? 'k-danger' : 'k-ok'}"><div class="label">Peças sem vínculo</div>
            <div class="value">${d.semVinculo}</div>
            <div class="hint">não baixam do estoque</div></div>
        </div>
        <p class="small muted" style="margin-top:10px">Mudar o custo de uma peça no Estoque próprio muda
        este total e o custo das <b>próximas</b> vendas. Venda já registrada guarda o custo com que foi
        fechada — a DRE dos meses anteriores não se mexe.</p>
      </div>` : ''}

      ${podeEditar ? `
      <div class="toolbar">
        <button class="btn primary" onclick="Prod.editarComposicao()">✏️ Editar a composição</button>
        ${d.confirmada ? '' : '<button class="btn" onclick="Prod.confirmarComposicao()">✓ Confirmar composição</button>'}
        <div class="spacer"></div>
        <span class="small muted">${d.linhas.length} peça(s) nesta montagem</span>
      </div>` : ''}`;

    document.getElementById('pc-prod').addEventListener('change', e => {
      ui.produtoId = Number(e.target.value); ui.comando = ''; ui.tucho = ''; render();
    });
    const sc = document.getElementById('pc-comando');
    if (sc) sc.addEventListener('change', e => { ui.comando = e.target.value; render(); });
    const st = document.getElementById('pc-tucho');
    if (st) st.addEventListener('change', e => { ui.tucho = e.target.value; render(); });
  }

  /* ================= COMANDOS ================= */
  function renderComandos() {
    /* Um comando não é um cadastro solto: ele vale para as configurações em
       que foi liberado. Esta tela mostra exatamente isso, e deixa acrescentar
       um comando a várias configurações de uma vez. */
    const mapa = {};
    for (const p of produtos) {
      for (const c of p.comandos) {
        (mapa[c] = mapa[c] || []).push(p);
      }
    }
    const linhas = Object.keys(mapa).sort().map(c => ({ comando: c, usos: mapa[c] }));
    body.innerHTML = `
      <div class="toolbar">
        ${podeEditar ? '<button class="btn primary" onclick="Prod.novoComando()">+ Adicionar comando a configurações</button>' : ''}
        <div class="spacer"></div>
        <span class="small muted">${linhas.length} comando(s) em uso</span>
      </div>
      ${App.table(linhas, [
        { h: 'Comando', cell: l => `<b>${App.esc(l.comando)}</b>` },
        { h: 'Liberado nas configurações', cell: l => l.usos.map(p =>
          `<span class="badge ${p.ativo === false ? '' : 'accent'}">${App.esc(p.nome)}</span>`).join(' ') },
        { h: 'Item de estoque', cell: l => `<span class="small muted">Comando ${App.esc(l.comando)}</span>` }
      ], { emptyMsg: 'Nenhum comando cadastrado' })}
      <div class="card">
        <h3>COMO O COMANDO CHEGA AO ESTOQUE</h3>
        <p class="small muted">Na venda, o comando escolhido é o que a produção baixa do
        <b>Estoque próprio</b> — o sistema procura o item cujo nome contém o comando
        (ex.: comando <b>290x300</b> → item <b>“Comando 290x300”</b>). Se o item não existir, a peça
        aparece como <b>sem vínculo</b> na composição e na conferência das baixas; basta cadastrá-lo
        em Estoque próprio com esse nome.</p>
      </div>`;
  }

  /* ================= CUSTOS ================= */
  async function renderCustos() {
    body.innerHTML = '<div class="card"><div class="empty">Somando os custos de cada composição…</div></div>';
    const detalhes = await Promise.all(produtos.map(p =>
      App.get(`/products/${p.id}/composicao`).then(d => ({ p, d })).catch(() => ({ p, d: null }))));
    const linhasPeca = (d) => (d ? d.linhas : []).map(l =>
      `<tr><td>${App.esc(l.nome)}</td><td class="num">${l.qtd}</td>
       <td class="num">R$ ${App.money(l.custoUnit || 0)}</td>
       <td class="num"><b>R$ ${App.money(l.custoTotal || 0)}</b></td></tr>`).join('');
    body.innerHTML = detalhes.map(({ p, d }) => `
      <div class="card">
        <div class="section-title" style="margin-top:0">${App.esc(p.nome)}</div>
        <div class="tablewrap"><table>
          <tr><th>Peça da composição</th><th class="num">Qtd</th><th class="num">Custo unitário</th><th class="num">Custo</th></tr>
          ${linhasPeca(d)}
          <tr><td colspan="3"><b>Custo total estimado do produto</b></td>
              <td class="num"><b>R$ ${App.money(d ? d.custoTotal || 0 : 0)}</b></td></tr>
        </table></div>
        <div class="formgrid" style="margin-top:10px">
          <div class="card kpi"><div class="label">Custo-base usado nas vendas</div>
            <div class="value">R$ ${App.money(p.custoBase || 0)}</div>
            <div class="hint">${p.custoBaseAuto ? 'calculado pela composição' : 'informado à mão'}</div></div>
          <div class="card kpi"><div class="label">Preço de venda</div>
            <div class="value">R$ ${App.money(p.preco || 0)}</div></div>
          <div class="card kpi"><div class="label">Diferença composição × custo-base</div>
            <div class="value">R$ ${App.money((d ? d.custoTotal || 0 : 0) - (p.custoBase || 0))}</div>
            <div class="hint">usinagem, mão de obra e embalagem entram no custo-base</div></div>
        </div>
        ${podeEditar ? `<div class="toolbar" style="border:none;margin-top:8px">
          <button class="btn sm" onclick="Prod.usarCustoDaComposicao(${p.id}, ${d ? d.custoTotal || 0 : 0})">
            Usar R$ ${App.money(d ? d.custoTotal || 0 : 0)} como custo-base</button>
          <button class="btn sm ghost" onclick="Prod.editConfig(${p.id})">✏️ Editar preço e custo</button>
        </div>` : ''}
      </div>`).join('') + `
      <div class="card">
        <h3>HISTÓRICO DE CUSTOS</h3>
        <p class="small muted">Cada venda guarda o custo com que foi fechada. Alterar o custo de uma peça
        aqui muda o custo das <b>próximas</b> vendas e composições — nenhuma venda antiga é recalculada,
        e o resultado dos meses já fechados na DRE continua o mesmo.</p>
      </div>`;
  }

  /* ================= CONFERÊNCIA DAS BAIXAS ================= */
  async function renderBaixas() {
    body.innerHTML = '<div class="card"><div class="empty">Conferindo as baixas de estoque…</div></div>';
    let a;
    try { a = await App.get('/auditoria/baixas-estoque'); }
    catch (e) { body.innerHTML = `<div class="card"><div class="empty">${App.esc(e.message)}</div></div>`; return; }
    window.Prod.aud = a;
    const t = a.totais;
    const sit = {
      pendente: ['Baixa pendente', 'danger'], parcial: ['Baixa parcial', 'warn'],
      duplicado: ['Baixa em dobro', 'danger'], sem_vinculo: ['Item não vinculado ao estoque', 'warn'],
      fora_da_composicao: ['Fora da composição — necessita revisão', 'info']
    };
    const selo = (s) => {
      const [l, c] = sit[s] || [s, ''];
      return `<span class="badge ${c}">${App.esc(l)}</span>`;
    };
    const tabelaCasos = (lista, classe, marcado) => `
      <div class="tablewrap"><table>
        <tr><th><input type="checkbox" class="${classe}-todos"${marcado ? ' checked' : ''}></th>
            <th>Pedido</th><th>Cabeçote</th><th>Peça</th><th>Situação</th>
            <th class="num">Deveria sair</th><th class="num">Saiu</th><th class="num">Diferença</th></tr>
        ${lista.flatMap(c => c.componentes.map(x => `
          <tr>
            <td>${x.corrigivel
              ? `<input type="checkbox" class="${classe}" data-ordem="${c.ordemId}" data-item="${x.stockItemId}"${marcado ? ' checked' : ''}>`
              : '<span class="muted small" title="Precisa de decisão humana">—</span>'}</td>
            <td>nº ${c.pedido}<div class="small muted">${App.esc(c.cliente)}</div></td>
            <td>${App.esc(c.produto)}<div class="small muted">${App.esc(App.rotuloStage(c))} · ${App.esc(c.comando || '')} · ${App.esc(String(c.tucho || ''))} mm</div></td>
            <td>${App.esc(x.nome)}${x.motivo ? `<div class="small muted">${App.esc(x.motivo)}</div>` : ''}</td>
            <td>${selo(x.situacao)}</td>
            <td class="num">${x.esperado}</td>
            <td class="num">${x.movido}</td>
            <td class="num"><b class="${x.diferenca > 0 ? 'neg' : 'pos'}">${x.diferenca > 0 ? '+' : ''}${x.diferenca}</b></td>
          </tr>`)).join('')}
      </table></div>`;

    body.innerHTML = `
      <div class="card">
        <h3>CONFERÊNCIA DAS BAIXAS AUTOMÁTICAS DE ESTOQUE</h3>
        <p class="small muted">O cabeçote vendido consome componentes <b>quando a ordem de produção fica
        pronta</b> — não no instante da venda. Até esta versão a baixa era de <b>1 unidade de cada peça</b>,
        qualquer que fosse a montagem; agora segue a <b>composição cadastrada</b>. Esta tela compara, pedido
        por pedido e peça por peça, o que deveria ter saído do estoque com o que saiu de verdade.
        <b>Nada é alterado até você marcar e confirmar.</b></p>
        <div class="grid cols-4" style="margin-top:12px">
          <div class="card kpi"><div class="label">Ordens analisadas</div><div class="value">${a.ordensAnalisadas}</div>
            <div class="hint">${a.ordensBaixadas} já baixaram componentes</div></div>
          <div class="card kpi"><div class="label">Componentes conferidos</div><div class="value">${a.componentesAnalisados}</div></div>
          <div class="card kpi ${t.casos ? 'k-danger' : 'k-ok'}"><div class="label">Ordens com diferença</div>
            <div class="value">${t.casos}</div><div class="hint">baixa desta versão</div></div>
          <div class="card kpi ${t.legado ? 'k-warn' : 'k-ok'}"><div class="label">Baixas antigas a revisar</div>
            <div class="value">${t.legado}</div><div class="hint">feitas pela regra antiga</div></div>
        </div>
        ${Object.keys(t.porSituacao || {}).length ? `<p class="small" style="margin-top:10px">
          ${Object.entries(t.porSituacao).map(([s, n]) => `${selo(s)} <b>${n}</b>`).join(' · ')}</p>` : ''}
      </div>

      ${!t.casos && !t.legado ? `<div class="card"><div class="empty">✓ Todas as baixas conferem com a composição cadastrada.</div></div>` : ''}

      ${t.casos ? `
      <div class="card">
        <div class="section-title" style="margin-top:0">1. DIFERENÇAS NA REGRA ATUAL — PODEM SER CORRIGIDAS</div>
        <p class="small">Aqui a ordem foi concluída com esta versão e ainda assim a baixa não fechou:
        normalmente peça sem item de estoque vinculado na hora, ou ajuste manual depois.</p>
        ${tabelaCasos(a.casos, 'bx-atual', true)}
        <div class="toolbar" style="border:none;margin-top:10px">
          <span class="small muted" id="bx-resumo"></span>
          <div class="spacer"></div>
          ${App.can('stock_history_edit')
            ? '<button class="btn primary" onclick="Prod.corrigirBaixas(\'bx-atual\')">✓ Corrigir o que está marcado</button>'
            : '<span class="small muted">Corrigir o histórico de estoque é função da Direção</span>'}
        </div>
      </div>` : ''}

      ${t.legado ? `
      <div class="card">
        <div class="section-title" style="margin-top:0;color:var(--warn)">2. BAIXAS FEITAS PELA REGRA ANTIGA — CONFIRA UMA POR UMA</div>
        <p class="small">Estas ordens foram concluídas <b>antes</b> desta versão: saiu 1 de cada peça.
        A diferença abaixo é o que <i>faltaria</i> pela composição de hoje — mas parte disso pode já ter
        sido movimentada <b>à mão</b> no estoque. Por isso nada vem marcado: confira pedido por pedido e
        marque só o que realmente precisa de baixa.</p>
        ${tabelaCasos(a.legado, 'bx-legado', false)}
        <div class="toolbar" style="border:none;margin-top:10px">
          <span class="small muted" id="bx-resumo-legado"></span>
          <div class="spacer"></div>
          ${App.can('stock_history_edit')
            ? '<button class="btn" onclick="Prod.corrigirBaixas(\'bx-legado\')">✓ Corrigir só o que marquei</button>'
            : ''}
        </div>
      </div>` : ''}

      ${a.aguardando.length ? `
      <div class="card">
        <div class="section-title muted" style="margin-top:0">AINDA NÃO É HORA — PRODUÇÃO EM ANDAMENTO</div>
        <p class="small muted">Estas ordens ainda não ficaram prontas, então <b>não devem</b> ter baixado nada.
        Aparecem aqui só para você saber o que está a caminho.</p>
        ${App.table(a.aguardando, [
          { h: 'Pedido', cell: c => `nº ${c.pedido}` },
          { h: 'Cliente', cell: c => App.esc(c.cliente) },
          { h: 'Cabeçote', cell: c => `${App.esc(c.produto)} · ${App.esc(c.comando || '')} · ${App.esc(String(c.tucho || ''))} mm` },
          { h: 'Etapa', cell: c => App.badge(c.status) },
          { h: 'Peças previstas', class: 'num', cell: c => c.componentes }
        ])}
      </div>` : ''}

      ${a.semOrdem.length ? `
      <div class="card">
        <div class="section-title" style="margin-top:0;color:var(--danger)">VENDAS DE CABEÇOTE SEM ORDEM DE PRODUÇÃO</div>
        <p class="small">Sem ordem de produção não existe baixa de componente. Verifique estes pedidos —
        em Administração há a reconciliação que cria as ordens que ficaram para trás.</p>
        ${App.table(a.semOrdem, [
          { h: 'Pedido', cell: c => `<b>nº ${c.pedido}</b>` },
          { h: 'Cliente', cell: c => App.esc(c.cliente) }
        ])}
      </div>` : ''}

      ${a.produtosNaoConferidos.length ? `
      <div class="card">
        <div class="section-title muted" style="margin-top:0">COMPOSIÇÕES AINDA NÃO CONFERIDAS</div>
        <p class="small muted">A conferência compara com a composição cadastrada. Enquanto estas não forem
        confirmadas pela oficina, o resultado acima é só uma indicação.</p>
        ${App.table(a.produtosNaoConferidos, [
          { h: 'Configuração', cell: p => `<b>${App.esc(p.nome)}</b>` },
          { h: 'Peças', class: 'num', cell: p => p.linhas },
          { h: '', class: 'num', cell: p => `<button class="btn sm" onclick="Prod.verComposicao(${p.id})">Abrir composição</button>` }
        ])}
      </div>` : ''}`;

    const ligaResumo = (classe, idResumo) => {
      const todos = body.querySelector('.' + classe + '-todos');
      const itens = () => [...body.querySelectorAll('.' + classe)];
      const atualiza = () => {
        const el = document.getElementById(idResumo);
        if (!el) return;
        const n = itens().filter(c => c.checked).length;
        el.innerHTML = `Marcados: <b>${n}</b> ajuste(s) de estoque`;
      };
      if (todos) todos.addEventListener('change', () => {
        itens().forEach(c => { c.checked = todos.checked; }); atualiza();
      });
      itens().forEach(c => c.addEventListener('change', atualiza));
      atualiza();
    };
    ligaResumo('bx-atual', 'bx-resumo');
    ligaResumo('bx-legado', 'bx-resumo-legado');
  }

  /* ================= MODELOS 3D ================= */
  async function renderModelos() {
    const models = await App.get('/models3d');
    const lista = () => App.table(models, [
      { h: 'Modelo', cell: m => `<b>${App.esc(m.nome)}</b>` },
      { h: 'Tamanho', class: 'num', cell: m => (m.size / 1048576).toFixed(1) + ' MB' },
      { h: 'Configuração vinculada', cell: m => `
        <select onchange="Prod.linkModel(${m.id}, this.value)" style="width:auto;max-width:260px">
          <option value="">— nenhuma —</option>
          ${produtos.map(p => `<option value="${p.id}" ${m.produtoId === p.id ? 'selected' : ''}>${App.esc(p.nome)}${p.ativo === false ? ' (desativada)' : ''}</option>`).join('')}
        </select>` },
      { h: '', class: 'num', cell: m => `
        <button class="btn sm primary" onclick="Prod.view3d(${m.id})">🧊 Ver em 3D</button>
        <button class="btn sm ghost" onclick="Prod.delModel(${m.id})" title="Excluir">🗑</button>` }
    ], { emptyMsg: 'Nenhum modelo 3D enviado ainda' });

    body.innerHTML = `
      <div class="card">
        <h3>🧊 MODELOS 3D DOS CABEÇOTES</h3>
        <p class="small muted" style="margin-bottom:10px">Envie o escaneamento ou o CAD exportado como
        <b>STL</b>, <b>OBJ</b> ou <b>PLY</b> (no SolidWorks: <i>Salvar como → STL</i>, qualidade Fina).
        Depois é só clicar em <b>Ver em 3D</b> — gira com o mouse ou com o dedo no celular, ótimo para
        mostrar ao cliente. Limite: 200 MB por arquivo.</p>
        <div class="toolbar">
          <label class="btn primary" style="cursor:pointer">⬆ Enviar modelo 3D
            <input type="file" id="m3d-file" accept=".stl,.obj,.ply" hidden></label>
          <span id="m3d-progress" class="small muted"></span>
        </div>
        <div id="m3d-list">${lista()}</div>
      </div>`;

    window.Prod.models = models;
    window.Prod.renderModelos = () => { document.getElementById('m3d-list').innerHTML = lista(); };

    document.getElementById('m3d-file').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const mb = f.size / 1048576;
      if (mb > 200) {
        e.target.value = '';
        App.modal(`
          <h2>Arquivo grande demais (${mb.toFixed(0)} MB)</h2>
          <p>O limite é <b>200 MB</b> — e para visualização nem precisa de tanto.</p>
          <p style="margin-top:8px">Exporte de novo com resolução mais leve:</p>
          <ul style="margin:8px 0 0 20px;line-height:1.7">
            <li><b>Onshape:</b> Export → Resolution = <b>Medium</b></li>
            <li><b>SolidWorks:</b> Salvar como STL → Opções → qualidade <b>Grossa</b> ou personalizada</li>
          </ul>
          <p class="small muted" style="margin-top:10px">A diferença visual é imperceptível — e o modelo ainda abre mais rápido.</p>
          <div class="actions"><button class="btn primary" onclick="App.closeModal()">Entendi</button></div>`);
        return;
      }
      if (mb > 80) App.toast(`Arquivo de ${mb.toFixed(0)} MB — o envio e a abertura do 3D podem demorar um pouco`, 'ok');
      const prog = document.getElementById('m3d-progress');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/models3d/upload?nome=' + encodeURIComponent(f.name));
      xhr.setRequestHeader('Authorization', 'Bearer ' + App.token());
      xhr.upload.onprogress = ev => {
        if (ev.lengthComputable) prog.textContent = `Enviando… ${Math.round(ev.loaded / ev.total * 100)}%`;
      };
      xhr.onload = () => {
        e.target.value = '';
        prog.textContent = '';
        if (xhr.status === 200) {
          models.push(JSON.parse(xhr.responseText));
          window.Prod.renderModelos();
          App.toast('Modelo 3D enviado — clique em “Ver em 3D”', 'ok');
        } else {
          let msg = 'Falha no envio';
          try { msg = JSON.parse(xhr.responseText).error || msg; } catch (err) {}
          App.toast(msg, 'err');
        }
      };
      xhr.onerror = () => {
        prog.textContent = '';
        App.toast('O envio caiu no meio do caminho. Confira se o sistema está aberto (ABRIR O SISTEMA.bat) e tente de novo; se o arquivo for muito grande, exporte com resolução Média.', 'err');
      };
      prog.textContent = `Enviando… 0% (${mb.toFixed(1)} MB)`;
      xhr.send(f);
    });
  }

  const telas = { config: renderConfig, comp: renderComposicao, comandos: renderComandos,
    custos: renderCustos, baixas: renderBaixas, m3d: renderModelos };

  /* ================= AÇÕES ================= */
  window.Prod = {
    comp: null, aud: null,

    verComposicao(id) {
      ui.aba = 'comp'; ui.produtoId = id; ui.comando = ''; ui.tucho = '';
      document.querySelectorAll('#pr-tabs button').forEach(x =>
        x.classList.toggle('active', x.dataset.t === 'comp'));
      render();
    },

    editConfig(id) {
      const p = id ? produtos.find(x => x.id === id) : null;
      App.form(p ? 'Editar ' + p.nome : 'Nova configuração de cabeçote', [
        { name: 'tipo', label: 'Linha', type: 'select', value: p ? p.tipo : 'unilateral',
          options: [{ value: 'unilateral', label: 'Unilateral (lateral)' }, { value: 'crossflow', label: 'Fluxo Cruzado' }] },
        { name: 'stage', label: 'Stage', type: 'number', value: p ? p.stage : 1, required: true },
        { name: 'variante', label: 'Variante', type: 'select', value: p ? p.variante || '' : '',
          options: [{ value: '', label: 'normal' }, { value: 'plus', label: 'Plus (ex.: Stage 3 Plus)' }] },
        { name: 'nome', label: 'Nome que aparece nas telas', value: p ? p.nome : '', full: true,
          placeholder: 'em branco = montado do tipo + stage' },
        { name: 'comandos', label: 'Comandos aceitos (separados por vírgula)', full: true, required: true,
          value: p ? p.comandos.join(', ') : '' },
        { name: 'tuchos', label: 'Tuchos aceitos em mm (separados por vírgula)', required: true,
          value: p ? p.tuchos.join(', ') : '35' },
        ...(fin ? [
          { name: 'preco', label: 'Preço de venda (R$)', type: 'number', step: '0.01', value: p ? p.preco : 0 },
          { name: 'custoBase', label: 'Custo-base gerencial (R$)', type: 'number', step: '0.01', value: p ? p.custoBase || 0 : 0 },
          { name: 'custoBaseAuto', label: 'Calcular o custo-base pela composição', type: 'checkbox',
            value: p ? !!p.custoBaseAuto : false, full: true }
        ] : []),
        { name: 'composicaoObs', label: 'Observações técnicas', type: 'textarea', full: true,
          value: p ? p.composicaoObs || '' : '' }
      ], async d => {
        const corpo = Object.assign({}, d, {
          comandos: String(d.comandos || '').split(',').map(x => x.trim()).filter(Boolean),
          tuchos: String(d.tuchos || '').split(',').map(x => x.replace(/\s*mm\s*/i, '').trim()).filter(Boolean)
        });
        const r = p
          ? await App.put(`/products/${p.id}/configuracao`, corpo)
          : await App.post('/products/configuracao', corpo);
        App.closeModal();
        App.toast(p ? 'Configuração atualizada' : 'Configuração criada', 'ok');
        if (r && r.avisoHistorico) App.toast(r.avisoHistorico, 'ok');
        App.route();
      }, { submitLabel: p ? 'Salvar' : 'Criar configuração' });
    },

    novoComando() {
      /* Acrescentar, nunca substituir: o comando entra nas configurações
         marcadas e os que já existem continuam onde estão. */
      App.modal(`
        <h2>Adicionar comando a configurações</h2>
        <p class="small muted">O comando é <b>acrescentado</b> às configurações marcadas. Nenhum comando
        já cadastrado é removido ou trocado.</p>
        <label class="field"><span>Comando (ex.: 280x280)</span><input id="nc-nome" placeholder="280x280"></label>
        <div style="margin-top:10px">
          ${produtos.filter(p => p.ativo !== false).map(p => `
            <label style="display:block;margin:4px 0"><input type="checkbox" class="nc-p" value="${p.id}">
              ${App.esc(p.nome)} <span class="small muted">(${p.comandos.join(', ') || 'sem comandos'})</span></label>`).join('')}
        </div>
        <label style="display:block;margin-top:10px"><input type="checkbox" id="nc-estoque" checked>
          Cadastrar também o item <b>“Comando …”</b> no Estoque próprio, se ainda não existir</label>
        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Cancelar</button>
          <button class="btn primary" id="nc-ok">Adicionar</button>
        </div>`);
      document.getElementById('nc-ok').onclick = async () => {
        const nome = document.getElementById('nc-nome').value.trim();
        if (!nome) return App.toast('Informe o comando', 'err');
        const ids = [...document.querySelectorAll('.nc-p')].filter(c => c.checked).map(c => Number(c.value));
        if (!ids.length) return App.toast('Marque ao menos uma configuração', 'err');
        try {
          for (const id of ids) {
            const p = produtos.find(x => x.id === id);
            if (p.comandos.includes(nome)) continue;
            await App.put(`/products/${id}/configuracao`, { comandos: p.comandos.concat([nome]) });
          }
          if (document.getElementById('nc-estoque').checked) {
            const itens = await App.get('/stockItems');
            const existe = itens.some(i => String(i.nome || '').toLowerCase().includes(nome.toLowerCase())
              && i.categoria === 'comando');
            if (!existe) await App.post('/stockItems', { nome: 'Comando ' + nome, categoria: 'comando', qtd: 0, custoUnit: 0, minimo: 0 });
          }
          App.closeModal();
          App.toast(`Comando ${nome} adicionado a ${ids.length} configuração(ões)`, 'ok');
          App.route();
        } catch (e) { App.toast(e.message, 'err'); }
      };
    },

    editarComposicao() {
      const d = this.comp;
      if (!d) return;
      const itens = d.itensDeEstoque;
      const linha = (l, i) => `
        <tr data-i="${i}">
          <td>
            <select class="cl-papel" style="width:auto">
              <option value="fixo"${l.papel === 'fixo' ? ' selected' : ''}>Peça fixa</option>
              <option value="comando"${l.papel === 'comando' ? ' selected' : ''}>O comando escolhido</option>
              <option value="tucho"${l.papel === 'tucho' ? ' selected' : ''}>O tucho escolhido</option>
            </select>
          </td>
          <td>
            <select class="cl-item" style="width:auto;max-width:240px"${l.papel !== 'fixo' ? ' disabled' : ''}>
              <option value="">— escolha a peça —</option>
              ${itens.map(it => `<option value="${it.id}"${it.id === l.stockItemId ? ' selected' : ''}>${App.esc(it.nome)}</option>`).join('')}
            </select>
          </td>
          <td class="num"><input type="number" class="cl-qtd" step="0.001" min="0.001" value="${l.qtd}" style="width:90px"></td>
          <td><input class="cl-obs" value="${App.esc(l.obs || '')}" placeholder="observação (opcional)"></td>
          <td class="num"><button class="btn sm ghost" onclick="Prod.removerLinha(${i})" title="Remover">🗑</button></td>
        </tr>`;
      App.modal(`
        <h2>Composição — ${App.esc(d.produto.nome)}</h2>
        <p class="small muted">Esta é a lista de peças que <b>um</b> cabeçote desta configuração consome.
        É ela que a produção separa e que o estoque baixa quando a ordem fica pronta. Duas linhas para a
        mesma peça não são aceitas — some as quantidades numa linha só.</p>
        <div class="tablewrap"><table id="cl-tabela">
          <tr><th>Como entra</th><th>Peça do estoque</th><th class="num">Qtd por cabeçote</th><th>Observação</th><th></th></tr>
          ${d.linhas.map(linha).join('')}
        </table></div>
        <div class="toolbar" style="border:none">
          <button class="btn sm" onclick="Prod.adicionarLinha()">+ Adicionar peça</button>
          <div class="spacer"></div>
          <label class="small"><input type="checkbox" id="cl-conf" checked> Marcar como <b>conferida pela oficina</b></label>
        </div>
        <label class="field full"><span>Observações técnicas da configuração</span>
          <textarea id="cl-obs-geral">${App.esc(d.produto.composicaoObs || '')}</textarea></label>
        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Cancelar</button>
          <button class="btn primary" id="cl-salvar">Salvar composição</button>
        </div>`, { wide: true });

      const ligaPapel = () => {
        document.querySelectorAll('#cl-tabela tr[data-i]').forEach(tr => {
          const sel = tr.querySelector('.cl-papel');
          sel.onchange = () => {
            const item = tr.querySelector('.cl-item');
            item.disabled = sel.value !== 'fixo';
            if (item.disabled) item.value = '';
          };
        });
      };
      ligaPapel();
      window.Prod.adicionarLinha = () => {
        const tab = document.getElementById('cl-tabela');
        const i = tab.querySelectorAll('tr[data-i]').length;
        tab.insertAdjacentHTML('beforeend', linha({ papel: 'fixo', stockItemId: null, qtd: 1, obs: '' }, i));
        ligaPapel();
      };
      window.Prod.removerLinha = (i) => {
        const tr = document.querySelector(`#cl-tabela tr[data-i="${i}"]`);
        if (tr) tr.remove();
      };
      document.getElementById('cl-salvar').onclick = async () => {
        const linhas = [...document.querySelectorAll('#cl-tabela tr[data-i]')].map(tr => ({
          papel: tr.querySelector('.cl-papel').value,
          stockItemId: Number(tr.querySelector('.cl-item').value) || null,
          qtd: Number(tr.querySelector('.cl-qtd').value) || 0,
          obs: tr.querySelector('.cl-obs').value
        }));
        if (!linhas.length) return App.toast('A composição não pode ficar vazia', 'err');
        try {
          await App.put(`/products/${d.produto.id}/composicao`, {
            linhas, confirmada: document.getElementById('cl-conf').checked,
            composicaoObs: document.getElementById('cl-obs-geral').value
          });
          App.closeModal();
          App.toast('Composição salva — vale para as próximas vendas e ordens', 'ok');
          App.route();
        } catch (e) { App.toast(e.message, 'err'); }
      };
    },

    async confirmarComposicao() {
      const d = this.comp;
      if (!await App.confirm(
        `Confirmar a composição de <b>${App.esc(d.produto.nome)}</b> como conferida?<br><br>` +
        `São <b>${d.linhas.length}</b> peça(s). A partir daí a conferência das baixas passa a comparar ` +
        'com esta lista, e as próximas ordens de produção separam e baixam exatamente isto.',
        { html: true })) return;
      try {
        await App.put(`/products/${d.produto.id}/composicao`, {
          linhas: d.linhas.map(l => ({ papel: l.papel, stockItemId: l.stockItemId, qtd: l.qtd, obs: l.obs })),
          confirmada: true
        });
        App.toast('Composição confirmada', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },

    async usarCustoDaComposicao(id, total) {
      const p = produtos.find(x => x.id === id);
      if (!await App.confirm(
        `Usar <b>R$ ${App.money(total)}</b> como custo-base de ${App.esc(p.nome)}?<br><br>` +
        'Vale para as <b>próximas</b> vendas. Nenhuma venda já registrada é recalculada.',
        { html: true })) return;
      try {
        await App.put(`/products/${id}/configuracao`, { custoBase: total });
        App.toast('Custo-base atualizado', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },

    async corrigirBaixas(classe) {
      const marcados = [...document.querySelectorAll('.' + classe)].filter(c => c.checked)
        .map(c => ({ ordemId: Number(c.dataset.ordem), stockItemId: Number(c.dataset.item) }));
      if (!marcados.length) return App.toast('Marque o que deve ser corrigido', 'err');
      if (!await App.confirm(
        `Corrigir <b>${marcados.length}</b> baixa(s) de estoque?<br><br>` +
        'Cada linha marcada movimenta <b>só a diferença</b> da peça naquele pedido — ' +
        'falta vira saída, baixa em dobro vira estorno. O histórico anterior continua inteiro, ' +
        'e cada ajuste fica registrado com o pedido que o originou.<br>' +
        '<span class="small">Uma cópia do banco é gravada antes.</span>',
        { html: true })) return;
      try {
        const out = await App.api('POST', '/auditoria/baixas-estoque/corrigir',
          { correcoes: marcados }, { 'X-Confirmar': 'sim' });
        App.toast(`${out.feitas.length} baixa(s) corrigida(s)` +
          (out.ignoradas.length ? `, ${out.ignoradas.length} ignorada(s)` : ''), 'ok');
        render();
      } catch (e) { App.toast(e.message, 'err'); }
    },

    view3d(modelId) {
      const m = (this.models || []).find(x => x.id === modelId);
      if (!m) return;
      if (!window.Viewer3D) return App.toast('O visualizador 3D ainda está carregando — tente de novo', 'err');
      Viewer3D.open(m);
    },
    async linkModel(modelId, produtoId) {
      await App.put('/models3d/' + modelId, { produtoId: produtoId || null });
      const m = (this.models || []).find(x => x.id === modelId);
      if (m) m.produtoId = produtoId ? Number(produtoId) : null;
      App.toast('Vínculo atualizado', 'ok');
    },
    async delModel(modelId) {
      const m = (this.models || []).find(x => x.id === modelId);
      if (!m || !await App.confirm(`Excluir o modelo 3D "${m.nome}"?`)) return;
      await App.del('/models3d/' + modelId);
      this.models.splice(this.models.indexOf(m), 1);
      this.renderModelos();
      App.toast('Modelo excluído', 'ok');
    },

    inativar(id) {
      const p = produtos.find(x => x.id === id);
      App.excluirCadastro('products', id, p && p.nome);
    },
    reativar(id) {
      const p = produtos.find(x => x.id === id);
      App.reativar('products', id, p && p.nome);
    }
  };

  render();
});
