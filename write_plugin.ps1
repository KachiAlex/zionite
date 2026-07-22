$pluginContent = @'
package fm.zionite.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.MediaProjection;
import android.media.MediaProjectionManager;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.activity.result.ActivityResult;

@CapacitorPlugin(name = "SystemAudio")
public class SystemAudioPlugin extends Plugin {

    private static final String TAG = "SystemAudioPlugin";
    private static final int REQUEST_CODE = 2001;
    private static final int SAMPLE_RATE = 48000;
    private static final int BUFFER_SIZE = 8192;

    private MediaProjectionManager projectionManager;
    private MediaProjection mediaProjection;
    private AudioRecord audioRecord;
    private boolean isCapturing = false;
    private Thread captureThread;

    @PluginMethod
    public void startCapture(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) {
            call.reject("System audio capture requires Android 10 or above");
            return;
        }

        try {
            projectionManager = (MediaProjectionManager) getActivity()
                .getSystemService(Context.MEDIA_PROJECTION_SERVICE);

            if (projectionManager == null) {
                call.reject("MediaProjection service not available");
                return;
            }

            Intent intent = projectionManager.createScreenCaptureIntent();
            startActivityForResult(call, intent, REQUEST_CODE, "onProjectionResult");
        } catch (Exception e) {
            Log.e(TAG, "startCapture error", e);
            call.reject("Failed to start capture: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void onProjectionResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("Screen capture permission denied");
            return;
        }

        try {
            mediaProjection = projectionManager.getMediaProjection(
                result.getResultCode(), result.getData());

            if (mediaProjection == null) {
                call.reject("Failed to get MediaProjection");
                return;
            }

            mediaProjection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    isCapturing = false;
                }
            }, null);

            AudioPlaybackCaptureConfiguration config =
                new AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                    .build();

            AudioFormat format = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                .build();

            int minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            int bufSize = Math.max(minBuf * 2, BUFFER_SIZE);

            audioRecord = new AudioRecord.Builder()
                .setAudioFormat(format)
                .setBufferSizeInBytes(bufSize)
                .setAudioPlaybackCaptureConfig(config)
                .build();

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                call.reject("AudioRecord initialization failed");
                return;
            }

            audioRecord.startRecording();
            isCapturing = true;

            captureThread = new Thread(() -> {
                short[] shortBuffer = new short[BUFFER_SIZE / 2];
                byte[] byteBuffer = new byte[BUFFER_SIZE];

                while (isCapturing && audioRecord != null) {
                    int read = audioRecord.read(shortBuffer, 0, shortBuffer.length);
                    if (read > 0) {
                        for (int i = 0; i < read; i++) {
                            byteBuffer[i * 2] = (byte) (shortBuffer[i] & 0xFF);
                            byteBuffer[i * 2 + 1] = (byte) ((shortBuffer[i] >> 8) & 0xFF);
                        }

                        String base64 = Base64.encodeToString(byteBuffer, 0, read * 2, Base64.NO_WRAP);

                        JSObject data = new JSObject();
                        data.put("data", base64);
                        data.put("sampleRate", SAMPLE_RATE);
                        data.put("channels", 1);
                        notifyListeners("audioChunk", data);
                    }
                }
            }, "SystemAudioCapture");
            captureThread.start();

            call.resolve(new JSObject().put("started", true).put("sampleRate", SAMPLE_RATE));

        } catch (Exception e) {
            Log.e(TAG, "onProjectionResult error", e);
            call.reject("Capture setup failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopCapture(PluginCall call) {
        isCapturing = false;

        try {
            if (captureThread != null) {
                captureThread.interrupt();
                captureThread = null;
            }
            if (audioRecord != null) {
                if (audioRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    audioRecord.stop();
                }
                audioRecord.release();
                audioRecord = null;
            }
            if (mediaProjection != null) {
                mediaProjection.stop();
                mediaProjection = null;
            }
        } catch (Exception e) {
            Log.e(TAG, "stopCapture error", e);
        }

        call.resolve(new JSObject().put("stopped", true));
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q);
        call.resolve(result);
    }
}
'@

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("c:\zionite\frontend\android\app\src\main\java\fm\zionite\app\SystemAudioPlugin.java", $pluginContent, $utf8NoBom)
Write-Host "Done - SystemAudioPlugin.java written"
