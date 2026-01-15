/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                ibkr: {
                    bg: '#111111',
                    panel: '#1E1E1E',
                    accent: '#D32F2F', // IBKR Red-ish
                    text: '#E0E0E0',
                    muted: '#757575',
                    border: '#333333'
                }
            }
        },
    },
    plugins: [],
}
