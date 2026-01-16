import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#1e1e2e",
          secondary: "#181825",
          elevated: "#313244",
        },
        text: {
          primary: "#cdd6f4",
          secondary: "#a6adc8",
          muted: "#6c7086",
        },
        accent: {
          primary: "#89b4fa",
          success: "#a6e3a1",
          warning: "#f9e2af",
          error: "#f38ba8",
        },
        border: "#45475a",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
