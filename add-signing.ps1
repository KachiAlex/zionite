$file = "c:\zionite\frontend\android\app\build.gradle"
$content = Get-Content $file -Raw

$signingBlock = @"
signingConfigs {
        release {
            storeFile file('../../zionite-release.keystore')
            storePassword 'zionite123'
            keyAlias 'zionite'
            keyPassword 'zionite123'
        }
    }

    buildTypes {
"@

$content = $content -replace "buildTypes \{", $signingBlock
Set-Content $file -Value $content -NoNewline
Write-Host "Done"
