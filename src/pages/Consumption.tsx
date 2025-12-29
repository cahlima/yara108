import { useEffect, useState, useCallback } from "react";
import { db, auth } from "@/lib/firebase"; // Correct import
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  addDoc, 
  deleteDoc, 
  Timestamp, 
  writeBatch 
} from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Save, Plus, ShoppingBag, Loader2 } from "lucide-react";
import { z } from "zod";

const consumptionSchema = z.object({
  quantity: z.string().refine((val) => {
    const num = parseInt(val);
    return !isNaN(num) && num > 0 && num <= 1000;
  }, "Quantidade deve ser um número entre 1 e 1000"),
  price: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0 && num <= 999999;
  }, "Preço deve ser um valor válido entre 0.01 e 999999"),
});

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

interface DayProductEntry {
  id: string;
  product_id: string;
  custom_price: number;
  date: string; // Storing date as YYYY-MM-DD string
  user_id: string;
}

interface DayProduct extends DayProductEntry {
  product_name: string;
  product_default_price: number;
}

interface ConsumptionItem {
  id: string;
  customer_id: string;
  customer_name: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

const Consumption = () => {
  const [user, loadingUser] = useAuthState(auth);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [consumptionDate, setConsumptionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [items, setItems] = useState<ConsumptionItem[]>([]);
  
  const [dayProducts, setDayProducts] = useState<DayProduct[]>([]);
  const [selectedDayProduct, setSelectedDayProduct] = useState<string>("");
  const [dayProductPrice, setDayProductPrice] = useState("");
  const [isDayProductsLoading, setIsDayProductsLoading] = useState(true);
  const [isSubmittingDayProduct, setIsSubmittingDayProduct] = useState(false);
  
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [selectedProduct, setSelectedProduct] = useState("");

  const fetchDayProducts = useCallback(async (date: string, currentUser: any) => {
    if (!currentUser) return;
    setIsDayProductsLoading(true);
    setDayProducts([]);
    try {
      const dayProductsQuery = query(
        collection(db, "day_products"),
        where("date", "==", date),
        where("user_id", "==", currentUser.uid)
      );

      const querySnapshot = await getDocs(dayProductsQuery);
      if (querySnapshot.empty) return; // No products for this day

      const dayProductsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DayProductEntry));
      
      const productIds = dayProductsData.map((dp) => dp.product_id);
      if (productIds.length === 0) return;
      
      const productsQuery = query(collection(db, "products"), where("__name__", "in", productIds));
      const productsSnapshot = await getDocs(productsQuery);
      const productsData = productsSnapshot.docs.reduce((acc, doc) => {
        acc[doc.id] = { id: doc.id, ...doc.data() } as Product;
        return acc;
      }, {} as Record<string, Product>);

      const combinedDayProducts = dayProductsData.map(dp => {
        const productDetails = productsData[dp.product_id];
        return {
          ...dp,
          product_name: productDetails?.name || "Produto não encontrado",
          product_default_price: productDetails?.price || 0
        }
      });

      setDayProducts(combinedDayProducts);

    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro detalhado em fetchDayProducts: ", error);
      toast.error("Erro ao buscar produtos do dia.");
    } finally {
      setIsDayProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const productsQuery = query(collection(db, "products"), where("active", "==", true));
        const customersQuery = collection(db, "customers");

        const [productsSnapshot, customersSnapshot] = await Promise.all([
          getDocs(productsQuery),
          getDocs(customersQuery),
        ]);

        const productsData = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
        const customersData = customersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
        
        setProducts(productsData.sort((a,b) => a.name.localeCompare(b.name)));
        setCustomers(customersData.sort((a,b) => a.name.localeCompare(b.name)));

      } catch (error) {
        if (import.meta.env.DEV) console.error("Erro ao carregar dados iniciais: ", error);
        toast.error("Erro ao carregar produtos e clientes");
      }
    };
    
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (user) {
      fetchDayProducts(consumptionDate, user);
    }
  }, [consumptionDate, user, fetchDayProducts]);
  
  useEffect(() => {
    if (selectedDayProduct) {
      const product = products.find((p) => p.id === selectedDayProduct);
      if (product) {
        setDayProductPrice(product.price.toString());
      }
    } else {
      setDayProductPrice("");
    }
  }, [selectedDayProduct, products]);

  const addDayProduct = async () => {
    if (isSubmittingDayProduct || !user) return;
    if (!selectedDayProduct || !dayProductPrice) {
      toast.error("Selecione um produto e defina o preço");
      return;
    }

    try {
      consumptionSchema.shape.price.parse(dayProductPrice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    if (dayProducts.some((dp) => dp.product_id === selectedDayProduct)) {
      toast.error("Produto já está na lista do dia");
      return;
    }
    
    setIsSubmittingDayProduct(true);
    try {
        await addDoc(collection(db, "day_products"), {
          product_id: selectedDayProduct,
          custom_price: parseFloat(dayProductPrice),
          date: consumptionDate,
          user_id: user.uid,
          created_at: Timestamp.now()
        });
        
        await fetchDayProducts(consumptionDate, user);
        setSelectedDayProduct("");
        toast.success("Produto do dia adicionado!");

    } catch(error) {
        if (import.meta.env.DEV) console.error("Erro ao adicionar produto do dia: ", error);
        toast.error("Erro ao adicionar produto do dia");
    } finally {
      setIsSubmittingDayProduct(false);
    }
  };

  const removeDayProduct = async (dayProductId: string) => {
    if (isSubmittingDayProduct || !user) return;
    setIsSubmittingDayProduct(true);
    try {
        await deleteDoc(doc(db, "day_products", dayProductId));
        await fetchDayProducts(consumptionDate, user);
        toast.success("Produto removido da lista do dia");
    } catch(error) {
        if (import.meta.env.DEV) console.error("Erro ao remover produto do dia: ", error);
        toast.error("Erro ao remover produto do dia");
    } finally {
      setIsSubmittingDayProduct(false);
    }
  };

  const addItem = () => {
    if (!selectedCustomer || !quantity || !selectedProduct) {
      toast.error("Preencha cliente, produto e quantidade");
      return;
    }

    try {
      consumptionSchema.shape.quantity.parse(quantity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const customer = customers.find((c) => c.id === selectedCustomer);
    const dayProduct = dayProducts.find((dp) => dp.product_id === selectedProduct);
    
    if (!customer || !dayProduct) {
      toast.error("Erro interno: Dados de cliente ou produto do dia não encontrados.");
      if (import.meta.env.DEV) console.error("Error finding data for item", { customer, dayProduct });
      return;
    }
    
    const qty = parseInt(quantity);
    const price = dayProduct.custom_price;
    const subtotal = Number(price) * qty;

    const newItem: ConsumptionItem = {
      id: `${Date.now()}-${Math.random()}`,
      customer_id: customer.id,
      customer_name: customer.name,
      product_id: dayProduct.product_id,
      product_name: dayProduct.product_name,
      quantity: qty,
      unit_price: Number(price),
      subtotal,
    };

    setItems(prevItems => [...prevItems, newItem]);
    setQuantity("1");
    toast.success("Item adicionado!");
  };

  const removeItem = (itemId: string) => {
    setItems(prevItems => prevItems.filter((item) => item.id !== itemId));
    toast.success("Item removido");
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.subtotal, 0);
  };

  const saveAll = async () => {
    if (items.length === 0) {
      toast.error("Adicione pelo menos um item antes de salvar");
      return;
    }
    if (!user) {
        toast.error("Usuário não autenticado");
        return;
    }

    try {
      const batch = writeBatch(db);
      const recordsRef = collection(db, "consumption_records");
      
      const itemsByCustomer = items.reduce((acc, item) => {
        if (!acc[item.customer_id]) {
          acc[item.customer_id] = [];
        }
        acc[item.customer_id].push(item);
        return acc;
      }, {} as Record<string, ConsumptionItem[]>);

      Object.entries(itemsByCustomer).forEach(([customerId, customerItems]) => {
        const total = customerItems.reduce((sum, item) => sum + item.subtotal, 0);
        const newRecordRef = doc(recordsRef);
        batch.set(newRecordRef, {
          customer_id: customerId,
          consumption_date: Timestamp.fromDate(new Date(consumptionDate + "T12:00:00")),
          items: customerItems.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal
          })),
          total,
          paid: false,
          user_id: user.uid,
          created_at: Timestamp.now()
        });
      });

      await batch.commit();

      toast.success(`${Object.keys(itemsByCustomer).length} consumo(s) registrado(s) com sucesso!`);
      setItems([]);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao registrar consumos: ", error);
      toast.error("Erro ao registrar consumos");
    }
  };

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold">Acesso Negado</h2>
        <p className="text-muted-foreground mt-2">Você precisa estar autenticado para acessar esta página.</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Lançamento Rápido</h2>
        <p className="text-muted-foreground">Registre o consumo do dia de forma ágil</p>
      </div>

      <Card className="border-primary/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label htmlFor="date" className="text-lg font-semibold">Data do Consumo:</Label>
            <Input
              id="date"
              type="date"
              value={consumptionDate}
              onChange={(e) => setConsumptionDate(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Produtos do Dia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="day-product">Produto</Label>
              <Select 
                value={selectedDayProduct} 
                onValueChange={setSelectedDayProduct}
                disabled={isSubmittingDayProduct}
              >
                <SelectTrigger id="day-product">
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="day-price">Preço do Dia</Label>
              <Input
                id="day-price"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={dayProductPrice}
                onChange={(e) => setDayProductPrice(e.target.value)}
                disabled={isSubmittingDayProduct}
              />
            </div>

            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button onClick={addDayProduct} className="w-full" disabled={isSubmittingDayProduct || !selectedDayProduct}>
                {isSubmittingDayProduct ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Adicionar
              </Button>
            </div>
          </div>

          {isDayProductsLoading ? (
            <div className="text-center p-4 text-muted-foreground">
              <Loader2 className="h-6 w-6 mx-auto animate-spin" />
              <p>Carregando produtos...</p>
            </div>
          ) : dayProducts.length > 0 ? (
            <div className="space-y-2">
              <Label>Lista de Produtos do Dia:</Label>
              <div className="space-y-2">
                {dayProducts.map((dp) => (
                  <div key={dp.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium">{dp.product_name}</span>
                      <span className="text-muted-foreground ml-2">
                        R$ {Number(dp.custom_price).toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        (Padrão: R$ {Number(dp.product_default_price).toFixed(2)})
                      </span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => removeDayProduct(dp.id)}
                      disabled={isSubmittingDayProduct}
                    >
                      {isSubmittingDayProduct ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center p-4 text-muted-foreground border-dashed border rounded-lg">
                <p>Nenhum produto do dia definido para esta data.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adicionar Consumo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Cliente</Label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantidade</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="product">Produto</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct} disabled={dayProducts.length === 0 || isDayProductsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={isDayProductsLoading ? "Carregando..." : dayProducts.length === 0 ? "Adicione produtos do dia" : "Selecione o produto"} />
                </SelectTrigger>
                <SelectContent>
                  {dayProducts.map((dp) => (
                    <SelectItem key={dp.product_id} value={dp.product_id}>
                      {dp.product_name} - R$ {Number(dp.custom_price).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            type="button" 
            onClick={addItem} 
            className="w-full bg-primary hover:bg-primary/90"
            disabled={dayProducts.length === 0 || isDayProductsLoading}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Item
          </Button>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card className="border-success/50">
          <CardHeader>
            <CardTitle>Itens do Dia ({items.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{item.customer_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.quantity}x {item.product_name} @ R$ {item.unit_price.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xl font-bold text-primary">
                      R$ {item.subtotal.toFixed(2)}
                    </p>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t">
              <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg border-2 border-primary">
                <p className="text-xl font-bold text-foreground">Total Geral</p>
                <p className="text-3xl font-bold text-primary">
                  R$ {calculateTotal().toFixed(2)}
                </p>
              </div>
            </div>

            <Button
              onClick={saveAll}
              className="w-full bg-success hover:bg-success/90 text-success-foreground"
              size="lg"
            >
              <Save className="w-5 h-5 mr-2" />
              Salvar Todos os Lançamentos
            </Button>
          </CardContent>
        </Card>
      )}

      {items.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingBag className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum item adicionado ainda</p>
              <p className="text-sm">Selecione um cliente e adicione itens acima</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Consumption;
