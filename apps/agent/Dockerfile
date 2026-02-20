FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json ./
COPY tsconfig.json ./tsconfig.json
COPY src ./src
COPY langgraph.json ./langgraph.json
RUN pnpm install --prod
RUN touch .env
CMD ["sh","-c","npx @langchain/langgraph-cli dev --host 0.0.0.0 --port ${PORT:-10000} --no-browser"]
