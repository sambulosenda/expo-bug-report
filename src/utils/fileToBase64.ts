import { Platform } from 'react-native';

export async function fileToBase64(uri: string): Promise<string> {
  const response = await fetch(
    Platform.OS === 'android' ? uri : uri.replace('file://', ''),
  );
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result.split(',')[1] ?? result);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
