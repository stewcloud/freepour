FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/games/package.json packages/games/package.json
RUN npm install
COPY apps/web apps/web
COPY packages/games packages/games
RUN npm run build -w @freepour/games && npm run build -w @freepour/web
FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

