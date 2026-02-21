
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";

import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  writeBatch,
  deleteField,
  getDoc,
  DocumentData,
  Firestore,
} from "firebase/firestore";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, UserCheck, UserX, Trash2, ShieldCheck, ShieldOff, Wrench } from "lucide-react";
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

// --- TYPE DEFINITIONS ---

interface ManagedUser {
  uid: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface ConsumptionRecord extends DocumentData {
  id: string;
  ownerId: string;
  payLater?: boolean;
  date?: Timestamp | Date;
  subtotal?: number | string;
  customerId?: string;
  customerName?: string;
  // Legacy fields to be removed
  customer_id?: string;
  customer_name?: string;
}

interface Invoice extends DocumentData {
  id: string;
  ownerId: string;
  total: number;
  openTotal: number;
  paidTotal?: number;
  status: 'OPEN' | 'PAID' | 'PARTIAL';
}

interface InvoiceRecalc {
  total: number;
  // paidTotal will be read from the original invoice
}


// --- ADMIN COMPONENT ---

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<ManagedUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [isRepairing, setIsRepairing] = useState(false);

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
      toast.error("Erro ao carregar la lista de usuários.");
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
      fetchUsers();
    } catch (error) {
      console.error(`Erro ao ${action} usuário:`, error);
      toast.error(`Falha ao executar a ação no usuário.`);
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  /**
   * Executes a data repair and normalization routine for consumption_records and invoices.
   * Uses writeBatch for performance and scalability.
   */
  const handleDataRepair = async () => {
    if (!user) {
      toast.error("ID do usuário não encontrado. A operação foi cancelada.");
      return;
    }
    
    setIsRepairing(true);
    const ownerId = user.uid;
    const BATCH_LIMIT = 450;
    const UNKNOWN_CUSTOMER_ID = `UNKNOWN_${ownerId}`;

    let batch = writeBatch(db as Firestore);
    let operationCount = 0;

    toast.info("Iniciando reparo de dados... Isso pode levar alguns minutos.", { duration: 10000 });

    try {
      // Step 1: Ensure "Cliente Desconhecido" exists
      const unknownCustomerRef = doc(db, "customers", UNKNOWN_CUSTOMER_ID);
      const unknownCustomerSnap = await getDoc(unknownCustomerRef);

      if (!unknownCustomerSnap.exists()) {
        batch.set(unknownCustomerRef, {
          ownerId: ownerId,
          name: "Cliente Desconhecido",
          createdAt: Timestamp.now(),
        });
        operationCount++;
        toast.info("Criado registro para 'Cliente Desconhecido'.");
      }

      // Step 2: Read all necessary data (without a transaction)
      const recordsQuery = query(collection(db, "consumption_records"), where("ownerId", "==", ownerId));
      const invoicesQuery = query(collection(db, "invoices"), where("ownerId", "==", ownerId));

      const [recordsSnapshot, invoicesSnapshot] = await Promise.all([
        getDocs(recordsQuery),
        getDocs(invoicesQuery),
      ]);

      const allRecords: ConsumptionRecord[] = recordsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const allInvoicesMap = new Map<string, Invoice>(invoicesSnapshot.docs.map(d => [d.id, { id: d.id, ...d.data() } as Invoice]));
      
      const invoicesRecalcMap = new Map<string, InvoiceRecalc>();

      // Step 3: Process and normalize each consumption record
      for (const record of allRecords) {
        const recordRef = doc(db, "consumption_records", record.id);
        const updates: { [key: string]: any } = {};

        let { customerId, customerName } = record;

        if (record.customer_id) {
          customerId = customerId || record.customer_id;
          updates['customer_id'] = deleteField();
        }
        if (record.customer_name) {
          customerName = customerName || record.customer_name;
          updates['customer_name'] = deleteField();
        }

        if (record.payLater && !customerId) {
          customerId = UNKNOWN_CUSTOMER_ID;
          customerName = "Cliente Desconhecido";
        }
        
        updates['customerId'] = customerId;
        updates['customerName'] = customerName;

        const recordDate = record.date
          ? typeof record.date.toDate === 'function'
            ? record.date.toDate()
            : new Date(record.date)
          : new Date();
        const recordSubtotal = Number(record.subtotal) || 0;
        updates['date'] = Timestamp.fromDate(recordDate);
        updates['subtotal'] = recordSubtotal;

        if (record.payLater && customerId) {
          const monthStr = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
          const invoiceId = `${ownerId}_${customerId}_${monthStr}`;
          updates['invoiceId'] = invoiceId;
          
          const currentRecalc = invoicesRecalcMap.get(invoiceId) || { total: 0 };
          currentRecalc.total += recordSubtotal;
          invoicesRecalcMap.set(invoiceId, currentRecalc);
        }
        
        batch.update(recordRef, updates);
        operationCount++;

        if (operationCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(db as Firestore);
          operationCount = 0;
          toast.info(`Lote de ${BATCH_LIMIT} registros processado...`);
        }
      }
      
      // Step 4: Recalculate and update each invoice
      const allInvoiceIds = new Set([...allInvoicesMap.keys(), ...invoicesRecalcMap.keys()]);
      
      for (const invoiceId of allInvoiceIds) {
        const invoiceRef = doc(db, "invoices", invoiceId);
        const originalInvoice = allInvoicesMap.get(invoiceId);
        const recalcData = invoicesRecalcMap.get(invoiceId);
        
        const paidTotal = originalInvoice?.paidTotal || 0;
        const newTotal = recalcData?.total || 0;
        const newOpenTotal = newTotal - paidTotal;
        const newStatus = newOpenTotal <= 0.001 ? 'PAID' : 'OPEN';

        const [ownerId, customerId, month] = invoiceId.split('_');

        batch.set(invoiceRef, {
          id: invoiceId,
          ownerId,
          customerId,
          month,
          total: newTotal,
          openTotal: newOpenTotal,
          paidTotal: paidTotal,
          status: newStatus,
          updatedAt: Timestamp.now()
        }, { merge: true });
        
        operationCount++;

        if (operationCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(db as Firestore);
          operationCount = 0;
          toast.info(`Lote de ${BATCH_LIMIT} faturas processado...`);
        }
      }

      // Step 5: Final commit
      if (operationCount > 0) {
        await batch.commit();
      }

      toast.success("Reparo de dados concluído com sucesso!", { duration: 5000 });

    } catch (error: any) {
      console.error("Erro durante o reparo de dados:", error);
      toast.error("Erro durante o reparo de dados", {
        description: error.message || "Verifique o console para mais detalhes."
      });
    } finally {
      setIsRepairing(false);
      fetchUsers(); // Re-fetch user data to reflect any changes if necessary
    }
  };
  
  if (loading || authLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Gerenciamento</h2>
        <p className="text-muted-foreground">Gerencie usuários, dados e outras configurações do sistema.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reparo de Dados</CardTitle>
          <CardDescription>
            Use esta ferramenta para corrigir inconsistências nos dados de consumo e recalcular os totais das faturas. 
            Isso pode resolver problemas de valores incorretos nos débitos em aberto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isRepairing}>
                {isRepairing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
                Corrigir Inconsistências de Dados
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Reparo de Dados?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação irá verificar e corrigir TODOS os registros de consumo e recalculará o valor total de TODAS as faturas.
                  É um processo seguro e recomendado para resolver inconsistências. Confirma que deseja continuar?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDataRepair}>Confirmar e Iniciar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

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
