import { type RefObject } from 'react';
import { captureRef } from 'react-native-view-shot';

const CAPTURE_WIDTH = 720;

export async function captureScreenshot(
  viewRef: RefObject<unknown>,
): Promise<string | null> {
  try {
    const uri = await captureRef(viewRef, {
      format: 'png',
      quality: 0.8,
      width: CAPTURE_WIDTH,
      result: 'tmpfile',
    });
    return uri;
  } catch {
    return null;
  }
}
