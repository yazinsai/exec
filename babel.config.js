module.exports = function (api) {
  api.cache(true);
  return {
    plugins: [
      [
        "react-native-iconify/babel",
        {
          icons: [
            // UI controls
            "solar:add-circle-linear",
            "solar:arrow-up-linear",
            "solar:alt-arrow-down-linear",
            "solar:alt-arrow-up-linear",
            "solar:close-circle-linear",
            "solar:close-circle-bold",
            "solar:check-read-linear",
            "solar:check-circle-bold",
            "solar:magnifer-linear",
            "solar:refresh-linear",
            // Media
            "solar:microphone-bold",
            "solar:pause-bold",
            "solar:play-bold",
            "solar:stop-bold",
            // Navigation / content
            "solar:book-linear",
            "solar:bookmark-bold",
            "solar:bookmark-linear",
            "solar:folder-linear",
            "solar:folder-bold",
            "solar:lightbulb-linear",
            "solar:chat-round-linear",
            // Tool activity icons
            "solar:document-text-linear",
            "solar:pen-new-square-linear",
            "solar:pen-linear",
            "solar:code-linear",
            "solar:monitor-linear",
            "solar:share-circle-linear",
            "solar:global-linear",
            "solar:cloud-download-linear",
            "solar:bolt-linear",
            "solar:menu-dots-linear",
          ],
        },
      ],
      "react-native-reanimated/plugin",
    ],
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
