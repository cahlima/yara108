import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Save, Plus, ShoppingBag } from "lucide-react";
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

interface DayProduct {
  product: Product;
  customPrice: number;
}

const Consumption = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [consumptionDate, setConsumptionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [items, setItems] = useState<ConsumptionItem[]>([]);
  
  // Produtos do dia
  const [dayProducts, setDayProducts] = useState<DayProduct[]>([]);
  const [selectedDayProduct, setSelectedDayProduct] = useState<string>("");
  const [dayProductPrice, setDayProductPrice] = useState("");
  
  // Entrada rápida
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [selectedProduct, setSelectedProduct] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedDayProduct) {
      const product = products.find((p) => p.id === selectedDayProduct);
      if (product) {
        setDayProductPrice(product.price.toString());
      }
    }
  }, [selectedDayProduct, products]);

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
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    }
  };

  const addDayProduct = () => {
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

    const product = products.find((p) => p.id === selectedDayProduct);
    if (!product) return;

    const alreadyExists = dayProducts.find((dp) => dp.product.id === product.id);
    if (alreadyExists) {
      toast.error("Produto já está na lista do dia");
      return;
    }

    const newDayProduct: DayProduct = {
      product,
      customPrice: parseFloat(dayProductPrice),
    };

    setDayProducts([...dayProducts, newDayProduct]);
    setSelectedDayProduct("");
    setDayProductPrice("");
    toast.success("Produto do dia adicionado!");
  };

  const removeDayProduct = (productId: string) => {
    setDayProducts(dayProducts.filter((dp) => dp.product.id !== productId));
    toast.success("Produto removido da lista do dia");
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
    
    // Buscar o preço do produto do dia se estiver na lista
    const dayProduct = dayProducts.find((dp) => dp.product.id === selectedProduct);
    const product = products.find((p) => p.id === selectedProduct);
    
    if (!customer || !product) return;

    const qty = parseInt(quantity);
    const price = dayProduct ? dayProduct.customPrice : product.price;
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
    // Cliente permanece selecionado
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

      {/* Produtos do Dia */}
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
              />
            </div>

            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button onClick={addDayProduct} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </Button>
            </div>
          </div>

          {dayProducts.length > 0 && (
            <div className="space-y-2">
              <Label>Lista de Produtos do Dia:</Label>
              <div className="space-y-2">
                {dayProducts.map((dp) => (
                  <div key={dp.product.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium">{dp.product.name}</span>
                      <span className="text-muted-foreground ml-2">
                        R$ {dp.customPrice.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        (Padrão: R$ {dp.product.price.toFixed(2)})
                      </span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => removeDayProduct(dp.product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
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
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {dayProducts.length > 0 ? (
                    <>
                      <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                        Produtos do Dia
                      </div>
                      {dayProducts.map((dp) => (
                        <SelectItem key={dp.product.id} value={dp.product.id}>
                          {dp.product.name} - R$ {dp.customPrice.toFixed(2)}
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground mt-2">
                        Outros Produtos
                      </div>
                      {products
                        .filter((p) => !dayProducts.find((dp) => dp.product.id === p.id))
                        .map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} - R$ {product.price.toFixed(2)}
                          </SelectItem>
                        ))}
                    </>
                  ) : (
                    products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - R$ {product.price.toFixed(2)}
                      </SelectItem>
                    ))
                  )}
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
