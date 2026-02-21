
export interface Allocation {
    invoiceId: string;
    amount: number;
}

export interface Payment {
    id: string;
    amount: number;
    customerId: string;
    ownerId: string;
    paidAt: string; // ou Date
    method: string;
    allocations?: Allocation[];
    createdAt?: any; // Firestore Timestamp
    updatedAt?: any; // Firestore Timestamp
}

export interface Invoice {
    id: string;
    customerId: string;
    ownerId: string;
    month: string; // ex: "2023-12"
    total: number;
    paidTotal: number;
    openTotal: number;
    // *** CORREÇÃO SÊNIOR: Padroniza e expande os status das faturas ***
    status: 'OPEN' | 'PAID' | 'PARTIAL' | 'DRAFT'; 
    items: any[]; // consumption records
    createdAt?: any;
    updatedAt?: any;
}
