
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  // Esta é agora a ÚNICA fonte de verdade para o carregamento inicial.
  if (loading) {
    // Exibe um loader em tela cheia, assumindo a responsabilidade que era do AuthProvider.
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // Após o término do carregamento, se não houver usuário, redireciona para a autenticação.
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Se o usuário estiver autenticado, renderiza as rotas filhas (o conteúdo da página).
  return <Outlet />;
};

export default ProtectedRoute;
