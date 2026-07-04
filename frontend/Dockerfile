# ---- Build stage ----
FROM node:20-slim AS build
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# GATEWAY_HOST defaults to the compose/k8s service name "gateway".
# nginx image auto-substitutes env vars in files under /templates at startup.
ENV GATEWAY_HOST=gateway
EXPOSE 80
