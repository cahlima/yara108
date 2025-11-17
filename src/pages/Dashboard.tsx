import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Users, Package, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface Stats {
  totalPending: number;
  totalPaid: number;
  totalCustomers: number;
  totalProducts: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<Stats>({
    totalPending: 0,
    totalPaid: 0,
    totalCustomers: 0,
    totalProducts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    fetchStats();
  }, [startDate, endDate]);

  const fetchStats = async () => {
    try {
      let consumptionQuery = supabase.from("consumption_records").select("total, paid, consumption_date");
      
      if (startDate) {
        consumptionQuery = consumptionQuery.gte("consumption_date", startDate);
      }
      if (endDate) {
        consumptionQuery = consumptionQuery.lte("consumption_date", endDate);
      }
      
      const [consumptionData, customersData, productsData] = await Promise.all([
        consumptionQuery,
        supabase.from("customers").select("id", { count: "exact" }),
        supabase.from("products").select("id", { count: "exact" }),
      ]);

      if (consumptionData.error) throw consumptionData.error;
      if (customersData.error) throw customersData.error;
      if (productsData.error) throw productsData.error;

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
        totalProducts: productsData.count || 0,
      });
    } catch (error) {
      console.error("Erro ao carregar estatísticas:", error);
      toast.error("Erro ao carregar estatísticas");
    } finally {
      setLoading(false);
    }
  };

  const statsCards = [
    {
      title: "Pendente",
      value: `R$ ${stats.totalPending.toFixed(2)}`,
      icon: DollarSign,
      color: "text-warning",
    },
    {
      title: "Recebido",
      value: `R$ ${stats.totalPaid.toFixed(2)}`,
      icon: TrendingUp,
      color: "text-success",
    },
    {
      title: "Clientes",
      value: stats.totalCustomers,
      icon: Users,
      color: "text-accent",
    },
    {
      title: "Produtos",
      value: stats.totalProducts,
      icon: Package,
      color: "text-primary",
    },
  ];

  if (loading) {
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
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
    </div>
  );
};

export default Dashboard;
