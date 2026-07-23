/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{ts,tsx,html}'],
  important: '.background-stitch-scope',
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        'surface-container-low': '#f4f3f8',
        'on-primary': '#ffffff',
        surface: '#faf9fe',
        'on-surface-variant': '#444748',
        'inverse-surface': '#2f3034',
        'surface-container': '#eeedf3',
        'outline-variant': '#c4c7c7',
        'surface-container-high': '#e9e7ed',
        'on-background': '#1a1b1f',
        'surface-container-highest': '#e3e2e7',
        'surface-container-lowest': '#ffffff',
        outline: '#747878',
        'on-surface': '#1a1b1f',
        'surface-variant': '#e3e2e7',
        'inverse-on-surface': '#f1f0f5',
        'secondary-container': '#dfdfe1',
        'surface-dim': '#dad9df',
        primary: '#000000'
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px'
      },
      spacing: {
        'element-gap': '12px',
        unit: '4px',
        gutter: '16px',
        'margin-sm': '8px',
        'margin-lg': '24px',
        'container-padding': '24px',
        'margin-md': '16px'
      },
      fontFamily: {
        'label-lg': ['Inter', 'sans-serif'],
        'label-sm': ['Inter', 'sans-serif'],
        'body-lg': ['Inter', 'sans-serif'],
        'headline-lg': ['Inter', 'sans-serif'],
        'body-md': ['Inter', 'sans-serif'],
        'headline-md': ['Inter', 'sans-serif']
      },
      fontSize: {
        'label-lg': ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '500' }],
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.03em', fontWeight: '500' }],
        'body-lg': ['14px', { lineHeight: '20px', letterSpacing: '0em', fontWeight: '400' }],
        'headline-lg': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-md': ['13px', { lineHeight: '18px', letterSpacing: '0em', fontWeight: '400' }],
        'headline-md': ['16px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' }]
      }
    }
  }
}
