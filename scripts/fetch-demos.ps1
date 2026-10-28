# fetch-demos.ps1 — Windows/受限网络下的 demo 参考代码拉取（Invoke-WebRequest，逐文件、可断点续传）。
#
#   powershell -File scripts\fetch-demos.ps1                 # 全部（约 1500 文件 / 17 MB）
#   powershell -File scripts\fetch-demos.ps1 -Only impasto,blueprint
#   powershell -File scripts\fetch-demos.ps1 -DryRun
#
# 只拉 demo 的代码/配置/文档（不含图片音频字体）；不写 lemo-opuscar 库。
# 比 fetch-demos.mjs 慢但稳（Node fetch 在部分网络会失败）。

param(
  [string]$Only = "",
  [switch]$DryRun,
  [string]$Ref = ""
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$skill = Split-Path $PSScriptRoot -Parent
$out = Join-Path $skill "vendor\lemo-demos"
$lib = if ($env:LEMO_OPUSCAR_HOME) { $env:LEMO_OPUSCAR_HOME } else { Join-Path (Split-Path $skill -Parent | Split-Path -Parent) "lemo-opuscar" }
if (-not (Test-Path (Join-Path $lib ".lemo-tree.json"))) {
  $lib = Join-Path $env:USERPROFILE "lemo-opuscar"
}
if (-not (Test-Path (Join-Path $lib ".lemo-tree.json"))) { throw "找不到 lemo-opuscar 库（.lemo-tree.json）" }

$keepExt = @('.js', '.mjs', '.cjs', '.py', '.sh', '.ps1', '.html', '.htm', '.css', '.json', '.jsonl', '.ts', '.tsx', '.srt', '.md', '.txt')
$tree = [System.IO.File]::ReadAllText((Join-Path $lib ".lemo-tree.json")) | ConvertFrom-Json
$onlySet = @($Only.Split(",") | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() })

$files = @($tree.tree | Where-Object {
    $_.type -eq 'blob' -and $_.path -like 'styles/*/demo/*' -and
    ($keepExt -contains [System.IO.Path]::GetExtension($_.path).ToLower()) -and
    ($onlySet.Count -eq 0 -or $onlySet -contains $_.path.Split('/')[1])
  })
if ($files.Count -eq 0) { throw "没有可下载的文件" }

if (-not $Ref) {
  try {
    $j = Invoke-WebRequest -Uri "https://api.github.com/repos/lemomo-ai/lemo-opuscar/commits/main" -UseBasicParsing -TimeoutSec 30 -Headers @{ 'User-Agent' = 'code-mv-fetch' } | ConvertFrom-Json
    $Ref = $j.sha
  } catch { $Ref = "main" }
}
$base = "https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/$Ref/"
$totalMB = [math]::Round(($files | Measure-Object size -Sum).Sum / 1MB, 1)
Write-Host "库: $lib"
Write-Host "下载源: github.com/lemomo-ai/lemo-opuscar @ $Ref"
Write-Host "目标: $out"
Write-Host "文件: $($files.Count) 个，约 $totalMB MB"
if ($DryRun) { return }

New-Item -ItemType Directory -Force -Path $out | Out-Null
$manifest = [ordered]@{ source = "https://github.com/lemomo-ai/lemo-opuscar"; ref = $Ref; fetchedAt = (Get-Date).ToString("o"); files = @(); failed = @() }
$done = 0; $skipped = 0; $bytes = 0; $sw = [System.Diagnostics.Stopwatch]::StartNew()
foreach ($f in $files) {
  $dest = Join-Path $out ($f.path -replace '/', '\')
  if ((Test-Path $dest) -and ((Get-Item $dest).Length -eq $f.size)) { $skipped++; $done++; continue }
  $uri = $base + (($f.path.Split('/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
  $ok = $false
  for ($i = 0; $i -lt 3; $i++) {
    try {
      New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
      Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 40 -OutFile $dest
      $ok = $true; break
    } catch { Start-Sleep -Milliseconds (600 * ($i + 1)) }
  }
  if ($ok) { $bytes += (Get-Item $dest).Length; $manifest.files += [ordered]@{ path = $f.path; bytes = (Get-Item $dest).Length } }
  else { $manifest.failed += [ordered]@{ path = $f.path; error = "download failed" }; Write-Warning "失败: $($f.path)" }
  $done++
  if ($done % 50 -eq 0) { Write-Host ("  {0}/{1}  {2} MB  {3:0}s" -f $done, $files.Count, [math]::Round($bytes / 1MB, 1), $sw.Elapsed.TotalSeconds) }
}
$manifest.skipped = $skipped
$manifest.newFiles = $manifest.files.Count
$manifest.failedCount = $manifest.failed.Count
[System.IO.File]::WriteAllText((Join-Path $out "MANIFEST.json"), ($manifest | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "完成：新增 $($manifest.files.Count)，跳过 $skipped，失败 $($manifest.failed.Count)，耗时 $([math]::Round($sw.Elapsed.TotalSeconds))s"
Write-Host "commit: $Ref"
if ($manifest.failed.Count) { exit 2 }
