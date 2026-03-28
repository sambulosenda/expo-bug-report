import { Platform, Dimensions } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { DeviceInfo } from './integrations/types';

export function collectDeviceInfo(): DeviceInfo {
  const { width, height } = Dimensions.get('window');
  const locale =
    Platform.OS === 'ios'
      ? (Platform as unknown as Record<string, unknown>).locale
      : undefined;

  return {
    model: Device.modelName ?? `${Platform.OS} device`,
    os: `${Platform.OS} ${Platform.Version}`,
    appVersion:
      Constants.expoConfig?.version ??
      Constants.manifest2?.extra?.expoClient?.version ??
      'unknown',
    screenSize: `${width}x${height}`,
    locale: typeof locale === 'string' ? locale : 'unknown',
  };
}
