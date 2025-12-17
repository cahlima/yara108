import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Edit, Phone } from "lucide-react";
import { z } from "zod";

const customerSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(100, "Nome deve ter no máximo 100 caracteres"),
  phone: z.string().trim().regex(/^\d{2}\s?\d{8,9}$/, "Telefone inválido (ex: 41 988710852)").optional().or(z.literal("")),
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

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name");

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao carregar clientes:", error);
      toast.error("Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const validatedData = customerSchema.parse(formData);

      if (editingId) {
        const { error } = await supabase
          .from("customers")
          .update({ name: validatedData.name, phone: validatedData.phone || null })
          .eq("id", editingId);

        if (error) throw error;
        toast.success("Cliente atualizado com sucesso!");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado");
        
        const { error } = await supabase
          .from("customers")
          .insert({ name: validatedData.name, phone: validatedData.phone || null, user_id: user.id });

        if (error) throw error;
        toast.success("Cliente cadastrado com sucesso!");
      }

      setFormData({ name: "", phone: "" });
      setEditingId(null);
      fetchCustomers();
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
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente excluir este cliente?")) return;

    try {
      const { error } = await supabase.from("customers").delete().eq("id", id);

      if (error) throw error;
      toast.success("Cliente excluído com sucesso!");
      fetchCustomers();
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao excluir cliente:", error);
      toast.error("Erro ao excluir cliente");
    }
  };

  if (loading) {
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
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-form-type="other"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                {editingId ? "Atualizar" : "Cadastrar"}
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
                  Cancelar
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
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">{customer.name}</h3>
                  {customer.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {customer.phone}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleEdit(customer)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDelete(customer.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
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
