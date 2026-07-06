const { withGradleProperties } = require('@expo/config-plugins');

/** Release APK pessoal: só arm64 (celular físico) — build mais rápido e paths CMake menores no Windows. */
function withAndroidBuildProps(config) {
  return withGradleProperties(config, (cfg) => {
    const items = cfg.modResults.filter(
      (item) =>
        !(item.type === 'property' && item.key === 'reactNativeArchitectures')
    );
    items.push({
      type: 'property',
      key: 'reactNativeArchitectures',
      value: 'arm64-v8a',
    });
    cfg.modResults = items;
    return cfg;
  });
}

module.exports = withAndroidBuildProps;
