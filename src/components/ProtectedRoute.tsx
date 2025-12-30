import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  // Retorna null para evitar a renderização da rota antes da resolução do auth
  if (loading) {
    return null;
  }

  // Se não houver usuário após o carregamento, redireciona para o login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Se o usuário estiver autenticado, renderiza a rota filha
  return <>{children}</>;
}
