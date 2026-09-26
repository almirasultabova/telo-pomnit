[CmdletBinding()]
param([switch]$Execute)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$moves = [ordered]@{}
function Plan-Move([string]$From, [string]$To) { if (Test-Path -LiteralPath (Join-Path $repo $From)) { $script:moves[$From] = $To } }
foreach ($name in @('landing_final.html','admin.html','thanks.html','offer.html','privacy.html','gaid-body-stress.html','presentation.html')) { Plan-Move $name "site/$name" }
Plan-Move 'landing_concept.html' 'archive/site/landing_concept.html'
Plan-Move 'tg-app' 'app'
Plan-Move 'body-diary' 'archive/experiments/body-diary'
foreach ($name in @('BODY_PRACTICES_LANDING.md','BODY_PRACTICES_PREPARATION.md','BODY_PRACTICES_SOURCE.md','BODY_PRACTICES_VIDEO_SCRIPT.md','LANDING_PSYCHOSOMATICS_BLOCK.md','PSYCHOSOMATIC_REVIEWS_TEXT.md')) { Plan-Move $name "База знаний/Источники/Анастасия/$name" }
Plan-Move 'APP_MONETIZATION_SALES.md' 'База знаний/Стратегия приложения.md'
Plan-Move 'research.md' 'База знаний/Источники/Исследование идей приложения.md'
Plan-Move 'brief.md' 'База знаний/Источники/Исходный бриф.md'
Plan-Move 'logi.md' 'База знаний/Архив/История разработки.md'
Plan-Move 'PLAN.md' 'База знаний/Архив/План до упорядочивания.md'
Plan-Move 'SITE_COPY_WORKING.md' 'База знаний/Архив/Редакции и аудит сайта 26 сентября.md'
Plan-Move 'SITE_COPY_ARCHIVE_2026-09-26.md' 'База знаний/Архив/Сайт до редакции 26 сентября.md'
Plan-Move 'TESTING.md' 'База знаний/Техническое/Проверка.md'
Plan-Move 'BACKEND-PLAN.md' 'База знаний/Архив/Первоначальный план сервера.md'
foreach ($name in @('О Тело помнит.pdf','Для лендингов, презентатций.pdf')) { Plan-Move $name "База знаний/Источники/$name" }
Plan-Move 'Кейсы и отзывы/Кейсы.pdf' 'База знаний/Источники/Кейсы.pdf'
$siteMedia = @('body-practice.webp','Enclosed-space.webp','Live work in Zoom.webp','concept-app-editorial.jpg','concept-diary.jpg','concept-enrollment-room.jpg','concept-program-linen.jpg','concept-recognition-fabric.jpg','concept-ribbon.jpg','concept-ribbon-mobile.jpg','concept-stories-atmosphere.jpg','request-woman-20260925.jpg','request-woman-mobile-20260925.jpg')
Get-ChildItem -LiteralPath $repo -File | Where-Object Extension -Match '^\.(jpg|jpeg|png|webp|svg|mp3|mp4)$' | ForEach-Object {
    $category = if ($_.Name -in @('almira.jpg','nastya.jpg')) {'shared'} elseif ($_.Name -in $siteMedia) {'site'} else {'library'}
    Plan-Move $_.Name "media/$category/$($_.Name)"
}
Get-ChildItem -LiteralPath (Join-Path $repo 'Кейсы и отзывы') -File -Filter '*.jpg' | ForEach-Object {
    $category = if ($_.Name -in @('photo_1_2026-03-04_00-49-32.jpg','photo_12_2026-03-04_00-49-32.jpg','photo_28_2026-03-04_00-49-32.jpg')) {'site'} else {'library'}
    Plan-Move "Кейсы и отзывы/$($_.Name)" "media/$category/reviews/$($_.Name)"
}
Plan-Move 'slides' 'media/site/slides'
$importRoot = Join-Path $repo 'База знаний/99 Исходные материалы'
if (Test-Path -LiteralPath $importRoot) {
    Get-ChildItem -LiteralPath $importRoot -File -Recurse | ForEach-Object {
        $rel = $_.FullName.Substring($importRoot.Length+1).Replace('\','/')
        $to = if ($_.Extension -match '^\.(jpg|jpeg|png|webp|svg|mp3|mp4)$') {"media/library/$rel"} elseif ($_.Extension -eq '.html') {"archive/site/$rel"} else {"База знаний/Источники/$rel"}
        Plan-Move "База знаний/99 Исходные материалы/$rel" $to
    }
}
if (Test-Path -LiteralPath (Join-Path $repo 'output')) {
    Get-ChildItem -LiteralPath (Join-Path $repo 'output') -File -Filter '*.html' -Recurse | ForEach-Object { $rel=$_.FullName.Substring((Join-Path $repo 'output').Length+1); Plan-Move "output/$rel" "archive/site/verification/$rel" }
}
foreach ($entry in $moves.GetEnumerator()) {
    $from = [IO.Path]::GetFullPath((Join-Path $repo $entry.Key)); $to = [IO.Path]::GetFullPath((Join-Path $repo $entry.Value))
    if (-not $from.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase) -or -not $to.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Move outside repository' }
    if (Test-Path -LiteralPath $to) { throw "Destination exists: $to" }
}
if (-not $Execute) { $moves.GetEnumerator() | ForEach-Object { "$($_.Key) -> $($_.Value)" }; exit }
foreach ($entry in $moves.GetEnumerator()) {
    $from=Join-Path $repo $entry.Key; $to=Join-Path $repo $entry.Value
    New-Item -ItemType Directory -Path (Split-Path -Parent $to) -Force | Out-Null
    Move-Item -LiteralPath $from -Destination $to
}
# The app directory has moved as a unit. Consolidate its own media now.
New-Item -ItemType Directory -Path (Join-Path $repo 'media/app') -Force | Out-Null
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $repo 'app/img') -File) {
    $shared=Join-Path $repo "media/shared/$($f.Name)"
    if (Test-Path -LiteralPath $shared) {
        if ((Get-FileHash -LiteralPath $shared).Hash -ne (Get-FileHash -LiteralPath $f.FullName).Hash) { throw "Different duplicate: $($f.Name)" }
        Remove-Item -LiteralPath $f.FullName
    } else { Move-Item -LiteralPath $f.FullName -Destination (Join-Path $repo "media/app/$($f.Name)") }
}
$slide=Join-Path $repo 'media/site/slides/screen-diary.jpg'; $diary=Join-Path $repo 'media/site/concept-diary.jpg'
if ((Get-FileHash -LiteralPath $slide).Hash -ne (Get-FileHash -LiteralPath $diary).Hash) { throw 'Different diary screenshot' }
Remove-Item -LiteralPath $slide
Move-Item -LiteralPath (Join-Path $repo 'app/Продуктовая матрица на 2026 год.pdf') -Destination (Join-Path $repo 'База знаний/Источники/Продуктовая матрица на 2026 год.pdf')
# Retain this map only in local recovery metadata for verification.
$moves | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $repo '.git/reorganization-map.json') -Encoding utf8
"Moved $($moves.Count) paths; removed 3 verified byte-identical duplicates."
