# Receita para hospedar o sistema na nuvem (Railway, Render, Fly, etc.).
# No Windows nada disso é usado — lá o sistema roda direto pelo INSTALAR.bat.
FROM node:22-alpine

WORKDIR /app
COPY . .

# Os dados NÃO ficam junto do programa: a cada atualização a hospedagem
# reinstala o programa do zero, e só o disco permanente sobrevive.
# Monte o disco da hospedagem exatamente neste caminho.
ENV JAQUES_DATA_DIR=/dados

# Na nuvem o sistema fica atrás do servidor da hospedagem; isto faz o
# bloqueio por tentativas de senha enxergar o endereço real de quem tenta.
ENV JAQUES_TRUST_PROXY=1

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
