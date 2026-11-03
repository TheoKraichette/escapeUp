FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/engine/package.json packages/engine/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --filter "@escapeup/web..."
COPY packages/engine packages/engine
COPY packages/web packages/web
# tsconfig racine dont chaque package hérite (target ES2022, moduleResolution Bundler).
# Sans lui, `tsc --noEmit` retombe sur les défauts et échoue (TS2802/2614/2307).
COPY tsconfig.base.json ./
RUN pnpm --filter @escapeup/web build

FROM nginx:alpine
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
