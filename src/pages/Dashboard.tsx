
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

  const fetchStats = useCallback(async (ownerId: string, start?: string, end?: string) => {
    setLoading(true);
    try {
        const invoicesRef = collection(db, "invoices");
        const consumptionRef = collection(db, "consumption_records");

        // Base queries
        let invoicesQuery = query(invoicesRef, where("ownerId", "==", ownerId));
        let directSalesQuery = query(consumptionRef, where("ownerId", "==", ownerId), where("payLater", "==", false));

        // Apply date filters if they exist
        if (start && end) {
            const startDate = Timestamp.fromDate(new Date(start + 'T00:00:00'));
            const endDate = Timestamp.fromDate(new Date(end + 'T23:59:59'));
            invoicesQuery = query(invoicesQuery, where("createdAt", ">=", startDate), where("createdAt", "<=", endDate));
            // We need a different filter for consumptions as they use a date string "yyyy-MM-dd"
            directSalesQuery = query(directSalesQuery, where("date", ">=", start), where("date", "<=", end));
        }

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

        const directSalesSnapshot = await getDocs(directSalesQuery);
        const directSalesTotal = directSalesSnapshot.docs.reduce((sum, doc) => sum + Number(doc.data().subtotal), 0);
        
        setStats({
            totalSales: totalInvoiced + directSalesTotal,
            totalToReceive: totalToReceiveFromInvoices,
            totalReceived: totalReceivedFromInvoices + directSalesTotal,
        });

    } catch (error) {
        console.error("Erro ao carregar estatísticas:", error);
        toast.error("Erro ao carregar estatísticas.", {
            description: "Verifique as regras e índices do Firestore. A consola pode ter mais detalhes."
        });
    } finally {
        setLoading(false);
    }
}, []);

  useEffect(() => {
    if (user && !authLoading) {
      fetchStats(user.uid);
    }
  }, [user, authLoading, fetchStats]);

  const handleFilter = async () => {
    if (!startDate || !endDate || !user) {
      toast.error("Selecione as datas inicial e final");
      return;
    }
    setIsFiltered(true);
    setLoading(true);
    await fetchStats(user.uid, startDate, endDate);
    setLoading(false);
  };

  const clearFilter = () => {
    setStartDate("");
    setEndDate("");
    setIsFiltered(false);
    if (user) {
        fetchStats(user.uid);
    }
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
      description: isFiltered ? "Vendas no período selecionado." : "Vendas de todo o período.",
    },
    {
      title: "Valor a Receber",
      value: formatCurrency(stats.totalToReceive),
      icon: ListX,
      color: "text-orange-500",
      description: isFiltered ? "A receber de faturas do período." : "Total a receber de todas as faturas.",
    },
    {
      title: "Valor Recebido",
      value: formatCurrency(stats.totalReceived),
      icon: ListChecks,
      color: "text-green-500",
      description: isFiltered ? "Recebido no período selecionado." : "Total recebido (faturas e vendas diretas).",
    },
  ];

  if (authLoading || loading) {
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Search className="w-4 w-4 mr-2" />}
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
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

    </div>
  );
};

export default Dashboard;
