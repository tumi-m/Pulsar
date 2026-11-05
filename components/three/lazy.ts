/**
 * The Observatory's heavy chunks, each behind its own import() so none of
 * them is in /experience's First Load JS:
 *
 *   Finish         @react-three/postprocessing + postprocessing (bloom, grain…)
 *   CrateScene     the crate, lights and the still records (no physics)
 *   RecordsPhysics @react-three/rapier — the compat build inlines ~2 MB of wasm
 *
 * The loaders are shared so Observatory can warm a chunk a beat before the
 * component that renders it mounts (webpack hands both callers one module).
 */

export const loadFinish = () => import("./Finish");
export const loadCrateScene = () => import("./CrateScene");
export const loadRecordsPhysics = () => import("./RecordsPhysics");
