
import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, DollarSign, TrendingUp, CalendarDays } from "lucide-react";
import { toast } from "sonner";

// Tipos de dados
interface ConsumptionRecord {
  id: string;
  customerId: string;
  customerName?: string; // Será enriquecido
  product_name: string;
  quantity: number;
  subtotal: number;
  date: string; // yyyy-MM-dd
  payLater: boolean;
}

interface DayStats {
  totalSales: number;
  totalReceived: number;
}

const BillingReport = () => {
  const { user, loading: authLoading } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [activeDays, setActiveDays] = useState<string[]>([]);
  const [dayRecords, setDayRecords] = useState<ConsumptionRecord[]>([]);
  const [dayStats, setDayStats] = useState<DayStats>({ totalSales: 0, totalReceived: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);

  // Busca inicial para encontrar todos os dias com vendas
  const fetchActiveDays = useCallback(async (ownerId: string) => {
    setLoading(true);
    try {
      const q = query(collection(db, "consumption_records"), where("ownerId", "==", ownerId));
      const snapshot = await getDocs(q);
      const dates = new Set<string>();
      snapshot.forEach(doc => {
        dates.add(doc.data().date); // 'date' é 'yyyy-MM-dd'
      });
      // Ordena as datas da mais recente para a mais antiga
      setActiveDays(Array.from(dates).sort((a, b) => b.localeCompare(a)));
    } catch (error) {
      console.error("Erro ao buscar dias com vendas:", error);
      toast.error("Falha ao carregar o histórico de dias com vendas.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Busca os dados do relatório para o dia selecionado
  const fetchDayReport = useCallback(async (ownerId: string, date: Date) => {
    setLoadingReport(true);
    const dateStr = format(date, "yyyy-MM-dd");
    try {
      const q = query(
        collection(db, "consumption_records"),
        where("ownerId", "==", ownerId),
        where("date", "==", dateStr)
      );
      const snapshot = await getDocs(q);

      const records: ConsumptionRecord[] = [];
      let totalSales = 0;
      let totalReceived = 0;

      // Cache de clientes para evitar buscas repetidas
      const customerCache = new Map<string, string>();

      for (const recordDoc of snapshot.docs) {
        const data = recordDoc.data() as Omit<ConsumptionRecord, "id">;
        totalSales += data.subtotal;
        if (!data.payLater) {
          totalReceived += data.subtotal;
        }
        
        let customerName = "Venda direta"; // Nome padrão

        if (data.customerId && typeof data.customerId === 'string' && data.customerId.trim() !== '') {
            const cachedName = customerCache.get(data.customerId);
            if (cachedName) {
                customerName = cachedName;
            } else {
                try {
                    const customerRef = doc(db, "customers", data.customerId);
                    const customerSnap = await getDoc(customerRef);
                    const fetchedName = customerSnap.exists() ? customerSnap.data().name : "Cliente não encontrado";
                    customerCache.set(data.customerId, fetchedName);
                    customerName = fetchedName;
                } catch (e) {
                    console.error(`Falha ao buscar cliente com ID: ${data.customerId}`, e);
                    customerName = "Erro ao buscar cliente";
                }
            }
        }

        records.push({
          id: recordDoc.id,
          ...data,
          customerName,
        });
      }

      setDayRecords(records.sort((a, b) => (a.customerName || "").localeCompare(b.customerName || "")));
      setDayStats({ totalSales, totalReceived });

    } catch (error) {
      console.error(`Erro ao buscar relatório para ${dateStr}:`, error);
      toast.error(`Falha ao carregar o relatório do dia ${format(date, "dd/MM/yyyy")}.`);
      setDayRecords([]);
      setDayStats({ totalSales: 0, totalReceived: 0 });
    } finally {
      setLoadingReport(false);
    }
  }, []);

  // Efeito para buscar os dias ativos na montagem do componente
  useEffect(() => {
    if (user) {
      fetchActiveDays(user.uid);
    }
  }, [user, fetchActiveDays]);

  // Efeito para buscar o relatório quando a data é selecionada
  useEffect(() => {
    if (user && selectedDate) {
      fetchDayReport(user.uid, selectedDate);
    }
  }, [user, selectedDate, fetchDayReport]);
  
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
        setSelectedDate(date);
    }
  }

  const formatCurrency = (value: number) => 
    (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  
  const selectedDateFormatted = useMemo(() => {
    return selectedDate ? format(selectedDate, "eeee, dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "";
  }, [selectedDate]);


  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Carregando histórico de vendas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Relatório de Vendas Diário</h2>
        <p className="text-muted-foreground">Consulte o detalhe de vendas de um dia específico.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    Selecione uma data
                </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
                initialFocus
                locale={ptBR}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
            <CardHeader className="p-0">
                <CardTitle className="text-2xl capitalize">
                    {selectedDateFormatted}
                </CardTitle>
            </CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Vendido</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(dayStats.totalSales)}</div>
                <p className="text-xs text-muted-foreground">Soma de todos os produtos vendidos no dia.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Entradas (Recebido)</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(dayStats.totalReceived)}</div>
                <p className="text-xs text-muted-foreground">Vendas pagas no ato (não inclui "fiado").</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
                <CardTitle>Lançamentos do Dia</CardTitle>
            </CardHeader>
            <CardContent>
                {loadingReport ? (
                     <div className="flex items-center justify-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                     </div>
                ) : dayRecords.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhuma venda registrada neste dia.</p>
                ) : (
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Produto</TableHead>
                            <TableHead className="text-center">Qtd.</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {dayRecords.map((rec) => (
                            <TableRow key={rec.id}>
                            <TableCell className="font-medium">{rec.customerName}</TableCell>
                            <TableCell>{rec.product_name}</TableCell>
                            <TableCell className="text-center">{rec.quantity}</TableCell>
                            <TableCell className="text-right">{formatCurrency(rec.subtotal)}</TableCell>
                            <TableCell className="text-center">
                                <span className={`px-2 py-1 text-xs rounded-full ${rec.payLater ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                                    {rec.payLater ? 'Fiado' : 'Pago'}
                                </span>
                            </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {activeDays.length > 0 && (
        <Card>
            <CardHeader>
                <CardTitle>Dias com Vendas (Atalhos)</CardTitle>
                <p className="text-sm text-muted-foreground pt-1">Clique em um dia para ver o relatório.</p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
                {activeDays.map(dayStr => (
                    <Button 
                        key={dayStr}
                        variant={format(selectedDate || new Date(), "yyyy-MM-dd") === dayStr ? "default" : "outline"}
                        onClick={() => handleDateSelect(parseISO(dayStr))}
                    >
                        {format(parseISO(dayStr), "dd/MM/yy")}
                    </Button>
                ))}
            </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BillingReport;
