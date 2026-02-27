export type ThemeColors = {
  background: string;
  surface: string;
  surfaceBorder: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentText: string;
  tabBar: string;
  tabBarBorder: string;
  headerBg: string;
  divider: string;
};

export const darkColors: ThemeColors = {
  background:    '#0a0a0a',
  surface:       '#1a1a1a',
  surfaceBorder: '#2a2a2a',
  text:          '#ffffff',
  textSecondary: '#d1d5db',
  textTertiary:  '#6b7280',
  accent:        '#f97316',
  accentText:    '#ffffff',
  tabBar:        '#0a0a0a',
  tabBarBorder:  '#1a1a1a',
  headerBg:      '#0a0a0a',
  divider:       '#2a2a2a',
};

export const lightColors: ThemeColors = {
  background:    '#faf8f5',
  surface:       '#ffffff',
  surfaceBorder: '#e8e0d5',
  text:          '#2c1810',
  textSecondary: '#5c4033',
  textTertiary:  '#9e8272',
  accent:        '#f97316',
  accentText:    '#ffffff',
  tabBar:        '#faf8f5',
  tabBarBorder:  '#e8e0d5',
  headerBg:      '#faf8f5',
  divider:       '#e8e0d5',
};
