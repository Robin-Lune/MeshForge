# MeshForge — image unique pour l'app Next.js ET le worker MQTT (profil `prod`
# du docker-compose). Le service choisit son rôle via `command` (yarn start /
# yarn worker). En dev, on n'utilise PAS cette image (app/worker en `yarn`).

# ---- Build : installe TOUTES les deps (dont devDeps : tsx, tailwind…) + build
FROM node:24-slim AS build
WORKDIR /app
# Outils natifs pour compiler bcrypt (module natif) sur debian-slim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# ---- Runtime : reprend l'arbre construit (node_modules avec tsx pour le worker,
# .next pour l'app, src). NODE_ENV=production pour Next + pg.
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# Surchargé par `command: yarn worker` pour le service worker.
CMD ["yarn", "start"]
