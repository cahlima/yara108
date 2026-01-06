
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
  FirestoreError,
} from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PlusCircle, Loader2, Edit, Trash2 } from "lucide-react";
import { z } from "zod";

const customerSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(100, "Nome excede 100 caracteres"),
  phone: z.string().optional().or(z.literal('')).refine(val => !val || /^\d{10,11}$/.test(val.replace(/\D/g, '')), "Telefone inválido. Use 10 ou 11 dígitos."),
  email: z.string().optional().or(z.literal('')).refine(val => !val || z.string().email().safeParse(val).success, "Email inválido"),
});

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

const Customers = () => {
  const { user, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchCustomers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const customersCollection = collection(db, "customers");
      const querySnapshot = await getDocs(customersCollection);
      const customersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customersData.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      const err = error as FirestoreError;
      console.error("Firestore Error:", { code: err.code, message: err.message });
      toast.error(`Erro ao carregar clientes: ${err.code}`);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      fetchCustomers();
    }
  }, [authLoading, fetchCustomers]);

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', email: '' });
      setErrors({});
    }
    setIsDialogOpen(open);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({ name: customer.name, phone: customer.phone || '', email: customer.email || '' });
    setIsDialogOpen(true);
  };

  const handleDelete = (customer: Customer) => {
    setCustomerToDelete(customer);
  };

  const confirmDelete = async () => {
    if (!customerToDelete || !user) return;

    setIsDeleting(true);
    try {
        const batch = writeBatch(db);

        // 1. Find and delete consumption records
        const consumptionQuery = query(collection(db, "consumption_records"), where("customer_id", "==", customerToDelete.id), where("ownerId", "==", user.uid));
        const consumptionSnapshot = await getDocs(consumptionQuery);
        consumptionSnapshot.forEach(doc => batch.delete(doc.ref));

        // 2. Find and delete invoices
        const invoicesQuery = query(collection(db, "invoices"), where("customerId", "==", customerToDelete.id), where("ownerId", "==", user.uid));
        const invoicesSnapshot = await getDocs(invoicesQuery);
        invoicesSnapshot.forEach(doc => batch.delete(doc.ref));

        // 3. Delete the customer itself
        const customerRef = doc(db, "customers", customerToDelete.id);
        batch.delete(customerRef);

        await batch.commit();

        toast.success(`Cliente "${customerToDelete.name}" e todos os seus dados foram excluídos.`);
        setCustomers(prev => prev.filter(c => c.id !== customerToDelete.id));
        
    } catch (error) {
        console.error("Erro ao excluir cliente e seus dados:", error);
        toast.error("Falha ao excluir o cliente. Tente novamente.");
    } finally {
        setIsDeleting(false);
        setCustomerToDelete(null);
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
      const dataToSave = { 
        ...validation.data,
        phone: validation.data.phone?.replace(/\D/g, '') || null,
      };

      if (editingCustomer) {
        const customerRef = doc(db, "customers", editingCustomer.id);
        await updateDoc(customerRef, {
          ...dataToSave,
          updatedAt: serverTimestamp()
        });
        toast.success("Cliente atualizado com sucesso!");
      } else {
        await addDoc(collection(db, "customers"), {
          ...dataToSave,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast.success("Cliente adicionado com sucesso!");
      }
      
      fetchCustomers();
      handleDialogChange(false);

    } catch (error) {
      const err = error as FirestoreError;
      console.error("Firestore Error:", { code: err.code, message: err.message });
      toast.error(`Erro ao salvar cliente: ${err.code}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <AlertDialog open={!!customerToDelete} onOpenChange={() => setCustomerToDelete(null)}>
        <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-3xl font-bold text-foreground">Gerenciar Clientes</h2>
                <p className="text-muted-foreground">Adicione, edite e organize os dados dos seus clientes.</p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild><Button><PlusCircle className="w-4 h-4 mr-2" />Novo Cliente</Button></DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                <DialogTitle>{editingCustomer ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
                <DialogDescription>{editingCustomer ? "Edite as informações do cliente." : "Preencha as informações do novo cliente."}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                    <Label htmlFor="name">Nome Completo</Label>
                    <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={errors.name ? "border-destructive" : ""} />
                    {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="phone">Telefone (WhatsApp)</Label>
                    <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="(XX) XXXXX-XXXX" className={errors.phone ? "border-destructive" : ""} />
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
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

        <div className="border rounded-lg w-full">
            <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                        <tr className="border-b transition-colors hover:bg-muted/50">
                            <th className="h-12 px-4 text-left w-[40%]">Nome</th>
                            <th className="h-12 px-4 text-left">Telefone</th>
                            <th className="h-12 px-4 text-left">Email</th>
                            <th className="h-12 px-4 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {customers.map(customer => (
                            <tr key={customer.id} className="border-b transition-colors hover:bg-muted/50">
                                <td className="p-4 font-medium">{customer.name}</td>
                                <td className="p-4">{customer.phone || "N/A"}</td>
                                <td className="p-4">{customer.email || "N/A"}</td>
                                <td className="p-4 text-right space-x-2">
                                    <Button variant="outline" size="icon" onClick={() => handleEdit(customer)}><Edit className="h-4 w-4" /></Button>
                                    <Button variant="destructive" size="icon" onClick={() => handleDelete(customer)}><Trash2 className="h-4 w-4" /></Button>
                                </td>
                            </tr>
                        ))}
                        {customers.length === 0 && (<tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Nenhum cliente cadastrado.</td></tr>)}
                    </tbody>
                </table>
            </div>
        </div>
        </div>

        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                    Tem certeza que deseja excluir o cliente "<span className="font-bold">{customerToDelete?.name}</span>"?
                    <br/><br/>
                    <span className="font-bold text-destructive">Atenção:</span> Todos os registros de consumo e faturas associados a este cliente também serão permanentemente excluídos. Essa ação não pode ser desfeita.
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

export default Customers;
