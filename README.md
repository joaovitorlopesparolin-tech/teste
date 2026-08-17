# Projetos Liberados — Martins Notari

Sistema de controle de pranchas para obra: garante que o canteiro só veja a
**revisão válida** de cada prancha, com publicação **automatizada a partir do
Revit** — sem digitar nada no app.

## O fluxo

```
Revit (folhas com revisões)
   │  botão "Publicar Pranchas" (extensão pyRevit)
   ▼
Pasta da obra: VilaNord_ARQ_001_R04.pdf/.dwg  +  manifesto_pranchas.json
   │  botão "⬆ Importar do Revit" (app, modo Engenharia)
   ▼
Aplicativo de obra — revisões anteriores superadas automaticamente,
canteiro vê só o que vale.
```

## O que tem neste repositório

| Pasta | Conteúdo |
|---|---|
| [`app/projetos_obra.html`](app/projetos_obra.html) | O aplicativo (arquivo único — funciona no celular, tablet e computador, offline). Importação de manifesto do Revit, backup/restauração em arquivo, **visualizador embutido de PDF e DXF com zoom e medição por escala**, modo escuro e logo Martins Notari. |
| [`revit/`](revit/) | Extensão pyRevit com os botões **Conferir Nomenclatura** e **Publicar Pranchas**. |
| [`docs/FLUXO_REVIT_APP.md`](docs/FLUXO_REVIT_APP.md) | Guia completo: instalação, preparação do modelo, rotina de publicação, perguntas prováveis. |
| [`docs/exemplo/manifesto_pranchas.json`](docs/exemplo/manifesto_pranchas.json) | Manifesto de exemplo para testar a importação no app sem precisar do Revit. |

## Começando em 2 minutos (sem Revit)

1. Abra `app/projetos_obra.html` no navegador.
2. Entre no modo **Engenharia** (senha do protótipo: `1234`).
3. Clique em **⬆ Importar do Revit** e escolha
   `docs/exemplo/manifesto_pranchas.json`.
4. Veja a `ARQ-001 R05` entrar liberada e a `R04` virar superada sozinha.

## Padrão de nomenclatura

Os arquivos seguem o Guia de Nomenclatura v2.2:
`Obra_SIGLA_NNN_RXX.ext` (ex.: `VilaNord_ARQ_001_R04.pdf`). A tabela de siglas
está embutida no app e nos scripts do Revit.

## Próximas etapas planejadas

1. Persistência real no SharePoint (Lista + biblioteca de documentos, via
   Microsoft Graph) — o manifesto já foi desenhado para esse futuro.
2. Renomeação em lote dos arquivos antigos.
3. Abertura automática de PDF/DXF pelo link do SharePoint (o visualizador já
   existe; hoje o usuário escolhe o arquivo da pasta da obra).
