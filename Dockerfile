# Slovakia Visa Slot Alert — monitor service image.
# Playwright's official base image ships Chromium + all OS dependencies
# already installed, which avoids the usual apt-get dependency dance.
FROM mcr.microsoft.com/playwright:v1.48.2-jammy AS base

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/monitor/package.json apps/monitor/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install --workspaces --include-workspace-root

COPY apps/monitor apps/monitor
COPY tsconfig*.json ./

RUN npm run build -w apps/monitor

# Playwright browsers are already present in the base image; this is a
# no-op safety net in case versions drift.
RUN npx playwright install --with-deps chromium

ENV NODE_ENV=production
ENV HEADLESS=true

RUN mkdir -p /app/data /app/storage /app/debug

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/monitor/dist/src/index.js"]
