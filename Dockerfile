# ==========================================
# 🍌 BOTBANANA DOCKER CONTAINER SPEC
# ==========================================

FROM node:20-alpine AS base

# Instalar dependências nativas para áudio e ffmpeg
RUN apk add --no-cache python3 make g++ ffmpeg libsodium-dev

WORKDIR /app

# Copiar arquivos de dependência
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production

# Copiar código-fonte da aplicação
COPY . .

# Criar pasta data para armazenamento persistente caso não exista
RUN mkdir -p data

# Variáveis de ambiente padrão
ENV NODE_ENV=production

# Execução do Bot
CMD ["node", "index.js"]
