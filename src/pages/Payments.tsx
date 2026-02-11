
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
import { Textarea } from "@/components/ui/textarea";
import { registerPayment } from "@/lib/payments";
import { getCustomerDebt } from "@/lib/debt"; // PASSO 1: Importar a nova função centralizada

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
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchCustomersWithDebt = async () => {
      if (!user) return;
      setLoading(true);
      try {
        // A lógica para encontrar clientes com dívida permanece a mesma,
        // pois precisamos apenas da lista de clientes que devem algo.
        const invoicesQuery = query(
          collection(db, "invoices"),
          where("ownerId", "==", user.uid),
          where("openTotal", ">", 0) // Uma pequena otimização
        );
        const invoicesSnapshot = await getDocs(invoicesQuery);

        if (invoicesSnapshot.empty) {
            setCustomers([]);
            setLoading(false);
            return;
        }

        const customerIdsWithDebt = [...new Set(invoicesSnapshot.docs.map(doc => doc.data().customerId as string))];

        if (customerIdsWithDebt.length > 0) {
            const customersData: Customer[] = [];
            const chunks = [];
            for (let i = 0; i < customerIdsWithDebt.length; i += 30) {
                chunks.push(customerIdsWithDebt.slice(i, i + 30));
            }
            
            for (const chunk of chunks) {
                const customersQuery = query(collection(db, "customers"), where(documentId(), "in", chunk));
                const customerSnapshots = await getDocs(customersQuery);
                customerSnapshots.forEach(doc => {
                    customersData.push({ id: doc.id, ...doc.data() } as Customer);
                });
            }

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
      // PASSO 2: Usar a função centralizada para obter a dívida REAL.
      const totalDebt = await getCustomerDebt(user.uid, customerId);
      setAmount(totalDebt.toFixed(2).replace('.', ','));

      // PASSO 3: Continuar buscando as faturas com dívida para o processo de pagamento.
      // A função `registerPayment` precisa saber em quais faturas aplicar o valor.
      const q = query(
        collection(db, "invoices"),
        where("ownerId", "==", user.uid),
        where("customerId", "==", customerId),
        where("openTotal", ">", 0), // Lógica consistente
        orderBy("month")
      );
      const snapshot = await getDocs(q);
      const invoicesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      
      setOpenInvoices(invoicesData);

      if (invoicesData.length === 0) {
        // Isso não deve acontecer se getCustomerDebt > 0, mas é uma salvaguarda.
        toast.info("Este cliente não possui faturas com saldo devedor.");
        setAmount("");
      }
    } catch (error) {
        console.error("Error fetching customer details:", error);
        toast.error("Falha ao buscar os detalhes da dívida do cliente.");
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
    
    // A validação continua usando o total calculado pela função centralizada
    const totalDebt = parseFloat((await getCustomerDebt(user.uid, selectedCustomer)).toFixed(2));
    if (paymentAmount > totalDebt + 0.01) { 
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
            // Envia apenas as faturas que têm saldo devedor para a função de pagamento
            invoicesToPay: openInvoices.filter(inv => inv.openTotal > 0)
        });

        toast.success("Pagamento registrado com sucesso!");
        
        // Limpa o formulário e força a atualização da lista de clientes
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
    <div className="space-y-6 max-w-2xl mx-auto p-4">
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
                                <Textarea id="note" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex: Pagamento da primeira parcela..."/>
                            </div>
                            
                            <Button type="submit" className="w-full" disabled={isSubmitting || !selectedCustomer || !amount}>
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
