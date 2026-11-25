# 部署手册（腾讯云 Ubuntu 24.04 + Docker Compose）

> 目标主机：`119.91.211.43`（Ubuntu 24.04 LTS，Docker Engine 27.5+ / Compose v2，**宿主机无 Node.js**）。
> 本项目所有前端构建都发生在 Docker 多阶段构建内部，宿主机不需要装 Node。

## 0. 架构与端口

```
浏览器 ──:8005──> blog-web (Nginx, 静态 dist + 反向代理)
                        │  内部网络 blog-internal
                        ▼
                  blog-backend (FastAPI + Uvicorn, 8000, 不发布宿主机端口)
                        │  外部网络 1panel-network
                        ▼
                  chao_mysql:3306 (MySQL 8.0.46, 独立库 personal_blog)
```

| 端口 | 用途 | 冲突说明 |
|---|---|---|
| `8005` | 博客对外入口（→ 容器 80） | 80/8002/3306 已被 lhc-frontend、workbuddy2api-hub、chao_mysql 占用，8003/8004 为历史保留 |
| `8000` | 后端容器内部端口 | 不发布到宿主机 |
| `3306` | MySQL | 已有，博客不直接暴露 |

容器名：`blog-web`、`blog-backend`。内存限制：web 128m、backend 384m。日志轮转 10m×3，重启策略 `unless-stopped`。

## 1. 数据库与账号（一次性，在 chao_mysql 中执行）

**隔离要求**：独立库 `personal_blog` + 独立账号 `blog_app`，只授予 `personal_blog.*`，禁止触碰其它业务库。

```bash
# 在服务器上执行（密码请自行替换为强随机值，建议 openssl rand -hex 20）
sudo docker exec -i chao_mysql bash -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' <<'SQL'
CREATE DATABASE IF NOT EXISTS `personal_blog`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'blog_app'@'%' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON `personal_blog`.* TO 'blog_app'@'%';
FLUSH PRIVILEGES;
SQL

# 验证账号只能看到自己的库
sudo docker exec -i chao_mysql bash -c \
  'MYSQL_PWD=REPLACE_WITH_STRONG_PASSWORD mysql -h127.0.0.1 -ublog_app -N \
   -e "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA;"'
```

> 如需与后端自动化测试共用该实例，可额外建 `personal_blog_test` 并同样授予 `blog_app`。

## 2. 上传代码

宿主机没有 Node，代码里也不含密钥。推荐用 `scp`/`rsync`（该目录不是 git 仓库）：

```bash
# 本地执行（排除 node_modules / dist / .env / .venv）
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude '.env' --exclude '.venv' --exclude '__pycache__' \
  ./ ubuntu@119.91.211.43:/opt/blog-gemini/app/
```

服务器上的目录布局：

```
/opt/blog-gemini/app/          # 代码（backend/ src/ deploy/ package.json ...）
/opt/blog-gemini/app/deploy/.env   # 真实密钥，chmod 600，绝不提交
```

## 3. 配置密钥

```bash
cd /opt/blog-gemini/app/deploy
cp .env.example .env
chmod 600 .env
# 必填：DATABASE_URL / JWT_SECRET / ADMIN_INIT_PASSWORD
#   JWT_SECRET:            openssl rand -hex 32
#   DATABASE_URL:          mysql+aiomysql://blog_app:密码@chao_mysql:3306/personal_blog?charset=utf8mb4
#   ADMIN_INIT_PASSWORD:   首次启动写入的管理员密码（6~64 位），登录后请立刻在后台修改
#   COOKIE_SECURE:         未上 HTTPS 保持 false
```

**密码含 `@ : / ? #` 时必须 URL 编码**，否则 SQLAlchemy 解析 DATABASE_URL 会失败。

## 4. 构建并启动

```bash
cd /opt/blog-gemini/app/deploy
docker compose up -d --build
docker compose ps
docker compose logs -f blog-backend
```

后端容器启动流程（`entrypoint.sh`）：
`alembic upgrade head` → `python -m app.seed`（幂等，仅首次写入站点配置/默认分类）→ `uvicorn`（2 worker）。

`docker compose ps` 应在 30~60 秒后显示两个服务均为 `healthy`。

## 5. 验证清单

```bash
# 后端健康（含真实 SELECT 1）
curl -s http://127.0.0.1:8005/health
# => {"status":"ok","database":"up"}

# 公开元数据（不得出现密码哈希）
curl -s http://127.0.0.1:8005/api/public/bootstrap | head -c 400

# 未登录访问管理接口必须 401
curl -s -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:8005/api/admin/articles   # => 401
curl -s -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:8005/api/admin/diaries     # => 401

# 登录（成功后用 -c 保存 Cookie）
curl -s -c /tmp/c.txt -H 'Content-Type: application/json' \
  -d '{"password":"<ADMIN_INIT_PASSWORD>"}' \
  http://127.0.0.1:8005/api/auth/login        # => {"isAdmin":true}

# 带 Cookie 访问管理接口
curl -s -b /tmp/c.txt http://127.0.0.1:8005/api/admin/diaries | head -c 200
```

浏览器侧：`http://119.91.211.43:8005/`（需云安全组放行 TCP 8005，见下）。

## 6. 云安全组

宿主机层面已监听 `8005`；**公网能否访问取决于腾讯云安全组**，需要在控制台/API 放行 TCP `8005`（源可限制为常用 IP）。该步骤无法从主机内部完成。

## 7. 日常运维

```bash
cd /opt/blog-gemini/app/deploy

docker compose logs -f --tail=100 blog-backend   # 看日志
docker compose restart blog-backend              # 重启
docker compose up -d --build blog-web            # 只重建前端（改了 src/ 时）
docker compose up -d --build blog-backend        # 只重建后端（改了 backend/ 时）

# 升级前备份数据库（强烈建议）
docker exec chao_mysql sh -c \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines \
   personal_blog' > /opt/blog-gemini/backups/personal_blog-$(date +%Y%m%d-%H%M%S).sql
```

回滚：`git`-less 目录，请保留上一次的 `app` 目录副本（或发布 `releases/<时间戳>` 目录 + 软链），改回后重新 `docker compose up -d --build`。

## 8. 常见问题

| 现象 | 原因与处理 |
|---|---|
| 后端反复重启，日志 `Access denied for user 'blog_app'` | `DATABASE_URL` 密码错误或未 URL 编码；确认 `blog_app` 能从容器访问（同一 `1panel-network`） |
| 日志 `Can't connect to MySQL server on 'chao_mysql'` | 后端没加入 `1panel-network`，或 `chao_mysql` 改名/停止 |
| 前端 502 | 后端未 healthy；`docker compose logs blog-backend` 查看 alembic 是否失败 |
| 登录后刷新又变访客 | Cookie 未带上：确认访问域名与 `COOKIE_SECURE` 匹配（HTTP 下必须 `false`） |
| `alembic upgrade head` 报 `Table already exists` | 库里已有手工建的表；`alembic stamp head` 后在干净库上重跑 |
| 页面样式正常但无数据 | `/api` 反代未生效，检查 `nginx.conf` 的 `location /api/` 与容器网络 |
