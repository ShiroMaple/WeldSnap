Write-Host "================================" -ForegroundColor Cyan
Write-Host " WeldSnap - Clean & Dev" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# [1/3] 停止占用 3000 端口的旧进程
Write-Host "[1/3] Stopping old process on port 3000 ..." -ForegroundColor Yellow
$portCheck = netstat -ano | Select-String ":3000\s" | Select-String "LISTENING"
if ($portCheck) {
    $pid = ($portCheck -split "\s+")[-1]
    taskkill /F /PID $pid 2>$null
    Write-Host "      Killed PID $pid." -ForegroundColor Green
} else {
    Write-Host "      Port 3000 is free." -ForegroundColor DarkGray
}
Write-Host ""

# [2/3] 清理 .next 缓存
Write-Host "[2/3] Cleaning .next ..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next"
    Write-Host "      Done." -ForegroundColor Green
} else {
    Write-Host "      .next not found, skipped." -ForegroundColor DarkGray
}
Write-Host ""

# [3/3] 启动开发服务器
Write-Host "[3/3] Starting pnpm dev ..." -ForegroundColor Yellow
Write-Host ""
pnpm build
pnpm start
