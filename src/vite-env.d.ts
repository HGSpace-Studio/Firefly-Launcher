/// <reference types="vite/client" />

declare module "*.css";

declare namespace JSX {
  interface IntrinsicElements {
    "md-navigation-bar": any;
    "md-navigation-tab": any;
    "md-icon": any;
    "md-icon-button": any;
    "md-filled-button": any;
    "md-text-button": any;
  }
}
