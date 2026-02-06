import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export default function RootRedirect() {
  const { user, loading, isApproved } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isApproved) {
    return <Navigate to="/pending-approval" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}
