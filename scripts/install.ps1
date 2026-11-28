# Release template; no execution-policy changes or elevation.
[CmdletBinding()]
param([string]$HomeDirectory = (Join-Path $env:USERPROFILE '.insrc'), [string]$InstallationId = 'default', [string]$OperationId = '')
$ErrorActionPreference = 'Stop'
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue
if (-not (Test-Path Env:ONNXRUNTIME_NODE_INSTALL_CUDA)) { $env:ONNXRUNTIME_NODE_INSTALL_CUDA = 'skip' }
foreach ($command in @('Get-FileHash')) {
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
$createdHome = -not (Test-Path -LiteralPath $HomeDirectory)
New-Item -ItemType Directory -Path $install -Force | Out-Null
if ((Get-Item -LiteralPath $install -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'control root is a reparse point' }
# Apply current-user-only inheritable ACL without an elevated helper.
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
Set-Acl -LiteralPath $install -AclObject $acl
if ($createdHome) { Set-Acl -LiteralPath $HomeDirectory -AclObject $acl }
$stage = Join-Path $install ('bootstrap-stage.' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
function Verify-File([string]$Path, [string]$Sha, [long]$Expected = 0) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'unsafe asset file' }
    if ($Expected -gt 0 -and $item.Length -ne $Expected) { throw 'asset size mismatch' }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha) { throw 'asset digest mismatch' }
}
function Fetch-Verified([string]$Url, [string]$Destination, [string]$Sha, [long]$Maximum = 16777216, [long]$Expected = 0) {
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
                        if ($total -gt $Maximum) { throw 'asset exceeds download bound' }
                        $file.Write($buffer, 0, $count)
                    }
                    $file.Flush($true)
                } finally { $file.Dispose(); $stream.Dispose() }
                break
            } finally { $response.Dispose() }
        }
    } finally { $deadline.Dispose(); $client.Dispose(); $handler.Dispose() }
    Verify-File $Destination $Sha $Expected
}
$helperActive = $false
try {
    $runtimeEntry = Join-Path $HomeDirectory "runtimes/22.22.1/$target-$baseline/$runtimeSha"
    $canonicalNode = Join-Path $runtimeEntry 'distribution/node.exe'
    $node = $canonicalNode
    if (Test-Path -LiteralPath $runtimeEntry) {
        Verify-File $node $nodeSha
    } else {
        if (-not (Get-Command Expand-Archive -ErrorAction SilentlyContinue)) { throw 'prerequisite missing: Expand-Archive' }
        $archive = Join-Path $stage 'runtime.archive'
        Fetch-Verified $runtimeUrl $archive $runtimeSha ([long]$runtimeBytes) ([long]$runtimeBytes)
        # Expand-Archive requires a .zip suffix. This copy is execution-only;
        # the shared runtime reader authenticates the original parser input.
        $executionArchive = Join-Path $stage 'execution.zip'
        Copy-Item -LiteralPath $archive -Destination $executionArchive
        $execution = Join-Path $stage 'execution'
        Expand-Archive -LiteralPath $executionArchive -DestinationPath $execution
        $node = Join-Path (Join-Path $execution $runtimeRoot) 'node.exe'
        Verify-File $node $nodeSha
        Fetch-Verified $headersUrl (Join-Path $stage 'headers.archive') $headersSha ([long]$headersBytes) ([long]$headersBytes)
        Fetch-Verified $libraryUrl (Join-Path $stage 'node.lib') $librarySha ([long]$libraryBytes) ([long]$libraryBytes)
    }
    $control = Join-Path $install "bootstrap/$bootstrapSha-$nativeSha"
    $controlSource = $control
    if (-not (Test-Path -LiteralPath $control)) {
        $controlSource = Join-Path $stage 'control'
        New-Item -ItemType Directory -Path (Join-Path $controlSource 'native') -Force | Out-Null
        Fetch-Verified $bootstrapUrl (Join-Path $controlSource 'bootstrap.mjs') $bootstrapSha
        Fetch-Verified $nativeUrl (Join-Path $controlSource 'native/control.node') $nativeSha
    }
    Verify-File (Join-Path $controlSource 'bootstrap.mjs') $bootstrapSha
    Verify-File (Join-Path $controlSource 'native/control.node') $nativeSha
    # The call operator waits for this exact child. Its execution Node and loaded
    # control DLL stay outside both fresh publication trees.
    $helperActive = $true
    # @@PUBLISH_FOUNDATION@@
    $helperExit = $LASTEXITCODE
    $helperActive = $false
    if ($helperExit -ne 0) { throw 'bootstrap publication failed' }
    Remove-Item -LiteralPath $stage -Recurse -Force
    $stage = $null
    $node = $canonicalNode
    $installArgs = @('--home', $HomeDirectory, '--installation-id', $InstallationId)
    if ($OperationId) { $installArgs += @('--operation-id', $OperationId) }
    Verify-File $node $nodeSha
    Verify-File (Join-Path $control 'bootstrap.mjs') $bootstrapSha
    Verify-File (Join-Path $control 'native/control.node') $nativeSha
    & $node (Join-Path $control 'bootstrap.mjs') @installArgs
    $installerExit = $LASTEXITCODE
} finally {
    if ($stage) {
        if ($helperActive) { Write-Warning "publication child exit unconfirmed; retained $stage" }
        else { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
exit $installerExit
