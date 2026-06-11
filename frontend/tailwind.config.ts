import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Stellar brand palette (replaces Uniswap pink)
        uni: {
          pink:     '#FBB124',              // Stellar gold
          pinkLight:'#FDE68A',              // light amber
          pinkBg:   'rgba(251,177,36,0.10)',// subtle gold tint
          blue:     '#2172E5',
        },
        // Surfaces (dark Soroban theme)
        bg: {
          0:           '#0D0E0E',
          1:           '#131316',
          surface:     '#1B1B1F',
          module:      '#212429',
          interactive: '#2C2F36',
          outline:     '#40444F',
        },
        txt: {
          primary:  '#FFFFFF',
          secondary:'#C3C5CB',
          tertiary: '#8F96AC',
          disabled: '#5D6785',
        },
        state: {
          success: '#27AE60',
          warning: '#F3B71E',
          error:   '#FD4040',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card:   '24px',
        module: '20px',
        pill:   '16px',
      },
      boxShadow: {
        card:  '0 4px 24px rgba(0,0,0,0.35)',
        pink:  '0 0 20px rgba(251,177,36,0.30)',   // gold glow
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%':   { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',   opacity: '1' },
        },
        slideInRight: {
          '0%':   { transform: 'translateX(110%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        slideOutRight: {
          '0%':   { transform: 'translateX(0)',    opacity: '1' },
          '100%': { transform: 'translateX(110%)', opacity: '0' },
        },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        fadeIn:        'fadeIn 0.15s ease-out',
        slideUp:       'slideUp 0.2s ease-out',
        slideInRight:  'slideInRight 0.3s ease-out',
        slideOutRight: 'slideOutRight 0.25s ease-in forwards',
        spin:          'spin 0.8s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
