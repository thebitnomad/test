# Node 22 LTS
FROM node:22

WORKDIR /app

# Copia manifestos primeiro para aproveitar cache
COPY package*.json yarn.lock* ./

# Instala só deps de produção (e ignora engines chatos)
RUN corepack enable \
 && yarn set version 1.22.22 \
 && yarn install --production --ignore-engines

# Copia o restante do projeto
COPY . .

# Se não expõe HTTP, não precisa EXPOSE; se tiver API, descomente:
# EXPOSE 3000

# Sobe o bot (já compila em dist)
CMD ["yarn", "start"]