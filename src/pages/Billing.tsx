import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, documentId, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, CheckCircle, Smartphone, Info, X, DollarSign } from 'lucide-react';
import { toast } from "sonner";
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';

// Interfaces
interface Customer { id: string; name: string; phone?: string; }
interface Debtor { customerId: string; customerName: string; customerPhone?: string; totalDebt: number; }
interface Invoice { id: string; month: string; openTotal: number; status: 'open' | 'partial' | 'paid' | 'canceled'; customerId?: string; customerName?: string; }
interface ConsumptionItem { id: string; product_name: string; quantity: number; unit_price: number; subtotal: number; date?: string; }

// --- COMPONENTE DO MODAL ---

interface DebtDetailModalProps {
    debtor: Debtor | null;
    isOpen: boolean;
    onClose: () => void;
    user: { uid: string };
}

const DebtDetailModal: React.FC<DebtDetailModalProps> = ({ debtor, isOpen, onClose, user }) => {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [consumptionByInvoice, setConsumptionByInvoice] = useState<Record<string, ConsumptionItem[]>>({});
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
                    where('status', '!=', 'canceled'),
                    orderBy('month', 'desc')
                );
                const invoicesSnapshot = await getDocs(invoicesQuery);
                
                const invoicesData = invoicesSnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as Invoice))
                    .filter(inv => inv.openTotal > 0.01);

                setInvoices(invoicesData);

                // Busca consumption_records por invoiceId para cada fatura
                const consumptionMap: Record<string, ConsumptionItem[]> = {};
                for (const invoice of invoicesData) {
                    const q1 = query(
                        collection(db, 'consumption_records'),
                        where('ownerId', '==', user.uid),
                        where('invoiceId', '==', invoice.id)
                    );
                    const q2 = query(
                        collection(db, 'consumption_records'),
                        where('ownerId', '==', user.uid),
                        where('customer_id', '==', debtor.customerId),
                        where('payLater', '==', true)
                    );
                    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
                    const seen = new Set<string>();
                    const merged: ConsumptionItem[] = [];
                    for (const d of [...snap1.docs, ...snap2.docs]) {
                        if (!seen.has(d.id)) {
                            seen.add(d.id);
                            merged.push({ id: d.id, ...d.data() } as ConsumptionItem);
                        }
                    }
                    consumptionMap[invoice.id] = merged.filter(item =>
                        (item as any).invoiceId === invoice.id ||
                        (item.date && item.date.startsWith(invoice.month))
                    ).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                }
                setConsumptionByInvoice(consumptionMap);

            } catch (err) {
                console.error("Erro ao buscar detalhes da dívida:", err);
                toast.error("Não foi possível carregar os detalhes da dívida.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [isOpen, debtor, user]);

    const handleWhatsAppClick = () => {
        if (!debtor?.customerPhone) {
            toast.error("Telefone não cadastrado", { description: "Este cliente não possui um número de telefone para contato." });
            return;
        }

        const sanitizedPhone = debtor.customerPhone.replace(/\D/g, '');
        if (sanitizedPhone.length < 10 || sanitizedPhone.length > 11) {
            toast.error("Telefone inválido", { description: `O número "${debtor.customerPhone}" não parece ser um telefone brasileiro válido.` });
            return;
        }
        const fullPhoneNumber = `55${sanitizedPhone}`;
        
        let message = `Olá, ${debtor.customerName}! Salve Deus.\nSegue o resumo das suas faturas em aberto na Cantina da Mãe Yara:\n\n`;

        invoices.forEach(invoice => {
            const monthName = format(parse(invoice.month, 'yyyy-MM', new Date()), "MMMM/yyyy", { locale: ptBR });
            const openTotalFormatted = formatCurrency(invoice.openTotal);
            message += `*${monthName}: ${openTotalFormatted}*\n`;
            const items = consumptionByInvoice[invoice.id] || [];
            // Agrupa por dia
            const byDay: Record<string, ConsumptionItem[]> = {};
            items.forEach(item => {
                const day = item.date || 'sem data';
                if (!byDay[day]) byDay[day] = [];
                byDay[day].push(item);
            });
            Object.keys(byDay).sort().forEach(day => {
                const dayLabel = day !== 'sem data'
                    ? format(new Date(day + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })
                    : 'Sem data';
                message += `  📅 ${dayLabel}\n`;
                byDay[day].forEach(item => {
                    message += `    - ${item.product_name} x${item.quantity}: ${formatCurrency(item.subtotal)}\n`;
                });
            });
            message += '\n';
        });

        const totalDebtFormatted = formatCurrency(debtor.totalDebt);
        message += `\n*TOTAL DA DÍVIDA: ${totalDebtFormatted}*\n\n`;
        message += "Para pagar, por favor, utilize o PIX da Cantina: alamanto@hotmail.com.br\n\nQualquer dúvida, estou à disposição!";

        window.open(`https://wa.me/${fullPhoneNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md md:max-w-lg max-h-[80vh] flex flex-col bg-gray-900 text-white border-gray-700">
                <DialogHeader>
                    <DialogTitle>{debtor ? `Detalhes da Dívida - ${debtor.customerName}`: 'Carregando...'}</DialogTitle>
                    <DialogDescription>
                        {debtor ? `Resumo da dívida de ${formatCurrency(debtor.totalDebt)}.` : 'Aguarde enquanto os detalhes são carregados.'}
                    </DialogDescription>
                    <DialogClose asChild><button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={24} /></button></DialogClose>
                </DialogHeader>
                <div className="flex-grow overflow-y-auto pr-4 -mr-4">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
                    ) : invoices.length === 0 ? (
                        <div className="text-center py-10"><p className="text-gray-400">Não há faturas para este cliente.</p></div>
                    ) : (
                        <Accordion type="single" collapsible className="space-y-2">
                            {invoices.map(invoice => {
                                const monthName = format(parse(invoice.month, 'yyyy-MM', new Date()), "MMMM/yyyy", { locale: ptBR });
                                const items = consumptionByInvoice[invoice.id] || [];
                                return (
                                    <AccordionItem key={invoice.id} value={invoice.id} className="bg-gray-800 rounded-md border border-gray-700 px-3">
                                        <AccordionTrigger className="hover:no-underline">
                                            <div className="flex justify-between items-center w-full pr-2">
                                                <span className="capitalize text-gray-300">{monthName}</span>
                                                <span className="font-bold text-red-400">{formatCurrency(invoice.openTotal)}</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {items.length === 0 ? (
                                                <p className="text-gray-500 text-sm py-2">Nenhum item de consumo encontrado.</p>
                                            ) : (
                                                <div className="space-y-1 pt-1 pb-2">
                                                    {items.map(item => (
                                                        <div key={item.id} className="flex justify-between items-center text-sm text-gray-400 py-1 border-t border-gray-700">
                                                            <span>{item.product_name} x{item.quantity}</span>
                                                            <span>{formatCurrency(item.subtotal)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    )}
                </div>
                <div className="pt-4 border-t border-gray-700">
                    <Button onClick={handleWhatsAppClick} className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={isLoading || invoices.length === 0 || !debtor?.customerPhone}>
                        <Smartphone className="mr-2 h-4 w-4" /> Enviar Resumo por WhatsApp
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const BillingPage: React.FC = () => {
    const { user, loading: authLoading } = useAuth() as { user: { uid: string } | null, loading: boolean };
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
                const q = query(
                    collection(db, "invoices"),
                    where("ownerId", "==", user.uid),
                    where("status", "!=", "canceled"),
                    where("openTotal", ">", 0)
                );

                const querySnapshot = await getDocs(q);

                const debtByCustomer: Record<string, { totalDebt: number; customerName: string, customerId: string }> = {};

                querySnapshot.forEach((doc) => {
                    const invoice = doc.data() as Invoice;
                    const customerId = invoice.customerId;
                    if (!customerId) return;

                    if (!debtByCustomer[customerId]) {
                        debtByCustomer[customerId] = { totalDebt: 0, customerName: invoice.customerName || 'Cliente sem nome', customerId };
                    }
                    debtByCustomer[customerId].totalDebt += invoice.openTotal;
                });

                const customerIdsWithDebt = Object.keys(debtByCustomer);
                const customersData: Record<string, Customer> = {};
                const chunks: string[][] = [];
                for (let i = 0; i < customerIdsWithDebt.length; i += 30) {
                    chunks.push(customerIdsWithDebt.slice(i, i + 30));
                }

                for (const chunk of chunks) {
                    if (chunk.length > 0) {
                        const customersQuery = query(collection(db, "customers"), where(documentId(), "in", chunk));
                        const customerSnapshots = await getDocs(customersQuery);
                        customerSnapshots.forEach(doc => { customersData[doc.id] = { id: doc.id, ...doc.data() } as Customer; });
                    }
                }

                const finalDebtors: Debtor[] = Object.values(debtByCustomer)
                    .map(debtor => ({
                        ...debtor,
                        customerName: customersData[debtor.customerId]?.name || debtor.customerName,
                        customerPhone: customersData[debtor.customerId]?.phone,
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
    const handleCloseModal = () => { setIsModalOpen(false); }; // setSelectedDebtor(null) é tratado no onOpenChange

    if (authLoading || loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    if (error) return <div className="bg-red-900 border border-red-700 text-red-100 p-4 m-4 rounded-md"><strong>Erro:</strong> {error}</div>;

    return (
        <>
            <div className="container mx-auto p-4 md:p-6 space-y-6">
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
                                <CardContent className="flex-grow flex flex-col justify-center items-center text-center">
                                     <div className="flex items-center gap-2">
                                        <DollarSign className="h-7 w-7 text-red-500" />
                                        <p className="text-4xl font-bold text-red-500">{formatCurrency(debtor.totalDebt)}</p>
                                    </div>
                                    <p className="text-sm text-gray-400 mt-1">Dívida Total</p>
                                </CardContent>
                                <CardFooter>
                                    <Button onClick={() => handleOpenModal(debtor)} variant="outline" className="w-full bg-gray-700 border-gray-600 hover:bg-gray-600"><Info className="mr-2 h-4 w-4" /> Ver Detalhes</Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {user && <DebtDetailModal isOpen={isModalOpen} onClose={handleCloseModal} debtor={selectedDebtor} user={user} />}
        </>
    );
};

export default BillingPage;
