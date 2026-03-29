import { collectDeviceInfo } from '../DeviceInfo';
import { getLocales } from 'expo-localization';
import * as Device from 'expo-device';

describe('collectDeviceInfo', () => {
  it('returns all device fields populated', () => {
    const info = collectDeviceInfo();
    expect(info.model).toBe('iPhone 15 Pro');
    expect(info.os).toBe('ios 17.0');
    expect(info.appVersion).toBe('1.0.0');
    expect(info.screenSize).toBe('390x844');
    expect(info.locale).toBe('en-US');
    expect(info.installationId).toBe('test-installation-id');
    expect(info.expoConfig).toEqual({ name: 'TestApp', slug: 'test-app' });
  });

  it('falls back when modelName is null', () => {
    const original = (Device as any).modelName;
    (Device as any).modelName = null;
    const info = collectDeviceInfo();
    expect(info.model).toBe('ios device');
    (Device as any).modelName = original;
  });

  it('falls back when locales return empty languageTag', () => {
    (getLocales as jest.Mock).mockReturnValueOnce([{ languageTag: undefined }]);
    const info = collectDeviceInfo();
    expect(info.locale).toBe('unknown');
  });
});
