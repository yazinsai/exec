import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import "../global.css";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { ShareIntentProvider } from "expo-share-intent";

import { colors } from "@/constants/Colors";
import { useShareIntent } from "@/hooks/useShareIntent";

function ShareIntentHandler() {
  useShareIntent();
  return null;
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
      <ThemeProvider value={DarkTheme}>
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
        <ShareIntentHandler />
        <StatusBar style="light" />
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
