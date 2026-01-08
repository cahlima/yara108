
import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from 'lucide-react';

interface DailyReport {
  totalSales: number;
  totalReceivable: number;
  totalPaid: number;
}

const BillingReport = () => {
  const { user, authLoading } = useAuth();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !date) return;

    const fetchReport = async () => {
      setLoading(true);
      try {
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);

        const invoicesQuery = query(
          collection(db, "invoices"),
          where("ownerId", "==", user.uid),
          where("createdAt", ">=", Timestamp.fromDate(dayStart)),
          where("createdAt", "<=", Timestamp.fromDate(dayEnd))
        );

        const querySnapshot = await getDocs(invoicesQuery);

        let totalSales = 0;
        let totalReceivable = 0;

        querySnapshot.forEach(doc => {
          const invoice = doc.data();
          totalSales += invoice.total;
          totalReceivable += invoice.openTotal;
        });

        const totalPaid = totalSales - totalReceivable;

        setReport({ totalSales, totalReceivable, totalPaid });

      } catch (error) {
        console.error("Error fetching billing report:", error);
        // You might want to add a toast notification here
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [user, date]);

  if (authLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
        <div className="text-center">
            <h2 className="text-3xl font-bold text-foreground">Relatório de Faturamento Diário</h2>
            <p className="text-muted-foreground">Selecione uma data para ver o resumo das vendas.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 flex justify-center">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    className="rounded-md border"
                />
            </div>
            <div className="md:col-span-2 space-y-4">
                {loading ? (
                    <div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                ) : report && report.totalSales > 0 ? (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>Resumo para {date ? format(date, 'dd/MM/yyyy') : ''}</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Total da Venda</p>
                                    <p className="text-2xl font-bold">{report.totalSales.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Total Pago na Hora</p>
                                    <p className="text-2xl font-bold text-green-600">{report.totalPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Total a Receber</p>
                                    <p className="text-2xl font-bold text-red-600">{report.totalReceivable.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                </div>
                            </CardContent>
                        </Card>
                        
                    </>
                ) : (
                     <div className="flex justify-center items-center h-full p-8">
                        <p>Nenhum dado de faturamento para o dia selecionado.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default BillingReport;
