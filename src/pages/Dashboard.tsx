import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DollarSign, Users, TrendingUp, Search } from "lucide-react";
import { toast } from "sonner";

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

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [consumptionData, customersData] = await Promise.all([
        supabase.from("consumption_records").select("total, paid"),
        supabase.from("customers").select("id", { count: "exact" }),
      ]);

      if (consumptionData.error) throw consumptionData.error;
      if (customersData.error) throw customersData.error;

      const totalPending = consumptionData.data
        ?.filter((r) => !r.paid)
        .reduce((sum, r) => sum + Number(r.total), 0) || 0;

      const totalPaid = consumptionData.data
        ?.filter((r) => r.paid)
        .reduce((sum, r) => sum + Number(r.total), 0) || 0;

      setStats({
        totalPending,
        totalPaid,
        totalCustomers: customersData.count || 0,
      });
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao carregar estatísticas:", error);
      toast.error("Erro ao carregar estatísticas");
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = async () => {
    if (!startDate || !endDate) {
      toast.error("Selecione as datas inicial e final");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("consumption_records")
        .select(`
          consumption_date,
          total,
          customer_id,
          customers (name)
        `)
        .gte("consumption_date", startDate)
        .lte("consumption_date", endDate)
        .order("consumption_date", { ascending: true });

      if (error) throw error;

      // Group by date
      const groupedByDate: { [key: string]: DailyRecord[] } = {};
      
      data?.forEach((record: any) => {
        const date = record.consumption_date;
        if (!groupedByDate[date]) {
          groupedByDate[date] = [];
        }
        groupedByDate[date].push({
          date,
          customerName: record.customers?.name || "Cliente desconhecido",
          total: Number(record.total),
        });
      });

      const groups: DailyGroup[] = Object.entries(groupedByDate).map(([date, records]) => ({
        date,
        records,
        dayTotal: records.reduce((sum, r) => sum + r.total, 0),
      }));

      setDailyGroups(groups);
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
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + "T00:00:00");
    return date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
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
      color: "text-warning",
    },
    {
      title: "Recebido",
      value: formatCurrency(stats.totalPaid),
      icon: TrendingUp,
      color: "text-success",
    },
    {
      title: "Clientes",
      value: stats.totalCustomers,
      icon: Users,
      color: "text-accent",
    },
  ];

  if (loading && !isFiltered) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Carregando...</div>
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
                <Search className="w-4 h-4 mr-2" />
                Ir
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
            <Card key={stat.title} className="border-border">
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
          {dailyGroups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum registro encontrado no período selecionado.
              </CardContent>
            </Card>
          ) : (
            dailyGroups.map((group) => (
              <Card key={group.date}>
                <CardHeader>
                  <CardTitle className="text-lg capitalize">
                    {formatDate(group.date)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {group.records.map((record, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center py-2 border-b border-border last:border-0"
                      >
                        <span className="text-foreground">{record.customerName}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(record.total)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-3 border-t-2 border-primary">
                      <span className="font-bold text-foreground">Total do Dia</span>
                      <span className="font-bold text-primary text-lg">
                        {formatCurrency(group.dayTotal)}
                      </span>
                    </div>
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
