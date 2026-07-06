FROM node:24-bullseye AS build-stage

WORKDIR /app
ARG VITE_WEB_PUSH_PUBLIC_KEY=
ENV VITE_WEB_PUSH_PUBLIC_KEY=${VITE_WEB_PUSH_PUBLIC_KEY}
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM nginx:stable-alpine

ARG BACKEND_UPSTREAM=backend-app:8080
ARG REALTIME_UPSTREAM=192.168.35.152:1234

COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY deploy/two-vm/docker/nginx.conf.template /tmp/default.conf.template
RUN sed \
    -e "s|__BACKEND_UPSTREAM__|${BACKEND_UPSTREAM}|g" \
    -e "s|__REALTIME_UPSTREAM__|${REALTIME_UPSTREAM}|g" \
    /tmp/default.conf.template > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
