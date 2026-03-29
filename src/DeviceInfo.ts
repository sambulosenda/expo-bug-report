import { Platform, Dimensions } from 'react-native';
import type { DeviceInfo } from './integrations/types';

// Optional deps — degrade gracefully when not installed
let Device: { modelName: string | null } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Device = require('expo-device');
} catch {
  // expo-device not installed
}

let getLocales: (() => Array<{ languageTag: string }>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  getLocales = require('expo-localization').getLocales;
} catch {
  // expo-localization not installed
}

let Constants: {
  installationId?: string;
  sessionId?: string;
  expoConfig?: { name?: string; slug?: string; version?: string } | null;
  manifest2?: { extra?: { expoClient?: { version?: string } } };
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Constants = require('expo-constants').default;
} catch {
  // expo-constants not installed
}

function getInstallationId(): string {
  if (!Constants) return 'unknown';

  try {
    if (Constants.installationId) return Constants.installationId;
  } catch {
    // property may not exist
  }
  return Constants.sessionId ?? 'unknown';
}

export function collectDeviceInfo(): DeviceInfo {
  const { width, height } = Dimensions.get('window');

  const locales = getLocales?.() ?? [];
  const locale = locales[0]?.languageTag ?? 'unknown';

  const expoConfig = Constants?.expoConfig
    ? { name: Constants.expoConfig.name ?? 'unknown', slug: Constants.expoConfig.slug ?? 'unknown' }
    : null;

  return {
    model: Device?.modelName ?? `${Platform.OS} device`,
    os: `${Platform.OS} ${Platform.Version}`,
    appVersion:
      Constants?.expoConfig?.version ??
      Constants?.manifest2?.extra?.expoClient?.version ??
      'unknown',
    screenSize: `${width}x${height}`,
    locale,
    installationId: getInstallationId(),
    expoConfig,
  };
}
