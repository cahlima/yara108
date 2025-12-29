import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Calendar, DollarSign, Share2 } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  phone?: string; // Add phone for WhatsApp sharing
}

interface ConsumptionRecord {
  consumption_date: string;
  total: number;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

const Billing = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [records, setRecords] = useState<ConsumptionRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      fetchConsumptionRecords();
    } else {
      setRecords([]);
    }
  }, [selectedCustomerId]);

  const fetchCustomers = async () => {
    try {
      const customersRef = collection(db, "customers");
      const q = query(customersRef, orderBy("name"));
      const querySnapshot = await getDocs(q);
      const customersData = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Customer)
      );
      setCustomers(customersData);
    } catch (error) {
      console.error("Error fetching customers: ", error);
      toast.error("Erro ao carregar clientes.");
    }
  };

  const fetchConsumptionRecords = async () => {
    setLoadingRecords(true);
    try {
      const recordsRef = collection(db, "consumption_records");
      const q = query(
        recordsRef,
        where("customer_id", "==", selectedCustomerId),
        orderBy("consumption_date", "desc")
      );
      const querySnapshot = await getDocs(q);
      const recordsData = querySnapshot.docs.map(
        (doc) => doc.data() as ConsumptionRecord
      );
      setRecords(recordsData);
    } catch (error) {
      console.error("Error fetching records: ", error);
      toast.error("Erro ao carregar registros de consumo.");
    } finally {
      setLoadingRecords(false);
    }
  };

  const calculateTotal = () => {
    return records.reduce((sum, record) => sum + Number(record.total), 0);
  };

  const formatDate = (dateString: string) => {
     // Add a time to the date string to ensure it's parsed as local time
     return new Date(dateString + 'T00:00:00').toLocaleDateString("pt-BR");
  };

  const formatCurrency = (value: number) => {
    return (value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const shareWhatsApp = () => {
    if (!selectedCustomerId || records.length === 0) {
      toast.warning("Nenhum dado para compartilhar", {
        description: "Selecione um cliente com registros.",
      });
      return;
    }

    const customer = customers.find((c) => c.id === selectedCustomerId);
    if (!customer) return;

    const total = calculateTotal();

    let message = `*Fechamento Mensal - ${customer.name}*\n\n`;

    records.forEach((record) => {
      message += `📅 *${formatDate(
        record.consumption_date
      )}* - ${formatCurrency(Number(record.total))}\n`;
      (record.items || []).forEach((item) => {
        message += `   • ${item.quantity}x ${item.product_name} (${formatCurrency(Number(item.unit_price))}) = ${formatCurrency(Number(item.subtotal))}\n`;
      });
      message += `\n`;
    });

    message += `\n💰 *Total Geral: ${formatCurrency(total)}*`;

    const encodedMessage = encodeURIComponent(message);
    // Use customer's phone if available
    const phone = customer.phone?.replace(/\D/g, "");
    const url = phone 
      ? `https://wa.me/55${phone}?text=${encodedMessage}`
      : `https://wa.me/?text=${encodedMessage}`;

    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fechamento Mensal</h1>
        <p className="text-muted-foreground">
          Visualize o consumo detalhado por cliente
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Selecionar Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um cliente" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedCustomerId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Resumo do Período</span>
                <div className="flex items-center gap-4">
                  <span className="text-2xl text-primary font-bold">
                    {formatCurrency(calculateTotal())}
                  </span>
                  <Button onClick={shareWhatsApp} size="sm" className="gap-2">
                    <Share2 className="h-4 w-4" />
                    Compartilhar
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Consumo por Data</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRecords ? (
                <p className="text-center text-muted-foreground py-8">
                  Carregando...
                </p>
              ) : records.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum registro encontrado para este cliente.
                </p>
              ) : (
                <div className="space-y-6">
                  {records.map((record, index) => (
                    <div key={index} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-5 w-5 text-primary" />
                          <span className="font-semibold">
                            {formatDate(record.consumption_date)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5 text-primary" />
                          <span className="font-bold text-lg">
                            {formatCurrency(Number(record.total))}
                          </span>
                        </div>
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Produto</TableHead>
                            <TableHead className="text-center">Qtd</TableHead>
                            <TableHead className="text-right">Preço Unit.</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(record.items || []).map((item, itemIndex) => (
                            <TableRow key={itemIndex}>
                              <TableCell>{item.product_name}</TableCell>
                              <TableCell className="text-center">
                                {item.quantity}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(Number(item.unit_price))}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(Number(item.subtotal))}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Billing;
