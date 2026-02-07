import { ExpoConfig, ConfigContext } from "expo/config";
import fs from "node:fs";

function resolveGoogleServicesFile(): string | undefined {
  const candidate = process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json";
  try {
    return fs.existsSync(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Exec",
  slug: "mic-app",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "exec",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.yazinsai.micapp",
    buildNumber: "1",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#000000",
    },
    edgeToEdgeEnabled: true,
    package: "com.yazinsai.micapp",
    // Only set this when the file is available (CI/EAS secrets or local dev file)
    ...(resolveGoogleServicesFile()
      ? { googleServicesFile: resolveGoogleServicesFile() }
      : {}),
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#d4af37",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#000000",
        dark: {
          image: "./assets/images/splash-icon.png",
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-share-intent",
      {
        iosActivationRules: {
          NSExtensionActivationSupportsFileWithMaxCount: 100,
        },
        androidIntentFilters: ["audio/*", "image/*"],
        androidMultiIntentFilters: ["audio/*", "image/*"],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  updates: {
    url: "https://u.expo.dev/5ec9c9e2-8570-48d7-981d-0ce40288330b",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  extra: {
    router: {},
    eas: {
      projectId: "5ec9c9e2-8570-48d7-981d-0ce40288330b",
    },
  },
});
