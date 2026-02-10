
import {
  collection,
  doc,
  Timestamp,
  runTransaction,
  DocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { User } from "firebase/auth";

// --- Interfaces ---

interface InvoiceToPay {
  id: string;
  openTotal: number;
}

interface RegisterPaymentParams {
  user: User;
  customerId: string;
  paymentAmount: number;
  paymentMethod: string;
  note: string;
  invoicesToPay: InvoiceToPay[];
} 

interface PaymentRecord {
    ownerId: string;
    customerId: string;
    invoiceId: string;
    amount: number;
    paidAt: Timestamp;
    method: string;
    note: string;
    createdBy: string;
}

// --- Função Principal Corrigida ---

export const registerPayment = async ({
  user,
  customerId,
  paymentAmount,
  paymentMethod,
  note,
  invoicesToPay,
}: RegisterPaymentParams) => {
  if (!user || !user.uid || !customerId) throw new Error("IDs de proprietário e cliente são obrigatórios.");

  const ownerId = user.uid;
  const createdBy = user.uid;
  const paidAt = Timestamp.now();

  await runTransaction(db, async (transaction) => {
    let remainingAmount = paymentAmount;

    // =======================================================
    // 1. FASE DE LEITURA: Executar todas as leituras antes de qualquer escrita.
    // =======================================================
    const invoiceRefs = invoicesToPay.map(invoice => doc(db, "invoices", invoice.id));
    const invoiceDocsSnapshots = await Promise.all(invoiceRefs.map(ref => transaction.get(ref)));

    const validInvoices: { snapshot: DocumentSnapshot; data: any }[] = [];
    for (const docSnap of invoiceDocsSnapshots) {
        if (docSnap.exists() && docSnap.data().openTotal > 0) {
            validInvoices.push({ snapshot: docSnap, data: docSnap.data() });
        } else {
            console.warn(`Fatura ${docSnap.id} não encontrada ou já quitada. Pulando.`);
        }
    }

    // =======================================================
    // 2. FASE DE LÓGICA E ESCRITA: Agora, realizar cálculos e preparar as escritas.
    // =======================================================
    for (const { snapshot, data: invoiceData } of validInvoices) {
      if (remainingAmount <= 0) break;

      const openTotal = Number(invoiceData.openTotal || 0);
      const amountToPayOnThisInvoice = Math.min(remainingAmount, openTotal);

      if (amountToPayOnThisInvoice <= 0) continue;

      // Preparar a criação do registro de histórico de pagamento
      const paymentRecordRef = doc(collection(db, "payment_records"));
      const paymentRecord: PaymentRecord = {
        ownerId,
        customerId,
        invoiceId: snapshot.id,
        amount: amountToPayOnThisInvoice,
        paidAt,
        method: paymentMethod,
        note: note || "",
        createdBy,
      };
      transaction.set(paymentRecordRef, paymentRecord);

      // Preparar a atualização da fatura
      const total = Number(invoiceData.total || 0);
      const paidTotal = Number(invoiceData.paidTotal || 0);
      const newPaidTotal = paidTotal + amountToPayOnThisInvoice;
      const newOpenTotal = total - newPaidTotal;
      
      // Adicionar uma pequena tolerância para comparações de ponto flutuante
      const newStatus = newOpenTotal <= 0.01 ? "PAID" : "PARTIAL";

      transaction.update(snapshot.ref, {
        paidTotal: newPaidTotal,
        openTotal: newOpenTotal,
        status: newStatus,
        updatedAt: paidAt,
      });

      remainingAmount -= amountToPayOnThisInvoice;
    }

    // Checagem de segurança para pagamentos excessivos (com margem para erros de float)
    if (remainingAmount > 0.01) {
      throw new Error(`O valor do pagamento excede o total da dívida. Saldo restante: R$ ${remainingAmount.toFixed(2)}`);
    }
  });
};
