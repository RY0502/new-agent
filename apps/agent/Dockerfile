FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json ./
COPY tsconfig.json ./tsconfig.json
COPY src ./src
COPY langgraph.json ./langgraph.json
RUN pnpm install --prod
ENV PORT=8123
EXPOSE 8123
CMD ["sh","-c","npx @langchain/langgraph-cli dev --port ${PORT:-8123} --no-browser"]
