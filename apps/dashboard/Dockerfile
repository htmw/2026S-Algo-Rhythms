FROM node:20-slim AS builder

WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=@notifyengine/dashboard --workspace=@notifyengine/shared --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
RUN npm run build --workspace=@notifyengine/shared

COPY apps/dashboard/ apps/dashboard/
RUN npm run build --workspace=@notifyengine/dashboard

FROM node:20-slim

RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app

COPY --from=builder --chown=appuser:appuser /build/apps/dashboard/dist ./dist
COPY --from=builder --chown=appuser:appuser /build/apps/dashboard/package.json ./
COPY --from=builder --chown=appuser:appuser /build/node_modules ./node_modules

USER appuser
EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
