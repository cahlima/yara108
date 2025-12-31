/**
 * scripts/reset-and-seed.cjs
 *
 * Uso:
 *  SEED_USER_ID="SEU_UID" node scripts/reset-and-seed.cjs
 *  FIRESTORE_DATABASE_ID="(default)" SEED_USER_ID="SEU_UID" node scripts/reset-and-seed.cjs
 *
 * Requisitos:
 *  - firebase-admin instalado (npm i firebase-admin)
 *  - Credencial Admin SDK via ADC:
 *      export GOOGLE_APPLICATION_CREDENTIALS="/path/serviceAccountKey.json"
 *    ou ambiente já autenticado (Cloud / Workstations)
 */

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
const seedUserId = process.env.SEED_USER_ID;

if (!seedUserId) {
  console.error(
    '❌ SEED_USER_ID não informado. Ex: SEED_USER_ID="abc" node scripts/reset-and-seed.cjs'
  );
  process.exit(1);
}

const app = initializeApp({ credential: applicationDefault() });
const db = getFirestore(app, databaseId);

function isoToday() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function deleteByUserId(collectionName) {
  const col = db.collection(collectionName);
  let total = 0;

  while (true) {
    const snap = await col.where("user_id", "==", seedUserId).limit(400).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    total += snap.size;
    if (snap.size < 400) break;
  }

  return total;
}

async function seed() {
  const today = isoToday();

  // 1) Customer
  const customerRef = await db.collection("customers").add({
    user_id: seedUserId,
    name: "Cliente Seed",
    phone: "41999999999",
    created_at: Timestamp.now(),
    _seed: true,
  });

  // 2) Products
  const productARef = await db.collection("products").add({
    user_id: seedUserId,
    name: "Produto Seed A",
    price: 5.0,
    active: true,
    created_at: Timestamp.now(),
    _seed: true,
  });

  const productBRef = await db.collection("products").add({
    user_id: seedUserId,
    name: "Produto Seed B",
    price: 7.5,
    active: true,
    created_at: Timestamp.now(),
    _seed: true,
  });

  // 3) Day products (date string)
  await db.collection("day_products").add({
    user_id: seedUserId,
    date: today,
    product_id: productARef.id,
    custom_price: 5.0,
    created_at: Timestamp.now(),
    _seed: true,
  });

  await db.collection("day_products").add({
    user_id: seedUserId,
    date: today,
    product_id: productBRef.id,
    custom_price: 7.5,
    created_at: Timestamp.now(),
    _seed: true,
  });

  // 4) Sales (paid=false para aparecer em Payments)
  const saleDate = Timestamp.fromDate(new Date(`${today}T12:00:00`));

  await db.collection("sales").add({
    user_id: seedUserId,
    customer_id: customerRef.id,
    product_id: productARef.id,
    quantity: 2,
    unit_price: 5.0,
    total_price: 10.0,
    date: saleDate,
    paid: false,
    payment_date: null,
    created_at: Timestamp.now(),
    _seed: true,
  });

  console.log("✅ Seed criado:");
  console.log("   customers:", customerRef.id);
  console.log("   products:", productARef.id, productBRef.id);
  console.log("   day_products: 2 docs");
  console.log("   sales: 1 doc (paid=false)");
}

(async () => {
  try {
    console.log("✅ Database:", databaseId);
    console.log("✅ SEED_USER_ID:", seedUserId);

    // Ping
    await db.collection("_debug").doc("seed_ping").set({
      ok: true,
      at: Timestamp.now(),
      databaseId,
      user_id: seedUserId,
    });

    // RESET (somente docs do user_id)
    const deleted = {
      sales: await deleteByUserId("sales"),
      day_products: await deleteByUserId("day_products"),
      products: await deleteByUserId("products"),
      customers: await deleteByUserId("customers"),
      bills: await deleteByUserId("bills"),
    };

    console.log("🧹 Reset concluído (apagou do user_id):", deleted);

    // SEED
    await seed();

    console.log("🎉 Reset + Seed concluídos.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro no reset/seed:", err);
    process.exit(1);
  }
})();
