import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

export async function prepareTimelessData(directory) {
  const entries = await readdir(directory);
  const tableNames = new Set(entries.flatMap((entry) => {
    const match = entry.match(/^(.*)\.zip(?:\.part\d+)?$/);
    return match ? [match[1]] : [];
  }));

  for (const tableName of tableNames) {
    const singleFile = `${tableName}.zip`;
    const partPattern = new RegExp(`^${tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.zip\\.part(\\d+)$`);
    const partFiles = entries
      .map((entry) => ({ entry, part: Number(entry.match(partPattern)?.[1]) }))
      .filter(({ part }) => Number.isInteger(part))
      .sort((left, right) => left.part - right.part)
      .map(({ entry }) => entry);
    const sourceFiles = entries.includes(singleFile) ? [singleFile] : partFiles;
    if (!sourceFiles.length) continue;
    const compressed = Buffer.concat(await Promise.all(sourceFiles.map((file) => readFile(join(directory, file)))));
    await writeFile(join(directory, `${tableName}.bin`), inflateSync(compressed));
  }
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) await prepareTimelessData(process.argv[2]);
