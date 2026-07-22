$file = "c:\zionite\frontend\android\app\build.gradle"
$lines = Get-Content $file

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s+release \{" -and $i -gt 25) {
        # This is the buildTypes release block (not the signingConfigs one)
        $lines[$i] = "        release {"
        # Insert signingConfig line after it
        $newLines = @()
        $newLines += $lines[0..$i]
        $newLines += "            signingConfig signingConfigs.release"
        $newLines += $lines[($i+1)..($lines.Count-1)]
        $lines = $newLines
        break
    }
}

Set-Content $file -Value $lines -Encoding UTF8
Write-Host "Done - signingConfig added to buildTypes release"
