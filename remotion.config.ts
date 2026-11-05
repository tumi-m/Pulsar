import { existsSync } from "node:fs";
import { basename } from "node:path";
import { Config } from "@remotion/cli/config";

/**
 * Remotion CLI / Studio settings (`npm run motion:studio`, `npx remotion render`).
 *
 * scripts/motion/render.mjs drives @remotion/renderer directly and does NOT
 * read this file — keep the two in step when changing a default here.
 */

Config.setEntryPoint("remotion/index.ts");

// The recap is flat colour and type, not photography: JPEG frames are several
// times faster to capture than PNG and the h264 encode can't tell the difference.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(90);
Config.setCodec("h264");
// Social apps want yuv420p, tagged BT.709 limited range; it is also what every
// phone decodes in hardware. (The v4 default leaves JPEG frames as untagged
// full-range yuvj420p.)
Config.setPixelFormat("yuv420p");
Config.setColorSpace("bt709");
Config.setOverwriteOutput(true);

// Bring your own browser (CI images, sandboxes without Remotion's download):
// REMOTION_BROWSER_EXECUTABLE=/path/to/chrome. Otherwise Remotion fetches and
// uses its own Chrome Headless Shell. A full Chrome has dropped the old
// headless mode Remotion launches by default, so anything that isn't a
// headless shell runs as "chrome-for-testing" (--headless=new).
const browser = process.env.REMOTION_BROWSER_EXECUTABLE;
if (browser && existsSync(browser)) {
  Config.setBrowserExecutable(browser);
  Config.setChromeMode(/headless[_-]shell/.test(basename(browser)) ? "headless-shell" : "chrome-for-testing");
}

// Headless Linux has no GPU; "swangle" (SwiftShader behind ANGLE) is the
// renderer Remotion recommends there. Override with REMOTION_GL if needed.
const gl = process.env.REMOTION_GL;
Config.setChromiumOpenGlRenderer(
  gl === "angle" || gl === "egl" || gl === "swiftshader" || gl === "vulkan" || gl === "angle-egl" ? gl : "swangle"
);
