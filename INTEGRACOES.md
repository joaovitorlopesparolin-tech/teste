# Integrações externas — preparação (Conta Azul)

Este documento descreve **como o sistema está preparado** para uma futura
integração com a **Conta Azul**, sem que nada seja enviado para fora hoje.

## Princípio

O **sistema próprio continua sendo a ferramenta principal de gestão
operacional** da empresa (entrada de cabeçotes, orçamentos, OS, produção,
estoque, pendências, etiquetas). A Conta Azul, quando integrada, permanece
como ferramenta **financeira/fiscal** — nunca substitui o sistema.

## O que já existe

### 1. Registro de correspondência (`syncRefs`)

Cada registro local pode ter um "espelho" no sistema externo. A tabela
`syncRefs` guarda essa ligação — é ela que **evita duplicidade**:

```
{ sistema: 'contaazul', entidade: 'clients', idLocal: 12,
  idExterno: 'abc-123', hash: 'a1b2c3…', sincronizadoEm: '2026-08-14T…',
  status: 'ok' | 'erro', mensagem: '' }
```

- `idLocal` ↔ `idExterno`: um cliente daqui nunca vira dois lá.
- `hash`: impressão digital do registro. Se nada mudou desde o último envio,
  não há motivo para reenviar; se mudou, o registro aparece como pendente.

### 2. Funções de apoio (`lib/sync.js`)

| Função | Para que serve |
|---|---|
| `pendente(sistema, entidade, registro)` | O registro precisa ser enviado? (novo ou alterado) |
| `pendencias(sistema)` | Lista, por entidade, tudo que está pendente |
| `marcar(sistema, entidade, idLocal, idExterno, registro)` | Registra que foi sincronizado |
| `find(sistema, entidade, idLocal)` | Recupera a correspondência de um registro |

### 3. Consulta de estado

`GET /api/sync/status` (perfil Administrador) devolve o panorama:
quantos registros de cada entidade estão pendentes e quantos já foram
sincronizados.

## Entidades previstas

`clients` · `suppliers` · `products` · `serviceCatalog` · `sales` ·
`serviceOrders` · `payables` · `receivables` · `cashflow` (baixas e
pagamentos). Notas fiscais entram junto com o módulo fiscal, quando houver.

## O que falta para ligar de verdade

1. **Conferir a documentação oficial vigente** da API da Conta Azul —
   autenticação (OAuth), endpoints, campos obrigatórios e limites de uso
   mudam com o tempo. Usar **somente** o que estiver oficialmente
   documentado.
2. Cadastrar as credenciais (client id/secret) em Administração →
   Configurações, no mesmo padrão da chave de IA: **guardadas apenas no
   servidor**, nunca no navegador.
3. Implementar, por entidade, o mapa de campos (de/para) e a chamada de
   envio/recebimento, marcando cada registro com `sync.marcar(...)`.
4. Definir o sentido da sincronização por entidade (só envia, só recebe ou
   dois sentidos) e o que fazer em caso de conflito.
5. Tela de acompanhamento: pendentes, últimos envios e erros por registro.

## Cuidados que a estrutura já respeita

- **Sem duplicidade**: nada é enviado duas vezes por engano — a
  correspondência é verificada antes.
- **Rastreável**: dá para saber exatamente o que já foi sincronizado e
  quando.
- **Reversível**: apagar um registro de `syncRefs` apenas faz o item voltar
  para "pendente"; nenhum dado operacional é perdido.
- **Independente**: se a integração estiver desligada ou fora do ar, o
  sistema funciona normalmente — nada aqui depende dela.
