$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$mapping=@{}
Get-ChildItem (Join-Path $repo 'media/site') -File | ForEach-Object { $mapping[$_.Name]='/media/site/'+$_.Name }
foreach($name in @('almira.jpg','nastya.jpg')){$mapping[$name]='/media/shared/'+$name}
Get-ChildItem (Join-Path $repo 'media/site/slides') -File | ForEach-Object {$mapping['slides/'+$_.Name]='/media/site/slides/'+$_.Name}
$mapping['slides/screen-diary.jpg']='/media/site/concept-diary.jpg'
Get-ChildItem (Join-Path $repo 'media/site/reviews') -File | ForEach-Object {$mapping['Кейсы и отзывы/'+$_.Name]='/media/site/reviews/'+$_.Name}
foreach($file in Get-ChildItem (Join-Path $repo 'site') -File -Filter '*.html'){
    $text=[IO.File]::ReadAllText($file.FullName)
    foreach($entry in $mapping.GetEnumerator()) {
        $variants=@($entry.Key, (($entry.Key -split '/' | ForEach-Object {[uri]::EscapeDataString($_)}) -join '/')) | Select-Object -Unique
        foreach($old in $variants){
            foreach($quote in @('"',"'")) {
                $text=$text.Replace($quote+$old+$quote,$quote+$entry.Value+$quote)
                $text=$text.Replace($quote+'https://telo-pomnit.ru/'+$old+$quote,$quote+'https://telo-pomnit.ru'+$entry.Value+$quote)
            }
            $text=$text.Replace('url('+$old+')','url('+$entry.Value+')')
        }
    }
    [IO.File]::WriteAllText($file.FullName,$text,[Text.UTF8Encoding]::new($false))
}
foreach($file in Get-ChildItem (Join-Path $repo 'app') -File -Recurse | Where-Object Extension -in @('.html','.js','.css')){
    $text=[IO.File]::ReadAllText($file.FullName)
    foreach($name in @('body-front.png','body-rear.png','body-glow.png','almira.jpg','nastya.jpg')){
        $category=if($name -in @('almira.jpg','nastya.jpg')){'shared'}else{'app'}
        foreach($quote in @('"',"'")){$text=$text.Replace($quote+'img/'+$name+$quote,$quote+'/media/'+$category+'/'+$name+$quote)}
    }
    [IO.File]::WriteAllText($file.FullName,$text,[Text.UTF8Encoding]::new($false))
}
'Updated public media paths in site and app.'
