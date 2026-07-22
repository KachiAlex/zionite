$file = "c:\zionite\frontend\android\app\build.gradle"
$content = Get-Content $file -Raw
$content = $content -replace "file\('zionite-release.keystore'\)", "file('../zionite-release.keystore')"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($file, $content, $utf8NoBom)
Write-Host "Done"
