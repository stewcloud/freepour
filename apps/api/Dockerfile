FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/games/package.json packages/games/package.json
RUN npm install
COPY apps/api apps/api
COPY packages/games packages/games
RUN npm run build -w @freepour/games && npm run build -w @freepour/api
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/games ./packages/games
COPY migrations ./migrations
CMD ["node", "apps/api/dist/index.js"]

