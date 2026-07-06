param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$SkipFrontendBuild,
    [switch]$SkipDesktop,
    [switch]$IncludeE2E,
    [string]$JavaHome = $(if ($env:JAVA_HOME) { $env:JAVA_HOME } elseif (Test-Path 'C:\jdk-17') { 'C:\jdk-17' } else { '' }),
    [string]$Python = $(if ($env:PYTHON) { $env:PYTHON } else { 'python' })
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Name"
    & $Command
    $exitCode = $LASTEXITCODE
    if ($null -ne $exitCode -and $exitCode -ne 0) {
        throw "$Name failed with exit code $exitCode"
    }
}

Invoke-Step 'docs encoding' {
    node devops\scripts\verify-doc-encoding.mjs
}

Invoke-Step 'security boundaries' {
    node devops\scripts\verify-security-boundaries.mjs
}

Invoke-Step 'deployment source policy' {
    node devops\scripts\verify-deployment-source.mjs
}

Invoke-Step 'storage transaction boundaries' {
    node devops\scripts\verify-storage-transaction-boundaries.mjs
}

Invoke-Step 'db migrations' {
    node devops\scripts\verify-db-migrations.mjs
}

if (-not $SkipFrontend) {
    Push-Location frontend
    try {
        Invoke-Step 'frontend public assets' {
            npm.cmd run test:public-assets
        }
        Invoke-Step 'frontend unit tests' {
            npm.cmd run test:unit
        }
        if (-not $SkipFrontendBuild) {
            Invoke-Step 'frontend build' {
                npm.cmd run build
            }
            Invoke-Step 'frontend workspace chunks' {
                npm.cmd run test:workspace-chunks
            }
        }
        if ($IncludeE2E) {
            Invoke-Step 'frontend e2e tests' {
                npm.cmd run test:e2e
            }
        }
    } finally {
        Pop-Location
    }
}

if (-not $SkipBackend) {
    if ($JavaHome) {
        $env:JAVA_HOME = $JavaHome
        $env:Path = "$env:JAVA_HOME\bin;$env:Path"
    }
    Invoke-Step 'backend tests' {
        Push-Location backend
        try {
            .\gradlew.bat test --no-daemon
        } finally {
            Pop-Location
        }
    }
}

if (-not $SkipDesktop) {
    Invoke-Step 'desktop python syntax' {
        Push-Location desktop-client
        try {
            $desktopPythonFiles = Get-ChildItem -File -Filter '*.py' |
                Where-Object { $_.Name -notlike 'test_*' } |
                ForEach-Object { $_.Name }
            & $Python -m py_compile @desktopPythonFiles
        } finally {
            Pop-Location
        }
    }
    Invoke-Step 'desktop python tests' {
        Push-Location desktop-client
        try {
            $previousErrorActionPreference = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try {
                $testOutput = & $Python -m unittest discover -p 'test_fileinnout_desktop_*.py' 2>&1
                $testExitCode = $LASTEXITCODE
            } finally {
                $ErrorActionPreference = $previousErrorActionPreference
            }
            $testOutput | ForEach-Object { Write-Host $_ }
            if ($testExitCode -ne 0) {
                exit $testExitCode
            }
        } finally {
            Pop-Location
        }
    }
    Invoke-Step 'desktop offline verification' {
        Push-Location desktop-client
        try {
            & $Python .\verify_desktop_client.py
        } finally {
            Pop-Location
        }
    }
}

Invoke-Step 'git whitespace check' {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $diffCheckOutput = git diff --check 2>&1
        $diffCheckExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    $diffCheckWarnings = @($diffCheckOutput | Where-Object { $_ -like 'warning:*' })
    $diffCheckErrors = @($diffCheckOutput | Where-Object { $_ -notlike 'warning:*' })

    if ($diffCheckExitCode -ne 0) {
        $diffCheckErrors | ForEach-Object { Write-Host $_ }
        exit $diffCheckExitCode
    }

    if ($diffCheckWarnings.Count -gt 0) {
        Write-Host "Line-ending warnings: $($diffCheckWarnings.Count)"
    }
}

Write-Host ""
Write-Host "Local verification passed."
