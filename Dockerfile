FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY prisma/seed.js ./prisma/seed.js

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
