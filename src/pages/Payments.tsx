import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ConsumptionRecord {
  id: string;
  customer_id: string;
  consumption_date: string;
  items: any;
  total: number;
  paid: boolean;
  payment_date: string | null;
  customers: { name: string; phone: string | null };
}

const Payments = () => {
  const [records, setRecords] = useState<ConsumptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [selectedRecord, setSelectedRecord] = useState<ConsumptionRecord | null>(
    null
  );

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      const { data, error } = await supabase
        .from("consumption_records")
        .select("*, customers(name, phone)")
        .order("consumption_date", { ascending: false });

      if (error) throw error;
      setRecords((data as any) || []);
    } catch (error) {
      console.error("Erro ao carregar registros:", error);
      toast.error("Erro ao carregar registros");
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (recordId: string) => {
    try {
      const { error } = await supabase
        .from("consumption_records")
        .update({ paid: true, payment_date: paymentDate })
        .eq("id", recordId);

      if (error) throw error;

      toast.success("Pagamento registrado com sucesso!");
      fetchRecords();
    } catch (error) {
      console.error("Erro ao registrar pagamento:", error);
      toast.error("Erro ao registrar pagamento");
    }
  };

  const shareWhatsApp = (record: ConsumptionRecord) => {
    const items = record.items
      .map((item: any) => `${item.quantity}x ${item.product_name} - R$ ${item.subtotal.toFixed(2)}`)
      .join("\n");

    const message = `*Consumo - ${record.customers.name}*\n\nData: ${new Date(
      record.consumption_date
    ).toLocaleDateString("pt-BR")}\n\nItens:\n${items}\n\n*Total: R$ ${record.total.toFixed(2)}*\n\n${
      record.paid
        ? `✅ Pago em ${new Date(record.payment_date!).toLocaleDateString("pt-BR")}`
        : "⏳ Pendente"
    }`;

    const phone = record.customers.phone?.replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank");
  };

  if (loading) {
    return <div className="text-center py-8">Carregando...</div>;
  }

  const pendingRecords = records.filter((r) => !r.paid);
  const paidRecords = records.filter((r) => r.paid);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Pagamentos</h2>
        <p className="text-muted-foreground">Gerencie os pagamentos dos clientes</p>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-warning mb-4">
            Pendentes ({pendingRecords.length})
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pendingRecords.map((record) => (
              <Card key={record.id} className="border-warning/50">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-lg text-foreground">
                          {record.customers.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {new Date(record.consumption_date).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <Badge variant="outline" className="bg-warning/10 text-warning border-warning">
                        Pendente
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {record.items.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-muted-foreground">
                            {item.quantity}x {item.product_name}
                          </span>
                          <span className="text-foreground">
                            R$ {item.subtotal.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t flex justify-between items-center">
                      <span className="text-lg font-bold text-foreground">Total</span>
                      <span className="text-2xl font-bold text-primary">
                        R$ {record.total.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            className="flex-1 bg-success hover:bg-success/90"
                            onClick={() => setSelectedRecord(record)}
                          >
                            <Check className="w-4 h-4 mr-2" />
                            Registrar Pagamento
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Registrar Pagamento</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="payment-date">Data do Pagamento</Label>
                              <Input
                                id="payment-date"
                                type="date"
                                value={paymentDate}
                                onChange={(e) => setPaymentDate(e.target.value)}
                              />
                            </div>
                            <Button
                              onClick={() => {
                                handlePayment(record.id);
                                setSelectedRecord(null);
                              }}
                              className="w-full bg-success hover:bg-success/90"
                            >
                              Confirmar Pagamento
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => shareWhatsApp(record)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold text-success mb-4">
            Pagos ({paidRecords.length})
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {paidRecords.map((record) => (
              <Card key={record.id} className="border-success/50">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-lg text-foreground">
                          {record.customers.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Consumo:{" "}
                          {new Date(record.consumption_date).toLocaleDateString("pt-BR")}
                        </p>
                        <p className="text-sm text-success font-medium">
                          Pago em:{" "}
                          {new Date(record.payment_date!).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <Badge className="bg-success text-success-foreground">
                        <Check className="w-3 h-3 mr-1" />
                        Pago
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {record.items.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-muted-foreground">
                            {item.quantity}x {item.product_name}
                          </span>
                          <span className="text-foreground">
                            R$ {item.subtotal.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t flex justify-between items-center">
                      <span className="text-lg font-bold text-foreground">Total</span>
                      <span className="text-2xl font-bold text-success">
                        R$ {record.total.toFixed(2)}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => shareWhatsApp(record)}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Compartilhar no WhatsApp
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payments;
