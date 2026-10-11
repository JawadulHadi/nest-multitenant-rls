FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER node
# Free hosts have no pre-deploy hook, so migrate on boot when an admin URL is provided.
# Migrations are idempotent (tracked in schema_migrations).
CMD ["sh", "-c", "if [ -n \"$ADMIN_DATABASE_URL\" ]; then node dist/migrate-cli.js; fi && node dist/main.js"]
