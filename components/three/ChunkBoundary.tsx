"use client";

import { Component, type ReactNode } from "react";

/**
 * Wraps an optional lazy layer of the Observatory (the finish, the crate,
 * the physics). If its chunk fails to load — a flaky connection, a deploy
 * mid-visit — the scene carries on without it (or with `fallback`) instead
 * of the error unmounting the whole Canvas.
 */
export class ChunkBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[observatory] optional layer unavailable:", error);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
