import { Platform, Dimensions } from 'react-native';
import * as Device from 'expo-device';
import { getLocales } from 'expo-localization';
import Constants from 'expo-constants';
import type { DeviceInfo } from './integrations/types';

export function collectDeviceInfo(): DeviceInfo {
  const { width, height } = Dimensions.get('window');
  const locales = getLocales();
  const locale = locales[0]?.languageTag ?? 'unknown';

  const expoConfig = Constants.expoConfig
    ? { name: Constants.expoConfig.name ?? 'unknown', slug: Constants.expoConfig.slug ?? 'unknown' }
    : null;

  return {
    model: Device.modelName ?? `${Platform.OS} device`,
    os: `${Platform.OS} ${Platform.Version}`,
    appVersion:
      Constants.expoConfig?.version ??
      Constants.manifest2?.extra?.expoClient?.version ??
      'unknown',
    screenSize: `${width}x${height}`,
    locale,
    installationId: Constants.installationId ?? 'unknown',
    expoConfig,
  };
}
