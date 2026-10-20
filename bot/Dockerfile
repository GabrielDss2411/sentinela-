# Sentinela Telegram bot. Build from the project root:
#   docker compose -f bot/docker-compose.yml up -d --build
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data

# No npm install needed: the bot only uses Node built-ins, and Node 24 runs .ts directly.
COPY package.json ./
COPY api/fogo-cruzado.ts api/
COPY src/lib/incidentTypes.ts src/lib/
COPY bot/*.ts bot/

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data

# Unhealthy if the polling loop hasn't ticked for 10 minutes.
HEALTHCHECK --interval=2m --timeout=10s --start-period=1m \
  CMD node -e "const t=+require('fs').readFileSync('/data/heartbeat','utf8');process.exit(Date.now()-t<600000?0:1)"

CMD ["node", "bot/main.ts"]
