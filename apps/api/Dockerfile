FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN corepack enable \
    && corepack prepare pnpm@12.4.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

RUN pnpm build:shared \
    && pnpm --filter @scorelens/api prisma:generate \
    && pnpm --filter @scorelens/api build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api

RUN mkdir -p /app/data/uploads \
    && chown -R node:node /app/data

USER node

EXPOSE 3100

CMD ["sh", "-c", "./apps/api/node_modules/.bin/prisma migrate deploy --schema ./apps/api/prisma/schema.prisma && exec node ./apps/api/dist/main.js"]
