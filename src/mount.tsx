import { createRoot } from "react-dom/client";
import { KorobkinoCalculator } from "./KorobkinoCalculator";
import type { MountOptions } from "./lib/models";

export function mount(el: HTMLElement, options: MountOptions): () => void {
  const root = createRoot(el);
  root.render(<KorobkinoCalculator {...options} />);
  return () => root.unmount();
}

if (typeof window !== "undefined") {
  window.KorobkinoCalculator = {
    mount
  };
}
