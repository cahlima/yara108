
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase'; // sua instância do firestore
import { Payment } from '../lib/types';

// Busca pagamentos por cliente, ordenados por data de pagamento.
// Isso serve tanto para o hotfix quanto para a solução definitiva.
export const getPaymentsByCustomer = async (ownerId: string, customerId: string): Promise<Payment[]> => {
    if (!ownerId || !customerId) return [];

    const q = query(
        collection(db, 'payments'),
        where('ownerId', '==', ownerId),
        where('customerId', '==', customerId),
        orderBy('paidAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
};

// ... outras funções relacionadas a pagamentos, como `createPayment`
