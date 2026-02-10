
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, getDoc, documentId, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, AlertCircle, CheckCircle, Smartphone, Info } from 'lucide-react';
import { toast } from "sonner";
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// --- TIPOS DE DADOS ---

interface Customer {
    id: string;
    name: string;
    phone?: string;
}

interface Debtor {
    customerId: string;
    customerName: string;
    customerPhone?: string;
    totalDebt: number;
}

interface Invoice {
    id: string;
    month: string; // "yyyy-MM"
    openTotal: number;
    status: 'OPEN' | 'PARTIAL' | 'PAID';
}

interface ConsumptionRecord {
    id: string;
    date: string; // "yyyy-MM-dd"
    product_name: string;
    quantity: number;
    subtotal: number;
    invoiceId: string;
}

// --- FUNÇÃO AUXILIAR PARA BUSCAR DADOS EM BLOCOS ---
async function getChunkedData<T>(ids: string[], collectionName: string, ownerId: string): Promise<Record<string, T>> {
    const results: Record<string, T> = {};
    if (ids.length === 0) return results;

    const CHUNK_SIZE = 30;
    const idChunks: string[][] = [];

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        idChunks.push(ids.slice(i, i + CHUNK_SIZE));
    }
    
    // Assegura que a consulta também inclua o ownerId para segurança
    const promises = idChunks.map(chunk => 
        getDocs(query(collection(db, collectionName), where(documentId(), 'in', chunk), where("ownerId", "==", ownerId)))
    );

    const snapshots = await Promise.all(promises);
    snapshots.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
            results[doc.id] = { id: doc.id, ...doc.data() } as T;
        });
    });
    return results;
}

// --- COMPONENTE DO MODAL ---

interface DebtDetailModalProps {
    debtor: Debtor | null;
    isOpen: boolean;
    onClose: () => void;
    user: any;
}

const DebtDetailModal: React.FC<DebtDetailModalProps> = ({ debtor, isOpen, onClose, user }) => {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [consumptions, setConsumptions] = useState<ConsumptionRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!isOpen || !debtor || !user) return;
            setIsLoading(true);

            try {
                // 1. Buscar faturas abertas
                const invoicesQuery = query(
                    collection(db, 'invoices'),
                    where('ownerId', '==', user.uid),
                    where('customerId', '==', debtor.customerId),
                    where('status', 'in', ['OPEN', 'PARTIAL']),
                    orderBy('month', 'desc')
                );
                const invoicesSnapshot = await getDocs(invoicesQuery);
                const openInvoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
                setInvoices(openInvoices);

                if (openInvoices.length === 0) {
                    setConsumptions([]);
                    setIsLoading(false);
                    return;
                }

                // 2. Buscar consumos dessas faturas
                const invoiceIds = openInvoices.map(inv => inv.id);
                if (invoiceIds.length > 0) {
                    const consumptionsQuery = query(
                        collection(db, 'consumption_records'),
                        where('ownerId', '==', user.uid),
                        where('invoiceId', 'in', invoiceIds)
                    );
                    const consumptionsSnapshot = await getDocs(consumptionsQuery);
                    const consumptionsData = consumptionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ConsumptionRecord));
                    setConsumptions(consumptionsData);
                } else {
                    setConsumptions([]);
                }
            } catch (err) {
                console.error("Erro ao buscar detalhes da dívida:", err);
                toast.error("Não foi possível carregar os detalhes da dívida.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [isOpen, debtor, user]);
    
    const consumptionsByInvoice = useMemo(() => {
        return consumptions.reduce((acc, con) => {
            if (!acc[con.invoiceId]) acc[con.invoiceId] = [];
            acc[con.invoiceId].push(con);
            return acc;
        }, {} as Record<string, ConsumptionRecord[]>);
    }, [consumptions]);

    const handleWhatsAppClick = () => {
        if (!debtor) return;
        
        const intro = `Olá, ${debtor.customerName}! Salve Deus. Segue o resumo de suas pendências na Cantina da Mãe Yara:\n\n`;
        let details = '';

        invoices.forEach(invoice => {
            const invoiceConsumptions = consumptionsByInvoice[invoice.id] || [];
            if(invoiceConsumptions.length === 0) return;

            const monthName = format(parse(invoice.month, 'yyyy-MM', new Date()), "MMMM/yyyy", { locale: ptBR });
            details += `*${monthName.charAt(0).toUpperCase() + monthName.slice(1)} - Total: R$ ${invoice.openTotal.toFixed(2).replace('.', ',')}*\n`;

            const groupedByDate = invoiceConsumptions.reduce((acc, con) => {
                const formattedDate = format(parse(con.date, 'yyyy-MM-dd', new Date()), "dd/MM/yyyy");
                if (!acc[formattedDate]) acc[formattedDate] = [];
                acc[formattedDate].push(con);
                return acc;
            }, {} as Record<string, ConsumptionRecord[]>);

            Object.entries(groupedByDate).forEach(([date, records]) => {
                const dateTotal = records.reduce((sum, r) => sum + r.subtotal, 0);
                details += `  _${date} - Total: R$ ${dateTotal.toFixed(2).replace('.', ',')}_\n`;
                records.forEach(r => {
                    details += `    - ${r.product_name} (x${r.quantity}): R$ ${r.subtotal.toFixed(2).replace('.', ',')}\n`;
                });
            });
            details += '\n';
        });

        const totalText = `*DÍVIDA TOTAL: R$ ${debtor.totalDebt.toFixed(2).replace('.', ',')}*`;
        const paymentInfo = `\n\nPara pagar, utilize o PIX: alamanto@hotmail.com.br`;
        
        const message = encodeURIComponent(intro + details + totalText + paymentInfo);
        const phone = debtor.customerPhone?.replace(/\D/g, '');

        if (phone) {
            window.open(`https://wa.me/55${phone}?text=${message}`, '_blank');
        } else {
            toast.error('O número de telefone deste cliente não está cadastrado.');
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md md:max-w-lg lg:max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Detalhes da Dívida - {debtor?.customerName}</DialogTitle>
                    <DialogDescription>
                        Um resumo de todas as faturas em aberto e seus consumos. O valor total da dívida é de R$ {debtor?.totalDebt.toFixed(2).replace('.', ',')}.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="flex-grow overflow-y-auto pr-4">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin" /></div>
                    ) : invoices.length === 0 ? (
                        <div className="text-center py-10">
                            <p className="text-muted-foreground">Não há faturas em aberto para este cliente.</p>
                        </div>
                    ) : (
                        <Accordion type="single" collapsible className="w-full">
                            {invoices.map(invoice => {
                                const invoiceConsumptions = consumptionsByInvoice[invoice.id] || [];
                                const groupedByDate = invoiceConsumptions.reduce((acc, con) => {
                                    const formattedDate = format(parse(con.date, 'yyyy-MM-dd', new Date()), "dd/MM/yyyy");
                                    if (!acc[formattedDate]) acc[formattedDate] = { total: 0, items: [] };
                                    acc[formattedDate].total += con.subtotal;
                                    acc[formattedDate].items.push(con);
                                    return acc;
                                }, {} as Record<string, { total: number, items: ConsumptionRecord[] }>);

                                const monthName = format(parse(invoice.month, 'yyyy-MM', new Date()), "MMMM/yyyy", { locale: ptBR });
                                
                                return (
                                    <AccordionItem value={invoice.id} key={invoice.id}>
                                        <AccordionTrigger>
                                            <div className="flex justify-between w-full pr-4">
                                                <span>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</span>
                                                <span className="font-bold text-red-600">R$ {invoice.openTotal.toFixed(2).replace('.', ',')}</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {Object.entries(groupedByDate).map(([date, { total, items }]) => (
                                                <div key={date} className="pt-2 pb-4">
                                                    <p className="font-semibold text-sm mb-1">{date} - Total: R$ {total.toFixed(2).replace('.', ',')}</p>
                                                    <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
                                                        {items.map(item => (
                                                            <li key={item.id}>
                                                                {item.product_name} (x{item.quantity}) - R$ {item.subtotal.toFixed(2).replace('.', ',')}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))}
                                            {invoiceConsumptions.length === 0 && <p className="text-sm text-muted-foreground p-2">Não há detalhes de consumo para esta fatura.</p>}
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    )}
                </div>
                
                <div className="pt-4 border-t">
                    <Button onClick={handleWhatsAppClick} className="w-full bg-green-500 hover:bg-green-600 text-white" disabled={isLoading || invoices.length === 0}>
                        <Smartphone className="mr-2 h-4 w-4" /> Enviar Resumo Completo por WhatsApp
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};


// --- COMPONENTE PRINCIPAL DA PÁGINA ---

const BillingPage: React.FC = () => {
    const { user, loading: authLoading } = useAuth();
    const [debtors, setDebtors] = useState<Debtor[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // State para o modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);

    useEffect(() => {
        const fetchDebts = async () => {
            if (!user) return;
            setLoading(true);
            setError(null);

            try {
                // 1. Buscar todas as faturas do usuário
                const invoicesQuery = query(collection(db, 'invoices'), where('ownerId', '==', user.uid));
                const invoicesSnapshot = await getDocs(invoicesQuery);

                // 2. Calcular a dívida líquida por cliente
                const debtByCustomer: Record<string, number> = {};
                invoicesSnapshot.forEach(doc => {
                    const invoice = doc.data();
                    const customerId = invoice.customerId;
                    if (!debtByCustomer[customerId]) debtByCustomer[customerId] = 0;
                    debtByCustomer[customerId] += Number(invoice.openTotal || 0);
                });

                // 3. Filtrar clientes com dívida > 0
                const debtorIds = Object.keys(debtByCustomer).filter(id => debtByCustomer[id] > 0.01);

                if (debtorIds.length === 0) {
                    setDebtors([]);
                    return;
                }

                // 4. Buscar os dados dos clientes devedores
                const customersData = await getChunkedData<Customer>(debtorIds, 'customers', user.uid);

                // 5. Montar a lista final de devedores
                const finalDebtors: Debtor[] = debtorIds.map(id => ({
                    customerId: id,
                    customerName: customersData[id]?.name || 'Cliente Desconhecido',
                    customerPhone: customersData[id]?.phone,
                    totalDebt: debtByCustomer[id],
                })).sort((a, b) => b.totalDebt - a.totalDebt);

                setDebtors(finalDebtors);

            } catch (err: any) {
                console.error("Erro Crítico ao buscar débitos:", err);
                setError(`Falha ao carregar os débitos: ${err.message}.`);
            } finally {
                setLoading(false);
            }
        };

        if (!authLoading && user) {
          fetchDebts();
        } else if (!authLoading && !user) {
          setLoading(false);
        }
    }, [user, authLoading]);

    const handleOpenModal = (debtor: Debtor) => {
        setSelectedDebtor(debtor);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedDebtor(null);
    };

    if (authLoading || loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    if (error) return <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 m-4"><strong>Erro:</strong> {error}</div>;

    return (
        <>
            <div className="container mx-auto p-4 space-y-6">
                <div>
                    <h1 className="text-3xl font-bold">Débitos em Aberto</h1>
                    <p className="text-muted-foreground">Clientes com pagamentos pendentes. Total de {debtors.length} devedores.</p>
                </div>

                {debtors.length === 0 && !loading ? (
                     <div className="flex flex-col items-center justify-center h-60 bg-green-50/50 rounded-lg border border-dashed">
                        <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                        <h2 className="text-xl font-semibold">Tudo em dia!</h2>
                        <p className="text-muted-foreground">Não há clientes com débitos em aberto.</p>
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {debtors.map(debtor => (
                            <Card key={debtor.customerId} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow">
                                <CardHeader>
                                    <CardTitle className="truncate">{debtor.customerName}</CardTitle>
                                </CardHeader>
                                <CardContent className="flex-grow">
                                    <p className="text-sm text-muted-foreground">Dívida Total</p>
                                    <p className="text-3xl font-bold text-red-600">R$ {debtor.totalDebt.toFixed(2).replace('.', ',')}</p>
                                </CardContent>
                                <CardFooter>
                                    <Button onClick={() => handleOpenModal(debtor)} variant="outline" className="w-full">
                                        <Info className="mr-2 h-4 w-4" /> Ver Detalhes
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <DebtDetailModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                debtor={selectedDebtor}
                user={user}
            />
        </>
    );
};

export default BillingPage;

