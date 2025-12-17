-- Drop existing insert policy
DROP POLICY IF EXISTS "Users can insert their own consumption records" ON public.consumption_records;

-- Create improved insert policy that validates customer_id belongs to the user
CREATE POLICY "Users can insert their own consumption records" 
ON public.consumption_records 
FOR INSERT 
WITH CHECK (
  user_id = auth.uid() 
  AND EXISTS (
    SELECT 1 FROM public.customers 
    WHERE customers.id = customer_id 
    AND customers.user_id = auth.uid()
  )
);

-- Also update the UPDATE policy to prevent changing customer_id to another user's customer
DROP POLICY IF EXISTS "Users can update their own consumption records" ON public.consumption_records;

CREATE POLICY "Users can update their own consumption records" 
ON public.consumption_records 
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid() 
  AND EXISTS (
    SELECT 1 FROM public.customers 
    WHERE customers.id = customer_id 
    AND customers.user_id = auth.uid()
  )
);