import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Edit } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";

const productSchema = z.object({
  name: z.string().trim().min(1, "Nome do produto é obrigatório").max(100, "Nome deve ter no máximo 100 caracteres"),
  price: z.preprocess(
    (val) => String(val).replace(",", "."), // Allow comma as decimal separator
    z.string().refine((val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0 && num <= 999999;
    }, "Preço deve ser um valor válido maior que zero")
  ),
});

interface Product {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ name: "", price: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const { isAdmin, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      fetchProducts();
    }
  }, [authLoading]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const productsRef = collection(db, "products");
      const q = query(productsRef, where("active", "==", true), orderBy("name"));
      const querySnapshot = await getDocs(q);
      const productsList = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Product)
      );
      setProducts(productsList);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao carregar produtos:", error);
      toast.error("Erro ao carregar produtos");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const validatedData = productSchema.parse(formData);
      const priceAsNumber = parseFloat(validatedData.price);

      if (editingId) {
        const productRef = doc(db, "products", editingId);
        await updateDoc(productRef, {
          name: validatedData.name,
          price: priceAsNumber,
        });
        toast.success("Produto atualizado com sucesso!");
      } else {
        await addDoc(collection(db, "products"), {
          name: validatedData.name,
          price: priceAsNumber,
          active: true,
          created_at: new Date().toISOString(),
        });
        toast.success("Produto cadastrado com sucesso!");
      }

      setFormData({ name: "", price: "" });
      setEditingId(null);
      fetchProducts();
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach((err) => toast.error(err.message));
      } else {
        if (import.meta.env.DEV) console.error("Erro ao salvar produto:", error);
        toast.error("Erro ao salvar produto");
      }
    }
  };

  const handleEdit = (product: Product) => {
    setFormData({ name: product.name, price: product.price.toString().replace(".", ",") });
    setEditingId(product.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente desativar este produto?")) return;

    try {
      const productRef = doc(db, "products", id);
      await updateDoc(productRef, { active: false });
      toast.success("Produto desativado com sucesso!");
      fetchProducts();
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao desativar produto:", error);
      toast.error("Erro ao desativar produto");
    }
  };

  if (loading || authLoading) {
    return <div className="text-center py-8">Carregando...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Produtos</h2>
        <p className="text-muted-foreground">Gerencie os produtos disponíveis para consumo.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Editar Produto" : "Cadastrar Novo Produto"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Produto</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Água Mineral 500ml"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Preço (R$)</Label>
                <Input
                  id="price"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="Ex: 2,50"
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                {editingId ? "Atualizar Produto" : "Salvar Produto"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setFormData({ name: "", price: "" });
                  }}
                >
                  Cancelar Edição
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {products.map((product) => (
          <Card key={product.id}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate" title={product.name}>{product.name}</h3>
                  <p className="text-muted-foreground">
                    {product.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0 ml-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleEdit(product)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDelete(product.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Products;