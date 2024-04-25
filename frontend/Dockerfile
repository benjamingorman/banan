FROM node:21.7.3

ENV CACHEBUST=4

RUN --mount=type=cache,target=/var/cache/apt \
  apt update && \
  apt install -y yarn && \
  apt clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./

RUN --mount=type=cache,target=/app/node_modules \
  yarn

ENTRYPOINT ["yarn", "dev"]
