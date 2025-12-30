
import { BrowserRouter as Router, Routes, Route, Outlet } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute"; // Import the new AdminRoute
import AppLayout from "@/components/AppLayout";

// Import all pages
import { 
  Admin, 
  Auth as LoginPage, // Renamed to avoid conflict
  Billing, 
  Consumption, 
  Customers, 
  Dashboard, 
  NotFound, 
  Payments, 
  Products 
} from "@/pages";

// Wrapper component to pass isAdmin to AppLayout within the protected context
const LayoutWrapper = () => {
  const { isAdmin } = useAuth();
  // Outlet will render the nested child route (e.g., Dashboard, Products, etc.)
  return (
    <AppLayout isAdmin={isAdmin}>
      <Outlet /> 
    </AppLayout>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster richColors />
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes for Authenticated Users */}
          <Route element={<ProtectedRoute />}>
            <Route element={<LayoutWrapper />}>
              <Route index element={<Dashboard />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="consumption" element={<Consumption />} />
              <Route path="billing" element={<Billing />} />
              <Route path="payments" element={<Payments />} />
              <Route path="products" element={<Products />} />
              <Route path="customers" element={<Customers />} />
              
              {/* Admin-only Routes */}
              <Route element={<AdminRoute />}>
                <Route path="admin" element={<Admin />} />
              </Route>
            </Route>
          </Route>

          {/* Fallback 404 Not Found Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
