import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Save, Plus, ShoppingBag } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
}

interface Customer {
  id: string;
  name: string;
}

interface ConsumptionItem {
  customer_id: string;
  customer_name: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

const Consumption = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [consumptionDate, setConsumptionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [items, setItems] = useState<ConsumptionItem[]>([]);
  
  // Produto do dia
  const [productOfDay, setProductOfDay] = useState<Product | null>(null);
  const [customPrice, setCustomPrice] = useState("");
  
  // Entrada rápida
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [selectedProduct, setSelectedProduct] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (productOfDay) {
      setCustomPrice(productOfDay.price.toString());
      setSelectedProduct(productOfDay.id);
    }
  }, [productOfDay]);

  const fetchData = async () => {
    try {
      const [productsData, customersData] = await Promise.all([
        supabase.from("products").select("*").eq("active", true).order("name"),
        supabase.from("customers").select("*").order("name"),
      ]);

      if (productsData.error) throw productsData.error;
      if (customersData.error) throw customersData.error;

      setProducts(productsData.data || []);
      setCustomers(customersData.data || []);
      
      // Auto-seleciona o primeiro produto como produto do dia
      if (productsData.data && productsData.data.length > 0) {
        setProductOfDay(productsData.data[0]);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    }
  };

  const addItem = () => {
    if (!selectedCustomer || !quantity || !selectedProduct) {
      toast.error("Preencha cliente, produto e quantidade");
      return;
    }

    const customer = customers.find((c) => c.id === selectedCustomer);
    const product = products.find((p) => p.id === selectedProduct);
    
    if (!customer || !product) return;

    const qty = parseInt(quantity);
    const price = parseFloat(customPrice) || product.price;
    const subtotal = price * qty;

    const newItem: ConsumptionItem = {
      customer_id: customer.id,
      customer_name: customer.name,
      product_id: product.id,
      product_name: product.name,
      quantity: qty,
      unit_price: price,
      subtotal,
    };

    setItems([...items, newItem]);
    setSelectedCustomer("");
    setQuantity("1");
    
    toast.success("Item adicionado!");
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
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

    try {
      // Agrupar por cliente
      const itemsByCustomer = items.reduce((acc, item) => {
        if (!acc[item.customer_id]) {
          acc[item.customer_id] = [];
        }
        acc[item.customer_id].push(item);
        return acc;
      }, {} as Record<string, ConsumptionItem[]>);

      // Criar um registro para cada cliente
      const records = Object.entries(itemsByCustomer).map(([customerId, customerItems]) => {
        const total = customerItems.reduce((sum, item) => sum + item.subtotal, 0);
        return {
          customer_id: customerId,
          consumption_date: consumptionDate,
          items: customerItems.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal
          })) as any,
          total,
          paid: false,
        };
      });

      const { error } = await supabase.from("consumption_records").insert(records);

      if (error) throw error;

      toast.success(`${records.length} consumo(s) registrado(s) com sucesso!`);
      setItems([]);
    } catch (error) {
      console.error("Erro ao registrar consumos:", error);
      toast.error("Erro ao registrar consumos");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Lançamento Rápido</h2>
        <p className="text-muted-foreground">Registre o consumo do dia de forma ágil</p>
      </div>

      {/* Data */}
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

      {/* Produto do Dia */}
      <Card className="border-accent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-accent" />
            Produto do Dia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="product-day">Selecione o Produto</Label>
              <Select
                value={productOfDay?.id || ""}
                onValueChange={(value) => {
                  const product = products.find((p) => p.id === value);
                  setProductOfDay(product || null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o produto do dia" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} - R$ {product.price.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-price">Preço do Dia (R$)</Label>
              <Input
                id="custom-price"
                type="number"
                step="0.01"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          {productOfDay && (
            <div className="p-4 bg-accent/10 rounded-lg border border-accent">
              <p className="text-sm text-muted-foreground">Produto selecionado:</p>
              <p className="text-2xl font-bold text-accent">
                {productOfDay.name} - R$ {customPrice || productOfDay.price.toFixed(2)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entrada Rápida */}
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
                <SelectContent className="bg-popover z-50">
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
              <Label htmlFor="product">Produto (opcional)</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Usar produto do dia" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
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
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Item
          </Button>
        </CardContent>
      </Card>

      {/* Lista de Itens */}
      {items.length > 0 && (
        <Card className="border-success/50">
          <CardHeader>
            <CardTitle>Itens do Dia ({items.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {items.map((item, index) => (
                <div
                  key={index}
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
                      onClick={() => removeItem(index)}
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
