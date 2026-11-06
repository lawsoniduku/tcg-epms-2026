FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY server ./server
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node","server/platform.mjs"]
