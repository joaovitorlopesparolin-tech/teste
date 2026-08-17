# Fluxo automatizado: Revit → Aplicativo de Obra

O objetivo é acabar com a digitação manual. Tudo que o aplicativo precisa saber
sobre uma prancha (número, título, revisão, data, o que mudou, autor) **já está
dentro do Revit**, nas folhas. Este fluxo tira essas informações de lá
automaticamente.

## Como fica o dia a dia

Quando você emitir uma revisão:

1. No Revit, clique em **Publicar Pranchas** (aba *Martins Notari*).
2. Escolha as pranchas, o que exportar (PDF/DWG/DXF) e a pasta da obra.
   O Revit gera os arquivos já com o nome no padrão
   (`VilaNord_ARQ_001_R04.pdf`) e um arquivo `manifesto_pranchas.json`.
   O DXF é o que o visualizador do app abre — exporte sempre que quiser
   ver o desenho no navegador.
3. Abra o aplicativo em modo **Engenharia** e clique em
   **⬆ Importar do Revit**, escolhendo o `manifesto_pranchas.json`.

Pronto: as pranchas novas entram liberadas, as revisões anteriores são marcadas
como **superadas** automaticamente, disciplinas novas entram na lista e obras
novas são criadas sozinhas. O canteiro passa a ver só a revisão válida.

São 3 cliques no Revit + 1 clique no app. Sem digitar nada.

## Instalação (uma vez só)

### 1. Instalar o pyRevit (gratuito)

1. Baixe o instalador em <https://github.com/pyrevitlabs/pyRevit/releases>
   (arquivo `pyRevit_x.x.x_signed.exe`).
2. Instale com o Revit fechado. Ao abrir o Revit, aparece a aba *pyRevit*.

### 2. Instalar a extensão Martins Notari

1. Copie a pasta `revit/MartinsNotari.extension` deste repositório para uma
   pasta fixa no computador (ex.: `C:\pyRevit-extensoes\MartinsNotari.extension`).
2. No Revit: aba **pyRevit → Settings → Custom Extension Directories**, adicione
   `C:\pyRevit-extensoes` e clique em **Save Settings and Reload**.
3. A aba **Martins Notari** aparece no Revit com dois botões:
   - **Conferir Nomenclatura** — confere as folhas sem exportar nada.
   - **Publicar Pranchas** — exporta PDF/DWG + manifesto.

### 3. Preparar cada modelo Revit (uma vez por obra)

Em **Gerenciar → Informações do Projeto**:

| Campo no Revit | O que colocar | Exemplo |
|---|---|---|
| Número do projeto | Código da obra (o mesmo do app) | `20001` |
| Nome do edifício | Nome da obra | `Vila Nord` |

E nas folhas:

- **Número da folha** no formato `SIGLA-NNN`: `ARQ-001`, `EST-010`, `HID-100`…
  (siglas da tabela do Guia de Nomenclatura v2.2).
- **Revisões numéricas** (Gerenciar → Revisões → numeração por *números*).
  A revisão atual da folha vira o `RXX` do arquivo. Folha sem revisão sai como
  `R00`.
- A **descrição da revisão** no Revit vira a observação "o que mudou" que
  aparece na tarja amarela do app. Vale a pena preencher.
- O campo **Desenhado por** vira o autor no app.

Rode **Conferir Nomenclatura** para ver o que falta ajustar — ele lista folha
por folha com a sugestão de renumeração.

## O manifesto

O `manifesto_pranchas.json` é um arquivo pequeno gerado junto com os PDFs/DWGs.
É ele que o app lê. Formato:

```json
{
 "formato": "mn-manifesto-v1",
 "obra": {"id": "20001", "nome": "Vila Nord", "arquivo": "VilaNord"},
 "pranchas": [
  {"num": "ARQ-001", "titulo": "Planta baixa — Pavimento Tipo",
   "sigla": "ARQ", "disc": "Arquitetônico", "rev": "R04",
   "data": "12/06/2026", "autor": "Eng. Marcelo",
   "obs": "Alteradas as esquadrias da fachada oeste",
   "arquivo": "VilaNord_ARQ_001_R04"}
 ]
}
```

Regras aplicadas na importação:

- Prancha nova → entra **liberada**; a revisão vigente anterior do mesmo número
  vira **superada** (no modo automático; no manual, você marca a válida).
- Mesma prancha + mesma revisão já cadastrada → só atualiza título/autor/
  observação. Importar duas vezes não duplica nada.
- Revisão **mais antiga** que a vigente → entra direto no histórico como
  superada (útil para carregar o passivo de revisões antigas).
- Disciplina desconhecida → é criada na lista de tipos de projeto.
- Obra que não existe no app → é criada (depois configure cidade/senha).

Para testar sem o Revit: importe `docs/exemplo/manifesto_pranchas.json` no app
(modo Engenharia, senha do protótipo `1234`). Ele libera a `ARQ-001 R05`
superando a R04 da base de demonstração.

## Enquanto não há servidor: backup em arquivo

Os dados do app continuam vivendo na memória da página (regra do protótipo —
nada de localStorage). Para não perder nada entre um dia e outro:

- **⬇ Salvar dados (backup)** baixa um `mn-dados-AAAA-MM-DD.json` com tudo
  (obras, tipos, pranchas). Guarde na pasta da obra.
- **⬆ Importar do Revit / restaurar backup** aceita tanto o manifesto do Revit
  quanto esse backup — ele detecta o formato sozinho.

Rotina sugerida: abrir o app → restaurar o último backup → importar manifestos
novos → salvar backup. Quando a integração com SharePoint/Graph API entrar
(plano já definido), esse passo desaparece.

## Visualizador embutido (PDF e DXF)

Os botões **Abrir PDF** e **Ver DWG** dos cards agora abrem um visualizador de
verdade, dentro do próprio app, sem internet e sem programa instalado:

- **PDF** — renderizado pelo pdf.js (funciona também no celular/tablet, onde o
  navegador não abre PDF embutido sozinho). Zoom com dois dedos ou roda do
  mouse, arrastar para mover.
- **DXF** — desenho CAD renderizado em WebGL (dxf-viewer). O card "Ver DWG"
  abre o **DXF** da prancha, que o botão do Revit exporta junto com o DWG.
  DWG binário não abre em navegador sem serviço pago (Autodesk APS) — para
  DWG de terceiros, converta grátis com o **ODA File Converter**
  (opendesign.com) ou peça o DXF ao projetista.
- **📏 Medir** — toque em dois pontos e informe a escala da prancha
  (ex.: 1:50): o app mostra a distância no papel e a distância real
  (no DXF, os milímetros do desenho × escala). Confira sempre com uma cota
  conhecida da prancha antes de confiar na medida.
- O app mostra o **nome de arquivo esperado** (ex.: `VilaNord_ARQ_001_R05.pdf`)
  para você achar rápido na pasta da obra.

O app também ganhou **modo escuro** (botão 🌙 no topo) e a logo da Martins
Notari no cabeçalho. Por causa do visualizador embutido, o arquivo HTML tem
cerca de 4 MB — continua um arquivo único que funciona offline.

## Perguntas prováveis

**Preciso do Revit novo?** A exportação de PDF nativa exige Revit 2022 ou mais
recente. DWG, DXF e manifesto funcionam em qualquer versão com pyRevit. Em
Revit mais antigo, o botão oferece DWG/DXF + manifesto.

**E projetos que não são meus (estrutural, hidráulica de terceiros)?** Dois
caminhos: (a) se vier `.rvt`, abra no seu Revit e publique do mesmo jeito;
(b) se vier só PDF/DWG, renomeie no padrão e cadastre pelo formulário do app
como hoje — ou peça os arquivos já no padrão (o guia de nomenclatura serve
justamente para mandar aos projetistas parceiros).

**O DWG saiu com nome estranho?** O script exporta numa pasta temporária e
renomeia para o padrão — se algum aviso aparecer no relatório final, ele diz
qual prancha olhar.

**Posso publicar só o manifesto, sem gerar arquivos?** Sim — opção
"Só manifesto" no botão. Útil para atualizar o app quando os PDFs já existem.

## Próximos passos (fora deste fluxo)

1. Migração dos arquivos para SharePoint e Lista do SharePoint como banco de
   dados do app via Microsoft Graph (plano descrito no documento de
   continuidade). O manifesto continua igual — só muda quem guarda os dados.
2. Renomeação em lote das centenas de arquivos antigos com o Claude Code
   (de-para com revisão humana).
3. Abertura automática dos arquivos — hoje o visualizador pede para escolher
   o arquivo (o navegador não pode ler pastas sozinho); quando o app estiver
   no SharePoint, o nome-base que já viaja no manifesto (`arquivo`) permite
   abrir o PDF/DXF direto pelo link, sem escolher nada.
