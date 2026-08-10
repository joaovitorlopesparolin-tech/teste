# teste

## Cálculo de concreto das paredes (Revit)

`revit/volume_concreto_paredes.py` levanta o volume de concreto de todas as
paredes de um modelo Revit — responde "quanto de concreto eu gastaria se
fizesse todas as paredes de concreto".

O script **não altera o modelo**. Ele só lê, imprime o relatório e grava um CSV
na Área de Trabalho com uma linha por parede.

### Como rodar (Dynamo — já vem instalado com o Revit)

1. Abra o modelo no Revit
2. Aba **Gerenciar** → **Dynamo** → **New**
3. Arraste um nó **Python Script** para a tela
4. Duplo clique nele, apague o conteúdo e cole o arquivo inteiro
5. **Run**

O resultado aparece no nó e o CSV vai para a Área de Trabalho.

### Como rodar (pyRevit)

Cole no **pyRevit Python Shell**, ou salve como `script.py` dentro de uma pasta
de botão do pyRevit.

### O que ele calcula

Para cada parede: **área líquida × espessura**. A área que o Revit reporta já
desconta portas, janelas e demais aberturas, então o volume sai limpo.

Saída:

- volume total de concreto (m³), com e sem perda
- área de fôrma (m²)
- aço estimado (kg), por taxa de kg/m³
- quebra por nível e por tipo de parede
- volume de concreto já modelado em lajes, pilares, vigas, fundações,
  escadas e telhados
- lista das paredes que ficaram de fora e o motivo

### Ajustes no topo do arquivo

| Parâmetro | Para quê |
|---|---|
| `ESPESSURA_FIXA_M` | `None` usa a espessura real de cada parede. Um número (ex. `0.15`) considera todas com 15 cm — o cenário "refiz tudo em concreto". |
| `INCLUIR_NAO_ESTRUTURAIS` | `True` transforma toda parede em concreto. `False` conta só as já marcadas como estruturais. |
| `TAXA_ACO_KG_M3` | Taxa de armadura. Parede costuma ficar entre 60 e 100 kg/m³. |
| `PERDA_CONCRETO` | Perda sobre o volume teórico. Padrão 5%. |
| `CONSUMO_FORMA` | m² de fôrma por m² de parede. Padrão 2,0 (duas faces). |
| `AREA_MINIMA_M2` | Descarta paredes minúsculas, sujeira de modelagem. |
| `INCLUIR_OUTROS_ELEMENTOS` | Levanta também lajes, pilares, vigas e fundações. |

### Limitações

- **Paredes cortina** ficam de fora: não têm espessura sólida. Aparecem na
  lista de ignoradas.
- **Paredes empilhadas**: só as partes são contadas, nunca o container — senão
  o volume dobraria.
- O volume é geométrico. Não desconta o que a armadura ocupa (irrelevante) nem
  considera juntas, chanfros ou consumo de graute.
- Se o modelo tiver paredes modeladas como massa ou família in-place, elas não
  entram — o script só varre a categoria Paredes.

### Alternativa sem script

Dá para chegar perto sem código: **Vista → Tabelas → Tabela/Quantidades →
Paredes**, adicione os campos *Volume*, *Área*, *Família e tipo*, e marque
*Total geral*. A diferença é que essa tabela usa a espessura real de cada
parede, com todas as camadas do tipo (gesso, isolamento etc.) contadas como se
fossem concreto — por isso o script existe, para você fixar uma espessura de
concreto e separar o que é estrutural do que não é.
