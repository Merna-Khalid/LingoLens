import { NativeModule, requireNativeModule } from 'expo';

import { LingoproMultimodalModuleEvents } from './LingoproMultimodalModule.types';

declare class LingoproMultimodalModule extends NativeModule<LingoproMultimodalModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<LingoproMultimodalModule>('LingoproMultimodalModule');
