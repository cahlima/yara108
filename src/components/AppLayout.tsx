
import { NavLink, useNavigate } from "react-router-dom";
import { Home, ShoppingCart, Users, DollarSign, BarChart, Settings, LogOut, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import React from "react";

interface AppLayoutProps {
  isAdmin: boolean;
  children: React.ReactNode;
}

const AppLayout = ({ isAdmin, children }: AppLayoutProps) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const navLinkClass = (isActive: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary ${isActive ? 'bg-muted text-primary' : ''}`;

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-muted/40 md:block">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
            <NavLink to="/" className="flex items-center gap-2 font-semibold">
              <FileText className="h-6 w-6" />
              <span>Controle Clientes</span>
            </NavLink>
          </div>
          <div className="flex-1">
            <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
              <NavLink to="/dashboard" className={({ isActive }) => navLinkClass(isActive)}>
                <Home className="h-4 w-4" />
                Dashboard
              </NavLink>
              <NavLink to="/consumption" className={({ isActive }) => navLinkClass(isActive)}>
                <ShoppingCart className="h-4 w-4" />
                Consumo
              </NavLink>
               <NavLink to="/billing" className={({ isActive }) => navLinkClass(isActive)}>
                <DollarSign className="h-4 w-4" />
                Faturamento
              </NavLink>
              <NavLink to="/payments" className={({ isActive }) => navLinkClass(isActive)}>
                <BarChart className="h-4 w-4" />
                Pagamentos
              </NavLink>
              <NavLink to="/products" className={({ isActive }) => navLinkClass(isActive)}>
                <ShoppingCart className="h-4 w-4" />
                Produtos
              </NavLink>
              <NavLink to="/customers" className={({ isActive }) => navLinkClass(isActive)}>
                <Users className="h-4 w-4" />
                Clientes
              </NavLink>
              {isAdmin && (
                <NavLink to="/admin" className={({ isActive }) => navLinkClass(isActive)}>
                  <Settings className="h-4 w-4" />
                  Admin
                </NavLink>
              )}
            </nav>
          </div>
          <div className="mt-auto p-4">
             <Button size="sm" variant="outline" onClick={handleLogout} className="w-full justify-start gap-3">
                <LogOut className="h-4 w-4" />
                Sair
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
