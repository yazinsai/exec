/**
 * Design tokens for the mic-app
 * All colors follow the Tailwind gray palette with semantic naming
 */

// Base palette (Tailwind Gray)
const gray = {
  50: "#f9fafb",
  100: "#f3f4f6",
  200: "#e5e7eb",
  300: "#d1d5db",
  400: "#9ca3af",
  500: "#6b7280",
  600: "#4b5563",
  700: "#374151",
  800: "#1f2937",
  900: "#111827",
  950: "#030712",
};

// Semantic colors
const semantic = {
  primary: "#3b82f6", // blue-500
  primaryDark: "#2563eb", // blue-600
  error: "#ef4444", // red-500
  errorLight: "#f87171", // red-400
  errorDark: "#dc2626", // red-600
  success: "#22c55e", // green-500
  warning: "#f59e0b", // amber-500
};

// Dark theme tokens (currently the only theme)
export const colors = {
  // Backgrounds
  background: gray[900],
  backgroundElevated: gray[800],
  backgroundPressed: gray[700],

  // Borders
  border: gray[700],
  borderLight: gray[600],
  borderFocused: semantic.primary,

  // Text
  textPrimary: gray[50],
  textSecondary: gray[300],
  textTertiary: gray[400],
  textMuted: gray[500],

  // Interactive
  primary: semantic.primary,
  primaryDark: semantic.primaryDark,

  // Status
  error: semantic.error,
  errorLight: semantic.errorLight,
  errorDark: semantic.errorDark,
  success: semantic.success,
  warning: semantic.warning,

  // Shadows
  shadow: "#000",

  // Constant
  white: "#fff",
};

// Spacing scale (4px base)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

// Border radius scale
export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

// Typography
export const typography = {
  // Font sizes
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  xxl: 20,
  display: 48,

  // Font weights
  light: "200" as const,
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};

// Shadow presets
export const shadows = {
  sm: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  md: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};
