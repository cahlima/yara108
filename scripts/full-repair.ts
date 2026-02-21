import {
  writeBatch,
  doc,
  collection,
  getDocs,
  query,
  where,
  deleteField,
  Timestamp,
  DocumentData,
  SetOptions,
} from 'firebase/firestore';
import { db } from '../src/lib/firebase'; // Assuming you have a file that exports the db instance

/**
 * Parses a string value into a number, handling BRL currency format.
 * @param value The value to parse.
 * @returns The parsed number, or 0 if invalid.
 */
const parseSafeNumber = (value: any): number => {
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }
  if (typeof value === 'string') {
    const cleanedValue = value.replace(/\./g, '').replace(',', '.');
    const number = parseFloat(cleanedValue);
    return isNaN(number) ? 0 : number;
  }
  return 0;
};

/**
 * Represents the final, clean state of an invoice.
 */
interface InvoiceState {
  id: string;
  ownerId: string;
  customerId: string;
  customerName: string;
  month: string;
  total: number;
  paidTotal: number;
  openTotal: number;
  status: 'open' | 'paid' | 'partially_paid' | 'canceled';
  createdAt: Timestamp;
  consumptionRecordIds: Set<string>;
  isNew: boolean;
}

/**
 * Runs a deep and complete backfill and repair process for all invoices and consumption records.
 * - Normalizes `consumption_records` fields.
 * - Recalculates `invoices.total` from consumption data.
 * - Creates missing invoices.
 * - Corrects `openTotal` and `status` for all invoices.
 * This function is idempotent and safe to run multiple times.
 * 
 * @param ownerId The user ID to run the repair for.
 */
export const runFullDataRepair = async (ownerId: string) => {
  console.log(`🚀 Iniciando reparo profundo de dados para o ownerId: ${ownerId}`);
  const batchLimit = 400; // Keep it under 500 to be safe
  let batch = writeBatch(db);
  let writeCount = 0;

  // --- Step 1: Process all consumption records and aggregate invoice data ---
  
  console.log("1/4: Processando registros de consumo...");
  const consumptionSnap = await getDocs(query(collection(db, 'consumption_records'), where('ownerId', '==', ownerId)));
  const invoicesState = new Map<string, InvoiceState>();
  let consumptionUpdates = 0;

  for (const rec of consumptionSnap.docs) {
    const data = rec.data();
    const updates: DocumentData = {};

    // Normalize basic fields
    if (data.customer_id) { updates.customerId = data.customer_id; updates.customer_id = deleteField(); }
    if (data.customer_name) { updates.customerName = data.customer_name; updates.customer_name = deleteField(); }
    if (!data.date || !(data.date instanceof Timestamp)) { updates.date = data.createdAt || Timestamp.now(); }
    
    const recordDate = (updates.date || data.date).toDate();
    const month = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
    if (data.month !== month) { updates.month = month; }

    const subtotal = parseSafeNumber(data.subtotal);
    if (data.subtotal !== subtotal) { updates.subtotal = subtotal; }

    const customerId = data.customerId || data.customer_id;
    
    // For records to be invoiced, ensure they have an invoiceId and aggregate their value
    if (data.payLater && customerId) {
      const invoiceId = data.invoiceId || `${ownerId}_${customerId}_${month}`;
      if (!data.invoiceId) { updates.invoiceId = invoiceId; }
      
      if (!invoicesState.has(invoiceId)) {
        invoicesState.set(invoiceId, {
          id: invoiceId,
          ownerId,
          customerId,
          customerName: data.customerName || data.customer_name || 'N/A',
          month,
          total: 0,
          paidTotal: 0,
          openTotal: 0,
          status: 'open',
          createdAt: Timestamp.now(),
          consumptionRecordIds: new Set<string>(),
          isNew: true, // Assume it's new until we check existing invoices
        });
      }

      const state = invoicesState.get(invoiceId)!;
      state.total += subtotal;
      state.consumptionRecordIds.add(rec.id);
    }

    if (Object.keys(updates).length > 0) {
      batch.update(doc(db, 'consumption_records', rec.id), updates);
      writeCount++;
      consumptionUpdates++;
    }

    if (writeCount >= batchLimit) {
      await batch.commit();
      batch = writeBatch(db);
      writeCount = 0;
    }
  }
  console.log(`   -> ${consumptionUpdates} registros de consumo normalizados.`);

  // --- Step 2: Process existing invoices to get paidTotal and merge with new state ---

  console.log("2/4: Processando faturas existentes...");
  const invoicesSnap = await getDocs(query(collection(db, 'invoices'), where('ownerId', '==', ownerId)));
  
  for (const inv of invoicesSnap.docs) {
    const data = inv.data();
    const state = invoicesState.get(inv.id);

    // If we have state for this invoice, it means it's linked to consumption records.
    // We use its existing paidTotal and mark it as not new.
    if (state) {
      state.paidTotal = parseSafeNumber(data.paidTotal || data.paid_total);
      state.createdAt = data.createdAt || data.date || state.createdAt;
      state.isNew = false;
    } 
    // If there's no state, this invoice might be old, empty, or have a different issue.
    // We'll just normalize its own values.
    else {
      const updates: DocumentData = {};
      const total = parseSafeNumber(data.total || data.total_value);
      const paidTotal = parseSafeNumber(data.paidTotal || data.paid_total);
      const openTotal = Math.max(0, total - paidTotal);

      if (data.total !== total) updates.total = total;
      if (data.paidTotal !== paidTotal) updates.paidTotal = paidTotal;
      if (data.openTotal !== openTotal) updates.openTotal = openTotal;
      if (data.total_value) updates.total_value = deleteField();
      if (data.paid_total) updates.paid_total = deleteField();
      
      const currentStatus = data.status?.toLowerCase();
      let newStatus = currentStatus;
      if (currentStatus === 'cancelado' || currentStatus === 'cancelled') {
        newStatus = 'canceled';
      } else if (openTotal <= 0 && total > 0) {
        newStatus = 'paid';
      } else if (openTotal > 0 && openTotal < total) {
        newStatus = 'partially_paid';
      } else if (total > 0) {
        newStatus = 'open';
      }

      if (newStatus !== currentStatus) {
        updates.status = newStatus;
      }

      if (Object.keys(updates).length > 0) {
        batch.update(doc(db, 'invoices', inv.id), updates);
        writeCount++;
        if (writeCount >= batchLimit) {
          await batch.commit();
          batch = writeBatch(db);
          writeCount = 0;
        }
      }
    }
  }
  console.log(`   -> ${invoicesSnap.size} faturas existentes analisadas.`);

  // --- Step 3: Recalculate totals and statuses for all aggregated invoices and commit ---

  console.log("3/4: Recalculando totais e status das faturas...");
  let invoicesUpdated = 0;
  let invoicesCreated = 0;

  for (const state of invoicesState.values()) {
    state.openTotal = Math.max(0, state.total - state.paidTotal);

    if (state.status !== 'canceled') { // Don't override a canceled status
        if (state.openTotal <= 0 && state.total > 0) {
            state.status = 'paid';
        } else if (state.openTotal > 0 && state.openTotal < state.total) {
            state.status = 'partially_paid';
        } else if (state.total > 0) {
            state.status = 'open';
        }
    }

    const finalInvoiceData = {
      ownerId: state.ownerId,
      customerId: state.customerId,
      customerName: state.customerName,
      month: state.month,
      total: state.total,
      paidTotal: state.paidTotal,
      openTotal: state.openTotal,
      status: state.status,
      createdAt: state.createdAt,
      updatedAt: Timestamp.now(),
    };

    const options: SetOptions = state.isNew ? {} : { merge: true };
    batch.set(doc(db, 'invoices', state.id), finalInvoiceData, options);
    
    if (state.isNew) invoicesCreated++; else invoicesUpdated++;
    writeCount++;

    if (writeCount >= batchLimit) {
      await batch.commit();
      batch = writeBatch(db);
      writeCount = 0;
    }
  }
  console.log(`   -> ${invoicesCreated} faturas criadas, ${invoicesUpdated} faturas recalculadas.`);
  
  // --- Step 4: Final commit ---
  if (writeCount > 0) {
    await batch.commit();
  }

  console.log("✅ Sistema Yara108 sincronizado e limpo.");
  console.log("--- Resumo ---");
  console.log(`- Registros de Consumo Atualizados: ${consumptionUpdates}`);
  console.log(`- Faturas Novas Criadas: ${invoicesCreated}`);
  console.log(`- Faturas Existentes Recalculadas/Atualizadas: ${invoicesUpdated}`);
  console.log("----------------");
};

// Exemplo de como chamar (descomente em um ambiente apropriado):
//
// import { getAuth } from 'firebase/auth';
//
// const auth = getAuth();
// auth.onAuthStateChanged(user => {
//   if (user && user.uid) {
//     console.log("Usuário autenticado, iniciando reparo...");
//     runFullDataRepair(user.uid).catch(console.error);
//   }
// });
