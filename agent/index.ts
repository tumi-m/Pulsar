#!/usr/bin/env tsx
/**
 * Pulsar Music Discovery Agent
 * Powered by Claude claude-sonnet-4-6 via Anthropic Agent SDK
 *
 * Follows the @hooeem methodology:
 *   Role + Goal + Tools + Rules + Output Format
 *   Start simple → core agent loop → test → add complexity only when needed
 */

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./system-prompt";
import { toolDefinitions, executeTool } from "./tools";
import { supabaseAdmin } from "../lib/supabase";
import type { AgentRunResult } from "../lib/types";

// Load env in script context
import { config } from "./env";
config();

const MAX_ITERATIONS = 60; // Safety ceiling — discovery runs typically use 30–45 iterations
const MODEL = "claude-sonnet-4-6";

// ─────────────────────────────────────────────
// Core Agent Loop
// ─────────────────────────────────────────────

export async function runMusicDiscoveryAgent(): Promise<AgentRunResult> {
  const startTime = Date.now();
  const runResult: AgentRunResult = {
    success: false,
    releases_found: 0,
    releases_saved: 0,
    errors: [],
    run_at: new Date().toISOString(),
  };

  console.log(`\n${"─".repeat(60)}`);
  console.log(`🎵 PULSAR — Music Discovery Agent`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Started: ${runResult.run_at}`);
  console.log(`${"─".repeat(60)}\n`);

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        "Start the daily music discovery run. Get today's date first, then systematically search all sources and save every qualifying release. Aim for 10–20 releases across diverse genres. Work through each source methodically.",
    },
  ];

  let iterations = 0;
  let releasesSaved = 0;

  // ── Agent Loop ──────────────────────────────
  while (iterations < MAX_ITERATIONS) {
    iterations++;

    console.log(`\n[Iteration ${iterations}/${MAX_ITERATIONS}]`);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    console.log(`  Stop reason: ${response.stop_reason}`);

    // Add assistant response to message history
    messages.push({ role: "assistant", content: response.content });

    // ── Check for completion ───────────────────
    if (response.stop_reason === "end_turn") {
      const textContent = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      console.log(`\n✅ Agent completed naturally.`);
      console.log(`   Final message preview: ${textContent.substring(0, 200)}...`);
      runResult.success = true;
      break;
    }

    // ── Process tool calls ─────────────────────
    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        console.log(`  🔧 Tool: ${toolUse.name}`);

        try {
          const result = await executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );

          // Track saves
          if (toolUse.name === "save_release") {
            const parsed = JSON.parse(result);
            if (parsed.success) {
              releasesSaved++;
              runResult.releases_saved = releasesSaved;
              console.log(`  💾 Saved release #${releasesSaved}: ${parsed.message}`);
            }
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`  ❌ Tool error (${toolUse.name}): ${errorMsg}`);
          runResult.errors.push(`${toolUse.name}: ${errorMsg}`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: errorMsg }),
            is_error: true,
          });
        }
      }

      // Add tool results to message history
      messages.push({ role: "user", content: toolResults });
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.log(`\n⚠️  Reached max iterations (${MAX_ITERATIONS})`);
    runResult.success = releasesSaved > 0;
  }

  const durationMs = Date.now() - startTime;
  runResult.releases_found = releasesSaved; // Saved = verified + found

  console.log(`\n${"─".repeat(60)}`);
  console.log(`📊 Run Summary`);
  console.log(`   Releases saved: ${runResult.releases_saved}`);
  console.log(`   Errors: ${runResult.errors.length}`);
  console.log(`   Duration: ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`   Success: ${runResult.success}`);
  console.log(`${"─".repeat(60)}\n`);

  // Log the run to the database
  try {
    const db = supabaseAdmin();
    await db.from("agent_runs").insert({
      releases_found: runResult.releases_found,
      releases_saved: runResult.releases_saved,
      errors: runResult.errors,
      duration_ms: durationMs,
      success: runResult.success,
    });
  } catch (err) {
    console.error("Failed to log agent run:", err);
  }

  return runResult;
}

// ─────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────

if (require.main === module || process.argv[1]?.endsWith("agent/index.ts")) {
  runMusicDiscoveryAgent()
    .then((result) => {
      console.log("Agent run complete:", result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error("Agent fatal error:", err);
      process.exit(1);
    });
}
