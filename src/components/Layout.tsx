import { Link, useLocation } from "react-router-dom";
import { Home, Package, Users, Plus, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  const navItems = [
    { to: "/", icon: Home, label: "Dashboard" },
    { to: "/products", icon: Package, label: "Produtos" },
    { to: "/customers", icon: Users, label: "Clientes" },
    { to: "/consumption", icon: Plus, label: "Lançamento" },
    { to: "/payments", icon: DollarSign, label: "Pagamentos" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-primary">Sistema de Consumo</h1>
        </div>
      </header>

      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {navItems.map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 rounded-t-lg transition-colors whitespace-nowrap",
                  location.pathname === to
                    ? "bg-background text-primary font-medium border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
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
