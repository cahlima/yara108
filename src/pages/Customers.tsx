
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, updateDoc, query, where, serverTimestamp, FirestoreError } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PlusCircle, Loader2, Edit } from "lucide-react";
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
  const [formData, setFormData] = useState({ name: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchCustomers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, "customers"), where("ownerId", "==", user.uid)); // LIST/SEARCH com ownerId
      const querySnapshot = await getDocs(q);
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
    if (!authLoading) { // Fetch only when auth is ready
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    setErrors({});

    const validation = customerSchema.safeParse(formData);
    if (!validation.success) {
      const newErrors: Record<string, string> = {};
      validation.error.errors.forEach(err => {
        newErrors[err.path[0]] = err.message;
      });
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
        }); // UPDATE: ownerId não é enviado, garantindo que não seja alterado
        toast.success("Cliente atualizado com sucesso!");
      } else {
        await addDoc(collection(db, "customers"), {
          ...dataToSave,
          ownerId: user.uid, // CREATE: ownerId é incluído obrigatoriamente
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
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
         <div>
          <h2 className="text-3xl font-bold text-foreground">Gerenciar Clientes</h2>
          <p className="text-muted-foreground">Adicione e edite os dados dos seus clientes.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingCustomer ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
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
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg w-full">
         <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 w-[40%]">Nome</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">Telefone</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">Email</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                    {customers.map(customer => (
                        <tr key={customer.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                            <td className="p-4 align-middle font-medium">{customer.name}</td>
                            <td className="p-4 align-middle">{customer.phone || "N/A"}</td>
                            <td className="p-4 align-middle">{customer.email || "N/A"}</td>
                            <td className="p-4 align-middle text-right">
                                <Button variant="outline" size="icon" onClick={() => handleEdit(customer)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

export default Customers;
