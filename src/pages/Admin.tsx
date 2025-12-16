import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Shield } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  approved: boolean;
  created_at: string;
  isAdmin?: boolean;
}

export default function Admin() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get admin roles
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);

      const usersWithRoles = (profiles || []).map(p => ({
        ...p,
        isAdmin: adminUserIds.has(p.id),
      }));

      setUsers(usersWithRoles);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ approved: true })
        .eq("id", userId);

      if (error) throw error;

      toast.success("Usuário aprovado com sucesso");
      fetchUsers();
    } catch (error) {
      console.error("Error approving user:", error);
      toast.error("Erro ao aprovar usuário");
    }
  };

  const handleRevoke = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ approved: false })
        .eq("id", userId);

      if (error) throw error;

      toast.success("Acesso revogado");
      fetchUsers();
    } catch (error) {
      console.error("Error revoking access:", error);
      toast.error("Erro ao revogar acesso");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pendingUsers = users.filter(u => !u.approved);
  const approvedUsers = users.filter(u => u.approved);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Administração</h2>
        <p className="text-muted-foreground">Gerencie os usuários do sistema</p>
      </div>

      {/* Pending Approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="destructive">{pendingUsers.length}</Badge>
            Aguardando Aprovação
          </CardTitle>
          <CardDescription>
            Usuários que se cadastraram e aguardam aprovação
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : pendingUsers.length === 0 ? (
            <p className="text-muted-foreground">Nenhum usuário pendente</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Data de Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{formatDate(user.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(user.id)}
                        className="gap-1"
                      >
                        <Check className="w-4 h-4" />
                        Aprovar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Approved Users */}
      <Card>
        <CardHeader>
          <CardTitle>Usuários Aprovados</CardTitle>
          <CardDescription>
            Usuários com acesso ao sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : approvedUsers.length === 0 ? (
            <p className="text-muted-foreground">Nenhum usuário aprovado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Data de Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {user.isAdmin ? (
                        <Badge className="gap-1">
                          <Shield className="w-3 h-3" />
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Usuário</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(user.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {!user.isAdmin && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRevoke(user.id)}
                          className="gap-1"
                        >
                          <X className="w-4 h-4" />
                          Revogar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
