"""Motor de Auditoria de Suprimentos (MAS).

Dois fluxos interdependentes:

* ``mas.indexacao`` — converte diretrizes brutas do setor de compras em nós de
  conhecimento Markdown com frontmatter YAML e wikilinks.
* ``mas.auditoria`` — audita uma Solicitação de Compra contra o nó indexado e
  o histórico de faturamento do Sienge, devolvendo o JSON de protocolo.
"""

from mas.auditoria import auditar
from mas.conhecimento import BaseConhecimento, carregar_no
from mas.indexacao import indexar

__all__ = ["auditar", "indexar", "BaseConhecimento", "carregar_no"]
__version__ = "1.0.0"
