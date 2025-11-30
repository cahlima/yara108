-- Drop all existing insecure RLS policies
DROP POLICY IF EXISTS "Permitir leitura de clientes" ON customers;
DROP POLICY IF EXISTS "Permitir inserção de clientes" ON customers;
DROP POLICY IF EXISTS "Permitir atualização de clientes" ON customers;
DROP POLICY IF EXISTS "Permitir exclusão de clientes" ON customers;

DROP POLICY IF EXISTS "Permitir leitura de produtos" ON products;
DROP POLICY IF EXISTS "Permitir inserção de produtos" ON products;
DROP POLICY IF EXISTS "Permitir atualização de produtos" ON products;
DROP POLICY IF EXISTS "Permitir exclusão de produtos" ON products;

DROP POLICY IF EXISTS "Permitir leitura de consumos" ON consumption_records;
DROP POLICY IF EXISTS "Permitir inserção de consumos" ON consumption_records;
DROP POLICY IF EXISTS "Permitir atualização de consumos" ON consumption_records;
DROP POLICY IF EXISTS "Permitir exclusão de consumos" ON consumption_records;

-- Create secure RLS policies that require authentication

-- Customers table policies
CREATE POLICY "Authenticated users can read customers"
  ON customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete customers"
  ON customers FOR DELETE
  TO authenticated
  USING (true);

-- Products table policies
CREATE POLICY "Authenticated users can read products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (true);

-- Consumption records table policies
CREATE POLICY "Authenticated users can read consumption records"
  ON consumption_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert consumption records"
  ON consumption_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update consumption records"
  ON consumption_records FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete consumption records"
  ON consumption_records FOR DELETE
  TO authenticated
  USING (true);