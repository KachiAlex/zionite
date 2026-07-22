$file = "c:\zionite\frontend\android\app\src\main\java\fm\zionite\app\MainActivity.java"
$content = Get-Content $file -Raw

# 1. Add import for SystemAudioPlugin annotation
$content = $content -replace "import com.getcapacitor.BridgeActivity;", "import com.getcapacitor.BridgeActivity;`r`nimport com.getcapacitor.annotation.CapacitorPlugin;"

# 2. Add @CapacitorPlugin annotation and register SystemAudioPlugin
$content = $content -replace "public class MainActivity extends com.getcapacitor.BridgeActivity \{", "public class MainActivity extends com.getcapacitor.BridgeActivity {`r`n`r`n    @CapacitorPlugin`r`n    private SystemAudioPlugin systemAudioPlugin;"

# 3. Register the plugin in onCreate
$content = $content -replace "super.onCreate\(savedInstanceState\);", "super.onCreate(savedInstanceState);`r`n        try {`r`n            systemAudioPlugin = new SystemAudioPlugin();`r`n            registerPlugin(SystemAudioPlugin.class, systemAudioPlugin);`r`n        } catch (Exception e) {}"

# 4. Fix onPause to not pause WebView when audio service is active
$content = $content -replace "    @Override`r`n    public void onPause\(\) \{`r`n        super.onPause\(\);`r`n        try \{`r`n            if \(getBridge\(\) != null && getBridge\(\).getWebView\(\) != null\) \{ `r`n                getBridge\(\).getWebView\(\).onPause\(\);`r`n                getBridge\(\).getWebView\(\).pauseTimers\(\);`r`n            \}`r`n        \} catch \(Exception e\) \{\}`r`n    \}", "    private boolean keepWebViewActive = false;`r`n`r`n    public void setKeepWebViewActive(boolean keep) {`r`n        keepWebViewActive = keep;`r`n    }`r`n`r`n    @Override`r`n    public void onPause() {`r`n        super.onPause();`r`n        if (!keepWebViewActive) {`r`n            try {`r`n                if (getBridge() != null && getBridge().getWebView() != null) {`r`n                    getBridge().getWebView().onPause();`r`n                    getBridge().getWebView().pauseTimers();`r`n                }`r`n            } catch (Exception e) {}`r`n        }`r`n    }"

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($file, $content, $utf8NoBom)
Write-Host "Done - MainActivity updated"
