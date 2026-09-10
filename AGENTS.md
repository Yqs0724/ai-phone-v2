# AI 小手机 v2 — 项目交接文档

> 给接手的 AI 助手：这是这个项目的全部上下文。开工前先读完，保持既有架构与约定，不要推翻重来。

## 这是什么项目

一个"AI 陪伴小手机"：模拟手机界面与 AI 角色长期聊天，核心解决三个痛点——AI 失忆、剧情同质化、缺时间感。作者是 Vibe Coding 初学者，所有代码需要可解释（改了什么、为什么，都要用大白话讲清楚）。

## 技术栈与架构

```
client/  React 18 + TypeScript + Vite + Tailwind CSS v4
         src/App.tsx 是唯一主组件（聊天 + 档案面板 + 二级抽屉）
         src/components/PhoneFrame.tsx 手机外壳沉浸感、Arsenal.tsx 弹药库
server/  Node 24 + Express + node:sqlite（原生 SQLite，无 ORM）
         src/db.js        数据访问层 —— 全项目唯一允许写 SQL 的地方
         src/routes/      chat.js(对话+档案+记忆+消息) / care.js(主动消息+纪念日) / arsenal.js
         src/services/    prompt.js(五层注入) / memory.js(提炼/衰减/取舍) / tone.js(剧情姿态)
                          proactive.js(心跳主动开口) / anniversary.js / llm.js(DeepSeek 封装) / arsenal.js
```

- 单端口全栈：生产模式下 Express 托管 client/dist，访问一个地址即可
- LLM: DeepSeek API，key 从环境变量 `DEEPSEEK_API_KEY` 读，绝不入库、绝不进镜像

## 核心机制（改之前必读）

1. **五层注入**（prompt.js buildMessages）：角色设定(含双方姓名) → 演法规范 → 现实世界锚点(日期/星期/纪念日，解决 AI 无时间感知) → 剧情姿态 → 长期记忆。名字和头像存 settings 表的 `char_name`/`user_name`/`char_avatar`/`user_avatar`，界面显示和 AI 认知共用同一数据源（单一数据源原则）
2. **记忆系统**（memory.js）：对话后异步提炼用户事实，importance 1-10，闲置每 3 天衰减 1 分，上限 50 条按有效分淘汰；每次对话注入有效分 Top10
3. **消息/记忆可人工干预**：PUT/DELETE `/api/messages/:id`、`/api/memories/:id`——直接改库，AI 读历史自动生效
4. **头像方案**：前端 Canvas 居中裁剪压成 128px JPEG → base64 存 settings 表（无文件上传服务，后端 json limit 2mb）

## 硬约定（违背=事故）

- SQL 只出现在 db.js；新表/新字段在 db.js 的建表语句里加（CREATE TABLE IF NOT EXISTS，兼容老库）
- API 响应不允许设置缓存（聊天记录会串台）
- 所有色值走 index.css `@theme` 的 design token（ink/paper/card/mine/accent/night），不许写死色值
- UI 风格：手机沉浸感、暖黑暗色系、渐进式披露（低频操作收进抽屉）、危险操作需 confirm + 明确后果提示
- 后端 `express.json({ limit: '2mb' })`，头像超限会被 413 拒
- Windows 开发机：PowerShell 不支持 `&&`（用 `;`）；启动 server 必须以 server/ 为工作目录（dotenv 找 .env）

## 常用命令

```bash
# 本地开发（两个终端）
npm run dev --prefix client        # 前端: Vite dev server(5173, 代理 /api → 3001)
node src/index.js                  # 后端: 必须在 server/ 目录下跑（找 .env）
# 生产构建
npm run build --prefix client      # 产物进 client/dist，纯前端改动只需重建+刷新页面
```

## 部署现状（2026-09-09）

- GitHub Actions: push 到 master 自动构建镜像 → `ghcr.io/yqs0724/ai-phone-v2:latest`（公开）
- 腾讯云轻量服务器(广州)：Debian13-Docker29，IP `114.132.103.15`，网页控制台 OrcaTerm 登录
- 运行方式：`docker run -d --name ai-phone --restart always -p 3001:3001 -e DEEPSEEK_API_KEY=<密钥> -v /root/ai-phone-data:/app/server/data <镜像>`
- 数据持久化：SQLite 在容器 /app/server/data，挂载到宿主 /root/ai-phone-data——**删容器不删数据**
- 更新版本三板斧：`docker pull <镜像>` → `docker rm -f ai-phone` → 重跑 docker run
- ⚠️ 广州拉 GHCR 慢/易超时，已验证的国内代理：`ghcr.nju.edu.cn/...`、`docker.m.daocloud.io/ghcr.io/...`（DaoCloud 路径需保留 ghcr.io/ 前缀）
- ⚠️ 服务器防火墙需放行 TCP 3001（来源 全部IPv4）；22 端口来源需为 0.0.0.0/0 否则网页终端连不上

## 待办（按优先级）

1. **部署收尾**：镜像拉取完成 + 浏览器访问 http://114.132.103.15:3001 验收（卡在 GHCR 拉取慢，见上面的代理方案）
2. 竞品报告《求职材料/对比体验报告-甜气vs星野vsbubbly.md》补"甜气"实测部分
3. 弹药库素材积累：作者需从自己收藏里入库 20+ 真实素材（剧情点子/角色卡/prompt 技巧）
4. 面试材料：需求文档(docs/需求文档-v2.md)、Prompt 迭代笔记整理成作品集
5. 可选增强：访问口令（防滥用）、聊天分页加载、PWA 离线体验打磨

## 已知待验证点

- 服务器端容器尚未确认跑通（镜像拉取中/未完成）；跑通后需验证：聊天、记忆提炼、主动消息、纪念日（当天日期与本地时区一致）
