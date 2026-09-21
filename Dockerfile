# Painel Rádio Aurora FM — imagem para deploy (Fly.io / Render)
FROM node:20-slim

WORKDIR /app

# dependências primeiro (aproveita o cache de build)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# código + assets
COPY server ./server
COPY public ./public
COPY assets ./assets

ENV NODE_ENV=production

# HTTP (painel + API + stream + fonte ao vivo embutida)
EXPOSE 3000

CMD ["node", "server/index.js"]