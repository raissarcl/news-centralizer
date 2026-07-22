const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const localGeneralFeedsOpml = path.resolve(
  __dirname,
  'src/data/defaultGeneralFeedsOpml.local.ts',
);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const normalized = moduleName.replace(/\\/g, '/');
  const isGeneralFeedsOpml =
    normalized === './defaultGeneralFeedsOpml' ||
    normalized === '../data/defaultGeneralFeedsOpml' ||
    normalized.endsWith('/defaultGeneralFeedsOpml') ||
    normalized === '@/data/defaultGeneralFeedsOpml';

  if (isGeneralFeedsOpml && fs.existsSync(localGeneralFeedsOpml)) {
    return {
      filePath: localGeneralFeedsOpml,
      type: 'sourceFile',
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
