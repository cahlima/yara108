
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import AppLayout from "@/components/AppLayout";
import { Loader2 } from "lucide-react";

// Import pages directly to avoid circular dependencies
import Admin from "@/pages/Admin";
import LoginPage from "@/pages/Auth";
import Billing from "@/pages/Billing";
import BillingReport from "@/pages/BillingReport";
import Consumption from "@/pages/Consumption";
import Customers from "@/pages/Customers";
import Dashboard from "@/pages/Dashboard";
import DailyReport from "@/pages/DailyReport";
import NotFound from "@/pages/NotFound";
import Payments from "@/pages/Payments";
import PaymentHistory from "@/pages/PaymentHistory";
import Products from "@/pages/Products";
import PendingApproval from "@/pages/PendingApproval";


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
              <Route path="payment-history" element={<PaymentHistory />} />
              <Route path="products" element={<Products />} />
              <Route path="customers" element={<Customers />} />
              <Route path="billing" element={<Billing />} />
              
              <Route element={<AdminRoute />}>
                <Route path="admin" element={<Admin />} />
                <Route path="billing-report" element={<BillingReport />} />
                <Route path="daily-report" element={<DailyReport />} />
                <Route path="reports" element={<BillingReport />} />
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
