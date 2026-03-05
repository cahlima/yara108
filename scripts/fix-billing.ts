import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import serviceAccount from '../secrets/serviceAccountKey.json';

initializeApp({
  credential: cert(serviceAccount as any),
});

const db = getFirestore();

async function fixBilling() {
  console.log('🚀 Iniciando auditoria e correção...\n');

  const invoicesSnap = await db.collection('invoices').get();
  const consumptionsSnap = await db.collection('consumption_records').get();
  const paymentsSnap = await db.collection('payments').get();

  const consumptions = consumptionsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));

  const payments = paymentsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));

  let fixes = 0;

  for (const invoiceDoc of invoicesSnap.docs) {
    const invoice = { id: invoiceDoc.id, ...invoiceDoc.data() };

    const invoiceConsumptions = consumptions.filter(
      (c: any) => c.invoiceId === invoice.id
    );

    const invoicePayments = payments.filter(
      (p: any) => p.invoiceId === invoice.id
    );

    const totalConsumed = invoiceConsumptions.reduce(
      (sum: number, c: any) => sum + (c.subtotal || 0),
      0
    );

    const totalPaid = invoicePayments.reduce(
      (sum: number, p: any) => sum + (p.amount || 0),
      0
    );

    const openTotal = totalConsumed - totalPaid;

    let status: 'OPEN' | 'PARTIAL' | 'PAID';

    if (openTotal <= 0) {
      status = 'PAID';
    } else if (totalPaid > 0) {
      status = 'PARTIAL';
    } else {
      status = 'OPEN';
    }

    const needsUpdate =
      Math.abs((invoice as any).openTotal - openTotal) > 0.01 ||
      (invoice as any).status !== status;

    if (needsUpdate) {
      console.log(`🔧 Corrigindo invoice ${invoice.id}`);
      console.log({
        before: {
          openTotal: (invoice as any).openTotal,
          status: (invoice as any).status,
        },
        after: {
          openTotal,
          status,
        },
      });

      await invoiceDoc.ref.update({
        openTotal,
        status,
        updatedAt: new Date(),
      });

      fixes++;
    }

    if (openTotal < -0.01) {
      console.error(`💣 ERRO GRAVE (crédito excessivo): ${invoice.id}`, {
        totalConsumed,
        totalPaid,
        openTotal,
      });
    }
  }

  // 🚨 pagamentos sem invoice
  const orphanPayments = payments.filter((p: any) => !p.invoiceId);

  if (orphanPayments.length > 0) {
    console.warn('\n⚠️ Pagamentos sem invoiceId:', orphanPayments.length);
    orphanPayments.forEach((p: any) =>
      console.warn(`- Payment ${p.id}`)
    );
  }

  // 🚨 duplicados
  const duplicates = payments.filter((p: any, i: number, arr: any[]) =>
    arr.findIndex(
      x => x.invoiceId === p.invoiceId && x.amount === p.amount
    ) !== i
  );

  if (duplicates.length > 0) {
    console.warn('\n⚠️ Pagamentos duplicados:', duplicates.length);
  }

  console.log(`\n✅ Correções aplicadas: ${fixes}`);
  console.log('🏁 Finalizado.\n');
}

fixBilling().catch(console.error);