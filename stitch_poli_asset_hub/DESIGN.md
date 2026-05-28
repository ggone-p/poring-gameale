---
name: Boli Creative Sync
colors:
  surface: '#f8f9ff'
  surface-dim: '#d5dae5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef4fe'
  surface-container: '#e9eef9'
  surface-container-high: '#e3e8f3'
  surface-container-highest: '#dde3ed'
  on-surface: '#161c23'
  on-surface-variant: '#534346'
  inverse-surface: '#2b3139'
  inverse-on-surface: '#ecf1fc'
  outline: '#857276'
  outline-variant: '#d8c1c5'
  surface-tint: '#94445d'
  primary: '#94445d'
  on-primary: '#ffffff'
  primary-container: '#ff9db8'
  on-primary-container: '#7b3049'
  inverse-primary: '#ffb1c5'
  secondary: '#0060ab'
  on-secondary: '#ffffff'
  secondary-container: '#6eaeff'
  on-secondary-container: '#004076'
  tertiary: '#ad2e41'
  on-tertiary: '#ffffff'
  tertiary-container: '#ff9fa5'
  on-tertiary-container: '#90172e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffd9e1'
  primary-fixed-dim: '#ffb1c5'
  on-primary-fixed: '#3f001b'
  on-primary-fixed-variant: '#772d46'
  secondary-fixed: '#d3e3ff'
  secondary-fixed-dim: '#a3c9ff'
  on-secondary-fixed: '#001c39'
  on-secondary-fixed-variant: '#004883'
  tertiary-fixed: '#ffdada'
  tertiary-fixed-dim: '#ffb3b6'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#8c132c'
  background: '#f8f9ff'
  on-background: '#161c23'
  surface-variant: '#dde3ed'
typography:
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  section-margin: 24px
  panel-padding: 20px
  stack-gap: 12px
  inline-gap: 8px
---

## Brand & Style
Boli Creative Sync is a professional asset management tool designed for creative studios. The brand personality is **Modern Corporate with a Creative Pulse**, balancing functional utility with a soft, inviting aesthetic. 

The design style follows a **Modern / Material-Fidelity** approach:
- **Clean Utility:** A heavy focus on structured layouts and clear information hierarchy for high-density metadata.
- **Soft Professionalism:** Utilizing a refined palette of warm pinks and cool blues to break the monotony of traditional enterprise software.
- **Focus-Driven:** Significant use of whitespace and "surface-container" tiers to separate the creative canvas from the administrative controls.

## Colors
The palette is built on a **Fidelity** model, where the primary brand color (a sophisticated muted rose) anchors the experience.

- **Primary (#94445d):** Used for key branding, active states, and primary action buttons.
- **Secondary (#0060ac):** Reserved for technical indicators or secondary accentuation.
- **Neutral Backgrounds:** The system uses a specific cool-grey-to-blue-tinted scale for surfaces (`#f8f9ff` to `#dde3ed`) to keep the interface feeling "fresh" rather than "stale."
- **Semantic Accents:** High-contrast text colors like `on-surface-variant` ensure readability for metadata labels against tinted backgrounds.

## Typography
The system relies exclusively on **Inter** to maintain a utilitarian, "pro-tool" aesthetic. 

- **Hierarchy:** We use `label-caps` for section headers and field labels to provide a distinct visual break from content text.
- **Clarity:** `body-md` and `body-sm` are optimized for high-density data entry.
- **Emphasis:** Semi-bold weights (600) are reserved for titles and active navigational states to draw the eye without being aggressive.

## Layout & Spacing
The layout follows a **Fixed Container** model for the main window (800x760px), simulating a desktop application environment.

- **Grid Strategy:** A three-pane architecture consisting of a narrow side-nav (140px), a flexible central content area, and a persistent footer.
- **Responsive Behavior:** The sidebar collapses to 80px on smaller viewports, hiding text labels and showing only icons. The metadata fields transition from a 3-column grid on desktop to a 2-column grid on tablet-sized containers.
- **Rhythm:** A base 4px unit is used, with `12px` (stack-gap) being the primary vertical rhythm for related elements and `24px` (section-margin) for major layout blocks.

## Elevation & Depth
Depth is communicated through **Tonal Layering** and **Subtle Shadows**:

- **Stacking:** The background is the lowest level (`surface-container-lowest`), while interactive cards and panels sit on `surface`. 
- **Borders:** Instead of heavy shadows, the system uses `outline-variant` (#d8c1c5) borders to define boundaries between panels, creating a "flat but layered" feel.
- **Shadows:** A soft `0 10px 25px -5px rgba(0, 0, 0, 0.1)` is applied only to the outermost window container and primary floating actions to provide focus.
- **Interaction:** Hover states utilize a subtle shift to `surface-container-high` to provide tactile feedback.

## Shapes
The shape language is consistently **Rounded**, leaning into a friendly yet structured appearance.

- **Large Containers:** The main window and primary canvas areas use `xl` (0.75rem or 12px) corners.
- **Interactive Elements:** Buttons, input fields, and side-nav items use `lg` (0.5rem or 8px) corners.
- **Pill Shapes:** Reserved for the primary "Start Upload" action and status toggles to differentiate them from standard form fields.

## Components
- **Buttons:** Primary buttons are pill-shaped with `primary` background and `on-primary` text. Icons within buttons should use the `material-symbols-outlined` set.
- **Inputs (Dropdowns):** Designed with a "Floating Label" aesthetic. The label sits in a small box overlapping the top border. Background is `surface`, changing to `surface-bright` on hover.
- **Side Nav:** Active items are highlighted with `primary-container` and a slight `translate-x-1` animation to indicate selection.
- **Overlay Controls:** Layers are managed via small cards with built-in toggles and progress bars (used as opacity or value sliders).
- **Status Indicators:** Use `label-caps` for micro-copy status (e.g., "Ready", "Syncing") to ensure they aren't confused with main content.