/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand & Accent
        "cohere-black": "#000000",
        "near-black": "#17171c",
        "deep-green": "#003c33",
        "dark-navy": "#071829",
        "action-blue": "#1863dc",
        "coral": "#ff7759",
        "soft-coral": "#ffad9b",

        // Surface & Background
        "canvas-white": "#ffffff",
        "soft-stone": "#eeece7",
        "pale-green-wash": "#edfce9",
        "pale-blue-wash": "#f1f5ff",
        "card-border": "#f2f2f2",

        // Text & Rules
        "ink": "#212121",
        "muted-slate": "#93939f",
        "slate": "#75758a",
        "hairline": "#d9d9dd",
        "border-light": "#e5e7eb",

        // Semantic
        "focus-blue": "#4c6ee6",
        "form-focus-violet": "#9b60aa",
        "error-red": "#b30000",
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        body: ['"Inter"', '"Arial"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "22px",
        xl: "30px",
        pill: "32px",
        full: "9999px",
      },
      fontSize: {
        "hero-display": ["96px", { lineHeight: "1.0", letterSpacing: "-1.92px" }],
        "product-display": ["72px", { lineHeight: "1.0", letterSpacing: "-1.44px" }],
        "section-display": ["60px", { lineHeight: "1.0", letterSpacing: "-1.2px" }],
        "section-heading": ["48px", { lineHeight: "1.2", letterSpacing: "-0.48px" }],
        "card-heading": ["32px", { lineHeight: "1.2", letterSpacing: "-0.32px" }],
        "feature-heading": ["24px", { lineHeight: "1.3", letterSpacing: "0" }],
        "body-large": ["18px", { lineHeight: "1.4", letterSpacing: "0" }],
        "body-base": ["16px", { lineHeight: "1.5", letterSpacing: "0" }],
        "button": ["14px", { lineHeight: "1.71", letterSpacing: "0" }],
        "caption": ["14px", { lineHeight: "1.4", letterSpacing: "0" }],
        "mono-label": ["14px", { lineHeight: "1.4", letterSpacing: "0.28px" }],
        "micro": ["12px", { lineHeight: "1.4", letterSpacing: "0" }],
      },
    },
  },
  plugins: [],
};
