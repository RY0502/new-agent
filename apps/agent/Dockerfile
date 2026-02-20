FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json ./
COPY tsconfig.json ./tsconfig.json
COPY src ./src
COPY langgraph.json ./langgraph.json
RUN pnpm install
RUN pnpm run build
RUN touch .env
CMD ["pnpm","run","start"]
