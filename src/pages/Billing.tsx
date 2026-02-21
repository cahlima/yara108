import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, documentId, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, CheckCircle, Smartphone, Info, X } from 'lucide-react';
import { toast } from "sonner";
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getCustomerDebt } from '@/lib/debt';

// Interfaces
interface Customer { id: string; name: string; phone?: string; }
interface Debtor { customerId: string; customerName: string; customerPhone?: string; totalDebt: number; }
interface Invoice { id: string; month: string; openTotal: number; status: 'OPEN' | 'PARTIAL' | 'PAID'; customerId?: string; }
interface ConsumptionRecord { id: string; date: Timestamp; product_name: string; quantity: number; subtotal: number; invoiceId: string; }

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
                const invoicesQuery = query(
                    collection(db, 'invoices'),
                    where('ownerId', '==', user.uid),
                    where('customerId', '==', debtor.customerId),
                    where('openTotal', '>', 0),
                    orderBy('month', 'desc')
                );
                const invoicesSnapshot = await getDocs(invoicesQuery);
                const invoicesData = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
                setInvoices(invoicesData);

                if (invoicesData.length > 0) {
                    const invoiceIds = invoicesData.map(inv => inv.id);
                    const consumptionsQuery = query(collection(db, 'consumption_records'), where('ownerId', '==', user.uid), where('invoiceId', 'in', invoiceIds));
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

    const consumptionsByInvoice = useMemo(() => consumptions.reduce((acc, con) => {
        (acc[con.invoiceId] = acc[con.invoiceId] || []).push(con);
        return acc;
    }, {} as Record<string, ConsumptionRecord[]>), [consumptions]);

    const handleWhatsAppClick = () => {
        if (!debtor?.customerPhone) {
            toast.error("Telefone não cadastrado", { description: "Este cliente não possui um número de telefone para contato." });
            return;
        }

        let sanitizedPhone = debtor.customerPhone.replace(/\D/g, '');

        if (sanitizedPhone.startsWith('55')) {
            sanitizedPhone = sanitizedPhone.substring(2);
        }

        if (![10, 11].includes(sanitizedPhone.length)) {
            toast.error("Telefone inválido", { description: `O número "${debtor.customerPhone}" não parece ser um telefone brasileiro válido.` });
            return;
        }
        
        const fullPhoneNumber = `55${sanitizedPhone}`;
        
        // --- GERAÇÃO DA MENSAGEM DETALHADA ---
        let message = `Olá, ${debtor.customerName}! Salve Deus. Segue o resumo completo das suas faturas em aberto na Cantina da Mãe Yara:

`;

        invoices.forEach(invoice => {
            const monthName = format(parse(invoice.month, 'yyyy-MM', new Date()), "MMMM/yyyy", { locale: ptBR });
            const invoiceTotal = invoice.openTotal.toFixed(2).replace('.', ',');
            
            message += `--- ${monthName} ---
`;
            message += `Total da Fatura: R$ ${invoiceTotal}
`;
            
            const invoiceConsumptions = consumptionsByInvoice[invoice.id] || [];
            const groupedByDate = invoiceConsumptions.reduce((acc, con) => {
                const dateObj = con.date?.toDate ? con.date.toDate() : new Date();
                const formattedDate = format(dateObj, "dd/MM/yyyy");
                (acc[formattedDate] = acc[formattedDate] || { total: 0, items: [] }).items.push(con);
                acc[formattedDate].total += con.subtotal;
                return acc;
            }, {} as Record<string, { total: number, items: ConsumptionRecord[] }>);

            const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
                const dateA = parse(a, 'dd/MM/yyyy', new Date());
                const dateB = parse(b, 'dd/MM/yyyy', new Date());
                return dateA.getTime() - dateB.getTime();
            });

            sortedDates.forEach(date => {
                const { total, items } = groupedByDate[date];
                message += `  ${date}: R$ ${total.toFixed(2).replace('.', ',')}
`;
                
                items.forEach(item => {
                    const unitPrice = (item.subtotal / item.quantity).toFixed(2).replace('.', ',');
                    const subtotal = item.subtotal.toFixed(2).replace('.', ',');
                    message += `    - ${item.product_name} ${unitPrice} (x${item.quantity}): R$ ${subtotal}
`;
                });
            });
            message += '\n';
        });

        message += `DÍVIDA TOTAL: R$ ${debtor.totalDebt.toFixed(2).replace('.', ',')}

`;
        message += "Para pagar, utilize o PIX: alamanto@hotmail.com.br";
        
        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/${fullPhoneNumber}?text=${encodedMessage}`;

        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md md:max-w-lg lg:max-w-2xl max-h-[90vh] flex flex-col bg-gray-900 text-white border-gray-700">
                <DialogHeader>
                    <DialogTitle>{debtor ? `Detalhes da Dívida - ${debtor.customerName}`: 'Carregando...'}</DialogTitle>
                    <DialogDescription>
                        {debtor ? `Resumo da dívida de R$ ${debtor.totalDebt.toFixed(2).replace('.', ',')}.`: 'Aguarde enquanto os detalhes são carregados.'}
                    </DialogDescription>
                    <DialogClose asChild><button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={24} /></button></DialogClose>
                </DialogHeader>
                <div className="flex-grow overflow-y-auto pr-4 -mr-4">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
                    ) : !invoices.length ? (
                        <div className="text-center py-10"><p className="text-gray-400">Não há faturas compondo a dívida.</p></div>
                    ) : (
                        <Accordion type="single" collapsible className="w-full">
                            {invoices.map(invoice => {
                                const invoiceConsumptions = consumptionsByInvoice[invoice.id] || [];
                                const groupedByDate = invoiceConsumptions.reduce((acc, con) => {
                                    const dateObj = con.date?.toDate ? con.date.toDate() : new Date();
                                    const formattedDate = format(dateObj, "dd/MM/yyyy", { locale: ptBR });
                                    (acc[formattedDate] = acc[formattedDate] || { total: 0, items: [] }).items.push(con);
                                    acc[formattedDate].total += con.subtotal;
                                    return acc;
                                }, {} as Record<string, { total: number, items: ConsumptionRecord[] }>);
                                const monthName = format(parse(invoice.month, 'yyyy-MM', new Date()), "MMMM/yyyy", { locale: ptBR });
                                return (
                                    <AccordionItem value={invoice.id} key={invoice.id} className="border-b border-gray-700">
                                        <AccordionTrigger className="hover:no-underline">
                                            <div className="flex justify-between w-full pr-4"><span className="capitalize">{monthName}</span><span className="font-bold text-red-500">R$ {invoice.openTotal.toFixed(2).replace('.', ',')}</span></div>
                                        </AccordionTrigger>
                                        <AccordionContent className="bg-gray-800/50">
                                            {Object.entries(groupedByDate).map(([date, { total, items }]) => (
                                                <div key={date} className="pt-3 pb-4 px-4">
                                                    <p className="font-semibold text-sm mb-2 text-gray-300">{date} - Total: R$ {total.toFixed(2).replace('.', ',')}</p>
                                                    <ul className="list-disc pl-6 text-sm text-gray-400 space-y-1">
                                                        {items.map(item => <li key={item.id}>{item.product_name} (x{item.quantity}) - R$ {item.subtotal.toFixed(2).replace('.', ',')}</li>)}
                                                    </ul>
                                                </div>
                                            ))}
                                            {invoiceConsumptions.length === 0 && <p className="text-sm text-gray-400 p-4">Não há detalhes de consumo para esta fatura.</p>}
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    )}
                </div>
                <div className="pt-4 border-t border-gray-700">
                    <Button onClick={handleWhatsAppClick} className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={isLoading || !invoices.length}><Smartphone className="mr-2 h-4 w-4" /> Enviar Resumo por WhatsApp</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};


const BillingPage: React.FC = () => {
    const { user, loading: authLoading } = useAuth();
    const [debtors, setDebtors] = useState<Debtor[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);

    useEffect(() => {
        const fetchDebts = async () => {
            if (!user) { setLoading(false); return; }
            setLoading(true);
            setError(null);
            try {
                const invoicesQuery = query(collection(db, 'invoices'), where('ownerId', '==', user.uid), where('status', 'in', ['OPEN', 'PARTIAL']));
                const invoicesSnapshot = await getDocs(invoicesQuery);
                const allInvoices = invoicesSnapshot.docs.map(doc => doc.data() as Invoice);
                
                // FIXED: Filter out invoices with missing customerId
                const customerIds = [...new Set(allInvoices.map(inv => inv.customerId).filter(id => id))] as string[];

                if (customerIds.length === 0) {
                    setDebtors([]); setLoading(false); return;
                }

                const debtorPromises = customerIds.map(async (id) => {
                    const totalDebt = await getCustomerDebt(user.uid, id);
                    return { customerId: id, totalDebt };
                });

                const debts = await Promise.all( debtorPromises);
                const debtorsWithDebt = debts.filter(d => d.totalDebt > 0.01);
                const debtorIds = debtorsWithDebt.map(d => d.customerId);
                const debtMap = new Map(debtorsWithDebt.map(d => [d.customerId, d.totalDebt]));

                if (debtorIds.length === 0) {
                    setDebtors([]); setLoading(false); return;
                }

                const customersData: Record<string, Customer> = {};
                const chunks: string[][] = [];
                for (let i = 0; i < debtorIds.length; i += 30) { chunks.push(debtorIds.slice(i, i + 30)); }

                for (const chunk of chunks) {
                    // This query will now only receive valid customer IDs
                    const customersQuery = query(collection(db, "customers"), where(documentId(), "in", chunk));
                    const customerSnapshots = await getDocs(customersQuery);
                    customerSnapshots.forEach(doc => { customersData[doc.id] = { id: doc.id, ...doc.data() } as Customer; });
                }

                const finalDebtors: Debtor[] = debtorIds.map(id => ({
                    customerId: id,
                    customerName: customersData[id]?.name || 'Cliente Desconhecido',
                    customerPhone: customersData[id]?.phone,
                    totalDebt: debtMap.get(id) || 0,
                })).sort((a, b) => b.totalDebt - a.totalDebt);

                setDebtors(finalDebtors);
            } catch (err: any) {
                console.error("Erro Crítico ao buscar débitos:", err);
                setError(`Falha ao carregar os débitos: ${err.message}.`);
            } finally {
                setLoading(false);
            }
        };
        if (!authLoading && user) { fetchDebts(); }
    }, [user, authLoading]);

    const handleOpenModal = (debtor: Debtor) => { setSelectedDebtor(debtor); setIsModalOpen(true); };
    const handleCloseModal = () => { setIsModalOpen(false); setSelectedDebtor(null); };

    if (authLoading || loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    if (error) return <div className="bg-red-900 border border-red-700 text-red-100 p-4 m-4 rounded-md"><strong>Erro:</strong> {error}</div>;

    return (
        <>
            <div className="container mx-auto p-4 space-y-6">
                <div className="text-white">
                    <h1 className="text-3xl font-bold">Débitos em Aberto</h1>
                    <p className="text-gray-400">Clientes com pagamentos pendentes. Total de {debtors.length} devedores.</p>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center h-60"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                ) : debtors.length === 0 ? (
                     <div className="flex flex-col items-center justify-center h-60 bg-gray-800/50 rounded-lg border border-dashed border-gray-700 text-white">
                        <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                        <h2 className="text-xl font-semibold">Tudo em dia!</h2>
                        <p className="text-gray-400">Não há clientes com débitos em aberto.</p>
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {debtors.map(debtor => (
                            <Card key={debtor.customerId} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow bg-gray-900 border-gray-700 text-white">
                                <CardHeader><CardTitle className="truncate">{debtor.customerName}</CardTitle></CardHeader>
                                <CardContent className="flex-grow">
                                    <p className="text-sm text-gray-400">Dívida Total</p>
                                    <p className="text-3xl font-bold text-red-500">R$ {debtor.totalDebt.toFixed(2).replace('.', ',')}</p>
                                </CardContent>
                                <CardFooter>
                                    <Button onClick={() => handleOpenModal(debtor)} variant="outline" className="w-full bg-gray-700 border-gray-600 hover:bg-gray-600"><Info className="mr-2 h-4 w-4" /> Ver Detalhes</Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <DebtDetailModal isOpen={isModalOpen} onClose={handleCloseModal} debtor={selectedDebtor} user={user} />
        </>
    );
};

export default BillingPage;
