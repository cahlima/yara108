import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  getDocs,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
  where,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, ExternalLink, Trash2, Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ConsumptionRecord {
  id: string;
  customer_id: string;
  consumption_date: string;
  items: any;
  total: number;
  paid: boolean;
  payment_date: string | null;
  customer_name: string;
  customer_phone: string | null;
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
  const [editingDateRecord, setEditingDateRecord] = useState<ConsumptionRecord | null>(null);
  const [newConsumptionDate, setNewConsumptionDate] = useState("");

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const recordsRef = collection(db, "consumption_records");
      const q = query(recordsRef, orderBy("consumption_date", "desc"));
      const querySnapshot = await getDocs(q);
      
      const recordsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const customerIds = [...new Set(recordsData.map(r => r.customer_id).filter(id => id))];
      
      const customersMap = new Map<string, { name: string; phone: string | null }>();
      if (customerIds.length > 0) {
        const customersQuery = query(collection(db, "customers"), where("id", "in", customerIds));
        const customersSnapshot = await getDocs(customersQuery);
        customersSnapshot.forEach(doc => {
          const customer = doc.data();
          customersMap.set(customer.id, { name: customer.name, phone: customer.phone || null });
        });
      }

      const enrichedRecords = recordsData.map(record => ({
        ...record,
        customer_name: customersMap.get(record.customer_id)?.name || "Cliente não encontrado",
        customer_phone: customersMap.get(record.customer_id)?.phone || null,
      })) as ConsumptionRecord[];

      setRecords(enrichedRecords);

    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao carregar registros:", error);
      toast.error("Erro ao carregar registros");
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (recordId: string) => {
    try {
      const recordRef = doc(db, "consumption_records", recordId);
      await updateDoc(recordRef, { paid: true, payment_date: paymentDate });
      toast.success("Pagamento registrado com sucesso!");
      fetchRecords(); // Refresh
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao registrar pagamento:", error);
      toast.error("Erro ao registrar pagamento");
    }
  };

  const handleDelete = async (recordId: string) => {
    try {
      const recordRef = doc(db, "consumption_records", recordId);
      await deleteDoc(recordRef);
      toast.success("Lançamento excluído com sucesso!");
      fetchRecords(); // Refresh
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao excluir lançamento:", error);
      toast.error("Erro ao excluir lançamento");
    }
  };

  const handleEditDate = async (recordId: string) => {
    if (!newConsumptionDate) {
      toast.error("Selecione uma data");
      return;
    }

    try {
      const recordRef = doc(db, "consumption_records", recordId);
      await updateDoc(recordRef, { consumption_date: newConsumptionDate });
      toast.success("Data atualizada com sucesso!");
      setEditingDateRecord(null);
      setNewConsumptionDate("");
      fetchRecords(); // Refresh
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao atualizar data:", error);
      toast.error("Erro ao atualizar data");
    }
  };

  const shareWhatsApp = (record: ConsumptionRecord) => {
    const items = record.items
      .map((item: any) => `${item.quantity}x ${item.product_name} - R$ ${item.subtotal.toFixed(2)}`)
      .join("\n");

    const message = `*Consumo - ${record.customer_name}*\n\nData: ${new Date(
      record.consumption_date
    ).toLocaleDateString("pt-BR")}\n\nItens:\n${items}\n\n*Total: R$ ${record.total.toFixed(2)}*\n\n${
      record.paid
        ? `✅ Pago em ${new Date(record.payment_date!).toLocaleDateString("pt-BR")}`
        : "⏳ Pendente"
    }`;

    const phone = record.customer_phone?.replace(/\D/g, "");
    const encodedMessage = encodeURIComponent(message);
    const url = phone
      ? `https://wa.me/55${phone}?text=${encodedMessage}`
      : `https://wa.me/?text=${encodedMessage}`;

    window.open(url, '_blank');
  };

  const RecordActions = ({ record }: { record: ConsumptionRecord }) => (
    <div className="flex gap-1">
      <Dialog 
        open={editingDateRecord?.id === record.id} 
        onOpenChange={(open) => {
          if (open) {
            setEditingDateRecord(record);
            setNewConsumptionDate(record.consumption_date);
          } else {
            setEditingDateRecord(null);
            setNewConsumptionDate("");
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" title="Editar data">
            <Calendar className="w-4 h-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Data do Consumo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cliente: <strong>{record.customer_name}</strong>
            </p>
            <div className="space-y-2">
              <Label htmlFor="new-date">Nova Data</Label>
              <Input
                id="new-date"
                type="date"
                value={newConsumptionDate}
                onChange={(e) => setNewConsumptionDate(e.target.value)}
              />
            </div>
            <Button
              onClick={() => handleEditDate(record.id)}
              className="w-full"
            >
              Salvar Alteração
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="icon" title="Excluir lançamento">
            <Trash2 className="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O lançamento de{" "}
              <strong>{record.customer_name}</strong> no valor de{" "}
              <strong>R$ {record.total.toFixed(2)}</strong> será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(record.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

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
          {pendingRecords.length === 0 ? (
             <p className="text-sm text-muted-foreground">Nenhum registro pendente.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pendingRecords.map((record) => (
                <Card key={record.id} className="border-warning/50">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-lg text-foreground">
                            {record.customer_name}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {new Date(record.consumption_date + 'T00:00:00').toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <RecordActions record={record} />
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning">
                            Pendente
                          </Badge>
                        </div>
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
                        <Dialog open={selectedRecord?.id === record.id} onOpenChange={open => !open && setSelectedRecord(null)}>
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
                               <p>Confirmar o pagamento de <strong>R$ {record.total.toFixed(2)}</strong> para <strong>{record.customer_name}</strong>?</p>
                              <div className="space-y-2">
                                <Label htmlFor="payment-date">Data do Pagamento</Label>
                                <Input
                                  id="payment-date"
                                  type="date"
                                  defaultValue={new Date().toISOString().split("T")[0]}
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
          )}
        </div>

        <div>
          <h3 className="text-xl font-semibold text-success mb-4">
            Pagos ({paidRecords.length})
          </h3>
          {paidRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro pago.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {paidRecords.map((record) => (
                <Card key={record.id} className="border-success/50">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-lg text-foreground">
                            {record.customer_name}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Consumo:{" "}
                            {new Date(record.consumption_date + 'T00:00:00').toLocaleDateString("pt-BR")}
                          </p>
                          {record.payment_date && <p className="text-sm text-success font-medium">
                            Pago em:{" "}
                            {new Date(record.payment_date + 'T00:00:00').toLocaleDateString("pt-BR")}
                          </p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <RecordActions record={record} />
                          <Badge className="bg-success text-success-foreground">
                            <Check className="w-3 h-3 mr-1" />
                            Pago
                          </Badge>
                        </div>
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
          )}
        </div>
      </div>
    </div>
  );
};

export default Payments;
