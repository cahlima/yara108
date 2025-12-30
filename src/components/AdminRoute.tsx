
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const AdminRoute = () => {
  const { isAdmin, loading } = useAuth();

  // While loading, we render nothing as the AuthProvider handles the loading state
  if (loading) {
    return null; 
  }

  // If the user is not an admin after loading, show a toast and redirect
  if (!isAdmin) {
    toast.error("Acesso Negado", { 
      description: "Você não tem permissão para acessar esta área."
    });
    return <Navigate to="/dashboard" replace />;
  }

  // If the user is an admin, render the nested admin routes
  return <Outlet />;
};

export default AdminRoute;
