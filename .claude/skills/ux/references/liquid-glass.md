# Liquid Glass — CSS Patterns for NeoSleep

Liquid glass is the dominant UI trend of 2025 (Apple iOS 26, visionOS). The effect: translucent frosted surfaces that look like glass, with soft blur, layered depth, and specular light highlights. In a medical product this reads as clean, premium, and modern — not gimmicky — when applied with restraint.

## When to Use

✅ Use on:
- Hero overlays with image or gradient backgrounds
- Modals and dialogs
- Navigation bars when scrolled over content
- Feature/benefit cards on dark backgrounds
- Notification pills and badges
- Sticky elements (headers, CTAs)

❌ Do NOT use on:
- Body text containers (kills readability)
- Dense data tables
- Form inputs (confuses interactive affordance)
- Elements without a visible background behind them (glass needs something to blur)

---

## Core CSS Variables (add to `:root`)

```scss
:root {
  --glass-bg-light:    rgba(255, 255, 255, 0.65);
  --glass-bg-dark:     rgba(255, 255, 255, 0.08);
  --glass-border:      rgba(255, 255, 255, 0.18);
  --glass-border-dark: rgba(255, 255, 255, 0.10);
  --glass-blur:        blur(18px) saturate(180%);
  --glass-shadow:      0 8px 32px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.18);
  --glass-shadow-dark: 0 8px 32px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
```

---

## Pattern 1 — Light Glass Card (on light background)

Use when you have a very subtle teal wash or image behind the card.

```scss
.glass-card {
  background: var(--glass-bg-light);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  box-shadow: var(--glass-shadow);

  [data-theme="dark"] & {
    background: var(--glass-bg-dark);
    border-color: var(--glass-border-dark);
    box-shadow: var(--glass-shadow-dark);
  }
}
```

## Pattern 2 — Dark Glass Card (on dark/gradient background)

Use on the teal hero sections.

```scss
.glass-card--dark {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-top: 1px solid rgba(255, 255, 255, 0.22); /* specular highlight on top edge */
  border-radius: 20px;
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.15),
    inset 0 -1px 0 rgba(0, 0, 0, 0.1);
}
```

## Pattern 3 — Glass Navigation Bar (scrolled state)

```scss
.site-header--scrolled {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(24px) saturate(200%);
  -webkit-backdrop-filter: blur(24px) saturate(200%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.06);
  transition: background 0.3s ease, backdrop-filter 0.3s ease;

  [data-theme="dark"] & {
    background: rgba(12, 36, 34, 0.80);
    border-bottom-color: rgba(255, 255, 255, 0.06);
  }
}
```

## Pattern 4 — Glass Modal Overlay

```scss
.modal-overlay {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.modal {
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(32px) saturate(200%);
  -webkit-backdrop-filter: blur(32px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 24px;
  box-shadow:
    0 32px 96px rgba(0, 0, 0, 0.18),
    0 8px 24px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);

  [data-theme="dark"] & {
    background: rgba(18, 50, 46, 0.88);
    border-color: rgba(255, 255, 255, 0.10);
    box-shadow:
      0 32px 96px rgba(0, 0, 0, 0.48),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
}
```

## Pattern 5 — Glass Pill / Badge

```scss
.glass-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.875rem;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.04em;
}
```

---

## Specular Highlight Technique

The most realistic glass effect uses a brighter top border to simulate light catching the edge:

```scss
.glass-realistic {
  border-top-color: rgba(255, 255, 255, 0.35);  /* bright top */
  border-left-color: rgba(255, 255, 255, 0.20); /* slightly lit left */
  border-right-color: rgba(255, 255, 255, 0.08); /* shadow right */
  border-bottom-color: rgba(0, 0, 0, 0.08);       /* shadow bottom */
}
```

---

## Gradient Mesh Background (to place glass cards on)

Glass cards need something behind them to blur. Use this as a section background:

```scss
.mesh-background {
  background:
    radial-gradient(ellipse 60% 50% at 20% 30%, rgba(18, 143, 131, 0.18) 0%, transparent 60%),
    radial-gradient(ellipse 40% 60% at 80% 70%, rgba(142, 214, 206, 0.12) 0%, transparent 55%),
    var(--website-bg);
}
```

---

## Performance Notes

- `backdrop-filter` is GPU-accelerated — safe to use
- Avoid stacking more than 2–3 glass elements on the same Z-axis (compounds blur cost)
- Always add `-webkit-backdrop-filter` for Safari
- On iOS Safari < 15, `backdrop-filter` support is partial — always set a fallback `background` color
- Test on real devices: blur that looks subtle on a 5K monitor can look heavy on an iPhone
