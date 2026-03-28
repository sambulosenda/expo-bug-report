import { fileToBase64 } from '../utils/fileToBase64';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

describe('fileToBase64', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads file as base64 using expo-file-system', async () => {
    const result = await fileToBase64('file:///tmp/test.png');
    expect(readAsStringAsync).toHaveBeenCalledWith('file:///tmp/test.png', {
      encoding: EncodingType.Base64,
    });
    expect(result).toBe('dGVzdGJhc2U2NA==');
  });

  it('propagates errors from readAsStringAsync', async () => {
    (readAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error('File not found'));
    await expect(fileToBase64('file:///nonexistent')).rejects.toThrow('File not found');
  });
});
