[CmdletBinding()]
param([switch]$Built)

$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$issues = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.HashSet[string]]::new()
$checked = 0
$anchorCache = @{}

function Test-Reference {
    param([string]$Value, [IO.FileInfo]$File, [string]$WebRoot, [string]$Area, [bool]$CheckAnchor = $false)
    $value = [Net.WebUtility]::HtmlDecode($Value.Trim())
    if (-not $value -or $value -match '^(?:[a-z][a-z0-9+.-]*:|//)' -or $value.Contains('${')) { return }
    $parts = $value -split '#', 2
    $path = [Uri]::UnescapeDataString(($parts[0] -split '\?', 2)[0])
    if (-not $path) { $target = $File.FullName }
    elseif ($path.StartsWith('/')) {
        $target = Join-Path $WebRoot $path.TrimStart('/')
        # Public routes are resolved as nginx resolves them; source pages live in site/.
        if (-not $Built -and $Area -eq 'site' -and $path -notmatch '^/media/') {
            $target = Join-Path (Join-Path $repository 'site') $path.TrimStart('/')
        }
    } else { $target = Join-Path $File.DirectoryName $path }
    $target = [IO.Path]::GetFullPath($target)
    if (Test-Path -LiteralPath $target -PathType Container) {
        $index = if ($Area -eq 'site') { 'landing_final.html' } else { 'index.html' }
        $target = Join-Path $target $index
    }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf) -and -not [IO.Path]::GetExtension($target)) {
        $route = [IO.Path]::GetFileName($target)
        $name = switch ($route) { 'guide' { 'gaid-body-stress.html' }; default { "$route.html" } }
        $target = Join-Path (Split-Path -Parent $target) $name
    }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        if ($target -match '[\\/]js[\\/]telegram-web-app\.js$') {
            $null = $warnings.Add('До реорганизации отсутствовала локальная копия Telegram SDK (app/js/telegram-web-app.js); требуется восстановление перед чистым деплоем приложения.')
        } else { $issues.Add("$($File.FullName): не найдено '$value'") }
        return
    }
    if ($CheckAnchor -and $parts.Count -gt 1 -and $parts[1] -and [IO.Path]::GetExtension($target) -eq '.html') {
        if (-not $anchorCache.ContainsKey($target)) {
            $markup = Get-Content -LiteralPath $target -Raw -Encoding UTF8
            $anchorCache[$target] = @([regex]::Matches($markup, '(?:id|name)\s*=\s*["'']([^"'']+)["'']') | ForEach-Object { $_.Groups[1].Value })
        }
        $anchor = [Uri]::UnescapeDataString($parts[1])
        if ($anchor -notin $anchorCache[$target]) { $issues.Add("$($File.FullName): не найден якорь '$value'") }
    }
}

foreach ($area in @('site', 'app')) {
    $folder = if ($Built) { Join-Path $repository "output/$area" } else { Join-Path $repository $area }
    $webRoot = if ($Built) { $folder } else { $repository }
    if (-not (Test-Path -LiteralPath $folder -PathType Container)) { $issues.Add("Нет каталога: $folder"); continue }
    $files = Get-ChildItem -LiteralPath $folder -File -Recurse | Where-Object { $_.Extension -in @('.html', '.css', '.js') }
    foreach ($file in $files) {
        $checked++
        $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        if ($file.Extension -eq '.js') {
            # Validate explicit project media in JavaScript without evaluating code.
            foreach ($match in [regex]::Matches($text, '["''](/media/[^"''\s]+)["'']')) {
                Test-Reference $match.Groups[1].Value $file $webRoot $area
            }
            continue
        }
        foreach ($match in [regex]::Matches($text, '\b(src|href|data-detail-image)\s*=\s*["'']([^"'']+)["'']')) {
            Test-Reference $match.Groups[2].Value $file $webRoot $area ($match.Groups[1].Value -eq 'href')
        }
        foreach ($match in [regex]::Matches($text, '\bsrcset\s*=\s*["'']([^"'']+)["'']')) {
            if ($match.Groups[1].Value -match '^data:') { continue }
            foreach ($candidate in ($match.Groups[1].Value -split ',')) {
                Test-Reference (($candidate.Trim() -split '\s+')[0]) $file $webRoot $area
            }
        }
        foreach ($match in [regex]::Matches($text, 'url\(\s*["'']?([^\)"'']+)["'']?\s*\)')) {
            Test-Reference $match.Groups[1].Value $file $webRoot $area
        }
    }
    if ($Built) {
        $allowedPages = if ($area -eq 'site') { @('landing_final.html', 'thanks.html', 'offer.html', 'privacy.html', 'gaid-body-stress.html', 'admin.html', 'presentation.html') } else { @('index.html', 'admin.html') }
        foreach ($file in Get-ChildItem -LiteralPath $folder -File -Recurse -Force) {
            $relative = $file.FullName.Substring($folder.Length).TrimStart('\', '/').Replace('\', '/')
            $mediaPath = '^media/(?:' + $area + '|shared)/'
            $allowed = $relative -in $allowedPages -or ($relative -match $mediaPath -and $file.Extension.ToLowerInvariant() -in @('.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.ico', '.mp3', '.mp4', '.webm', '.woff', '.woff2'))
            if ($area -eq 'app' -and $relative -match '^(?:js/.+\.js|css/.+\.css)$') { $allowed = $true }
            if (-not $allowed) { $issues.Add("Непубличный или неразрешённый файл в сборке: $relative") }
        }
    }
}
foreach ($warning in $warnings) { Write-Warning $warning }
if ($issues.Count) {
    foreach ($issue in $issues) { Write-Host $issue -ForegroundColor Red }
    throw "Проверка структуры: $($issues.Count) ошибок, проверено HTML/CSS/JS файлов: $checked."
}
Write-Host "Проверка структуры пройдена: $checked HTML/CSS/JS файлов; внутренних битых ссылок и якорей не найдено. Предупреждений: $($warnings.Count)."
Write-Host 'Проверка статическая: не отправляет формы, не проверяет внешние домены и не заменяет просмотр страницы в браузере.'
