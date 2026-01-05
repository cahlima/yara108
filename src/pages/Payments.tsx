import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, runTransaction, Timestamp, FirestoreError } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Invoice {
  id: string;
  month: string;
  openTotal: number;
  customerName?: string;
}

interface Customer {
  id: string;
  name: string;
}

const Payments = () => {
  const { user, authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string | undefined>();
  const [selectedInvoice, setSelectedInvoice] = useState<string | undefined>();
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchCustomers = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const q = query(collection(db, "customers"), where("ownerId", "==", user.uid));
        const snapshot = await getDocs(q);
        const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
        setCustomers(customersData.sort((a,b) => a.name.localeCompare(b.name)));
      } catch (error) {
        toast.error("Falha ao carregar clientes.");
      } finally {
        setLoading(false);
      }
    };
    if (!authLoading) {
      fetchCustomers();
    }
  }, [user, authLoading]);

  const fetchInvoicesForCustomer = useCallback(async (customerId: string) => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "invoices"),
        where("ownerId", "==", user.uid),
        where("customerId", "==", customerId),
        where("status", "in", ["OPEN", "PARTIAL"])
      );
      const snapshot = await getDocs(q);
      const invoicesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setInvoices(invoicesData);
      if (invoicesData.length > 0) {
        setSelectedInvoice(invoicesData[0].id);
        const openTotal = invoicesData[0].openTotal;
        setAmount(openTotal.toFixed(2).replace('.', ','));
      } else {
        toast.info("Este cliente não possui faturas em aberto.");
        setInvoices([]);
        setSelectedInvoice(undefined);
        setAmount("");
      }
    } catch (error) {
        toast.error("Falha ao buscar faturas do cliente.");
    }
  }, [user]);

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomer(customerId);
    fetchInvoicesForCustomer(customerId);
  };

  const handleInvoiceChange = (invoiceId: string) => {
    setSelectedInvoice(invoiceId);
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (invoice) {
        setAmount(invoice.openTotal.toFixed(2).replace('.', ','));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedInvoice || !selectedCustomer) {
        toast.error("Selecione o cliente, a fatura e o valor do pagamento.");
        return;
    }

    const paymentAmount = parseFloat(amount.replace(",", "."));
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        toast.error("O valor do pagamento é inválido.");
        return;
    }

    setIsSubmitting(true);
    try {
        await runTransaction(db, async (transaction) => {
            const invoiceRef = doc(db, "invoices", selectedInvoice);
            const invoiceDoc = await transaction.get(invoiceRef);
            if (!invoiceDoc.exists()) {
                throw new Error("Fatura não encontrada.");
            }

            const invoiceData = invoiceDoc.data();
            const newPaidTotal = invoiceData.paidTotal + paymentAmount;
            const newOpenTotal = invoiceData.openTotal - paymentAmount;
            
            let newStatus = invoiceData.status;
            if (newOpenTotal <= 0) {
                newStatus = "PAID";
            } else if (newPaidTotal > 0) {
                newStatus = "PARTIAL";
            }

            // 1. Update invoice
            transaction.update(invoiceRef, {
                paidTotal: newPaidTotal,
                openTotal: newOpenTotal < 0 ? 0 : newOpenTotal,
                status: newStatus,
                updatedAt: Timestamp.now(),
            });

            // 2. Create payment record
            const paymentRef = doc(collection(db, "payments"));
            transaction.set(paymentRef, {
                ownerId: user.uid,
                customerId: selectedCustomer,
                invoiceId: selectedInvoice,
                amount: paymentAmount,
                method: paymentMethod,
                paidAt: format(new Date(), "yyyy-MM-dd"),
                createdAt: Timestamp.now(),
            });
        });

        toast.success("Pagamento registrado com sucesso!");
        // Reset form
        setSelectedCustomer(undefined);
        setInvoices([]);
        setSelectedInvoice(undefined);
        setAmount("");
        setPaymentMethod("PIX");

    } catch (e) {
        const err = e as FirestoreError;
        console.error("Erro ao registrar pagamento:", err);
        toast.error(`Falha ao registrar pagamento: ${err.message}`);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
        <div className="text-center">
            <h2 className="text-3xl font-bold text-foreground">Registrar Pagamento</h2>
            <p className="text-muted-foreground">Dê baixa em faturas em aberto de seus clientes.</p>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Novo Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label>Cliente</Label>
                        <Select onValueChange={handleCustomerChange} value={selectedCustomer}>
                            <SelectTrigger><SelectValue placeholder="Selecione o cliente..."/></SelectTrigger>
                            <SelectContent>
                                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedCustomer && invoices.length > 0 && (
                        <div>
                            <Label>Fatura em Aberto</Label>
                             <Select onValueChange={handleInvoiceChange} value={selectedInvoice}>
                                <SelectTrigger><SelectValue placeholder="Selecione a fatura..."/></SelectTrigger>
                                <SelectContent>
                                    {invoices.map(inv => <SelectItem key={inv.id} value={inv.id}>Mês: {inv.month} / Aberto: R$ {inv.openTotal.toFixed(2)}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div>
                        <Label htmlFor="amount">Valor do Pagamento (R$)</Label>
                        <Input id="amount" value={amount} onChange={e => setAmount(e.target.value)} type="text" inputMode="decimal" placeholder="Ex: 123,45"/>
                    </div>

                    <div>
                        <Label>Método de Pagamento</Label>
                        <Select onValueChange={setPaymentMethod} value={paymentMethod}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PIX">PIX</SelectItem>
                                <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                                <SelectItem value="CARTAO">Cartão</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <Button type="submit" className="w-full" disabled={isSubmitting || !selectedInvoice}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <DollarSign className="h-4 w-4 mr-2"/>}
                        Registrar Pagamento
                    </Button>
                </form>
            </CardContent>
        </Card>
    </div>
  );
};

export default Payments;
