FROM node:20-alpine

WORKDIR /app
COPY backend/websocket-server/package*.json ./
RUN npm install --legacy-peer-deps

COPY backend/websocket-server/server.js ./server.js

ENV HOST=0.0.0.0
ENV PORT=1234
EXPOSE 1234

CMD ["npm", "start"]
