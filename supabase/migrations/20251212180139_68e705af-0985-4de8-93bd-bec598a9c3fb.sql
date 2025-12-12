-- Add user_id column to customers table
ALTER TABLE public.customers 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to products table
ALTER TABLE public.products 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to consumption_records table
ALTER TABLE public.consumption_records 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing permissive RLS policies on customers
DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can read customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;

-- Drop existing permissive RLS policies on products
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can read products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;

-- Drop existing permissive RLS policies on consumption_records
DROP POLICY IF EXISTS "Authenticated users can delete consumption records" ON public.consumption_records;
DROP POLICY IF EXISTS "Authenticated users can insert consumption records" ON public.consumption_records;
DROP POLICY IF EXISTS "Authenticated users can read consumption records" ON public.consumption_records;
DROP POLICY IF EXISTS "Authenticated users can update consumption records" ON public.consumption_records;

-- Create secure RLS policies for customers
CREATE POLICY "Users can read their own customers"
ON public.customers FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own customers"
ON public.customers FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own customers"
ON public.customers FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own customers"
ON public.customers FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Create secure RLS policies for products
CREATE POLICY "Users can read their own products"
ON public.products FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own products"
ON public.products FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own products"
ON public.products FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own products"
ON public.products FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Create secure RLS policies for consumption_records
CREATE POLICY "Users can read their own consumption records"
ON public.consumption_records FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own consumption records"
ON public.consumption_records FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own consumption records"
ON public.consumption_records FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own consumption records"
ON public.consumption_records FOR DELETE
TO authenticated
USING (user_id = auth.uid());