import { requireNativeView } from 'expo';
import * as React from 'react';

import { LingoproMultimodalModuleViewProps } from './LingoproMultimodalModule.types';

const NativeView: React.ComponentType<LingoproMultimodalModuleViewProps> =
  requireNativeView('LingoproMultimodalModule');

export default function LingoproMultimodalModuleView(props: LingoproMultimodalModuleViewProps) {
  return <NativeView {...props} />;
}
