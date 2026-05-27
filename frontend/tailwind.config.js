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
          bg: "#F9FAFB",
          surface: "#FFFFFF",
          muted: "#F3F4F6",
          border: "#E5E7EB",
          "border-strong": "#D1D5DB",
          text: "#111827",
          "text-secondary": "#6B7280",
          "text-muted": "#9CA3AF",
          sidebar: "#F3F4F6",
          "sidebar-hover": "#E5E7EB",
          header: "#FFFFFF",
          primary: "#6F4A7E",
          "primary-hover": "#5A3D66",
          "primary-soft": "#F5F0F8",
          accent: "#EDE4F3",
        },
      },
      boxShadow: {
        "admin-card": "0 1px 2px 0 rgb(17 24 39 / 0.03)",
        "admin-sidebar": "1px 0 0 0 rgb(229 231 235 / 1)",
        "admin-header": "0 1px 0 0 rgb(229 231 235 / 1)",
      },
    },
  },
  plugins: [],
};