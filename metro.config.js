const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Exclude agent/ and desktop/ from Metro bundler (they have their own node_modules)
config.resolver.blockList = [
  new RegExp(path.resolve(__dirname, "agent") + "/.*"),
  new RegExp(path.resolve(__dirname, "desktop") + "/.*"),
];

module.exports = withNativeWind(config, { input: "./global.css" });
