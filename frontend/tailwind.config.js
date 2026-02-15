/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                linkedin: "#0a66c2",
                "linkedin-dark": "#004182",
                body: "var(--color-body)",
                page: "var(--color-page)",
                muted: "var(--color-muted)",
                border: "var(--color-border)",
                surface: "var(--color-surface)",
                "surface-hover": "var(--color-surface-hover)",
                "surface-raised": "var(--color-surface-raised)",
                accent: "var(--color-accent)",
            },
        },
    },
    plugins: [],
};
