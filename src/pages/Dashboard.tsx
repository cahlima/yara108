
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DollarSign, Users, TrendingUp, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Stats {
  totalPending: number;
  totalPaid: number;
  totalCustomers: number;
}

interface SaleRecord {
    id: string;
    date: Timestamp;
    customer_id: string;
    total_price: number;
    paid?: boolean; // Assumindo que o campo 'paid' pode existir
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
    totalPending: 0,
    totalPaid: 0,
    totalCustomers: 0,
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
      const salesRef = collection(db, "sales");
      const customersRef = collection(db, "customers");
      
      const q = query(salesRef, where("user_id", "==", user.uid));

      const [salesSnapshot, customersSnapshot] = await Promise.all([
        getDocs(q),
        getDocs(query(customersRef, where("user_id", "==", user.uid))),
      ]);

      const salesData = salesSnapshot.docs.map((doc) => doc.data());
      
      const totalPending = salesData
        .filter((r) => !r.paid)
        .reduce((sum, r) => sum + Number(r.total_price), 0) || 0;

      const totalPaid = salesData
        .filter((r) => r.paid)
        .reduce((sum, r) => sum + Number(r.total_price), 0) || 0;

      setStats({
        totalPending,
        totalPaid,
        totalCustomers: customersSnapshot.size || 0,
      });
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao carregar estatísticas:", error);
      toast.error("Erro ao carregar estatísticas");
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
      const start = Timestamp.fromDate(new Date(startDate + "T00:00:00"));
      const end = Timestamp.fromDate(new Date(endDate + "T23:59:59"));

      const salesRef = collection(db, "sales");
      const q = query(
        salesRef,
        where("user_id", "==", user.uid),
        where("date", ">=", start),
        where("date", "<=", end)
      );
      const querySnapshot = await getDocs(q);
      const salesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SaleRecord));

      const customerIds = [...new Set(salesData.map(r => r.customer_id).filter(id => id))];
      
      const customersMap = new Map<string, string>();
      if (customerIds.length > 0) {
        // Otimização: Fazer queries em chunks de 30 para o operador 'in'
        const customerChunks = [];
        for (let i = 0; i < customerIds.length; i += 30) {
            customerChunks.push(customerIds.slice(i, i + 30));
        }
        
        const customerPromises = customerChunks.map(chunk => 
            getDocs(query(collection(db, "customers"), where("__name__", "in", chunk)))
        );

        const customerSnapshots = await Promise.all(customerPromises);
        customerSnapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                customersMap.set(doc.id, doc.data().name);
            });
        });
      }

      const groupedByDate: { [key: string]: EnrichedSaleRecord[] } = {};
      
      salesData.forEach(record => {
        const recordDate = record.date.toDate().toISOString().split('T')[0];
        if (!groupedByDate[recordDate]) {
          groupedByDate[recordDate] = [];
        }
        
        const customerName = customersMap.get(record.customer_id) || "Cliente desconhecido";

        groupedByDate[recordDate].push({
          date: recordDate,
          customerName,
          total: Number(record.total_price),
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
        const date = new Date(dateString + 'T12:00:00'); // Usar um horário neutro para evitar problemas de fuso
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
      title: "Pendente",
      value: formatCurrency(stats.totalPending),
      icon: DollarSign,
      color: "text-orange-500",
    },
    {
      title: "Recebido",
      value: formatCurrency(stats.totalPaid),
      icon: TrendingUp,
      color: "text-green-500",
    },
    {
      title: "Clientes",
      value: stats.totalCustomers,
      icon: Users,
      color: "text-blue-500",
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
