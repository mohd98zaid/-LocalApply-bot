/// <reference types="vite/client" />

// CSS module declarations
declare module '*.css' {
  const styles: Record<string, string>;
  export default styles;
}

// SVG as React components
declare module '*.svg' {
  import * as React from 'react';
  export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}

// Image assets
declare module '*.png' { const src: string; export default src; }
declare module '*.jpg' { const src: string; export default src; }
declare module '*.webp' { const src: string; export default src; }
