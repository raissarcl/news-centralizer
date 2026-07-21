const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withAndroidManifest,
  withMainApplication,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const WIDGET_KT_DIR = path.join(__dirname, 'templates', 'android', 'widget');
const RES_TEMPLATE = path.join(__dirname, 'templates', 'android', 'res');

function copyAndroidWidgetFiles(projectRoot) {
  const javaBase = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'rairc',
    'newscentralizer',
    'widget',
  );
  const resMain = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'res',
  );

  if (!fs.existsSync(javaBase)) fs.mkdirSync(javaBase, { recursive: true });

  for (const f of fs.readdirSync(WIDGET_KT_DIR)) {
    if (f.endsWith('.kt')) {
      fs.copyFileSync(path.join(WIDGET_KT_DIR, f), path.join(javaBase, f));
    }
  }

  for (const sub of ['layout', 'xml', 'values']) {
    const src = path.join(RES_TEMPLATE, sub);
    const dest = path.join(resMain, sub);
    if (!fs.existsSync(src)) continue;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src)) {
      fs.copyFileSync(path.join(src, f), path.join(dest, f));
    }
  }
}

function withWidgetManifest(config) {
  return withAndroidManifest(config, async (cfg) => {
    const manifest = cfg.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return cfg;

    if (!app.receiver) app.receiver = [];

    const exists = app.receiver.some(
      (r) =>
        String(r.$?.['android:name'] || '') === '.widget.NewsCentralizerWidget',
    );
    if (!exists) {
      app.receiver.push({
        $: {
          'android:name': '.widget.NewsCentralizerWidget',
          'android:exported': 'false',
          'android:label': 'News Centralizer',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.appwidget.action.APPWIDGET_UPDATE',
                },
              },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/widget_provider_unread',
            },
          },
        ],
      });
    }

    return cfg;
  });
}

function withWidgetMainApplication(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes('WidgetSyncPackage')) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        `PackageList(this).packages.apply {
              add(com.rairc.newscentralizer.widget.WidgetSyncPackage())`,
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });
}

function withCopyAndroidWidgetNative(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      copyAndroidWidgetFiles(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);
}

module.exports = createRunOncePlugin(
  function withNewsCentralizerAndroidWidget(config) {
    config = withCopyAndroidWidgetNative(config);
    config = withWidgetManifest(config);
    config = withWidgetMainApplication(config);
    return config;
  },
  'withNewsCentralizerAndroidWidget',
  '1.0.0',
);
