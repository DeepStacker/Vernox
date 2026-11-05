import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" },
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      fontFamily: {
        editorial: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        brand: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        "serif-italic": ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        cream: "color-mix(in srgb, var(--cream) calc(<alpha-value> * 100%), transparent)",
        burgundy: {
          DEFAULT: "color-mix(in srgb, var(--burgundy) calc(<alpha-value> * 100%), transparent)",
          hover: "color-mix(in srgb, var(--burgundy-hover) calc(<alpha-value> * 100%), transparent)",
          deep: "color-mix(in srgb, var(--burgundy) calc(<alpha-value> * 100%), transparent)",
        },
        "dusty-pink": "color-mix(in srgb, var(--dusty-pink) calc(<alpha-value> * 100%), transparent)",
        "soft-white": "color-mix(in srgb, var(--cream) calc(<alpha-value> * 100%), transparent)",
        "maroon-light": "color-mix(in srgb, var(--dusty-pink) calc(<alpha-value> * 100%), transparent)",
        "maroon-deep": "color-mix(in srgb, var(--burgundy) calc(<alpha-value> * 100%), transparent)",
        maroon: "color-mix(in srgb, var(--burgundy) calc(<alpha-value> * 100%), transparent)",
        gold: "color-mix(in srgb, var(--gold) calc(<alpha-value> * 100%), transparent)",
        "dark-brown": "color-mix(in srgb, var(--dark-brown) calc(<alpha-value> * 100%), transparent)",
        oxblood: {
          DEFAULT: "color-mix(in srgb, var(--burgundy) calc(<alpha-value> * 100%), transparent)",
          deep: "color-mix(in srgb, var(--dark-brown) calc(<alpha-value> * 100%), transparent)",
        },
        "oxblood-deep": "color-mix(in srgb, var(--dark-brown) calc(<alpha-value> * 100%), transparent)",
        brass: "color-mix(in srgb, var(--gold) calc(<alpha-value> * 100%), transparent)",
        ivory: "color-mix(in srgb, var(--cream) calc(<alpha-value> * 100%), transparent)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--surface-foreground))",
        },
        toolbar: {
          DEFAULT: "hsl(var(--toolbar))",
          foreground: "hsl(var(--toolbar-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      boxShadow: {
        soft: "0 1px 2px hsl(var(--foreground) / 0.06), 0 4px 16px hsl(var(--foreground) / 0.06)",
        luxe: "0 8px 30px hsl(var(--foreground) / 0.12)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
