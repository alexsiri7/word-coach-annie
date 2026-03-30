# Design System Strategy: The Editorial Cabin

## 1. Overview & Creative North Star
The creative direction for this design system is **"The Analog Architect."** It is a digital environment that rejects the cold, sterile nature of modern SaaS in favor of the tactile warmth of a mountain retreat and the intellectual rigor of a vintage newsroom. 

We move beyond the "standard template" look by embracing **Intentional Asymmetry**. The layout should feel like a perfectly composed desk—functional, yet layered with the artifacts of a creative life. We use high-contrast typography scales and overlapping surfaces to break the rigid 12-column grid, ensuring the interface feels curated rather than generated.

---

## 2. Colors & Surface Philosophy

### The Tonal Palette
Our palette is rooted in natural, high-longevity materials: aged paper, cold-pressed ink, and organic pigments.

- **Primary Background (`surface` #faf9f5):** Not a pure white, but a warm, vellum-like base that reduces eye strain during long writing sessions.
- **Ink Secondary (`primary` #162839):** A deep, saturated blue-black that mimics the weight of a fresh typewriter ribbon.
- **The Accents:** 
    - `secondary` (#006d37): A deep Forest Green for progress and success.
    - `tertiary` (#570001): A dried-blood red for errors or "intense" coaching moments from Annie.

### The "No-Line" Rule
To achieve a high-end editorial feel, **1px solid borders are strictly prohibited for sectioning.** We define boundaries through:
1.  **Tonal Shifts:** Placing a `surface-container-low` section against a `surface` background.
2.  **Negative Space:** Using the 4rem–5.5rem spacing tiers to create mental breaks between content blocks.

### Glass & Gradient Rule
While the base is "analog," we use **Glassmorphism** for floating elements (like Annie’s feedback bubbles). Use semi-transparent surface colors with a `backdrop-blur` of 12px. This prevents the UI from feeling "heavy" and allows the subtle paper textures of the background to bleed through. For main CTAs, use a subtle linear gradient from `primary` to `primary-container` to add "soul" and depth.

---

## 3. Typography: The Editorial Engine

We utilize a high-contrast pairing to distinguish between "The Work" (writing) and "The Tool" (UI).

- **Display & Headlines (Newsreader):** An elegant, high-contrast serif. This is the voice of the author and the "Mountain Cabin" soul. It should be used with generous leading (1.4x) to feel like a published novel.
- **UI & Labels (Inter / Manrope):** Clean, geometric sans-serifs. These act as the "Typewriter Markings"—functional, legible, and subordinate to the writing.
- **Hierarchy as Identity:** Use `display-lg` (3.5rem) for chapter starts, creating a sense of "The Great American Novel" gravitas. Use `label-md` in all-caps with 0.05em tracking for UI headers to mimic stamped ink labels.

---

## 4. Elevation & Depth: Tonal Layering

Instead of using drop shadows as a crutch for hierarchy, we use **The Layering Principle**.

### Stacking Surfaces
Depth is achieved by "nesting" the surface-container tiers. 
- **The Canvas:** `surface`
- **The Desk (Sidebars/Panels):** `surface-container-low`
- **The Paper (Cards/Items):** `surface-container-lowest` (pure white) to provide a soft, natural lift.

### Ambient Shadows
When an element must float (e.g., a modal or Annie’s avatar), use **Ambient Shadows**. 
- **Blur:** 24px–40px. 
- **Opacity:** 4%–6%. 
- **Color:** Use a tinted shadow based on the `on-surface` token (dark navy/charcoal) rather than pure black.

### The Ghost Border
If accessibility requires a container boundary, use a **Ghost Border**: `outline-variant` at 15% opacity. It should be felt, not seen.

---

## 5. Components

### The Keycap Button
Buttons should feel like physical typewriter keys. 
- **Shape:** `sm` (0.125rem) or `md` (0.375rem) roundedness. 
- **Shadow:** A subtle 2px bottom offset using `primary-container` to simulate a pressed key.
- **Typography:** `label-md` all-caps.

### Inputs & Text Areas
- **Writing Area:** No borders. Use the `Newsreader` font. The focus state is indicated by a subtle background shift to `surface-bright`.
- **UI Inputs:** Underline-only style using the `outline` token, mimicking a form filled out by hand.

### Annie's Coaching Cards
Forbid divider lines. Use `surface-container-highest` for Annie’s "intense" tips and `secondary-container` for her positive feedback. Use vertical white space (`spacing-6`) to separate thoughts.

### Signature Component: The Stamp Chip
Instead of rounded pills, use "Stamp" chips with `none` (0px) roundedness and a `ghost-border`. These represent metadata (tags, word counts) and should look like they were stamped onto the page after the fact.

---

## 6. Do’s and Don’ts

### Do:
- **Use Asymmetric Margins:** Let the main writing area breathe with a larger left-hand margin than the right to mimic a manuscript.
- **Layer Textures:** Apply a subtle grain overlay (2% opacity) to the `surface` background to break the digital flatness.
- **Embrace "Ink" Logic:** When Annie "marks up" a text, use the `tertiary` (Red) color as if it were a physical pen.

### Don't:
- **Don't use 100% opaque borders:** It shatters the "paper and ink" illusion.
- **Don't use "Standard" Blues:** Stick to the `primary` #162839 (Ink). Standard digital blues feel like "software"; Ink feels like "literature."
- **Don't Over-Animate:** Transitions should be "Snappy" (200ms) like a mechanical carriage return, not "Bouncy" like a mobile game.

---

## 7. Spacing & Rhythm
Use the **3.5rem (10)** and **5.5rem (16)** tokens for major section padding. This design system lives and breathes through its "white space." If the interface feels crowded, increase the spacing; do not add a border.