# Migração dos apps do Surge para o VPS

Tirar os apps da Martins Notari da hospedagem gratuita (`*.surge.sh`) e colocá-los
em subdomínios próprios no VPS Hostinger, onde o painel financeiro já roda.

**Por que vale a pena:** `surge.sh` é domínio grátis e é exatamente o tipo de
endereço que firewall corporativo bloqueia. Além disso, um deploy no Surge pode
ser removido sem aviso. O VPS já está no ar, com HTTPS automático e sobra de
recurso.

**O que NÃO muda:** o Supabase continua sendo o banco e o login. Os dados e as
decisões já estão lá — não há nada para migrar de banco.

---

## 1 · Inventário — tem mais app do que parece

Cada "app" é na verdade uma **casca** (login + sincronização) que carrega outro
app dentro de um iframe. Migrar só a casca não adianta: ela continua apontando
para o Surge.

| Hoje | Vira |
|---|---|
| `gestao-compras-marv.surge.sh` | `compras.martinsnotari.com.br` |
| `pedidos-ppc-marv.surge.sh` | `pedidos-ppc.martinsnotari.com.br` |
| `gestao-marv.surge.sh` | `gestao.martinsnotari.com.br` |
| *(os apps internos do Gestão MARV — inventariar, ver abaixo)* | |

### Como descobrir os apps escondidos, em 30 segundos

Abra o app no navegador, aperte **Ctrl+U** (ver código-fonte) e procure por
`surge.sh`. Cada endereço que aparecer é um app que também precisa migrar.

Foi assim que o `pedidos-ppc-marv` apareceu: ele não estava em nenhuma lista,
só dentro do HTML da casca de compras, nesta linha:

    data-src="https://pedidos-ppc-marv.surge.sh/?v=20260925a"

---

## 2 · DNS — com o Fábio

Um registro **A** por subdomínio, no Registro.br, apontando para o IP do VPS
(está na ficha "Servidor VPS MARV"). Fazer isso primeiro: o Caddy só consegue
emitir o certificado depois que o DNS estiver propagado.

## 3 · A edição no código — uma linha por casca

Na casca, trocar o endereço do iframe do Surge pelo subdomínio novo.
Em `gestao-compras-marv` é exatamente esta linha:

    data-src="https://pedidos-ppc-marv.surge.sh/?v=20260925a"
    →
    data-src="https://pedidos-ppc.martinsnotari.com.br/?v=20260925a"

**Conferir também** se `manifest.webmanifest` e `icon-192.png` estão com
endereço absoluto apontando para o Surge. Se estiverem, trocar para caminho
relativo (`manifest.webmanifest`), senão o app instalado continua preso ao
escopo antigo.

Não mexer em mais nada. O resto do código (`sw.js`, `versao.txt`, Supabase)
funciona igual no endereço novo.

## 4 · Servidor — com o João

Uma pasta por site em `/opt/`, e os blocos do `Caddyfile` deste diretório.

    sudo caddy validate --config /etc/caddy/Caddyfile
    sudo systemctl reload caddy

## 5 · Supabase — o passo que quebra tudo se esquecerem

Em **Authentication → URL Configuration**, acrescentar os endereços novos às
**Redirect URLs**.

O código manda o link de recuperação de senha para `location.origin`. Sem isso,
o "Esqueci minha senha" para de funcionar no domínio novo e ninguém entende o
motivo.

## 6 · Derrubar o Surge — não deixar os dois no ar

Os dois endereços gravam na **mesma linha** da tabela `estados` do Supabase.
Rodando em paralelo, uma máquina sobrescreve a outra.

Em vez de apagar o site do Surge, substituir o conteúdo pelo
`redirect-surge/index.html` deste diretório. Ele desliga o service worker
antigo, limpa o cache e leva a pessoa para o endereço novo — necessário para
quem tem o app instalado, que senão continua abrindo a versão velha para sempre.

## 7 · Avisar a equipe

Quem tem o app instalado precisa **desinstalar e instalar de novo** pelo
endereço novo. Mensagem curta no grupo resolve.

---

## Conferência final

- [ ] Entrar com e-mail e senha — login do Supabase respondendo
- [ ] A lista de pedidos aparece
- [ ] As decisões antigas ("Pra encerrar", "Resolvidos") estão lá — se estiverem,
      o Supabase está sincronizando e a migração deu certo
- [ ] "Esqueci minha senha" envia o e-mail e o link abre no domínio novo
- [ ] Na máquina do Adriel, a aba **Conector** abre normalmente
- [ ] O endereço antigo do Surge redireciona

---

## O que esta migração NÃO resolve

**O Conector continua na máquina do Adriel.** Ele roda em `http://127.0.0.1:8791`,
que é endereço da própria máquina — não muda nada quando o site troca de domínio,
e continua funcionando igual. Mas o escritório segue dependendo daquele
computador estar ligado para os dados serem atualizados.

É um problema separado, e a solução é a mesma que o painel financeiro já usa:
o Conector virar um serviço no VPS, sincronizando sozinho. Para avaliar isso é
preciso ver a pasta `sienge-conector` (máquina do Adriel) — se ele usa a API do
Sienge, é tranquilo; se automatiza a tela do Sienge, dá bem mais trabalho.

**O backup do VPS não cobre estes apps.** Os dados estão no Supabase, não no
servidor. Vale conferir que backup o plano do Supabase oferece.
