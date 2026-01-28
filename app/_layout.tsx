import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import "../global.css";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { ShareIntentProvider } from "expo-share-intent";

import { ThemeProvider, useThemeColors } from "@/hooks/useThemeColors";
import { ShareIntentHandler } from "@/hooks/useShareIntent";

function AppContent() {
  const { colors, isDark } = useThemeColors();

  return (
    <NavigationThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={isDark ? "light" : "dark"} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded) {
    return null;
  }

  return (
    <ShareIntentProvider>
      <ThemeProvider>
        <ShareIntentHandler>
          <AppContent />
        </ShareIntentHandler>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
