# Monitor de Editais — etapa 1

Coleta editais do PNCP e grava num banco local, declarando quanto da coleta
realmente respondeu. **Ainda não tem interface**: esta etapa existe para tirar o
risco técnico do caminho e provar que o porte traz os mesmos editais que o
`retrato-pncp.ps1`.

A proposta completa, com as telas desenhadas e o plano das seis etapas, está em
<https://claude.ai/code/artifact/3d0c86da-b9c1-4aa5-a36e-d0599be60e4f>.

## Instalar

Precisa de Python 3.11 ou mais novo.

```bash
cd monitor-editais
python3 -m pip install -r requirements.txt
```

## Usar

```bash
# confere se a API responde e mostra um registro cru
python3 -m app.coletar --amostra

# coleta de verdade
python3 -m app.coletar --meses 1
python3 -m app.coletar --meses 6 --csv dados/editais-pncp.csv
python3 -m app.coletar --meses 6 --uf-inteira --com-dispensa
```

Tudo fica em `dados/monitor.sqlite3`. Backup é copiar esse arquivo.

O código de saída é **0** quando a coleta foi completa e **2** quando ficou
parcial — dá para usar em tarefa agendada sem ler a tela.

## Conferir contra o PowerShell

Rode os dois na mesma janela de datas e compare a linha `obra / engenharia`:

```bash
python3 -m app.coletar --meses 6 --csv dados/comparar.csv
.\retrato-pncp.ps1 -Meses 6
```

O `--csv` sai com ponto e vírgula e BOM, então abre no Excel em português sem
passo de importação — igual ao arquivo que o PowerShell já gera.

## O que esta etapa garante

* **UTF-8 lido dos bytes**, ignorando o que o cabeçalho diz. O PNCP já anunciou
  charset errado, e texto corrompido faz o filtro de município devolver zero em
  silêncio.
* **Cobertura declarada.** `contar_editais` devolve uma `Contagem`, não um
  `int`: número de coleta parcial se apresenta como `≥ 1.284`, porque coleta com
  falha só pode subestimar.
* **Toda desistência vira registro**, com a janela, a modalidade e a página que
  ela cobria — inclusive bater no teto de páginas, que no PowerShell só gerava um
  aviso na tela.
* **Erro 429 não trava mais.** No original a repetição não tinha contador; com
  limite de taxa persistente o script esperava cinco segundos para sempre.
* **Grava a cada janela.** Interromper com Ctrl+C não custa o que já veio.

## O que ainda não existe

Interface, score de relevância, filtros na tela, configuração visual e o
assistente de primeira execução. São as etapas 2 a 6.

O `app/filtro_legado.py` reproduz o filtro binário atual **só para conferência**.
Ele descarta o edital no primeiro termo negativo, antes de olhar qualquer termo
positivo — então "Reforma da UBS Vila C, incluindo aquisição de material" some
por causa de "aquisicao de material". O relatório final aponta quantos editais
caíram assim, para medir o tamanho do problema antes da etapa 4 substituir isso
por pontuação.

## Testes

```bash
cd monitor-editais
python3 -m unittest discover -s testes -t . -v
```

63 testes, nenhum toca a rede: o PNCP é simulado com `httpx.MockTransport`.
Os que mais importam são os que fixam os defeitos já corrigidos — se algum deles
falhar, um problema conhecido voltou.
