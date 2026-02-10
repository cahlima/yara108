
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Invoice, Payment } from '../lib/types';

// Função para carregar detalhes da fatura
export const getInvoiceDetails = async (invoiceId: string): Promise<Invoice | null> => {
    const invoiceRef = doc(db, 'invoices', invoiceId);
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
        console.error("Fatura não encontrada!");
        return null;
    }

    const invoiceData = { id: invoiceSnap.id, ...invoiceSnap.data() } as Invoice;
    
    // Lógica de fallback (Hotfix): Se a fatura não estiver reconciliada (sem paidTotal > 0 vindo de alocações)
    // podemos carregar os pagamentos do cliente para dar visibilidade imediata.
    // A UI pode então decidir como mostrar isso (ex: "Pagamentos não vinculados").
    // Na solução definitiva, os totais da fatura (paidTotal, openTotal) já estarão corretos após o script.

    return invoiceData;
};

// Função de suporte para o hotfix, para mostrar pagamentos do cliente junto com a fatura
export const getAssociatedDataForInvoiceHotfix = async (invoice: Invoice) => {
    // 1. Buscar consumos (lógica existente)
    const consumptionQuery = query(
        collection(db, 'consumption_records'), 
        where('invoiceId', '==', invoice.id)
    );
    const consumptionSnapshot = await getDocs(consumptionQuery);
    const consumptions = consumptionSnapshot.docs.map(d => d.data());

    // 2. Buscar pagamentos do cliente (Hotfix)
    const paymentsQuery = query(
        collection(db, 'payments'),
        where('customerId', '==', invoice.customerId),
        where('ownerId', '==', invoice.ownerId),
        orderBy('paidAt', 'desc')
    );
    const paymentsSnapshot = await getDocs(paymentsQuery);
    const payments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Payment);

    return { consumptions, payments };
};
