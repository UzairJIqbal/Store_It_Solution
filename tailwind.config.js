/** @type {import('tailwindcss').Config} */

// Colours are RGB channels in CSS variables (globals.css), so one class works in light and dark themes
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
    darkMode: "class",
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                // shadcn's names, pointed at the same tokens as everything else
                border: token("line"),
                background: token("canvas"),
                foreground: token("ink"),

                // StoreIt Indigo, with an Ember accent
                brand: {
                    DEFAULT: token("brand"),
                    100: token("brand-strong"),
                },
                ember: token("ember"),
                // shadcn's hover/focus fill for menu items and ghost buttons
                accent: { DEFAULT: token("canvas"), foreground: token("ink") },
                primary: { DEFAULT: token("brand"), foreground: "#ffffff" },
                secondary: { DEFAULT: token("canvas"), foreground: token("ink") },
                muted: { DEFAULT: token("canvas"), foreground: token("ink-muted") },
                popover: { DEFAULT: token("surface"), foreground: token("ink") },
                card: { DEFAULT: token("surface"), foreground: token("ink") },
                destructive: { DEFAULT: token("error"), foreground: "#ffffff" },
                input: token("line"),
                ring: token("brand"),
                // Cards, menus and dialogs; the page behind them is light-400
                surface: token("surface"),
                red: token("error"),
                error: token("error"),
                green: "#2BC4A0",
                blue: "#4FA8F7",
                pink: "#D58BF0",
                orange: "#FF9B66",
                light: {
                    100: token("ink"),
                    200: token("ink-muted"),
                    300: token("line"),
                    400: token("canvas"),
                },
                dark: {
                    100: token("ink-strong"),
                    200: token("ink-strong"),
                },
            },
            // Surfaces were written as bg-white; in the dark theme they follow the surface token instead.
            // text-white and ring-white keep pure white.
            backgroundColor: {
                white: token("surface"),
            },
            // Fills use --brand; text uses --brand-ink, which stays readable on the dark surface
            textColor: {
                brand: {
                    DEFAULT: token("brand-ink"),
                    100: token("brand-ink-strong"),
                },
                ember: token("ember-ink"),
            },
            ringColor: {
                DEFAULT: token("brand"),
            },
            fontFamily: {
                sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
                display: ["var(--font-display)", "var(--font-body)", "ui-sans-serif", "sans-serif"],
                mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
            },
            boxShadow: {
                "drop-1": "0px 10px 30px 0px rgb(var(--shadow) / 0.08)",
                "drop-2": "0px 6px 16px 0px rgb(var(--shadow) / 0.14)",
                "drop-3": "0px 8px 30px 0px rgb(var(--shadow) / 0.12)",
            },
            borderRadius: {
                lg: "10px",
                md: "8px",
                sm: "6px",
            },
            keyframes: {
                "caret-blink": {
                    "0%, 70%, 100%": { opacity: "1" },
                    "20%, 50%": { opacity: "0" },
                },
                "rise-in": {
                    from: { opacity: "0", transform: "translateY(6px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
            },
            animation: {
                "caret-blink": "caret-blink 1.25s ease-out infinite",
                "rise-in": "rise-in 320ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
}
