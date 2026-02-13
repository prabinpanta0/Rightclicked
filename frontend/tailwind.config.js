/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                linkedin: "#0a66c2",
                "linkedin-dark": "#004182",
                body: "#1d2226",
                page: "#f9fafb",
                muted: "#6b7280",
                border: "#e5e7eb",
            },
        },
    },
    plugins: [],
};
