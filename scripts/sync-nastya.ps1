[CmdletBinding()]
param(
    [string]$Repository,
    [switch]$MarkReviewed,
    [string]$ReviewedCommit
)

$ErrorActionPreference = 'Stop'
if (-not $Repository) {
    $Repository = Split-Path -Parent $PSScriptRoot
}
$remoteRef = 'origin/nastya/collaboration-check'
$statePath = Join-Path $Repository '.git\telo-nastya-reviewed'
$logPath = Join-Path $Repository '.git\telo-nastya-sync.log'
$statusPath = Join-Path $Repository '.git\telo-nastya-status.json'

function Invoke-Git {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $result = & git -c core.quotepath=false @Arguments 2>&1
        $gitExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($gitExitCode -ne 0) {
        throw "git $($Arguments -join ' ') завершился с ошибкой: $($result -join [Environment]::NewLine)"
    }
    return @($result)
}

function Test-GitAncestor {
    param(
        [Parameter(Mandatory)][string]$Ancestor,
        [Parameter(Mandatory)][string]$Descendant
    )

    & git merge-base --is-ancestor $Ancestor $Descendant 2>$null
    return $LASTEXITCODE -eq 0
}

try {
    Set-Location -LiteralPath $Repository
    Invoke-Git -Arguments @('fetch', 'origin', '--prune') | Out-Null

    $latestCommit = (@(Invoke-Git -Arguments @('rev-parse', $remoteRef)))[0].Trim()

    if ($MarkReviewed) {
        if (-not $ReviewedCommit) { throw 'Укажите точный обработанный коммит через -ReviewedCommit.' }
        $commitToMark = if ($ReviewedCommit) { $ReviewedCommit } else { $latestCommit }
        $commitToMark = (@(Invoke-Git -Arguments @('rev-parse', $commitToMark)))[0].Trim()

        if (-not (Test-GitAncestor -Ancestor $commitToMark -Descendant $latestCommit)) {
            throw "Коммит $commitToMark не входит в текущую историю $remoteRef."
        }

        [IO.File]::WriteAllText($statePath, "$commitToMark`n", [Text.UTF8Encoding]::new($false))
    }

    $reviewedCommit = ''
    if (Test-Path -LiteralPath $statePath) {
        $reviewedCommit = (Get-Content -LiteralPath $statePath -Raw).Trim()
    }

    $historyChanged = $false
    if ($reviewedCommit -and -not (Test-GitAncestor -Ancestor $reviewedCommit -Descendant $latestCommit)) {
        $historyChanged = $true
        $reviewedCommit = ''
    }

    $comparisonBase = if ($reviewedCommit) { $reviewedCommit } else { 'main' }
    $range = "$comparisonBase..$remoteRef"
    $commitLines = @(Invoke-Git -Arguments @('log', '--reverse', '--format=%h%x09%ad%x09%s', '--date=short', $range))
    $fileLines = @(Invoke-Git -Arguments @('diff', '--name-status', $range))
    $checkedAt = Get-Date -Format 'dd.MM.yyyy HH:mm:ss'

    $commits = @($commitLines | Where-Object { $_ } | ForEach-Object {
        $parts = $_ -split "`t", 3
        [ordered]@{
            hash = $parts[0]
            date = $parts[1]
            subject = $parts[2]
        }
    })
    $files = @($fileLines | Where-Object { $_ } | ForEach-Object {
        [ordered]@{ change = $_ }
    })
    $status = [ordered]@{
        checkedAt = $checkedAt
        remoteRef = $remoteRef
        latestCommit = $latestCommit
        reviewedCommit = $reviewedCommit
        historyChanged = $historyChanged
        pendingCommits = $commits.Count
        commits = $commits
        files = $files
    }
    $statusJson = $status | ConvertTo-Json -Depth 5
    [IO.File]::WriteAllText($statusPath, $statusJson, [Text.UTF8Encoding]::new($false))
    Add-Content -LiteralPath $logPath -Value "$checkedAt`tOK`t$latestCommit" -Encoding utf8

    [PSCustomObject]@{
        CheckedAt = $checkedAt
        LatestCommit = $latestCommit
        ReviewedCommit = $reviewedCommit
        PendingCommits = $commits.Count
        StatusFile = $statusPath
    }
} catch {
    $failedAt = Get-Date -Format 'dd.MM.yyyy HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "$failedAt`tERROR`t$($_.Exception.Message)" -Encoding utf8
    throw
}
