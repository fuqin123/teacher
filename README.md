# 成绩云析（ScoreLens）

面向初中班主任、任课老师、年级主任的成绩导入与可视化分析系统。

当前版本：**v0.1.0**。核心链路已打通：登录 → 班级范围 → 上传成绩表 → 手动映射 → 校验 → 事务入库 → 班级看板 / 年级对比 / 学生档案。

## 0.1.0 已实现

- 登录、退出、Session、四类角色与数据范围（管理员 / 年级主任 / 班主任 / 任课老师）。
- 班级看板：总分平均分、及格率、优秀率、参考人数、各科对比、历次趋势、学生排名、分数段、临界生。
- 年级对比：班级总分均分、学科贡献热力表（仅管理员/年级主任）。
- 学生档案：成绩画像、雷达图、名次趋势、考试历史。
- 成绩导入：`.xlsx` / `.xls` / `.csv`，表头识别、规则建议、人工映射、逐行校验、事务入库。
- 考试记录随导入创建：按学期+年级+名称查找或创建，全年级共享。
- 导入历史与映射快照；成绩变更日志、操作审计基础表已建立。
- 任课老师单科视图：只返回所教科目的数据，不返回总分和其他科目。
- 种子数据：3 个班、42 名学生、3 场考试、630 条成绩。

### 尚未实现（后续版本）

- AI 表头映射、映射模板复用。
- 导入撤销（24h）、成绩更正 UI。
- 多 sheet / 一科一表批量导入。
- 基础数据增删改 UI（当前为只读展示）。
- 汇总表预计算、导出 Excel/PNG。
- 用户密码管理、审计日志查看 UI。

## 技术栈

- 前端：Vue 3 + TypeScript + Vite + Pinia + Vue Query + ECharts
- 后端：NestJS + Prisma + PostgreSQL + Zod
- 表格：SheetJS 读取，后续使用 exceljs 导出
- 部署：Docker Compose（PostgreSQL）+ Caddy/Nginx（静态站点）

## 目录

```text
apps/
  api/    NestJS API + Prisma
  web/    Vue 3 SPA
packages/
  shared/ 前后端共享类型、Zod schema、纯函数
docs/     项目架构、技术选型、功能清单
prototype/ 视觉原型
```

## 快速开始（Windows 开发）

### 1. 环境

- Node.js 24 LTS
- pnpm 12+
- Docker Desktop（本机只用来跑 PostgreSQL）

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

```bash
cp apps/api/.env.example apps/api/.env
```

默认：

```env
DATABASE_URL="postgresql://scorelens:scorelens@localhost:5432/scorelens?schema=public"
SESSION_SECRET="change-me-to-a-long-random-string"
APP_ORIGIN="http://localhost:5173"
PORT=3100
UPLOAD_DIR="./data/uploads"
TZ="Asia/Shanghai"
```

> API 默认端口是 `3100`，避免与 Docker Desktop 自身的 3000 端口冲突。前端 Vite 代理已指向 3100。

### 4. 启动 PostgreSQL

```bash
pnpm db:up
```

### 5. 迁移与种子

```bash
pnpm db:migrate
pnpm db:seed
```

> `db:seed` 会清空并重建演示数据，仅用于开发/测试环境。不要对正式数据执行。

### 6. 启动

```bash
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3100/api/v1
- 健康检查: http://localhost:3100/api/v1/health

或者分别启动（首次单独启动前先构建共享包）：

```bash
pnpm build:shared
pnpm --filter @scorelens/api dev
pnpm --filter @scorelens/web dev
```

## 演示账号

| 角色 | 账号 | 密码 | 数据范围 |
| --- | --- | --- | --- |
| 班主任 | `wang` | `wang123` | 初二（1）班 |
| 年级主任 | `director` | `director123` | 初二年级全部班 |
| 任课老师 | `zhang` | `zhang123` | 1、2 班数学（只读单科视图） |
| 管理员 | `admin` | `admin123` | 全部 |

> 正式部署前必须修改演示密码，并替换 `SESSION_SECRET`。

## 常用脚本

```bash
pnpm dev            # 启动前后端
pnpm build          # 构建 shared + api + web
pnpm typecheck      # 类型检查
pnpm db:up          # 启动 PostgreSQL
pnpm db:down        # 停止 PostgreSQL
pnpm db:migrate     # 创建/应用迁移
pnpm db:seed        # 重置演示数据
pnpm db:studio      # Prisma Studio
```

## 导入格式

标准宽表（一行一个学生）：

| 学号 | 姓名 | 语文 | 数学 | 英语 | 物理 | 历史 |
| --- | --- | --- | --- | --- | --- | --- |
| 20250001 | 陈雨桐 | 102.9 | 135.9 | 97.5 | 86.6 | 84.9 |

规则：

- 学号必须在当前班级名单中。
- 缺考填写“缺考”“缺”“免考”或“—”，不要留空。
- 每科满分在映射步骤按实际设置；系统不假设固定 150/100。
- 0 是有效成绩，不视为缺考。
- 单文件 ≤ 10MB、≤ 5000 行。

## Ubuntu 24.04 测试部署

1. 安装 Node.js 24、pnpm、Docker Engine + Compose 插件。
2. 启动 PostgreSQL：`docker compose up -d postgres`。
3. 复制并修改 `apps/api/.env`，设置数据库连接、`SESSION_SECRET`、`APP_ORIGIN`。
4. 安装依赖并构建：

```bash
pnpm install
pnpm build
```

5. 初始化数据库：

```bash
pnpm --filter @scorelens/api prisma:deploy
pnpm db:seed   # 仅测试环境
```

6. 启动 API：`pnpm --filter @scorelens/api start`。
7. 用 Caddy/Nginx 托管 `apps/web/dist`，将 `/api` 反向代理到 `127.0.0.1:3100`。
8. 只对外暴露 80/443，数据库端口不要暴露公网。

Caddy 示例：

```caddyfile
scorelens.example.com {
  root * /srv/scorelens/web
  encode gzip
  try_files {path} /index.html
  file_server
  reverse_proxy /api/* 127.0.0.1:3100
}
```

## 文档

- [项目架构](docs/01-项目架构.md)
- [技术选型](docs/02-技术选型.md)
- [功能清单](docs/03-功能清单.md)

## 版本

- `v0.1.0`：脚手架 + 手动映射导入 + 班级看板 + 年级对比 + 学生档案 + 导入历史。