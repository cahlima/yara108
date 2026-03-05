import util from "node:util";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.on("uncaughtException", (err) => {
  console.error("❌ uncaughtException:");
  console.error(util.inspect(err, { depth: 10, colors: true }));
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ unhandledRejection:");
  console.error(util.inspect(reason, { depth: 10, colors: true }));
  if (reason?.stack) console.error(reason.stack);
  process.exit(1);
});

try {
  // Resolve o caminho do full-repair.ts relativo a ESTE arquivo (.mjs),
  // não ao diretório atual (cwd), evitando erros de resolução.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const fullRepairPath = path.resolve(__dirname, "full-repair.ts");
  const fullRepairUrl = pathToFileURL(fullRepairPath).href;

  await import(fullRepairUrl);

  console.log("✅ full-repair.ts finalizou sem crash.");
} catch (e) {
  console.error("❌ erro ao importar/executar full-repair.ts:");
  console.error(util.inspect(e, { depth: 10, colors: true }));
  if (e?.stack) console.error(e.stack);
  process.exit(1);
}