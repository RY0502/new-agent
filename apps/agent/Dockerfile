 FROM node:20-alpine
 
 RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
 
 WORKDIR /app
 
 COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
 COPY apps/agent ./apps/agent
 
 RUN pnpm install --frozen-lockfile
 
 ENV PORT=8123
 EXPOSE 8123
 
 CMD ["sh","-c","npx @langchain/langgraph-cli dev --port ${PORT:-8123} --no-browser"]
