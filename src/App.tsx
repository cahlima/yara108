
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import AppLayout from "@/components/AppLayout";
import { Loader2 } from "lucide-react";

import { 
  Admin, 
  Auth as LoginPage, 
  Billing, 
  BillingReport, 
  Consumption, 
  Customers, 
  Dashboard, 
  NotFound, 
  Payments, 
  PaymentHistory, // IMPORTADO
  Products,
  PendingApproval,
  Reports
} from "@/pages";

const LayoutWrapper = () => {
  const { isAdmin } = useAuth();
  return (
    <AppLayout isAdmin={isAdmin}>
      <Outlet /> 
    </AppLayout>
  );
};

const RootRedirect = () => {
  const { user, loading, isApproved } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
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
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster richColors />
        <Routes>
          <Route path="/login" element={<Navigate to="/auth" replace />} />
          <Route path="/auth" element={<LoginPage />} />
          <Route path="/pending-approval" element={<PendingApproval />} />
          <Route path="/" element={<RootRedirect />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<LayoutWrapper />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="consumption" element={<Consumption />} />
              <Route path="payments" element={<Payments />} />
              <Route path="payment-history" element={<PaymentHistory />} /> {/* ADICIONADO */}
              <Route path="products" element={<Products />} />
              <Route path="customers" element={<Customers />} />
              
              <Route element={<AdminRoute />}>
                <Route path="admin" element={<Admin />} />
                <Route path="billing" element={<Billing />} />
                <Route path="billing-report" element={<BillingReport />} />
                <Route path="reports" element={<Reports />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
