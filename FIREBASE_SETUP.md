# Firebase Setup for Push Notifications (Android)

The push notification error you're seeing:
```
Default FirebaseApp is not initialized in this process com.yazinai.micapp.
Make sure to call FirebaseApp.initializeApp(Context) first.
```

This happens because Android push notifications require Firebase Cloud Messaging (FCM) configuration.

## Steps to Fix

### 1. Create/Access Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Click "Add app" → Android
4. Enter package name: `com.yazinsai.micapp`
5. Download `google-services.json`

### 2. Add google-services.json to Project

```bash
# Place the downloaded file at the project root
mv ~/Downloads/google-services.json /Users/rock/projects/mic-app/
```

### 3. Update app.json

Add the `googleServicesFile` configuration to the Android section:

```json
{
  "expo": {
    "android": {
      "googleServicesFile": "./google-services.json",
      ...
    }
  }
}
```

### 4. Upload FCM Service Account Key to EAS

1. In Firebase Console → Project settings → Service accounts
2. Click "Generate New Private Key"
3. Run: `eas credentials -p android`
4. Select: Google Service Account → Upload JSON

### 5. Rebuild the App

⚠️ **Important**: OTA updates won't fix this. You need a new native build:

```bash
# For preview/testing
eas build -p android --profile preview

# For production
eas build -p android --profile production
```

After the build completes, install the new APK/AAB on your device.

## Why OTA Updates Don't Work

The `google-services.json` file is processed at build time and compiled into the native Android app. It configures Firebase at the native level, which can't be changed via JavaScript/OTA updates.
