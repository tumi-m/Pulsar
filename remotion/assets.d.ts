// Remotion's bundler emits font files as assets and hands back their URL
// (remotion/fonts.ts). Only the CLI bundle imports these; Next never sees them.
declare module "*.woff2" {
  const src: string;
  export default src;
}
