
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, UserCheck, UserX, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ManagedUser {
  uid: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<ManagedUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const fetchUsers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const usersQuery = query(collection(db, "users"));
      const querySnapshot = await getDocs(usersQuery);
      const allUsers = querySnapshot.docs.map(d => d.data() as ManagedUser);
      
      setPendingUsers(allUsers.filter(u => u.status === 'PENDING').sort((a,b) => a.name.localeCompare(b.name)));
      setApprovedUsers(allUsers.filter(u => u.status === 'APPROVED').sort((a,b) => a.name.localeCompare(b.name)));

    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
      toast.error("Erro ao carregar a lista de usuários.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      fetchUsers();
    }
  }, [authLoading, fetchUsers]);

  const handleUserAction = async (userId: string, action: 'approve' | 'reject') => {
    setActionLoading(prev => ({ ...prev, [userId]: true }));
    try {
      const userRef = doc(db, "users", userId);
      if (action === 'approve') {
        await updateDoc(userRef, { status: 'APPROVED' });
        toast.success("Usuário aprovado com sucesso!");
      } else { // reject
        // Note: Deleting from Firestore. True deletion from Auth requires a backend function.
        await deleteDoc(userRef);
        toast.success("Usuário rejeitado e removido.");
      }
      fetchUsers(); // Refresh both lists
    } catch (error) {
      console.error(`Erro ao ${action} usuário:", error`);
      toast.error(`Falha ao ${action} o usuário.`);
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: false }));
    }
  };
  
  if (loading || authLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Gerenciamento de Usuários</h2>
        <p className="text-muted-foreground">Aprove ou rejeite solicitações e visualize usuários ativos.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Solicitações Pendentes</CardTitle>
          <CardDescription>Novos usuários aguardando sua aprovação para acessar o sistema.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pendingUsers.length > 0 ? ( 
                pendingUsers.map(pUser => (
                    <div key={pUser.uid} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                        <div>
                            <p className="font-medium">{pUser.name}</p>
                            <p className="text-sm text-muted-foreground">{pUser.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleUserAction(pUser.uid, 'approve')} disabled={actionLoading[pUser.uid]}>{actionLoading[pUser.uid] ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserCheck className="h-4 w-4 mr-2"/>}Aprovar</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleUserAction(pUser.uid, 'reject')} disabled={actionLoading[pUser.uid]}>{actionLoading[pUser.uid] ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserX className="h-4 w-4 mr-2"/>}Rejeitar</Button>
                        </div>
                    </div>
                ))
             ) : (<p className="text-muted-foreground text-center py-4">Nenhuma solicitação pendente.</p>)}
          </div>
        </CardContent>
      </Card>

       <Card>
        <CardHeader>
          <CardTitle>Usuários Cadastrados</CardTitle>
          <CardDescription>Lista de todos os usuários com acesso ativo ao sistema.</CardDescription>
        </CardHeader>
        <CardContent>
           <div className="space-y-3">
                {approvedUsers.length > 0 ? (
                    approvedUsers.map((aUser) => (
                        <div key={aUser.uid} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                            <div>
                                <p className="font-medium">{aUser.name} <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${aUser.role === 'ADMIN' ? 'bg-primary/10 text-primary' : 'bg-muted-foreground/10 text-muted-foreground'}`}>{aUser.role}</span></p>
                                <p className="text-sm text-muted-foreground">{aUser.email}</p>
                            </div>
                           {user?.uid !== aUser.uid && (
                             <Button variant="ghost" size="icon" title="Remover (função futura)" disabled>
                                <Trash2 className="h-4 w-4 text-destructive/50" />
                             </Button>)
                            }
                        </div>
                    ))
                    ) : (
                    <p className="text-muted-foreground text-center py-4">Nenhum usuário aprovado encontrado.</p>
                    )}
            </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Admin;
