
import { adminDb } from "./firebaseAdmin";
import { Timestamp } from 'firebase-admin/firestore';

// --- TIPOS ---
interface ConsumptionRecord {
  id: string;
  ownerId: string;
  customer_id: string;
  subtotal: number;
  payLater: boolean;
  date: string; // yyyy-MM-dd
  invoiceId?: string;
}

interface PaymentRecord {
  id: string;
  invoiceId: string;
  amount: number;
}

interface Invoice {
  id: string;
  ownerId: string;
  customerId: string;
  month: string; // yyyy-MM
  total: number;
  paidTotal: number;
  openTotal: number;
  status: "OPEN" | "PARTIAL" | "PAID";
}

interface ReconciliationResult {
  invoiceId: string;
  calculated: {
    total: number;
    paidTotal: number;
    openTotal: number;
    status: "OPEN" | "PARTIAL" | "PAID";
    consumptionCount: number;
    paymentCount: number;
  };
  existing: {
    total: number;
    paidTotal: number;
    openTotal: number;
    status: string;
  } | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "OK";
}

const reconcileOwnerData = async () => {
  // --- CONFIGURAÇÃO ---
  const args = process.argv.slice(2);
  const ownerIdArg = args.find(arg => arg.startsWith('--owner='));
  const isDryRun = !args.includes('--apply');

  if (!ownerIdArg) {
    console.error("Erro: O argumento --owner=<UID> é obrigatório.");
    process.exit(1);
  }
  const ownerIdToReconcile = ownerIdArg.split('=')[1];

  console.log(
    `Iniciando reconciliação para ownerId: ${ownerIdToReconcile} em modo ${
      isDryRun ? "DRY RUN (SIMULAÇÃO)" : "APPLY (EXECUÇÃO)"
    }`
  );
  console.log("------------------------------------------------------");

  const results: ReconciliationResult[] = [];
  const batch = adminDb.batch();
  let fixesMade = 0;
  let missingInvoiceIdFixes = 0;

  // 1. Buscar todos os registros de consumo e pagamento do proprietário com o SDK de Admin
  const consumptionsQuery = adminDb.collection("consumption_records").where("ownerId", "==", ownerIdToReconcile);
  const paymentsQuery = adminDb.collection("payment_records").where("ownerId", "==", ownerIdToReconcile);

  const [consumptionsSnapshot, paymentsSnapshot] = await Promise.all([
    consumptionsQuery.get(),
    paymentsQuery.get(),
  ]);

  const allConsumptions = consumptionsSnapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() } as ConsumptionRecord)
  );
  const allPayments = paymentsSnapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() } as PaymentRecord)
  );

  // 2. Agrupar por fatura (invoiceId)
  const invoicesToCalculate = new Map<string, { consumptions: ConsumptionRecord[]; payments: PaymentRecord[]; }>();

  for (const record of allConsumptions) {
    if (!record.payLater) continue;

    const month = record.date.substring(0, 7); // yyyy-MM
    const expectedInvoiceId = `${record.ownerId}_${record.customer_id}_${month}`;

    if (record.invoiceId !== expectedInvoiceId) {
        const recordRef = adminDb.collection("consumption_records").doc(record.id);
        batch.update(recordRef, { invoiceId: expectedInvoiceId });
        record.invoiceId = expectedInvoiceId; // Atualiza em memória também
        missingInvoiceIdFixes++;
    }

    if (!invoicesToCalculate.has(expectedInvoiceId)) {
      invoicesToCalculate.set(expectedInvoiceId, { consumptions: [], payments: [] });
    }
    invoicesToCalculate.get(expectedInvoiceId)!.consumptions.push(record);
  }

  for (const payment of allPayments) {
    if (!payment.invoiceId) continue; // Ignora pagamentos sem invoiceId
    if (!invoicesToCalculate.has(payment.invoiceId)) {
      invoicesToCalculate.set(payment.invoiceId, { consumptions: [], payments: [] });
    }
    invoicesToCalculate.get(payment.invoiceId)!.payments.push(payment);
  }

  // 3. Iterar, calcular e comparar com as faturas existentes
  for (const [invoiceId, { consumptions, payments }] of invoicesToCalculate) {
    const calculatedTotal = consumptions.reduce((sum, r) => sum + r.subtotal, 0);
    const calculatedPaidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    const calculatedOpenTotal = Math.max(0, calculatedTotal - calculatedPaidTotal);
    
    let calculatedStatus: "OPEN" | "PARTIAL" | "PAID" = "OPEN";
    if (calculatedOpenTotal <= 0.01 && calculatedTotal > 0) {
      calculatedStatus = "PAID";
    } else if (calculatedPaidTotal > 0 && calculatedOpenTotal > 0) {
      calculatedStatus = "PARTIAL";
    }

    const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();

    const result: ReconciliationResult = {
        invoiceId,
        calculated: {
            total: calculatedTotal,
            paidTotal: calculatedPaidTotal,
            openTotal: calculatedOpenTotal,
            status: calculatedStatus,
            consumptionCount: consumptions.length,
            paymentCount: payments.length,
        },
        existing: null,
        action: "OK",
    };

    if (!invoiceSnap.exists) {
      if (calculatedTotal > 0) {
        result.action = "CREATE";
        const [ownerId, customerId, month] = invoiceId.split('_');
        batch.set(invoiceRef, {
            ownerId,
            customerId,
            month,
            total: calculatedTotal,
            paidTotal: calculatedPaidTotal,
            openTotal: calculatedOpenTotal,
            status: calculatedStatus,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
      }
    } else {
      const existingData = invoiceSnap.data() as Invoice;
      result.existing = { ...existingData };

      const needsUpdate =
        Math.abs(existingData.total - calculatedTotal) > 0.01 ||
        Math.abs(existingData.paidTotal - calculatedPaidTotal) > 0.01 ||
        Math.abs(existingData.openTotal - calculatedOpenTotal) > 0.01 ||
        existingData.status !== calculatedStatus;

      if (needsUpdate) {
        if (calculatedTotal <= 0 && existingData.total > 0) {
          result.action = "DELETE"; // Fatura ficou vazia, deve ser removida
          batch.delete(invoiceRef);
        } else {
          result.action = "UPDATE";
          batch.update(invoiceRef, {
            total: calculatedTotal,
            paidTotal: calculatedPaidTotal,
            openTotal: calculatedOpenTotal,
            status: calculatedStatus,
            updatedAt: Timestamp.now(),
          });
        }
      }
    }
    if (result.action !== "OK") {
        fixesMade++;
        results.push(result);
    }
  }

  // 4. Exibir relatório e commitar (se não for dry run)
  console.log("--- Relatório de Reconciliação ---");
  if (results.length === 0 && missingInvoiceIdFixes === 0) {
    console.log("✅ Nenhuma inconsistência encontrada. Os dados estão corretos!");
  } else {
    results.forEach((r) => {
        console.log(`\n[${r.action}] Fatura ID: ${r.invoiceId}`);
        console.table({
            Calculado: r.calculated,
            Existente: r.existing || 'N/A',
        });
    });
    console.log(`\nResumo:`);
    console.log(`- ${fixesMade} faturas a serem criadas/atualizadas/deletadas.`);
    console.log(`- ${missingInvoiceIdFixes} registros de consumo com invoiceId a ser corrigido.`);

    if (!isDryRun) {
      try {
        await batch.commit();
        console.log("\n✅ Lote de correções aplicado com sucesso no Firestore!");
      } catch (error) {
        console.error("\n❌ ERRO AO APLICAR AS CORREÇÕES:", error);
      }
    } else {
      console.log("\n(Simulação) Nenhum dado foi alterado. Para aplicar, adicione a flag '--apply'.");
    }
  }
};

reconcileOwnerData().catch((error) => {
  console.error("\n--- ERRO INESPERADO ---");
  console.error(error);
  process.exit(1);
});
