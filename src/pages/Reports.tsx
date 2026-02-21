import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, AlertCircle, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Calendar, Users, BarChart2 } from 'lucide-react';

// Interfaces
interface SaleDay {
  date: string;
  total: number;
  items: number;
}

interface SaleDetail {
  id: string;
  product_name: string;
  quantity: number;
  subtotal: number;
  customer_name: string;
  payLater: boolean;
}

const Reports = () => {
  const { user } = useAuth();
  const [saleDays, setSaleDays] = useState<SaleDay[]>([]);
  const [selectedDay, setSelectedDay] = useState<SaleDay | null>(null);
  const [saleDetails, setSaleDetails] = useState<SaleDetail[]>([]);
  const [loadingDays, setLoadingDays] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSaleDays = async () => {
      if (!user) return;
      setLoadingDays(true);
      setError(null);
      try {
        const q = query(collection(db, 'consumption_records'), orderBy('date', 'desc'));
        const snapshot = await getDocs(q);
        
        const salesByDay = snapshot.docs.reduce((acc, doc) => {
          const data = doc.data();
          const dateStr = data.date; // Assuming 'date' is 'yyyy-MM-dd'
          if (dateStr) {
            if (!acc[dateStr]) {
              acc[dateStr] = { total: 0, items: 0 };
            }
            acc[dateStr].total += data.subtotal || 0;
            acc[dateStr].items += data.quantity || 0;
          }
          return acc;
        }, {} as Record<string, { total: number; items: number }>);

        const days: SaleDay[] = Object.entries(salesByDay).map(([date, data]) => ({
          date,
          total: data.total,
          items: data.items,
        }));

        // FIX: Ensure all dates are valid strings before sorting
        const sortedDays = days.sort((a, b) => {
            const dateA = String(a.date || '');
            const dateB = String(b.date || '');
            return dateB.localeCompare(dateA); // Sort descending
        });

        setSaleDays(sortedDays);
      } catch (err) {
        console.error('Erro ao buscar dias com vendas:', err);
        setError('Não foi possível carregar o histórico de vendas.');
        if (err instanceof TypeError) {
            console.error('TypeError details:', err.message, err.stack);
        }
      } finally {
        setLoadingDays(false);
      }
    };
    fetchSaleDays();
  }, [user]);

  const handleDayClick = async (day: SaleDay) => {
    if (!user || selectedDay?.date === day.date) {
        setSelectedDay(null); // Toggle off if clicking the same day
        setSaleDetails([]);
        return;
    }
    setSelectedDay(day);
    setLoadingDetails(true);
    try {
      const q = query(
        collection(db, 'consumption_records'),
        where('ownerId', '==', user.uid),
        where('date', '==', day.date),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const details = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SaleDetail));
      setSaleDetails(details);
    } catch (err) {
      console.error('Erro ao buscar detalhes do dia:', err);
      toast.error('Falha ao carregar detalhes das vendas.');
    } finally {
      setLoadingDetails(false);
    }
  };
  
  const formatDate = (dateStr: string) => {
    try {
        const date = parse(dateStr, 'yyyy-MM-dd', new Date());
        if (isValid(date)) {
            return format(date, "PPP", { locale: ptBR });
        }
    } catch (e) { /* Ignore parsing error */ }
    // Fallback for invalid or unexpected date formats
    return dateStr;
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Relatório de Vendas</h1>
        <p className="text-gray-500 dark:text-gray-400">Visualize o histórico de vendas diárias.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card className="max-h-[70vh] flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center"><Calendar className="mr-2" /> Dias com Vendas</CardTitle>
              <CardDescription>Clique em um dia para ver os detalhes</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow overflow-y-auto">
              {loadingDays ? (
                <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
              ) : error ? (
                <div className="text-red-500 flex flex-col items-center justify-center h-full">
                  <AlertCircle className="h-8 w-8 mb-2" />
                  <p>{error}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saleDays.map((day) => (
                      <TableRow 
                        key={day.date} 
                        onClick={() => handleDayClick(day)} 
                        className={`cursor-pointer ${selectedDay?.date === day.date ? 'bg-muted/80' : 'hover:bg-muted/50'}`}>
                        <TableCell className="font-medium">{formatDate(day.date)}</TableCell>
                        <TableCell className="text-right font-bold text-green-600">R$ {day.total.toFixed(2).replace('.', ',')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
            {selectedDay ? (
                 <Card>
                 <CardHeader>
                   <CardTitle>Detalhes de {formatDate(selectedDay.date)}</CardTitle>
                   <CardDescription>Total de <span className='font-bold text-primary'>R$ {selectedDay.total.toFixed(2).replace('.', ',')}</span> em <span className='font-bold text-primary'>{selectedDay.items}</span> itens vendidos.</CardDescription>
                 </CardHeader>
                 <CardContent>
                    {loadingDetails ? (
                        <div className="flex justify-center items-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                <TableHead>Produto</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead className="text-center">Qtd</TableHead>
                                <TableHead className="text-center">Modo</TableHead>
                                <TableHead className="text-right">Subtotal</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {saleDetails.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium">{item.product_name}</TableCell>
                                    <TableCell className="text-muted-foreground">{item.customer_name}</TableCell>
                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={item.payLater ? 'destructive' : 'default'}>
                                            {item.payLater ? 'Fiado' : 'Pago'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-semibold">R$ {item.subtotal.toFixed(2).replace('.', ',')}</TableCell>
                                </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                 </CardContent>
               </Card>
            ) : (
                <div className='flex items-center justify-center h-full bg-muted/30 rounded-lg border-2 border-dashed border-muted-foreground/30'>
                    <div className='text-center text-muted-foreground'>
                        <BarChart2 className='mx-auto h-12 w-12 mb-4' />
                        <h3 className='text-lg font-semibold'>Selecione um dia</h3>
                        <p>Escolha um dia na lista ao lado para ver os detalhes das vendas.</p>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
