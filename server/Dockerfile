# Sentinela API (server functions in api/) for the VPS. Build from the project root:
#   docker compose -f deploy/docker-compose.yml up -d --build
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=8787

# No npm install needed: only Node built-ins, and Node 24 runs .ts directly.
COPY package.json ./
COPY api/fogo-cruzado.ts api/
COPY src/lib/incidentTypes.ts src/lib/
COPY server/api-server.ts server/

USER node
EXPOSE 8787
HEALTHCHECK --interval=1m --timeout=5s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "server/api-server.ts"]
