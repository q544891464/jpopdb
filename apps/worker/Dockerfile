FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json eslint.config.mjs ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/worker apps/worker
RUN npm run build --workspace @jpopdb/worker

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace @jpopdb/worker --include-workspace-root=false

COPY --from=build /app/apps/worker/dist apps/worker/dist
WORKDIR /app/apps/worker
CMD ["node", "dist/src/main.js"]
