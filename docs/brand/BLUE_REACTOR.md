# Science By Hugs — Blue Reactor Brand System

**Status:** APPROVED / SOURCE OF TRUTH  
**Version:** 1.0  
**Approved:** 2026-09-26  
**Applies to:** Science By Hugs, Nexus, Core, Pulse, web UI, PWA UI, invoices, email signatures, print, labels, stickers, and social/app icons.

## Brand principle
Blue Reactor is the single visual identity for the Science By Hugs ecosystem. All product surfaces should feel like one system: jet-black foundations, cobalt/cyan energy, metallic silver structure, soft-white content, restrained glow, precise grids, and futuristic scientific UI.

## Core palette
- Jet Black — `#0A0A0B`
- Cobalt Blue — `#0057FF`
- Cyan Blue — `#00D2FF`
- Metallic Silver — `#C0C6D4`
- Soft White — `#F7FAFF`
- Slate Gray — `#2E3440`

Supporting UI:
- Surface 1 — `#0D1117`
- Surface 2 — `#121923`
- Muted text — `#8A94A6`
- Success — `#20D6A2`
- Warning — `#F7B731`
- Danger — `#FF4D6D`

## Typography
- Headings / display: **Space Grotesk**, fallback Inter/system sans
- Body / controls / data: **Inter**, fallback system sans
- Eyebrows and system labels: uppercase, 0.12–0.22em tracking

## Brand hierarchy
- Master: **SCIENCE BY HUGS**
- Nexus — Science By Hugs — Customer Research Portal
- Core — Science By Hugs — Operations System
- Pulse — Science By Hugs — Research Tracking System

## Logo rules
- Use horizontal master wordmark where space allows.
- Use stacked master mark in narrow placements.
- Use SBH monogram at app-icon / favicon / compact UI scale.
- Minimum clear space: 1x the orbital-dot diameter on every side.
- Never recolor product marks outside the approved palette.
- Do not add unrelated gradients, shadows, clip-art science icons, or additional brand colors.
- Glow is an accent, not a fill. Keep it focused around orbital lines, active states, and hero moments.

## UI rules
- Primary background: Jet Black.
- Panels: Surface 1 / Surface 2 with thin cyan-blue borders.
- Primary buttons: Cobalt→Cyan.
- Secondary buttons: dark surface with blue/cyan border.
- Headings: Soft White / Metallic Silver.
- Active information: Cyan.
- Use 12–24px radii depending on component size.
- Prefer thin line icons.
- Status colors are semantic only and never replace the brand blue/cyan.

## Brand voice
**Science. People. Systems. Insights. Progress.**
Precise, calm, modern, research-focused, and human. Avoid hype-heavy language.

## Canonical implementation assets
- `public/brand/science-by-hugs.svg`
- `public/brand/sbh-monogram.svg`
- `public/brand/nexus.svg`
- `public/brand/core.svg`
- `public/brand/pulse.svg`
- `public/brand/brand-tokens.json`
- `src/brand.css`

This document and the machine-readable token file are the canonical Blue Reactor specification. App-specific styling may extend the system but must not redefine the core palette, typography, logo geometry, or sub-brand hierarchy.
