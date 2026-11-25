# 个人博客与私有日报系统 · 全栈开发文档

> **文档用途**：本文档基于已确认的磨砂玻璃三栏交互原型编写，供后端/全栈开发 AI 或工程师直接照此完成 **Python 后端 + MySQL 8.0 数据库 + 前端 API 对接 + Docker 部署**。  
> **当前原型代码基线**：位于本仓库 `src/` 目录（Vite 6 + React 19 + TypeScript + Tailwind CSS v4）。

---

## 1. 产品定位与功能边界

### 1.1 核心定位
一个兼具**公开极简博客（含个人简历）**与**仅管理员可见的每日日报空间**的个人数字花园系统。

### 1.2 明确边界（第一版必做 & 不做）
- **保留与必做**：
  1. **桌面三栏磨砂玻璃布局 + 移动端适配**：左栏（个人名片、导航、主题切换、底栏登录入口）、中栏（文章流 / 正文阅读 / 年月归档 / 关于自己简历 / 私有日记 / 管理后台）、右栏（搜索、阅读目录 TOC、分类、标签、近期更新）。移动端收起左右栏为滑出抽屉，底部固定导航栏。
  2. **「关于自己」个人简历页**：展示个人履历头部与 Markdown 简历正文，管理员可在后台随时修改。
  3. **公私严格隔离**：默认访客视角打开；未登录状态下，前端不展示任何日记与后台入口，**后端接口层面也严格拦截未鉴权的日记/后台/草稿请求**。
  4. **「每日日记」私有频道**：仅管理员可见，支持写每日日报（一键套用 `今日完成 / 遇到问题与思考 / 明日计划` 三段式模板或自由随笔）、选择心情状态、标签筛选、补写任意历史日期。
  5. **自由设定文章发布时间**：新建文章时默认取当前本地时间，支持自由修改为过去或未来任意时间；无论是过去还是未来日期，只要状态为 `published` 均立即对访客公开，文章列表严格按 **置顶优先 (`pinned DESC`) + 设定发布时间倒序 (`published_at DESC`)** 排列。
  6. **简洁实用管理后台**：文章管理（双栏 Markdown 编辑与实时预览、草稿/发布切换、置顶、删除）、日记管理、分类与标签管理、站点与密码设置。
- **第一版明确不做（不要擅自添加）**：
  - 不做文章评论区、留言板、点赞/收藏数。
  - 不做文章阅读人数/浏览量统计（`views`）。
  - 不做右侧栏发布日历微件。
  - 不做定时发布隐藏逻辑（未来时间仅作展示与排序时间，不隐藏文章）。

---

## 2. 技术栈选型

### 2.1 后端（Python）
- **语言运行时**：Python 3.12
- **Web 框架**：**FastAPI** + **Uvicorn**（单容器/多 worker ASGI）
- **ORM 与数据库驱动**：**SQLAlchemy 2.0（Async）** + **`asyncmy`**（或 `aiomysql` / `pymysql`）
- **数据库迁移**：**Alembic**
- **数据校验与配置**：**Pydantic v2** + **`pydantic-settings`**
- **密码与会话安全**：
  - 密码哈希：`passlib[argon2]` 或 `bcrypt`（或 Python 标准库 `hashlib.scrypt`）
  - 会话鉴权：签名 Token（`PyJWT` 或 `itsdangerous`）写入 `HttpOnly; SameSite=Lax` Cookie

### 2.2 数据库
- **MySQL 8.0**（复用服务器现有 `chao_mysql` 容器实例，版本 `8.0.46`，字符集统一 `utf8mb4` / `utf8mb4_unicode_ci`，时区 `Asia/Shanghai`）。

### 2.3 前端（复用本仓库现有原型）
- **框架**：React 19 + TypeScript + Vite 6 + Tailwind CSS v4
- **新增安全依赖**：`dompurify`（`@types/dompurify`），在 `renderMarkdown()` 输出 HTML 后进行 XSS 清洗。
- **状态改造**：将 `src/App.tsx` 中的 `localStorage` 读写替换为 `fetch` API 调用。

---

## 3. 服务器环境与部署约束

开发与打包时必须遵循目标腾讯云服务器的真实运行条件：

1. **主机环境**：Ubuntu 24.04 LTS，已安装 Docker Engine 27.5+ 与 Docker Compose v2，**宿主机未安装 Node.js**，因此前端构建应在本地或 Docker 多阶段构建（`node:22-alpine` 构建 `dist/`）中完成。
2. **MySQL 连接方式**：
   - 现有 `chao_mysql` 容器运行在 Docker 网络 `1panel-network` 中。
   - 博客容器应加入外部网络 `1panel-network`（`external: true`），后端通过容器名 `chao_mysql:3306` 内网连接 MySQL，无需绕公网。
   - **数据库隔离要求**：必须在 `chao_mysql` 中创建独立数据库 `personal_blog` 和独立最小权限账号 `blog_app`（仅授予 `personal_blog.*` 权限），**禁止读写其他业务库**。
3. **端口避让**：
   - 宿主机 `80`（`lhc-frontend`）、`8002`（`workbuddy2api-hub`）、`3306`（`chao_mysql`）已被占用；`8003`/`8004` 为历史业务保留端口。
   - 建议博客服务绑定全新端口（如宿主机 `8005` -> 容器 `80`，或由统一反向代理转发），部署后需确认云安全组放行对应端口。
4. **国内镜像与依赖构建**：
   - Dockerfile 中建议配置国内镜像加速（PyPI 使用 `https://mirrors.aliyun.com/pypi/simple/`，npm 使用 `https://registry.npmmirror.com`）。
5. **敏感信息管理**：
   - 所有数据库密码、JWT Secret、初始管理员密码均通过服务器本地 `.env` 注入，严禁硬编码在源码或镜像中。

---

## 4. MySQL 8.0 数据库设计

所有表统一使用 `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`。时间均以 `Asia/Shanghai`（东八区）为准。

### 4.1 站点配置表 `site_settings`（单行配置表，`id = 1`）
| 字段名 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `TINYINT UNSIGNED` | `PRIMARY KEY DEFAULT 1` | 固定单行 `1` |
| `blog_title` | `VARCHAR(100)` | `NOT NULL` | 博客名称 |
| `blog_subtitle` | `VARCHAR(255)` | `NOT NULL DEFAULT ''` | 副标题 |
| `author_name` | `VARCHAR(64)` | `NOT NULL` | 博主昵称 |
| `author_handle` | `VARCHAR(64)` | `NOT NULL DEFAULT ''` | 个人 ID（如 `@linshen`） |
| `author_bio` | `VARCHAR(500)` | `NOT NULL DEFAULT ''` | 左侧名片简介 |
| `author_location` | `VARCHAR(100)` | `NOT NULL DEFAULT ''` | 所在城市 |
| `author_email` | `VARCHAR(120)` | `NOT NULL DEFAULT ''` | 联系邮箱 |
| `about_content` | `MEDIUMTEXT` | `NOT NULL` | 「关于自己 / 个人简历」Markdown |
| `admin_password_hash` | `VARCHAR(255)` | `NOT NULL` | 管理员密码哈希（严禁返回给前端） |
| `token_version` | `INT UNSIGNED` | `NOT NULL DEFAULT 1` | 改密后递增，使旧会话失效 |
| `updated_at` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

### 4.2 分类表 `categories`
| 字段名 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | `PRIMARY KEY AUTO_INCREMENT` | 分类 ID |
| `name` | `VARCHAR(64)` | `NOT NULL UNIQUE` | 分类名称 |
| `description` | `VARCHAR(255)` | `NOT NULL DEFAULT ''` | 分类简介 |
| `dot_color` | `VARCHAR(20)` | `NOT NULL DEFAULT '#3b82f6'` | 前端圆点标识色 |
| `sort_order` | `INT` | `NOT NULL DEFAULT 0` | 排序权重 |
| `created_at` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |

### 4.3 文章表 `articles`
> 注意：第一版无 `views` 阅读量字段，无评论关联表。

| 字段名 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | `PRIMARY KEY AUTO_INCREMENT` | 文章 ID |
| `title` | `VARCHAR(200)` | `NOT NULL` | 文章标题 |
| `excerpt` | `VARCHAR(500)` | `NOT NULL DEFAULT ''` | 摘要（留空时后端截取正文前 90 字） |
| `content` | `MEDIUMTEXT` | `NOT NULL` | Markdown 正文 |
| `category_id` | `BIGINT UNSIGNED` | `NULL` | 外键 `categories.id`（删除分类时置空或禁止删除有文章分类） |
| `published_at` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | 自由设定的发布时间（精确到分/秒） |
| `status` | `ENUM('published','draft')` | `NOT NULL DEFAULT 'published'` | 状态：`published` 公开，`draft` 草稿 |
| `pinned` | `TINYINT(1)` | `NOT NULL DEFAULT 0` | 是否置顶 |
| `created_at` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | 实际记录创建时间 |
| `updated_at` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最后更新时间 |

**关键索引**：
- `INDEX idx_articles_public_sort (status, pinned DESC, published_at DESC)`
- `INDEX idx_articles_category (category_id)`

### 4.4 标签表 `tags` 与关联表 `article_tags`
- `tags`: `id (BIGINT UNSIGNED PK)`, `name (VARCHAR(64) NOT NULL UNIQUE)`
- `article_tags`: `article_id (BIGINT UNSIGNED FK CASCADE)`, `tag_id (BIGINT UNSIGNED FK CASCADE)`, `PRIMARY KEY (article_id, tag_id)`
- 支持后台全局重命名标签（更新 `tags.name`，如目标名已存在则合并关联）和移除标签。

### 4.5 私有日记表 `diaries`
| 字段名 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | `PRIMARY KEY AUTO_INCREMENT` | 日记 ID |
| `entry_date` | `DATE` | `NOT NULL` | 日记日期（支持补写任意日期） |
| `entry_time` | `TIME` | `NOT NULL` | 记录时间（默认当前时间） |
| `title` | `VARCHAR(200)` | `NOT NULL` | 标题（留空自动生成 `{entry_date} 每日日报`） |
| `mood` | `ENUM('focused','calm','inspired','happy','tired')` | `NOT NULL DEFAULT 'focused'` | 心情/状态 |
| `tags_json` | `JSON` | `NOT NULL` | 日记标签数组（如 `["日报", "复盘"]`） |
| `content` | `MEDIUMTEXT` | `NOT NULL` | Markdown 正文 |
| `created_at` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

**关键索引**：
- `INDEX idx_diaries_timeline (entry_date DESC, entry_time DESC)`

---

## 5. RESTful API 接口契约

所有接口统一前缀 `/api`，统一返回 JSON 格式；错误响应遵循 FastAPI 标准或统一包装 `{"detail": "错误原因"}`。

### 5.1 认证与权限规则
- **Cookie 名称**：`blog_admin_session`
- **属性**：`httponly=True`, `samesite="lax"`, `path="/"`（若未配 HTTPS 则 `secure=False`，配置 HTTPS 后通过环境变量 `COOKIE_SECURE=true` 开启）
- **Token Payload**：`{"sub": "admin", "ver": site_settings.token_version, "exp": ...}`
- **鉴权依赖 `require_admin`**：校验签名、过期时间及 `ver == db.token_version`，失败统一返回 `401 Unauthorized`。

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| `POST` | `/api/auth/login` | 公开 | 请求体 `{"password": "..."}`；校验成功种入 HttpOnly Cookie；失败返回 `401`（建议加简单 IP 登录限流，如 1 分钟最多 10 次） |
| `POST` | `/api/auth/logout` | 公开 | 清除 `blog_admin_session` Cookie |
| `GET` | `/api/auth/me` | 公开 | 返回 `{"is_admin": true/false}`，前端启动时据此判断当前视角 |

### 5.2 公开接口（访客可用，严禁返回草稿、日记、`admin_password_hash`）
| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/public/bootstrap` | 一次性返回公开渲染所需元数据：`settings`（脱敏，不含密码哈希）、`categories`（含各分类下已发布文章数）、`tags`（仅统计已发布文章标签及计数） |
| `GET` | `/api/articles` | 查询参数：`q`（模糊匹配标题/摘要/正文/标签）、`category_id`、`tag`、`page`（默认1）、`page_size`（默认20，最大100）。**强制过滤 `status = 'published'`**，按 `pinned DESC, published_at DESC` 排序 |
| `GET` | `/api/articles/{id}` | 获取单篇**已发布**文章详情（草稿返回 `404`），同时可返回 `prev` / `next` 简略信息用于底部上下篇切换 |
| `GET` | `/api/articles/archive` | 返回已发布文章的精简字段列表（`id, title, category_id, published_at, pinned`），按 `published_at DESC` 排序供归档页按年月分组 |

### 5.3 管理员接口（全部要求 `require_admin`）
| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/admin/articles` | 获取全部文章（含 `draft` 和 `published`），支持 `status`、`q` 筛选 |
| `POST` | `/api/admin/articles` | 创建文章。`published_at` 若前端未传则取服务器当前 `Asia/Shanghai` 时间；若传了（包括过去或未来时间）则按传入值保存 |
| `PUT` | `/api/admin/articles/{id}` | 更新文章（标题、摘要、正文、分类、标签、`published_at`、`status`、`pinned`） |
| `PATCH` | `/api/admin/articles/{id}/pin` | 快捷切换置顶状态 |
| `DELETE` | `/api/admin/articles/{id}` | 删除文章（同步清理关联表） |
| `GET` | `/api/admin/diaries` | 获取日记列表，支持 `q` 与 `tag` 筛选，按 `entry_date DESC, entry_time DESC` 排序 |
| `POST` | `/api/admin/diaries` | 新建日记/日报 |
| `PUT` | `/api/admin/diaries/{id}` | 更新日记 |
| `DELETE` | `/api/admin/diaries/{id}` | 删除日记 |
| `POST` | `/api/admin/categories` | 新增分类 |
| `PUT` | `/api/admin/categories/{id}` | 修改分类 |
| `DELETE` | `/api/admin/categories/{id}` | 删除分类（若分类下仍有文章，建议返回 `400` 提示先迁移或将文章 `category_id` 置空；至少保留 1 个分类） |
| `PATCH` | `/api/admin/tags/{tag_name}` | 全局重命名标签 |
| `DELETE` | `/api/admin/tags/{tag_name}` | 全局从文章中移除某标签 |
| `PUT` | `/api/admin/settings` | 更新站点标题、博主名片信息、个人简历 `about_content` |
| `PUT` | `/api/admin/password` | 修改管理员密码（请求体：`old_password`, `new_password`），同时递增 `token_version` |

### 5.4 运维接口
- `GET /health`：执行轻量 SQL `SELECT 1`，正常返回 `200 {"status": "ok", "database": "up"}`，供 Docker `healthcheck` 使用。

---

## 6. 现有前端原型改造清单

本仓库已有完整 UI 原型，负责开发的 AI **不需要重写页面布局和样式**，仅需做以下接口适配改造：

1. **新增 `src/api/client.ts`**：
   - 封装统一 `request<T>(url, options)`，默认带上 `credentials: 'include'` 与 `Content-Type: application/json`。
   - 遇到 `401` 时自动重置前端 `isAdmin = false` 并提示登录过期。
2. **改造 `src/utils/markdown.ts`**：
   - 安装 `dompurify`，在 `renderMarkdown()` 返回前调用 `DOMPurify.sanitize(html)`。
3. **改造 `src/App.tsx`**：
   - 移除 `localStorage` 数据存储逻辑（仅保留主题偏好 `theme` 在 `localStorage`）。
   - 初始化时并发调用 `GET /api/auth/me`、`GET /api/public/bootstrap`、`GET /api/articles`。
   - 当 `isAdmin` 变为 `true` 后，按需加载 `/api/admin/articles` 和 `/api/admin/diaries`。
   - 所有的 Save / Delete / Category / Tag / Settings 回调改为调用对应后端 API 并刷新状态。
4. **改造 `src/components/LoginModal.tsx`**：
   - 移除前端硬编码密码比对与「一键体验登录」快捷按钮，改为异步提交 `POST /api/auth/login`。
5. **改造 `src/components/AdminDashboard.tsx`**：
   - 将原「恢复默认演示数据」按钮移除（生产环境不应随意覆盖真实数据库）。
   - 站点设置中的密码修改改为独立「修改管理员密码（需输入原密码 + 新密码）」表单。
   - **发布时间字段格式**：前端 `<input type="datetime-local">` 使用 `YYYY-MM-DDTHH:mm` 格式，与后端 `published_at`（ISO 字符串或 `YYYY-MM-DDTHH:mm:ss`）做好互转（截取前 16 位显示，提交时补全 `:00`）。

---

## 7. 推荐仓库目录结构与部署编排

### 7.1 目录结构
```text
blog-gemini/
├── docs/
│   └── DEVELOPMENT_SPEC.md     # 本开发文档
├── src/                        # 现有 React 前端源码
├── index.html
├── package.json
├── vite.config.ts              # 开发期配置 server.proxy['/api'] -> http://127.0.0.1:8005
├── backend/
│   ├── alembic/                # 数据库迁移脚本
│   ├── alembic.ini
│   ├── app/
│   │   ├── main.py             # FastAPI 入口、路由挂载、静态资源托管（可选）
│   │   ├── config.py           # pydantic-settings 环境变量
│   │   ├── database.py         # SQLAlchemy AsyncEngine & Session
│   │   ├── models.py           # ORM 模型定义
│   │   ├── schemas.py          # Pydantic 请求/响应模型
│   │   ├── security.py         # 密码哈希、Cookie Token 签发与 require_admin
│   │   ├── seed.py             # 首次初始化幂等脚本（仅当 site_settings 为空时写入初始配置）
│   │   └── routers/
│   │       ├── auth.py
│   │       ├── public.py
│   │       └── admin.py
│   ├── requirements.txt
│   └── Dockerfile
├── deploy/
│   ├── nginx.conf              # 托管前端 dist/ 并将 /api/、/health 反代至 backend:8000
│   ├── Dockerfile.web          # Node 构建前端 + Nginx 镜像
│   ├── compose.yaml            # 生产编排（web + backend，接入 1panel-network）
│   └── .env.example            # 环境变量模板（不含真实密钥）
```

### 7.2 生产 Docker Compose 编排要点（`deploy/compose.yaml`）
- **服务 1：`blog-backend`**
  - 内部监听 `8000` 端口（不暴露到宿主机公网）。
  - 加入 `1panel-network`（访问 `chao_mysql:3306`）和默认内部网 `blog-internal`。
  - 环境变量：`DATABASE_URL=mysql+asyncmy://blog_app:<密码>@chao_mysql:3306/personal_blog?charset=utf8mb4`、`TZ=Asia/Shanghai`、`JWT_SECRET=<随机32位以上密钥>`、`ADMIN_INIT_PASSWORD=<初始密码>`、`COOKIE_SECURE=false`。
  - 内存限制建议：`mem_limit: 384m`，日志轮转 `max-size: 10m`, `max-file: 3`，重启策略 `unless-stopped`。
- **服务 2：`blog-web`（Nginx）**
  - 多阶段构建前端 `dist/`，挂载/内置 `nginx.conf`：
    - `/` 走 SPA `try_files $uri $uri/ /index.html;`
    - `/api/` 与 `/health` 反向代理到 `http://blog-backend:8000`，透传 `Host`、`X-Real-IP`、`X-Forwarded-For`。
  - 端口映射示例：`8005:80`（避免与现有 `80` / `8002` / `8003` 冲突）。
  - 内存限制建议：`mem_limit: 128m`。

---

## 8. 开发完成验收清单（交给下游 AI 自检）

1. **访客权限隔离测试**：
   - 未登录状态下请求 `/api/admin/diaries`、`/api/admin/articles`、`/api/admin/settings` 必须全部返回 `401`。
   - 未登录请求 `GET /api/articles` 不得出现 `status = 'draft'` 的文章；请求草稿详情 `GET /api/articles/{draft_id}` 返回 `404`。
   - `GET /api/public/bootstrap` 返回结果中绝不包含 `admin_password_hash`。
2. **自定义发布时间测试**：
   - 创建文章不修改时间时，默认保存当前东八区时间。
   - 创建文章将 `published_at` 设为未来日期（如 `2026-12-01 09:00`）且 `status = 'published'`，访客首页立即可见，且排序位于普通近期文章之前、置顶文章之后。
3. **每日日记闭环测试**：
   - 登录后进入「每日日记」，套用日报模板并修改日期为前一天进行补写，刷新页面后数据从 MySQL 持久化加载无丢失。
4. **个人简历与后台测试**：
   - 在后台修改「关于自己 / 个人简历」Markdown 并保存，退出管理员登录后在访客视角查看「关于自己」页面，确认更新立即生效且无 XSS 风险。
5. **移动端与视觉回归**：
   - 保持磨砂玻璃三栏样式及移动端抽屉、底部固定导航无破坏、无横向溢出。
