# Une seule image : l'API Fastify sert aussi le front compilé, sur le même domaine.
#
# ⚠️ L'API et `packages/db` tournent en sources TypeScript (Node 24 retire les types). Node
# refuse de le faire sous `node_modules` : `packages/db` doit rester à `/app/packages/db`,
# atteint par le lien symbolique de pnpm. D'où pas de `pnpm deploy`, qui le recopierait.

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@askly/web..."
RUN pnpm --filter @askly/web build

# Dépendances de production de l'API seulement, dans une étape vierge : ni Vite, ni Biome,
# ni Turbo, ni le compilateur dans l'image.
FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter "@askly/api..."

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    API_PORT=3400 \
    WEB_DIST=/app/apps/web/dist
WORKDIR /app
COPY --from=deps /app /app
COPY --from=build /app/apps/web/dist /app/apps/web/dist
USER node
EXPOSE 3400
# Migrations au démarrage. Les variables viennent du conteneur, jamais d'un `.env` : d'où ces
# commandes plutôt que les scripts du dépôt, qui passent `--env-file`.
CMD ["sh", "-c", "node packages/db/src/migrate.ts && exec node apps/api/src/server.ts"]
