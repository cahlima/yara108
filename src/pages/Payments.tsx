
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, runTransaction, Timestamp, FirestoreError, orderBy } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Keep Invoice type, it's useful
interface Invoice {
  id: string;
  month: string; // Used for sorting
  openTotal: number;
  // other fields are not needed for this component's logic
}

interface Customer {
  id: string;
  name: string;
}

const Payments = () => {
  const { user, authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]); // Store invoices to be paid
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch customers once
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

  // This will be triggered when a customer is selected
  const handleCustomerChange = useCallback(async (customerId: string) => {
    setSelectedCustomer(customerId);
    if (!customerId) {
        setOpenInvoices([]);
        setAmount("");
        return;
    }
    if (!user) return;
    
    try {
      const q = query(
        collection(db, "invoices"),
        where("ownerId", "==", user.uid),
        where("customerId", "==", customerId),
        where("status", "in", ["OPEN", "PARTIAL"]),
        orderBy("month") // Sort by month to pay oldest first
      );
      const snapshot = await getDocs(q);
      const invoicesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      
      setOpenInvoices(invoicesData);

      if (invoicesData.length > 0) {
        const totalDebt = invoicesData.reduce((sum, inv) => sum + inv.openTotal, 0);
        setAmount(totalDebt.toFixed(2).replace('.', ','));
      } else {
        toast.info("Este cliente não possui faturas em aberto.");
        setAmount("");
      }
    } catch (error) {
        toast.error("Falha ao buscar as faturas do cliente.");
        setOpenInvoices([]);
        setAmount("");
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedCustomer || openInvoices.length === 0) {
        toast.error("Selecione um cliente com dívidas pendentes.");
        return;
    }

    const paymentAmount = parseFloat(amount.replace(",", "."));
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        toast.error("O valor do pagamento é inválido.");
        return;
    }
    
    const totalDebt = openInvoices.reduce((sum, inv) => sum + inv.openTotal, 0);
    if (paymentAmount > totalDebt) {
        toast.error(`O valor do pagamento (R$ ${paymentAmount.toFixed(2)}) não pode ser maior que a dívida total (R$ ${totalDebt.toFixed(2)}).`);
        return;
    }

    setIsSubmitting(true);
    try {
        await runTransaction(db, async (transaction) => {
            let remainingAmountToPay = paymentAmount;

            // Use the already fetched and sorted openInvoices
            for (const invoice of openInvoices) {
                if (remainingAmountToPay <= 0) break;

                const invoiceRef = doc(db, "invoices", invoice.id);
                const invoiceDoc = await transaction.get(invoiceRef);
                if (!invoiceDoc.exists()) {
                    throw new Error(`Fatura ${invoice.id} não encontrada.`);
                }
                const invoiceData = invoiceDoc.data();
                
                // Determine how much of the payment to apply to this invoice
                const amountToApply = Math.min(remainingAmountToPay, invoiceData.openTotal);

                if (amountToApply <= 0) continue;

                const newPaidTotal = invoiceData.paidTotal + amountToApply;
                const newOpenTotal = invoiceData.openTotal - amountToApply;
                const newStatus = newOpenTotal <= 0.001 ? "PAID" : "PARTIAL"; // Use tolerance for float comparison

                transaction.update(invoiceRef, {
                    paidTotal: newPaidTotal,
                    openTotal: newOpenTotal < 0 ? 0 : newOpenTotal,
                    status: newStatus,
                    updatedAt: Timestamp.now(),
                });

                remainingAmountToPay -= amountToApply;
            }

            // Create a single payment record for the customer, not tied to an invoice
            const paymentRef = doc(collection(db, "payments"));
            transaction.set(paymentRef, {
                ownerId: user.uid,
                customerId: selectedCustomer,
                // invoiceId is intentionally omitted
                amount: paymentAmount,
                method: paymentMethod,
                paidAt: format(new Date(), "yyyy-MM-dd"),
                createdAt: Timestamp.now(),
            });
        });

        toast.success("Pagamento registrado com sucesso!");
        
        // Reset form
        setSelectedCustomer("");
        setOpenInvoices([]);
        setAmount("");
        setPaymentMethod("PIX");
        
        // Optionally, re-fetch customer data to update the view, but resetting is enough here.

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
            <p className="text-muted-foreground">Dê baixa na dívida total ou parcial de seus clientes.</p>
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

                    {/* The invoice selection is removed */}

                    <div>
                        <Label htmlFor="amount">Valor do Pagamento (R$)</Label>
                        <Input id="amount" value={amount} onChange={e => setAmount(e.target.value)} type="text" inputMode="decimal" placeholder="0,00"/>
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
                    
                    <Button type="submit" className="w-full" disabled={isSubmitting || !selectedCustomer || openInvoices.length === 0}>
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
