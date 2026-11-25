#!/bin/sh
# 容器入口：数据库迁移 -> 幂等 seed -> uvicorn
# 注意：本文件必须保持 LF 换行（Dockerfile 里另有 sed 兜底，防止 Windows 检出变成 CRLF）。
set -eu

echo "[entrypoint] 1/3 执行数据库迁移：alembic upgrade head"
alembic upgrade head

echo "[entrypoint] 2/3 执行幂等初始化：python -m app.seed"
python -m app.seed

WORKERS="${UVICORN_WORKERS:-2}"
echo "[entrypoint] 3/3 启动 uvicorn：0.0.0.0:8000 workers=${WORKERS}"
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers "${WORKERS}" \
    --proxy-headers \
    --forwarded-allow-ips='*' \
    --no-server-header
