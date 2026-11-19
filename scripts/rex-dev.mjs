import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectDir = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
function rex(...args) {
  return JSON.parse(execFileSync("rex", args, { encoding: "utf8" }));
}

try {
  const sessions = rex("ls", "--json").sessions.filter(
    (session) => session.label === "fontzie",
  );
  let running;
  for (const session of sessions) {
    const { blocks } = rex("block", "ls", "-s", session.session_id, "--json");
    for (const block of blocks) {
      if (block.flavor !== "com.superlogical.terminal.shell") continue;
      const process = rex(
        "block",
        "call",
        "-s",
        session.session_id,
        "-b",
        block.block_id,
        "process",
      );
      if (
        [process.child, process.foreground].some(
          (child) =>
            child?.cwd &&
            child.argv0 === "npm run dev" &&
            realpathSync(child.cwd) === projectDir,
        )
      ) {
        running = { session_id: session.session_id, block_id: block.block_id };
        break;
      }
    }
    if (running) break;
  }
  if (running) {
    console.log("Reusing the running Fontzie dev server:");
    console.log(JSON.stringify(running, null, 2));
  } else {
    if (sessions.length > 1)
      throw Error(
        "More than one Fontzie session exists. Rename the unused session before starting dev.",
      );
    const created = sessions.length
      ? rex(
          "window",
          "new",
          "-s",
          sessions[0].session_id,
          "Dev",
          "-c",
          projectDir,
          "--focus=false",
          "--keep-open",
          "--json",
          "--",
          "npm",
          "run",
          "dev",
        )
      : rex(
          "new",
          "fontzie",
          "-c",
          projectDir,
          "--window",
          "Dev",
          "--keep-open",
          "--json",
          "--",
          "npm",
          "run",
          "dev",
        );
    console.log("Started Fontzie dev in Rex:");
    console.log(JSON.stringify(created, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
