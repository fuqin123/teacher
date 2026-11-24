# 成绩云析（ScoreLens）

面向初中班主任、任课老师、年级主任的成绩导入与可视化分析系统。

当前版本：**v0.6.0**。核心链路：登录 → 班级范围 → 上传成绩表（学校导出格式可直接用）→ AI/规则映射 → 人工确认 → 校验 → 事务入库 → 班级看板 / 年级对比 / 学生档案。

## v0.6.0 更新

- **AI 配置改为管理员在界面维护**：系统设置页可填写接口地址、API Key、模型与超时，支持「测试连接」；配置写入数据库（Key 以 AES-256-GCM 加密，接口只返回掩码），导入立即生效、无需重启。未在界面配置时回退环境变量。
- **兼容学校导出的多级表头成绩表**：识别「科目 + 分数/校名次/班名次」的两级合并表头，自动拼接列名（如 `语文-分数`），忽略学校、班级、序号与原始名次列，数据从表头之后开始读取，校验提示行号与 Excel 行号一致。
- **标准模板重做**：`下载标准模板` 改为服务端生成 xlsx，包含标题行、学号/姓名/各科分数/总分/班级排名/年级排名、示例行（含缺考）与「填写说明」sheet，列宽已适配。
- 科目别名匹配：`道法`/`政治`/`思想品德` 等简称可自动对应「道德与法治」。
- 版本号升至 0.6.0。

## v0.5.0 更新（摘要）

- AI 表头识别与失败降级；管理员基础数据维护；CSV 编码自动识别；看板底部布局修复；湖南初中科目口径。

## 已实现

- 登录、退出、Session、四类角色与数据范围（管理员 / 年级主任 / 班主任 / 任课老师）。
- AI 表头识别与失败降级；规则建议 + 人工确认的兜底流程。
- 管理员基础数据维护：学期、年级、班级、科目、学生与调班。
- 班级看板：总分平均分、及格率、优秀率、参考人数、各科对比、历次趋势、学生排名、分数段、临界生。
- 年级对比：班级总分均分、学科贡献热力表（仅管理员/年级主任）。
- 学生档案：成绩画像、雷达图、名次趋势、考试历史。
- 成绩导入：`.xlsx` / `.xls` / `.csv`，UTF-8 / GBK 编码识别、多级表头识别、规则建议、AI 映射、人工确认、逐行校验、事务入库。
- 标准模板下载（xlsx，含总分与班级/年级排名列）与填写说明。
- 考试记录随导入创建：按学期+年级+名称查找或创建，全年级共享。
- 导入历史与映射快照；成绩变更日志、操作审计基础表已建立。
- 任课老师单科视图：只返回所教科目的数据，不返回总分和其他科目。
- 种子数据：3 个班、42 名学生、3 场考试、8 个科目、1,008 条成绩。

### 尚未实现（后续版本）

- 映射模板复用（相同表头免重复调用 AI）。
- 导入撤销（24h）、成绩更正 UI。
- 多 sheet / 一科一表批量导入。
- 任课分配与年级主任配置界面。
- 汇总表预计算、导出 Excel/PNG。
- 用户密码管理、审计日志查看 UI。

## 技术栈

- 前端：Vue 3 + TypeScript + Vite + Pinia + Vue Query + ECharts
- 后端：NestJS + Prisma + SQLite + Zod
- AI：OpenAI 兼容接口（JSON 输出 + Zod 校验 + 超时降级）
- 表格：SheetJS 读取，后续使用 exceljs 导出
- 部署：Docker Compose（NestJS API + Vue Web/Caddy，SQLite 数据卷）

## 目录

```text
apps/
  api/    NestJS API + Prisma（数据库文件在 apps/api/data/）
  web/    Vue 3 SPA
packages/
  shared/ 前后端共享类型、Zod schema、纯函数
docs/     项目架构、技术选型、功能清单、版本、开发与部署文档
docker/    Caddy 容器配置
prototype/ 视觉原型
```

## 快速开始（Windows 开发）

### 1. 环境

- Node.js 24 LTS
- pnpm 12+

无需安装 PostgreSQL、Docker 或任何数据库客户端。

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
NODE_ENV="development"
DATABASE_URL="file:../data/scorelens.db"
SESSION_SECRET="change-me-to-a-long-random-string"
APP_ORIGIN="http://localhost:5173"
COOKIE_SECURE="false"
PORT=3100
UPLOAD_DIR="./data/uploads"
TZ="Asia/Shanghai"

# AI 表头识别（可选）：可留空，改为管理员登录后在「系统设置 → AI 表头识别」中填写
AI_ENABLED="false"
AI_BASE_URL="https://api.deepseek.com/v1"
AI_API_KEY=""
AI_MODEL="deepseek-chat"
AI_TIMEOUT_MS=25000
```

> `DATABASE_URL` 的相对路径以 `apps/api/prisma/schema.prisma` 所在目录为基准，因此默认落盘到 `apps/api/data/scorelens.db`。
> API 默认端口是 `3100`，避免与 Docker Desktop 自身的 3000 端口冲突。前端 Vite 代理已指向 3100。

### 4. 迁移与种子

```bash
pnpm db:migrate   # 首次执行：创建 apps/api/data/scorelens.db 并应用迁移
pnpm db:seed      # 可选：写入演示数据
```

> `db:seed` 会清空并重建演示数据，仅用于开发/测试环境。不要对正式数据执行。

### 5. 启动

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
pnpm db:migrate     # 创建/应用迁移
pnpm db:reset       # 重置数据库并重新迁移（清空数据）
pnpm db:seed        # 重置演示数据
pnpm db:backup      # 生成 SQLite 一致性快照到 apps/api/backups/
pnpm db:studio      # Prisma Studio
```

## 数据库与备份

- 数据库就是一个文件：`apps/api/data/scorelens.db`（已被 Git 忽略）。上传的原始表格在 `apps/api/data/uploads/`。
- 备份：`pnpm db:backup`，用 SQLite `VACUUM INTO` 生成快照到 `apps/api/backups/`，服务运行中也可执行。
- 恢复：停止 API，把快照文件覆盖为 `apps/api/data/scorelens.db`，再启动。
- 迁移数据库：在新机器安装依赖、复制 `.env`、执行 `pnpm db:migrate`，再把备份文件放进 `apps/api/data/`。
- 当前按“一位教师、一个班级”使用设计；多人并发写入或多实例部署前需要迁移到 PostgreSQL（Prisma 只改 `provider` 与原生类型）。

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

## Docker 一键部署（Ubuntu 24.04）

宿主机只需安装 Docker Engine 和 Docker Compose 插件，无需安装 Node.js、pnpm、PostgreSQL 或 Caddy。

```bash
cp .env.example .env
# 修改 .env 中的 SESSION_SECRET、APP_ORIGIN 和 SITE_ADDRESS
docker compose up -d --build
docker compose ps
```

Compose 会启动 NestJS API 和 Caddy Web 两个容器；数据库为 `app_data` 卷内的 `scorelens.db`，API 启动时自动执行 Prisma 迁移，不发布任何数据库端口。备份快照写入宿主机 `./backups`。

完整安装、HTTPS、演示数据、备份恢复、升级回滚和故障排查见 [Ubuntu Docker 部署文档](docs/06-部署文档.md)。

## 文档

- [项目架构](docs/01-项目架构.md)
- [技术选型](docs/02-技术选型.md)
- [功能清单](docs/03-功能清单.md)
- [版本更新](docs/04-版本更新.md)
- [开发记录](docs/05-开发记录.md)
- [Ubuntu Docker 部署文档](docs/06-部署文档.md)

## 版本

- `v0.6.0`：AI 配置可在界面维护（加密存库）、多级表头成绩表兼容、标准 xlsx 模板（含排名列）。
- `v0.5.0`：AI 表头识别与降级、管理员基础数据维护、CSV 编码识别、看板底部布局修复、湖南初中口径与文案。
- `v0.4.0`：数据库改为本地 SQLite 单文件，会话存储内置化，新增备份脚本，精简 Docker 编排。
- `v0.3.0`：Ubuntu Docker Compose 全栈部署、自动迁移、健康检查、HTTPS/Cookie 配置与运维文档。
- `v0.2.0`：主题化可搜索下拉、内容区留白优化、图表入场/切换动画、学生快速定位。
- `v0.1.0`：脚手架 + 手动映射导入 + 班级看板 + 年级对比 + 学生档案 + 导入历史。
