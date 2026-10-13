import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

// Loaded after the extension under test by the real Pi CLI. Do not invoke the
// cleanup helper or emit shutdown ourselves: Pi must own the entire lifecycle.
export default function lateShutdownWriter(pi) {
  pi.on("session_shutdown", async (event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    const existedBeforeAppend = existsSync(sessionFile);
    // Make Pi await this later handler, rather than just testing synchronous work.
    await new Promise((resolve) => setTimeout(resolve, 25));
    pi.appendEntry("late-shutdown-writer", { reason: event.reason });
    const persisted = existsSync(sessionFile)
      && readFileSync(sessionFile, "utf8").includes('"customType":"late-shutdown-writer"');
    appendFileSync(process.env.CLEANUP_TEST_TRACE, `${JSON.stringify({
      reason: event.reason, sessionFile, existedBeforeAppend, persisted,
    })}\n`);

    if (process.env.CLEANUP_TEST_FAIL_DELETE === "1" && event.reason === "quit") {
      // Deterministic real unlink failure, including when the tests run as root.
      // PATH is isolated by the parent so a trash utility cannot remove this dir.
      rmSync(sessionFile);
      mkdirSync(sessionFile);
      writeFileSync(join(sessionFile, "keep"), "force unlink to fail\n");
    }
  });
}
