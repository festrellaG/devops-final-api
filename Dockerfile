FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY dist/devops-final-api-*.tgz /tmp/devops-final-api.tgz

RUN tar -xzf /tmp/devops-final-api.tgz -C /app --strip-components=1 \
    && npm ci --omit=dev --ignore-scripts \
    && rm /tmp/devops-final-api.tgz \
    && chown -R node:node /app

USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]