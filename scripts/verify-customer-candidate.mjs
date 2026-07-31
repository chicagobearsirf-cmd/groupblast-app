import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail("Invalid arguments.");
    values[key.slice(2)] = value;
  }
  return values;
}

function findFiles(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...findFiles(path));
    else if (entry.isFile()) result.push(path);
    else fail(`Unsupported artifact entry: ${path}`);
  }
  return result;
}

function digest(path, algorithm, encoding) {
  return createHash(algorithm).update(readFileSync(path)).digest(encoding);
}

function parseUpdaterFiles(text) {
  const lines = text.split(/\r?\n/);
  const files = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*-\s+url:\s+(.+?)\s*$/);
    if (!match) continue;
    const sha = lines[index + 1]?.match(/^\s+sha512:\s+(.+?)\s*$/)?.[1];
    const size = Number(lines[index + 2]?.match(/^\s+size:\s+(\d+)\s*$/)?.[1]);
    if (!sha || !Number.isSafeInteger(size)) {
      fail(`Malformed updater entry for ${match[1]}.`);
    }
    files.push({ name: match[1], sha512: sha, size });
  }
  return files;
}

const args = parseArgs(process.argv.slice(2));
const required = [
  "root",
  "platform",
  "version",
  "source-sha",
  "primary-name",
  "primary-sha256",
  "candidate-repo",
  "output",
];
for (const key of required) {
  if (!args[key]) fail(`Missing --${key}.`);
}
if (!["windows", "mac"].includes(args.platform)) fail("Invalid platform.");
if (!/^\d+\.\d+\.\d+$/.test(args.version)) fail("Invalid version.");
if (!/^[0-9a-f]{40}$/.test(args["source-sha"])) fail("Invalid source SHA.");
if (!/^[0-9a-f]{64}$/.test(args["primary-sha256"])) {
  fail("Invalid primary SHA-256.");
}

const root = resolve(args.root);
const allFiles = findFiles(root);
const provenanceFiles = allFiles.filter(
  (path) => basename(path) === "CUSTOMER-CANDIDATE-PROVENANCE.json",
);
if (provenanceFiles.length !== 1) {
  fail(`Expected one provenance record, found ${provenanceFiles.length}.`);
}

const provenance = JSON.parse(readFileSync(provenanceFiles[0], "utf8"));
const expectedKind =
  args.platform === "windows"
    ? "windows-production-channel-private-candidate"
    : "mac-production-channel-private-candidate";
if (
  provenance.artifact_kind !== expectedKind ||
  provenance.candidate_repository !== args["candidate-repo"] ||
  provenance.source_sha !== args["source-sha"] ||
  provenance.version !== args.version ||
  provenance.channel !== "stable" ||
  provenance.public_release !== false
) {
  fail(`${args.platform} provenance identity or channel is invalid.`);
}
if (
  args.platform === "windows" &&
  provenance.installer_signature_status !== "NotSigned"
) {
  fail("Windows provenance must candidly record the unsigned installer.");
}

const expectedCount = args.platform === "windows" ? 3 : 5;
if (!Array.isArray(provenance.artifacts) || provenance.artifacts.length !== expectedCount) {
  fail(`${args.platform} provenance must list exactly ${expectedCount} artifacts.`);
}

const expectedArtifactNames = new Set(
  provenance.artifacts.map((artifact) => artifact.name),
);
const payloadFiles = allFiles.filter((path) =>
  expectedArtifactNames.has(basename(path)),
);
if (payloadFiles.length !== expectedCount) {
  fail(
    `${args.platform} artifact contains ${payloadFiles.length} payload files, expected ${expectedCount}.`,
  );
}

const candidateMetadataFiles = allFiles.filter((path) => {
  const name = basename(path);
  return (
    name !== "CUSTOMER-CANDIDATE-PROVENANCE.json" &&
    !expectedArtifactNames.has(name)
  );
});
if (args.platform === "windows") {
  if (
    candidateMetadataFiles.length !== 1 ||
    basename(candidateMetadataFiles[0]) !== "package.json"
  ) {
    fail("Windows candidate must contain only the exact package.json build metadata extra.");
  }
  const packageMetadata = JSON.parse(
    readFileSync(candidateMetadataFiles[0], "utf8"),
  );
  if (
    packageMetadata.name !== "groupblast" ||
    packageMetadata.version !== args.version ||
    packageMetadata.private !== true
  ) {
    fail("Windows package.json build metadata identity is invalid.");
  }
} else if (candidateMetadataFiles.length !== 0) {
  fail("Mac candidate contains unexpected non-customer metadata files.");
}

const fileByName = new Map();
for (const path of payloadFiles) {
  const name = basename(path);
  if (fileByName.has(name)) fail(`Duplicate artifact name: ${name}.`);
  fileByName.set(name, path);
}

const artifacts = [];
for (const expected of provenance.artifacts) {
  if (
    typeof expected.name !== "string" ||
    basename(expected.name) !== expected.name ||
    !Number.isSafeInteger(expected.size_bytes) ||
    !/^[0-9a-f]{64}$/.test(expected.sha256)
  ) {
    fail(`Unsafe or malformed ${args.platform} provenance entry.`);
  }
  const path = fileByName.get(expected.name);
  if (!path || !existsSync(path)) fail(`Missing artifact ${expected.name}.`);
  const actualSize = statSync(path).size;
  const actualSha256 = digest(path, "sha256", "hex");
  if (actualSize !== expected.size_bytes || actualSha256 !== expected.sha256) {
    fail(`Artifact bytes do not match provenance: ${expected.name}.`);
  }
  artifacts.push({
    name: expected.name,
    path,
    sizeBytes: actualSize,
    sha256: actualSha256,
    sha512: digest(path, "sha512", "base64"),
  });
}

const primary = artifacts.find((artifact) => artifact.name === args["primary-name"]);
if (!primary || primary.sha256 !== args["primary-sha256"]) {
  fail(`${args.platform} primary artifact does not match founder approval.`);
}

const metadataName = args.platform === "windows" ? "latest.yml" : "latest-mac.yml";
const metadata = artifacts.find((artifact) => artifact.name === metadataName);
if (!metadata) fail(`Missing ${metadataName}.`);
const metadataText = readFileSync(metadata.path, "utf8");
const version = metadataText.match(/^version:\s+(.+?)\s*$/m)?.[1];
if (version !== args.version) fail(`${metadataName} version mismatch.`);

const updaterFiles = parseUpdaterFiles(metadataText);
const expectedUpdaterNames =
  args.platform === "windows"
    ? [`GroupBlast-Setup-${args.version}.exe`]
    : [
        `GroupBlast-${args.version}-universal-mac.zip`,
        `GroupBlast-${args.version}-universal.dmg`,
      ];
if (
  updaterFiles.length !== expectedUpdaterNames.length ||
  updaterFiles.some((entry, index) => entry.name !== expectedUpdaterNames[index])
) {
  fail(`${metadataName} updater payload set is not exact.`);
}
for (const entry of updaterFiles) {
  const artifact = artifacts.find((item) => item.name === entry.name);
  if (
    !artifact ||
    entry.size !== artifact.sizeBytes ||
    entry.sha512 !== artifact.sha512
  ) {
    fail(`${metadataName} does not bind exact bytes for ${entry.name}.`);
  }
}

const topPath = metadataText.match(/^path:\s+(.+?)\s*$/m)?.[1];
const topSha512 = metadataText.match(/^sha512:\s+(.+?)\s*$/m)?.[1];
const expectedTopPath = expectedUpdaterNames[0];
const topArtifact = artifacts.find((artifact) => artifact.name === expectedTopPath);
if (
  topPath !== expectedTopPath ||
  !topArtifact ||
  topSha512 !== topArtifact.sha512
) {
  fail(`${metadataName} top-level updater payload is invalid.`);
}

const receipt = {
  schemaVersion: 1,
  verifiedAt: new Date().toISOString(),
  platform: args.platform,
  version: args.version,
  sourceSha: args["source-sha"],
  candidateRepository: args["candidate-repo"],
  channel: "stable",
  artifacts: artifacts
    .map(({ name, sizeBytes, sha256 }) => ({ name, sizeBytes, sha256 }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  artifactPaths: artifacts.map(({ path }) => path).sort(),
  primaryArtifact: {
    name: primary.name,
    sizeBytes: primary.sizeBytes,
    sha256: primary.sha256,
  },
  updaterMetadata: {
    name: metadataName,
    payloads: updaterFiles.map((entry) => ({
      name: entry.name,
      sizeBytes: entry.size,
      sha512: entry.sha512,
    })),
  },
};
writeFileSync(args.output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(
  `${args.platform} private candidate verified: ${artifacts.length} exact artifacts.`,
);
