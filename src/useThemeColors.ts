import { useColorScheme, type ColorSchemeName } from 'react-native';

export interface ThemeColors {
  background: string;
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  inputBackground: string;
  inputBorder: string;
  primary: string;
  error: string;
  disabled: string;
}

const lightColors: ThemeColors = {
  background: '#fff',
  surface: '#F2F2F7',
  border: '#E5E5EA',
  text: '#000',
  textSecondary: '#8E8E93',
  textTertiary: '#C7C7CC',
  inputBackground: '#F2F2F7',
  inputBorder: '#E5E5EA',
  primary: '#007AFF',
  error: '#FF3B30',
  disabled: '#C7C7CC',
};

const darkColors: ThemeColors = {
  background: '#1C1C1E',
  surface: '#2C2C2E',
  border: '#38383A',
  text: '#fff',
  textSecondary: '#8E8E93',
  textTertiary: '#48484A',
  inputBackground: '#2C2C2E',
  inputBorder: '#38383A',
  primary: '#0A84FF',
  error: '#FF453A',
  disabled: '#48484A',
};

export function useThemeColors(override?: ColorSchemeName): ThemeColors {
  const deviceScheme = useColorScheme();
  const scheme = override ?? deviceScheme;
  return scheme === 'dark' ? darkColors : lightColors;
}
