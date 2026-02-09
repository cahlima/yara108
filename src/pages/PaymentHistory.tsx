
import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
  documentId
} from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Search, Download, Users, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// --- Interfaces ---
interface Customer {
  id: string;
  name: string;
}

interface PaymentRecord {
  id: string;
  customerId: string;
  invoiceId: string;
  amount: number;
  paidAt: Timestamp;
  method: string;
  note?: string;
  // Campos para enriquecimento
  customerName?: string;
  invoiceMonth?: string;
}

// --- Componente ---
const PaymentHistory = () => {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  
  // --- Filtros ---
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const fetchInitialData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch Customers
      const custQuery = query(collection(db, "customers"), where("ownerId", "==", user.uid), orderBy("name"));
      const custSnapshot = await getDocs(custQuery);
      const customersData = custSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customersData);

      // Fetch all Payment Records
      const recordsQuery = query(
        collection(db, "payment_records"), 
        where("ownerId", "==", user.uid), 
        orderBy("paidAt", "desc")
      );
      const recordsSnapshot = await getDocs(recordsQuery);
      const recordsData = recordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentRecord));
      
      // Enriquecer registros com nome do cliente
      const customerMap = new Map(customersData.map(c => [c.id, c.name]));
      const enrichedRecords = recordsData.map(r => ({...r, customerName: customerMap.get(r.customerId) || "Cliente desconhecido"}));

      setRecords(enrichedRecords);

    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
      toast.error("Falha ao carregar o histórico de pagamentos.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      fetchInitialData();
    }
  }, [authLoading, fetchInitialData]);

  const filteredRecords = useMemo(() => {
    return records
      .filter(r => selectedCustomer === "all" || r.customerId === selectedCustomer)
      .filter(r => searchTerm === "" || 
        r.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.note?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.method.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [records, selectedCustomer, searchTerm]);

  const exportToCSV = () => {
    const headers = ["Cliente", "Valor (R$)", "Data Pagamento", "Hora Pagamento", "Método", "Fatura (Mês)", "Observação"];
    const rows = filteredRecords.map(r => [
      `"${r.customerName}"`, 
      r.amount.toFixed(2).replace('.', ','),
      format(r.paidAt.toDate(), "dd/MM/yyyy", { locale: ptBR }),
      format(r.paidAt.toDate(), "HH:mm:ss", { locale: ptBR }),
      r.method,
      r.invoiceId.split('_')[2], // Extrai o mês do invoiceId
      `"${r.note || ''}"`
    ].join(','));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join("\r\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `historico_pagamentos_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exportação para CSV gerada!");
  };

  if (authLoading || loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Histórico de Pagamentos</h2>
      
      <Card>
        <CardHeader>
          <CardTitle>Filtros e Exportação</CardTitle>
          <div className="flex flex-col md:flex-row gap-4 pt-4">
            <div className="flex-1">
                <Label>Filtrar por Cliente</Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                    <SelectTrigger className="w-full"><Users className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os clientes</SelectItem>
                        {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex-1">
                <Label>Buscar nos resultados</Label>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Nome, método, nota..." className="pl-8" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
            </div>
            <div className="self-end">
                <Button onClick={exportToCSV} disabled={filteredRecords.length === 0}>
                    <Download className="w-4 h-4 mr-2" />
                    Exportar CSV
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
            {filteredRecords.length > 0 ? (
                <ul className="space-y-4">
                    {filteredRecords.map(r => (
                        <li key={r.id} className="p-4 bg-secondary rounded-lg">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-bold text-lg text-primary">R$ {r.amount.toFixed(2).replace('.', ',')}</p>
                                    <p className="font-semibold">{r.customerName}</p>
                                </div>
                                <div className="text-right text-sm">
                                    <p>{format(r.paidAt.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                                    <p className="text-muted-foreground">Método: <span className="font-medium text-foreground">{r.method}</span></p>
                                </div>
                            </div>
                            {r.note && <p className="text-sm italic mt-2 pt-2 border-t border-border">Obs: "{r.note}"</p>}
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="text-center py-16 text-muted-foreground">
                    <p>Nenhum registro de pagamento encontrado para os filtros selecionados.</p>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentHistory;
