import * as React from 'react';

import { LingoproMultimodalModuleViewProps } from './LingoproMultimodalModule.types';

export default function LingoproMultimodalModuleView(props: LingoproMultimodalModuleViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
