$file = "c:\zionite\frontend\android\app\build.gradle"
$content = Get-Content $file -Raw
$content = $content -replace "release \{`r`n            minifyEnabled false", "release {`r`n            signingConfig signingConfigs.release`r`n            minifyEnabled false"
Set-Content $file -Value $content -NoNewline
Write-Host "Done"
