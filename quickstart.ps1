[CmdletBinding()]
param(
    [ValidateSet('Start', 'Stop', 'Reset', 'Status', 'Validate')]
    [string]$Action = 'Start',
    [ValidateRange(1024, 65535)]
    [int]$AppPort = 8088,
    [ValidateRange(1024, 65535)]
    [int]$MinioApiPort = 9000,
    [ValidateRange(1024, 65535)]
    [int]$MinioConsolePort = 9001,
    [string]$PublicHost = 'localhost',
    [string]$AdminEmail = 'admin@fileinnout.local',
    [string]$AdminPassword = '',
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path $PSScriptRoot
$QuickstartDirectory = Join-Path $RepoRoot 'deploy\quickstart'
$ComposeFile = Join-Path $QuickstartDirectory 'docker-compose.yml'
$EnvironmentFile = Join-Path $QuickstartDirectory '.env'
$ProjectName = 'fileinnout-quickstart'

function Write-Info([string]$Message) {
    Write-Host "[FileInNOut] $Message" -ForegroundColor Cyan
}

function New-Base64UrlSecret([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-HexSecret([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Assert-SafeEnvironmentValue([string]$Name, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -match '[\r\n#]') {
        throw "$Name must be a single-line value without '#'."
    }
}

function Assert-PortsAvailable {
    param([int[]]$Ports)

    foreach ($port in $Ports | Select-Object -Unique) {
        $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
        if ($listener) {
            throw "Local port $port is already in use. Choose another port before starting FileInNOut."
        }
    }
}

function Assert-DockerReady {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop with Docker Compose v2 is required. Install Docker Desktop, start it, then run this script again.'
    }

    & docker version --format '{{.Server.Version}}' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Desktop is installed but not running. Start Docker Desktop, wait for it to be ready, then run this script again.'
    }

    & docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Compose v2 is required. Update Docker Desktop, then run this script again.'
    }
}

function Invoke-Compose {
    param([string[]]$ComposeArguments)

    & docker compose --project-name $ProjectName --env-file $EnvironmentFile --file $ComposeFile @ComposeArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed: docker compose $($ComposeArguments -join ' ')"
    }
}

function Write-EnvironmentFile {
    if ($PublicHost -notmatch '^[A-Za-z0-9.-]+$') {
        throw 'PublicHost must be a hostname or IPv4 address without a protocol or path.'
    }
    if ($AdminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        throw 'AdminEmail must be a valid email address.'
    }

    Assert-PortsAvailable @($AppPort, $MinioApiPort, $MinioConsolePort)

    $initialPassword = $AdminPassword
    if ([string]::IsNullOrWhiteSpace($initialPassword)) {
        $initialPassword = New-Base64UrlSecret 18
    }
    Assert-SafeEnvironmentValue 'AdminPassword' $initialPassword

    $appUrl = "http://${PublicHost}:$AppPort"
    $values = [ordered]@{
        APP_VERSION = 'quickstart'
        APP_PORT = $AppPort
        MINIO_API_PORT = $MinioApiPort
        MINIO_CONSOLE_PORT = $MinioConsolePort
        APP_FRONTEND_URL = $appUrl
        APP_BACKEND_URL = "$appUrl/api"
        MINIO_PUBLIC_API = "http://${PublicHost}:$MinioApiPort"
        ADMIN_EMAIL = $AdminEmail
        ADMIN_NAME = 'Administrator'
        ADMIN_PASSWORD = $initialPassword
        DB_PASS = New-Base64UrlSecret 24
        JWT_KEY = New-Base64UrlSecret 32
        PROJECT_AES_KEY = New-HexSecret 16
        MINIO_IMAGE_TAG = 'RELEASE.2025-04-22T22-12-26Z'
        MINIO_NAME = 'fileinnout'
        MINIO_SECRET = New-Base64UrlSecret 24
    }

    $lines = foreach ($entry in $values.GetEnumerator()) {
        "$($entry.Key)=$($entry.Value)"
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllLines($EnvironmentFile, [string[]]$lines, $utf8NoBom)
    return $initialPassword
}

function Get-EnvironmentValues {
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $EnvironmentFile) {
        if ($line -match '^([^=]+)=(.*)$') {
            $values[$Matches[1]] = $Matches[2]
        }
    }
    return $values
}

function Wait-ForHttp([string]$Url, [int]$TimeoutSeconds = 240) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                return
            }
        } catch {
        }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for $Url"
}

if (-not (Test-Path -LiteralPath $ComposeFile)) {
    throw "Quickstart Compose file is missing: $ComposeFile"
}

if ($Action -in @('Stop', 'Reset', 'Status') -and -not (Test-Path -LiteralPath $EnvironmentFile)) {
    Write-Info 'No local quickstart configuration exists.'
    exit 0
}

Assert-DockerReady

if ($Action -eq 'Stop') {
    Invoke-Compose @('down', '--remove-orphans')
    Write-Info 'Stopped. Local MariaDB, Redis, and MinIO data were kept.'
    exit 0
}

if ($Action -eq 'Reset') {
    Invoke-Compose @('down', '--volumes', '--remove-orphans')
    Write-Info 'Reset completed. Local container data volumes were removed.'
    exit 0
}

if ($Action -eq 'Status') {
    Invoke-Compose @('ps')
    exit 0
}

$generatedPassword = ''
if (-not (Test-Path -LiteralPath $EnvironmentFile)) {
    if ($Action -eq 'Validate') {
        throw "No local quickstart configuration exists. Run .\quickstart.ps1 once before validating it."
    }
    Write-Info 'Creating a local-only configuration with generated secrets.'
    $generatedPassword = Write-EnvironmentFile
} elseif ($PSBoundParameters.ContainsKey('AppPort') -or $PSBoundParameters.ContainsKey('MinioApiPort') -or $PSBoundParameters.ContainsKey('MinioConsolePort') -or $PSBoundParameters.ContainsKey('PublicHost') -or $PSBoundParameters.ContainsKey('AdminEmail') -or $PSBoundParameters.ContainsKey('AdminPassword')) {
    throw "A local configuration already exists at $EnvironmentFile. Keep it for consistent data and credentials, or delete that file before changing first-run settings."
}

Invoke-Compose @('config', '--quiet')
if ($Action -eq 'Validate') {
    Write-Info 'Compose configuration is valid.'
    exit 0
}

$upArguments = @('up', '--detach', '--remove-orphans')
if (-not $NoBuild) {
    $upArguments += '--build'
}

try {
    Invoke-Compose $upArguments
    $settings = Get-EnvironmentValues
    $appUrl = $settings['APP_FRONTEND_URL']
    Wait-ForHttp "$appUrl/api/actuator/health"
    Wait-ForHttp "$appUrl/wss/statusz"
    Wait-ForHttp $appUrl
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    try {
        Invoke-Compose @('ps')
        Invoke-Compose @('logs', '--tail', '120')
    } catch {
    }
    throw
}

Write-Host ''
Write-Host 'FileInNOut is ready.' -ForegroundColor Green
Write-Host "URL: $appUrl"
Write-Host "Admin email: $($settings['ADMIN_EMAIL'])"
if ($generatedPassword) {
    Write-Host "Initial admin password: $generatedPassword" -ForegroundColor Yellow
    Write-Host 'Store this password now. It is kept only in deploy/quickstart/.env on this computer.' -ForegroundColor Yellow
} else {
    Write-Host 'Use the administrator password already stored in deploy/quickstart/.env.'
}
$minioHost = ([Uri]$settings['MINIO_PUBLIC_API']).Host
Write-Host "MinIO console: http://${minioHost}:$($settings['MINIO_CONSOLE_PORT'])"