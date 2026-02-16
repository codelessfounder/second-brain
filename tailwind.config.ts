import type { Config } from "tailwindcss"

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        /** Mobile breakpoint: 768px (same as md). Use min-mobile: for 768px+, max-md: for under 768px. */
        mobile: "768px",
      },
      fontFamily: {
        sans: ["SpotifyMix", "Inter", "system-ui", "sans-serif"],
        spotify: ["SpotifyMix", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        brain: {
          black: "#000000",
          ink: "#050504",
          "surface-dark": "#111110",
          "primary-dark": "#141413",
          surface: "#1F1E1D",
          elevated: "#232220",
          "muted-dark": "#3D3D3A",
          muted: "#73726C",
          accent: "#D97757",
          "accent-hover": "#c96847",
          "off-white": "#F0EEE6",
          cream: "#F5F4ED",
          canvas: "#FAF9F5",
          white: "#FFFFFF",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config
