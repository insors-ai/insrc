# Release template; no execution-policy changes or elevation.
param([string]$HomeDirectory = (Join-Path $env:USERPROFILE '.insrc'), [string]$InstallationId = 'default')
$ErrorActionPreference = 'Stop'
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue
if (-not (Test-Path Env:ONNXRUNTIME_NODE_INSTALL_CUDA)) { $env:ONNXRUNTIME_NODE_INSTALL_CUDA = 'skip' }
foreach ($command in @('Get-FileHash', 'Expand-Archive')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "prerequisite missing: $command (install as your user)" }
}
$os = 'win32'
$arch = switch ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()) { 'Arm64' { 'arm64' } 'X64' { 'x64' } default { throw 'architecture unsupported' } }
$target = "$os-$arch"
# @@TARGETS@@
if (-not $runtimeUrl) { throw 'this source template has no qualified release assets; use a published installer' }
if ($HomeDirectory -notmatch '^[A-Za-z]:[\\/]' -or $HomeDirectory -match '[\\/]\.\.?([\\/]|$)') { throw 'home must be absolute local path without traversal' }
$HomeDirectory = [System.IO.Path]::GetFullPath($HomeDirectory)
if ($HomeDirectory -ne [System.IO.Path]::GetPathRoot($HomeDirectory)) { $HomeDirectory = $HomeDirectory.TrimEnd('\','/') }
$current = $HomeDirectory
while ($current) {
    if (Test-Path -LiteralPath $current) { if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'home ancestor is a reparse point' } }
    $current = Split-Path -Parent $current
}
$install = Join-Path $HomeDirectory 'install'
New-Item -ItemType Directory -Path $install -Force | Out-Null
if ((Get-Item -LiteralPath $install -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'control root is a reparse point' }
# Apply current-user-only inheritable ACL without an elevated helper.
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
Set-Acl -LiteralPath $install -AclObject $acl
$stage = Join-Path $install ('bootstrap-stage.' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
function Fetch-Verified([string]$Url, [string]$Destination, [string]$Sha) {
    if ($Url -notmatch '^https://') { throw 'HTTPS asset required' }
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(600)
    $deadline = New-Object System.Threading.CancellationTokenSource
    $deadline.CancelAfter(600000)
    try {
        $uri = [Uri]$Url
        for ($redirect = 0; ; $redirect++) {
            if ($uri.Scheme -ne 'https' -or $redirect -gt 8) { throw 'HTTPS redirect limit exceeded' }
            $response = $client.GetAsync($uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead, $deadline.Token).GetAwaiter().GetResult()
            try {
                if ([int]$response.StatusCode -ge 300 -and [int]$response.StatusCode -lt 400) {
                    if (-not $response.Headers.Location) { throw 'redirect missing location' }
                    $uri = New-Object Uri($uri, $response.Headers.Location)
                    continue
                }
                $response.EnsureSuccessStatusCode() | Out-Null
                $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
                $file = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew)
                try {
                    $buffer = New-Object byte[] 65536
                    $total = 0L
                    while (($count = $stream.ReadAsync($buffer, 0, $buffer.Length, $deadline.Token).GetAwaiter().GetResult()) -gt 0) {
                        $total += $count
                        if ($total -gt 104857600) { throw 'asset exceeds download bound' }
                        $file.Write($buffer, 0, $count)
                    }
                    $file.Flush($true)
                } finally { $file.Dispose(); $stream.Dispose() }
                break
            } finally { $response.Dispose() }
        }
    } finally { $deadline.Dispose(); $client.Dispose(); $handler.Dispose() }
    if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha) { throw 'asset digest mismatch' }
}
try {
    $archive = Join-Path $stage 'runtime.zip'
    Fetch-Verified $runtimeUrl $archive $runtimeSha
    Expand-Archive -LiteralPath $archive -DestinationPath $stage
    $runtimeStage = Join-Path $stage $runtimeRoot
    # Skip unnecessary npm aliases; use npm-cli.js through private node on dev/build only.
    foreach ($alias in @('npm','npm.cmd','npm.ps1','npx','npx.cmd','npx.ps1','corepack','corepack.cmd','corepack.ps1')) { Remove-Item -LiteralPath (Join-Path $runtimeStage $alias) -ErrorAction SilentlyContinue }
    $node = Join-Path $runtimeStage 'node.exe'
    # @@PUBLISH_RUNTIME@@
    $node = Join-Path $HomeDirectory "runtimes/22.22.1/$target/node.exe"
    $controlStage = Join-Path $stage 'control'
    New-Item -ItemType Directory -Path (Join-Path $controlStage 'native') -Force | Out-Null
    Fetch-Verified $bootstrapUrl (Join-Path $controlStage 'bootstrap.mjs') $bootstrapSha
    Fetch-Verified $nativeUrl (Join-Path $controlStage 'native/control.node') $nativeSha
    $control = Join-Path $install "bootstrap/$bootstrapSha-$nativeSha"
    # @@PUBLISH_CONTROL@@
    & $node (Join-Path $control 'bootstrap.mjs') --home $HomeDirectory --installation-id $InstallationId
    if ($LASTEXITCODE -ne 0) { throw "installer failed: $LASTEXITCODE" }
} finally { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
