import { collection, query, where, getDocs, DocumentData } from "firebase/firestore";
import { db } from "./firebase";

const CANCELED_STATUSES = ['canceled', 'cancelled', 'cancelado'];

/**
 * Parses a numeric value from various possible formats, including legacy fields.
 * @param value The value to parse.
 * @returns A clean number, defaulting to 0.
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
 * Calculates the total outstanding balance across all non-canceled invoices for a given owner.
 * This is used for the main "Open Invoices" dashboard metric.
 *
 * @param {string} ownerId - The ID of the owner (logged-in user).
 * @returns {Promise<number>} A Promise resolving to the total open amount.
 */
export const getOpenInvoicesTotal = async (ownerId: string): Promise<number> => {
    if (!ownerId) {
        throw new Error("Owner ID is required.");
    }

    const invoicesQuery = query(
        collection(db, "invoices"),
        where("ownerId", "==", ownerId)
    );

    const querySnapshot = await getDocs(invoicesQuery);

    if (querySnapshot.empty) {
        return 0;
    }

    const totalOpenAmount = querySnapshot.docs.reduce((sum, doc) => {
        const invoice = doc.data();

        // Ignore canceled invoices completely
        if (invoice.status && typeof invoice.status === 'string' && CANCELED_STATUSES.includes(invoice.status.toLowerCase())) {
            return sum;
        }

        // Use openTotal if it's a valid number, otherwise calculate it
        if (typeof invoice.openTotal === 'number' && !isNaN(invoice.openTotal)) {
            return sum + invoice.openTotal;
        }

        // Fallback calculation for legacy or inconsistent data
        const total = parseSafeNumber(invoice.total || invoice.total_value);
        const paid = parseSafeNumber(invoice.paidTotal || invoice.paid_total);
        const openTotal = Math.max(0, total - paid);
        
        return sum + openTotal;
    }, 0);

    // Clamp to ensure the final sum is never negative
    return Math.max(0, totalOpenAmount);
};


/**
 * Calcula a dívida líquida total de um cliente específico.
 * 
 * Esta função busca TODAS as faturas associadas a um cliente para um determinado proprietário (ownerId),
 * e então soma todos os valores do campo `openTotal`. Isso garante que saldos positivos (dívidas)
 * e saldos negativos (créditos) sejam corretamente contabilizados, resultando na dívida
 * líquida real do cliente.
 *
 * @param {string} ownerId - O ID do proprietário (usuário logado).
 * @param {string} customerId - O ID do cliente cuja dívida será calculada.
 * @returns {Promise<number>} Uma Promise que resolve com o valor da dívida líquida total.
 */
export const getCustomerDebt = async (ownerId: string, customerId: string): Promise<number> => {
    if (!ownerId || !customerId) {
        throw new Error("Owner ID and Customer ID are required.");
    }

    const invoicesQuery = query(
        collection(db, "invoices"),
        where("ownerId", "==", ownerId),
        where("customerId", "==", customerId)
    );

    const querySnapshot = await getDocs(invoicesQuery);

    if (querySnapshot.empty) {
        return 0;
    }

    let totalDebt = 0;
    querySnapshot.forEach((doc: DocumentData) => {
        const invoice = doc.data();
        // Soma o openTotal, que pode ser positivo (dívida) ou negativo (crédito)
        totalDebt += Number(invoice.openTotal || 0);
    });

    return totalDebt;
};
