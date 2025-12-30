
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { z, ZodError } from "zod";
import { FirebaseError } from "firebase/app";
import { Loader2 } from "lucide-react";

const authSchema = z.object({
  email: z.string().email("Formato de email inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (mode: "login" | "signup") => {
    setIsLoading(true);
    try {
      if (mode === "login") {
        const validatedData = authSchema.parse({ email, password });
        await signInWithEmailAndPassword(auth, validatedData.email, validatedData.password);
        toast.success("Login bem-sucedido!");
        navigate("/");
      } else { // signup
        const validatedData = authSchema.parse({ email, password });
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          validatedData.email,
          validatedData.password
        );
        const user = userCredential.user;
        
        // Your logic was correct: Check for the admin email
        const isAdminEmail = user.email === "caciabad@gmail.com";

        // Now, we automate your manual fix:
        // If the user is an admin, create a document in the 'admins' collection.
        if (isAdminEmail) {
          const adminDocRef = doc(db, "admins", user.uid);
          await setDoc(adminDocRef, {
            email: user.email,
            added_at: new Date().toISOString(),
          });
           toast.info("Privilégios de administrador concedidos.");
        }

        // Create the standard customer/user profile
        await setDoc(doc(db, "customers", user.uid), {
          id: user.uid,
          email: user.email,
          name: user.email.split('@')[0],
          approved: isAdminEmail, // This field can still be useful
          created_at: new Date().toISOString(),
        });

        toast.success("Conta criada com sucesso!");
        navigate("/");
      }
    } catch (error) {
      if (error instanceof ZodError) {
        toast.error(error.errors[0].message);
      } else if (error instanceof FirebaseError) {
        switch (error.code) {
          case "auth/user-not-found":
          case "auth/wrong-password":
            toast.error("Email ou senha inválidos.");
            break;
          case "auth/email-already-in-use":
            toast.error("Este email já está em uso.");
            break;
          case "auth/invalid-email":
            toast.error("O email fornecido não é válido.");
            break;
          default:
            toast.error("Ocorreu um erro desconhecido.");
            break;
        }
      } else {
        toast.error("Ocorreu um erro.");
      }
       if (import.meta.env.DEV) console.error("Authentication error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Tabs defaultValue="login" className="w-[400px]">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="login">Entrar</TabsTrigger>
          <TabsTrigger value="signup">Criar Conta</TabsTrigger>
        </TabsList>
        <TabsContent value="login">
          <Card>
            <CardHeader>
              <CardTitle>Login</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-login">Email</Label>
                <Input
                  id="email-login"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-login">Senha</Label>
                <Input
                  id="password-login"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleAuth("login")} className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 
                Entrar
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="signup">
          <Card>
            <CardHeader>
              <CardTitle>Criar Conta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-signup">Email</Label>
                <Input
                  id="email-signup"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-signup">Senha</Label>
                <Input
                  id="password-signup"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleAuth("signup")} className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 
                Criar Conta
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Auth;
