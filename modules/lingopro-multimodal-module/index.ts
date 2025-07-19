// Reexport the native module. On web, it will be resolved to LingoproMultimodalModule.web.ts
// and on native platforms to LingoproMultimodalModule.ts
export { default } from './src/LingoproMultimodalModule';
export { default as LingoproMultimodalModuleView } from './src/LingoproMultimodalModuleView';
export * from  './src/LingoproMultimodalModule.types';
