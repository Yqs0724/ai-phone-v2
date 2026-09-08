# ── 阶段一：构建前端 ──
FROM node:24-alpine AS build
WORKDIR /app
COPY client/package.json client/package-lock.json ./client/
RUN npm ci --prefix client
COPY client ./client
RUN npm run build --prefix client

# ── 阶段二：安装后端依赖 ──
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server

# ── 阶段三：运行镜像（只带生产需要的文件） ──
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY --from=build /app/server/node_modules ./server/node_modules
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
EXPOSE 3001
WORKDIR /app/server
CMD ["node", "src/index.js"]
