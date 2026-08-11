/* Administração: usuários, perfis/permissões, catálogo de serviços,
   configurações e histórico de alterações (auditoria) */
'use strict';

App.registerView('admin', async (view) => {
  App.setTitle('Administração', 'Usuários, permissões, catálogo, configurações e auditoria');

  const tabs = {
    usuarios: renderUsers, permissoes: renderRoles, catalogo: renderCatalog,
    config: renderSettings, auditoria: renderAudit
  };

  view.innerHTML = `
    <div class="tabs" id="adm-tabs">
      <button data-t="usuarios" class="active">Usuários</button>
      <button data-t="permissoes">Perfis e permissões</button>
      <button data-t="catalogo">Catálogo de serviços</button>
      <button data-t="config">Configurações</button>
      <button data-t="auditoria">Histórico de alterações</button>
    </div>
    <div id="adm-body"></div>`;

  const body = document.getElementById('adm-body');
  document.getElementById('adm-tabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('#adm-tabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    tabs[b.dataset.t](body);
  });
  renderUsers(body);

  /* ---------- usuários ---------- */
  async function renderUsers(el) {
    const [users, roles] = await Promise.all([App.get('/users'), App.get('/roles')]);
    const roleName = id => (roles.find(r => r.id === id) || {}).name || '—';
    el.innerHTML = `
      <div class="toolbar"><button class="btn primary" onclick="Adm.editUser()">+ Novo usuário</button></div>
      ${App.table(users, [
        { h: 'Usuário', cell: u => `<span class="mono">${App.esc(u.username)}</span>` },
        { h: 'Nome', cell: u => `<b>${App.esc(u.name)}</b>` },
        { h: 'Cargo', cell: u => App.esc(u.cargo || '—') },
        { h: 'Perfil de acesso', cell: u => `<span class="badge accent">${App.esc(roleName(u.roleId))}</span>` },
        { h: 'Status', cell: u => u.active ? App.badge('ok') : '<span class="badge danger">Inativo</span>' },
        { h: '', class: 'num', cell: u => `<button class="btn sm ghost" onclick="Adm.editUser(${u.id})">✎ Editar</button>` }
      ])}`;
    window.Adm = window.Adm || {};
    Adm.editUser = (id) => {
      const u = id ? users.find(x => x.id === id) : {};
      App.form(id ? 'Editar usuário' : 'Novo usuário', [
        ...(id ? [] : [{ name: 'username', label: 'Usuário (login)', required: true }]),
        { name: 'name', label: 'Nome', value: u.name, required: true },
        { name: 'cargo', label: 'Cargo', value: u.cargo },
        { name: 'roleId', label: 'Perfil de acesso', type: 'select', value: u.roleId || 3,
          options: roles.map(r => ({ value: r.id, label: r.name })) },
        { name: 'password', label: id ? 'Nova senha (deixe vazio p/ manter)' : 'Senha inicial', type: 'password', required: !id },
        { name: 'active', label: 'Ativo', type: 'checkbox', value: u.active !== false }
      ], async d => {
        if (!d.password) delete d.password;
        if (id) await App.put('/users/' + id, d);
        else await App.post('/users', d);
        App.closeModal(); App.toast('Usuário salvo', 'ok'); renderUsers(el);
      });
    };
  }

  /* ---------- perfis / permissões ---------- */
  async function renderRoles(el) {
    const roles = await App.get('/roles');
    const mods = App.meta.modules;
    el.innerHTML = `
      <div class="toolbar"><button class="btn primary" onclick="Adm.editRole()">+ Novo perfil</button></div>
      <div class="grid cols-3">
        ${roles.map(r => `
          <div class="card">
            <h3>${App.esc(r.name)}${r.builtin ? ' <span class="badge">padrão</span>' : ''}</h3>
            <div class="small muted" style="margin-bottom:10px">${r.permissions.length} permissão(ões)</div>
            <div class="small">${r.permissions.includes('admin')
              ? '<span class="badge accent">Acesso completo</span>'
              : mods.filter(([k]) => r.permissions.includes(k)).map(([, l]) => l).join(' · ')}</div>
            <div style="margin-top:12px"><button class="btn sm" onclick="Adm.editRole(${r.id})">✎ Configurar permissões</button></div>
          </div>`).join('')}
      </div>`;
    window.Adm = window.Adm || {};
    Adm.editRole = (id) => {
      const r = id ? roles.find(x => x.id === id) : { permissions: [] };
      const m = App.modal(`
        <h2>${id ? 'Permissões — ' + App.esc(r.name) : 'Novo perfil'}</h2>
        <label class="field"><span>Nome do perfil</span><input id="role-name" value="${App.esc(r.name || '')}"></label>
        <div style="columns:2;column-gap:20px">
          ${App.meta.modules.map(([k, l]) => `
            <label style="display:flex;gap:8px;align-items:center;padding:5px 0;break-inside:avoid;font-size:13px">
              <input type="checkbox" data-perm="${k}" ${r.permissions.includes(k) ? 'checked' : ''}> ${App.esc(l)}
            </label>`).join('')}
        </div>
        <p class="small muted" style="margin-top:10px">“Dados financeiros sensíveis” controla a visualização de custos,
        margens, resultados e salários. “Administração” dá acesso completo a tudo.</p>
        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Cancelar</button>
          <button class="btn primary" id="role-save">Salvar</button>
        </div>`, { wide: true });
      m.querySelector('#role-save').onclick = async () => {
        const perms = [...m.querySelectorAll('[data-perm]:checked')].map(x => x.dataset.perm);
        const name = m.querySelector('#role-name').value.trim() || 'Perfil';
        if (id) await App.put('/roles/' + id, { name, permissions: perms });
        else await App.post('/roles', { name, permissions: perms });
        App.closeModal(); App.toast('Perfil salvo — vale a partir do próximo acesso dos usuários', 'ok'); renderRoles(el);
      };
    };
  }

  /* ---------- catálogo de serviços ---------- */
  async function renderCatalog(el) {
    const catalog = await App.get('/serviceCatalog');
    catalog.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    el.innerHTML = `
      <div class="toolbar">
        <button class="btn primary" onclick="Adm.editService()">+ Novo serviço</button>
        <div class="spacer"></div>
        <span class="badge warn">${catalog.filter(s => !s.preco).length} sem preço definido</span>
      </div>
      ${App.table(catalog, [
        { h: 'Serviço / componente', cell: s => `<b>${App.esc(s.nome)}</b>` },
        { h: 'Preço-base', class: 'num', cell: s => s.preco > 0
            ? 'R$ ' + App.money(s.preco)
            : '<span class="badge warn">definir preço</span>' },
        { h: 'Ativo', cell: s => s.ativo ? App.badge('ok') : App.badge('cancelada') },
        { h: '', class: 'num', cell: s => `<button class="btn sm ghost" onclick="Adm.editService(${s.id})">✎ Editar</button>` }
      ])}
      <p class="small muted" style="margin-top:10px">O preço-base é usado como sugestão nos orçamentos.
      Em cada orçamento é possível usar um valor personalizado sem alterar o catálogo.</p>`;
    window.Adm = window.Adm || {};
    Adm.editService = (id) => {
      const s = id ? catalog.find(x => x.id === id) : {};
      App.form(id ? 'Editar serviço' : 'Novo serviço do catálogo', [
        { name: 'nome', label: 'Nome', value: s.nome, required: true, full: true },
        { name: 'preco', label: 'Preço-base (R$)', type: 'number', step: '0.01', value: s.preco || 0 },
        { name: 'ativo', label: 'Ativo (aparece nos orçamentos)', type: 'checkbox', value: s.ativo !== false }
      ], async d => {
        d.preco = Number(d.preco) || 0;
        if (id) await App.put('/serviceCatalog/' + id, d);
        else await App.post('/serviceCatalog', d);
        App.closeModal(); App.toast('Catálogo atualizado', 'ok'); renderCatalog(el);
      });
    };
  }

  /* ---------- configurações ---------- */
  async function renderSettings(el) {
    const s = await App.get('/settings');
    el.innerHTML = `
      <div class="card" style="max-width:560px">
        <h3>CONFIGURAÇÕES GERAIS</h3>
        <label class="field"><span>Nome da empresa</span><input id="cfg-nome" value="${App.esc(s.companyName)}"></label>
        <label class="field"><span>Validade padrão dos orçamentos (dias)</span>
          <input id="cfg-validade" type="number" value="${s.quoteValidityDays}"></label>
        <button class="btn primary" onclick="Adm.saveSettings()">Salvar configurações</button>
      </div>`;
    window.Adm = window.Adm || {};
    Adm.saveSettings = async () => {
      await App.put('/settings', {
        companyName: document.getElementById('cfg-nome').value,
        quoteValidityDays: Number(document.getElementById('cfg-validade').value) || 30
      });
      App.toast('Configurações salvas', 'ok');
      App.meta.settings.quoteValidityDays = Number(document.getElementById('cfg-validade').value) || 30;
    };
  }

  /* ---------- auditoria ---------- */
  async function renderAudit(el) {
    const audit = await App.get('/audit?limit=300');
    const list = audit.filter(a => a.action !== 'timeline');
    el.innerHTML = `
      <p class="small muted" style="margin-bottom:10px">Quem alterou o quê e quando — últimos ${list.length} eventos.</p>
      ${App.table(list, [
        { h: 'Quando', cell: a => `<span class="small">${App.dateTime(a.at)}</span>` },
        { h: 'Usuário', cell: a => `<b>${App.esc(a.userName)}</b>` },
        { h: 'Ação', cell: a => `<span class="badge">${App.esc(a.action)}</span>` },
        { h: 'Entidade', cell: a => `<span class="small muted">${App.esc(a.entity)}${a.entityId ? ' #' + a.entityId : ''}</span>` },
        { h: 'Detalhes', cell: a => `<span class="small">${App.esc(a.details || '')}</span>` }
      ], { emptyMsg: 'Nenhum evento' })}`;
  }
});
