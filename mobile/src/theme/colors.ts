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

// Bright, warm, child-friendly — default theme
export const lightColors: ThemeColors = {
  background:    '#fff8f0',  // warm cream-white
  surface:       '#ffffff',  // pure white cards
  surfaceBorder: '#fde8cc',  // soft peach border
  text:          '#1c0a00',  // near-black, warm
  textSecondary: '#78350f',  // amber-brown
  textTertiary:  '#b45309',  // muted amber
  accent:        '#f97316',  // saffron orange (brand)
  accentText:    '#ffffff',
  tabBar:        '#ffffff',  // crisp white tab bar
  tabBarBorder:  '#fde8cc',  // peach border
  headerBg:      '#fff8f0',
  divider:       '#fde8cc',
};

// Warm night-sky dark — for low-light reading
export const darkColors: ThemeColors = {
  background:    '#1a0e2e',  // deep indigo-purple
  surface:       '#2d1f45',  // slightly lighter purple
  surfaceBorder: '#3d2f5a',  // purple border
  text:          '#fef9f0',  // warm white
  textSecondary: '#e8d5b7',  // warm beige
  textTertiary:  '#a08060',  // muted warm
  accent:        '#f97316',  // saffron orange (brand)
  accentText:    '#ffffff',
  tabBar:        '#1a0e2e',
  tabBarBorder:  '#3d2f5a',
  headerBg:      '#1a0e2e',
  divider:       '#3d2f5a',
};
