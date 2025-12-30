import { Link, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { toast } from "react-toastify";

// Ícones
const HomeIcon = () => <span>🏠</span>;
const PackageIcon = () => <span>📦</span>;
const UsersIcon = () => <span>👥</span>;
const BillingIcon = () => <span>🧾</span>;
const RocketIcon = () => <span>🚀</span>;
const DollarSignIcon = () => <span>💲</span>;
const ShieldCheckIcon = () => <span>🛡️</span>;
const LogOutIcon = () => <span>🚪</span>;

// Definindo a interface de props para clareza
interface AppLayoutProps {
  isAdmin: boolean;
}

export default function AppLayout({ isAdmin }: AppLayoutProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success("Logout realizado com sucesso!");
      navigate("/login");
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      toast.error("Erro ao fazer logout.");
    }
  };

  const navLinkClasses = "flex items-center gap-3 rounded-lg px-3 py-2 text-base text-sidebar-foreground transition-all hover:text-sidebar-primary";

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-sidebar lg:block">
        <div className="flex h-full max-h-screen flex-col justify-between">
          <div>
            <div className="flex h-[60px] items-center border-b px-6">
              <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
                <PackageIcon />
                <span>YARA108 - Consumo</span>
              </Link>
            </div>
            <div className="flex-1 overflow-auto py-2">
              <nav className="grid items-start px-4 font-medium">
                {isAdmin && (
                  <Link to="/admin" className={navLinkClasses}>
                    <ShieldCheckIcon />
                    Admin
                  </Link>
                )}
                <Link to="/dashboard" className={navLinkClasses}>
                  <HomeIcon />
                  Dashboard
                </Link>
                <Link to="/consumption" className={navLinkClasses}>
                  <RocketIcon />
                  Lançamento
                </Link>
                <Link to="/payments" className={navLinkClasses}>
                  <DollarSignIcon />
                  Pagamentos
                </Link>
                <Link to="/products" className={navLinkClasses}>
                  <PackageIcon />
                  Produtos
                </Link>
                <Link to="/customers" className={navLinkClasses}>
                  <UsersIcon />
                  Clientes
                </Link>
                <Link to="/billing" className={navLinkClasses}>
                  <BillingIcon />
                  Faturamento
                </Link>
              </nav>
            </div>
          </div>
          <div className="mb-4 px-4">
            <button
              onClick={handleLogout}
              className={`${navLinkClasses} w-full`}
            >
              <LogOutIcon />
              Logout
            </button>
          </div>
        </div>
      </div>
      <div
        className="flex flex-col bg-cover bg-center"
        style={{ backgroundImage: "url('/images/background.webp')" }}
      >
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 bg-black bg-opacity-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
