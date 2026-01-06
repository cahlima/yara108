
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, updateDoc, query, FirestoreError, where, deleteDoc } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { PlusCircle, Loader2, Edit, CheckSquare, XSquare, Trash2 } from "lucide-react";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(50, "Nome deve ter no máximo 50 caracteres"),
  price: z.string().refine(val => {
    const formattedVal = val.replace(",", ".");
    return !isNaN(parseFloat(formattedVal)) && parseFloat(formattedVal) > 0;
  }, "Preço deve ser um número positivo válido"),
});

interface Product {
  id: string;
  name: string;
  price: number;
  active: boolean;
  ownerId?: string;
}

const Products = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ name: '', price: '', active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchProducts = useCallback(async () => {
    if (!user) {
        setLoading(false);
        return;
    }
    setLoading(true);
    try {
      const base = collection(db, "products");
      const q = isAdmin ? base : query(base, where("ownerId", "==", user.uid));

      const querySnapshot = await getDocs(q);
      const productsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(productsData.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      const err = error as FirestoreError;
      console.error("Erro ao carregar produtos:", err);
      toast.error(`Erro ao carregar produtos: ${err.message}`);
      setProducts([]); 
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      fetchProducts();
    } else {
      setLoading(false);
      setProducts([]);
    }
  }, [authLoading, user, fetchProducts]);


  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setEditingProduct(null);
      setFormData({ name: '', price: '', active: true });
      setErrors({});
    }
    setIsDialogOpen(open);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({ name: product.name, price: product.price.toString().replace('.', ','), active: product.active });
    setIsDialogOpen(true);
  };

  const handleWriteOperationError = (error: unknown, action: 'salvar' | 'deletar' | 'atualizar') => {
    const err = error as FirestoreError;
    console.error(`Erro ao ${action} produto:`, err);
    if (err.code === 'permission-denied') {
      toast.error("Acesso negado. Apenas administradores podem executar esta ação.");
    } else {
      toast.error(`Erro ao ${action} produto: ${err.message}`);
    }
  };

  const handleToggleActive = async (product: Product) => {
    if (!isAdmin) {
      toast.error("Acesso negado. Apenas administradores podem executar esta ação.");
      return;
    }
    try {
      const productRef = doc(db, "products", product.id);
      await updateDoc(productRef, { active: !product.active });
      toast.success(`Produto ${product.name} ${!product.active ? 'ativado' : 'desativado'}`);
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, active: !p.active } : p));
    } catch (error) {
      handleWriteOperationError(error, 'atualizar');
    }
  };

  const handleDelete = (product: Product) => {
    if (!isAdmin) {
        toast.error("Acesso negado. Apenas administradores podem executar esta ação.");
        return;
    }
    setProductToDelete(product);
  }

  const confirmDelete = async () => {
    if (!productToDelete || !user || !isAdmin) return;

    setIsDeleting(true);
    try {
        const productRef = doc(db, "products", productToDelete.id);
        await deleteDoc(productRef);
        toast.success("Produto excluído com sucesso!");
        setProducts(prev => prev.filter(p => p.id !== productToDelete.id));
    } catch (error) {
        handleWriteOperationError(error, 'deletar');
    } finally {
        setIsDeleting(false);
        setProductToDelete(null);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) {
      toast.error("Acesso negado. Apenas administradores podem executar esta ação.");
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const validation = productSchema.safeParse(formData);
    if (!validation.success) {
      const newErrors: Record<string, string> = {};
      validation.error.errors.forEach(err => { newErrors[err.path[0]] = err.message; });
      setErrors(newErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      const priceNumber = parseFloat(validation.data.price.replace(',', '.'));

      if (editingProduct) {
        await updateDoc(doc(db, "products", editingProduct.id), {
          name: validation.data.name,
          price: priceNumber,
          active: formData.active,
        });
        toast.success("Produto atualizado com sucesso!");
      } else {
        await addDoc(collection(db, "products"), {
          name: validation.data.name,
          price: priceNumber,
          active: formData.active,
          ownerId: user.uid,
        });
        toast.success("Produto adicionado com sucesso!");
      }
      
      fetchProducts(); // Refreshes the whole list
      handleDialogChange(false);

    } catch (error) {
      handleWriteOperationError(error, 'salvar');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) { 
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  return (
    <AlertDialog open={!!productToDelete} onOpenChange={() => setProductToDelete(null)}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Gerenciar Produtos</h2>
            <p className="text-muted-foreground">Adicione, edite e organize seus produtos.</p>
          </div>
          {isAdmin && (
            <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
              <DialogTrigger asChild><Button><PlusCircle className="w-4 h-4 mr-2" />Novo Produto</Button></DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>{editingProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle>
                  <DialogDescription>{editingProduct ? "Edite as informações do produto." : "Preencha as informações do novo produto."}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome</Label>
                      <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                      {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="price">Preço (R$)</Label>
                      <Input id="price" type="text" inputMode="decimal" placeholder="Ex: 7,50" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} />
                      {errors.price && <p className="text-xs text-destructive">{errors.price}</p>}
                    </div>
                     <div className="flex items-center space-x-2">
                        <Switch id="active-status" checked={formData.active} onCheckedChange={(checked) => setFormData({ ...formData, active: checked })} />
                        <Label htmlFor="active-status">Ativo</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="border rounded-lg w-full">
          <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b"><tr className="border-b"><th className="h-12 px-4 text-left">Nome</th><th className="h-12 px-4 text-left">Preço</th><th className="h-12 px-4 text-left">Status</th>{isAdmin && <th className="h-12 px-4 text-right">Ações</th>}</tr></thead>
                  <tbody>
                      {products.length === 0 ? (
                          <tr><td colSpan={isAdmin ? 4 : 3} className="p-4 text-center text-muted-foreground">Nenhum produto cadastrado.</td></tr>
                      ) : products.map(product => (
                          <tr key={product.id} className="border-b">
                              <td className="p-4 font-medium">{product.name}</td>
                              <td className="p-4">R$ {product.price.toFixed(2).replace('.', ',')}</td>
                              <td className="p-4"><span className={`px-2 py-1 text-xs rounded-full ${product.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{product.active ? 'Ativo' : 'Inativo'}</span></td>
                              {isAdmin && (
                                <td className="p-4 text-right space-x-2">
                                    <Button variant="outline" size="icon" onClick={() => handleToggleActive(product)} title={product.active ? 'Desativar' : 'Ativar'}>{product.active ? <XSquare className="h-4 w-4"/> : <CheckSquare className="h-4 w-4"/>}</Button>
                                    <Button variant="outline" size="icon" onClick={() => handleEdit(product)}><Edit className="h-4 w-4" /></Button>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="destructive" size="icon" onClick={() => handleDelete(product)}><Trash2 className="h-4 w-4" /></Button>
                                    </AlertDialogTrigger>
                                </td>
                              )}
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
        </div>
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o produto "{productToDelete?.name}"? Essa ação não pode ser desfeita e removerá o produto de todas as listas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">{isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default Products;
