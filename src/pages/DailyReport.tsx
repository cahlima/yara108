
import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Info } from 'lucide-react';

// Interfaces para os tipos de dados
interface Consumption {
  id: string;
  description: string;
  value: number;
  createdAt: Timestamp;
}

interface Payment {
  id: string;
  method: string;
  amount: number;
  paidAt: Timestamp;
  note?: string;
}

const DailyReportPage = () => {
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totals, setTotals] = useState({ consumption: 0, payment: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDailyData = async () => {
      setLoading(true);
      try {
        // Definir o intervalo de tempo para o dia atual (de 00:00 a 23:59)
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

        const startOfDayTimestamp = Timestamp.fromDate(startOfDay);
        const endOfDayTimestamp = Timestamp.fromDate(endOfDay);

        // 1. Buscar Consumos do dia
        const consumptionsQuery = query(
          collection(db, 'consumption_records'),
          where('createdAt', '>=', startOfDayTimestamp),
          where('createdAt', '<=', endOfDayTimestamp),
          orderBy('createdAt', 'desc')
        );
        const consumptionsSnapshot = await getDocs(consumptionsQuery);
        const consumptionsData = consumptionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Consumption[];
        const totalConsumption = consumptionsData.reduce((sum, item) => sum + item.value, 0);
        setConsumptions(consumptionsData);

        // 2. Buscar Pagamentos do dia (*** CORREÇÃO APLICADA AQUI ***)
        const paymentsQuery = query(
          collection(db, 'payments'), // O nome correto da coleção é 'payments'
          where('paidAt', '>=', startOfDayTimestamp),
          where('paidAt', '<=', endOfDayTimestamp),
          orderBy('paidAt', 'desc')
        );
        const paymentsSnapshot = await getDocs(paymentsQuery);
        const paymentsData = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Payment[];
        const totalPayment = paymentsData.reduce((sum, item) => sum + item.amount, 0);
        setPayments(paymentsData);

        // 3. Atualizar totais
        setTotals({ consumption: totalConsumption, payment: totalPayment });
        setError(null);

      } catch (err: any) {
        console.error("Erro ao buscar relatório diário:", err);
        setError("Falha ao carregar os dados. Tente novamente mais tarde.");
      } finally {
        setLoading(false);
      }
    };

    fetchDailyData();
  }, []);

  if (loading) {
    return <div className="p-6">Carregando relatório do dia...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-40 bg-red-50 border border-red-200 rounded-lg m-6">
        <Info className="h-6 w-6 text-red-500 mr-3" /><p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Relatório do Dia: {new Date().toLocaleDateString('pt-BR')}</h1>

      {/* Cards de Totais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Consumo do Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">R$ {totals.consumption.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{consumptions.length} lançamento(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Pagamentos do Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">R$ {totals.payment.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{payments.length} pagamento(s) recebido(s)</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabelas de Detalhes */}
      <div className="space-y-6">
        {/* Tabela de Consumos */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Lançamentos de Consumo</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horário</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumptions.length > 0 ? (
                  consumptions.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>{c.createdAt.toDate().toLocaleTimeString('pt-BR')}</TableCell>
                      <TableCell>{c.description}</TableCell>
                      <TableCell className="text-right">R$ {c.value.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={3} className="text-center">Nenhum consumo registrado hoje.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Tabela de Pagamentos */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Pagamentos Recebidos</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horário</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length > 0 ? (
                  payments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{p.paidAt.toDate().toLocaleTimeString('pt-BR')}</TableCell>
                      <TableCell><Badge variant="secondary">{p.method}</Badge></TableCell>
                      <TableCell>{p.note || '-'}</TableCell>
                      <TableCell className="text-right font-semibold">R$ {p.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={4} className="text-center">Nenhum pagamento recebido hoje.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DailyReportPage;
