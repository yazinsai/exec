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

// Action type colors - dark theme (dark backgrounds, light text)
export const actionTypeColorsDark = {
  // New taxonomy
  CodeChange: { label: "CODE", color: "#93c5fd", bg: "#1e3a5f" },
  Project: { label: "PROJECT", color: "#fbbf24", bg: "#92400e" },
  Research: { label: "RESEARCH", color: "#fcd34d", bg: "#78350f" },
  Write: { label: "WRITE", color: "#c4b5fd", bg: "#4c1d95" },
  UserTask: { label: "USER", color: "#86efac", bg: "#14532d" },
  // UI states
  review: { label: "Review", color: "#fbbf24", bg: "#78350f" },
  // Legacy fallback
  note: { label: "NOTE", color: "#9ca3af", bg: "#374151" },
} as const;

// Action type colors - light theme (soft tinted backgrounds, darker text)
export const actionTypeColorsLight = {
  // New taxonomy
  CodeChange: { label: "CODE", color: "#1d4ed8", bg: "#dbeafe" }, // blue-700 on blue-100
  Project: { label: "PROJECT", color: "#b45309", bg: "#fef3c7" }, // amber-700 on amber-100
  Research: { label: "RESEARCH", color: "#a16207", bg: "#fef3c7" }, // yellow-700 on yellow-100
  Write: { label: "WRITE", color: "#6d28d9", bg: "#ede9fe" }, // violet-700 on violet-100
  UserTask: { label: "USER", color: "#15803d", bg: "#dcfce7" }, // green-700 on green-100
  // UI states
  review: { label: "Review", color: "#b45309", bg: "#fef3c7" }, // amber-700 on amber-100
  // Legacy fallback
  note: { label: "NOTE", color: "#6b7280", bg: "#f3f4f6" }, // gray-500 on gray-100
} as const;

// Legacy export for backwards compatibility (uses dark theme)
export const actionTypeColors = actionTypeColorsDark;

export type ActionType = keyof typeof actionTypeColors;

// Dark theme tokens
const darkColors = {
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

  // Overlays
  overlay: "rgba(0, 0, 0, 0.7)",
  overlayLight: "rgba(0, 0, 0, 0.6)",
  errorBgAlpha: "rgba(239, 68, 68, 0.12)",

  // Shadows
  shadow: "#000",

  // Constant
  white: "#fff",
};

// Light theme tokens
const lightColors = {
  // Backgrounds - softer than pure white for reduced harshness
  background: gray[100],
  backgroundElevated: "#fafafa", // Softer than #fff, reduces visual "holes"
  backgroundPressed: gray[200],

  // Borders - stronger for better definition
  border: gray[300], // Upgraded from gray[200] for visibility
  borderLight: gray[200],
  borderFocused: semantic.primary,

  // Text - softer black for elegance
  textPrimary: "#1e293b", // slate-800, softer than gray-900
  textSecondary: gray[600],
  textTertiary: gray[500],
  textMuted: gray[500], // Upgraded from gray[400] for better contrast

  // Interactive
  primary: semantic.primary,
  primaryDark: semantic.primaryDark,

  // Status
  error: semantic.error,
  errorLight: semantic.errorLight,
  errorDark: semantic.errorDark,
  success: semantic.success,
  warning: semantic.warning,

  // Overlays
  overlay: "rgba(0, 0, 0, 0.5)",
  overlayLight: "rgba(0, 0, 0, 0.4)",
  errorBgAlpha: "rgba(239, 68, 68, 0.15)",

  // Shadows
  shadow: gray[400],

  // Constant
  white: "#fff",
};

// Theme type
export type ThemeColors = typeof darkColors;

// Export themes
export const themes = {
  dark: darkColors,
  light: lightColors,
};

// Default export for backwards compatibility during migration
export const colors = darkColors;

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
