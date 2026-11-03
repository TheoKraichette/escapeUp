FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter "@escapeup/server..."
COPY packages/engine packages/engine
COPY packages/server packages/server
# tsconfig racine dont le server hérite (tsx le lit au démarrage).
COPY tsconfig.base.json ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@escapeup/server", "start"]
