export enum EncodingType {
  UTF8 = 'utf8',
  Base64 = 'base64',
}

export const readAsStringAsync = jest.fn(
  (_uri: string, _options?: { encoding?: EncodingType }) =>
    Promise.resolve('dGVzdGJhc2U2NA=='),
);
