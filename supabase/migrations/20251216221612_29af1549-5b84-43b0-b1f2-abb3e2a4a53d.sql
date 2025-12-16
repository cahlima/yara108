-- Fix admin email typo: gnail -> gmail
CREATE OR REPLACE FUNCTION public.check_admin_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email = 'caciabad@gmail.com' THEN
    UPDATE public.profiles SET approved = TRUE WHERE id = NEW.id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;