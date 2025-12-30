import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";

// Páginas
import Login from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Customers from "@/pages/Customers";
import Billing from "@/pages/Billing";
import Consumption from "@/pages/Consumption";
import Payments from "@/pages/Payments";
import Admin from "@/pages/Admin";

// Componente wrapper para passar isAdmin para o AppLayout
const LayoutWrapper = () => {
  const { isAdmin } = useAuth();
  return <AppLayout isAdmin={isAdmin} />;
};

function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastContainer autoClose={3000} hideProgressBar />
        <Routes>
          {/* Rota pública de login */}
          <Route path="/login" element={<Login />} />

          {/* Rota pai protegida que renderiza o AppLayout */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <LayoutWrapper />
              </ProtectedRoute>
            }
          >
            {/* Rotas filhas que serão renderizadas dentro do <Outlet /> do AppLayout */}
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="consumption" element={<Consumption />} />
            <Route path="payments" element={<Payments />} />
            <Route path="products" element={<Products />} />
            <Route path="customers" element={<Customers />} />
            <Route path="billing" element={<Billing />} />
            <Route path="admin" element={<Admin />} />

            {/* Rota de fallback para redirecionar / para /dashboard */}
            <Route index element={<Dashboard />} />
          </Route>

        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
