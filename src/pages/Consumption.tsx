
import { useEffect, useState, useCallback, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  addDoc,
  deleteDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Save, Plus, ShoppingBag, Loader2 } from "lucide-react";

// Interfaces (mantidas como estão)
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
  date: string;
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

// 1) VALOR SENTINELA CONSTANTE
const NONE = "__none__";

const Consumption = () => {
  const { user, loading: authLoading } = useAuth();

  const [pageLoading, setPageLoading] = useState(true);
  const [isDayProductsLoading, setIsDayProductsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [consumptionDate, setConsumptionDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [items, setItems] = useState<ConsumptionItem[]>([]);
  const [dayProducts, setDayProducts] = useState<DayProduct[]>([]);

  // 1) ESTADOS INICIALIZADOS COM O VALOR SENTINELA
  const [selectedDayProduct, setSelectedDayProduct] = useState<string>(NONE);
  const [selectedCustomer, setSelectedCustomer] = useState<string>(NONE);
  const [selectedProduct, setSelectedProduct] = useState<string>(NONE);

  const [dayProductPrice, setDayProductPrice] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");

  // Funções de busca de dados (mantidas)
  const fetchInitialData = useCallback(async () => { /* ... */ }, [user]);
  const fetchDayProducts = useCallback(async (date: string) => { /* ... */ }, [user]);

  useEffect(() => {
    // ... lógica de busca de dados ...
  }, [authLoading, fetchInitialData]);

  useEffect(() => {
    // ... lógica de busca de dados ...
  }, [consumptionDate, pageLoading, user, fetchDayProducts]);
  
  useEffect(() => {
    if (selectedDayProduct && selectedDayProduct !== NONE) {
      const product = products.find((p) => p.id === selectedDayProduct);
      if (product) {
        setDayProductPrice(String(product.price).replace('.', ','));
      }
    } else {
      setDayProductPrice("");
    }
  }, [selectedDayProduct, products]);

  // 4) DEDUPLICAÇÃO DA LISTA DE PRODUTOS DO DIA
  const uniqueDayProducts = useMemo(() => {
    const productMap = new Map<string, DayProduct>();
    dayProducts.forEach(dp => {
      if (!productMap.has(dp.product_id)) {
        productMap.set(dp.product_id, dp);
      }
    });
    return Array.from(productMap.values());
  }, [dayProducts]);
  
  const addDayProduct = async () => {
    // 5) VALIDAÇÃO CONTRA O VALOR SENTINELA
    if (selectedDayProduct === NONE || !dayProductPrice) {
      toast.error("Selecione um produto e defina um preço válido.");
      return;
    }
    // ... resto da lógica ...
  };
  
  const addItem = () => {
    // 5) VALIDAÇÃO CONTRA O VALOR SENTINELA
    if (selectedCustomer === NONE || selectedProduct === NONE || !quantity) {
      toast.error("Preencha cliente, produto e quantidade.");
      return;
    }
    // ... resto da lógica ...
  };

  const removeDayProduct = async (id: string) => { /* ... */ };
  const saveAll = async () => { /* ... */ };

  if (authLoading || pageLoading) {
    return <div className="fixed inset-0 flex items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Lançamento Rápido</h2>
      
      <Card>
        <CardHeader><CardTitle>Produtos do Dia</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Select value={selectedDayProduct} onValueChange={setSelectedDayProduct} disabled={isSubmitting}>
              <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
              <SelectContent>
                {/* 2) ITEM SENTINELA ADICIONADO */}
                <SelectItem value={NONE}>Selecione...</SelectItem>
                {products.map((p) => (
                  // 3) VALOR GARANTIDO COMO STRING
                  <SelectItem key={p.id} value={String(p.id)}>
                    {String(p.name ?? "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Preço do dia" value={dayProductPrice} onChange={e => setDayProductPrice(e.target.value)} disabled={isSubmitting} />
            <Button onClick={addDayProduct} disabled={isSubmitting || selectedDayProduct === NONE || !dayProductPrice}>
              <Plus className="h-4 w-4 mr-2" />Adicionar
            </Button>
          </div>
          {/* ... resto do JSX ... */}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader><CardTitle>Adicionar Consumo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select value={selectedCustomer} onValueChange={setSelectedCustomer} disabled={isDayProductsLoading}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {/* 2) ITEM SENTINELA ADICIONADO */}
                <SelectItem value={NONE}>Selecione um cliente...</SelectItem>
                {customers.map((c) => (
                  // 3) VALOR GARANTIDO COMO STRING
                  <SelectItem key={c.id} value={String(c.id)}>
                    {String(c.name ?? "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
            <Select value={selectedProduct} onValueChange={setSelectedProduct} disabled={uniqueDayProducts.length === 0 || isDayProductsLoading}>
              <SelectTrigger><SelectValue placeholder={isDayProductsLoading ? "Carregando..." : "Selecione o produto"} /></SelectTrigger>
              <SelectContent>
                {/* 2) ITEM SENTINELA ADICIONADO */}
                <SelectItem value={NONE}>Selecione um produto...</SelectItem>
                {uniqueDayProducts.map((dp) => (
                  // 3) VALOR GARANTIDO COMO STRING
                  <SelectItem key={dp.product_id} value={String(dp.product_id)}>
                    {`${String(dp.product_name ?? "Produto inválido")} - R$ ${Number(dp.custom_price || 0).toFixed(2)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={addItem} className="w-full" disabled={selectedCustomer === NONE || selectedProduct === NONE || !quantity || dayProducts.length === 0}>
            <Plus className="w-4 h-4 mr-2" />Adicionar Item
          </Button>
        </CardContent>
      </Card>

      {/* ... restante do componente ... */}
    </div>
  );
};

export default Consumption;
