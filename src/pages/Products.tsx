import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, updateDoc, query, where, deleteDoc } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { PlusCircle, Loader2, Edit, Trash2, Package } from "lucide-react";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(50, "Nome deve ter no máximo 50 caracteres"),
  price: z.string().refine(val => {
    const v = val.replace(",", ".");
    return !isNaN(parseFloat(v)) && parseFloat(v) > 0;
  }, "Preço deve ser um número positivo válido"),
});

interface Product { id: string; name: string; price: number; active: boolean; ownerId?: string; }

const Products = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ name: '', price: '', active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchProducts = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const q = query(collection(db, "products"), where("ownerId", "==", user.uid));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      setProducts(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      toast.error("Erro ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) fetchProducts();
    else if (!authLoading) setLoading(false);
  }, [authLoading, user, fetchProducts]);

  const handleDialogChange = (open: boolean) => {
    if (!open) { setEditingProduct(null); setFormData({ name: '', price: '', active: true }); setErrors({}); }
    setIsDialogOpen(open);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({ name: product.name, price: product.price.toString().replace('.', ','), active: product.active });
    setIsDialogOpen(true);
  };

  const handleToggleActive = async (product: Product) => {
    if (!isAdmin) { toast.error("Apenas administradores podem executar esta ação."); return; }
    try {
      await updateDoc(doc(db, "products", product.id), { active: !product.active });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, active: !p.active } : p));
      toast.success(`Produto ${!product.active ? 'ativado' : 'desativado'}.`);
    } catch { toast.error("Erro ao atualizar produto."); }
  };

  const handleDelete = async (product: Product) => {
    if (!isAdmin) { toast.error("Apenas administradores podem excluir produtos."); return; }
    setIsDeleting(product.id);
    try {
      await deleteDoc(doc(db, "products", product.id));
      setProducts(prev => prev.filter(p => p.id !== product.id));
      toast.success("Produto excluído com sucesso!");
    } catch { toast.error("Erro ao excluir produto."); }
    finally { setIsDeleting(null); setConfirmDelete(null); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error("Faça login para continuar."); return; }
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
      const price = parseFloat(validation.data.price.replace(',', '.'));
      if (editingProduct) {
        if (!isAdmin) { toast.error("Apenas administradores podem editar produtos."); setIsSubmitting(false); return; }
        await updateDoc(doc(db, "products", editingProduct.id), { name: validation.data.name, price, active: formData.active });
        toast.success("Produto atualizado!");
      } else {
        await addDoc(collection(db, "products"), { name: validation.data.name, price, active: formData.active, ownerId: user.uid });
        toast.success("Produto adicionado!");
      }
      fetchProducts();
      handleDialogChange(false);
    } catch { toast.error("Erro ao salvar produto."); }
    finally { setIsSubmitting(false); }
  };

  const activeProducts = products.filter(p => p.active);
  const inactiveProducts = products.filter(p => !p.active);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gerenciar Produtos</h2>
          <p className="text-muted-foreground text-sm">{activeProducts.length} ativos · {inactiveProducts.length} inativos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button><PlusCircle className="w-4 h-4 mr-2" />Novo Produto</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px]">
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
                  <Switch id="active-status" checked={formData.active} onCheckedChange={(checked) => setFormData({ ...formData, active: checked })} disabled={!isAdmin} />
                  <Label htmlFor="active-status">Ativo</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Produtos Ativos */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Ativos</h3>
        {activeProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum produto ativo.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {activeProducts.map(product => (
              <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-4 w-4 text-green-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">R$ {product.price.toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0 ml-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(product)}><Edit className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(product)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Produtos Inativos */}
      {inactiveProducts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Inativos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {inactiveProducts.map(product => (
              <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 opacity-60 hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate line-through">{product.name}</p>
                    <p className="text-xs text-muted-foreground">R$ {product.price.toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0 ml-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggleActive(product)} title="Reativar"><PlusCircle className="h-3 w-3 text-green-500" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(product)}><Edit className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(product)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialog de confirmação de exclusão */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>"{confirmDelete?.name}"</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmDelete && handleDelete(confirmDelete)} disabled={!!isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
