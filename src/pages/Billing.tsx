
import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  FirestoreError,
} from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2,
  MoreVertical,
  MessageCircle,
  Info,
  Send,
  Search
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


interface Invoice {
  id: string;
  ownerId: string;
  customerId: string;
  month: string;
  total: number;
  paidTotal: number;
  openTotal: number;
  status: "OPEN" | "PARTIAL" | "PAID";
}

interface AggregatedInvoice {
  customerId: string;
  customerName: string;
  customerPhone: string;
  totalOpen: number;
  invoiceIds: string[];
}

interface ConsumptionRecord {
    id: string;
    date: string; // "yyyy-MM-dd"
    product_name: string;
    quantity: number;
    subtotal: number;
}

interface DailyConsumption {
    date: string;
    total: number;
    records: ConsumptionRecord[];
}


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


  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "invoices"),
        where("ownerId", "==", user.uid),
        where("status", "in", ["OPEN", "PARTIAL"])
      );
      const snapshot = await getDocs(q);

      const invoicesData = await Promise.all(
        snapshot.docs.map(async (invoiceDoc) => {
          const data = invoiceDoc.data() as Omit<Invoice, "id" | "customerName" | "customerPhone">;
          let customerName = "Cliente não encontrado";
          let customerPhone = "";
          try {
            const customerRef = doc(db, "customers", data.customerId);
            const customerSnap = await getDoc(customerRef);
            if (customerSnap.exists()) {
              const c = customerSnap.data() as { name?: string; phone?: string; };
              customerName = c.name || customerName;
              customerPhone = c.phone || "";
            }
          } catch (e) {
            console.warn("Falha ao carregar cliente da fatura:", e);
          }
          return {
            id: invoiceDoc.id,
            ...data,
            customerName,
            customerPhone,
          } as Invoice & { customerName: string; customerPhone: string };
        })
      );

      const aggregationMap: Record<string, AggregatedInvoice> = {};
      for (const invoice of invoicesData) {
        if (!aggregationMap[invoice.customerId]) {
          aggregationMap[invoice.customerId] = {
            customerId: invoice.customerId,
            customerName: invoice.customerName,
            customerPhone: invoice.customerPhone,
            totalOpen: 0,
            invoiceIds: [],
          };
        }
        aggregationMap[invoice.customerId].totalOpen += invoice.openTotal;
        aggregationMap[invoice.customerId].invoiceIds.push(invoice.id);
      }

      const aggregatedArray = Object.values(aggregationMap)
                                    .sort((a, b) => a.customerName.localeCompare(b.customerName));

      setAggregatedInvoices(aggregatedArray);

    } catch (error) {
      console.error("Erro ao buscar faturas:", error);
      toast.error("Falha ao carregar faturas.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      fetchInvoices();
    }
  }, [authLoading, fetchInvoices]);

  const handleFetchInvoiceDetails = useCallback(async (invoiceIds: string[]) => {
    if (!user) return;
    setDetailsLoading(true);
    try {
        const invoiceDocs = await Promise.all(invoiceIds.map(id => getDoc(doc(db, "invoices", id))));
        const invoices = invoiceDocs
            .map(d => ({id: d.id, ...d.data()}) as Invoice)
            .filter(inv => inv.openTotal > 0);
        setDetailedInvoices(invoices.sort((a,b) => b.month.localeCompare(a.month)));
    } catch(e) {
        toast.error("Erro ao carregar os detalhes das faturas.");
    } finally {
        setDetailsLoading(false);
    }
  }, [user]);

  const fetchConsumptionForInvoice = useCallback(async (invoiceId: string | undefined) => {
    if (!user || !invoiceId || consumptionDetails[invoiceId]) return;

    setConsumptionLoading(prev => ({ ...prev, [invoiceId]: true }));
    try {
        const q = query(
            collection(db, "consumption_records"),
            where("ownerId", "==", user.uid),
            where("invoiceId", "==", invoiceId)
        );

        const snapshot = await getDocs(q);
        const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ConsumptionRecord));

        const dailyMap: Record<string, DailyConsumption> = {};
        for (const record of records) {
            if (!dailyMap[record.date]) {
                dailyMap[record.date] = { date: record.date, total: 0, records: [] };
            }
            dailyMap[record.date].total += record.subtotal;
            dailyMap[record.date].records.push(record);
        }

        const sortedDailyConsumption = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

        setConsumptionDetails(prev => ({ ...prev, [invoiceId]: sortedDailyConsumption }));

    } catch (e) {
        console.error("Erro ao buscar consumo:", e);
        toast.error("Erro ao detalhar consumo da fatura.");
    } finally {
        setConsumptionLoading(prev => ({ ...prev, [invoiceId]: false }));
    }
  }, [user, consumptionDetails]);
  
 const handleSendConsumption = (customer: AggregatedInvoice | null, invoice: Invoice, details: DailyConsumption[]) => {
    if (!customer || !details || details.length === 0) {
        toast.error("Não há dados de consumo para enviar.");
        return;
    }
    const phone = customer.customerPhone?.replace(/\D/g, "");
    if (!phone) {
      toast.error("Telefone do cliente não cadastrado.");
      return;
    }

    let message = `Olá, ${customer.customerName}! Salve Deus. Segue o detalhamento da sua fatura de ${format(parseISO(invoice.month + '-02'), "MMMM/yyyy", { locale: ptBR })}:\n\n`;
    
    details.forEach(day => {
        message += `*${format(parseISO(day.date), "dd/MM/yyyy")}* - Total: R$ ${day.total.toFixed(2).replace('.', ',')}\n`;
        day.records.forEach(r => {
            message += `  - ${r.product_name} (x${r.quantity}): R$ ${r.subtotal.toFixed(2).replace('.', ',')}\n`;
        });
        message += `\n`;
    });

    message += `*Total da fatura:* R$ ${invoice.openTotal.toFixed(2).replace('.', ',')}\n`;
    message += `*Dívida Total (incluindo outras faturas):* R$ ${customer.totalOpen.toFixed(2).replace('.', ',')}\n\n`;
    message += `Para pagar, utilize o PIX: alamanto@hotmail.com.br`;

    const url = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  const openDetails = (agg: AggregatedInvoice) => {
    setSelectedAggregate(agg);
    setDetailsOpen(true);
    setConsumptionDetails({});
    setConsumptionLoading({});
    handleFetchInvoiceDetails(agg.invoiceIds);
  };

  const handleCharge = (agg: AggregatedInvoice) => {
    const phone = agg.customerPhone?.replace(/\D/g, "");
    if (!phone) {
      toast.error("Telefone do cliente não cadastrado para enviar mensagem.");
      return;
    }

    const message =
      `Olá, ${agg.customerName}! Salve Deus. A paz de Deus! Segue os debitos da Cantina da Mãe Yara. ` +
      `Total: R$ ${agg.totalOpen.toFixed(2).replace(".", ",")}. ` +
      `Para pagar, utilize o PIX: alamanto@hotmail.com.br`;

    const url = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  const filteredInvoices = useMemo(() => {
    if (!searchTerm) {
      return aggregatedInvoices;
    }
    return aggregatedInvoices.filter((invoice) =>
      invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, aggregatedInvoices]);

  if (authLoading || loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Info className="mx-auto h-12 w-12" />
        <p className="mt-4">Você precisa estar logado para ver o faturamento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Faturamento por Cliente</h2>
          <p className="text-muted-foreground">Clientes com faturas em aberto.</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
                placeholder="Buscar por cliente..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>
      {aggregatedInvoices.length > 0 && filteredInvoices.length === 0 && (
          <div className="text-center py-16 text-muted-foreground"><Info className="mx-auto h-12 w-12" /><p className="mt-4">Nenhum cliente encontrado com o termo "{searchTerm}".</p></div>
      )}
      {filteredInvoices.length === 0 && searchTerm === '' && aggregatedInvoices.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Info className="mx-auto h-12 w-12" /><p className="mt-4">Nenhum cliente com faturas em aberto.</p></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredInvoices.map((agg) => (
            <Card key={agg.customerId}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <CardTitle className="text-lg font-medium">{agg.customerName}</CardTitle>
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handleCharge(agg)}><MessageCircle className="mr-2 h-4 w-4" />Cobrar Dívida Total</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-destructive">R$ {agg.totalOpen.toFixed(2).replace(".", ",")}</div>
                <p className="text-xs text-muted-foreground">{agg.invoiceIds.length} fatura(s) em aberto.</p>
              </CardContent>
              <CardFooter><Button className="w-full" variant="outline" onClick={() => openDetails(agg)}>Ver Detalhes</Button></CardFooter>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl" aria-describedby="dialog-description">
          <DialogHeader>
            <DialogTitle>Detalhes da Dívida - {selectedAggregate?.customerName}</DialogTitle>
            <DialogDescription id="dialog-description">Faturas em aberto que compõem o valor total devido.</DialogDescription>
          </DialogHeader>
          {detailsLoading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto pr-2">
              {detailedInvoices.length > 0 ? (
                <Accordion type="single" collapsible className="w-full space-y-3" onValueChange={fetchConsumptionForInvoice}>
                  {detailedInvoices.map((invoice) => (
                    <AccordionItem value={invoice.id} key={invoice.id} className="border rounded-md px-3">
                      <AccordionTrigger>
                          <div className="flex justify-between w-full items-center pr-4">
                            <span className="font-semibold capitalize text-base">{format(parseISO(invoice.month + '-02'), "MMMM/yyyy", { locale: ptBR })}</span>
                            <span className="font-medium text-destructive text-lg">R$ {invoice.openTotal.toFixed(2).replace('.', ',')}</span>
                          </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {consumptionLoading[invoice.id] ? (
                            <Loader2 className="h-6 w-6 animate-spin mx-auto my-4" />
                        ) : (
                           consumptionDetails[invoice.id] && consumptionDetails[invoice.id].length > 0 ? (
                            <div className="space-y-4 pt-2">
                               {consumptionDetails[invoice.id].map(daily => (
                                   <div key={daily.date} className="text-sm">
                                       <p className="font-bold text-muted-foreground">{format(parseISO(daily.date), "dd/MM/yyyy")} - Total: R$ {daily.total.toFixed(2).replace('.', ',')}</p>
                                       <ul className="list-disc list-inside pl-4 text-gray-600">
                                           {daily.records.map(rec => (
                                               <li key={rec.id}>{rec.product_name} (x{rec.quantity}) - R$ {rec.subtotal.toFixed(2).replace('.', ',')}</li>
                                           ))}
                                       </ul>
                                   </div>
                               ))}
                               <Button size="sm" className="w-full mt-4" onClick={() => handleSendConsumption(selectedAggregate, invoice, consumptionDetails[invoice.id])}>
                                   <Send className="w-4 h-4 mr-2"/>
                                   Enviar Detalhes da Fatura
                               </Button>
                            </div>
                           ) : <p className="text-center text-sm text-muted-foreground py-4">Nenhum consumo encontrado para esta fatura.</p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                 <p className="text-sm text-center text-muted-foreground py-4">Nenhuma fatura em aberto encontrada para este cliente.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Billing;
