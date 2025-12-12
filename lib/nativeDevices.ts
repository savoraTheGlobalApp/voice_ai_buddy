import { Capacitor, registerPlugin } from '@capacitor/core';

export type NativeDevice = {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
  type?: string;
};

type ListDevicesResult = {
  devices: Array<NativeDevice>;
};

type AudioDevicePlugin = {
  listInputDevices(): Promise<ListDevicesResult>;
  listOutputDevices(): Promise<ListDevicesResult>;
  setInputDevice(options: { deviceId: string }): Promise<{ success: boolean }>;
  setOutputDevice(options: { deviceId: string }): Promise<{ success: boolean }>;
};

const AudioDevice = registerPlugin<AudioDevicePlugin>('AudioDevice', {
  web: undefined,
  android: {
    // Plugin will be auto-registered via @CapacitorPlugin annotation
  },
});

export const isNativeAudioAvailable = (): boolean => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
};

export async function listNativeInputs(): Promise<NativeDevice[]> {
  if (!isNativeAudioAvailable()) return [];
  try {
    const { devices } = await AudioDevice.listInputDevices();
    return devices?.map((d) => ({ ...d, kind: 'audioinput' })) ?? [];
  } catch (e) {
    console.warn('[NativeAudio] listInputDevices failed', e);
    return [];
  }
}

export async function listNativeOutputs(): Promise<NativeDevice[]> {
  if (!isNativeAudioAvailable()) return [];
  try {
    const { devices } = await AudioDevice.listOutputDevices();
    return devices?.map((d) => ({ ...d, kind: 'audiooutput' })) ?? [];
  } catch (e) {
    console.warn('[NativeAudio] listOutputDevices failed', e);
    return [];
  }
}

export async function setNativeInputDevice(deviceId: string | null | undefined) {
  if (!isNativeAudioAvailable() || !deviceId) return;
  try {
    await AudioDevice.setInputDevice({ deviceId });
  } catch (e) {
    console.warn('[NativeAudio] setInputDevice failed', e);
  }
}

export async function setNativeOutputDevice(deviceId: string | null | undefined) {
  if (!isNativeAudioAvailable() || !deviceId) return;
  try {
    await AudioDevice.setOutputDevice({ deviceId });
  } catch (e) {
    console.warn('[NativeAudio] setOutputDevice failed', e);
  }
}

