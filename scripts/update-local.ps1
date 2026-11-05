param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'

function Invoke-CheckedGit {
    & git @args
    if ($LASTEXITCODE -ne 0) { throw 'Git failed. See the output above.' }
}

Push-Location (Join-Path $PSScriptRoot '..')
try {
    if ((Invoke-CheckedGit branch --show-current) -ne 'main') {
        throw 'Switch to the main branch before checking for updates.'
    }

    Invoke-CheckedGit fetch origin main
    $current = Invoke-CheckedGit rev-parse HEAD
    $latest = Invoke-CheckedGit rev-parse FETCH_HEAD
    if ($current -eq $latest) {
        Write-Host 'This checkout is up to date with origin/main.'
        return
    }

    Invoke-CheckedGit merge-base --is-ancestor $current $latest
    Write-Host 'An update is available:'
    Invoke-CheckedGit log --oneline "$current..$latest"
    if ($CheckOnly) { return }

    if (Invoke-CheckedGit status --porcelain) {
        throw 'This checkout has local changes. Resolve them before installing the update.'
    }
    if (-not (Test-Path -LiteralPath '.env' -PathType Leaf)) {
        throw 'Set up the local Docker installation before installing updates.'
    }
    if ((Read-Host 'Install this update now? [y/N]') -ne 'y') { return }

    docker info --format '{{.ServerVersion}}'
    if ($LASTEXITCODE -ne 0) { throw 'Start Docker and try again.' }
    docker compose version
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is required to install the update.' }

    Invoke-CheckedGit merge --ff-only $latest
    docker compose -f docker-compose.local.yml up -d --build
    if ($LASTEXITCODE -ne 0) {
        throw 'The checkout was updated but Docker failed. Resolve the error and rerun docker compose -f docker-compose.local.yml up -d --build.'
    }
    Write-Host 'Update installed. Open http://localhost:3000 to use the app.'
}
finally {
    Pop-Location
}
