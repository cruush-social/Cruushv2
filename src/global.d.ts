// Allow importing CSS modules and global CSS in TypeScript
// This file is automatically included by TypeScript

declare module '*.css';
declare module '*.scss';
declare module '*.sass';
declare module '*.less';
declare module '*.styl';
declare module '*.png' {
  const src: string;
  export default src;
}

interface Window {
  turnstile?: {
    render: (
      container: HTMLElement,
      options: {
        sitekey: string;
        callback: (token: string) => void;
        'expired-callback': () => void;
        'timeout-callback'?: () => void;
        'error-callback': (errorCode?: string) => boolean | void;
        theme?: 'auto' | 'light' | 'dark';
        size?: 'normal' | 'flexible' | 'compact';
      },
    ) => string;
    remove?: (widgetId: string) => void;
    reset?: (widgetId: string) => void;
  };
}
