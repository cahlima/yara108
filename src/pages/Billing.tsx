import { useState, useEffect, useCallback } from "react";
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
  ArrowLeft,
  ArrowRight,
  MoreVertical,
  MessageCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  customerName?: string;
  customerPhone?: string;
  month: string;
  total: number;
  paidTotal: number;
  openTotal: number;
  status: "OPEN" | "PARTIAL" | "PAID";
}

interface ConsumptionRecord {
  id: string;
  product_name: string;
  quantity: number;
  subtotal: number;
  date: string; // yyyy-MM-dd
}

const Billing = () => {
  const { user, loading: authLoading } = useAuth();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog (detalhes) controlado
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [details, setDetails] = useState<ConsumptionRecord[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(new Date());

  const fetchInvoices = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const monthStr = format(currentMonth, "yyyy-MM");

      const q = query(
        collection(db, "invoices"),
        where("ownerId", "==", user.uid),
        where("month", "==", monthStr),
        where("status", "in", ["OPEN", "PARTIAL"])
      );

      const snapshot = await getDocs(q);

      const invoicesData = await Promise.all(
        snapshot.docs.map(async (invoiceDoc) => {
          const data = invoiceDoc.data() as Omit<Invoice, "id" | "customerName" | "customerPhone">;

          // Busca cliente (nome/telefone) para exibição
          let customerName = "Cliente não encontrado";
          let customerPhone = "";

          try {
            const customerRef = doc(db, "customers", data.customerId);
            const customerSnap = await getDoc(customerRef);

            if (customerSnap.exists()) {
              const c = customerSnap.data() as { name?: string; phone?: string; ownerId?: string };

              // Se seu modelo exige ownerId em customers, mantenha essa validação:
              // (se não usa ownerId em customers, pode remover esse if)
              if (!c.ownerId || c.ownerId === user.uid) {
                customerName = c.name || customerName;
                customerPhone = c.phone || "";
              }
            }
          } catch (e) {
            // Não falhar a fatura por causa do cliente
            console.warn("Falha ao carregar cliente da fatura:", e);
          }

          return {
            id: invoiceDoc.id,
            ...data,
            customerName,
            customerPhone,
          } as Invoice;
        })
      );

      setInvoices(
        invoicesData.sort((a, b) =>
          (a.customerName || "").localeCompare(b.customerName || "")
        )
      );
    } catch (error) {
      console.error("Erro ao buscar faturas:", error);
      toast.error("Falha ao carregar faturas.");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [user, currentMonth]);

  useEffect(() => {
    if (!authLoading) fetchInvoices();
  }, [authLoading, fetchInvoices]);

  const handleFetchDetails = useCallback(
    async (invoiceId: string) => {
      if (!user) return;

      setDetailsLoading(true);
      setDetails([]);

      try {
        // ✅ importante: filtrar por ownerId também (consistência e segurança)
        const q = query(
          collection(db, "consumption_records"),
          where("ownerId", "==", user.uid),
          where("invoiceId", "==", invoiceId)
        );

        const snapshot = await getDocs(q);
        const recordsData = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as ConsumptionRecord)
        );

        setDetails(recordsData.sort((a, b) => a.date.localeCompare(b.date)));
      } catch (e) {
        const err = e as FirestoreError;
        console.error("Erro ao buscar detalhes da fatura:", err);
        toast.error(`Falha ao carregar detalhes: ${err.message}`);
      } finally {
        setDetailsLoading(false);
      }
    },
    [user]
  );

  const openDetails = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDetailsOpen(true);
    await handleFetchDetails(invoice.id);
  };

  const handleCharge = (invoice: Invoice) => {
    const phone = invoice.customerPhone?.replace(/\D/g, "");
    if (!phone) {
      toast.error("Telefone do cliente não cadastrado para enviar mensagem.");
      return;
    }

    const message =
      `Olá, ${invoice.customerName}! ` +
      `Sua fatura de ${format(currentMonth, "MMMM/yyyy", { locale: ptBR })} ` +
      `no valor de R$ ${invoice.openTotal.toFixed(2).replace(".", ",")} está em aberto.`;

    const url = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  const changeMonth = (amount: number) => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
  };

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Faturamento em Aberto</h2>
          <p className="text-muted-foreground">
            Clientes com pendências no mês selecionado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => changeMonth(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <span className="font-semibold text-lg w-40 text-center capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </span>

          <Button variant="outline" size="icon" onClick={() => changeMonth(1)}>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Info className="mx-auto h-12 w-12" />
          <p className="mt-4">Nenhuma fatura em aberto para este mês.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {invoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium">{invoice.customerName}</CardTitle>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleCharge(invoice)}>
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Cobrar no WhatsApp
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>

              <CardContent>
                <div className="text-3xl font-bold text-destructive">
                  R$ {invoice.openTotal.toFixed(2).replace(".", ",")}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total: R$ {invoice.total.toFixed(2).replace(".", ",")} / Pago: R${" "}
                  {invoice.paidTotal.toFixed(2).replace(".", ",")}
                </p>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => openDetails(invoice)}
                >
                  Ver Detalhes
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* ✅ UM ÚNICO DIALOG CONTROLADO */}
      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setSelectedInvoice(null);
            setDetails([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Detalhes da Fatura{selectedInvoice ? ` - ${selectedInvoice.customerName}` : ""}
            </DialogTitle>
          </DialogHeader>

          {detailsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto pr-2">
              <ul className="space-y-2">
                {details.map((record) => (
                  <li
                    key={record.id}
                    className="flex justify-between items-center text-sm p-2 border-b"
                  >
                    <span>
                      {record.product_name} (x{record.quantity}){" "}
                      <em className="text-xs text-muted-foreground">
                        {format(parseISO(record.date), "dd/MM")}
                      </em>
                    </span>
                    <span className="font-medium">
                      R$ {record.subtotal.toFixed(2).replace(".", ",")}
                    </span>
                  </li>
                ))}
                {details.length === 0 && !detailsLoading && (
                  <p className="text-sm text-center text-muted-foreground py-4">
                    Nenhum detalhe encontrado para esta fatura.
                  </p>
                )}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Billing;
