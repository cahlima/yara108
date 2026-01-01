
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth"; // Ajuste o caminho se necessário
import { Loader2 } from "lucide-react";

const ProtectedRoute = () => {
  const { user, loading, isApproved } = useAuth();

  if (loading) {
    // Mostra um spinner enquanto o estado de autenticação e aprovação está sendo verificado
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Usuário não está logado, redireciona para a página de autenticação.
    return <Navigate to="/auth" replace />;
  }

  if (!isApproved) {
    // Usuário está logado, mas não aprovado, redireciona para a página de "pendente".
    return <Navigate to="/pending-approval" replace />;
  }

  // Se o usuário estiver logado e aprovado, renderiza o conteúdo da rota protegida
  return <Outlet />;
};

export default ProtectedRoute;
