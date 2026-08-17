# Colocar o sistema na nuvem

Hoje o sistema roda no computador da oficina, e por isso esse computador
precisa ficar ligado. Na nuvem, o sistema roda num servidor que já fica
ligado 24 horas por dia. Você e ela abrem o mesmo endereço, de qualquer
lugar, no computador ou no celular.

## O que muda

| | Hoje (computador da oficina) | Na nuvem |
|---|---|---|
| O PC precisa ficar ligado | sim | **não** |
| Acesso de fora da oficina | só com Tailscale | qualquer navegador |
| Atualizar o sistema | `ATUALIZAR.bat` nos dois PCs | **automático** |
| Custo | R$ 0 | cerca de **US$ 5 por mês** (~R$ 28) |
| Quem pode tentar entrar | só quem está na rede | qualquer um que descubra o endereço |

Essa última linha é a única troca ruim, e é por isso que a **senha forte
passa a ser obrigatória** — veja "Antes de sair usando", no fim.

---

## Passo a passo (Railway)

Leva uns 15 minutos. Você faz isso **uma vez só**.

### 1. Criar a conta

Entre em **railway.com** → *Login* → **Login with GitHub**. Use a mesma
conta do GitHub onde está o sistema.

Depois entre em *Account Settings → Plans* e assine o plano **Hobby**
(US$ 5/mês, que já inclui US$ 5 de uso — na prática o sistema cabe nisso).
Sem assinar, o projeto é desligado depois de algumas horas.

### 2. Criar o projeto

*New Project* → **Deploy from GitHub repo** → escolha o repositório
**teste**.

Ele vai começar a construir sozinho. Deixe terminar.

### 3. Apontar para a versão certa

Clique no serviço que apareceu → aba **Settings** → seção *Source*.
Em **Branch**, troque para:

```
claude/jaques-motorsport-system-n3c5td
```

### 4. Criar o disco dos dados — **não pule este passo**

Ainda no serviço, clique com o botão direito na área do projeto →
**Add Volume** (ou *Settings → Volumes → Add Volume*).

Em **Mount path**, digite exatamente:

```
/dados
```

Por que isso importa: toda vez que o sistema é atualizado, o programa é
reinstalado do zero. **Só o que está no disco sobrevive.** Sem esse disco,
cada atualização apagaria clientes, orçamentos e financeiro. Com ele, os
dados ficam separados do programa e não são tocados.

### 5. Gerar o endereço

Aba **Settings** → seção *Networking* → **Generate Domain**.

Aparece um endereço tipo `jaques-motorsport-production.up.railway.app`.
Esse é o endereço do sistema — já vem com cadeado (HTTPS), então tudo que
trafega vai embaralhado.

### 6. Entrar e trocar a senha

Abra o endereço. Entre com **admin / admin123** e **troque a senha na
hora**, no 🔑 do menu.

### 7. Levar os dados reais dela para lá

No computador dela (via AnyDesk), com o sistema aberto:

**Administração → Configurações → 📦 Levar os dados de um lugar para
outro → ⬇ Baixar cópia de tudo**

Guarde o arquivo `jaques-backup-….json`.

Agora no sistema da nuvem, no mesmo lugar:

**⬆ Restaurar de um arquivo** → escolha esse arquivo → confirme.

O sistema mostra quantos clientes e ordens de serviço vieram, guarda
sozinho uma cópia do que havia antes, e pede para você entrar de novo —
agora com **o usuário e a senha que ela usa**, porque os dados são os dela.

### 8. Conferir

Abra o sistema, veja se os clientes e as ordens de serviço estão lá.
Pronto — pode fechar o sistema do PC da oficina.

---

## Antes de sair usando

**Troque as senhas de todo mundo.** Na oficina, uma senha fraca só era um
risco para quem estava na mesma rede. Com o sistema na internet, qualquer
um pode tentar. Use senhas longas, diferentes de outras que vocês usam.

O sistema ajuda: depois de **10 senhas erradas**, aquele endereço fica
**15 minutos bloqueado**, mesmo que acerte a senha depois. E as senhas são
guardadas de um jeito (scrypt) que continua difícil de quebrar mesmo se o
arquivo de dados vazasse.

**Baixe uma cópia de vez em quando.** O botão *⬇ Baixar cópia de tudo* é o
seu seguro. Guarde no Google Drive ou num pendrive. Uma vez por semana já
resolve.

**Onde ficam os dados.** Os servidores da Railway ficam fora do Brasil
(Estados Unidos, por padrão). Para dados internos de uma oficina isso não
costuma ser problema, mas é bom você saber.

---

## Depois que estiver na nuvem

- **Não precisa mais do `ATUALIZAR.bat`.** Quando o sistema muda, a
  Railway reinstala sozinha em 1 ou 2 minutos. Vocês só recarregam a
  página.
- **Não precisa mais do Tailscale.**
- **O PC da oficina pode desligar.**
- Continua tudo em tempo real entre você e ela, como já era.

---

## Se algo der errado

**"Application failed to respond"** — geralmente o disco não foi criado no
caminho certo. Confira em *Settings → Volumes* se o *Mount path* é
exatamente `/dados`.

**Os dados sumiram depois de uma atualização** — é o sinal clássico de
disco faltando ou com caminho errado. Restaure a última cópia baixada
(passo 7) e corrija o disco antes de continuar.

**Não consigo entrar, diz "muitas tentativas"** — é o bloqueio de 15
minutos. Espere e tente de novo, com calma.

---

## Detalhes técnicos

Se um dia outra pessoa mexer nisso, ou você quiser trocar de hospedagem:

- O `Dockerfile` na raiz é a receita do deploy — serve igual na Railway,
  Render, Fly.io ou qualquer serviço que aceite Docker.
- Variáveis de ambiente que o sistema entende:

  | Variável | Para que serve |
  |---|---|
  | `PORT` | porta onde o sistema escuta (a hospedagem define sozinha) |
  | `JAQUES_DATA_DIR` | pasta dos dados — deve apontar para o disco permanente |
  | `JAQUES_TRUST_PROXY` | `1` na nuvem, para o bloqueio de senha enxergar o endereço real de quem tenta |

  As duas últimas já vêm prontas dentro do `Dockerfile`; você não precisa
  configurar nada à mão.
