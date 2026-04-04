import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, getDocs, doc, updateDoc, query,
  where, serverTimestamp, writeBatch, FirestoreError,
} from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PlusCircle, Loader2, Edit, Trash2, Search, Phone, User } from "lucide-react";
import { z } from "zod";

const customerSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(100, "Nome excede 100 caracteres"),
  phone: z.string().optional().or(z.literal('')).refine(val => !val || /^\d{10,11}$/.test(val.replace(/\D/g, '')), "Telefone inválido. Use 10 ou 11 dígitos."),
  email: z.string().optional().or(z.literal('')).refine(val => !val || z.string().email().safeParse(val).success, "Email inválido"),
});

interface Customer { id: string; name: string; phone?: string; email?: string; }

const getInitials = (name: string) => {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const avatarColors = [
  'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
  'bg-lime-500', 'bg-green-500', 'bg-teal-500', 'bg-cyan-500',
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500',
  'bg-pink-500', 'bg-rose-500',
];

const getAvatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
};

const Customers = () => {
  const { user, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchCustomers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, "customers"), where("ownerId", "==", user.uid));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
      setCustomers(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      const err = error as FirestoreError;
      toast.error(`Erro ao carregar clientes: ${err.code}`);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) fetchCustomers();
  }, [authLoading, fetchCustomers]);

  const handleDialogChange = (open: boolean) => {
    if (!open) { setEditingCustomer(null); setFormData({ name: '', phone: '', email: '' }); setErrors({}); }
    setIsDialogOpen(open);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({ name: customer.name, phone: customer.phone || '', email: customer.email || '' });
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!confirmDelete || !user) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      const consumptionQuery = query(collection(db, "consumption_records"), where("customer_id", "==", confirmDelete.id), where("ownerId", "==", user.uid));
      const consumptionSnapshot = await getDocs(consumptionQuery);
      consumptionSnapshot.forEach(d => batch.delete(d.ref));
      const invoicesQuery = query(collection(db, "invoices"), where("customerId", "==", confirmDelete.id), where("ownerId", "==", user.uid));
      const invoicesSnapshot = await getDocs(invoicesQuery);
      invoicesSnapshot.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, "customers", confirmDelete.id));
      await batch.commit();
      toast.success(`Cliente "${confirmDelete.name}" excluído com sucesso.`);
      setCustomers(prev => prev.filter(c => c.id !== confirmDelete.id));
    } catch {
      toast.error("Falha ao excluir o cliente.");
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    setErrors({});
    const validation = customerSchema.safeParse(formData);
    if (!validation.success) {
      const newErrors: Record<string, string> = {};
      validation.error.errors.forEach(err => { newErrors[err.path[0]] = err.message; });
      setErrors(newErrors);
      setIsSubmitting(false);
      return;
    }
    try {
      const dataToSave = { ...validation.data, phone: validation.data.phone?.replace(/\D/g, '') || null };
      if (editingCustomer) {
        await updateDoc(doc(db, "customers", editingCustomer.id), { ...dataToSave, updatedAt: serverTimestamp() });
        toast.success("Cliente atualizado!");
      } else {
        await addDoc(collection(db, "customers"), { ...dataToSave, ownerId: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        toast.success("Cliente adicionado!");
      }
      fetchCustomers();
      handleDialogChange(false);
    } catch (error) {
      const err = error as FirestoreError;
      toast.error(`Erro ao salvar cliente: ${err.code}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone && c.phone.includes(search))
  );

  if (loading || authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Clientes</h2>
          <p className="text-muted-foreground text-sm">{customers.length} clientes cadastrados</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button><PlusCircle className="w-4 h-4 mr-2" />Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>{editingCustomer ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
              <DialogDescription>{editingCustomer ? "Edite as informações do cliente." : "Preencha as informações do novo cliente."}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={errors.name ? "border-destructive" : ""} />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone (WhatsApp)</Label>
                  <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="(XX) XXXXX-XXXX" className={errors.phone ? "border-destructive" : ""} />
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (opcional)</Label>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="exemplo@email.com" className={errors.email ? "border-destructive" : ""} />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>{search ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado."}</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border overflow-hidden">
          {filtered.map(customer => (
            <div key={customer.id} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/40 transition-colors">
              {/* Avatar */}
              <div className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${getAvatarColor(customer.name)}`}>
                {getInitials(customer.name)}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{customer.name}</p>
                {customer.phone ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />{customer.phone}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Sem telefone</p>
                )}
              </div>
              {/* Ações */}
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(customer)}><Edit className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(customer)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmação de exclusão */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>"{confirmDelete?.name}"</strong>?<br /><br />
              <span className="text-destructive font-medium">Atenção:</span> Todos os consumos e faturas deste cliente também serão excluídos permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
