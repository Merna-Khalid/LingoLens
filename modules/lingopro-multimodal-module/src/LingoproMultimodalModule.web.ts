import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './LingoproMultimodalModule.types';

type LingoproMultimodalModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class LingoproMultimodalModule extends NativeModule<LingoproMultimodalModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(LingoproMultimodalModule, 'LingoproMultimodalModule');
