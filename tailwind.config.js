/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        serif: ["'Lora'", "Georgia", "serif"],
        sans: ["'DM Sans'", "sans-serif"],
      },
      colors: {
        ink: {
          DEFAULT: "#0f0f0f",
          50: "#f5f5f0",
          100: "#e8e8e0",
          200: "#c8c8bc",
          300: "#a0a090",
          400: "#6e6e60",
          500: "#4a4a3e",
          600: "#2e2e24",
          700: "#1c1c14",
          800: "#141410",
          900: "#0f0f0a",
        },
        paper: "#f7f6f1",
        accent: "#c4622d",
        "accent-muted": "#e8956d",
      },
      typography: {
        DEFAULT: {
          css: {
            color: "#1c1c14",
            a: { color: "#c4622d" },
            code: {
              backgroundColor: "#e8e8e0",
              borderRadius: "3px",
              padding: "2px 5px",
              fontSize: "0.875em",
            },
          },
        },
      },
    },
  },
  plugins: [],
};
