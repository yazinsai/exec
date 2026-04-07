// Patches the dev Electron.app bundle ID and mic usage description
// so macOS TCC treats it as "Exec Desktop" instead of generic "Electron"
const { execSync } = require("child_process");
const path = require("path");

const plist = path.join(
  __dirname,
  "node_modules/electron/dist/Electron.app/Contents/Info.plist"
);

const patches = {
  CFBundleIdentifier: "com.exec.desktop",
  CFBundleName: "Exec Desktop",
  CFBundleDisplayName: "Exec Desktop",
  NSMicrophoneUsageDescription:
    "Exec Desktop needs microphone access to record voice commands.",
};

for (const [key, value] of Object.entries(patches)) {
  execSync(`defaults write "${plist}" "${key}" "${value}"`);
}

console.log("Patched Electron.app bundle ID → com.exec.desktop");
