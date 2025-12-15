-- Add NOT NULL constraints to user_id columns for better RLS security
ALTER TABLE public.customers ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.consumption_records ALTER COLUMN user_id SET NOT NULL;