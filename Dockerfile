# syntax=docker/dockerfile:1

FROM node:22-alpine

# tini as PID 1 so SIGTERM/SIGINT actually reach Node and the bot exits cleanly
RUN apk add --no-cache tini

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first: this layer stays cached until the lockfile changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Drop root - the node image ships an unprivileged "node" user
USER node

# Only used in HTTP mode; harmless when running in Socket Mode
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
