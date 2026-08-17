# Conta Azul — integração pela API oficial

O **sistema próprio continua sendo a ferramenta principal da oficina**
(entrada de cabeçotes, orçamentos, OS, produção, estoque, pendências,
etiquetas). A Conta Azul fica com o lado **financeiro e fiscal**. A
integração liga os dois; não substitui nenhum dos dois.

## Endereços oficiais

Da documentação pública da Conta Azul (API v2, lançada em março/2025):

| | |
|---|---|
| Portal do desenvolvedor | `portaldevs.contaazul.com` |
| Documentação | `developers.contaazul.com` |
| Autorização | `https://auth.contaazul.com/oauth2/authorize` |
| Token | `https://auth.contaazul.com/oauth2/token` |
| API | `https://api-v2.contaazul.com` |
| Escopo | `openid profile aws.cognito.signin.user.admin` |

Autenticação: **OAuth 2.0, fluxo Authorization Code**. A versão legada da
API foi substituída por esta.

## Por que não precisa publicar o sistema na internet

O endereço de retorno do OAuth **pode ser `localhost`**. A autorização
acontece no navegador do usuário, que é redirecionado de volta para o
próprio sistema rodando na máquina. Depois disso, todas as chamadas são de
**saída** — o sistema fala com a Conta Azul, e nunca o contrário. Por isso
a integração funciona no computador da oficina, sem endereço público.

## O que já está pronto

### Conexão (`lib/contaazul.js`)

| Função | Para que serve |
|---|---|
| `urlAutorizacao()` | monta o endereço da tela de autorização, com `state` de uso único |
| `consumirState(s)` | valida o retorno; cada `state` vale uma vez e por 10 minutos |
| `trocarCodigo(code)` | troca o código pelos tokens |
| `renovar()` | renova pelo refresh token |
| `tokenValido()` | devolve um token válido, renovando sozinho antes de vencer |
| `chamar(caminho)` | chamada autenticada, com uma repetição automática em caso de 401 |
| `quemSou()` | identifica a conta conectada (userInfo do OpenID) |
| `status()` | resumo para a tela, **sem segredo e sem tokens** |

### Tela (Administração → Configurações → 🔗 Conta Azul)

Campos de Client ID / Client Secret / endereço de retorno, botão
**Conectar**, **Testar conexão** e **Desconectar**.

### Segurança

- Client Secret e tokens ficam **só no servidor** (`data/db.json`); o
  `GET /api/settings` remove o bloco inteiro antes de responder.
- A rota de retorno (`/api/contaazul/callback`) é aberta por necessidade —
  quem chega nela vem de fora, sem sessão. Quem faz o papel de credencial é
  o `state`: gerado só aqui, de uso único, com validade de 10 minutos.
- A senha da Conta Azul nunca passa pelo sistema: quem a digita é o
  usuário, na tela da própria Conta Azul.

### Registro de correspondência (`syncRefs`, `lib/sync.js`)

Já existente, é o que **evita duplicidade** quando a sincronização entrar:

```
{ sistema: 'contaazul', entidade: 'clients', idLocal: 12,
  idExterno: 'abc-123', hash: 'a1b2c3…', sincronizadoEm: '…', status: 'ok' }
```

`idLocal` ↔ `idExterno` garante que um cliente daqui nunca vire dois lá; o
`hash` evita reenviar o que não mudou.

## O que ainda falta

**A sincronização das entidades** (clientes, produtos, vendas, contas a
pagar e a receber) ainda não foi escrita, e por um motivo específico: para
montar o mapa de campos é preciso o caminho exato de cada recurso e o nome
exato de cada campo na documentação oficial — e o ambiente onde este
código foi desenvolvido não alcança `developers.contaazul.com`. Escrever
por suposição contraria a regra combinada de usar **somente** o que estiver
oficialmente documentado.

O caminho para destravar isso já está no sistema:

**`POST /api/contaazul/explorar`** (administrador, só GET, não altera nada
na Conta Azul) faz uma leitura de qualquer recurso e mostra a resposta
crua. Com a conta conectada, é assim que se confirma o formato real de
cada recurso antes de escrever o mapa de campos.

Depois disso, por entidade:

1. mapa de campos (de/para);
2. sentido da sincronização (só envia, só recebe ou os dois);
3. o que fazer em caso de conflito;
4. marcar cada registro com `sync.marcar(...)`;
5. tela de acompanhamento: pendentes, últimos envios e erros.

## Sobre publicar como "extensão"

A Conta Azul tem um programa de **extensões** — integrações publicadas na
plataforma deles, listadas para outros clientes. Elas são construídas sobre
esta mesma API oficial. Ou seja: o módulo feito aqui é a base do que um dia
poderia virar uma extensão publicada; não são caminhos concorrentes.

(O guia de extensões deles fica em `developers.contaazul.com/extension-guide`
— não foi possível lê-lo daqui.)

## Cuidados que a estrutura respeita

- **Sem duplicidade**: a correspondência é verificada antes de qualquer envio.
- **Rastreável**: dá para saber o que já foi sincronizado e quando.
- **Reversível**: apagar um registro de `syncRefs` só faz o item voltar
  para "pendente"; nenhum dado operacional se perde.
- **Independente**: com a integração desligada ou fora do ar, o sistema
  funciona normalmente — nada aqui depende dela.
