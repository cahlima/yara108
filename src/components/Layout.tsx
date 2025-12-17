import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Package, Users, Plus, DollarSign, LogOut, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair");
    } else {
      toast.success("Logout realizado com sucesso");
      navigate("/auth");
    }
  };

  const navItems = [
    { to: "/", icon: Home, label: "Dashboard", adminOnly: false },
    { to: "/products", icon: Package, label: "Produtos", adminOnly: false },
    { to: "/customers", icon: Users, label: "Clientes", adminOnly: false },
    { to: "/consumption", icon: Plus, label: "Lançamento", adminOnly: false },
    { to: "/payments", icon: DollarSign, label: "Pagamentos", adminOnly: false },
    { to: "/billing", icon: DollarSign, label: "Fechamento", adminOnly: true },
    { to: "/admin", icon: Shield, label: "Admin", adminOnly: true },
  ];

  const filteredNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10 border-b-2 border-b-secondary/30">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">Sistema Consumo <span className="text-secondary">Yara108</span></h1>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {filteredNavItems.map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 rounded-t-lg transition-all whitespace-nowrap",
                  location.pathname === to
                    ? "bg-background text-primary font-medium border-b-2 border-primary shadow-sm"
                    : "text-muted-foreground hover:text-secondary hover:bg-secondary/10"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
};

export default Layout;
