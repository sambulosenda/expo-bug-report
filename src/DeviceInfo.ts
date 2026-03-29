import { Platform, Dimensions } from 'react-native';
import * as Device from 'expo-device';
import { getLocales } from 'expo-localization';
import Constants from 'expo-constants';
import type { DeviceInfo } from './integrations/types';

function getInstallationId(): string {
  // Constants.installationId is deprecated in newer Expo SDKs
  // Fall back gracefully through available identifiers
  try {
    if (Constants.installationId) return Constants.installationId;
  } catch {
    // property may not exist
  }
  return Constants.sessionId ?? 'unknown';
}

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
    installationId: getInstallationId(),
    expoConfig,
  };
}
