import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6C63FF",
          dark: "#4F46E5",
          light: "#EEEDFF",
        },
        background: "#F8F8FC",
        surface: "#FFFFFF",
        sidebar: "#0F0F1A",
        border: "#E5E4F0",
        text: {
          primary: "#111122",
          secondary: "#6B7280",
          muted: "#9CA3AF",
        },
        "text-primary": "#111122",
        "text-secondary": "#6B7280",
        "text-muted": "#9CA3AF",
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "page-title": ["24px", { lineHeight: "1.25", fontWeight: "600" }],
        "section-title": ["16px", { lineHeight: "1.5", fontWeight: "600" }],
        body: ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        label: ["12px", { lineHeight: "1.4", fontWeight: "500" }],
        "stat-number": ["28px", { lineHeight: "1.2", fontWeight: "700" }],
      },
      boxShadow: {
        card: "0 1px 4px rgba(0,0,0,0.06)",
        dropdown: "0 8px 24px rgba(0,0,0,0.12)",
        modal: "0 24px 64px rgba(0,0,0,0.18)",
      },
      borderRadius: {
        card: "12px",
        button: "8px",
        input: "8px",
        badge: "6px",
      },
      maxWidth: {
        content: "1200px",
      },
      width: {
        sidebar: "240px",
        "sidebar-collapsed": "72px",
      },
      spacing: {
        "page-padding": "32px",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
