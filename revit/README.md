# Extensão pyRevit — Martins Notari

Extensão para o [pyRevit](https://github.com/pyrevitlabs/pyRevit) (gratuito)
que cria a aba **Martins Notari** no Revit com dois botões:

| Botão | O que faz |
|---|---|
| **Conferir Nomenclatura** | Confere se as folhas seguem o padrão `SIGLA-NNN` com revisão numérica. Não exporta nada; mostra o que corrigir e a renumeração sugerida. |
| **Publicar Pranchas** | Exporta PDF, DWG e DXF das folhas escolhidas já com o nome no padrão `Obra_SIGLA_NNN_RXX` e gera o `manifesto_pranchas.json` que o aplicativo de obra importa com um clique. O DXF é o formato que o visualizador CAD embutido no app abre direto no navegador. |

## Instalação rápida

1. Instale o pyRevit (instalador em *releases* do link acima).
2. Copie a pasta `MartinsNotari.extension` para, por exemplo,
   `C:\pyRevit-extensoes\`.
3. No Revit: **pyRevit → Settings → Custom Extension Directories** →
   adicione `C:\pyRevit-extensoes` → **Save Settings and Reload**.

Guia completo (preparação do modelo, campos do projeto, rotina de publicação):
[`docs/FLUXO_REVIT_APP.md`](../docs/FLUXO_REVIT_APP.md).

## Requisitos

- PDF nativo: Revit 2022 ou mais recente. Em versões anteriores o botão
  oferece DWG + manifesto.
- O código e o nome da obra são lidos de **Informações do Projeto**
  (Número do projeto / Nome do edifício); se estiverem vazios, o botão
  pergunta na hora.
