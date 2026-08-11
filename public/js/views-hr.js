/* RH gerencial: colaboradores, salários, bônus de produção e assistência de pista */
'use strict';

App.registerView('hr', async (view) => {
  App.setTitle('RH', 'Gerencial — não substitui folha/contabilidade. Acesso restrito.');
  const [employees, payments] = await Promise.all([App.get('/employees'), App.get('/hrPayments')]);
  payments.sort((a, b) => b.id - a.id);
  const fin = App.can('finance_sensitive');
  const TIPOS = { salario: 'Salário', beneficio: 'Benefício', bonus: 'Bônus de produção', pista: 'Assistência de pista', outro: 'Outro' };

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="HR.editEmp()">+ Colaborador</button>
      <button class="btn" onclick="HR.addPayment()">+ Lançar pagamento</button>
      <button class="btn" onclick="HR.addPista()">🏁 Assistência de pista</button>
    </div>
    ${App.table(employees, [
      { h: 'Colaborador', cell: e => `<b>${App.esc(e.nome)}</b>` },
      { h: 'Cargo', cell: e => App.esc(e.cargo || '—') },
      ...(fin ? [
        { h: 'Salário', class: 'num', cell: e => 'R$ ' + App.money(e.salario || 0) },
        { h: 'Benefícios', class: 'num', cell: e => 'R$ ' + App.money(e.beneficios || 0) }] : []),
      { h: 'Dia de pagamento', class: 'num', cell: e => e.diaPagamento || '—' },
      { h: 'Ativo', cell: e => e.ativo !== false ? App.badge('ok') : App.badge('cancelada') },
      { h: '', class: 'num', cell: e => `<button class="btn sm ghost" onclick="HR.editEmp(${e.id})">✎</button>` }
    ], { emptyMsg: 'Nenhum colaborador cadastrado' })}

    <div class="section-title">Pagamentos e lançamentos</div>
    ${App.table(payments.slice(0, 40), [
      { h: 'Colaborador', cell: p => { const e = employees.find(x => x.id === p.employeeId); return e ? App.esc(e.nome) : '—'; } },
      { h: 'Tipo', cell: p => `<span class="badge ${p.tipo === 'pista' ? 'accent' : p.tipo === 'bonus' ? 'info' : ''}">${TIPOS[p.tipo] || p.tipo}</span>` },
      { h: 'Descrição', cell: p => `${App.esc(p.descricao || '—')}${p.evento ? `<div class="small muted">${App.esc(p.evento)}${p.dias ? ' · ' + p.dias + ' dia(s)/etapa(s)' : ''}</div>` : ''}` },
      { h: 'Data', cell: p => App.date(p.data) },
      ...(fin ? [{ h: 'Valor', class: 'num', cell: p => App.moneyHtml(p.valor) }] : []),
      { h: 'Status', cell: p => App.badge(p.status) },
      { h: '', class: 'num', cell: p => p.status !== 'pago'
          ? `<button class="btn sm primary" onclick="HR.pay(${p.id})">✓ Pagar</button>` : '' }
    ], { emptyMsg: 'Nenhum lançamento' })}`;

  window.HR = {
    editEmp(id) {
      const e = id ? employees.find(x => x.id === id) : {};
      App.form(id ? 'Editar colaborador' : 'Novo colaborador', [
        { name: 'nome', label: 'Nome', value: e.nome, required: true, full: true },
        { name: 'cargo', label: 'Cargo', value: e.cargo },
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
    addPayment() {
      App.form('Lançar pagamento de RH', [
        { name: 'employeeId', label: 'Colaborador', type: 'select', required: true, full: true,
          options: [{ value: '', label: '— selecione —' }].concat(
            employees.filter(e => e.ativo !== false).map(e => ({ value: e.id, label: e.nome }))) },
        { name: 'tipo', label: 'Tipo', type: 'select', value: 'salario', options: [
          { value: 'salario', label: 'Salário' }, { value: 'beneficio', label: 'Benefício' },
          { value: 'bonus', label: 'Bônus de produção' }, { value: 'outro', label: 'Outro' }] },
        { name: 'descricao', label: 'Descrição' },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', required: true },
        { name: 'data', label: 'Data prevista', type: 'date', value: App.today(), required: true }
      ], async d => {
        await App.post('/hrPayments', {
          employeeId: Number(d.employeeId), tipo: d.tipo, descricao: d.descricao,
          valor: Number(d.valor), data: d.data, status: 'pendente'
        });
        App.closeModal(); App.toast('Lançamento criado', 'ok'); App.route();
      });
    },
    addPista() {
      App.form('Assistência de pista', [
        { name: 'employeeId', label: 'Colaborador', type: 'select', required: true, full: true,
          options: [{ value: '', label: '— selecione —' }].concat(
            employees.filter(e => e.ativo !== false).map(e => ({ value: e.id, label: e.nome }))) },
        { name: 'evento', label: 'Corrida / evento', required: true, full: true },
        { name: 'data', label: 'Data', type: 'date', value: App.today(), required: true },
        { name: 'dias', label: 'Quantidade de dias / etapas', type: 'number', value: 1 },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', required: true }
      ], async d => {
        await App.post('/hrPayments', {
          employeeId: Number(d.employeeId), tipo: 'pista', descricao: 'Assistência de pista',
          evento: d.evento, dias: Number(d.dias) || 1, valor: Number(d.valor), data: d.data, status: 'pendente'
        });
        App.closeModal(); App.toast('Assistência de pista registrada', 'ok'); App.route();
      });
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
});
