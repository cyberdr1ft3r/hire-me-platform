# syntax=docker/dockerfile:1.7
FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @hire-me/web... --filter @hire-me/contracts...
COPY apps/web apps/web
COPY packages packages
ARG VITE_API_BASE_URL
RUN test -n "$VITE_API_BASE_URL" \
  && pnpm --filter @hire-me/contracts build \
  && pnpm --filter @hire-me/web build

FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d AS runtime
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/web/dist /srv
ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/cyberdr1ft3r/hire-me-platform" \
  org.opencontainers.image.revision=$VCS_REF
USER 10001:10001
EXPOSE 8080
