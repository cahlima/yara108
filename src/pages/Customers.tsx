import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Edit, Phone } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";

const customerSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(100, "Nome deve ter no máximo 100 caracteres"),
  phone: z
    .string()
    .trim()
    .regex(/^(\d{2}\s?\d{8,9})?$/, "Telefone inválido (ex: 41 988710852)")
    .optional()
    .or(z.literal("")),
});

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

const Customers = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ name: "", phone: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const { loading: authLoading, isAdmin } = useAuth();

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const customersRef = collection(db, "customers");
      const q = query(customersRef);
      const querySnapshot = await getDocs(q);
      const customersList = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Customer)
      );
      setCustomers(customersList);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao carregar clientes:", error);
      toast.error("Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchCustomers();
    }
  }, [authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const validatedData = customerSchema.parse(formData);

      if (editingId) {
        const customerRef = doc(db, "customers", editingId);
        await updateDoc(customerRef, {
          name: validatedData.name,
          phone: validatedData.phone || null,
        });
        toast.success("Cliente atualizado com sucesso!");
      } else {
        await addDoc(collection(db, "customers"), {
          name: validatedData.name,
          phone: validatedData.phone || null,
          created_at: new Date().toISOString(),
        });
        toast.success("Cliente cadastrado com sucesso!");
      }

      setFormData({ name: "", phone: "" });
      setEditingId(null);
      fetchCustomers(); // Refresh the list
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        if (import.meta.env.DEV) console.error("Erro ao salvar cliente:", error);
        toast.error("Erro ao salvar cliente");
      }
    }
  };

  const handleEdit = (customer: Customer) => {
    setFormData({ name: customer.name, phone: customer.phone || "" });
    setEditingId(customer.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente excluir este cliente? Isso não pode ser desfeito.")) return;

    try {
      const customerRef = doc(db, "customers", id);
      await deleteDoc(customerRef);
      toast.success("Cliente excluído com sucesso!");
      fetchCustomers(); // Refresh the list
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao excluir cliente:", error);
      toast.error("Erro ao excluir cliente. Verifique se ele não possui consumos registrados.");
    }
  };
  
  if (loading || authLoading) {
    return <div className="text-center py-8">Carregando...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Clientes</h2>
        <p className="text-muted-foreground">Gerencie seus clientes</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Editar" : "Cadastrar"} Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome do cliente"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-phone">Telefone (opcional)</Label>
                <Input
                  id="customer-phone"
                  name="customer-phone-field"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Ex: 41 988710852"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                {editingId ? "Atualizar Cliente" : "Salvar Cliente"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setFormData({ name: "", phone: "" });
                  }}
                >
                  Cancelar Edição
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers.map((customer) => (
          <Card key={customer.id}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate" title={customer.name}>{customer.name}</h3>
                  {customer.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {customer.phone}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0 ml-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleEdit(customer)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDelete(customer.id)}
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

export default Customers;