import util from "node:util";
import { db } from "./firebaseAdmin";

async function main() {
  const collections = ["invoices", "consumption_records"] as const;
  const owners = new Set<string>();

  for (const col of collections) {
    console.log(`🔎 Lendo ${col}...`);
    const snap = await db.collection(col).limit(200).get();

    snap.forEach((doc) => {
      const oid = doc.get("ownerId");
      if (typeof oid === "string" && oid.trim()) owners.add(oid.trim());
    });
  }

  const list = Array.from(owners);
  console.log("\n✅ ownerIds encontrados:");
  console.log(util.inspect(list, { depth: 5, colors: true }));

  if (list.length === 0) {
    console.log(
      "\n⚠️ Não achei ownerId nas coleções testadas. Se você usa outro campo (ex: userId), me diga o nome."
    );
  }
}

main().catch((e) => {
  console.error("❌ Erro:", e);
  process.exit(1);
});