const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const NETWORK_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>`;

function withNetworkSecurityManifest(config) {
  return withAndroidManifest(config, async (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app?.$) {
      app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }
    return cfg;
  });
}

function withCopyNetworkConfig(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.projectRoot,
        'android',
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      if (!fs.existsSync(xmlDir)) fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'network_security_config.xml'),
        NETWORK_CONFIG,
        'utf8',
      );
      return cfg;
    },
  ]);
}

module.exports = createRunOncePlugin(
  function withNewsCentralizerNetworkSecurity(config) {
    config = withCopyNetworkConfig(config);
    config = withNetworkSecurityManifest(config);
    return config;
  },
  'withNewsCentralizerNetworkSecurity',
  '1.0.0',
);
