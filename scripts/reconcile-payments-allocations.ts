
import { db, FieldValue } from './firebaseAdmin';
import { allocatePaymentsToInvoicesForCustomer } from '../src/lib/payment-allocation';
import { Invoice, Payment } from '../src/lib/types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const minimist = require('minimist');

async function reconcilePaymentsForOwner(ownerId: string, apply: boolean): Promise<void> {
  console.log(`
================================================================
[${apply ? 'MODE: APPLY' : 'MODE: DRY-RUN'}]
Iniciando reconciliação de pagamentos para o owner: ${ownerId}
================================================================
`);

  const invoicesRef = db.collection('invoices').where('ownerId', '==', ownerId);
  const paymentsRef = db.collection('payments').where('ownerId', '==', ownerId);

  const [invoicesSnapshot, paymentsSnapshot] = await Promise.all([
    invoicesRef.get(),
    paymentsRef.get(),
  ]);

  if (invoicesSnapshot.empty) {
    console.warn('Nenhuma fatura encontrada para este owner. Encerrando.');
    return;
  }

  const allInvoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
  const allPayments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));

  console.log(`Dados carregados: ${allInvoices.length} faturas, ${allPayments.length} pagamentos.`);

  const invoicesByCustomer: { [key: string]: Invoice[] } = {};
  allInvoices.forEach(invoice => {
    if (!invoice.customerId) return;
    (invoicesByCustomer[invoice.customerId] = invoicesByCustomer[invoice.customerId] || []).push(invoice);
  });

  const paymentsByCustomer: { [key: string]: Payment[] } = {};
  allPayments.forEach(payment => {
    if (!payment.customerId) return;
    // *** CORREÇÃO SÊNIOR: Remove a lógica que impedia o reprocessamento de pagamentos já alocados ***
    // A lógica de alocação é idempotente e segura para ser re-executada.
    (paymentsByCustomer[payment.customerId] = paymentsByCustomer[payment.customerId] || []).push(payment);
  });
  
  const customerIds = Object.keys(invoicesByCustomer);
  console.log(`Encontrados ${customerIds.length} clientes únicos com faturas para processar.`);

  let totalAffectedDocs = 0;
  let customersWithCredit = 0;

  for (const customerId of customerIds) {
    const customerInvoices = invoicesByCustomer[customerId] || [];
    const customerPayments = paymentsByCustomer[customerId] || [];

    if (customerPayments.length === 0) {
      continue;
    }

    console.log(`
----------------------------------------------------------------
-> Processando Cliente: ${customerId} (${customerInvoices.length} faturas, ${customerPayments.length} pagamentos)`);

    const { updatedInvoices, updatedPayments, customerCredit } = allocatePaymentsToInvoicesForCustomer(
      customerInvoices,
      customerPayments
    );

    if (updatedInvoices.length === 0 && updatedPayments.length === 0) {
        console.log(`   Nenhuma alteração necessária para este cliente.`);
        continue;
    }

    console.log(`   - Faturas a serem atualizadas: ${updatedInvoices.length}`);
    console.log(`   - Pagamentos a serem atualizados: ${updatedPayments.length}`);
    if (customerCredit > 0) {
        console.log(`   - CRÉDITO DO CLIENTE: R$ ${customerCredit.toFixed(2)}`);
        customersWithCredit++;
    }

    if (apply) {
      const batch = db.batch();
      let batchSize = 0;

      updatedInvoices.forEach(invoice => {
        const { id, ...data } = invoice;
        batch.update(db.collection('invoices').doc(id), { 
            ...data,
            updatedAt: FieldValue.serverTimestamp()
        });
        batchSize++;
      });

      updatedPayments.forEach(payment => {
        const { id, ...data } = payment;
        batch.update(db.collection('payments').doc(id), {
            ...data,
            updatedAt: FieldValue.serverTimestamp()
        });
        batchSize++;
      });

      try {
        await batch.commit();
        console.log(`   [SUCCESS] Lote de ${batchSize} escritas para o cliente ${customerId} foi comitado.`);
        totalAffectedDocs += batchSize;
      } catch (error) {
        console.error(`   [FATAL ERROR] Falha ao comitar lote para o cliente ${customerId}:`, error);
      }
    } else {
        console.log("   [DRY-RUN SUMMARY] Nenhum dado foi alterado.");
        if (updatedInvoices[0]) {
            const inv = updatedInvoices[0];
            console.log(`     Exemplo Fatura: ${inv.id.substring(0,10)}... | openTotal: ${inv.openTotal.toFixed(2)} | status: ${inv.status}`);
        }
        if (updatedPayments[0]) {
            const pay = updatedPayments[0];
            console.log(`     Exemplo Pagamento: ${pay.id.substring(0,10)}... | allocations: ${JSON.stringify(pay.allocations)}`);
        }
    }
  }

  console.log(`
================================================================
Reconciliação Finalizada.
- Total de clientes com crédito final: ${customersWithCredit}
- Total de documentos ${apply ? 'atualizados' : 'a serem atualizados'}: ${totalAffectedDocs}.
${!apply ? 'Execute com --apply para persistir as mudanças.':''}
================================================================
`);
}

// --- Execução do Script ---
const args = minimist(process.argv.slice(2));
const ownerId = args.owner;
const apply = args.apply || false;

if (!ownerId) {
  console.error("❌ Erro: Argumento --owner=<ownerId> é obrigatório.");
  process.exit(1);
}

reconcilePaymentsForOwner(ownerId, apply).catch(err => {
    console.error("❌ Ocorreu um erro inesperado durante a execução do script:", err);
});
