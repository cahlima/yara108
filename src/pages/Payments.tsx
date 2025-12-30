
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, writeBatch, getDoc } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Trash2, CheckCircle, Send, BadgeCent, FileDown } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";

interface ConsumptionRecord {
  id: string;
  customer_id: string;
  customer_name: string; // Enriched data
  customer_phone: string | null; // Enriched data
  total: number;
  paid: boolean;
  consumption_date: { seconds: number; nanoseconds: number; };
  payment_date?: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

const Payments = () => {
  const { user, loading: authLoading } = useAuth(); // Use auth loading state
  const [records, setRecords] = useState<ConsumptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchRecords = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch unpaid consumption records for the user
      const recordsQuery = query(
        collection(db, "consumption_records"),
        where("user_id", "==", user.uid),
        where("paid", "==", false)
      );
      const recordsSnapshot = await getDocs(recordsQuery);
      const recordsData = recordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (recordsData.length === 0) {
        setRecords([]);
        return;
      }

      // 2. Get unique customer IDs from the records
      const customerIds = [...new Set(recordsData.map(record => record.customer_id))];
      
      // 3. Fetch customer data for these IDs
      const customersRef = collection(db, "customers");
      const customersQuery = query(customersRef, where("__name__", "in", customerIds));
      const customersSnapshot = await getDocs(customersQuery);
      const customersMap = new Map<string, Customer>();
      customersSnapshot.docs.forEach(doc => {
        customersMap.set(doc.id, { id: doc.id, ...doc.data() } as Customer);
      });

      // 4. Enrich records with customer data
      const enrichedRecords = recordsData.map(record => ({
        ...record,
        customer_name: customersMap.get(record.customer_id)?.name || "Cliente não encontrado",
        customer_phone: customersMap.get(record.customer_id)?.phone || null,
      })) as ConsumptionRecord[];

      setRecords(enrichedRecords);

    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao carregar registros:", error);
      toast.error("Erro ao carregar registros");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Effect to fetch records only when authentication is complete and user is available
  useEffect(() => {
    if (!authLoading) {
      fetchRecords();
    }
  }, [authLoading, fetchRecords]);

  const handlePayment = async (recordId: string) => {
    try {
      const recordRef = doc(db, "consumption_records", recordId);
      await updateDoc(recordRef, { paid: true, payment_date: paymentDate });
      toast.success("Pagamento registrado com sucesso!");
      fetchRecords(); // Refresh
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao registrar pagamento:", error);
      toast.error("Erro ao registrar pagamento");
    }
  };

  const handleDelete = async (recordId: string) => {
    try {
      const recordRef = doc(db, "consumption_records", recordId);
      await deleteDoc(recordRef);
      toast.success("Lançamento excluído com sucesso!");
      fetchRecords(); // Refresh
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao excluir lançamento:", error);
      toast.error("Erro ao excluir lançamento");
    }
  };

  if (loading || authLoading) { // Show loader if either auth or data is loading
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Pagamentos Pendentes</h2>
          <p className="text-muted-foreground">Marque os consumos que foram pagos.</p>
        </div>
        <div className="flex items-center gap-2 mt-4 sm:mt-0">
            <Input 
                type="date" 
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-[160px]"
            />
        </div>
      </div>

      {records.length === 0 ? (
        <Card className="border-dashed">
            <CardContent className="pt-6">
                <div className="text-center py-12 text-muted-foreground">
                <BadgeCent className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="font-semibold">Tudo em ordem!</p>
                <p className="text-sm">Nenhum pagamento pendente encontrado.</p>
                </div>
            </CardContent>
        </Card>
      ) : (
        <TooltipProvider>
          <div className="space-y-3">
            {records.map((record) => (
              <Card key={record.id} className="hover:border-primary/60 transition-colors">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-bold text-lg text-foreground">{record.customer_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Vencimento: {new Date(record.consumption_date.seconds * 1000).toLocaleDateString()}
                    </p>
                    <p className="text-2xl font-extrabold text-primary mt-1">
                      R$ {record.total.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {record.customer_phone && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                           <a href={`https://wa.me/55${record.customer_phone.replace(/\D/g, '')}?text=Ol%C3%A1%2C%20${record.customer_name}!%20Lembrete%20de%20pagamento%20no%20valor%20de%20R%24%20${record.total.toFixed(2)}.`} target="_blank" rel="noopener noreferrer">
                              <Button variant="outline" size="icon">
                                <Send className="w-4 h-4" />
                              </Button>
                           </a>
                        </TooltipTrigger>
                        <TooltipContent><p>Enviar lembrete via WhatsApp</p></TooltipContent>
                      </Tooltip>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon" title="Excluir lançamento">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir Lançamento?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O lançamento de{" "}
                            <strong>{record.customer_name}</strong> no valor de{" "}
                            <strong>R$ {record.total.toFixed(2)}</strong> será excluído permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(record.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                     <Tooltip>
                        <TooltipTrigger asChild>
                            <Button onClick={() => handlePayment(record.id)} size="icon" className="bg-green-600 hover:bg-green-700 w-12 h-12">
                                <CheckCircle className="w-6 h-6" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Marcar como Pago</p></TooltipContent>
                      </Tooltip>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
};

export default Payments;
