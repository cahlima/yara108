
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

const PendingApproval = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/auth');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-[450px] text-center">
        <CardHeader>
          <CardTitle>Aguardando Aprovação</CardTitle>
          <CardDescription>Sua conta foi criada, mas ainda não foi aprovada por um administrador.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-6">
            Por favor, aguarde a aprovação para ter acesso ao sistema. Você pode entrar em contato com o suporte se a espera for longa.
          </p>
          <Button onClick={handleLogout} variant="outline">
            Sair (Logout)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingApproval;
