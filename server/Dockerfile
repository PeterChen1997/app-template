# 单容器部署：多阶段构建 —— build 阶段 tsc 出 dist，prod 阶段只装运行时依赖。
# 为什么编译而不用 tsx 直跑：tsx 是 devDependency，生产镜像不带 devDeps，镜像更小、面更窄。

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM node:22-slim AS prod-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 8790
# PAIRING_SECRET 必须在运行时注入；缺失时进程会大声失败退出（见 src/index.ts）
CMD ["node", "dist/index.js"]
