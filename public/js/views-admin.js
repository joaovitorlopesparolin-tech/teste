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
    const [s, bk, net, ca] = await Promise.all([
      App.get('/settings'), App.get('/backup/status'), App.get('/network'), App.get('/contaazul/status')
    ]);
    const provider = s.aiProvider || 'gemini';
    const lastBk = bk.cloud.last;
    const bkStatus = !bk.cloud.dir
      ? '<span class="badge warn">não configurado</span> <span class="muted">— os backups ficam só neste computador</span>'
      : lastBk
        ? (lastBk.ok
          ? `<span style="color:var(--ok)">✓ Último backup na nuvem: ${App.dateTime(lastBk.at)}</span><div class="muted small">${App.esc(lastBk.file)}</div>`
          : `<span style="color:var(--danger)">✗ Última tentativa falhou (${App.dateTime(lastBk.at)}): ${App.esc(lastBk.error || '')}</span>`)
        : '<span class="muted">configurado — o primeiro backup sai no próximo ciclo</span>';
    el.innerHTML = `
      <div class="card" style="max-width:560px">
        <h3>CONFIGURAÇÕES GERAIS</h3>
        <label class="field"><span>Nome da empresa</span><input id="cfg-nome" value="${App.esc(s.companyName)}"></label>
        <label class="field"><span>Validade padrão dos orçamentos (dias)</span>
          <input id="cfg-validade" type="number" value="${s.quoteValidityDays}"></label>
        <button class="btn primary" onclick="Adm.saveSettings()">Salvar configurações</button>
      </div>

      <div class="card" style="max-width:560px;margin-top:16px">
        <h3>🏢 DADOS DA EMPRESA (remetente das etiquetas)</h3>
        <p class="small muted" style="margin-bottom:12px">Cadastrados uma vez e usados automaticamente em toda
        etiqueta de envio gerada a partir de um pedido ou de uma OS.</p>
        <div class="formgrid">
          <label class="field full"><span>Razão social</span><input id="emp-razao" value="${App.esc((s.empresa || {}).razaoSocial || '')}"></label>
          <label class="field"><span>CNPJ</span><input id="emp-cnpj" data-mask="cpfcnpj" inputmode="numeric" value="${App.esc(App.fmtCpfCnpj((s.empresa || {}).cnpj))}"></label>
          <label class="field"><span>CEP</span><input id="emp-cep" data-mask="cep" inputmode="numeric" value="${App.esc(App.fmtCep((s.empresa || {}).cep))}"></label>
          <label class="field full"><span>Endereço</span><input id="emp-endereco" value="${App.esc((s.empresa || {}).endereco || '')}"></label>
          <label class="field"><span>Número</span><input id="emp-numero" value="${App.esc((s.empresa || {}).numero || '')}"></label>
          <label class="field"><span>Bairro</span><input id="emp-bairro" value="${App.esc((s.empresa || {}).bairro || '')}"></label>
          <label class="field"><span>Cidade</span><input id="emp-cidade" value="${App.esc((s.empresa || {}).cidade || '')}"></label>
          <label class="field"><span>Estado (UF)</span><input id="emp-estado" maxlength="2" value="${App.esc((s.empresa || {}).estado || '')}"></label>
          <label class="field full"><span>Telefone (opcional, sai na etiqueta)</span><input id="emp-telefone" value="${App.esc((s.empresa || {}).telefone || '')}"></label>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" onclick="Adm.saveEmpresa()">Salvar dados da empresa</button>
          <button class="btn" onclick="Adm.previewEtiqueta()">📦 Ver modelo da etiqueta</button>
        </div>
      </div>

      <div class="card" style="max-width:560px;margin-top:16px">
        <h3>✦ ASSISTENTE DE IA</h3>
        <p class="small muted" style="margin-bottom:12px">O assistente (botão ✦ no canto da tela) responde perguntas
        sobre os dados do sistema. A chave fica gravada apenas neste computador e nunca aparece para os usuários —
        cada perfil só recebe respostas com os dados que já pode ver nas telas.</p>
        <label class="field"><span>Provedor</span>
          <select id="cfg-ai-provider">
            <option value="gemini" ${provider === 'gemini' ? 'selected' : ''}>Google Gemini (tem plano gratuito)</option>
            <option value="claude" ${provider === 'claude' ? 'selected' : ''}>Claude (Anthropic)</option>
          </select></label>
        <label class="field"><span>Chave da API &nbsp;${s.aiKeyMasked
          ? `<span class="badge ok">configurada ${App.esc(s.aiKeyMasked)}</span>`
          : '<span class="badge warn">não configurada</span>'}</span>
          <input id="cfg-ai-key" type="password" autocomplete="off"
            placeholder="${s.aiKeyMasked ? 'deixe em branco para manter a chave atual' : 'cole aqui a chave da API'}"></label>
        <label class="field"><span>Modelo (opcional — deixe em branco para o padrão)</span>
          <input id="cfg-ai-model" value="${App.esc(s.aiModel || '')}"
            placeholder="${provider === 'claude' ? 'padrão: claude-haiku-4-5' : 'padrão: gemini-2.5-flash'}"></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" onclick="Adm.saveAI()">Salvar assistente</button>
          <button class="btn" onclick="Adm.testAI()">🔌 Testar conexão</button>
        </div>
        <div id="cfg-ai-result" class="small" style="margin-top:10px"></div>
        <p class="small muted" style="margin-top:10px">Onde obter a chave — Gemini: <b>aistudio.google.com</b>
        (botão “Get API key”, plano gratuito disponível) · Claude: <b>console.anthropic.com</b>.</p>
      </div>

      <div class="card" style="max-width:560px;margin-top:16px">
        <h3>☁ BACKUP NA NUVEM</h3>
        <p class="small muted" style="margin-bottom:12px">Todo dia o sistema já guarda uma cópia dos dados neste
        computador (${bk.local.arquivos} cópia(s) em <span class="mono">data/backups</span>). Aponte abaixo uma pasta
        sincronizada — <b>Google Drive para Computador</b>, <b>OneDrive</b> ou Dropbox — e a cópia diária também vai
        para a nuvem. Se este computador quebrar, os dados estão salvos.</p>
        ${bk.sugestoes.length ? `
        <div class="small muted" style="margin-bottom:4px">Pastas de nuvem encontradas neste computador — clique para usar:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
          ${bk.sugestoes.map(p => `<button class="btn sm" onclick="Adm.useBackupDir(this.dataset.p)" data-p="${App.esc(p)}">📁 ${App.esc(p)}</button>`).join('')}
        </div>` : `
        <p class="small muted">Nenhuma pasta de nuvem encontrada automaticamente. Instale o
        <b>Google Drive para Computador</b> (google.com/drive/download) ou ative o OneDrive do Windows,
        e digite o caminho da pasta abaixo.</p>`}
        <label class="field"><span>Pasta do backup na nuvem</span>
          <input id="cfg-bk-dir" value="${App.esc(bk.cloud.dir)}" placeholder="ex.: G:\\Meu Drive\\Backup Jaques Motorsport"></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" onclick="Adm.saveBackup()">Salvar backup</button>
          <button class="btn" onclick="Adm.backupNow()">💾 Fazer backup agora</button>
          ${bk.cloud.dir ? '<button class="btn ghost" onclick="Adm.clearBackup()">Desativar</button>' : ''}
        </div>
        <div class="small" style="margin-top:10px">${bkStatus}</div>
      </div>

      <div class="card" style="max-width:560px;margin-top:16px">
        <h3>📦 LEVAR OS DADOS DE UM LUGAR PARA OUTRO</h3>
        <p class="small muted" style="margin-bottom:12px">Baixe um arquivo com <b>tudo</b> que está no sistema —
        clientes, orçamentos, ordens de serviço, financeiro. Esse mesmo arquivo entra em qualquer outra
        instalação do sistema pelo botão de restaurar, mesmo que ela esteja na nuvem.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" onclick="Adm.baixarBackup()">⬇ Baixar cópia de tudo</button>
          <button class="btn" onclick="Adm.restaurarBackup()">⬆ Restaurar de um arquivo</button>
        </div>
        <p class="small muted" style="margin-top:10px">Restaurar <b>substitui</b> os dados que estão aqui pelos do
        arquivo. O sistema guarda sozinho uma cópia do que havia antes, então dá para voltar atrás. Depois de
        restaurar você entra de novo, com o usuário e a senha de <b>onde o arquivo veio</b>.</p>
      </div>

      <div class="card" style="max-width:560px;margin-top:16px">
        <h3>🔗 CONTA AZUL</h3>
        ${ca.conectado ? `
          <p class="small" style="color:var(--ok);margin-bottom:4px">✓ Conectado${ca.conta && ca.conta.nome ? ' — ' + App.esc(ca.conta.nome) : ''}</p>
          ${ca.conta && ca.conta.email ? `<p class="small muted" style="margin-bottom:10px">${App.esc(ca.conta.email)}</p>` : ''}
          ${ca.conectadoEm ? `<p class="small muted" style="margin-bottom:12px">Autorizado em ${App.dateTime(ca.conectadoEm)}</p>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn" onclick="Adm.caTestar()">🔌 Testar conexão</button>
            <button class="btn ghost" onclick="Adm.caDesconectar()">Desconectar</button>
          </div>
          <div class="small" id="ca-resultado" style="margin-top:10px"></div>
        ` : `
          <p class="small muted" style="margin-bottom:12px">Ligação com a Conta Azul pela <b>API oficial</b>. Funciona
          direto deste computador — o endereço de retorno pode ser <span class="mono">localhost</span>, então não é
          preciso publicar o sistema na internet.</p>
          <ol class="small muted" style="margin:0 0 12px 18px;padding:0">
            <li>Crie uma aplicação em <b>portaldevs.contaazul.com</b>.</li>
            <li>Lá, cadastre como endereço de retorno exatamente o que está no campo abaixo.</li>
            <li>Copie o Client ID e o Client Secret para cá e salve.</li>
            <li>Clique em <b>Conectar</b> e autorize na tela da Conta Azul.</li>
          </ol>
          <label class="field"><span>Client ID</span>
            <input id="ca-id" placeholder="${ca.clientIdMascarado ? 'salvo: ' + App.esc(ca.clientIdMascarado) : 'cole aqui'}"></label>
          <label class="field"><span>Client Secret</span>
            <input id="ca-secret" type="password" placeholder="${ca.temSecret ? 'salvo — deixe em branco para manter' : 'cole aqui'}"></label>
          <label class="field"><span>Endereço de retorno (cadastre este mesmo no portal)</span>
            <input id="ca-redirect" value="${App.esc(ca.redirectUri || (location.origin + '/api/contaazul/callback'))}"></label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn primary" onclick="Adm.caSalvar()">Salvar credenciais</button>
            ${ca.configurado ? '<button class="btn" onclick="Adm.caConectar()">🔗 Conectar</button>' : ''}
          </div>
        `}
        ${ca.ultimoErro ? `<p class="small" style="color:var(--danger);margin-top:10px">${App.esc(ca.ultimoErro)}</p>` : ''}
        <p class="small muted" style="margin-top:10px">O Client Secret e a autorização ficam gravados
        <b>só neste computador</b> e nunca aparecem no navegador. O sistema continua sendo a ferramenta
        principal da oficina — a Conta Azul segue como o lado financeiro e fiscal.</p>
      </div>

      <div class="card" style="max-width:560px;margin-top:16px">
        <h3>📱 ACESSO PELO CELULAR</h3>
        ${net.ips.length ? `
        <p class="small muted" style="margin-bottom:12px">No celular (ou em outro computador) conectado ao
        <b>mesmo Wi-Fi</b> da oficina, aponte a câmera para o código abaixo — o sistema abre no navegador,
        com os <b>mesmos dados, em tempo real</b>. Cada pessoa entra com o próprio usuário e senha.</p>
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <div style="border-radius:10px;overflow:hidden;flex:none">${QR.svg(`http://${net.ips[0]}:${net.port}`, 168)}</div>
          <div style="min-width:200px">
            <div class="small muted">Endereço do sistema nesta rede:</div>
            <div class="mono" style="font-size:16px;margin:6px 0 10px;color:var(--text-1)">http://${App.esc(net.ips[0])}:${net.port}</div>
            ${net.ips.length > 1 ? `<div class="small muted">Se não abrir, tente: ${net.ips.slice(1).map(ip => `<span class="mono">http://${App.esc(ip)}:${net.port}</span>`).join(' · ')}</div>` : ''}
          </div>
        </div>
        <p class="small muted" style="margin-top:12px"><b>Não abriu no celular?</b> É o firewall do Windows bloqueando.
        Na pasta do sistema, dê dois cliques em <b>LIBERAR NO CELULAR.bat</b> uma única vez (clique em “Sim” quando o
        Windows pedir permissão) e tente de novo. Vale só para aparelhos do mesmo Wi-Fi — de fora da oficina ninguém acessa.</p>`
        : '<p class="small muted">Não encontrei o computador conectado a uma rede. Conecte no Wi-Fi ou cabo de rede e recarregue esta tela.</p>'}
      </div>`;
    document.getElementById('cfg-ai-provider').addEventListener('change', e => {
      document.getElementById('cfg-ai-model').placeholder =
        e.target.value === 'claude' ? 'padrão: claude-haiku-4-5' : 'padrão: gemini-2.5-flash';
    });
    window.Adm = window.Adm || {};
    Adm.saveSettings = async () => {
      await App.put('/settings', {
        companyName: document.getElementById('cfg-nome').value,
        quoteValidityDays: Number(document.getElementById('cfg-validade').value) || 30
      });
      App.toast('Configurações salvas', 'ok');
      App.meta.settings.quoteValidityDays = Number(document.getElementById('cfg-validade').value) || 30;
    };
    Adm.saveAI = async () => {
      const key = document.getElementById('cfg-ai-key').value.trim();
      await App.put('/settings', {
        aiProvider: document.getElementById('cfg-ai-provider').value,
        aiModel: document.getElementById('cfg-ai-model').value.trim(),
        ...(key ? { aiApiKey: key } : {})
      });
      if (window.Assistant) Assistant.status = null; // relê o status na próxima abertura
      App.toast('Assistente salvo', 'ok');
      renderSettings(el);
    };
    /* máscara nos campos da empresa */
    el.querySelectorAll('[data-mask]').forEach(inp => {
      inp.addEventListener('input', () => {
        inp.value = inp.dataset.mask === 'cep' ? App.maskCep(inp.value) : App.maskCpfCnpj(inp.value);
      });
    });
    /* CEP da empresa preenche o endereço */
    const cepEmp = document.getElementById('emp-cep');
    cepEmp.addEventListener('change', async () => {
      const end = await App.lookupCep(cepEmp.value);
      if (!end) return;
      const vazio = id => !document.getElementById(id).value.trim();
      if (vazio('emp-endereco') && end.endereco) document.getElementById('emp-endereco').value = end.endereco;
      if (vazio('emp-bairro') && end.bairro) document.getElementById('emp-bairro').value = end.bairro;
      if (vazio('emp-cidade') && end.cidade) document.getElementById('emp-cidade').value = end.cidade;
      if (vazio('emp-estado') && end.estado) document.getElementById('emp-estado').value = end.estado;
    });

    Adm.saveEmpresa = async () => {
      const v = id => document.getElementById(id).value.trim();
      if (v('emp-cnpj') && !App.validCpfCnpj(v('emp-cnpj'))) return App.toast('CNPJ inválido — confira os números', 'err');
      if (v('emp-cep') && !App.validCep(v('emp-cep'))) return App.toast('CEP inválido — informe os 8 números', 'err');
      const empresa = {
        razaoSocial: v('emp-razao'), cnpj: App.digits(v('emp-cnpj')), cep: App.digits(v('emp-cep')),
        endereco: v('emp-endereco'), numero: v('emp-numero'), bairro: v('emp-bairro'),
        cidade: v('emp-cidade'), estado: v('emp-estado').toUpperCase(), telefone: v('emp-telefone')
      };
      await App.put('/settings', { empresa });
      App.meta.settings.empresa = empresa; // etiquetas já saem com os dados novos
      App.toast('Dados da empresa salvos — já valem para as próximas etiquetas', 'ok');
    };

    Adm.previewEtiqueta = () => {
      Etiqueta.abrir('sales',
        { id: 0, numero: '000', itens: [{ qtd: 1, produto: 'Cabeçote (exemplo)' }] },
        { nome: 'NOME DO CLIENTE (exemplo)', cpfCnpj: '12345678901', endereco: 'Rua Exemplo', numero: '100',
          bairro: 'Centro', cidade: 'Cascavel', estado: 'PR', cep: '85800000' });
    };

    Adm.useBackupDir = (p) => { document.getElementById('cfg-bk-dir').value = p; };
    Adm.saveBackup = async () => {
      try {
        await App.put('/settings', { backupDir: document.getElementById('cfg-bk-dir').value.trim() });
        App.toast('Backup na nuvem configurado — primeira cópia feita agora', 'ok');
        renderSettings(el);
      } catch (e) { App.toast(e.message, 'err'); }
    };
    Adm.clearBackup = async () => {
      if (!await App.confirm('Desativar o backup na nuvem? Os backups continuam sendo feitos neste computador.')) return;
      await App.put('/settings', { backupDir: '' });
      App.toast('Backup na nuvem desativado', 'ok');
      renderSettings(el);
    };
    Adm.backupNow = async () => {
      const r = await App.post('/backup/now', {});
      if (r.ok) App.toast('Backup feito: ' + r.file, 'ok');
      else App.toast(r.naoConfigurado ? 'Backup local feito. Configure a pasta da nuvem para copiar para o Drive.' : 'Falhou: ' + (r.error || ''), r.naoConfigurado ? 'ok' : 'err');
      renderSettings(el);
    };
    /* ---- Conta Azul ---- */
    Adm.caSalvar = async () => {
      const corpo = {
        clientId: document.getElementById('ca-id').value.trim(),
        clientSecret: document.getElementById('ca-secret').value.trim(),
        redirectUri: document.getElementById('ca-redirect').value.trim()
      };
      if (!corpo.redirectUri) return App.toast('Informe o endereço de retorno.', 'err');
      try {
        await App.put('/contaazul/config', corpo);
        App.toast('Credenciais salvas. Agora clique em Conectar.', 'ok');
        renderSettings(el);
      } catch (e) { App.toast(e.message, 'err'); }
    };

    /* A autorização acontece na tela da Conta Azul, no navegador do usuário —
       a senha da Conta Azul nunca passa por aqui. */
    Adm.caConectar = async () => {
      try {
        const r = await App.post('/contaazul/connect', {});
        const aba = window.open(r.url, '_blank');
        if (!aba) return App.toast('O navegador bloqueou a janela. Libere os pop-ups e tente de novo.', 'err');
        App.toast('Autorize na aba que abriu e depois volte aqui.', 'ok');
      } catch (e) { App.toast(e.message, 'err'); }
    };

    Adm.caTestar = async () => {
      const out = document.getElementById('ca-resultado');
      out.innerHTML = '<span class="muted">Falando com a Conta Azul…</span>';
      const r = await App.post('/contaazul/test', {});
      out.innerHTML = r.ok
        ? `<span style="color:var(--ok)">✓ Conexão boa${r.conta && r.conta.nome ? ' — ' + App.esc(r.conta.nome) : ''}</span>`
        : `<span style="color:var(--danger)">${App.esc(r.error)}</span>`;
    };

    Adm.caDesconectar = async () => {
      if (!await App.confirm('Desconectar a Conta Azul? Nada é apagado dos dois lados — só a autorização é revogada aqui.')) return;
      await App.post('/contaazul/disconnect', {});
      App.toast('Conta Azul desconectada', 'ok');
      renderSettings(el);
    };

    /* Baixa com o token no cabeçalho — o endereço nunca carrega a credencial. */
    Adm.baixarBackup = async () => {
      try {
        const r = await fetch('/api/backup/download', { headers: { Authorization: 'Bearer ' + App.token() } });
        if (!r.ok) throw new Error('Não consegui gerar a cópia.');
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jaques-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        App.toast('Cópia baixada — guarde este arquivo em lugar seguro', 'ok');
      } catch (e) { App.toast(e.message, 'err'); }
    };

    Adm.restaurarBackup = () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.onchange = async () => {
        const arq = inp.files && inp.files[0];
        if (!arq) return;
        let banco;
        try {
          banco = JSON.parse(await arq.text());
        } catch (e) { return App.toast('Este arquivo não é um backup do sistema.', 'err'); }

        const qtd = c => Array.isArray(banco[c]) ? banco[c].length : 0;
        const okir = await App.confirm(
          `<b>${App.esc(arq.name)}</b> contém ${qtd('clients')} cliente(s), ` +
          `${qtd('serviceOrders')} ordem(ns) de serviço e ${qtd('users')} usuário(s).<br><br>` +
          'Isto <b>substitui</b> todos os dados que estão aqui agora. Uma cópia do que existe ' +
          'hoje é guardada automaticamente antes da troca.<br><br>' +
          'Depois de restaurar, você precisa entrar de novo — com o usuário e a senha de onde o arquivo veio.',
          { html: true });
        if (!okir) return;

        try {
          const r = await App.post('/backup/restore', { banco });
          App.toast(`Restaurado: ${r.clientes} cliente(s), ${r.usuarios} usuário(s). Entre de novo.`, 'ok');
          setTimeout(() => App.logout(), 2500);
        } catch (e) { App.toast(e.message, 'err'); }
      };
      inp.click();
    };

    Adm.testAI = async () => {
      const out = document.getElementById('cfg-ai-result');
      out.innerHTML = '<span class="muted">Testando conexão…</span>';
      try {
        const r = await App.post('/assistant/test', {
          provider: document.getElementById('cfg-ai-provider').value,
          model: document.getElementById('cfg-ai-model').value.trim(),
          key: document.getElementById('cfg-ai-key').value.trim()
        });
        out.innerHTML = `<span style="color:var(--ok)">✓ Funcionando (${App.esc(r.model)})</span>
          — <span class="muted">${App.esc(r.answer)}</span>`;
      } catch (e) {
        out.innerHTML = `<span style="color:var(--danger)">✗ ${App.esc(e.message)}</span>`;
      }
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
