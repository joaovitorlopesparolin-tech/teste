"""Valores iniciais, portados do retrato-pncp.ps1 sem alteração de conteúdo.

Na etapa 5 tudo isto passa a morar no banco e a ser editado na tela. Enquanto
não há tela, ficam aqui — e ficam explicitamente marcados como *iniciais*, para
ninguém tratar esta lista como verdade estabelecida. Ela é um chute informado
que a primeira coleta vai obrigar a corrigir.
"""

UF = "PR"
DIAS_POR_JANELA = 10

REGIAO = (
    "Foz do Iguaçu", "Santa Terezinha de Itaipu", "São Miguel do Iguaçu",
    "Itaipulândia", "Medianeira", "Matelândia", "Céu Azul", "Missal",
    "Ramilândia", "Serranópolis do Iguaçu", "Vera Cruz do Oeste", "Santa Helena",
    "Marechal Cândido Rondon", "Toledo", "Cascavel", "Guaíra",
)

# 44 termos. "constru" já cobre "construcao"; a redundância veio do original e
# foi mantida para a contagem bater com a do PowerShell na conferência.
POSITIVAS = (
    "obra", "reforma", "construcao", "constru", "pavimenta", "recapeamento",
    "drenagem", "terraplen", "edifica", "engenharia", "ampliacao", "recuperacao",
    "revitaliza", "saneamento", "esgot", "rede de agua", "ponte", "passarela",
    "galpao", "quadra", "ubs", "creche", "escola", "praca", "calcada",
    "meio-fio", "meio fio", "sarjeta", "muro", "cobertura", "telhado",
    "estrutura metalica", "alvenaria", "instalacao eletrica",
    "instalacao hidraulica", "iluminacao publica", "sinalizacao viaria",
    "asfalt", "concretagem", "fundacao", "poco artesiano", "estacao elevatoria",
    "barracao", "urbanizacao",
)

# 22 termos.
NEGATIVAS = (
    "aquisicao de material", "aquisicao de materiais", "fornecimento de material",
    "locacao de", "aluguel de", "material de construcao", "generos alimenticios",
    "combustivel", "medicamento", "material de expediente", "curso de",
    "capacitacao", "seguro", "coleta de lixo", "servico de limpeza",
    "manutencao de veiculo", "software", "licenca de uso", "consultoria juridica",
    "concurso publico", "processo seletivo", "mao de obra terceirizada",
)
