# syntax=docker/dockerfile:1
# blog-gemini 后端镜像：python:3.12-slim（目标运行时，务必与本地 3.13 语法检查区分）
# 镜像内不含任何 .env 或密钥，全部运行期通过环境变量注入。
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=Asia/Shanghai \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# tzdata 用于 Asia/Shanghai 时区（含 /usr/share/zoneinfo），并做时区软链接
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends tzdata \
    && ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

# 国内 PyPI 镜像（阿里云）
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ \
    && pip config set global.trusted-host mirrors.aliyun.com

WORKDIR /app

# 先装依赖，充分利用镜像层缓存
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 再拷贝应用代码（不含 .env / 虚拟环境，见 .dockerignore）
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY tests ./tests
COPY pytest.ini ./
COPY entrypoint.sh ./

# 兼容 Windows 检出可能带入的 CRLF，并赋可执行权限
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

# 非 root 用户运行
RUN useradd --system --uid 10001 --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# 健康检查直接打 /health（无 /api 前缀），用标准库 urllib 避免额外装 curl
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"]

ENTRYPOINT ["./entrypoint.sh"]
