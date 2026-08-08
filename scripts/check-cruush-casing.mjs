import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const productName = /\bcruush\b/gi;
const errors = [];

for (const relativePath of files) {
  if (relativePath === "scripts/check-lowercase-cruush.mjs") {
    continue;
  }

  const absolutePath = path.join(root, relativePath);

  if (!existsSync(absolutePath)) {
    continue;
  }

  const contents = readFileSync(absolutePath);

  if (contents.includes(0)) {
    continue;
  }

  const text = contents.toString("utf8");

  for (const match of text.matchAll(productName)) {
    if (text.slice(match.index, match.index + "CRUUSH-RULES".length) === "CRUUSH-RULES") {
      continue;
    }

    if (match[0] === "cruush") {
      continue;
    }

    const line = text.slice(0, match.index).split("\n").length;
    errors.push(`${relativePath}:${line}: product name must use lowercase spelling`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("product-name check passed");
