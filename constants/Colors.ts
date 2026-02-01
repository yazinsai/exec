/**
 * Exec Design System
 * Premium black aesthetic with gold accents
 * James Bond meets Silicon Valley
 */

// Base palette - True blacks and golds
const black = {
  pure: "#000000",
  soft: "#0a0a0a",
  elevated: "#111111",
  surface: "#1a1a1a",
  muted: "#2a2a2a",
};

const gold = {
  pure: "#d4af37",      // Classic gold
  bright: "#f59e0b",    // Amber
  muted: "#b8860b",     // Dark goldenrod
  light: "#fbbf24",     // Light amber
  subtle: "rgba(212, 175, 55, 0.15)", // Gold tint
};

const mono = {
  white: "#ffffff",
  cream: "#fafaf9",
  silver: "#a1a1aa",
  gray: "#71717a",
  darkGray: "#3f3f46",
};

// Semantic colors - minimal, status only
const semantic = {
  success: "#22c55e",
  error: "#ef4444",
  warning: gold.bright,
};

// Action type colors - dark theme (premium black aesthetic)
export const actionTypeColorsDark = {
  CodeChange: { label: "CODE", color: "#60a5fa", bg: "#172554" },
  Project: { label: "PROJECT", color: gold.light, bg: "#422006" },
  Research: { label: "RESEARCH", color: "#fde047", bg: "#3f3f00" },
  Write: { label: "WRITE", color: "#c4b5fd", bg: "#2e1065" },
  UserTask: { label: "USER", color: "#86efac", bg: "#052e16" },
  review: { label: "Review", color: gold.light, bg: "#422006" },
  note: { label: "NOTE", color: mono.silver, bg: black.muted },
} as const;

// Action type colors - light theme (keeping for compatibility, but app is dark-first)
export const actionTypeColorsLight = {
  CodeChange: { label: "CODE", color: "#1d4ed8", bg: "#dbeafe" },
  Project: { label: "PROJECT", color: "#b45309", bg: "#fef3c7" },
  Research: { label: "RESEARCH", color: "#a16207", bg: "#fef3c7" },
  Write: { label: "WRITE", color: "#6d28d9", bg: "#ede9fe" },
  UserTask: { label: "USER", color: "#15803d", bg: "#dcfce7" },
  review: { label: "Review", color: "#b45309", bg: "#fef3c7" },
  note: { label: "NOTE", color: "#6b7280", bg: "#f3f4f6" },
} as const;

export const actionTypeColors = actionTypeColorsDark;
export type ActionType = keyof typeof actionTypeColors;

// Dark theme - Premium black aesthetic (PRIMARY)
const darkColors = {
  // Backgrounds - true black
  background: black.pure,
  backgroundElevated: black.elevated,
  backgroundPressed: black.surface,
  backgroundSubtle: black.soft,

  // Borders - subtle
  border: black.muted,
  borderLight: black.surface,
  borderFocused: gold.pure,

  // Text - high contrast
  textPrimary: mono.white,
  textSecondary: mono.silver,
  textTertiary: mono.gray,
  textMuted: mono.darkGray,

  // Gold accent - the signature
  primary: gold.pure,
  primaryDark: gold.muted,
  primaryLight: gold.light,
  accent: gold.pure,
  accentSubtle: gold.subtle,

  // Status
  error: semantic.error,
  errorLight: "#f87171",
  errorDark: "#dc2626",
  success: semantic.success,
  warning: semantic.warning,

  // Overlays
  overlay: "rgba(0, 0, 0, 0.85)",
  overlayLight: "rgba(0, 0, 0, 0.7)",
  errorBgAlpha: "rgba(239, 68, 68, 0.12)",

  // Shadows
  shadow: "#000",

  // Constants
  white: mono.white,
  black: black.pure,
  gold: gold.pure,
};

// Light theme - Clean and minimal (SECONDARY)
const lightColors = {
  background: mono.cream,
  backgroundElevated: mono.white,
  backgroundPressed: "#f4f4f5",
  backgroundSubtle: "#fafafa",

  border: "#e4e4e7",
  borderLight: "#f4f4f5",
  borderFocused: gold.muted,

  textPrimary: black.soft,
  textSecondary: mono.gray,
  textTertiary: mono.silver,
  textMuted: "#a1a1aa",

  primary: gold.muted,
  primaryDark: "#996515",
  primaryLight: gold.bright,
  accent: gold.muted,
  accentSubtle: "rgba(212, 175, 55, 0.1)",

  error: semantic.error,
  errorLight: "#f87171",
  errorDark: "#dc2626",
  success: semantic.success,
  warning: semantic.warning,

  overlay: "rgba(0, 0, 0, 0.5)",
  overlayLight: "rgba(0, 0, 0, 0.3)",
  errorBgAlpha: "rgba(239, 68, 68, 0.1)",

  shadow: "#a1a1aa",

  white: mono.white,
  black: black.pure,
  gold: gold.muted,
};

export type ThemeColors = typeof darkColors;

export const themes = {
  dark: darkColors,
  light: lightColors,
};

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

// Border radius - slightly sharper for premium feel
export const radii = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

// Font families - Premium Space Grotesk
export const fontFamily = {
  // Primary font - Space Grotesk for headings and UI
  light: "SpaceGrotesk_Light",
  regular: "SpaceGrotesk",
  medium: "SpaceGrotesk_Medium",
  semibold: "SpaceGrotesk_SemiBold",
  bold: "SpaceGrotesk_Bold",
  // Mono font for code/technical
  mono: "SpaceMono",
};

// Typography - confident sizing
export const typography = {
  // Font sizes
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  display: 48,

  // Font weights (for StyleSheet compatibility)
  light: "300" as const,
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,

  // Letter spacing for that premium feel
  tracking: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1,
    widest: 2,
    label: 1.5, // For uppercase labels
  },
};

// Shadow presets - subtle, premium
export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  gold: {
    shadowColor: gold.pure,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
};
