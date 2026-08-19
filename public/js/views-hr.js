/* RH gerencial: colaboradores, salários, bônus de produção e assistência de pista.
   Tela guiada: mini-dashboard no topo, busca + filtros por vínculo,
   estados vazios com o próximo passo e eventos de pista agrupados. */
'use strict';

App.registerView('hr', async (view) => {
  App.setTitle('RH', 'Gerencial — não substitui folha/contabilidade. Acesso restrito.');
  const [employees, payments] = await Promise.all([App.get('/employees'), App.get('/hrPayments')]);
  employees.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  payments.sort((a, b) => b.id - a.id);
  const fin = App.can('finance_sensitive');
  const TIPOS = { salario: 'Salário', beneficio: 'Benefício', bonus: 'Bônus de produção', pista: 'Assistência de pista', outro: 'Outro' };
  const VINC = {
    fixo: ['Fixo / Oficina', 'info'],
    adm: ['Administrativo', ''],
    freela: ['Freelancer / Pista', 'accent']
  };
  const vincOf = e => VINC[e.vinculo] ? e.vinculo : 'fixo';

  /* ---------- mini-dashboard ---------- */
  const month = App.today().slice(0, 7);
  const ativos = employees.filter(e => e.ativo !== false);
  const custoFixo = ativos.reduce((s, e) => s + (e.salario || 0) + (e.beneficios || 0), 0);
  const extrasMes = payments.filter(p => (p.data || '').slice(0, 7) === month && p.tipo !== 'salario')
    .reduce((s, p) => s + (p.valor || 0), 0);
  const pendentes = payments.filter(p => p.status !== 'pago')
    .sort((a, b) => (a.data || '9999') < (b.data || '9999') ? -1 : 1);
  const pendentesValor = pendentes.reduce((s, p) => s + (p.valor || 0), 0);

  view.innerHTML = `
    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="card kpi"><div class="label">Colaboradores ativos</div>
        <div class="value">${ativos.length}</div>
        <div class="hint">${employees.length - ativos.length ? (employees.length - ativos.length) + ' inativo(s)' : 'equipe completa em dia'}</div></div>
      ${fin ? `
      <div class="card kpi"><div class="label">Custo fixo mensal</div>
        <div class="value money">${App.money(custoFixo)}</div>
        <div class="hint">salários + benefícios dos ativos</div></div>
      <div class="card kpi"><div class="label">Extras no mês</div>
        <div class="value money">${App.money(extrasMes)}</div>
        <div class="hint">bônus, pista e outros lançamentos</div></div>` : ''}
      <div class="card kpi ${pendentes.length ? 'k-warn' : 'k-ok'}"><div class="label">Próximos pagamentos</div>
        <div class="value">${fin ? 'R$ ' + App.money(pendentesValor) : pendentes.length}</div>
        <div class="hint">${pendentes.length
          ? pendentes.length + ' pendente(s) · próximo em ' + App.date(pendentes[0].data)
          : 'nada pendente 🎉'}</div></div>
    </div>

    <div class="toolbar">
      <button class="btn primary" onclick="HR.editEmp()">+ Colaborador</button>
      <button class="btn" onclick="HR.addPayment()">+ Lançar pagamento</button>
      <button class="btn" onclick="HR.addPista()">🏁 Assistência de pista</button>
    </div>

    <div class="section-title">EQUIPE</div>
    <div class="chipbar" id="hr-chips">
      <input id="hr-q" placeholder="🔍 Buscar por nome ou cargo…">
      <button class="chip active" data-v="">Todos</button>
      <button class="chip" data-v="fixo">🔧 Fixo/Oficina</button>
      <button class="chip" data-v="adm">🗂 Administrativo</button>
      <button class="chip" data-v="freela">🏁 Freelancer/Pista</button>
    </div>
    <div id="hr-emps"></div>

    <div class="section-title">PAGAMENTOS E LANÇAMENTOS</div>
    <div id="hr-pays"></div>

    <div class="section-title">🏁 ASSISTÊNCIA DE PISTA POR EVENTO</div>
    <div id="hr-eventos"></div>`;

  /* ---------- equipe (com busca e filtro) ---------- */
  let filtroV = '', filtroQ = '';
  const renderEmps = () => {
    const el = document.getElementById('hr-emps');
    if (!employees.length) {
      el.innerHTML = App.emptyState('👥', 'Nenhum colaborador ainda',
        'Cadastre a equipe para acompanhar salários, benefícios, bônus de produção e assistência de pista — tudo alimenta o financeiro sozinho.',
        `<button class="btn primary" onclick="HR.editEmp()">+ Adicionar o primeiro colaborador</button>`);
      return;
    }
    const q = filtroQ.toLowerCase();
    const list = employees.filter(e =>
      (!filtroV || vincOf(e) === filtroV) &&
      (!q || (e.nome || '').toLowerCase().includes(q) || (e.cargo || '').toLowerCase().includes(q)));
    if (!list.length) {
      el.innerHTML = App.emptyState('🔍', 'Ninguém encontrado com esse filtro',
        'Tente outro termo de busca ou limpe o filtro de vínculo.',
        `<button class="btn" onclick="HR.limparFiltros()">Limpar filtros</button>`);
      return;
    }
    el.innerHTML = App.table(list, [
      { h: 'Colaborador', cell: e => `<b>${App.esc(e.nome)}</b><div class="small muted">${App.esc(e.cargo || '')}</div>` },
      { h: 'Vínculo', cell: e => { const [l, c] = VINC[vincOf(e)]; return `<span class="badge ${c}">${l}</span>`; } },
      ...(fin ? [
        { h: 'Salário', class: 'num', cell: e => 'R$ ' + App.money(e.salario || 0) },
        { h: 'Benefícios', class: 'num', cell: e => 'R$ ' + App.money(e.beneficios || 0) }] : []),
      { h: 'Dia de pagamento', class: 'num', cell: e => e.diaPagamento || '—' },
      { h: 'Ativo', cell: e => e.ativo !== false ? App.badge('ok') : App.badge('cancelada') },
      { h: '', class: 'num', cell: e => `
        <button class="btn sm ghost" onclick="HR.editEmp(${e.id})" title="Editar cadastro">✏️</button>
        ${e.ativo === false
          ? `<button class="btn sm ghost" onclick="HR.reativarEmp(${e.id})" title="Reativar cadastro">↩️</button>`
          : `<button class="btn sm ghost" onclick="HR.excluirEmp(${e.id})" title="Excluir cadastro">🗑️</button>`}` }
    ]);
  };

  document.getElementById('hr-q').addEventListener('input', e => { filtroQ = e.target.value; renderEmps(); });
  document.getElementById('hr-chips').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filtroV = b.dataset.v;
    document.querySelectorAll('#hr-chips .chip').forEach(x => x.classList.toggle('active', x === b));
    renderEmps();
  });

  /* ---------- pagamentos ---------- */
  const renderPays = () => {
    const el = document.getElementById('hr-pays');
    if (!payments.length) {
      el.innerHTML = App.emptyState('💰', 'Nenhum lançamento ainda',
        'Salários, benefícios e bônus lançados aqui entram automaticamente nas contas da empresa quando pagos.',
        `<button class="btn primary" onclick="HR.addPayment()">+ Criar o primeiro lançamento</button>
         ${employees.length ? '' : '<span class="small muted" style="align-self:center">— cadastre um colaborador antes</span>'}`);
      return;
    }
    el.innerHTML = App.table(payments.slice(0, 40), [
      { h: 'Colaborador', cell: p => { const e = employees.find(x => x.id === p.employeeId); return e ? App.esc(e.nome) : '—'; } },
      { h: 'Tipo', cell: p => `<span class="badge ${p.tipo === 'pista' ? 'accent' : p.tipo === 'bonus' ? 'info' : ''}">${TIPOS[p.tipo] || p.tipo}</span>` },
      { h: 'Descrição', cell: p => `${App.esc(p.descricao || '—')}${p.evento ? `<div class="small muted">${App.esc(p.evento)}${p.dias ? ' · ' + p.dias + ' dia(s)' : ''}</div>` : ''}` },
      { h: 'Data', cell: p => App.date(p.data) },
      ...(fin ? [{ h: 'Valor', class: 'num', cell: p => App.moneyHtml(p.valor) }] : []),
      { h: 'Status', cell: p => App.badge(p.status) },
      { h: '', class: 'num', cell: p => HR.acoes(p) }
    ]);
  };

  /* ---------- assistência de pista por evento ---------- */
  const renderEventos = () => {
    const el = document.getElementById('hr-eventos');
    const pista = payments.filter(p => p.tipo === 'pista');
    if (!pista.length) {
      el.innerHTML = App.emptyState('🏁', 'Nenhum evento de pista ainda',
        'Registre a equipe que acompanha as corridas: os custos ficam agrupados por etapa/fim de semana, e você vê o custo real de cada evento.',
        `<button class="btn primary" onclick="HR.addPista()">🏁 Registrar o primeiro evento</button>`);
      return;
    }
    const grupos = {};
    for (const p of pista) {
      const ev = p.evento || 'Sem evento';
      (grupos[ev] = grupos[ev] || []).push(p);
    }
    el.innerHTML = Object.entries(grupos)
      .sort((a, b) => ((b[1][0].data || '') < (a[1][0].data || '') ? -1 : 1))
      .map(([ev, list]) => {
        const total = list.reduce((s, p) => s + (p.valor || 0), 0);
        const pend = list.filter(p => p.status !== 'pago').length;
        return `<div class="card evento-card">
          <div class="ev-head">
            <b>🏁 ${App.esc(ev)}</b>
            <span class="small muted">${App.date(list[0].data)} · ${list.length} pessoa(s)</span>
            ${pend ? `<span class="badge warn">${pend} a pagar</span>` : '<span class="badge ok">tudo pago</span>'}
            <div class="spacer"></div>
            ${fin ? `<b>Total: R$ ${App.money(total)}</b>` : ''}
            <button class="btn sm" onclick="HR.addPista('${App.esc(ev).replace(/'/g, '\\\'')}')">+ Pessoa</button>
          </div>
          ${App.table(list, [
            { h: 'Colaborador', cell: p => { const e = employees.find(x => x.id === p.employeeId); return `<b>${e ? App.esc(e.nome) : '—'}</b>`; } },
            { h: 'Dias', class: 'num', cell: p => p.dias || 1 },
            ...(fin ? [{ h: 'Valor', class: 'num', cell: p => 'R$ ' + App.money(p.valor) }] : []),
            { h: 'Status', cell: p => App.badge(p.status) },
            { h: '', class: 'num', cell: p => HR.acoes(p) }
          ])}
        </div>`;
      }).join('');
  };

  window.HR = {
    limparFiltros() {
      filtroV = ''; filtroQ = '';
      document.getElementById('hr-q').value = '';
      document.querySelectorAll('#hr-chips .chip').forEach(x => x.classList.toggle('active', x.dataset.v === ''));
      renderEmps();
    },
    editEmp(id) {
      const e = id ? employees.find(x => x.id === id) : {};
      App.form(id ? 'Editar colaborador' : 'Novo colaborador', [
        { name: 'nome', label: 'Nome', value: e.nome, required: true, full: true },
        { name: 'cargo', label: 'Cargo', value: e.cargo },
        { name: 'vinculo', label: 'Vínculo', type: 'select', value: e.vinculo || 'fixo', options: [
          { value: 'fixo', label: 'Fixo / Oficina' },
          { value: 'adm', label: 'Administrativo' },
          { value: 'freela', label: 'Freelancer / Pista' }] },
        { name: 'diaPagamento', label: 'Dia de pagamento', type: 'number', value: e.diaPagamento || 5 },
        { name: 'salario', label: 'Salário (R$)', type: 'number', step: '0.01', value: e.salario },
        { name: 'beneficios', label: 'Benefícios (R$)', type: 'number', step: '0.01', value: e.beneficios },
        { name: 'ativo', label: 'Ativo', type: 'checkbox', value: e.ativo !== false }
      ], async d => {
        d.salario = Number(d.salario) || 0; d.beneficios = Number(d.beneficios) || 0;
        d.diaPagamento = Number(d.diaPagamento) || 5;
        if (id) await App.put('/employees/' + id, d);
        else await App.post('/employees', d);
        App.closeModal(); App.toast('Colaborador salvo', 'ok'); App.route();
      });
    },
    /* Botões de cada linha. Enquanto está pendente dá para editar e excluir;
       depois de pago é preciso desfazer o pagamento antes, porque o pagamento
       gerou uma saída no caixa que precisa ser estornada junto. */
    acoes(p) {
      if (p.status === 'pago') {
        return `<button class="btn sm ghost" onclick="HR.desfazer(${p.id})" title="Estorna a saída do caixa e volta para pendente">↩ Desfazer pagamento</button>`;
      }
      return `<button class="btn sm primary" onclick="HR.pay(${p.id})">✓ Pagar</button>
        <button class="btn sm ghost" onclick="HR.editPayment(${p.id})" title="Editar">✎</button>
        <button class="btn sm ghost" onclick="HR.delPayment(${p.id})" title="Excluir">🗑</button>`;
    },

    addPayment(id) {
      if (!employees.length) { App.toast('Cadastre um colaborador antes de lançar pagamentos', 'err'); return; }
      const p = id ? payments.find(x => x.id === id) : null;
      App.form(p ? 'Editar lançamento de RH' : 'Lançar pagamento de RH', [
        { name: 'employeeId', label: 'Colaborador', type: 'select', required: true, full: true,
          value: p ? p.employeeId : '',
          options: [{ value: '', label: '— selecione —' }].concat(
            employees.filter(e => e.ativo !== false || (p && e.id === p.employeeId))
              .map(e => ({ value: e.id, label: e.nome }))) },
        { name: 'tipo', label: 'Tipo', type: 'select', value: p ? p.tipo : 'salario', options: [
          { value: 'salario', label: 'Salário' }, { value: 'beneficio', label: 'Benefício' },
          { value: 'bonus', label: 'Bônus de produção' }, { value: 'pista', label: 'Assistência de pista' },
          { value: 'outro', label: 'Outro' }] },
        { name: 'descricao', label: 'Descrição', value: p ? p.descricao : '' },
        ...(p && p.tipo === 'pista' ? [
          { name: 'evento', label: 'Evento / etapa', value: p.evento || '' },
          { name: 'dias', label: 'Dias', type: 'number', value: p.dias || 1 }
        ] : []),
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', required: true, value: p ? p.valor : '' },
        { name: 'data', label: 'Data prevista', type: 'date', value: p ? p.data : App.today(), required: true }
      ], async d => {
        const corpo = {
          employeeId: Number(d.employeeId), tipo: d.tipo, descricao: d.descricao,
          valor: Number(d.valor), data: d.data
        };
        if (d.evento !== undefined) corpo.evento = d.evento;
        if (d.dias !== undefined) corpo.dias = Number(d.dias) || 1;
        if (p) await App.put('/hrPayments/' + p.id, corpo);
        else await App.post('/hrPayments', Object.assign(corpo, { status: 'pendente' }));
        App.closeModal();
        App.toast(p ? 'Lançamento atualizado' : 'Lançamento criado', 'ok');
        App.route();
      });
    },

    editPayment(id) { HR.addPayment(id); },

    excluirEmp(id) {
      const e = employees.find(x => x.id === id);
      App.excluirCadastro('employees', id, e && e.nome);
    },
    reativarEmp(id) {
      const e = employees.find(x => x.id === id);
      App.reativar('employees', id, e && e.nome);
    },

    async delPayment(id) {
      const p = payments.find(x => x.id === id);
      if (!p) return;
      const quem = (employees.find(e => e.id === p.employeeId) || {}).nome || '';
      if (!await App.confirm(`Excluir o lançamento de ${quem}${p.evento ? ' — ' + p.evento : ''}? Isto não pode ser desfeito.`)) return;
      try {
        await App.del('/hrPayments/' + id);
        App.toast('Lançamento excluído', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },

    async desfazer(id) {
      if (!await App.confirm('Desfazer este pagamento? A saída correspondente sai do caixa e o lançamento volta para pendente, podendo ser editado ou excluído.')) return;
      try {
        await App.post(`/hrPayments/${id}/unpay`, {});
        App.toast('Pagamento desfeito — o caixa foi estornado', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },
    /* Registro por evento: escolhe uma etapa existente (ou cria) e adiciona
       várias pessoas de uma vez — o custo fica amarrado ao evento. */
    addPista(eventoPronto) {
      if (!employees.length) { App.toast('Cadastre um colaborador antes de registrar assistência de pista', 'err'); return; }
      const eventos = [...new Set(payments.filter(p => p.tipo === 'pista' && p.evento).map(p => p.evento))];
      const pessoas = [];
      const m = App.modal(`
        <h2>🏁 Assistência de pista</h2>
        <p class="small muted">Agrupe os custos por etapa/fim de semana de corrida — o total do evento aparece na tela do RH.</p>
        <div class="formgrid">
          <label class="field"><span>Evento / etapa *</span>
            <select id="ap-ev-sel">
              ${eventoPronto ? `<option value="${App.esc(eventoPronto)}" selected>${App.esc(eventoPronto)}</option>` : ''}
              ${eventos.filter(e => e !== eventoPronto).map(e => `<option value="${App.esc(e)}">${App.esc(e)}</option>`).join('')}
              <option value="__novo__" ${!eventoPronto && !eventos.length ? 'selected' : ''}>➕ Novo evento…</option>
            </select></label>
          <label class="field"><span>Nome do novo evento</span>
            <input id="ap-ev-novo" placeholder="ex.: Etapa Interlagos — 22/03" ${eventoPronto || eventos.length ? 'disabled' : ''}></label>
          <label class="field"><span>Data do evento</span><input type="date" id="ap-data" value="${App.today()}"></label>
        </div>
        <div class="section-title" style="margin-top:6px">PESSOAS NESTE EVENTO</div>
        <div class="inline-inputs" style="margin-bottom:8px">
          <select id="ap-quem">${employees.filter(e => e.ativo !== false).map(e => `<option value="${e.id}">${App.esc(e.nome)}</option>`).join('')}</select>
          <input id="ap-dias" type="number" value="1" min="1" title="Dias" style="max-width:70px">
          <input id="ap-valor" type="number" step="0.01" placeholder="Valor R$" style="max-width:120px">
          <button class="btn" id="ap-add" style="flex:none">+ Adicionar</button>
        </div>
        <div id="ap-lista" class="small muted">Ninguém adicionado ainda — escolha a pessoa, os dias e o valor.</div>
        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Cancelar</button>
          <button class="btn primary" id="ap-save" disabled>Salvar evento</button>
        </div>`, { wide: true });

      const sel = m.querySelector('#ap-ev-sel'), novo = m.querySelector('#ap-ev-novo');
      sel.addEventListener('change', () => { novo.disabled = sel.value !== '__novo__'; if (!novo.disabled) novo.focus(); });
      if (sel.value === '__novo__') novo.disabled = false;

      const renderLista = () => {
        m.querySelector('#ap-save').disabled = !pessoas.length;
        m.querySelector('#ap-lista').innerHTML = pessoas.length
          ? pessoas.map((p, i) => `<div style="display:flex;gap:10px;align-items:center;padding:4px 0">
              <b>${App.esc(p.nome)}</b> · ${p.dias} dia(s) · R$ ${App.money(p.valor)}
              <button class="btn sm ghost" data-rm="${i}">✕</button></div>`).join('')
            + `<div style="margin-top:6px"><b>Total do evento: R$ ${App.money(pessoas.reduce((s, p) => s + p.valor, 0))}</b></div>`
          : 'Ninguém adicionado ainda — escolha a pessoa, os dias e o valor.';
        m.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { pessoas.splice(Number(b.dataset.rm), 1); renderLista(); });
      };
      m.querySelector('#ap-add').onclick = () => {
        const emp = employees.find(e => e.id === Number(m.querySelector('#ap-quem').value));
        const valor = Number(m.querySelector('#ap-valor').value);
        if (!emp || !(valor > 0)) return App.toast('Informe a pessoa e o valor', 'err');
        pessoas.push({ employeeId: emp.id, nome: emp.nome, dias: Number(m.querySelector('#ap-dias').value) || 1, valor });
        m.querySelector('#ap-valor').value = '';
        renderLista();
      };
      m.querySelector('#ap-save').onclick = async () => {
        const evento = sel.value === '__novo__' ? novo.value.trim() : sel.value;
        if (!evento) return App.toast('Dê um nome ao evento', 'err');
        const data = m.querySelector('#ap-data').value || App.today();
        for (const p of pessoas) {
          await App.post('/hrPayments', {
            employeeId: p.employeeId, tipo: 'pista', descricao: 'Assistência de pista',
            evento, dias: p.dias, valor: p.valor, data, status: 'pendente'
          });
        }
        App.closeModal();
        App.toast(`Evento "${evento}" salvo com ${pessoas.length} pessoa(s)`, 'ok');
        App.route();
      };
    },
    pay(id) {
      App.form('Confirmar pagamento', [
        { name: 'data', label: 'Data do pagamento', type: 'date', value: App.today(), required: true }
      ], async d => {
        await App.post(`/hrPayments/${id}/pay`, d);
        App.closeModal(); App.toast('Pagamento lançado no financeiro', 'ok'); App.route();
      });
    }
  };

  /* Só depois de HR existir: as tabelas usam HR.acoes() nas células. */
  renderEmps(); renderPays(); renderEventos();
});
