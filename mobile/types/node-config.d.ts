// Types for the two Node.js functions app.config.ts uses (it runs in Node at build
// time). The app itself runs in React Native, so the project doesn't load all of
// @types/node: that would change timer types in app code.
declare module 'node:fs' {
  export function existsSync(path: string): boolean;
}
declare module 'node:path' {
  export function join(...paths: string[]): string;
}
