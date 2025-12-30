
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc, query } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
}

const Admin = () => {
  const { user, loading: authLoading } = useAuth(); // Use auth loading state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uid, setUid] = useState("");

  const fetchAdmins = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const adminsQuery = query(collection(db, "admins"));
      const querySnapshot = await getDocs(adminsQuery);
      const adminsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminUser));
      setAdmins(adminsData);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao carregar admins:", error);
      toast.error("Erro ao carregar administradores.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) { // Fetch only when auth is ready
      fetchAdmins();
    }
  }, [authLoading, fetchAdmins]);

  const handleAddAdmin = async () => {
    if (!uid.trim()) {
      toast.error("UID do usuário não pode ser vazio.");
      return;
    }
    setIsSubmitting(true);
    try {
      // Here you might want to fetch the user's email from your users collection
      // For simplicity, we are just storing the UID.
      await setDoc(doc(db, "admins", uid), { added_at: new Date() });
      toast.success("Administrador adicionado com sucesso!");
      setUid("");
      fetchAdmins(); // Refresh the list
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao adicionar admin:", error);
      toast.error("Falha ao adicionar administrador.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveAdmin = async (adminId: string) => {
    if (adminId === user?.uid) {
      toast.error("Você não pode remover a si mesmo.");
      return;
    }
    try {
      await deleteDoc(doc(db, "admins", adminId));
      toast.success("Administrador removido com sucesso!");
      fetchAdmins(); // Refresh the list
    } catch (error) {
      if (import.meta.env.DEV) console.error("Erro ao remover admin:", error);
      toast.error("Falha ao remover administrador.");
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
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Painel de Administração</h2>
        <p className="text-muted-foreground">Gerencie os administradores do sistema.</p>
      </div>
      
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="UID do Usuário"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            disabled={isSubmitting}
          />
          <Button onClick={handleAddAdmin} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar Admin"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xl font-semibold">Administradores Atuais</h3>
        {admins.length > 0 ? (
          admins.map((admin) => (
            <div key={admin.id} className="flex items-center justify-between p-3 border rounded-lg bg-card">
              <div className="flex items-center gap-3">
                 <ShieldCheck className="h-5 w-5 text-primary" />
                 <span className="font-mono text-sm">{admin.id}</span>
                 {admin.id === user?.uid && <span className="text-xs text-muted-foreground">(Você)</span>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveAdmin(admin.id)}
                disabled={admin.id === user?.uid}
                title={admin.id === user?.uid ? "Não é possível remover a si mesmo" : "Remover"}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-center py-4">Nenhum administrador encontrado.</p>
        )}
      </div>
    </div>
  );
};

export default Admin;
