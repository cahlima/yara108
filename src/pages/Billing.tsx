
import { useEffect, useState, useCallback, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, Timestamp, writeBatch } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, FileText, Search, User, Calendar, Download } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

interface Customer {
  id: string;
  name: string;
}

interface BillableRecord {
  id: string;
  customer_id: string;
  customer_name: string;
  total_due: number;
  record_ids: string[];
  consumption_dates: Date[];
}

interface Bill {
  id: string;
  customer_id: string;
  customer_name: string;
  total_amount: number;
  due_date: string;
  issue_date: string;
  items: { product_name: string; quantity: number; unit_price: number; subtotal: number; }[];
  status: 'pending' | 'paid';
}

const Billing = () => {
  const { user, loading: authLoading } = useAuth();
  const [billableRecords, setBillableRecords] = useState<BillableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // D+10
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchBillableRecords = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Fetch unpaid consumption records for the current user
      const recordsQuery = query(
        collection(db, "consumption_records"),
        where("user_id", "==", user.uid),
        where("paid", "==", false)
      );
      const recordsSnapshot = await getDocs(recordsQuery);
      const recordsData = recordsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));

      if (recordsData.length === 0) {
        setBillableRecords([]);
        return;
      }

      // 2. Get unique customer IDs
      const customerIds = [...new Set(recordsData.map(record => record.customer_id))];

      // 3. Fetch customer details
      const customersQuery = query(collection(db, "customers"), where("__name__", "in", customerIds));
      const customersSnapshot = await getDocs(customersQuery);
      const customersMap = new Map(customersSnapshot.docs.map(doc => [doc.id, doc.data() as Omit<Customer, 'id'>]));

      // 4. Group records by customer
      const groupedByCustomer = recordsData.reduce((acc, record) => {
        if (!acc[record.customer_id]) {
          acc[record.customer_id] = {
            customer_id: record.customer_id,
            customer_name: customersMap.get(record.customer_id)?.name || "Cliente Desconhecido",
            total_due: 0,
            record_ids: [],
            consumption_dates: [],
          };
        }
        acc[record.customer_id].total_due += record.total;
        acc[record.customer_id].record_ids.push(record.id);
        acc[record.customer_id].consumption_dates.push(record.consumption_date.toDate());
        return acc;
      }, {} as Record<string, Omit<BillableRecord, 'id'> & { record_ids: string[]; consumption_dates: Date[] }>);

      const finalBillableRecords: BillableRecord[] = Object.values(groupedByCustomer).map((group, index) => ({
        id: group.customer_id + "_" + index, // Create a stable id
        ...group,
      }));

      setBillableRecords(finalBillableRecords);

    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao buscar registros faturáveis: ", error);
      toast.error("Falha ao buscar registros para faturamento.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) { // Only fetch when auth is ready
      fetchBillableRecords();
    }
  }, [authLoading, fetchBillableRecords]);

  const handleGenerateBill = async (record: BillableRecord) => {
    if (!user) {
      toast.error("Usuário não autenticado.");
      return;
    }

    try {
      // 1. Fetch all consumption items for the selected records
      const consumptionDocs = await Promise.all(record.record_ids.map(id => getDoc(doc(db, "consumption_records", id))));
      const allItems = consumptionDocs.flatMap(doc => doc.exists() ? doc.data().items : []);

      // 2. Create the bill object
      const newBill: Omit<Bill, 'id'> = {
        customer_id: record.customer_id,
        customer_name: record.customer_name,
        total_amount: record.total_due,
        due_date: dueDate,
        issue_date: issueDate,
        items: allItems,
        status: 'pending',
      };

      // 3. Use a batch write to add the new bill and update consumption records
      const batch = writeBatch(db);

      const billRef = doc(collection(db, "bills"));
      batch.set(billRef, { ...newBill, created_at: Timestamp.now(), user_id: user.uid });

      record.record_ids.forEach(recordId => {
        const consumptionRef = doc(db, "consumption_records", recordId);
        batch.update(consumptionRef, { paid: true, bill_id: billRef.id });
      });

      await batch.commit();

      toast.success(`Fatura para ${record.customer_name} gerada com sucesso!`);
      fetchBillableRecords(); // Refresh the list

      // 4. Generate and preview the PDF
      generatePDF({ ...newBill, id: billRef.id });

    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao gerar fatura: ", error);
      toast.error("Falha ao gerar fatura.");
    }
  };

  const generatePDF = (bill: Bill) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text("Fatura de Consumo", 14, 22);
    doc.setFontSize(12);
    doc.text(`Cliente: ${bill.customer_name}`, 14, 32);

    // Details
    doc.setFontSize(10);
    doc.text(`Número da Fatura: ${bill.id.substring(0, 8)}`, 14, 40);
    doc.text(`Data de Emissão: ${new Date(bill.issue_date + 'T12:00:00').toLocaleDateString()}`, 14, 45);
    doc.text(`Data de Vencimento: ${new Date(bill.due_date + 'T12:00:00').toLocaleDateString()}`, 14, 50);

    // Items Table
    autoTable(doc, {
        startY: 60,
        head: [['Produto', 'Qtd', 'Preço Unit.', 'Subtotal']],
        body: bill.items.map(item => [
            item.product_name,
            item.quantity,
            `R$ ${item.unit_price.toFixed(2)}`,
            `R$ ${item.subtotal.toFixed(2)}`
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [22, 163, 74] },
    });

    // Total
    const finalY = (doc as any).lastAutoTable.finalY || 80;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total a Pagar: R$ ${bill.total_amount.toFixed(2)}`, 14, finalY + 15);

    // Open in new tab
    doc.output('dataurlnewwindow');
  };

  const filteredRecords = useMemo(() =>
    billableRecords.filter(record =>
      record.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
    ), [billableRecords, searchTerm]);

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Faturamento</h2>
        <p className="text-muted-foreground">Gere faturas para consumos em aberto.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuração da Fatura</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="issue-date" className="text-sm font-medium">Data de Emissão</label>
            <Input
              id="issue-date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="due-date" className="text-sm font-medium">Data de Vencimento</label>
            <Input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

       <Card>
        <CardHeader>
           <CardTitle className="flex items-center justify-between">
            <span>Clientes com Pendências</span>
            <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Buscar cliente..."
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
           </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredRecords.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-dashed border rounded-lg">
              <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="font-semibold">Nenhum cliente com pendências</p>
              <p className="text-sm">Todos os consumos estão em dia.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecords.map((record) => (
                <Card key={record.id} className="transition-all hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center justify-between">
                      <span>{record.customer_name}</span>
                      <span className="text-2xl font-bold text-destructive">R$ {record.total_due.toFixed(2)}</span>
                    </CardTitle>
                     <div className="text-xs text-muted-foreground flex items-center gap-2 pt-1">
                        <Calendar className="h-3 w-3" />
                        Consumos de {record.consumption_dates.length > 1 ? `${record.consumption_dates[0].toLocaleDateString()} a ${record.consumption_dates[record.consumption_dates.length - 1].toLocaleDateString()}`: record.consumption_dates[0].toLocaleDateString()}
                    </div>
                  </CardHeader>
                  <CardFooter className="flex justify-end">
                    <Button onClick={() => handleGenerateBill(record)}>
                      <FileText className="w-4 h-4 mr-2" />
                      Gerar Fatura e Dar Baixa
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default Billing;
