// Reexport the native module. On web, it will be resolved to LingoproMultimodalModule.web.ts
// and on native platforms to LingoproMultimodalModule.ts
//export * from './src/LingoproMultiModalModule';
// export { default as LingoproMultimodalModuleView } from './src/LingoproMultimodalModuleView';
// export * from './src/LingoproMultiModal.types';

//import { requireNativeModule } from 'expo-modules-core';
// export default requireNativeModule('LingoproMultimodal');
import { NativeModulesProxy } from 'expo-modules-core';

export default NativeModulesProxy.LingoproMultimodal;
