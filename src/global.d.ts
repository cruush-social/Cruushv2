// Allow importing CSS modules and global CSS in TypeScript
// This file is automatically included by TypeScript

declare module '*.css';
declare module '*.scss';
declare module '*.sass';
declare module '*.less';
declare module '*.styl';

interface Window {
  turnstile?: {
    render: (
      container: HTMLElement,
      options: {
        sitekey: string;
        callback: (token: string) => void;
        'expired-callback': () => void;
        'error-callback': () => void;
        theme?: 'auto' | 'light' | 'dark';
      },
    ) => string;
    remove?: (widgetId: string) => void;
    reset?: (widgetId: string) => void;
  };
}
