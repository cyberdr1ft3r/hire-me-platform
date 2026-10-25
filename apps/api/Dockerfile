# syntax=docker/dockerfile:1.7
FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates g++ make openssl python3 \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @hire-me/api... --filter @hire-me/contracts...
COPY apps/api apps/api
COPY packages packages
COPY .env.example .env.example
RUN pnpm --filter @hire-me/contracts build \
  && pnpm --filter @hire-me/api build \
  && pnpm --filter @hire-me/api --prod deploy --legacy /opt/api

FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /opt/api/ ./
ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/cyberdr1ft3r/hire-me-platform" \
  org.opencontainers.image.revision=$VCS_REF
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
