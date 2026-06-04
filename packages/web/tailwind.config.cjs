/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand
        primary:         "var(--primary)",
        "primary-deep":  "var(--primary-deep)",
        "primary-soft":  "var(--primary-soft)",
        "primary-text":  "var(--primary-text)",

        // Cream
        cream:           "var(--cream)",
        "cream-soft":    "var(--cream-soft)",
        "cream-deeper":  "var(--cream-deeper)",
        "beige-deep":    "var(--beige-deep)",

        // Surface
        canvas:          "var(--canvas)",
        surface:         "var(--surface)",
        "surface-cream": "var(--surface-cream)",
        "surface-code":  "var(--surface-code)",
        hairline:        "var(--hairline)",
        "hairline-soft": "var(--hairline-soft)",
        "hairline-strong":"var(--hairline-strong)",

        // Text
        ink:             "var(--ink)",
        "ink-tint":      "var(--ink-tint)",
        charcoal:        "var(--charcoal)",
        slate:           "var(--slate)",
        steel:           "var(--steel)",
        stone:           "var(--stone)",
        muted:           "var(--muted)",
        "on-dark":       "var(--on-dark)",
        "on-dark-muted": "var(--on-dark-muted)",
        "on-cream":      "var(--on-cream)",

        // Sidebar
        "sb-bg":         "var(--sidebar-bg)",
        "sb-hover":      "var(--sidebar-hover)",
        "sb-active":     "var(--sidebar-active)",

        // Semantic
        success:         "var(--success)",
        "success-soft":  "var(--success-soft)",
        warning:         "var(--warning)",
        "warning-soft":  "var(--warning-soft)",
        error:           "var(--error)",
        "error-soft":    "var(--error-soft)",

        // Legacy aliases (migration)
        "coral":            "var(--primary)",
        "action-blue":      "var(--primary)",
        "focus-blue":       "var(--primary)",
        "error-red":        "var(--error)",
        "deep-green":       "var(--success)",
        "dark-navy":        "var(--surface-code)",
        "cohere-black":     "var(--ink)",
        "border-light":     "var(--hairline)",
        "form-focus-violet":"var(--primary)",
        "soft-coral":       "var(--primary-soft)",
        "pale-green-wash":  "var(--success-soft)",
        "pale-blue-wash":   "var(--primary-soft)",
        "muted-slate":      "var(--slate)",
        "card-border":      "var(--hairline-soft)",
        "canvas-white":     "var(--canvas)",
        "soft-stone":       "var(--surface)",
        "near-black":       "var(--ink)",
        "border-hairline":  "var(--hairline)",
      },
      fontFamily: {
        display: ['"PP Editorial Old"', '"Times New Roman"', "Georgia", "serif"],
        body: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        full: "9999px",
      },
      fontSize: {
        "hero-display": ["84px", { lineHeight: "1.05", letterSpacing: "-1.5px" }],
        "display-lg":   ["64px", { lineHeight: "1.10", letterSpacing: "-1px" }],
        "heading-1":    ["52px", { lineHeight: "1.15", letterSpacing: "-0.5px" }],
        "heading-2":    ["36px", { lineHeight: "1.20", letterSpacing: "-0.5px" }],
        "heading-3":    ["28px", { lineHeight: "1.25", letterSpacing: "0" }],
        "heading-4":    ["22px", { lineHeight: "1.30", letterSpacing: "0" }],
        "heading-5":    ["18px", { lineHeight: "1.40", letterSpacing: "0" }],
        "subtitle":     ["18px", { lineHeight: "1.50", letterSpacing: "0" }],
        "body-md":      ["16px", { lineHeight: "1.55", letterSpacing: "0" }],
        "body-sm":      ["14px", { lineHeight: "1.50", letterSpacing: "0" }],
        "caption":      ["13px", { lineHeight: "1.40", letterSpacing: "0" }],
        "micro":        ["12px", { lineHeight: "1.40", letterSpacing: "0" }],
        "button-md":    ["14px", { lineHeight: "1.30", letterSpacing: "0" }],
        "code-md":      ["14px", { lineHeight: "1.50", letterSpacing: "0" }],
      },
      boxShadow: {
        "1": "0 1px 2px rgba(0,0,0,0.04)",
        "2": "0 4px 12px rgba(0,0,0,0.04)",
        "3": "0 12px 24px -4px rgba(0,0,0,0.08)",
        "4": "0 16px 48px -8px rgba(0,0,0,0.12)",
      },
    },
  },
  plugins: [],
};
