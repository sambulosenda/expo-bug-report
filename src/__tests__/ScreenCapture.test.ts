import { captureScreenshot } from '../ScreenCapture';
import { captureRef } from 'react-native-view-shot';

describe('captureScreenshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns URI on success', async () => {
    const ref = { current: {} };
    const result = await captureScreenshot(ref as any);
    expect(result).toBe('file:///tmp/screenshot.png');
    expect(captureRef).toHaveBeenCalledWith(ref, {
      format: 'png',
      quality: 0.8,
      width: 720,
      result: 'tmpfile',
    });
  });

  it('returns null on error (Expo Go)', async () => {
    (captureRef as jest.Mock).mockRejectedValueOnce(new Error('Not available'));
    const ref = { current: {} };
    const result = await captureScreenshot(ref as any);
    expect(result).toBeNull();
  });
});
