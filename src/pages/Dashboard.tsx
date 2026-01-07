
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DollarSign, Search, Loader2, ListX, ListChecks, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface Stats {
  totalSales: number;
  totalToReceive: number;
  totalReceived: number;
}

interface SaleRecord {
    id: string;
    date: Timestamp;
    customer_id: string;
    total_price: number;
    paid?: boolean;
}

interface EnrichedSaleRecord {
    date: string;
    customerName: string;
    total: number;
}

interface DailyGroup {
  date: string;
  records: EnrichedSaleRecord[];
  dayTotal: number;
}

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalSales: 0,
    totalToReceive: 0,
    totalReceived: 0,
  });
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isFiltered, setIsFiltered] = useState(false);
  const [dailyGroups, setDailyGroups] = useState<DailyGroup[]>([]);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
        // 1. Fetch all invoices to calculate invoiced amounts
        const invoicesRef = collection(db, "invoices");
        const invoicesQuery = query(invoicesRef, where("ownerId", "==", user.uid));
        const invoicesSnapshot = await getDocs(invoicesQuery);

        let totalInvoiced = 0;
        let totalToReceiveFromInvoices = 0;
        let totalReceivedFromInvoices = 0;

        invoicesSnapshot.docs.forEach(doc => {
            const invoice = doc.data();
            totalInvoiced += Number(invoice.total) || 0;
            totalToReceiveFromInvoices += Number(invoice.openTotal) || 0;
            totalReceivedFromInvoices += Number(invoice.paidTotal) || 0;
        });

        // 2. Fetch all direct sales (not marked for later payment)
        const consumptionRef = collection(db, "consumption_records");
        const directSalesQuery = query(consumptionRef, where("ownerId", "==", user.uid), where("payLater", "==", false));
        const directSalesSnapshot = await getDocs(directSalesQuery);

        const directSalesTotal = directSalesSnapshot.docs.reduce((sum, doc) => sum + Number(doc.data().subtotal), 0);

        // 3. Combine the stats
        setStats({
            totalSales: totalInvoiced + directSalesTotal,
            totalToReceive: totalToReceiveFromInvoices,
            totalReceived: totalReceivedFromInvoices + directSalesTotal,
        });

    } catch (error) {
        if (import.meta.env.DEV) console.error("Erro ao carregar estatísticas:", error);
        toast.error("Erro ao carregar estatísticas. Verifique as regras do Firestore.");
    } finally {
        setLoading(false);
    }
}, [user]);


  useEffect(() => {
    if (!authLoading) {
      fetchStats();
    }
  }, [authLoading, fetchStats]);

  const handleFilter = async () => {
    if (!startDate || !endDate || !user) {
      toast.error("Selecione as datas inicial e final");
      return;
    }

    setLoading(true);
    try {
      const start = startDate;
      const end = endDate;

      const salesRef = collection(db, "consumption_records");
      const q = query(
        salesRef,
        where("ownerId", "==", user.uid),
        where("date", ">=", start),
        where("date", "<=", end)
      );
      const querySnapshot = await getDocs(q);
      const salesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      const customerIds = [...new Set(salesData.map(r => r.customer_id).filter(Boolean))];
      
      const customersMap = new Map<string, string>();
      if (customerIds.length > 0) {
        const customersQuery = query(collection(db, "customers"), where("__name__", "in", customerIds));
        const customersSnapshot = await getDocs(customersQuery);
        customersSnapshot.forEach(doc => {
            customersMap.set(doc.id, doc.data().name);
        });
      }

      const groupedByDate: { [key: string]: EnrichedSaleRecord[] } = {};
      
      salesData.forEach(record => {
        const recordDate = record.date;
        if (!groupedByDate[recordDate]) {
          groupedByDate[recordDate] = [];
        }
        
        const customerName = customersMap.get(record.customer_id) || "Cliente desconhecido";

        groupedByDate[recordDate].push({
          date: recordDate,
          customerName,
          total: Number(record.subtotal),
        });
      });

      const groups: DailyGroup[] = Object.entries(groupedByDate).map(([date, records]) => ({
        date,
        records,
        dayTotal: records.reduce((sum, r) => sum + r.total, 0),
      }));

      setDailyGroups(groups.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setIsFiltered(true);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao filtrar:", error);
      toast.error("Erro ao filtrar dados. Verifique os índices do Firestore.");
    } finally {
      setLoading(false);
    }
  };

  const clearFilter = () => {
    setStartDate("");
    setEndDate("");
    setIsFiltered(false);
    setDailyGroups([]);
    fetchStats();
  };
  
    const formatDate = (dateString: string) => {
        const date = new Date(dateString + 'T12:00:00');
        return date.toLocaleDateString("pt-BR", {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
        });
    };
    
    const formatCurrency = (value: number) => {
        return (value || 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
        });
    };

  const statsCards = [
    {
      title: "Total de Vendas",
      value: formatCurrency(stats.totalSales),
      icon: TrendingUp,
      color: "text-blue-500",
    },
    {
      title: "Valor a Receber",
      value: formatCurrency(stats.totalToReceive),
      icon: ListX,
      color: "text-orange-500",
    },
    {
      title: "Valor Recebido",
      value: formatCurrency(stats.totalReceived),
      icon: ListChecks,
      color: "text-green-500",
    },
  ];

  if (authLoading || (loading && !isFiltered)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Dashboard</h2>
        <p className="text-muted-foreground">Visão geral das suas vendas e clientes.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtrar por Período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3 items-end">
            <div className="space-y-2">
              <Label htmlFor="start-date">Data Inicial</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">Data Final</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleFilter} disabled={loading}>
                {loading && isFiltered ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Search className="w-4 h-4 mr-2" />}
                Filtrar
              </Button>
              {isFiltered && (
                <Button variant="outline" onClick={clearFilter}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {!isFiltered && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statsCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isFiltered && (
        <div className="space-y-6">
          {loading ? (
             <div className="flex items-center justify-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : dailyGroups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum registro encontrado no período selecionado.
              </CardContent>
            </Card>
          ) : (
            dailyGroups.map((group) => (
              <Card key={group.date}>
                <CardHeader>
                  <CardTitle className="text-lg capitalize flex justify-between items-center">
                    <span>{formatDate(group.date)}</span>
                    <span className="text-sm font-medium text-muted-foreground">Total do dia: {formatCurrency(group.dayTotal)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {group.records.map((record, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center py-2 border-b last:border-0"
                      >
                        <span className="text-foreground">{record.customerName}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(record.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
