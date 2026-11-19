import { createRequire, isBuiltin } from "node:module";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const seen = new Set(),
  notices = [];
async function collect(name, from = process.cwd()) {
  let dir;
  try {
    dir = path.dirname(
      createRequire(path.join(from, "package.json")).resolve(
        isBuiltin(name) ? name + "/" : name,
      ),
    );
  } catch {
    return;
  }
  while (dir !== path.dirname(dir)) {
    try {
      const pkg = JSON.parse(
        await readFile(path.join(dir, "package.json"), "utf8"),
      );
      if (pkg.name !== name) {
        dir = path.dirname(dir);
        continue;
      }
      const key = pkg.name + "@" + pkg.version;
      if (seen.has(key)) return;
      seen.add(key);
      const files = (await readdir(dir)).filter((n) =>
        /^(license|licence|copying)(\.|$)/i.test(n),
      );
      let text = "";
      for (const file of files)
        try {
          text += (await readFile(path.join(dir, file), "utf8")) + "\n";
        } catch {}
      notices.push(
        `# ${key}\nLicense: ${pkg.license ?? "See package repository"}\n${pkg.repository?.url ?? ""}\n\n${text}`,
      );
      for (const dep of Object.keys(pkg.dependencies ?? {}))
        await collect(dep, dir);
      return;
    } catch {
      dir = path.dirname(dir);
    }
  }
}
const appPackage = JSON.parse(await readFile("package.json", "utf8"));
for (const name of [
  ...Object.keys(appPackage.dependencies),
  "@fontsource-variable/inter",
  "@fontsource-variable/jetbrains-mono",
])
  await collect(name);
await mkdir("public/licenses", { recursive: true });
await writeFile(
  "public/licenses/THIRD-PARTY.txt",
  notices.join("\n\n----------------------------------------\n\n"),
);
console.log(`Packaged ${seen.size} dependency and font license notices.`);
