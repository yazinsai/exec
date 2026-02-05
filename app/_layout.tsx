import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import "../global.css";
import { useFonts } from "expo-font";
import {
  SpaceGrotesk_300Light,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { ShareIntentProvider } from "expo-share-intent";

import { ThemeProvider, useThemeColors } from "@/hooks/useThemeColors";
import { ShareIntentHandler } from "@/hooks/useShareIntent";
import { PushNotificationsProvider } from "@/hooks/usePushNotifications";
import { initBackgroundQueue } from "@/lib/backgroundQueue";

// Initialize background queue processing (runs AppState listener for Android)
initBackgroundQueue();

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
    SpaceGrotesk_Light: SpaceGrotesk_300Light,
    SpaceGrotesk: SpaceGrotesk_400Regular,
    SpaceGrotesk_Medium: SpaceGrotesk_500Medium,
    SpaceGrotesk_SemiBold: SpaceGrotesk_600SemiBold,
    SpaceGrotesk_Bold: SpaceGrotesk_700Bold,
  });

  if (!loaded) {
    return null;
  }

  return (
    <ShareIntentProvider>
      <ThemeProvider>
        <PushNotificationsProvider>
          <ShareIntentHandler>
            <AppContent />
          </ShareIntentHandler>
        </PushNotificationsProvider>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
