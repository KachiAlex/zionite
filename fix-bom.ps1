$file = "c:\zionite\frontend\android\app\build.gradle"
$content = Get-Content $file -Raw
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($file, $content, $utf8NoBom)
Write-Host "Done - BOM removed"
