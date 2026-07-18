#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { importRuntimeOverlay } = require("./pfx_runtime_overlay_import.js");

const defaultInputPath = "";
const defaultTargetsPath = "extracted/reports/pfx_encrypted_runtime_targets.json";
const defaultOverlayPath = "extracted/reports/pfx_runtime_memory_overlays.jsonl";
const defaultOverlaySummaryPath = "extracted/reports/pfx_runtime_memory_overlay_summary.json";
const defaultOverlayCoveragePath = "extracted/reports/pfx_runtime_memory_overlay_coverage.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function commandLine(command, args = []) {
  return [command, ...args].map(shellQuote).join(" ");
}

function runCommand(command, args = [], { dryRun = false } = {}) {
  const text = commandLine(command, args);
  if (dryRun) {
    console.log(text);
    return;
  }
  console.log(`$ ${text}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${text} exited with status ${result.status}`);
}

function readOverlaySummary(summaryPath) {
  if (!fs.existsSync(summaryPath)) return null;
  const data = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  return data.summary || null;
}

function formatTargetSamples(label, samples = []) {
  if (!samples.length) return "";
  const formatted = samples
    .slice(0, 5)
    .map((sample) => `${sample.kind || "unknown"}@${sample.virtualAddress || "?"}:${sample.availableBytes || 0}/${sample.byteLength || "?"}`)
    .join(", ");
  return `${label}=${formatted}`;
}

function assertOverlayReady(summary, overlayPath, summaryPath = "") {
  if (!summary) {
    throw new Error(
      [
        "runtime overlay summary is missing",
        summaryPath ? `summaryPath=${summaryPath}` : "",
        "run pfx_runtime_overlay_rebuild.js with --input <pfx_runtime_dump.jsonl> --run first",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  if (!summary?.readyForSemantics) {
    throw new Error(
      [
        "runtime overlay is not ready for semantics",
        `targetRows=${summary?.targetRows ?? "?"}`,
        `coveredRows=${summary?.coveredRows ?? "?"}`,
        `missingRows=${summary?.missingRows ?? "?"}`,
        `shortReadRows=${summary?.shortReadRows ?? "?"}`,
        formatTargetSamples("missingSamples", summary?.missingTargetSamples),
        formatTargetSamples("shortReadSamples", summary?.shortReadTargetSamples),
      ].join(" "),
    );
  }
  if (!fs.existsSync(overlayPath)) throw new Error(`missing overlay file: ${overlayPath}`);
}

function rebuildFromRuntimeOverlay({
  inputPath = defaultInputPath,
  targetsPath = defaultTargetsPath,
  overlayPath = defaultOverlayPath,
  overlaySummaryPath = defaultOverlaySummaryPath,
  overlayCoveragePath = defaultOverlayCoveragePath,
  dryRun = false,
  skipImport = false,
  validateOnly = false,
} = {}) {
  let summary = null;
  if (!skipImport) {
    if (!inputPath) throw new Error("missing --input <frida-jsonl-or-overlay-json>; use --skip-import only with an existing ready overlay summary");
    if (dryRun) {
      console.log(
        commandLine("node", [
          "extracted/tools/pfx_runtime_overlay_import.js",
          "--input",
          inputPath,
          "--targets",
          targetsPath,
          "--overlay-out",
          overlayPath,
          "--json-out",
          overlaySummaryPath,
          "--tsv-out",
          overlayCoveragePath,
          "--strict",
        ]),
      );
    } else {
      summary = importRuntimeOverlay({
        inputPath,
        targetsPath,
        overlayOut: overlayPath,
        jsonOut: overlaySummaryPath,
        tsvOut: overlayCoveragePath,
      });
      console.log(JSON.stringify(summary, null, 2));
      assertOverlayReady(summary, overlayPath, overlaySummaryPath);
    }
  } else {
    summary = readOverlaySummary(overlaySummaryPath);
    if (!dryRun) assertOverlayReady(summary, overlayPath, overlaySummaryPath);
  }

  if (validateOnly) return summary;

  const commands = [
    [
      "node",
      [
        "extracted/tools/native_particle_callback_semantics.js",
        "--virtual-memory-overlays",
        overlayPath,
      ],
    ],
    ["node", ["extracted/tools/pfx_resource_manifest.js"]],
    ["node", ["extracted/tools/effect_runtime_gap_report.js"]],
    ["node", ["extracted/tools/pfx_encrypted_runtime_targets.js"]],
  ];

  for (const [command, args] of commands) runCommand(command, args, { dryRun });
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    const summary = rebuildFromRuntimeOverlay({
      inputPath: optionValue(args, "--input", defaultInputPath),
      targetsPath: optionValue(args, "--targets", defaultTargetsPath),
      overlayPath: optionValue(args, "--overlay", defaultOverlayPath),
      overlaySummaryPath: optionValue(args, "--overlay-summary", defaultOverlaySummaryPath),
      overlayCoveragePath: optionValue(args, "--overlay-coverage", defaultOverlayCoveragePath),
      dryRun: !hasFlag(args, "--run") || hasFlag(args, "--dry-run"),
      skipImport: hasFlag(args, "--skip-import"),
      validateOnly: hasFlag(args, "--validate-only"),
    });
    if (summary && !hasFlag(args, "--dry-run")) {
      console.log(
        JSON.stringify(
          {
            readyForSemantics: summary.readyForSemantics,
            coveredRows: summary.coveredRows,
            targetRows: summary.targetRows,
          },
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  rebuildFromRuntimeOverlay,
};
