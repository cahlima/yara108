import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

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
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

const Consumption = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [consumptionDate, setConsumptionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [items, setItems] = useState<ConsumptionItem[]>([]);
  const [currentItem, setCurrentItem] = useState({
    product_id: "",
    quantity: "1",
  });

  useEffect(() => {
    fetchData();
  }, []);

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

  const addItem = () => {
    if (!currentItem.product_id || !currentItem.quantity) {
      toast.error("Selecione um produto e quantidade");
      return;
    }

    const product = products.find((p) => p.id === currentItem.product_id);
    if (!product) return;

    const quantity = parseInt(currentItem.quantity);
    const subtotal = product.price * quantity;

    const newItem: ConsumptionItem = {
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price: product.price,
      subtotal,
    };

    setItems([...items, newItem]);
    setCurrentItem({ product_id: "", quantity: "1" });
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.subtotal, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer) {
      toast.error("Selecione um cliente");
      return;
    }

    if (items.length === 0) {
      toast.error("Adicione pelo menos um item");
      return;
    }

    try {
      const { error } = await supabase.from("consumption_records").insert({
        customer_id: selectedCustomer,
        consumption_date: consumptionDate,
        items: items as any,
        total: calculateTotal(),
        paid: false,
      });

      if (error) throw error;

      toast.success("Consumo registrado com sucesso!");
      setSelectedCustomer("");
      setItems([]);
      setConsumptionDate(new Date().toISOString().split("T")[0]);
    } catch (error) {
      console.error("Erro ao registrar consumo:", error);
      toast.error("Erro ao registrar consumo");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Lançamento de Consumo</h2>
        <p className="text-muted-foreground">Registre o consumo diário dos clientes</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Informações do Consumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={consumptionDate}
                  onChange={(e) => setConsumptionDate(e.target.value)}
                />
              </div>
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adicionar Itens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="product">Produto</Label>
                <Select
                  value={currentItem.product_id}
                  onValueChange={(value) =>
                    setCurrentItem({ ...currentItem, product_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - R$ {product.price.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantidade</Label>
                <div className="flex gap-2">
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={currentItem.quantity}
                    onChange={(e) =>
                      setCurrentItem({ ...currentItem, quantity: e.target.value })
                    }
                  />
                  <Button type="button" onClick={addItem} className="shrink-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {items.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <h4 className="font-semibold text-foreground mb-2">Itens Adicionados</h4>
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center p-3 bg-muted rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{item.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.quantity}x R$ {item.unit_price.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-primary">
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
                <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg border-2 border-primary">
                  <p className="text-lg font-bold text-foreground">Total</p>
                  <p className="text-2xl font-bold text-primary">
                    R$ {calculateTotal().toFixed(2)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          type="submit"
          className="w-full bg-primary hover:bg-primary/90"
          disabled={items.length === 0}
        >
          Registrar Consumo
        </Button>
      </form>
    </div>
  );
};

export default Consumption;
