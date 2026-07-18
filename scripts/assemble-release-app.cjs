const asar = require("@electron/asar");
const fs = require("node:fs/promises");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const VIEWER_SOURCE_DIR = path.join(PROJECT_ROOT, "extracted", "viewer");
const RELEASE_REWRITES = [
  [
    "../hero_assets_material_textures_preview/Characters/Hero023/Art/hero023_drow.drow_bowAlpha_mat.sampler-sampler84.png",
    "../shared_glb_textures/ba/ba0f08d7a674b1c73d157dac1eaee57df114c0339243971b9c991881c05b0a41.png",
  ],
];

function readArguments(argv) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--consume-base") {
      flags.add(argument);
      continue;
    }
    const value = argv[index + 1];
    if (!argument.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Invalid argument: ${argument}`);
    }
    values.set(argument, value);
    index += 1;
  }

  const baseAsar = values.get("--base-asar");
  const output = values.get("--output");
  if (!baseAsar || !output) {
    throw new Error("Usage: assemble-release-app.cjs --base-asar <path> --output <path> [--consume-base]");
  }
  return {
    baseAsar: path.resolve(baseAsar),
    consumeBase: flags.has("--consume-base"),
    output: path.resolve(output),
  };
}

async function runtimeSourceFiles() {
  const viewerEntries = await fs.readdir(VIEWER_SOURCE_DIR, { withFileTypes: true });
  const viewerFiles = viewerEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.posix.join("extracted", "viewer", entry.name));
  return [
    "electron/main.cjs",
    "package.json",
    "extracted/viewer/index.html",
    "extracted/viewer/styles.css",
    "extracted/viewer/README.md",
    ...viewerFiles,
  ];
}

function applyReleaseRewrites(source) {
  return RELEASE_REWRITES.reduce((result, [from, to]) => {
    const occurrences = result.split(from).length - 1;
    if (occurrences !== 1) {
      throw new Error(`Expected one release rewrite match for: ${from}; found ${occurrences}`);
    }
    return result.replace(from, to);
  }, source);
}

async function overlayRuntimeSources(stagingDirectory) {
  const expectedContents = new Map();
  for (const relativePath of await runtimeSourceFiles()) {
    const sourcePath = path.join(PROJECT_ROOT, relativePath);
    const destinationPath = path.join(stagingDirectory, relativePath);
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });

    let contents = await fs.readFile(sourcePath);
    if (relativePath === "extracted/viewer/app.js") {
      contents = Buffer.from(applyReleaseRewrites(contents.toString("utf8")));
    }
    await fs.writeFile(destinationPath, contents);
    expectedContents.set(relativePath, contents);
  }
  return expectedContents;
}

async function verifyPackage(output, expectedContents) {
  for (const [relativePath, expected] of expectedContents) {
    const archivePath = relativePath.split(path.sep).join(path.posix.sep);
    const actual = asar.extractFile(output, archivePath);
    if (!actual.equals(expected)) {
      throw new Error(`Packaged source differs from Git checkout: ${relativePath}`);
    }
  }
}

async function main() {
  const { baseAsar, consumeBase, output } = readArguments(process.argv.slice(2));
  const stagingDirectory = path.join(path.dirname(baseAsar), `release-app-${process.pid}`);

  await fs.rm(stagingDirectory, { force: true, recursive: true });
  await fs.mkdir(stagingDirectory, { recursive: true });
  try {
    asar.extractAll(baseAsar, stagingDirectory);
    const expectedContents = await overlayRuntimeSources(stagingDirectory);
    if (consumeBase) await fs.rm(baseAsar, { force: true });
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.rm(output, { force: true });
    await asar.createPackage(stagingDirectory, output);
    await verifyPackage(output, expectedContents);
    const outputSize = (await fs.stat(output)).size;
    console.log(`Assembled ${output} from current Git sources (${outputSize} bytes)`);
  } catch (error) {
    await fs.rm(output, { force: true });
    throw error;
  } finally {
    await fs.rm(stagingDirectory, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
