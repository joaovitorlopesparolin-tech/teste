# MAS — convenções do repositório

Motor de Auditoria de Suprimentos: indexa diretrizes do setor de compras em nós
Markdown e audita Solicitações de Compra contra o Sienge. Veja `README.md` para
o contrato completo e `.claude/skills/auditoria-suprimentos/SKILL.md` para as
instruções do agente.

## Regras de trabalho

* Código, identificadores, mensagens e documentação em **português** — as
  mensagens de `motivo_bloqueio`/`acao_corretiva` vão direto para o engenheiro.
* **Sem dependências obrigatórias**: só stdlib. PyYAML é opcional e já tem
  parser de reserva em `mas/frontmatter.py`.
* O **Protocolo de Resposta** tem exatamente três chaves (`status`,
  `motivo_bloqueio`, `acao_corretiva`). Diagnóstico extra só sob `--detalhado`,
  na chave `_diagnostico`.
* Toda regra nova de auditoria entra como um `Divergencia` em `mas/auditoria.py`,
  com `check` registrado em `_ORDEM_CHECKS` (define a ordem dos motivos).
* Parâmetro de negócio (janela, tolerância, teto) mora no frontmatter do nó, não
  no código: o setor de compras muda a diretriz, não o motor.

## Comandos

```bash
python3 -m unittest discover -s tests -t .                      # suíte completa
python3 -m mas --base base_conhecimento listar                  # nós indexados
python3 -m mas --base base_conhecimento auditar exemplos/01-aprovado-concreto.json
for f in diretrizes/*.txt; do                                   # regenerar a base
  python3 -m mas --base base_conhecimento indexar "$f" --saida base_conhecimento --sobrescrever
done
```

Os aliases dos nós versionados (`--alias`) estão registrados no frontmatter; ao
regenerar, repasse-os para não perder o casamento com as descrições do Sienge.
