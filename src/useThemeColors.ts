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
  background: '#F5F0EA',
  surface: '#FFFFFF',
  border: '#C4BFB8',
  text: '#1A1814',
  textSecondary: '#6B6358',
  textTertiary: '#9B9183',
  inputBackground: '#F0EBE4',
  inputBorder: '#C4BFB8',
  primary: '#E86B2E',
  error: '#D94B4B',
  disabled: '#9B9183',
};

const darkColors: ThemeColors = {
  background: '#1A1814',
  surface: '#242019',
  border: '#3D372F',
  text: '#E8E0D4',
  textSecondary: '#9B9183',
  textTertiary: '#5C554B',
  inputBackground: '#141210',
  inputBorder: '#3D372F',
  primary: '#E86B2E',
  error: '#D94B4B',
  disabled: '#5C554B',
};

export function useThemeColors(override?: ColorSchemeName): ThemeColors {
  const deviceScheme = useColorScheme();
  const scheme = override ?? deviceScheme;
  return scheme === 'dark' ? darkColors : lightColors;
}
