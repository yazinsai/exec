// @@iconify-code-gen
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import "../global.css";
import { useEffect } from "react";
import { useFonts } from "expo-font";
import {
  SpaceGrotesk_300Light,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

// Keep splash visible while fonts load
SplashScreen.preventAutoHideAsync();

import { ThemeProvider, useThemeColors } from "@/hooks/useThemeColors";
import { PushNotificationsProvider } from "@/hooks/usePushNotifications";
import { ShareIntentHandler } from "@/hooks/useShareIntent";
import { CrashReporter } from "@/components/CrashReporter";

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

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Check for OTA updates on launch and apply immediately
  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {}
    })();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <CrashReporter>
      <ThemeProvider>
        <PushNotificationsProvider>
          <ShareIntentHandler>
            <AppContent />
          </ShareIntentHandler>
        </PushNotificationsProvider>
      </ThemeProvider>
    </CrashReporter>
  );
}
