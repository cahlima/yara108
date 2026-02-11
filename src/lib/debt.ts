
import { collection, query, where, getDocs, DocumentData } from "firebase/firestore";
import { db } from "./firebase";

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
