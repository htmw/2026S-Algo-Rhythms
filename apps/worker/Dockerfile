FROM node:20-slim AS builder

WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=@notifyengine/worker --workspace=@notifyengine/shared --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
RUN npm run build --workspace=@notifyengine/shared

COPY apps/worker/ apps/worker/
RUN npm run build --workspace=@notifyengine/worker

FROM node:20-slim

RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app

COPY --from=builder --chown=appuser:appuser /build/apps/worker/dist ./dist
COPY --from=builder --chown=appuser:appuser /build/apps/worker/package.json ./
COPY --from=builder --chown=appuser:appuser /build/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /build/packages/shared/dist ../shared/dist
COPY --from=builder --chown=appuser:appuser /build/packages/shared/package.json ../shared/

USER appuser
CMD ["node", "dist/index.js"]
