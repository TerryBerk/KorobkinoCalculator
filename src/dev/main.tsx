import React from "react";
import { createRoot } from "react-dom/client";
import { KorobkinoCalculator } from "../KorobkinoCalculator";

const urls = {
  servicesCsvUrl: import.meta.env.VITE_SERVICES_URL ?? "/mock/services.csv",
  logisticsCsvUrl: import.meta.env.VITE_LOGISTICS_URL ?? "/mock/logistics.csv",
  paramsCsvUrl: import.meta.env.VITE_PARAMS_URL ?? "/mock/params.csv"
};

const container = document.getElementById("root");

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <div className="min-h-screen bg-slate-950 py-8">
        <div className="mx-auto max-w-5xl px-4">
          <KorobkinoCalculator urls={urls} />
        </div>
      </div>
    </React.StrictMode>
  );
}
