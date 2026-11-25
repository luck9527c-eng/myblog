# 本地开发一键启动：MySQL(已就绪) → 后端 127.0.0.1:8005 → 前端 127.0.0.1:5173
#
# 用法：
#   pwsh -File scripts/dev.ps1            # 正常启动（后端热重载）
#   pwsh -File scripts/dev.ps1 -NoReload  # 关闭后端热重载
#
# 前置条件：本机 MySQL 8.0 已运行，backend/.env 已按 backend/.env.example 配好。

param(
    [switch]$NoReload
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root 'backend'
$venvPython = Join-Path $backendDir '.venv\Scripts\python.exe'

if (-not (Test-Path $backendDir)) {
    throw "未找到 backend 目录：$backendDir"
}
if (-not (Test-Path (Join-Path $backendDir '.env'))) {
    throw "缺少 backend/.env，请先复制 backend/.env.example 为 backend/.env 并填写 DATABASE_URL / JWT_SECRET"
}

# 1) 准备虚拟环境（首次运行会安装依赖，使用阿里云镜像）
if (-not (Test-Path $venvPython)) {
    Write-Host '[1/3] 创建 Python 虚拟环境 backend/.venv ...' -ForegroundColor Cyan
    python -m venv (Join-Path $backendDir '.venv')
    & $venvPython -m pip install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/ --quiet
    & $venvPython -m pip install -r (Join-Path $backendDir 'requirements.txt') -i https://mirrors.aliyun.com/pypi/simple/
} else {
    Write-Host '[1/3] 复用已有虚拟环境 backend/.venv' -ForegroundColor Cyan
}

# 2) 数据库迁移 + 幂等初始化
Write-Host '[2/3] 执行 alembic upgrade head 与 seed ...' -ForegroundColor Cyan
Push-Location $backendDir
try {
    & $venvPython -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'alembic upgrade head 失败' }
    & $venvPython -m app.seed
    if ($LASTEXITCODE -ne 0) { throw 'python -m app.seed 失败' }
} finally {
    Pop-Location
}

# 3) 启动后端与前端
Write-Host '[3/3] 启动服务 ...' -ForegroundColor Cyan

$uvicornArgs = @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8005')
if (-not $NoReload) { $uvicornArgs += '--reload' }

Start-Process -FilePath $venvPython `
    -ArgumentList $uvicornArgs `
    -WorkingDirectory $backendDir `
    -WindowStyle Normal

Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', 'npm run dev' `
    -WorkingDirectory $root `
    -WindowStyle Normal

Start-Sleep -Seconds 3
Write-Host ''
Write-Host '后端 API   : http://127.0.0.1:8005/docs   (OpenAPI)   健康检查 http://127.0.0.1:8005/health' -ForegroundColor Green
Write-Host '前端页面   : http://127.0.0.1:5173       (Vite 已把 /api 代理到 8005)' -ForegroundColor Green
Write-Host '管理员入口 : 左侧栏底部「管理员登录」→ 密码见 backend/.env 的 ADMIN_INIT_PASSWORD' -ForegroundColor Green
