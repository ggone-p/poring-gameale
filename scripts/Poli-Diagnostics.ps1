param(
  [switch]$NoOpen
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$report = New-Object System.Collections.Generic.List[string]
$desktop = [Environment]::GetFolderPath('Desktop')
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportPath = Join-Path $desktop "波利AI图助手-诊断报告-$timestamp.txt"

function Add-ReportLine {
  param([string]$Text = '')
  $script:report.Add($Text)
}

function Add-Section {
  param([string]$Title)
  Add-ReportLine ''
  Add-ReportLine "========== $Title =========="
}

function Format-Bytes {
  param([long]$Bytes)
  if ($Bytes -ge 1GB) { return ('{0:N2} GB' -f ($Bytes / 1GB)) }
  if ($Bytes -ge 1MB) { return ('{0:N1} MB' -f ($Bytes / 1MB)) }
  if ($Bytes -ge 1KB) { return ('{0:N1} KB' -f ($Bytes / 1KB)) }
  return "$Bytes B"
}

function Get-FolderSize {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return 0 }
  $sum = (Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
    Measure-Object Length -Sum).Sum
  if ($null -eq $sum) { return 0 }
  return [long]$sum
}

function Test-Tcp443 {
  param([string]$HostName)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($HostName, 443, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(5000)) {
      return 'FAIL (timeout)'
    }
    $client.EndConnect($async)
    return 'OK'
  } catch {
    return "FAIL ($($_.Exception.Message))"
  } finally {
    $client.Close()
  }
}

function Invoke-CurlProbe {
param(
    [string]$Name,
    [string]$Url,
    [switch]$Http11
  )
  $arguments = @(
    '-L',
    '-I',
    '--connect-timeout', '8',
    '--max-time', '20',
    '--silent',
    '--show-error',
    '--output', 'NUL',
    '--write-out', 'HTTP=%{http_code}; IP=%{remote_ip}; TIME=%{time_total}s'
  )
  if ($Http11) { $arguments += '--http1.1' }
  $arguments += $Url
  $output = (& curl.exe @arguments 2>&1 | Out-String).Trim()
  $exitCode = $LASTEXITCODE
  $protocol = if ($Http11) { 'HTTP/1.1' } else { '默认协议' }
  Add-ReportLine "[$Name][$protocol] exit=$exitCode  $output"
  return [PSCustomObject]@{
    ExitCode = $exitCode
    Output = $output
  }
}

Add-ReportLine '波利AI图助手 - 网络与本地 AI 环境诊断报告'
Add-ReportLine "生成时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
Add-ReportLine '说明：本脚本只读取状态，不删除、不修复、不上传任何文件。'

Add-Section '系统信息'
Add-ReportLine "计算机：$env:COMPUTERNAME"
Add-ReportLine "用户：$env:USERNAME"
Add-ReportLine "Windows：$([Environment]::OSVersion.VersionString)"
Add-ReportLine "PowerShell：$($PSVersionTable.PSVersion)"
Add-ReportLine "64位系统：$([Environment]::Is64BitOperatingSystem)"
try {
  $driveName = ($env:SystemDrive).TrimEnd(':')
  $systemDrive = Get-PSDrive -Name $driveName -ErrorAction Stop
  Add-ReportLine "系统盘可用空间：$(Format-Bytes $systemDrive.Free)"
} catch {
  Add-ReportLine "系统盘空间读取失败：$($_.Exception.Message)"
}

Add-Section '波利助手版本'
$uninstallRoots = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$installedEntries = Get-ItemProperty $uninstallRoots -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like '*波利AI图助手*' }
if ($installedEntries) {
  foreach ($entry in $installedEntries) {
    Add-ReportLine "已安装版本：$($entry.DisplayVersion) | $($entry.DisplayName)"
    Add-ReportLine "卸载程序：$($entry.UninstallString)"
  }
} else {
  Add-ReportLine '卸载注册表中未找到波利AI图助手版本。'
}
$appCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\feishu-asset-floating-uploader\波利AI图助手.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\波利AI图助手\波利AI图助手.exe'),
  (Join-Path $env:LOCALAPPDATA '波利AI图助手\波利AI图助手.exe'),
  (Join-Path $env:ProgramFiles '波利AI图助手\波利AI图助手.exe'),
  (Join-Path $env:ProgramFiles 'feishu-asset-floating-uploader\波利AI图助手.exe')
)
$appFound = $false
foreach ($candidate in $appCandidates) {
  if (Test-Path -LiteralPath $candidate) {
    $appFound = $true
    $versionInfo = (Get-Item -LiteralPath $candidate).VersionInfo
    Add-ReportLine "程序：$candidate"
    Add-ReportLine "EXE 内核版本：$($versionInfo.FileVersion)（Electron 版本，不是波利助手版本）"
  }
}
if (-not $appFound) {
  Add-ReportLine '未在常见安装目录找到波利AI图助手.exe。'
}

Add-Section '代理设置'
Add-ReportLine 'WinHTTP 代理：'
try {
  (netsh winhttp show proxy 2>&1) | ForEach-Object { Add-ReportLine "  $_" }
} catch {
  Add-ReportLine "  读取失败：$($_.Exception.Message)"
}
foreach ($proxyName in @('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY')) {
  $present = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($proxyName))
  $proxyStatus = if ($present) { '已设置（值已隐藏）' } else { '未设置' }
  Add-ReportLine "$proxyName：$proxyStatus"
}

Add-Section 'DNS 与 TCP 443'
Add-ReportLine '说明：TCP443 为不经过 HTTP 代理的直连测试；配置代理时应以随后 curl 结果为准。'
$hostsToTest = @(
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'download.pytorch.org',
  'download-r2.pytorch.org',
  'huggingface.co'
)
foreach ($hostName in $hostsToTest) {
  try {
    $addresses = [System.Net.Dns]::GetHostAddresses($hostName) |
      ForEach-Object { $_.IPAddressToString } |
      Select-Object -Unique
    $dnsResult = $addresses -join ', '
  } catch {
    $dnsResult = "FAIL ($($_.Exception.Message))"
  }
  $tcpResult = Test-Tcp443 -HostName $hostName
  Add-ReportLine "$hostName | DNS=$dnsResult | TCP443=$tcpResult"
}

Add-Section 'HTTP 下载链路'
try {
  $curlVersion = (& curl.exe --version 2>&1 | Select-Object -First 1)
  Add-ReportLine "curl：$curlVersion"
} catch {
  Add-ReportLine '系统找不到 curl.exe，以下 HTTP 检查无法执行。'
}

$updateUrl = 'https://github.com/ggone-p/poring-gameale/releases/latest/download/latest.yml'
$releaseApiUrl = 'https://api.github.com/repos/ggone-p/poring-gameale/releases/latest'
$installerUrl = 'https://github.com/ggone-p/poring-gameale/releases/download/v0.1.26/poring-gameale-0.1.26-x64.exe'
$uvUrl = 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip'
$torchCpuUrl = 'https://download.pytorch.org/whl/cpu/torch/'
$modelApiUrl = 'https://huggingface.co/api/models/ZhengPeng7/BiRefNet_dynamic'

$updateDefault = Invoke-CurlProbe -Name '更新清单' -Url $updateUrl
$updateHttp11 = Invoke-CurlProbe -Name '更新清单' -Url $updateUrl -Http11
Invoke-CurlProbe -Name 'GitHub Release API' -Url $releaseApiUrl | Out-Null
Invoke-CurlProbe -Name '安装包重定向' -Url $installerUrl | Out-Null
Invoke-CurlProbe -Name 'uv 安装工具' -Url $uvUrl | Out-Null
Invoke-CurlProbe -Name 'PyTorch CPU 索引' -Url $torchCpuUrl | Out-Null
Invoke-CurlProbe -Name 'BiRefNet 模型 API' -Url $modelApiUrl | Out-Null

Add-Section '本地 AI 环境'
$configCandidates = @(
  (Join-Path $env:APPDATA '波利AI图助手\config.json'),
  (Join-Path $env:APPDATA 'feishu-asset-floating-uploader\config.json')
)
$configPath = $configCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$runtimeRoot = Join-Path $env:APPDATA '波利AI图助手\ai-background-removal'
if ($configPath -and (Test-Path -LiteralPath $configPath)) {
  try {
    $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $backgroundRemoval = $config.PSObject.Properties['backgroundRemoval']
    $installDir = if ($backgroundRemoval) {
      $backgroundRemoval.Value.PSObject.Properties['installDir']
    } else {
      $null
    }
    if ($installDir -and -not [string]::IsNullOrWhiteSpace([string]$installDir.Value)) {
      $runtimeRoot = [string]$installDir.Value
    }
    Add-ReportLine '已读取配置中的 AI 环境路径（飞书凭据未写入报告）。'
  } catch {
    Add-ReportLine "配置读取失败：$($_.Exception.Message)"
  }
}
Add-ReportLine "AI 环境目录：$runtimeRoot"
Add-ReportLine "目录存在：$(Test-Path -LiteralPath $runtimeRoot)"
if (Test-Path -LiteralPath $runtimeRoot) {
  $pythonPath = Join-Path $runtimeRoot '.venv\Scripts\python.exe'
  $uvPath = Join-Path $runtimeRoot 'tools\uv.exe'
  $modelRoot = Join-Path $runtimeRoot 'models\models--ZhengPeng7--BiRefNet_dynamic'
  $snapshotRoot = Join-Path $modelRoot 'snapshots'
  Add-ReportLine "uv.exe：$(Test-Path -LiteralPath $uvPath)"
  Add-ReportLine "python.exe：$(Test-Path -LiteralPath $pythonPath)"
  Add-ReportLine "模型 snapshots：$(Test-Path -LiteralPath $snapshotRoot)"
  Add-ReportLine ".venv 大小：$(Format-Bytes (Get-FolderSize (Join-Path $runtimeRoot '.venv')))"
  Add-ReportLine ".uv-cache 大小：$(Format-Bytes (Get-FolderSize (Join-Path $runtimeRoot '.uv-cache')))"
  Add-ReportLine "models 大小：$(Format-Bytes (Get-FolderSize (Join-Path $runtimeRoot 'models')))"
  $modelFiles = Get-ChildItem -LiteralPath $snapshotRoot -Recurse -Filter 'model.safetensors' -File -ErrorAction SilentlyContinue
  if ($modelFiles) {
    foreach ($modelFile in $modelFiles) {
      Add-ReportLine "模型文件：$($modelFile.FullName) | $(Format-Bytes $modelFile.Length)"
    }
  } else {
    Add-ReportLine '未找到 model.safetensors。'
  }
}

Add-Section '相关进程'
$relatedProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -in @('uv.exe', 'python.exe', '波利AI图助手.exe') -or
    $_.ExecutablePath -like '*ai-background-removal*'
  }
if ($relatedProcesses) {
  foreach ($process in $relatedProcesses) {
    Add-ReportLine "$($process.Name) | PID=$($process.ProcessId) | $($process.ExecutablePath)"
  }
} else {
  Add-ReportLine '未发现 uv、Python 或波利助手相关进程。'
}

Add-Section '自动判断'
if ($updateDefault.ExitCode -ne 0 -and $updateHttp11.ExitCode -eq 0) {
  Add-ReportLine '结论：默认连接失败但 HTTP/1.1 成功，基本可确认公司代理/安全软件的 HTTP/2 兼容问题。'
  Add-ReportLine '建议：暂时从公盘或浏览器手动安装更新；软件更新器后续应强制回退 HTTP/1.1。'
} elseif ($updateDefault.ExitCode -ne 0 -and $updateHttp11.ExitCode -ne 0) {
  Add-ReportLine '结论：GitHub 更新清单两种协议都失败，可能是 GitHub 被代理、防火墙、DNS 或证书策略拦截。'
  Add-ReportLine '建议：从公盘分发安装包，并把本报告交给网络管理员或开发人员。'
} else {
  Add-ReportLine 'GitHub 更新清单可访问。若软件仍报 HTTP/2 错误，更可能是 Electron 更新器与公司代理的兼容问题。'
}

Add-ReportLine ''
Add-ReportLine '请将本报告完整发送给开发人员。报告不包含飞书 App Secret。'
$report | Out-File -LiteralPath $reportPath -Encoding utf8

Write-Host ''
Write-Host "诊断完成：$reportPath" -ForegroundColor Green
Write-Host '请把该报告文件发送给开发人员。' -ForegroundColor Cyan
if (-not $NoOpen) {
  Start-Process notepad.exe -ArgumentList "`"$reportPath`""
}

