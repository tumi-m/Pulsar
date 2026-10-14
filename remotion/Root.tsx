import { Composition } from "remotion";
import { CrateRecap } from "./CrateRecap";
import { calculateCrateRecapMetadata } from "./props";

/**
 * Studio / CLI registry. The app never imports this file — it hands
 * CrateRecap to <Player> and renderMediaOnWeb() directly (see
 * components/CrateVideoSheet.tsx) — so anything here is for the
 * `npm run motion:studio` / `motion:render` side only.
 *
 * Duration comes from calculateMetadata (2 s intro + 1.6 s a record, up to 12,
 * + 2 s outro); the 264 frames here are what the default three records come to.
 */
export function RemotionRoot() {
  return (
    <Composition
      id="CrateRecap"
      component={CrateRecap}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={264}
      calculateMetadata={calculateCrateRecapMetadata}
      defaultProps={{
        crateName: "Road Trip",
        records: [
          { title: "GNX", artist: "Kendrick Lamar", artworkUrl: null, year: "2024" },
          { title: "Brat", artist: "Charli xcx", artworkUrl: null, year: "2024" },
          { title: "Blonde", artist: "Frank Ocean", artworkUrl: null, year: "2016" },
        ],
        withAudio: true,
      }}
    />
  );
}
