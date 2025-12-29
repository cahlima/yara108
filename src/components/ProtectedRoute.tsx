import { Navigate } from "react-router-dom";
// --- CORREÇÃO: Padronizando o import para usar o alias '@/' ---
import { useAuth } from "@/hooks/useAuth"; 
import { ReactNode } from "react";

/**
 *  Este componente protege uma rota, garantindo que apenas usuários autenticados
 *  possam acessá-la. Ele lida com o estado de carregamento e redireciona para
 *  a página de login se o usuário não estiver logado.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
