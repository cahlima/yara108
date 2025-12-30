
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth"; // 1. Importar o useAuth
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DollarSign, Users, TrendingUp, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Interfaces permanecem as mesmas
interface Stats {
  totalPending: number;
  totalPaid: number;
  totalCustomers: number;
}

interface DailyRecord {
  date: string;
  customerName: string;
  total: number;
}

interface DailyGroup {
  date: string;
  records: DailyRecord[];
  dayTotal: number;
}


const Dashboard = () => {
  const { loading: authLoading } = useAuth(); // 2. Usar o hook e obter o status de loading da autenticação
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
    setLoading(true);
    try {
      const consumptionRecordsRef = collection(db, "consumption_records");
      const customersRef = collection(db, "customers");

      const [consumptionSnapshot, customersSnapshot] = await Promise.all([
        getDocs(consumptionRecordsRef),
        getDocs(customersRef),
      ]);

      const consumptionData = consumptionSnapshot.docs.map((doc) => doc.data());
      
      const totalPending = consumptionData
        .filter((r) => !r.paid)
        .reduce((sum, r) => sum + Number(r.total), 0) || 0;

      const totalPaid = consumptionData
        .filter((r) => r.paid)
        .reduce((sum, r) => sum + Number(r.total), 0) || 0;

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
  }, []);

  // 3. O useEffect agora depende de `authLoading`
  useEffect(() => {
    if (!authLoading) {
      fetchStats();
    }
  }, [authLoading, fetchStats]);

  const handleFilter = async () => {
    if (!startDate || !endDate) {
      toast.error("Selecione as datas inicial e final");
      return;
    }

    setLoading(true);
    try {
      const consumptionRecordsRef = collection(db, "consumption_records");
      const q = query(
        consumptionRecordsRef,
        where("consumption_date", ">=", startDate),
        where("consumption_date", "<=", endDate)
      );
      const querySnapshot = await getDocs(q);
      const consumptionData = querySnapshot.docs.map(doc => doc.data());

      const customerIds = [...new Set(consumptionData.map(r => r.customer_id).filter(id => id))];
      
      const customersMap = new Map<string, string>();
      if (customerIds.length > 0) {
        // Esta parte pode ser otimizada se houver muitos customerIds
        // Por enquanto, mantemos a lógica para garantir a correção.
        const customersSnapshot = await getDocs(collection(db, "customers"));
        customersSnapshot.forEach(doc => {
            if(customerIds.includes(doc.id)){
                 customersMap.set(doc.id, doc.data().name);
            }
        });
      }

      // Group by date
      const groupedByDate: { [key: string]: DailyRecord[] } = {};
      
      consumptionData.forEach(record => {
        const date = record.consumption_date;
        if (!groupedByDate[date]) {
          groupedByDate[date] = [];
        }
        
        const customerName = customersMap.get(record.customer_id) || "Cliente desconhecido";

        groupedByDate[date].push({
          date,
          customerName,
          total: Number(record.total),
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
      toast.error("Erro ao filtrar dados");
    } finally {
      setLoading(false);
    }
  };

  const clearFilter = () => {
    setStartDate("");
    setEndDate("");
    setIsFiltered(false);
    setDailyGroups([]);
    fetchStats(); // Recarrega as estatísticas gerais ao limpar o filtro
  };
  
    // Funções de formatação (formatDate, formatCurrency) permanecem as mesmas
    const formatDate = (dateString: string) => {
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString("pt-BR", {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        });
    };
    
    const formatCurrency = (value: number) => {
        return value.toLocaleString("pt-BR", {
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

  // 4. Mostrar um loader enquanto a autenticação ou o carregamento inicial estiverem acontecendo.
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
        <p className="text-muted-foreground">Visão geral do sistema de consumo</p>
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
