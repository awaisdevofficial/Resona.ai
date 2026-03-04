import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#6C63FF", light: "#EEEDFF", dark: "#4F46D8" },
        canvas: "#FAFAFA",
        sidebar: "#0F0F17",
        border: "#E8E8F0",
        surface: "#FFFFFF",
        primary: "#111122",
        muted: "#6B7280"
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      boxShadow: {
        sm: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        md: "0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
        lg: "0 10px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)",
        card: "0 1px 3px rgba(0,0,0,0.04)"
      },
      borderRadius: {
        DEFAULT: "12px",
        sm: "8px",
        lg: "14px",
        xl: "18px",
        "2xl": "20px"
      }
    }
  },
  plugins: [require("@tailwindcss/typography")]
}

export default config

