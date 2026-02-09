
import {
  collection,
  doc,
  Timestamp,
  runTransaction,
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

// --- Função Principal ---

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

    // Itera sobre as faturas em ordem (geralmente da mais antiga para a mais nova)
    for (const invoice of invoicesToPay) {
      if (remainingAmount <= 0) break;

      const invoiceRef = doc(db, "invoices", invoice.id);
      const invoiceDoc = await transaction.get(invoiceRef);

      if (!invoiceDoc.exists()) {
        console.warn(`Fatura ${invoice.id} não encontrada durante o pagamento. Pulando.`);
        continue;
      }

      const invoiceData = invoiceDoc.data();
      const openTotal = Number(invoiceData.openTotal || 0);
      if (openTotal <= 0) continue;

      const amountToPayOnThisInvoice = Math.min(remainingAmount, openTotal);
      if (amountToPayOnThisInvoice <= 0) continue;

      // 1. Criar o registro do histórico de pagamento
      const paymentRecordRef = doc(collection(db, "payment_records"));
      const paymentRecord: PaymentRecord = {
        ownerId,
        customerId, // PADRONIZADO
        invoiceId: invoice.id,
        amount: amountToPayOnThisInvoice,
        paidAt,
        method: paymentMethod,
        note: note || "",
        createdBy,
      };
      transaction.set(paymentRecordRef, paymentRecord);

      // 2. Atualizar a fatura
      const total = Number(invoiceData.total || 0);
      const paidTotal = Number(invoiceData.paidTotal || 0);

      const newPaidTotal = paidTotal + amountToPayOnThisInvoice;
      const newOpenTotal = Math.max(0, total - newPaidTotal);
      
      const newStatus = newOpenTotal <= 0.01 ? "PAID" : newPaidTotal > 0 ? "PARTIAL" : "OPEN";

      transaction.update(invoiceRef, {
        paidTotal: newPaidTotal,
        openTotal: newOpenTotal,
        status: newStatus,
        updatedAt: paidAt,
      });

      remainingAmount -= amountToPayOnThisInvoice;
    }

    // Garante que não foi pago um valor maior que o devido (com margem para float errors)
    if (remainingAmount > 0.01) {
      throw new Error("O valor do pagamento excede o total da dívida selecionada.");
    }
  });
};
