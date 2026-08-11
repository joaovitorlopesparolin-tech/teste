# Como colocar o sistema no ar — Jaques Motorsport

Este guia mostra as duas formas de usar o sistema na empresa, da mais simples à
mais completa. Em ambas, o único requisito é o **Node.js 18 ou superior**
(gratuito) — o sistema não precisa de banco de dados nem de mais nada.

**Onde ficam os dados:** tudo é gravado no arquivo `data/db.json`, na pasta do
sistema. O próprio sistema cria **um backup por dia** em `data/backups/`
(mantém os últimos 30 dias).

---

## Opção A — Computador da empresa (rede local)

A forma mais simples: o sistema roda em um computador da oficina (pode ser o
mesmo do escritório) e todos acessam pelo navegador, inclusive pelo celular,
usando o Wi-Fi da empresa. Não paga nada por mês e os dados ficam dentro da
empresa.

### Passo a passo (Windows) — 2 passos

1. **Descompacte o sistema** em uma pasta fixa, por exemplo `C:\jaques-sistema`.
2. **Dê dois cliques em `INSTALAR.bat`** (na raiz da pasta). Ele faz tudo:
   - instala o Node.js sozinho se não existir (ou abre o site certo se não conseguir);
   - configura o sistema para rodar **invisível** e **iniciar junto com o Windows**;
   - cria o atalho **“Sistema Jaques Motorsport”** na Área de Trabalho;
   - abre o navegador em `http://localhost:3000` — login `admin` / `admin123`
     (troque a senha imediatamente).

Não é preciso abrir prompt de comando, nem deixar janela nenhuma aberta.

**Acesse dos outros computadores/celulares**: descubra o IP do computador
(no `cmd`, digite `ipconfig` e procure "Endereço IPv4", ex.: `192.168.0.10`).
Nos demais aparelhos conectados no mesmo Wi-Fi, acesse
`http://192.168.0.10:3000`. Salve nos favoritos / tela inicial do celular.
- Se não abrir, libere a porta no firewall do Windows (Painel de Controle →
  Firewall → Configurações avançadas → Regras de entrada → Nova regra →
  Porta TCP 3000 → Permitir).

### Atalhos avançados (pasta `windows/`)

O `INSTALAR.bat` já faz tudo, mas a pasta `windows/` tem os controles avulsos:

| Arquivo (dois cliques) | O que faz |
|---|---|
| `iniciar-sistema.vbs` | Inicia agora, em segundo plano (sem janela nenhuma) |
| `parar-sistema.bat` | Para o sistema |
| `iniciar-sistema-visivel.bat` | Inicia com a janela visível (útil para ver erros) |
| `instalar-inicio-automatico.bat` | Só o início automático (parte do que o INSTALAR faz) |
| `remover-inicio-automatico.bat` | Desfaz o início automático |

### Passo a passo (Linux)

```bash
sudo apt install -y nodejs git          # (Node 18+; ou use nodesource)
git clone <url-do-repositorio> /opt/jaques
cd /opt/jaques && npm start
```

Para iniciar automaticamente, crie `/etc/systemd/system/jaques.service`:

```ini
[Unit]
Description=Sistema de Gestao Jaques Motorsport
After=network.target

[Service]
WorkingDirectory=/opt/jaques
ExecStart=/usr/bin/node server.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now jaques
```

**Limitação da Opção A:** o acesso só funciona dentro da empresa (mesmo Wi-Fi).
Para acessar de casa/da pista, use a Opção B.

---

## Opção B — Servidor na nuvem (acesso de qualquer lugar)

Um servidor virtual (VPS) básico custa de **R$ 20 a 40/mês** (Hostinger,
Locaweb, DigitalOcean, Hetzner…) e permite acessar o sistema de qualquer lugar,
com endereço próprio e cadeado de segurança (HTTPS) — **obrigatório** quando o
sistema fica exposto à internet, pois protege as senhas trafegadas.

### Passo a passo (VPS Ubuntu 22.04+)

1. **Contrate o VPS** (1 vCPU e 1 GB de RAM já bastam) e anote o IP.
2. **Aponte um endereço** (opcional, recomendado): no seu provedor de domínio,
   crie um registro A, ex.: `sistema.jaquesmotorsport.com.br` → IP do VPS.
3. **Conecte por SSH e instale tudo:**

   ```bash
   ssh root@SEU_IP

   # Node.js LTS
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs git

   # Sistema
   git clone <url-do-repositorio> /opt/jaques
   cd /opt/jaques

   # PM2 mantém o sistema no ar e reinicia sozinho se cair
   npm install -g pm2
   pm2 start server.js --name jaques
   pm2 save && pm2 startup            # inicia junto com o servidor
   ```

4. **HTTPS com Caddy** (certificado automático e gratuito):

   ```bash
   apt install -y caddy
   ```

   Edite `/etc/caddy/Caddyfile` deixando somente:

   ```
   sistema.jaquesmotorsport.com.br {
       reverse_proxy localhost:3000
   }
   ```

   ```bash
   systemctl reload caddy
   ```

   Pronto: `https://sistema.jaquesmotorsport.com.br` com cadeado, acessível de
   qualquer lugar.

5. **Firewall** (libere só o necessário):

   ```bash
   ufw allow ssh && ufw allow http && ufw allow https && ufw enable
   ```

### Plataformas gerenciadas (Render, Railway, Fly…)

Funcionam, mas exigem **disco persistente** (volume) montado na pasta `data/` —
sem isso, os dados são apagados a cada nova publicação. Se optar por uma
delas, contrate o volume persistente e aponte-o para `/opt/render/project/src/data`
(ou equivalente). Para a maioria dos casos, o VPS da Opção B é mais simples e
previsível.

---

## Backup — não pule esta parte

- O sistema já cria **um backup por dia** em `data/backups/` (30 dias).
- **Uma vez por semana, copie a pasta `data/` para fora do computador/servidor**
  (pen drive, Google Drive, Dropbox). É essa cópia que salva a empresa se o
  disco queimar.
  - No VPS, um jeito prático de automatizar (envia para sua máquina):
    `scp -r root@SEU_IP:/opt/jaques/data ./backup-jaques` — ou use rclone para
    mandar direto ao Google Drive.
- **Restaurar**: pare o sistema, substitua `data/db.json` pelo arquivo de
  backup desejado (ex.: `data/backups/db-2026-08-10.json`, renomeando para
  `db.json`) e inicie de novo.

## Atualizar o sistema (sem perder dados)

Os dados vivem na pasta **`data/`** e o pacote de atualização **não contém**
uma pasta `data` — atualizar nunca toca nos seus dados.

**Windows (via ZIP):**

1. Pare o sistema (`windows\parar-sistema.bat` ou feche a janela).
2. Por segurança, copie a pasta `data` para a Área de Trabalho.
3. Extraia o ZIP novo, abra a pasta extraída (a que contém `server.js`),
   selecione tudo (Ctrl+A), copie e **cole dentro da pasta antiga**
   escolhendo “Substituir os arquivos no destino”.
4. Inicie de novo (`windows\iniciar-sistema.vbs` ou o início automático).

⚠️ Nunca apague a pasta antiga antes de copiar, e nunca passe a usar a pasta
extraída do ZIP como sistema — ela não tem os seus dados.

**Linux / VPS (via git):**

```bash
cd /opt/jaques
git pull
pm2 restart jaques    # ou: systemctl restart jaques
```

## Checklist do primeiro dia

1. Entrar com `admin` / `admin123` e **trocar a senha** (menu → 🔑 Alterar senha).
2. **Criar um usuário para cada colaborador** (Administração → Usuários), no
   perfil certo: Administrador, Financeiro/Administrativo ou Produção.
3. Conferir o **catálogo de serviços** (Administração → Catálogo): completar os
   preços que estão em R$ 0,00.
4. Definir **preço de venda e custo-base** das 6 configurações de cabeçote
   (Produtos e custos).
5. Lançar o **estoque inicial** (Estoque próprio → “+ Entrada” em cada item).
6. Cadastrar os **clientes e fornecedores** reais conforme forem aparecendo —
   ou aos poucos, começando pelos ativos.
7. Ajustar as **contas recorrentes** (Contas a pagar → Contas recorrentes) com
   os dias de vencimento reais de COPEL, Sanepar e consórcio.

## Segurança já incluída

- Senhas guardadas criptografadas (nunca em texto puro).
- Bloqueio automático após 10 tentativas erradas de senha (15 minutos).
- Sessões expiram após 30 dias sem uso.
- Permissões por perfil — produção não vê custos, margens nem salários.
- Registros financeiros não podem ser excluídos, apenas cancelados (auditoria).
