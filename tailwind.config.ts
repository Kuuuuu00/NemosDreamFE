import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Custom breakpoints per design spec — replaces Tailwind's defaults.
    screens: {
      sm: "640px",
      md: "1024px",
      lg: "1200px",
      xl: "1440px",
    },
    container: {
      center: true,
      padding: "1rem",
    },
    extend: {
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "sans-serif",
        ],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--on-primary)",
        },
        secondary: {
          DEFAULT: "var(--muted)",
          foreground: "var(--foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--popover)",
          foreground: "var(--foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--on-primary)",
        },
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--primary)",
        chart: {
          3: "var(--chart-3)",
          5: "var(--chart-5)",
        },
        bar: "var(--bar)",
        chip: {
          DEFAULT: "var(--chip)",
          foreground: "var(--chip-fg)",
        },
        field: "var(--field)",
        dirt: "var(--dirt)",
        "field-line": "var(--field-line)",
        disabled: "var(--disabled-fg)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "om-reveal": {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "om-pulse": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        "om-flash": {
          "0%": { opacity: "0" },
          "12%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "om-ring": {
          "0%": { opacity: "0.55", transform: "scale(0.2)" },
          "100%": { opacity: "0", transform: "scale(1)" },
        },
        "om-drift": {
          "0%": { opacity: "0", transform: "translate(0, 0) scale(0.4)" },
          "18%": { opacity: "1" },
          "100%": {
            opacity: "0",
            transform: "translate(var(--dx), var(--dy)) scale(1)",
          },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.88) translateY(6px)" },
          "55%": { opacity: "1", transform: "scale(1.04)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "om-reveal": "om-reveal 260ms cubic-bezier(.2,.8,.2,1) both",
        "om-pulse": "om-pulse 1.1s ease-in-out infinite",
        "om-flash": "om-flash 520ms ease-out both",
        "om-ring": "om-ring 700ms ease-out both",
        "om-drift": "om-drift 950ms cubic-bezier(.15,.7,.3,1) both",
        "pop-in": "pop-in 460ms cubic-bezier(.2,.8,.2,1) both",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
