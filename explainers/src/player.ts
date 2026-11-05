/**
 * The <motion-canvas-player> custom element, built into public/explainers/
 * project.js along with the scene (src/project.ts imports this file).
 *
 * Pulsar can't bundle the player itself: it imports @motion-canvas/core, which
 * the player package lists only as a devDependency, so the import doesn't
 * resolve from the app. Built from here it uses the scene's copy of core —
 * one download, one set of module state — and the app loads it with a plain
 * runtime import() when someone opens the explainer.
 */
import '@motion-canvas/player';

interface CorePlayer {
  deactivate(): void;
  onRender: {unsubscribe(handler: () => Promise<void>): void};
}

interface PlayerInternals extends HTMLElement {
  player: CorePlayer | null;
  render: () => Promise<void>;
  updateSettings(): void;
  updateSource(src: string): Promise<void>;
}

const element = customElements.get('motion-canvas-player') as
  | (CustomElementConstructor & {prototype: PlayerInternals})
  | undefined;

/*
 * `quality`, `width` and `height` call updateSettings(), which reads the
 * project's settings — so setting one before project.js has loaded throws
 * (3.17.2). Loading the project calls updateSettings() itself and reads the
 * attributes then, so an early call can simply wait for it. Pulsar sets
 * `quality` up front, sized to the box the player is drawn in.
 */
const updateSettings = element?.prototype.updateSettings;
if (element && updateSettings) {
  element.prototype.updateSettings = function (this: PlayerInternals) {
    if (this.player) updateSettings.call(this);
  };
}

/*
 * A project that finishes loading after the element has left the page still
 * gets a Player, and core's Player starts its frame loop in its constructor
 * (3.17.2). disconnectedCallback ran before that Player existed, so nothing
 * would ever stop it: a removed element would keep drawing — and with `auto`,
 * playing — until the tab closed. Put it to sleep the way disconnectedCallback
 * would have; connectedCallback wakes it if the element is attached again.
 */
const updateSource = element?.prototype.updateSource;
if (element && updateSource) {
  element.prototype.updateSource = async function (this: PlayerInternals, src: string) {
    await updateSource.call(this, src);
    if (!this.isConnected && this.player) {
      this.player.deactivate();
      this.player.onRender.unsubscribe(this.render);
    }
  };
}
