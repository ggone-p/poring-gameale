---
version: 2.0
name: Boli Creative Sync Apple Reference
source: apple/DESIGN.md
description: UI follows an Apple-like utility style: quiet chrome, white and soft-gray surfaces, compact system typography, restrained borders, and one clear blue action color. Poring remains a brand character, but the application chrome should not become pink-heavy.

colors:
  primary: "#0066cc"
  primary-focus: "#0071e3"
  primary-on-dark: "#2997ff"
  ink: "#1d1d1f"
  body: "#1d1d1f"
  muted: "#6e6e73"
  muted-soft: "#86868b"
  divider: "#d2d2d7"
  divider-soft: "#e8e8ed"
  canvas: "#ffffff"
  background: "#f5f5f7"
  surface: "#fbfbfd"
  dark: "#000000"
  poring-pink: "#fd7e8a"
  success: "#34c759"
  warning: "#ff9f0a"
  error: "#ff3b30"

typography:
  family: "SF Pro Text, Segoe UI, Microsoft YaHei UI, system-ui, -apple-system, sans-serif"
  title:
    fontSize: 17px
    fontWeight: 600
    lineHeight: 22px
    letterSpacing: -0.2px
  section:
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: -0.1px
  body:
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: -0.08px
  label:
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: -0.06px
  caption:
    fontSize: 11px
    fontWeight: 400
    lineHeight: 14px
    letterSpacing: -0.04px

radius:
  window: 22px
  panel: 18px
  control: 11px
  thumbnail: 8px
  pill: 999px

shadow:
  window: "0 28px 70px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.10)"
  preview: "0 18px 42px rgba(0,0,0,0.10)"
  action: "0 10px 22px rgba(0,102,204,0.22)"
---

## Direction

The app is a Windows floating production utility, not a marketing page. It should feel like a compact Apple utility window: quiet, precise, highly readable, and focused on the creative asset.

Keep existing workflows and controls. Change the visual language, spacing, typography, and hierarchy.

## Color Use

- Use `#f5f5f7` for app background bands.
- Use `#ffffff` for the main window, panels, cards, inputs, and list rows.
- Use `#1d1d1f` for primary text and `#6e6e73` for secondary text.
- Use `#0066cc` only for primary actions, links, selected timeline, focus rings, and active states.
- Keep `#fd7e8a` only for Poring character assets or very small brand hints. Do not use it as the main UI action color.
- Avoid decorative gradients, large color blocks, glow effects, and heavy pink surfaces.

## Typography

Use system fonts only. Prefer smaller, denser UI sizes:

- Window title and important counts: 17px / 600.
- Section titles: 14px / 600.
- Input values and queue names: 13px / 400-500.
- Labels and metadata: 11-12px.

No oversized headings. No negative spacing beyond subtle system-style letter spacing.

## Main Window

Target window remains around `1024 x 768`.

Structure:

1. Top bar: designer selector, project selector, sync, settings, collapse.
2. Left rail: upload queue with compact thumbnails.
3. Main stage: large image/video preview.
4. Right panel: overlay layers.
5. Lower field grid.
6. Bottom action bar.

Rules:

- Top bar should be quiet: white background, one soft divider.
- Queue rail should not look like a card; it is a sidebar.
- Current queue item uses subtle blue outline or pale blue background.
- Preview is the visual anchor. Keep it large, centered, and uncluttered.
- Overlay cards use white surfaces, soft gray border, and small blue active state.
- Main upload button is blue pill, not pink.

## Video Frame Picker

Video picker must remain fully functional.

- Video preview should load local MP4/H.264 using a safe file URL.
- If the codec is unsupported, show a clear inline error instead of a blank black box.
- Timeline should feel like editing software: continuous thumbnail strip, red/blue marker, drag seek, Ctrl + wheel zoom.
- UI buttons for `-1 frame / +1 frame / -0.1s / +0.1s` should not be visible. Keyboard handles frame stepping.
- Right selected-frame panel includes count, clear list, selected frame cards, and delete action.
- Bottom bar includes cancel, play/pause, add screenshot, and generate screenshots.

## Floating Poring

Poring remains playful, but the utility chrome stays quiet.

- Long press to drag.
- Drag files over Poring to show eating-ready state.
- Drop files to play eating animation and sound.
- Do not show text bubbles around Poring.

## Settings

Settings are a focused utility panel:

- Same window, not a full admin page.
- Back button and title in top bar.
- White cards on soft gray background.
- Save/cancel fixed at bottom.
- Workflow preferences expose three output directories:
  1. Global output directory.
  2. Current project output directory.
  3. Current project video-frame output directory.

## QA Checklist

- Image drag opens image workflow.
- Video drag opens video frame picker.
- Video loads and displays duration, or shows an inline unsupported-codec message.
- Eating sound plays only on drop.
- Main window fits at 1024 x 768.
- No pink-heavy UI chrome.
- All primary actions use blue.
- No frame-step buttons in video footer.
- No secrets or local config files are committed.
