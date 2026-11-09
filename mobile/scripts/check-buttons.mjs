#!/usr/bin/env node
// Button rule check (README "Button rule"): every button is the shared pill
// <Button> / circular <IconButton> from src/components/ui. This fails when code
// outside src/components/ui builds its own button-like touchable:
//   1. any TouchableOpacity / TouchableHighlight / TouchableWithoutFeedback, or
//   2. a file that uses <Pressable> AND sets a borderRadius.
// A file that legitimately does (e.g. a pressable *card* or *list row*, which keep
// their rounded-rectangle shape) must say why on one line:
//   // button-check-ignore: <reason>
// Usage: npm run check:buttons   (exit code 1 on violations)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SCAN = ['app', 'src'];
const ALLOWED_DIR = join('src', 'components', 'ui') + sep;
const IGNORE = /\/\/\s*button-check-ignore:\s*\S+/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const problems = [];
for (const top of SCAN) {
  for (const file of walk(join(root, top))) {
    const rel = relative(root, file);
    if (rel.startsWith(ALLOWED_DIR)) continue;
    const src = readFileSync(file, 'utf8');
    if (IGNORE.test(src)) continue;
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (/\bTouchable(Opacity|Highlight|WithoutFeedback)\b/.test(line)) {
        problems.push(
          `${rel}:${i + 1}  uses ${line.match(/Touchable\w+/)[0]}: use <Button>/<IconButton> from @/components/ui`,
        );
      }
    });
    if (/<Pressable\b/.test(src) && /\bborderRadius\b/.test(src)) {
      const at = lines.findIndex((l) => /<Pressable\b/.test(l)) + 1;
      problems.push(
        `${rel}:${at}  <Pressable> + borderRadius: a custom button? Use <Button>/<IconButton>, ` +
          'or add "// button-check-ignore: <reason>" if it is a card/row, not a button',
      );
    }
  }
}

if (problems.length) {
  console.error(
    `Button rule: ${problems.length} problem(s)\n` + problems.map((p) => `  ${p}`).join('\n'),
  );
  process.exit(1);
}
console.log('Button rule: OK (all buttons use the shared pill <Button> / circular <IconButton>)');
