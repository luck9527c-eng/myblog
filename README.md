# 我的数字花园 · 个人博客与私有日报

一个兼具**公开极简博客（含个人简历）**与**仅管理员可见的每日日报空间**的个人数字花园。
桌面端三栏磨砂玻璃布局，移动端收起为抽屉 + 底部固定导航。

- **公开侧**：文章流、单篇沉浸阅读（含右侧目录 TOC）、时间归档、关于自己 / 个人简历。
- **私有侧**：每日日报（三段式模板 / 自由随笔、心情状态、标签、可补写任意历史日期）、管理后台（文章双栏编辑、分类标签、站点与密码设置）。
- **公私严格隔离**：未登录时前端不展示任何日记与后台入口，**后端接口层面对日记/草稿/后台请求一律 401**。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + dompurify |
| 后端 | Python 3.12 · FastAPI · Uvicorn · SQLAlchemy 2.0 (async) · aiomysql · Alembic |
| 数据库 | MySQL 8.0（`personal_blog` 独立库 + `blog_app` 最小权限账号） |
| 部署 | Docker Compose：Nginx（静态 + 反代） + FastAPI + 现有 `chao_mysql` |

## 目录结构

```text
blog-gemini/
├── docs/
│   ├── DEVELOPMENT_SPEC.md     # 开发文档（产品边界 / 数据库 / 接口 / 部署约束）
│   ├── API_CONTRACT.md         # 前后端唯一对齐的 API 契约（字段命名、状态码、返回结构）
│   └── DEPLOYMENT.md           # 腾讯云 Docker 部署手册（建库、密钥、构建、验证、回滚）
├── src/                        # 前端源码（api/ 组件/ 工具）
├── backend/                    # 后端源码（app/ alembic/ tests/ Dockerfile）
├── deploy/                     # nginx.conf · Dockerfile.web · compose.yaml · .env.example
├── scripts/
│   ├── dev.ps1                 # 本地一键启动（迁移 + 后端 8005 + 前端 5173）
│   ├── smoke_test.py           # 端到端验收脚本（57 项，含权限隔离/排序/改密/标签合并）
│   └── local_demo_data.py      # 灌入示例内容，方便看界面
├── index.html · package.json · vite.config.ts · tsconfig.json
└── .gitignore · .dockerignore · .gitattributes
```

## 本地开发

### 前置

- Node.js 20+（本机 24.22 可用）
- Python 3.12+
- MySQL 8.0（本地已有实例即可）

### 1. 建库与账号（一次性）

```sql
CREATE DATABASE IF NOT EXISTS `personal_blog`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `personal_blog_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'blog_app'@'localhost' IDENTIFIED BY '<强随机密码>';
GRANT ALL PRIVILEGES ON `personal_blog`.* TO 'blog_app'@'localhost';
GRANT ALL PRIVILEGES ON `personal_blog_test`.* TO 'blog_app'@'localhost';
FLUSH PRIVILEGES;
```

> `blog_app` 只被授予这两张库的权限，读写不到机器上其它业务库。

### 2. 配置后端环境变量

```powershell
copy backend\.env.example backend\.env
# 填入 DATABASE_URL / JWT_SECRET / ADMIN_INIT_PASSWORD / TEST_DATABASE_URL
```

### 3. 一键启动

```powershell
pwsh -File scripts\dev.ps1
```

脚本会：建 venv → 装依赖（阿里云镜像）→ `alembic upgrade head` → `python -m app.seed` → 启动后端 `127.0.0.1:8005` 与前端 `127.0.0.1:5173`。

| 地址 | 用途 |
|---|---|
| http://127.0.0.1:5173 | 博客前端（Vite 已把 `/api`、`/health` 代理到 8005） |
| http://127.0.0.1:8005/health | 健康检查（含真实 `SELECT 1`） |
| http://127.0.0.1:8005/api/docs | 后端 OpenAPI / Swagger |

**管理员登录**：左侧栏底部「管理员登录」，密码为 `backend/.env` 里的 `ADMIN_INIT_PASSWORD`。

想先看看有内容的界面：

```powershell
python scripts\local_demo_data.py
```

### 4. 验收与测试

```powershell
# 端到端验收（57 项：权限隔离、自定义发布时间排序、日记补写、标签合并、改密失效…）
python scripts\smoke_test.py

# 后端单元/集成测试（真实 MySQL，需 TEST_DATABASE_URL）
cd backend
.\.venv\Scripts\python.exe -m pytest -q

# 前端类型检查 + 生产构建
npm run build
```

## 功能边界（第一版明确不做）

不做文章评论/留言板、不做点赞收藏、**不做浏览量统计**、不做右侧发布日历微件、
不做定时发布隐藏逻辑（未来时间仅作展示与排序时间，状态为 `published` 即对访客公开）。

## 生产部署

见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)：建库 → 上传代码 → `deploy/.env` 配置密钥 →
`docker compose up -d --build`（web 8005 → 容器 80，backend 内部 8000 不对外）→ 验证 → 云安全组放行 8005。

## 安全要点

- 所有密钥（DB 密码、JWT Secret、初始管理员密码）只走环境变量；`.env` 已在 `.gitignore` / `.dockerignore` 中排除。
- 管理员会话为 `HttpOnly; SameSite=Lax` 的签名 JWT Cookie，改密后 `token_version` 递增，旧会话立即失效。
- 登录接口按 IP 限流（1 分钟 10 次失败）。
- Markdown 渲染统一经 `DOMPurify.sanitize`，简历与文章都不会引入 XSS。
- 公开接口永不返回草稿、日记与任何密码哈希。
