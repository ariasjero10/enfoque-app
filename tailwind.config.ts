import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx,js,jsx}", "./components/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Superficies dark-first (casi negro puro, no gris cálido)
        ink: {
          DEFAULT: "#0A0A0B",
          base: "#0A0A0B",   // fondo de la app
          surface: "#151517", // tarjetas
          raised: "#18181B",  // tarjetas elevadas / inputs
        },
        // Acento menta/esmeralda
        accent: {
          DEFAULT: "#34D399",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
        },
        // Texto
        title: "#FAFAFA",
        body: "#8A8A93",
        muted: "#5C5C66",
      },
      boxShadow: {
        card: "inset 0 1px 0 rgba(255,255,255,.04), 0 24px 48px -24px rgba(0,0,0,.75), 0 8px 20px -14px rgba(0,0,0,.55)",
        pill: "0 4px 14px rgba(52,211,153,.35), inset 0 1px 0 rgba(255,255,255,.25)",
      },
    },
  },
  plugins: [],
};
export default config;
