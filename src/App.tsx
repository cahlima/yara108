
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// --- CORREÇÃO: Padronizando todos os imports para usar o alias '@/' ---
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute"; 
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Products from "@/pages/Products";
import Customers from "@/pages/Customers";

function App() {
  return (
    <AuthProvider>
      <Router>
        <ToastContainer autoClose={3000} hideProgressBar />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
          
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
