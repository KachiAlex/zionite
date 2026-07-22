$content = @'
package fm.zionite.app;

import android.Manifest;
import android.content.Context;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends com.getcapacitor.BridgeActivity {

    private static final int PERMISSIONS_REQUEST_CODE = 1001;
    private static final int BATTERY_OPTIMIZATION_REQUEST_CODE = 10002;
    private boolean permissionsRequested = false;
    private boolean keepWebViewActive = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            registerPlugin(SystemAudioPlugin.class);
        } catch (Exception e) {}

        try { createNotificationChannel(); } catch (Exception e) {}

        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
                getBridge().getWebView().addJavascriptInterface(new AudioServiceBridge(), "AndroidAudio");
            }
        } catch (Exception e) {}
    }

    public class AudioServiceBridge {
        @JavascriptInterface
        public void startAudioService() {
            try {
                setKeepWebViewActive(true);
                Intent intent = new Intent(MainActivity.this, AudioService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent);
                } else {
                    startService(intent);
                }
            } catch (Exception e) {}
        }

        @JavascriptInterface
        public void stopAudioService() {
            try {
                setKeepWebViewActive(false);
                stopService(new Intent(MainActivity.this, AudioService.class));
            } catch (Exception e) {}
        }

        @JavascriptInterface
        public void setKeepWebViewActive(boolean keep) {
            keepWebViewActive = keep;
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (!permissionsRequested) {
            permissionsRequested = true;
            try { requestPermissions(); } catch (Exception e) {}
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try { requestBatteryOptimizationExemption(); } catch (Exception e) {}
            }, 3000);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        if (!keepWebViewActive) {
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().onPause();
                    getBridge().getWebView().pauseTimers();
                }
            } catch (Exception e) {}
        }
    }

    @Override
    public void onDestroy() {
        try {
            stopService(new Intent(this, AudioService.class));
        } catch (Exception e) {}
        super.onDestroy();
    }

    private void requestPermissions() {
        java.util.List<String> permissions = new java.util.ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.RECORD_AUDIO);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.READ_MEDIA_AUDIO);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }

        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), PERMISSIONS_REQUEST_CODE);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            "zionite-general",
            "ZioniteFM Notifications",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Live broadcasts, sermons, daily verses, and ministry updates");
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private void requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        if (powerManager == null) return;
        if (powerManager.isIgnoringBatteryOptimizations(getPackageName())) return;
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getPackageName()));

        if (intent.resolveActivity(getPackageManager()) != null) {
            startActivityForResult(intent, BATTERY_OPTIMIZATION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }
}
'@

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("c:\zionite\frontend\android\app\src\main\java\fm\zionite\app\MainActivity.java", $content, $utf8NoBom)
Write-Host "Done - MainActivity.java written"
