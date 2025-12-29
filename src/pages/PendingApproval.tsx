import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { app } from "@/lib/firebase";
import { getAuth, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Clock } from "lucide-react";

export default function PendingApproval() {
  const navigate = useNavigate();
  const auth = getAuth(app);

  const handleLogout = async () => {
    await signOut(auth);
    toast.success("Logout realizado");
    navigate("/auth");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <Clock className="w-6 h-6 text-amber-600" />
          </div>
          <CardTitle>Aguardando Aprovação</CardTitle>
          <CardDescription>
            Seu cadastro foi realizado com sucesso, mas ainda precisa ser aprovado pelo administrador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Você receberá acesso ao sistema assim que sua conta for aprovada. 
            Por favor, entre em contato com o administrador se necessário.
          </p>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
