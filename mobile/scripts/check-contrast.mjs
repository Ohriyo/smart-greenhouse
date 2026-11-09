#!/usr/bin/env node
// Contrast check for the design tokens (src/theme/tokens.ts), both themes.
// WCAG AA: text >= 4.5:1, large text / graphics >= 3:1. Fails (exit 1) below that.
// Usage: npm run check:contrast   (Node 24 reads the .ts file directly)

import { darkColors, lightColors } from '../src/theme/tokens.ts';

/** sRGB hex ("#RRGGBB") → relative luminance. */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground token, background token, minimum ratio, what it is]
const TEXT = 4.5;
const GRAPHIC = 3;
const PAIRS = [
  ['text', 'background', TEXT, 'body text on the page'],
  ['text', 'surface', TEXT, 'body text on cards'],
  ['text', 'surfaceMuted', TEXT, 'text on inputs / tracks'],
  ['text', 'surfaceTint', TEXT, 'text on the tinted status card'],
  ['textSecondary', 'background', TEXT, 'secondary text on the page'],
  ['textSecondary', 'surface', TEXT, 'secondary text on cards'],
  ['textSecondary', 'surfaceMuted', TEXT, 'secondary text on inputs'],
  ['textSecondary', 'surfaceTint', TEXT, 'secondary text on the tinted card'],
  ['textTertiary', 'background', TEXT, 'tertiary text on the page'],
  ['textTertiary', 'surface', TEXT, 'tertiary text on cards'],
  ['textTertiary', 'surfaceMuted', TEXT, 'placeholder text in inputs'],
  ['accent', 'surface', TEXT, 'green text / links on cards'],
  ['accent', 'background', TEXT, 'green text on the page'],
  ['accent', 'accentSoft', TEXT, 'green text on soft green (chips, tonal buttons)'],
  ['onAccent', 'accent', TEXT, 'label on a primary button'],
  ['onAccent', 'danger', TEXT, 'label on a destructive button'],
  ['onAccent', 'dangerPressed', TEXT, 'label on a pressed destructive button'],
  ['onAccent', 'accentPressed', TEXT, 'label on a pressed primary button'],
  ['ok', 'okSoft', TEXT, '"Good" on soft green'],
  ['ok', 'surface', TEXT, '"Good" on cards'],
  ['warning', 'warningSoft', TEXT, '"High" on soft amber'],
  ['warning', 'surface', TEXT, '"High" on cards'],
  ['danger', 'dangerSoft', TEXT, '"Critical" on soft red'],
  ['danger', 'surface', TEXT, 'error text on cards'],
  ['info', 'infoSoft', TEXT, 'info text on soft blue'],
  ['offline', 'offlineSoft', TEXT, '"Offline" on soft gray'],
  ['offline', 'surface', TEXT, '"Offline" on cards'],
  ['demo', 'demoSoft', TEXT, 'demo text on lavender'],
  ['onInverse', 'inverse', TEXT, 'the dark "Demo" pill and chart tooltips'],
  ['text', 'overlay', TEXT, 'toast text'],
  // Graphics: lines, bars, gauge arcs, dots (must be visible against the card)
  ['chart.airTemp', 'surface', GRAPHIC, 'temperature line'],
  ['chart.humidity', 'surface', GRAPHIC, 'humidity line'],
  ['chart.soilMoisture', 'surface', GRAPHIC, 'soil line'],
  ['chart.lux', 'surface', GRAPHIC, 'light line'],
  ['accent', 'surfaceMuted', GRAPHIC, 'gauge / bar fill on its track'],
];

const pick = (theme, key) => key.split('.').reduce((o, k) => o[k], theme);

let failures = 0;
for (const [name, theme] of [
  ['light', lightColors],
  ['dark', darkColors],
]) {
  console.log(`\n${name.toUpperCase()}`);
  for (const [fg, bg, min, what] of PAIRS) {
    const r = ratio(pick(theme, fg), pick(theme, bg));
    const ok = r >= min;
    if (!ok) failures++;
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${fg} on ${bg}: ${what}`,
    );
  }
}

console.log(failures ? `\n${failures} pair(s) below the minimum` : '\nAll pairs meet WCAG AA');
process.exit(failures ? 1 : 0);
