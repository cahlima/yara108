 /**
 * scripts/full-repair.ts
 * Reparo profundo (Admin SDK) - idempotente.
 *
 * Rodar:
 *   npx tsx scripts/full-repair.ts <OWNER_ID>
 */

import admin from "firebase-admin";
import { db, FieldValue } from "./firebaseAdmin";

type InvoiceStatus = "open" | "paid" | "partially_paid" | "canceled";

const nowTs = () => admin.firestore.Timestamp.now();

const parseSafeNumber = (value: any): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    // aceita "1.234,56" e "1234.56" e "R$ 1.234,56"
    const cleaned = value
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "") // remove pontos de milhar
      .replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const monthFromTimestamp = (ts: admin.firestore.Timestamp) => {
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

interface InvoiceState {
  id: string;
  ownerId: string;
  customerId: string;
  customerName: string;
  month: string;
  total: number;
  paidTotal: number;
  openTotal: number;
  status: InvoiceStatus;
  createdAt: admin.firestore.Timestamp;
  isNew: boolean;
}

const calcStatus = (total: number, paidTotal: number, current?: any): InvoiceStatus => {
  const currentLc = typeof current === "string" ? current.toLowerCase() : "";

  // preserva cancelado (pt/en)
  if (currentLc === "cancelado" || currentLc === "cancelled" || currentLc === "canceled") return "canceled";

  const openTotal = Math.max(0, total - paidTotal);

  if (total > 0 && openTotal <= 0) return "paid";
  if (total > 0 && openTotal > 0 && openTotal < total) return "partially_paid";
  if (total > 0) return "open";
  return "open";
};

async function main() {
  const ownerId = process.argv[2];
  if (!ownerId) {
    console.error("Uso: npx tsx scripts/full-repair.ts <OWNER_ID>");
    process.exit(1);
  }

  console.log(`🚀 FULL REPAIR (Admin) | ownerId=${ownerId}`);

  const BATCH_LIMIT = 450;
  let batch = db.batch();
  let writes = 0;

  const flush = async () => {
    if (writes > 0) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  };

  // ------------------------------------------------------------
  // 1) Ler consumption_records, normalizar e agregar por invoice
  // ------------------------------------------------------------
  console.log("1/3: Processando consumption_records...");
  const consSnap = await db
    .collection("consumption_records")
    .where("ownerId", "==", ownerId)
    .get();

  const invoicesState = new Map<string, InvoiceState>();
  let consumptionUpdates = 0;

  for (const docSnap of consSnap.docs) {
    const data: any = docSnap.data();
    const ref = docSnap.ref;

    const updates: Record<string, any> = {};

    // snake_case -> camelCase
    if (data.customer_id && !data.customerId) updates.customerId = data.customer_id;
    if (data.customer_name && !data.customerName) updates.customerName = data.customer_name;
    if (data.customer_id !== undefined) updates.customer_id = FieldValue.delete();
    if (data.customer_name !== undefined) updates.customer_name = FieldValue.delete();

    // date
    let dateTs: admin.firestore.Timestamp | null = null;
    if (data.date instanceof admin.firestore.Timestamp) dateTs = data.date;
    else if (data.createdAt instanceof admin.firestore.Timestamp) dateTs = data.createdAt;
    else if (data.created_at instanceof admin.firestore.Timestamp) dateTs = data.created_at;
    else dateTs = nowTs();

    if (!(data.date instanceof admin.firestore.Timestamp)) updates.date = dateTs;

    // month
    const month = monthFromTimestamp(dateTs);
    if (data.month !== month) updates.month = month;

    // subtotal normalizado
    const subtotal = parseSafeNumber(data.subtotal ?? data.sub_total ?? data.total ?? 0);
    if (data.subtotal !== subtotal) updates.subtotal = subtotal;
    if (data.sub_total !== undefined) updates.sub_total = FieldValue.delete();

    // flags
    const customerId = data.customerId ?? data.customer_id ?? "";
    const customerName = data.customerName ?? data.customer_name ?? "N/A";
    const payLater = !!data.payLater;

    // se payLater, garantir invoiceId e agregar
    if (payLater && customerId) {
      const invoiceId = data.invoiceId || `${ownerId}_${customerId}_${month}`;
      if (!data.invoiceId) updates.invoiceId = invoiceId;

      if (!invoicesState.has(invoiceId)) {
        invoicesState.set(invoiceId, {
          id: invoiceId,
          ownerId,
          customerId,
          customerName,
          month,
          total: 0,
          paidTotal: 0,
          openTotal: 0,
          status: "open",
          createdAt: nowTs(),
          isNew: true,
        });
      }
      const st = invoicesState.get(invoiceId)!;
      st.total += subtotal;
      // mantenha nome se tiver um melhor
      if (st.customerName === "N/A" && customerName && customerName !== "N/A") st.customerName = customerName;
    }

    if (Object.keys(updates).length > 0) {
      batch.update(ref, updates);
      writes++;
      consumptionUpdates++;
      if (writes >= BATCH_LIMIT) await flush();
    }
  }

  await flush();
  console.log(`   -> ${consumptionUpdates} consumption_records normalizados.`);

  // ------------------------------------------------------------
  // 2) Ler invoices existentes e mesclar paidTotal/status
  // ------------------------------------------------------------
  console.log("2/3: Processando invoices existentes...");
  const invSnap = await db.collection("invoices").where("ownerId", "==", ownerId).get();

  let invoicesNormalizedOnly = 0;

  for (const docSnap of invSnap.docs) {
    const data: any = docSnap.data();
    const ref = docSnap.ref;

    const state = invoicesState.get(docSnap.id);

    const paidTotal = parseSafeNumber(data.paidTotal ?? data.paid_total ?? 0);
    const total = parseSafeNumber(data.total ?? data.total_value ?? 0);

    if (state) {
      // invoice agregada pelos consumption_records
      state.paidTotal = paidTotal;
      state.createdAt =
        (data.createdAt instanceof admin.firestore.Timestamp && data.createdAt) ||
        (data.date instanceof admin.firestore.Timestamp && data.date) ||
        state.createdAt;
      state.isNew = false;
      // preserva cancelado
      state.status = calcStatus(state.total, state.paidTotal, data.status);
    } else {
      // invoice sem consumo agregado: só normaliza seus próprios campos
      const openTotal = Math.max(0, total - paidTotal);
      const newStatus = calcStatus(total, paidTotal, data.status);

      const updates: Record<string, any> = {};
      if (data.total !== total) updates.total = total;
      if (data.paidTotal !== paidTotal) updates.paidTotal = paidTotal;
      if (data.openTotal !== openTotal) updates.openTotal = openTotal;
      if (data.status !== newStatus) updates.status = newStatus;

      if (data.total_value !== undefined) updates.total_value = FieldValue.delete();
      if (data.paid_total !== undefined) updates.paid_total = FieldValue.delete();

      if (Object.keys(updates).length > 0) {
        batch.update(ref, updates);
        writes++;
        invoicesNormalizedOnly++;
        if (writes >= BATCH_LIMIT) await flush();
      }
    }
  }

  await flush();
  console.log(`   -> ${invSnap.size} invoices lidas; ${invoicesNormalizedOnly} normalizadas (sem consumo agregado).`);

  // ------------------------------------------------------------
  // 3) Gravar invoices agregadas (create/merge) com total correto
  // ------------------------------------------------------------
  console.log("3/3: Recalculando e gravando invoices agregadas...");
  let created = 0;
  let updated = 0;

  for (const st of invoicesState.values()) {
    st.openTotal = Math.max(0, st.total - st.paidTotal);
    // preserva cancelado (se for o caso, status já veio de calcStatus no passo 2)
    if (st.status !== "canceled") {
      st.status = calcStatus(st.total, st.paidTotal, st.status);
    }

    const invoiceRef = db.collection("invoices").doc(st.id);

    const payload = {
      ownerId: st.ownerId,
      customerId: st.customerId,
      customerName: st.customerName,
      month: st.month,
      total: st.total,
      paidTotal: st.paidTotal,
      openTotal: st.openTotal,
      status: st.status,
      createdAt: st.createdAt,
      updatedAt: nowTs(),
    };

    if (st.isNew) {
      batch.set(invoiceRef, payload); // cria
      created++;
    } else {
      batch.set(invoiceRef, payload, { merge: true }); // atualiza
      updated++;
    }

    writes++;
    if (writes >= BATCH_LIMIT) await flush();
  }

  await flush();

  console.log("✅ FULL REPAIR finalizado.");
  console.log("--- Resumo ---");
  console.log(`OwnerId: ${ownerId}`);
  console.log(`Consumption atualizados: ${consumptionUpdates}`);
  console.log(`Invoices criadas: ${created}`);
  console.log(`Invoices atualizadas (recalc): ${updated}`);
  console.log(`Invoices normalizadas (sem consumo): ${invoicesNormalizedOnly}`);
  console.log("--------------");
}

main().catch((err) => {
  console.error("❌ Erro no FULL REPAIR:", err);
  process.exit(1);
});