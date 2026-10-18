FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/package.json server/package.json
RUN pnpm install --frozen-lockfile --filter server...

COPY server ./server
RUN pnpm --filter server build

EXPOSE 3210
CMD ["node", "server/dist/index.js"]
