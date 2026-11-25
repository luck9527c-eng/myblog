# blog-gemini · backend

个人博客 + 私有日报系统的后端服务：**FastAPI + SQLAlchemy 2.0 (async) + aiomysql + MySQL 8.0 + Alembic**。
接口契约见 `docs/API_CONTRACT.md`，数据模型见 `docs/DEVELOPMENT_SPEC.md` 第 4 章。

---

## 1. 技术栈与固定版本

| 层 | 选型 | 版本 |
|---|---|---|
| Web | FastAPI + Uvicorn | 0.115.6 / 0.34.0 |
| ORM | SQLAlchemy 2.0 async | 2.0.36 + greenlet 3.1.1 |
| 驱动 | **aiomysql**（依赖 PyMySQL） | 0.2.0 / 1.1.1 |
| 迁移 | Alembic | 1.14.0 |
| 校验/配置 | Pydantic v2 + pydantic-settings | 2.10.4 / 2.7.0 |
| 会话 | PyJWT(HS256) + HttpOnly Cookie | 2.10.1 |
| 密码 | **直接调用 bcrypt**（不使用 passlib） | 4.2.1 |

> **为什么是 aiomysql 而不是 asyncmy**：目标镜像是 `python:3.12-slim`，镜像内没有编译工具链；
> `asyncmy` 需要现场编译 C 扩展，`aiomysql` 是纯 Python，安装零风险。
>
> **为什么显式固定 `cryptography`**：MySQL 8.0 默认认证插件是 `caching_sha2_password`，
> PyMySQL/aiomysql 处理该插件时必须依赖 `cryptography`，否则连接即报
> `cryptography package is required for sha256_password or caching_sha2_password auth methods`。
> 本仓库固定 `cryptography==43.0.3`（提供 manylinux wheel，镜像内无需编译）。
>
> **为什么显式固定 `greenlet`**：SQLAlchemy 2.0 的 async 能力（`AsyncSession` / async engine /
> `session.flush()` 内部的 greenlet 桥接）依赖 greenlet；SQLAlchemy 只会按平台**条件性**安装它，
> 某些 Python 版本组合下会被跳过，缺失时一连接数据库就会抛
> `ValueError: the greenlet library is required to use this function`。

---

## 2. 目录结构

```text
backend/
├── app/
│   ├── main.py              # FastAPI app、CORS、异常处理、GET /health
│   ├── config.py            # pydantic-settings 环境变量（无任何硬编码密钥）
│   ├── database.py          # async engine / async_sessionmaker / Base / get_session
│   ├── models.py            # 5 张表 + article_tags 的 ORM 模型（InnoDB/utf8mb4_unicode_ci）
│   ├── schemas.py           # Pydantic 请求/响应模型 + ORM→响应转换
│   ├── security.py          # bcrypt、JWT Cookie、require_admin、登录限流
│   ├── seed.py              # 幂等初始化（python -m app.seed）
│   ├── utils.py             # 上海时间解析/格式化、摘要截取、LIKE 转义、检索条件
│   └── routers/
│       ├── auth.py          # /api/auth/login|logout|me
│       ├── public.py        # /api/public/bootstrap、/api/articles*（含 archive、详情）
│       └── admin.py         # /api/admin/**（文章/日记/分类/标签/设置/改密）
├── alembic/
│   ├── env.py               # 同步驱动执行迁移（aiomysql → pymysql）
│   └── versions/0001_initial.py   # 手写 DDL，与 models.py 逐列一致
├── tests/                   # pytest（httpx ASGITransport 直连 app，真实 MySQL）
├── alembic.ini
├── pytest.ini
├── requirements.txt
├── entrypoint.sh            # alembic upgrade head → python -m app.seed → uvicorn
├── Dockerfile
└── .env                     # 本地开发用（**不进镜像、不进版本库**）
```

---

## 3. 环境变量清单

所有配置项来自环境变量（也支持本地 `backend/.env`，由 pydantic-settings 读取）；
源码与镜像内**不含任何默认密码或密钥**。

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | 必须形如 `mysql+aiomysql://user:pw@host:3306/personal_blog?charset=utf8mb4` |
| `JWT_SECRET` | ✅ | — | HS256 签名密钥，长度 ≥ 16（生产建议 32 位以上随机串） |
| `ADMIN_INIT_PASSWORD` | 首次启动 ✅ | — | 仅当 `site_settings` 表为空时用于初始化管理员密码；缺失时 `python -m app.seed` 直接报错退出（退出码 1） |
| `TEST_DATABASE_URL` | 跑测试 ✅ | — | 独立测试库（如 `personal_blog_test`），pytest 会 DROP/重建其中的表 |
| `COOKIE_SECURE` | | `false` | 上 HTTPS 后设为 `true`（Cookie 的 Secure 属性） |
| `SESSION_TTL_HOURS` | | `168` | 会话有效期（小时），同时作为 Cookie `max_age` |
| `BCRYPT_ROUNDS` | | `12` | bcrypt cost；测试里设为 4 加速 |
| `LOGIN_RATE_LIMIT_MAX` | | `10` | 登录限流：窗口内最多失败次数 |
| `LOGIN_RATE_LIMIT_WINDOW` | | `60` | 登录限流窗口（秒） |
| `CORS_ALLOW_ORIGINS` | | `http://localhost:5173,http://127.0.0.1:5173` | 逗号分隔；生产同源部署可留空 |
| `DB_USE_NULL_POOL` | | `false` | **仅测试**用：禁用连接池（避免跨事件循环复用连接） |
| `UVICORN_WORKERS` | | `2` | 由 `entrypoint.sh` 读取（容器内 uvicorn worker 数） |
| `LOG_LEVEL` | | `INFO` | 日志级别 |
| `TZ` | | `Asia/Shanghai` | Dockerfile 已内置，无需另行设置 |

> Cookie 名称固定为 `blog_admin_session`（契约 §0.3），不作为可配置项暴露。

---

## 4. 本地运行

```powershell
cd backend

# 1) 虚拟环境（Python 3.12/3.13 均可；目标运行时是 Docker 里的 3.12）
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/

# 2) 准备 backend/.env（至少 DATABASE_URL / JWT_SECRET / ADMIN_INIT_PASSWORD）
# 3) 建表 + 幂等初始化
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.seed

# 4) 启动（本地别占 8005，用 8000/8010 均可）
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

自检入口：

* `GET http://127.0.0.1:8000/health` → `{"status":"ok","database":"up"}`
* `GET http://127.0.0.1:8000/api/public/bootstrap`
* Swagger UI：`http://127.0.0.1:8000/api/docs`，OpenAPI：`/api/openapi.json`

`alembic.ini` 内不写数据库地址（且保持纯 ASCII，避免 Windows 本地 GBK 读取报错）；
`alembic/env.py` 从 `DATABASE_URL` 取值并把 `mysql+aiomysql://` 换成同步驱动 `mysql+pymysql://`。

---

## 5. 跑测试

```powershell
cd backend
$env:TEST_DATABASE_URL = "mysql+aiomysql://blog_app:<密码>@127.0.0.1:3306/personal_blog_test?charset=utf8mb4"
.\.venv\Scripts\python.exe -m pytest -q
```

说明：

* 未显式设置 `TEST_DATABASE_URL` 时，`tests/conftest.py` 会回退读取 `backend/.env` 里的同名变量；
  两者都没有则直接 `pytest.exit` 并提示。
* 建表方式：conftest 先 `DROP TABLE`（测试库内 7 张表）再执行 `alembic upgrade head`，
  顺带验证迁移脚本本身。
* 每个用例前清空业务数据（`DELETE`，不依赖 TRUNCATE 权限）并写入一条已知管理员配置（密码 `pytest-admin-pass-123`）。
* 客户端是 `httpx.AsyncClient(transport=ASGITransport(app=app))`，**不启动 uvicorn、不占端口、不依赖外部服务**。
* 覆盖范围：`docs/API_CONTRACT.md` §5 的 7 条验收 + 登录限流 / 改密后旧会话失效 /
  标签重命名与合并 / 分类删除规则 / 文章删除清理关联表 / 时间格式与分页边界等。

---

## 6. Docker

```bash
# 构建（上下文是 backend/）
docker build -t blog-backend:latest ./backend

# 运行（.env 由部署侧提供，镜像内不含 .env）
docker run --rm -p 8005:8000 \
  -e DATABASE_URL="mysql+aiomysql://blog_app:***@chao_mysql:3306/personal_blog?charset=utf8mb4" \
  -e JWT_SECRET="***" -e ADMIN_INIT_PASSWORD="***" -e COOKIE_SECURE=false \
  blog-backend:latest
```

镜像要点：

* 基础镜像 `python:3.12-slim`，PyPI 走阿里云镜像 `https://mirrors.aliyun.com/pypi/simple/`；
* 安装 `tzdata` 并把时区固定为 `TZ=Asia/Shanghai`；
* 以非 root 用户 `appuser`(uid 10001) 运行；
* `HEALTHCHECK` 用标准库 `urllib` 请求 `http://127.0.0.1:8000/health`（不额外安装 curl）；
* `ENTRYPOINT` 为 `entrypoint.sh`：`alembic upgrade head` → `python -m app.seed` → `uvicorn`（workers 由 `UVICORN_WORKERS` 控制，默认 2，监听 `0.0.0.0:8000`）；
* `.dockerignore` 排除 `.env` / `.venv` / 缓存，保证镜像里没有任何密钥；
* 镜像内一并安装 pytest 与 tests/，便于在服务器上直接 `docker compose exec blog-backend pytest -q`。

---

## 7. 实现约定（与 API_CONTRACT.md 对齐）

* **JSON 出参与请求体一律 camelCase**（`alias_generator=to_camel` + `populate_by_name=True`），
  查询参数保持 snake_case：`q` / `category_id` / `tag` / `page` / `page_size` / `status`。
* **所有 id 在 JSON 中是字符串**（DB 为 BIGINT UNSIGNED）；`categoryId` 无分类时是 JSON `null`。
* **时间**：数据库里存 naive 的 Asia/Shanghai 时间；输出 `YYYY-MM-DDTHH:mm:ss`，日记 `time` 输出 `HH:mm`；
  写入兼容 `YYYY-MM-DDTHH:mm`、`YYYY-MM-DDTHH:mm:ss`、`YYYY-MM-DD HH:mm`、`YYYY-MM-DD HH:mm:ss`
  （以及带毫秒/时区后缀的 ISO 串，统一折算为上海时间）。MySQL `TIME` 列读回可能是
  `datetime.timedelta`，`utils.fmt_time` 已兼容。
* **`publishedAt` 缺省**：`POST` 未传 / 传 `null` / 传空串 → 服务器当前上海时间；
  `PUT` 未传 / 传 `null` → 保留原发布时间（避免编辑时误改发布时间），显式传值才更新。
* **`excerpt`**：留空（`""`/`null`/未传）时自动截取 Markdown 正文纯文本前 90 字。
* **错误格式**：统一 `{"detail": "<中文>"}`；`400` 业务冲突、`401` 未鉴权、`404` 不存在、
  `429` 登录限流；请求体校验失败返回 `422`，`detail` 也被压成字符串（前端只需读 `detail`）。
* **鉴权**：Cookie `blog_admin_session`（httponly / samesite=lax / path=/，secure 由 `COOKIE_SECURE` 控制）；
  JWT payload `{"sub":"admin","ver":<token_version>,"exp":...}`；`require_admin` 校验签名 + 过期 +
  `ver == site_settings.token_version`，任一失败一律 401。改密后 `token_version+1` 并为当前会话重签 Cookie。
* **登录限流**：进程内滑动窗口（`threading.Lock` 保护），同 IP 每分钟最多 10 次失败，超出 429。
  多 worker 部署时每个 worker 独立计数（第一版可接受；如需全局限流可后续换 Redis）。
* **`prev` / `next`**（详情接口）：按列表排序序列 `pinned DESC, published_at DESC, id DESC` 取相邻文章，
  `prev` = 上一篇（发布时间更早，即序列中位于当前文章之后），`next` = 下一篇（更晚）；无则 `null`。
* **标签**：输入自动去空、去前导 `#`、大小写不敏感去重、保持出现顺序；不存在则创建；
  `PUT` 传入完整集合替换原关联。重命名时若目标名已存在则合并（`merged: true`）。
* **分类删除**：分类下仍有文章 → `400 该分类下仍有 N 篇文章，请先迁移`；全站仅剩 1 个分类 →
  `400 至少保留一个分类`；其余情况删除成功（DB 侧 `ON DELETE SET NULL` 兜底）。
* **`{ok:true}` 系列**：删除文章/日记/分类、改密返回 `{"ok": true}`；
  标签删除返回 `{"ok": true, "affected": n}`；标签重命名返回 `{"ok": true, "name": ..., "merged": bool, "affected": n}`。
* **`/health`** 无 `/api` 前缀，执行 `SELECT 1`；成功 `{"status":"ok","database":"up"}`，数据库异常 `503` 且
  响应体 `{"status":"error","database":"down"}`。
