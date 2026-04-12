const { withProjectBuildGradle } = require("expo/config-plugins");

/**
 * Adds @react-native-async-storage/async-storage's bundled local_repo as a
 * maven repository to all subprojects, so gradle can resolve
 * `org.asyncstorage.shared_storage:storage-android:1.0.0` introduced in v3.
 * The async-storage module declares its own `repositories {}` block which
 * overrides the settings-level `dependencyResolutionManagement`, so we must
 * inject via `allprojects` in the root build.gradle.
 */
module.exports = function withAsyncStorageLocalRepo(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const marker = "ASYNC_STORAGE_LOCAL_REPO";
    if (cfg.modResults.contents.includes(marker)) return cfg;

    const block = `
// ${marker}
allprojects {
  repositories {
    maven {
      url(new File(rootProject.projectDir, "../node_modules/@react-native-async-storage/async-storage/android/local_repo"))
    }
  }
}
`;
    cfg.modResults.contents += block;
    return cfg;
  });
};
