
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, documentId } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; // Importação adicionada
import { registerPayment } from "@/lib/payments"; // Importação adicionada

interface Invoice {
  id: string;
  month: string;
  openTotal: number;
  total: number;
}

interface Customer {
  id: string;
  name: string;
}

const Payments = () => {
  const { user, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [note, setNote] = useState(""); // Estado para a observação
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchCustomersWithDebt = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const invoicesQuery = query(
          collection(db, "invoices"),
          where("ownerId", "==", user.uid),
          where("status", "in", ["OPEN", "PARTIAL"])
        );
        const invoicesSnapshot = await getDocs(invoicesQuery);

        if (invoicesSnapshot.empty) {
            setCustomers([]);
            setLoading(false);
            return;
        }

        const customerIdsWithDebt = [...new Set(invoicesSnapshot.docs.map(doc => doc.data().customerId as string))];

        if (customerIdsWithDebt.length > 0) {
            const CHUNK_SIZE = 30;
            const customerChunks: string[][] = [];
            for (let i = 0; i < customerIdsWithDebt.length; i += CHUNK_SIZE) {
                customerChunks.push(customerIdsWithDebt.slice(i, i + CHUNK_SIZE));
            }

            const customerPromises = customerChunks.map(chunk => {
                const customersQuery = query(
                    collection(db, "customers"),
                    where(documentId(), "in", chunk)
                );
                return getDocs(customersQuery);
            });

            const customerSnapshots = await Promise.all(customerPromises);
            const customersData: Customer[] = [];
            customerSnapshots.forEach(snapshot => {
                snapshot.docs.forEach(doc => {
                    customersData.push({ id: doc.id, ...doc.data() } as Customer);
                });
            });

            setCustomers(customersData.sort((a, b) => a.name.localeCompare(b.name)));
        } else {
             setCustomers([]);
        }

      } catch (error) {
        console.error("Error fetching customers with debt:", error);
        toast.error("Falha ao carregar a lista de clientes com dívidas.");
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchCustomersWithDebt();
    }
  }, [user, authLoading, refreshKey]);

  const handleCustomerChange = useCallback(async (customerId: string) => {
    setSelectedCustomer(customerId);
    setNote("");
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
        orderBy("month")
      );
      const snapshot = await getDocs(q);
      const invoicesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      
      setOpenInvoices(invoicesData);

      if (invoicesData.length > 0) {
        const totalDebt = invoicesData.reduce((sum, inv) => sum + inv.openTotal, 0);
        setAmount(totalDebt.toFixed(2).replace('.', ','));
      } else {
        toast.info("Este cliente já não possui faturas em aberto.");
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
    if (paymentAmount > totalDebt + 0.01) { // Adiciona pequena margem para erros de ponto flutuante
        toast.error(`O valor do pagamento (R$ ${paymentAmount.toFixed(2)}) não pode ser maior que a dívida total (R$ ${totalDebt.toFixed(2)}).`);
        return;
    }

    setIsSubmitting(true);
    try {
        await registerPayment({
            user,
            customerId: selectedCustomer,
            paymentAmount,
            paymentMethod,
            note,
            invoicesToPay: openInvoices
        });

        toast.success("Pagamento registrado com sucesso!");
        
        setSelectedCustomer("");
        setOpenInvoices([]);
        setAmount("");
        setPaymentMethod("PIX");
        setNote("");
        setRefreshKey(oldKey => oldKey + 1);
        
    } catch (e: any) {
        console.error("Erro ao registrar pagamento:", e);
        toast.error(`Falha ao registrar pagamento: ${e.message}`);
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
                            <SelectTrigger>
                               <SelectValue placeholder={customers.length > 0 ? "Selecione o cliente com dívidas..." : "Nenhum cliente com dívidas"}/>
                            </SelectTrigger>
                            <SelectContent>
                                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedCustomer && (
                        <>
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

                            <div>
                                <Label htmlFor="note">Observação (Opcional)</Label>
                                <Textarea id="note" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex: Pagamento da primeira parcela, referente ao serviço X..."/>
                            </div>
                            
                            <Button type="submit" className="w-full" disabled={isSubmitting || !selectedCustomer || openInvoices.length === 0}>
                                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DollarSign className="h-4 w-4 mr-2" />}
                                Registrar Pagamento
                            </Button>
                        </>
                    )}
                </form>
            </CardContent>
        </Card>
    </div>
  );
};

export default Payments;
