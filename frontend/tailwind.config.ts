import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#1db954", // verde estilo Spotify
        accentDark: "#169c46",
        surface: "#181818",
        surfaceHover: "#282828",
        base: "#0b0b0f",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "bar-bounce": {
          "0%, 100%": { transform: "scaleY(0.4)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease both",
        "bar-1": "bar-bounce 0.9s ease-in-out infinite",
        "bar-2": "bar-bounce 0.7s ease-in-out infinite",
        "bar-3": "bar-bounce 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
