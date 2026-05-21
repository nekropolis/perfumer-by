/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/constants/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        admin: {
          bg: "#F7F3EE",
          surface: "#FFFCF8",
          muted: "#FBF7F3",
          border: "#E8DED4",
          "border-strong": "#D8C2E6",
          text: "#1F1722",
          "text-secondary": "#6E6572",
          "text-muted": "#9B909D",
          sidebar: "#0f172a",
          "sidebar-hover": "#1e293b",
          header: "#1e293b",
          primary: "#6F4A7E",
          "primary-hover": "#5C3C68",
          accent: "#D8C2E6",
        },
      },
      boxShadow: {
        "admin-card": "0 12px 30px -24px rgb(31 23 34 / 0.45), 0 1px 2px -1px rgb(31 23 34 / 0.12)",
        "admin-sidebar": "4px 0 24px -4px rgb(15 23 42 / 0.12)",
      },
    },
  },
  plugins: [],
};