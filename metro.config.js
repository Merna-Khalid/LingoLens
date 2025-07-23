// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = [
  ...config.resolver.assetExts,
  'task', // Add your model file extension
  'bin'   // Add other binary extensions if needed
];

module.exports = config;