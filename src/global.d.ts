import type { MountOptions } from "./lib/models";

declare global {
  interface Window {
    KorobkinoCalculator: {
      mount(el: HTMLElement, options: MountOptions): () => void;
    };
  }
}

export {};
