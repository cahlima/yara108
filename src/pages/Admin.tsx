
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, updateDoc, deleteDoc, query } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, UserCheck, UserX, Trash2, ShieldCheck, ShieldOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


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
      const allUsers = querySnapshot.docs.map(d => ({uid: d.id,...(d.data() as Omit<ManagedUser, "uid">),}));
      
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

  const handleUserAction = async (userId: string, action: 'approve' | 'reject' | 'delete' | 'promote' | 'demote') => {
    if (!user || user.uid === userId && (action === 'delete' || action === 'demote')) {
        toast.warning("Você não pode executar esta ação em sua própria conta.");
        return;
    }

    setActionLoading(prev => ({ ...prev, [userId]: true }));
    try {
      const userRef = doc(db, "users", userId);
      switch(action) {
        case 'approve':
            await updateDoc(userRef, { status: 'APPROVED' });
            toast.success("Usuário aprovado com sucesso!");
            break;
        case 'reject':
        case 'delete':
            await deleteDoc(userRef);
            toast.success(action === 'reject' ? "Usuário rejeitado e removido." : "Usuário removido com sucesso.");
            break;
        case 'promote':
            await updateDoc(userRef, { role: 'ADMIN' });
            toast.success("Usuário promovido a Administrador!");
            break;
        case 'demote':
            await updateDoc(userRef, { role: 'USER' });
            toast.success("Privilégios de Administrador removidos.");
            break;
      }
      fetchUsers(); // Re-fetch all users to update lists
    } catch (error) {
      console.error(`Erro ao ${action} usuário:`, error);
      toast.error(`Falha ao executar a ação no usuário.`);
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
        <p className="text-muted-foreground">Aprove ou rejeite solicitações e gerencie usuários ativos e seus privilégios.</p>
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
                            <div className="flex items-center gap-2">
                                {aUser.role !== 'ADMIN' ? (
                                    <Button variant="outline" size="sm" onClick={() => handleUserAction(aUser.uid, 'promote')} disabled={actionLoading[aUser.uid]}>{actionLoading[aUser.uid] ? <Loader2 className="h-4 w-4 animate-spin"/> : <ShieldCheck className="h-4 w-4 mr-2"/>}Promover</Button>
                                ) : (
                                    <Button variant="outline" size="sm" onClick={() => handleUserAction(aUser.uid, 'demote')} disabled={actionLoading[aUser.uid]}>{actionLoading[aUser.uid] ? <Loader2 className="h-4 w-4 animate-spin"/> : <ShieldOff className="h-4 w-4 mr-2"/>}Remover Admin</Button>
                                )}

                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm" disabled={actionLoading[aUser.uid]}>{actionLoading[aUser.uid] ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 mr-2"/>}Remover</Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Esta ação removerá permanentemente o usuário <span className="font-bold">{aUser.name}</span>. 
                                            Isso não pode ser desfeito.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleUserAction(aUser.uid, 'delete')}>Confirmar Remoção</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                           )}
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
