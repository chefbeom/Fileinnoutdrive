FROM node:24-bullseye AS build-stage

WORKDIR /app
ARG VITE_WEB_PUSH_PUBLIC_KEY=
ENV VITE_WEB_PUSH_PUBLIC_KEY=${VITE_WEB_PUSH_PUBLIC_KEY}
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM nginx:stable-alpine

ARG BACKEND_UPSTREAM=backend:8080
ARG REALTIME_UPSTREAM=websocket:1234
ARG MINIO_INTERNAL_ORIGIN=http://100.81.241.98:9000
ARG MINIO_CORS_ORIGIN=http://192.168.35.30

COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY deploy/lan-external-storage/docker/nginx.conf.template /tmp/default.conf.template
RUN sed \
    -e "s|__BACKEND_UPSTREAM__|${BACKEND_UPSTREAM}|g" \
    -e "s|__REALTIME_UPSTREAM__|${REALTIME_UPSTREAM}|g" \
    -e "s|__MINIO_INTERNAL_ORIGIN__|${MINIO_INTERNAL_ORIGIN}|g" \
    -e "s|__MINIO_CORS_ORIGIN__|${MINIO_CORS_ORIGIN}|g" \
    /tmp/default.conf.template > /etc/nginx/conf.d/default.conf

EXPOSE 80 9000
CMD ["nginx", "-g", "daemon off;"]
