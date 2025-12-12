package com.startupworld.voiceaibuddy.plugins;

import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.os.Build;
import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PluginMethod;

import org.json.JSONException;

@CapacitorPlugin(
        name = "AudioDevice",
        permissions = {
                @Permission(strings = {android.Manifest.permission.RECORD_AUDIO}, alias = "audio")
        }
)
public class AudioDevicePlugin extends Plugin {

    private AudioManager getAudioManager() {
        Context ctx = getContext();
        if (ctx == null) return null;
        return (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
    }

    private String getDeviceLabel(AudioDeviceInfo info, boolean isInput) {
        // Try product name first
        if (info.getProductName() != null && info.getProductName().toString().trim().length() > 0) {
            return info.getProductName().toString();
        }
        
        // Generate label based on device type
        int type = info.getType();
        String baseName = isInput ? "Microphone" : "Speaker";
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            switch (type) {
                case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
                case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
                    return "Bluetooth " + (isInput ? "Headset" : "Headset");
                case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                    return "Wired Headset";
                case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                    return "Wired Headphones";
                case AudioDeviceInfo.TYPE_USB_HEADSET:
                    return "USB Headset";
                case AudioDeviceInfo.TYPE_BUILTIN_MIC:
                    return "Built-in " + baseName;
                case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE:
                    return "Earpiece";
                case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
                    return "Phone Speaker";
                case AudioDeviceInfo.TYPE_TELEPHONY:
                    return "Phone " + baseName;
                case AudioDeviceInfo.TYPE_HDMI:
                    return "HDMI " + baseName;
                case AudioDeviceInfo.TYPE_HDMI_ARC:
                    return "HDMI ARC " + baseName;
                default:
                    return baseName + " (Type " + type + ")";
            }
        }
        
        return baseName;
    }

    @PluginMethod
    public void listInputDevices(PluginCall call) {
        AudioManager am = getAudioManager();
        if (am == null) {
            call.reject("AudioManager not available");
            return;
        }
        AudioDeviceInfo[] inputs = am.getDevices(AudioManager.GET_DEVICES_INPUTS);
        JSArray arr = new JSArray();
        for (AudioDeviceInfo info : inputs) {
            JSObject obj = new JSObject();
            obj.put("deviceId", String.valueOf(info.getId()));
            String label = getDeviceLabel(info, true);
            obj.put("label", label);
            obj.put("type", info.getType());
            obj.put("kind", "audioinput");
            arr.put(obj);
        }
        JSObject ret = new JSObject();
        ret.put("devices", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void listOutputDevices(PluginCall call) {
        AudioManager am = getAudioManager();
        if (am == null) {
            call.reject("AudioManager not available");
            return;
        }
        AudioDeviceInfo[] outputs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
        JSArray arr = new JSArray();
        for (AudioDeviceInfo info : outputs) {
            JSObject obj = new JSObject();
            obj.put("deviceId", String.valueOf(info.getId()));
            String label = getDeviceLabel(info, false);
            obj.put("label", label);
            obj.put("type", info.getType());
            obj.put("kind", "audiooutput");
            arr.put(obj);
        }
        JSObject ret = new JSObject();
        ret.put("devices", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void setInputDevice(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null || deviceId.isEmpty()) {
            call.reject("deviceId is required");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.reject("setInputDevice requires API 23+");
            return;
        }

        AudioManager am = getAudioManager();
        if (am == null) {
            call.reject("AudioManager not available");
            return;
        }
        AudioDeviceInfo target = null;
        for (AudioDeviceInfo info : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            if (String.valueOf(info.getId()).equals(deviceId)) {
                target = info;
                break;
            }
        }
        if (target == null) {
            call.reject("Input device not found");
            return;
        }
        try {
            int sampleRate = 16000;
            int channelMask = AudioFormat.CHANNEL_IN_MONO;
            int encoding = AudioFormat.ENCODING_PCM_16BIT;
            int bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelMask, encoding);
            AudioRecord record = new AudioRecord.Builder()
                    .setAudioSource(android.media.MediaRecorder.AudioSource.VOICE_COMMUNICATION)
                    .setAudioFormat(new AudioFormat.Builder()
                            .setSampleRate(sampleRate)
                            .setChannelMask(channelMask)
                            .setEncoding(encoding)
                            .build())
                    .setBufferSizeInBytes(bufferSize)
                    .build();
            // Apply preferred device on the built record (supported API 23+)
            record.setPreferredDevice(target);
            record.release();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Failed to set input device: " + ex.getMessage());
        }
    }

    @PluginMethod
    public void setOutputDevice(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null || deviceId.isEmpty()) {
            call.reject("deviceId is required");
            return;
        }
        AudioManager am = getAudioManager();
        if (am == null) {
            call.reject("AudioManager not available");
            return;
        }
        AudioDeviceInfo target = null;
        for (AudioDeviceInfo info : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            if (String.valueOf(info.getId()).equals(deviceId)) {
                target = info;
                break;
            }
        }
        if (target == null) {
            call.reject("Output device not found");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            boolean ok = am.setCommunicationDevice(target);
            JSObject ret = new JSObject();
            ret.put("success", ok);
            if (ok) {
                call.resolve(ret);
            } else {
                call.reject("Failed to set communication device");
            }
        } else {
            call.reject("Setting output device requires Android 12 (API 31)+");
        }
    }
}

