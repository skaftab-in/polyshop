# Node 20 slim base
FROM node:20-slim

WORKDIR /app

# Copy manifest first for layer caching, then install
COPY package.json .
RUN npm install --omit=dev

COPY server.js .

EXPOSE 3000

CMD ["node", "server.js"]
