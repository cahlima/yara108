
import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  orderBy,
  Timestamp,
  documentId
} from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO }from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, MoreVertical, MessageCircle, Info, Send, Search, History, TrendingUp, Users, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// --- Interfaces ---
interface Invoice {
    id: string;
    month: string;
    total: number;
    paidTotal: number;
    openTotal: number;
    status: 'OPEN' | 'PARTIAL' | 'PAID';
}

interface AggregatedInvoice {
    customerId: string;
    customerName: string;
    totalOpen: number;
    invoiceCount: number;
    invoiceIds: string[];
}

interface Customer {
    id: string;
    name: string;
    phone?: string;
}

interface ConsumptionRecord {
    id: string;
    date: string;
    product_name: string;
    quantity: number;
    subtotal: number;
}

interface DailyConsumption {
    date: string;
    total: number;
    records: ConsumptionRecord[];
}

interface PaymentRecord {
    id: string;
    amount: number;
    paidAt: Timestamp;
    method: string;
    note?: string;
}

// --- Componente ---
const Billing = () => {
  const { user, loading: authLoading } = useAuth();
  const [aggregatedInvoices, setAggregatedInvoices] = useState<AggregatedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedAggregate, setSelectedAggregate] = useState<AggregatedInvoice | null>(null);
  const [detailedInvoices, setDetailedInvoices] = useState<Invoice[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [consumptionDetails, setConsumptionDetails] = useState<Record<string, DailyConsumption[]>>({});
  const [consumptionLoading, setConsumptionLoading] = useState<Record<string, boolean>>({});

  // --- Estados para Histórico de Pagamento ---
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedInvoiceForHistory, setSelectedInvoiceForHistory] = useState<Invoice | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
        const q = query(
            collection(db, "invoices"),
            where("ownerId", "==", user.uid),
            where("openTotal", ">", 0.01),
            where("status", "in", ["OPEN", "PARTIAL"])
        );
        const snapshot = await getDocs(q);
        const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const customerIds = [...new Set(invoices.map(inv => inv.customerId))];
        let customers: Record<string, Customer> = {};

        if (customerIds.length > 0) {
            const CHUNK_SIZE = 30;
            for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
                const chunk = customerIds.slice(i, i + CHUNK_SIZE);
                const custQuery = query(collection(db, "customers"), where(documentId(), "in", chunk));
                const custSnapshot = await getDocs(custQuery);
                custSnapshot.docs.forEach(doc => {
                    customers[doc.id] = { id: doc.id, ...doc.data() } as Customer;
                });
            }
        }

        const aggregation: Record<string, AggregatedInvoice> = {};
        for (const inv of invoices) {
            const customerId = inv.customerId;
            if (!aggregation[customerId]) {
                aggregation[customerId] = {
                    customerId: customerId,
                    customerName: customers[customerId]?.name || "Cliente não encontrado",
                    totalOpen: 0,
                    invoiceCount: 0,
                    invoiceIds: [],
                };
            }
            aggregation[customerId].totalOpen += inv.openTotal;
            aggregation[customerId].invoiceCount += 1;
            aggregation[customerId].invoiceIds.push(inv.id);
        }
        
        const finalAggregates = Object.values(aggregation)
            .filter(agg => agg.totalOpen > 0)
            .sort((a, b) => b.totalOpen - a.totalOpen);

        setAggregatedInvoices(finalAggregates);

    } catch (error) {
        console.error("Erro ao buscar faturas:", error);
        toast.error("Falha ao carregar o faturamento.");
    } finally {
        setLoading(false);
    }
  }, [user, refreshKey]);

  useEffect(() => {
      if (!authLoading) {
          fetchInvoices();
      }
  }, [authLoading, fetchInvoices]);

  const openDetails = useCallback(async (aggregate: AggregatedInvoice) => {
    setSelectedAggregate(aggregate);
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailedInvoices([]);
    setConsumptionDetails({});

    if (!user || !aggregate.invoiceIds || aggregate.invoiceIds.length === 0) {
        setDetailsLoading(false);
        return;
    }
    
    try {
        const q = query(
            collection(db, "invoices"), 
            where(documentId(), "in", aggregate.invoiceIds),
            orderBy("month", "asc")
        );
        const snapshot = await getDocs(q);
        const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        setDetailedInvoices(invoices);

    } catch (e) {
        toast.error("Erro ao carregar detalhes da fatura.");
        console.error(e)
    } finally {
        setDetailsLoading(false);
    }
  }, [user]);

  const fetchConsumptionForInvoice = useCallback(async (invoiceId: string) => {
    if (consumptionDetails[invoiceId] || consumptionLoading[invoiceId]) return;

    setConsumptionLoading(prev => ({ ...prev, [invoiceId]: true }));
    try {
        const recordsQuery = query(
            collection(db, "invoices", invoiceId, "consumption_records"),
            orderBy("date", "asc")
        );
        const snapshot = await getDocs(recordsQuery);
        const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ConsumptionRecord));

        const daily: Record<string, DailyConsumption> = {};
        for (const record of records) {
            const date = record.date;
            if (!daily[date]) {
                daily[date] = { date, total: 0, records: [] };
            }
            daily[date].records.push(record);
            daily[date].total += record.subtotal;
        }

        setConsumptionDetails(prev => ({ ...prev, [invoiceId]: Object.values(daily) }));

    } catch (e) {
        console.error("Erro ao buscar consumo:", e);
        toast.error(`Falha ao carregar o consumo da fatura ${invoiceId.split('_')[2]}.`);
    } finally {
        setConsumptionLoading(prev => ({ ...prev, [invoiceId]: false }));
    }
}, [consumptionDetails, consumptionLoading]);


  const fetchPaymentHistory = async (invoiceId: string) => {
    if (!user) return;
    setHistoryLoading(true);
    setPaymentHistory([]);
    try {
        const q = query(
            collection(db, "payment_records"),
            where("ownerId", "==", user.uid),
            where("invoiceId", "==", invoiceId),
            orderBy("paidAt", "desc")
        );
        const snapshot = await getDocs(q);
        const history = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PaymentRecord));
        setPaymentHistory(history);
    } catch (e) {
        console.error("Erro ao buscar histórico de pagamentos:", e);
        toast.error("Falha ao carregar o histórico de pagamentos.");
    } finally {
        setHistoryLoading(false);
    }
  };

  const handleHistoryClick = (invoice: Invoice) => {
    setSelectedInvoiceForHistory(invoice);
    setHistoryOpen(true);
    fetchPaymentHistory(invoice.id);
  };

    const generateWhatsAppMessage = useCallback(async () => {
    if (!selectedAggregate) return;

    try {
        const customerDoc = await getDoc(doc(db, "customers", selectedAggregate.customerId));
        const customer = customerDoc.data() as Customer;
        const phone = customer?.phone?.replace(/\D/g, '');

        if (!phone) {
            toast.error("Cliente sem número de telefone cadastrado.");
            return;
        }

        let message = `Olá, ${selectedAggregate.customerName}!\n\n`;
        message += `Segue o resumo de suas faturas em aberto:\n\n`;

        detailedInvoices.forEach(invoice => {
            const month = format(parseISO(invoice.month + '-02'), "MMMM/yyyy", { locale: ptBR });
            message += `*${month.charAt(0).toUpperCase() + month.slice(1)}*\n`;
            message += `Valor em aberto: R$ ${invoice.openTotal.toFixed(2).replace('.', ',')}\n\n`;
        });

        const totalDebt = detailedInvoices.reduce((sum, inv) => sum + inv.openTotal, 0);
        message += `*Dívida Total: R$ ${totalDebt.toFixed(2).replace('.', ',')}*\n\n`;
        message += `Agradecemos a sua preferência!`;

        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/55${phone}?text=${encodedMessage}`, '_blank');
        toast.success("Mensagem para WhatsApp gerada!");

    } catch (error) {
        console.error("Erro ao gerar mensagem para WhatsApp:", error);
        toast.error("Não foi possível obter o número do cliente.");
    }
}, [selectedAggregate, detailedInvoices]);


  const filteredInvoices = useMemo(() => {
    return aggregatedInvoices.filter(inv =>
      inv.customerName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, aggregatedInvoices]);

  const totalDebt = useMemo(() => filteredInvoices.reduce((sum, inv) => sum + inv.totalOpen, 0), [filteredInvoices]);
  const totalCustomersWithDebt = useMemo(() => filteredInvoices.length, [filteredInvoices]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };
  
  if (loading && aggregatedInvoices.length === 0) {
      return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
          <div>
              <h2 className="text-3xl font-bold tracking-tight">Faturamento</h2>
              <p className="text-muted-foreground">Clientes com faturas em aberto.</p>
          </div>
          <Button onClick={handleRefresh} variant="outline" disabled={loading}>
              <Loader2 className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : 'hidden'}`} />
              Atualizar
          </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dívida Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {totalDebt.toFixed(2).replace('.', ',')}</div>
            <p className="text-xs text-muted-foreground">Soma de todas as dívidas em aberto.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Devedores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomersWithDebt}</div>
            <p className="text-xs text-muted-foreground">Número de clientes com saldo devedor.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Detalhes por Cliente</CardTitle>
            <div className="relative mt-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar cliente..." className="pl-8" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
        </CardHeader>
        <CardContent className="space-y-4">
            {filteredInvoices.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredInvoices.map(agg => (
                        <Card key={agg.customerId} className="flex flex-col">
                            <CardHeader>
                                <CardTitle className="text-lg">{agg.customerName}</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-grow">
                                <p className="text-2xl font-bold">R$ {agg.totalOpen.toFixed(2).replace('.', ',')}</p>
                                <p className="text-sm text-muted-foreground">{agg.invoiceCount} fatura(s) em aberto</p>
                            </CardContent>
                            <CardFooter className="flex space-x-2">
                                <Button onClick={() => openDetails(agg)} className="flex-1">
                                    <Info className="mr-2 h-4 w-4" /> Ver Detalhes
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-10">
                    <p className="text-muted-foreground">Nenhum cliente com faturas em aberto encontrado.</p>
                </div>
            )}
        </CardContent>
      </Card>
        
        {/* --- MODAL DE DETALHES DA DÍVIDA --- */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Faturas de {selectedAggregate?.customerName}</DialogTitle>
                    <DialogDescription>
                        Detalhes das faturas em aberto, ordenadas da mais antiga para a mais recente.
                    </DialogDescription>
                </DialogHeader>
                {detailsLoading ? (
                    <div className="flex items-center justify-center py-6"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : (
                    <>
                        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3">
                            {detailedInvoices.length > 0 ? (
                                <Accordion type="single" collapsible className="w-full" onValueChange={(value) => value && fetchConsumptionForInvoice(value)}>
                                    {detailedInvoices.map((invoice) => (
                                    <AccordionItem value={invoice.id} key={invoice.id} className="border rounded-md px-3">
                                        <AccordionTrigger>
                                            <div className="flex justify-between w-full items-center pr-4">
                                                <span className="font-semibold text-lg capitalize">{format(parseISO(invoice.month + '-02'), "MMMM/yyyy", { locale: ptBR })}</span>
                                                <div className="text-right">
                                                    <p className="font-bold text-base">R$ {invoice.openTotal.toFixed(2).replace('.', ',')}</p>
                                                    <p className="text-xs text-muted-foreground">Total: R$ {invoice.total.toFixed(2).replace('.', ',')}</p>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                             {consumptionLoading[invoice.id] ? (
                                                <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
                                            ) : consumptionDetails[invoice.id] && consumptionDetails[invoice.id].length > 0 ? (
                                                <div className="space-y-3 pt-2">
                                                    {consumptionDetails[invoice.id].map(day => (
                                                        <div key={day.date} className="text-sm">
                                                            <p className="font-semibold border-b pb-1 mb-1">{format(parseISO(day.date), "dd/MM/yyyy", { locale: ptBR })} - Total Dia: R$ {day.total.toFixed(2).replace('.', ',')}</p>
                                                            <ul className="list-disc pl-5 space-y-1">
                                                                {day.records.map(rec => <li key={rec.id}>{rec.quantity}x {rec.product_name} = R$ {rec.subtotal.toFixed(2).replace('.', ',')}</li>)}
                                                            </ul>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-center text-sm text-muted-foreground py-4">Nenhum consumo registrado para esta fatura.</p>
                                            )}
                                            <div className="mt-4 pt-2 border-t">
                                                <Button variant="outline" size="sm" className="w-full" onClick={() => handleHistoryClick(invoice)}>
                                                    <History className="w-4 h-4 mr-2"/>
                                                    Ver Histórico de Pagamentos
                                                </Button>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                    ))}
                                </Accordion>
                            ) : (<p className="text-center py-8 text-muted-foreground">Não há faturas em aberto para este cliente.</p>)}
                        </div>
                        <DialogFooter className="!mt-4 flex-col-reverse sm:flex-row sm:justify-between sm:space-x-2">
                             <Button onClick={generateWhatsAppMessage} className="w-full sm:w-auto" disabled={detailedInvoices.length === 0}>
                                <MessageCircle className="mr-2 h-4 w-4" /> Enviar por WhatsApp
                            </Button>
                            <Button onClick={() => setDetailsOpen(false)} variant="ghost" className="w-full sm:w-auto">Fechar</Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>

        {/* --- MODAL DE HISTÓRICO DE PAGAMENTOS (C.9) --- */}
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Histórico de Pagamentos</DialogTitle>
                    <DialogDescription>
                        Pagamentos realizados para a fatura de {selectedInvoiceForHistory ? format(parseISO(selectedInvoiceForHistory.month + '-02'), "MMMM/yyyy", { locale: ptBR }) : ''}
                    </DialogDescription>
                </DialogHeader>
                {historyLoading ? (
                    <div className="flex items-center justify-center py-6"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : (
                    <div className="max-h-[50vh] overflow-y-auto pr-2">
                        {paymentHistory.length > 0 ? (
                            <ul className="space-y-3">
                                {paymentHistory.map(p => (
                                    <li key={p.id} className="text-sm p-3 bg-secondary rounded-md flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold">R$ {p.amount.toFixed(2).replace('.', ',')}</p>
                                            <p className="text-muted-foreground">{format(p.paidAt.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                                            <p className="text-xs text-muted-foreground mt-1">Método: {p.method}</p>
                                            {p.note && <p className="text-xs italic mt-2 border-l-2 pl-2">Nota: "{p.note}"</p>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-center text-muted-foreground py-8">Nenhum pagamento registrado para esta fatura.</p>
                        )}
                    </div>
                )}
                 <DialogFooter className="!mt-4">
                    <Button onClick={() => setHistoryOpen(false)} variant="ghost">Fechar</Button>
                </DialogFooter>
            </DialogContent>
      </Dialog>
    </div>
  );
};

export default Billing;
