import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const PROJECT_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_BUNDLE_PATH = "/private/tmp/blupix-index.js";
const OUTPUT_ROOT = path.join(PROJECT_ROOT, "assets", "evolution");
const OUTPUT_DATA_FILE = path.join(PROJECT_ROOT, "src", "blupets-canon-data.js");

const COLOR_ID_BY_LABEL = Object.freeze({
  Black: "black",
  Blue: "blue",
  Cyan: "cyan",
  Green: "green",
  Purple: "purple",
  Red: "red",
  White: "white",
  Yellow: "yellow",
});

function extractExpression(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Missing marker: ${startMarker}`);
  }

  const bodyStart = start + startMarker.length;
  const end = source.indexOf(endMarker, bodyStart);
  if (end < 0) {
    throw new Error(`Missing end marker: ${endMarker}`);
  }

  return source.slice(bodyStart, end);
}

function extractJsonParse(name, source) {
  const marker = `${name}=JSON.parse('`;
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`Missing JSON marker for ${name}`);
  }

  const jsonStart = start + marker.length;
  const jsonEnd = source.indexOf("')", jsonStart);
  if (jsonEnd < 0) {
    throw new Error(`Missing JSON terminator for ${name}`);
  }

  return JSON.parse(source.slice(jsonStart, jsonEnd));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeKey(value) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function decodePackedRecord(record) {
  const bytes = Buffer.from(record.data.slice(2), "hex");
  const mode = bytes[0];
  const paletteLength = bytes[1];
  const paletteOffset = 2;
  const pixelOffset = paletteOffset + paletteLength * 3;
  const palette = [];

  for (let index = 0; index < paletteLength; index += 1) {
    const byteIndex = paletteOffset + index * 3;
    const hex = bytes.slice(byteIndex, byteIndex + 3).toString("hex");
    palette.push(`#${hex}`);
  }

  const pixelBytes = bytes.slice(pixelOffset);
  const pixels = [];

  if (mode === 4) {
    for (const byte of pixelBytes) {
      pixels.push(byte >> 4, byte & 0x0f);
    }
  } else if (mode === 8) {
    for (const byte of pixelBytes) {
      pixels.push(byte);
    }
  } else {
    throw new Error(`Unsupported mode ${mode} for ${record.key}`);
  }

  const size = Math.sqrt(pixels.length);
  if (!Number.isInteger(size)) {
    throw new Error(`Unexpected pixel count ${pixels.length} for ${record.key}`);
  }

  const commandsByColor = new Map();
  for (let index = 0; index < pixels.length; index += 1) {
    const paletteIndex = pixels[index];
    if (paletteIndex === 0) {
      continue;
    }

    const color = palette[paletteIndex - 1];
    if (!color) {
      throw new Error(`Palette index ${paletteIndex} out of bounds for ${record.key}`);
    }

    const x = index % size;
    const y = Math.floor(index / size);
    const command = `M${x} ${y}h1v1H${x}z`;
    const existing = commandsByColor.get(color);
    commandsByColor.set(color, existing ? `${existing}${command}` : command);
  }

  const paths = [...commandsByColor.entries()]
    .map(([color, commands]) => `<path fill="${color}" d="${commands}"/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${paths}</svg>\n`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sortForms(left, right) {
  return left.index - right.index;
}

function main() {
  const bundlePath = process.argv[2] || DEFAULT_BUNDLE_PATH;
  const bundleSource = fs.readFileSync(bundlePath, "utf8");

  const familyLiteral = extractExpression(bundleSource, "mB=", ",yB={families:mB}");
  const families = vm.runInNewContext(`(${familyLiteral})`, {});
  const lineageSteps = extractJsonParse("FB", bundleSource);
  const packedRecords = extractJsonParse("wB", bundleSource);

  const lineages = [];
  for (const step of lineageSteps) {
    if (step.method !== "setLineage") {
      continue;
    }

    const [index, name, key] = step.args;
    lineages[index] = { index, name, key, forms: { 2: [], 3: [], 4: [] } };
  }

  for (const step of lineageSteps) {
    if (step.method !== "setForm") {
      continue;
    }

    const [tier, lineageIndex, formIndex, name, key] = step.args;
    const lineage = lineages[lineageIndex];
    if (!lineage) {
      continue;
    }

    lineage.forms[tier].push({ index: formIndex, name, key, tier });
  }

  const lineageByKey = new Map(
    lineages.map((lineage) => [normalizeKey(lineage.key || lineage.name), lineage]),
  );

  const packedByKey = new Map(packedRecords.map((record) => [record.key, record]));
  ensureDir(OUTPUT_ROOT);

  const exportFamilies = families.map((family) => {
    const lineage = lineageByKey.get(normalizeKey(family.name));
    if (!lineage) {
      throw new Error(`Lineage not found for family ${family.name}`);
    }

    const pair = family.pair.map((label) => {
      const colorId = COLOR_ID_BY_LABEL[label];
      if (!colorId) {
        throw new Error(`Unsupported color label ${label}`);
      }

      return colorId;
    });

    const exportForms = {};
    for (const tier of [2, 3, 4]) {
      const tierForms = [...lineage.forms[tier]].sort(sortForms);
      const tierDir = path.join(OUTPUT_ROOT, family.id, `t${tier}`);
      ensureDir(tierDir);

      exportForms[tier] = tierForms.map((form) => {
        const record = packedByKey.get(form.key);
        if (!record) {
          throw new Error(`Packed sprite not found for ${form.key}`);
        }

        const filename = `${String(form.index).padStart(2, "0")}-${slugify(form.name)}.svg`;
        const outputPath = path.join(tierDir, filename);
        fs.writeFileSync(outputPath, decodePackedRecord(record));

        return {
          index: form.index,
          key: form.key,
          name: form.name,
          asset: `./assets/evolution/${family.id}/t${tier}/${filename}`,
        };
      });
    }

    return {
      id: family.id,
      key: normalizeKey(lineage.key || family.name),
      name: family.name,
      color: family.color,
      pair,
      forms: exportForms,
    };
  });

  const fileContents = `export const BLUPETS_FAMILIES = ${JSON.stringify(exportFamilies, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_DATA_FILE, fileContents);

  console.log(
    `Generated ${exportFamilies.length} families and ${packedRecords.length} packed records from ${bundlePath}.`,
  );
}

main();
