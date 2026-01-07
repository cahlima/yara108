
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  query,
  where,
  FirestoreError,
  Timestamp,
  writeBatch,
  runTransaction,
  getDoc,
  increment,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  PlusCircle,
  Loader2,
  Save,
  Trash2,
  X,
  Calendar as CalendarIcon,
} from "lucide-react";
import { format, startOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

interface Customer {
  id: string;
  name: string;
}

interface ConsumptionItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

// Updated interface to include all relevant fields from the document
interface ConsumptionRecord {
  id: string;
  ownerId: string;
  customer_id: string;
  customer_name: string;
  product_name: string;
  quantity: number;
  subtotal: number;
  payLater: boolean;
  invoiceId?: string;
  createdAt: Timestamp;
}


const Consumption = () => {
  const { user, loading: authLoading } = useAuth();

  const [items, setItems] = useState<ConsumptionItem[]>([]);
  const [payLater, setPayLater] = useState(true);
  const [quantity, setQuantity] = useState<number>(1);

  // Data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [dayProducts, setDayProducts] = useState<Product[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  const [consumptionDate, setConsumptionDate] = useState<Date>(new Date());
  const [savedRecords, setSavedRecords] = useState<ConsumptionRecord[]>([]);

  // Loading states
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isDayProductsLoading, setIsDayProductsLoading] = useState(true);
  const [isRecordsLoading, setIsRecordsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDayProducts, setIsSavingDayProducts] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null); // Track deletion status

  // Day products selection
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState('');

  // Select open states
  const [customerOpen, setCustomerOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);


  const fetchCustomers = useCallback(async (ownerId: string) => {
    try {
      const q = query(collection(db, "customers"), where("ownerId", "==", ownerId));
      const snapshot = await getDocs(q);
      const customersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
      setCustomers(customersData.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      console.error(e);
      toast.error("Falha ao carregar clientes.");
      setCustomers([]);
    }
  }, []);

  const fetchProducts = useCallback(async (ownerId: string) => {
    try {
      const q = query(collection(db, "products"), where("ownerId", "==", ownerId));
      const snapshot = await getDocs(q);
      const productsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      setProducts(productsData.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      console.error(e);
      toast.error("Falha ao carregar produtos.");
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    if (authLoading) {
      setIsInitialLoading(true);
      return;
    }
    if (user) {
      const loadAll = async () => {
        setIsInitialLoading(true);
        await Promise.all([
          fetchCustomers(user.uid),
          fetchProducts(user.uid)
        ]);
        setIsInitialLoading(false);
      }
      loadAll();
    } else {
      setIsInitialLoading(false);
      setCustomers([]);
      setProducts([]);
    }
  }, [user, authLoading, fetchCustomers, fetchProducts]);

  const fetchDayProducts = useCallback(async (date: Date, ownerId: string) => {
    setIsDayProductsLoading(true);
    const dayId = format(date, "yyyy-MM-dd");
    const dayProductsRef = doc(db, "day_products", `${ownerId}_${dayId}`);
    try {
      const docSnap = await getDoc(dayProductsRef);
      if (docSnap.exists()) {
        setDayProducts(docSnap.data().products || []);
      } else {
        setDayProducts([]);
      }
    } catch (e) {
      console.error("Error fetching day products: ", e);
      toast.error("Erro ao buscar produtos do dia.");
    } finally {
      setIsDayProductsLoading(false);
    }
  }, []);

  const fetchConsumptionRecords = useCallback(
    async (date: Date, ownerId: string) => {
      setIsRecordsLoading(true);
      const dateStr = format(date, "yyyy-MM-dd");
      const q = query(
        collection(db, "consumption_records"),
        where("ownerId", "==", ownerId),
        where("date", "==", dateStr)
      );
      try {
        const snapshot = await getDocs(q);
        const records = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as ConsumptionRecord)
        );
        setSavedRecords(
          records.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
        );
      } catch (e) {
        console.error("Error fetching records: ", e);
        toast.error("Erro ao buscar lançamentos salvos.");
      } finally {
        setIsRecordsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setSelectedProduct("");
  }, [selectedCustomer]);

  useEffect(() => {
    if (selectedProduct && !dayProducts.some((p) => p.id === selectedProduct)) {
      setProductOpen(false); // 🔑 FECHA O SELECT PRIMEIRO
      setSelectedProduct("");
    }
  }, [dayProducts, selectedProduct]);
  
  const addItem = () => {
    if (!selectedCustomer || !selectedProduct) {
      toast.error("Selecione cliente e produto.");
      return;
    }
    const product = dayProducts.find((p) => p.id === selectedProduct);
    if (!product) {
      toast.error("Produto não encontrado na lista do dia.");
      return;
    }
    setItems((prevItems) => {
      const existingItemIndex = prevItems.findIndex((item) => item.product_id === selectedProduct);
      if (existingItemIndex > -1) {
        const newItems = [...prevItems];
        const item = newItems[existingItemIndex];
        item.quantity += quantity;
        item.subtotal = item.quantity * item.unit_price;
        return newItems;
      } else {
        return [
          ...prevItems, {
            id: `${selectedProduct}_${Date.now()}`,
            product_id: selectedProduct,
            product_name: product.name,
            quantity,
            unit_price: product.price,
            subtotal: product.price * quantity,
          },
        ];
      }
    });
    setQuantity(1);
    setSelectedProduct("");
    setProductOpen(false);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const saveConsumption = async () => {
    if (!user || items.length === 0 || !selectedCustomer) {
      toast.error("Cliente não selecionado ou nenhum item na lista.");
      return;
    }
    setIsSubmitting(true);
    const batch = writeBatch(db);
    const date = format(consumptionDate, "yyyy-MM-dd");
    const month = format(consumptionDate, "yyyy-MM");
    const customerId = selectedCustomer;
    const ownerId = user.uid;
    const customerName = customers.find((c) => c.id === customerId)?.name || "Cliente";
    let totalToInvoice = 0;
    let invoiceId: string | undefined = undefined;
    if (payLater) {
        invoiceId = `${ownerId}_${customerId}_${month}`;
        items.forEach(item => { totalToInvoice += item.subtotal; });
    }
    try {
        items.forEach((item) => {
            const recordRef = doc(collection(db, "consumption_records"));
            const record = {
                ownerId, date, customer_id: customerId, customer_name: customerName,
                product_id: item.product_id, product_name: item.product_name, quantity: item.quantity,
                unit_price: item.unit_price, subtotal: item.subtotal, payLater: payLater,
                createdAt: Timestamp.now(),
                ...(payLater && invoiceId && { invoiceId: invoiceId }),
            };
            batch.set(recordRef, record);
        });
        if (payLater && invoiceId && totalToInvoice > 0) {
            const invoiceRef = doc(db, "invoices", invoiceId);
            await runTransaction(db, async (transaction) => {
                const invoiceDoc = await transaction.get(invoiceRef);
                if (!invoiceDoc.exists()) {
                    transaction.set(invoiceRef, {
                        ownerId, customerId, month,
                        total: totalToInvoice, paidTotal: 0, openTotal: totalToInvoice,
                        status: "OPEN", createdAt: Timestamp.now(),
                    });
                } else {
                    transaction.update(invoiceRef, {
                        total: increment(totalToInvoice),
                        openTotal: increment(totalToInvoice),
                        updatedAt: Timestamp.now(),
                    });
                }
            });
        }
        await batch.commit();
        toast.success("Consumo salvo com sucesso!");
        setItems([]);
        setSelectedCustomer("");
        setSelectedProduct("");
        fetchConsumptionRecords(consumptionDate, user.uid);
    } catch (e) {
      const err = e as FirestoreError;
      console.error("Erro ao salvar consumo:", err);
      toast.error(`Falha ao salvar: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleDeleteRecord = async (record: ConsumptionRecord) => {
    if (!user) return;
    setIsDeleting(record.id);
    try {
        await runTransaction(db, async (transaction) => {
            const recordRef = doc(db, "consumption_records", record.id);
            
            // --- FIX: READ FIRST, THEN WRITE ---
            let invoiceRef;
            let invoiceDoc;
            if (record.payLater && record.invoiceId) {
                invoiceRef = doc(db, "invoices", record.invoiceId);
                invoiceDoc = await transaction.get(invoiceRef); // 1. READ
            }

            // 2. NOW, WRITE
            transaction.delete(recordRef); // WRITE 1

            if (invoiceRef && invoiceDoc?.exists()) {
                transaction.update(invoiceRef, { // WRITE 2
                    total: increment(-record.subtotal),
                    openTotal: increment(-record.subtotal),
                });
            }
        });

        toast.success("Lançamento excluído com sucesso!");
        fetchConsumptionRecords(consumptionDate, user.uid);

    } catch (e) {
        const err = e as FirestoreError;
        console.error("Erro ao excluir lançamento:", err);
        toast.error(`Falha ao excluir: ${err.message}`);
    } finally {
        setIsDeleting(null);
    }
  };

  useEffect(() => {
    if (!user || isInitialLoading) return;
    fetchDayProducts(consumptionDate, user.uid);
    fetchConsumptionRecords(consumptionDate, user.uid);
    setItems([]);
    setSelectedCustomer("");
    setSelectedProduct("");
  }, [consumptionDate, user, isInitialLoading, fetchDayProducts, fetchConsumptionRecords]);

  useEffect(() => {
    const dayProductIds = new Set(dayProducts.map((p) => p.id));
    setAvailableProducts(
      products.filter((p) => !dayProductIds.has(p.id) && p.active)
    );
  }, [products, dayProducts]);

  const addProductToDay = (productId: string) => {
    if (!productId) return;
    const product = products.find((p) => p.id === productId);
    if (product) {
      setDayProducts((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setSelectedProductToAdd("");
  };

  const removeProductFromDay = (productId: string) => {
    setDayProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const saveDayProducts = async () => {
    if (!user) return;
    setIsSavingDayProducts(true);
    const dayId = format(consumptionDate, "yyyy-MM-dd");
    const dayProductsRef = doc(db, "day_products", `${user.uid}_${dayId}`);
    try {
      await setDoc(dayProductsRef, { products: dayProducts, ownerId: user.uid });
      toast.success("Produtos do dia salvos!");
    } catch (e) {
      console.error("Error saving day products: ", e);
      toast.error("Erro ao salvar os produtos do dia.");
    } finally {
      setIsSavingDayProducts(false);
    }
  };
  const safeSelectedProduct =
  dayProducts.some(p => p.id === selectedProduct)
    ? selectedProduct
    : "";

  const totalConsumption = items.reduce((acc, item) => acc + item.subtotal, 0);

  if (authLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Lançar Consumo</h2>
          <p className="text-muted-foreground">Selecione a data para ver e adicionar consumos.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant={"outline"}><CalendarIcon className="mr-2 h-4 w-4" />{format(consumptionDate, "PPP", { locale: ptBR })}</Button>
          </DialogTrigger>
          <DialogContent className="w-auto p-0">
            <Calendar mode="single" selected={consumptionDate} onSelect={(date) => date && setConsumptionDate(startOfDay(date))} initialFocus />
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Produtos do Dia</CardTitle>
            <CardDescription>Itens disponíveis para o dia selecionado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex w-full items-center space-x-2">
              <Select value={selectedProductToAdd} onValueChange={setSelectedProductToAdd}>
                <SelectTrigger><SelectValue placeholder="Adicionar produto..." /></SelectTrigger>
                <SelectContent>
                  {availableProducts.length > 0 ? ( availableProducts.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))) : (<p className="p-4 text-sm text-center text-muted-foreground">Todos os produtos já foram adicionados.</p>)}
                </SelectContent>
              </Select>
              <Button onClick={() => addProductToDay(selectedProductToAdd)} disabled={!selectedProductToAdd}><PlusCircle className="h-4 w-4" /></Button>
            </div>
            {isDayProductsLoading ? (<div className="flex items-center justify-center pt-4"><Loader2 className="h-6 w-6 text-muted-foreground animate-spin" /></div>) : (
              <ul className="space-y-2 pt-4">
                {dayProducts.map((p) => (<li key={p.id} className="flex items-center justify-between text-sm p-2 bg-secondary rounded-md"><span>{p.name}</span><Button variant="ghost" size="icon" onClick={() => removeProductFromDay(p.id)}><X className="h-4 w-4 text-muted-foreground" /></Button></li>))}
                {dayProducts.length === 0 && (<p className="text-sm text-center text-muted-foreground py-4">Nenhum produto para este dia.</p>)}
              </ul>)}
          </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={saveDayProducts} disabled={isSavingDayProducts}><Save className={cn("w-4 h-4 mr-2", isSavingDayProducts && "hidden")} /><Loader2 className={cn("w-4 h-4 mr-2 animate-spin", !isSavingDayProducts && "hidden")} />Salvar Produtos do Dia</Button>
            </CardFooter>
        </Card>

        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader><CardTitle>Novo Lançamento</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <Label>Cliente</Label>
                  <Select open={customerOpen} onOpenChange={setCustomerOpen} value={selectedCustomer} onValueChange={setSelectedCustomer} disabled={items.length > 0}>
                    <SelectTrigger><SelectValue placeholder="Selecione o cliente..." /></SelectTrigger>
                    <SelectContent>{customers.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Produto</Label>
                  <Select open={productOpen} onOpenChange={setProductOpen} value={safeSelectedProduct} onValueChange={setSelectedProduct} disabled={!selectedCustomer || isDayProductsLoading || dayProducts.length === 0}>
                    <SelectTrigger><SelectValue placeholder={dayProducts.length === 0 ? "Adicione produtos do dia" : "Selecione o produto..."} /></SelectTrigger>
                    <SelectContent>{dayProducts.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} min={1} disabled={!selectedCustomer} />
                </div>
                <Button onClick={addItem} className="w-full" disabled={!selectedCustomer || !selectedProduct}><PlusCircle className="w-4 h-4 mr-2" />Adicionar Item</Button>
              </div>
            </CardContent>

            {items.length > 0 && (
              <CardFooter className="flex-col gap-4 items-stretch">
                <h3 className="text-lg font-semibold border-t pt-4">Itens para Salvar</h3>
                <ul className="space-y-2">
                  {items.map((item, index) => (<li key={item.id} className="flex items-center justify-between text-sm p-2 bg-secondary rounded-md"><span>{item.product_name} (x{item.quantity})</span><div className="flex items-center gap-2"><span className="font-medium">R$ {item.subtotal.toFixed(2).replace(".", ",")}</span><Button variant="ghost" size="icon" onClick={() => removeItem(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></li>))}
                </ul>
                <div className="flex justify-between items-center font-bold text-lg pt-2 border-t"><span>Total</span><span>R$ {totalConsumption.toFixed(2).replace(".", ",")}</span></div>
                <div className="flex items-center justify-between w-full pt-4 border-t">
                  <Label htmlFor="pay-later" className="text-sm font-medium flex flex-col gap-1"> Pagar depois? <span className="text-xs text-muted-foreground">Isso irá gerar ou atualizar uma fatura para o cliente.</span></Label>
                  <Switch id="pay-later" checked={payLater} onCheckedChange={setPayLater} />
                </div>
                <Button onClick={saveConsumption} className="w-full" disabled={isSubmitting}><Save className={cn("w-4 h-4 mr-2", isSubmitting && "hidden")} /><Loader2 className={cn("w-4 h-4 mr-2 animate-spin", !isSubmitting && "hidden")} />Salvar Lançamentos</Button>
              </CardFooter>)}
          </Card>

          <Card>
            <CardHeader><CardTitle>Lançamentos Salvos do Dia</CardTitle></CardHeader>
            <CardContent>
              {isRecordsLoading ? (<div className="flex items-center justify-center pt-4"><Loader2 className="h-6 w-6 text-muted-foreground animate-spin" /></div>) : (
                <ul className="space-y-2">
                  {savedRecords.map((record) => (
                    <li key={record.id} className="flex justify-between items-center text-sm p-2 border rounded-md">
                      <span>{record.customer_name}: {record.product_name} (x{record.quantity})</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">R$ {record.subtotal.toFixed(2).replace(".", ",")}</span>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" disabled={isDeleting === record.id}>{isDeleting === record.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}</Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir este lançamento?
                                {record.payLater && " O valor será abatido da fatura correspondente."}
                                Essa ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteRecord(record)}>Confirmar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </li>
                  ))}
                  {savedRecords.length === 0 && (<p className="text-sm text-center text-muted-foreground py-4">Nenhum consumo salvo para este dia.</p>)}
                </ul>)}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Consumption;
