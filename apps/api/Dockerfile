FROM node:20-slim AS builder

WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=@notifyengine/api --workspace=@notifyengine/shared --include-workspace-root

COPY packages/shared/ packages/shared/
RUN npm run build --workspace=@notifyengine/shared

COPY apps/api/ apps/api/
RUN npm run build --workspace=@notifyengine/api

FROM node:20-slim

RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app

COPY --from=builder --chown=appuser:appuser /build/apps/api/dist ./dist
COPY --from=builder --chown=appuser:appuser /build/apps/api/package.json ./
COPY --from=builder --chown=appuser:appuser /build/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /build/packages/shared/dist ../shared/dist
COPY --from=builder --chown=appuser:appuser /build/packages/shared/package.json ../shared/

USER appuser
EXPOSE 3000
CMD ["node", "dist/index.js"]
