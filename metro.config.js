const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const feedsDir = path.resolve(__dirname, 'src/data/feeds');
const localCatalogs = {
  computing: path.join(feedsDir, 'computing.local.json'),
  general: path.join(feedsDir, 'general.local.json'),
};

function isCatalogImport(normalized, space) {
  const base = `${space}.json`;
  return (
    normalized === `./${base}` ||
    normalized === `../feeds/${base}` ||
    normalized.endsWith(`/feeds/${base}`) ||
    normalized === `@/data/feeds/${base}`
  );
}

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const normalized = moduleName.replace(/\\/g, '/');

  for (const [space, localPath] of Object.entries(localCatalogs)) {
    if (isCatalogImport(normalized, space) && fs.existsSync(localPath)) {
      return {
        filePath: localPath,
        type: 'sourceFile',
      };
    }
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
