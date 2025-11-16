-- Criar tabela de produtos
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela de clientes
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela de registros de consumo
CREATE TABLE public.consumption_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) NOT NULL,
  consumption_date DATE NOT NULL,
  items JSONB NOT NULL,
  total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
  paid BOOLEAN DEFAULT false,
  payment_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_records ENABLE ROW LEVEL SECURITY;

-- Políticas para produtos (público pode ver, mas vamos adicionar autenticação depois)
CREATE POLICY "Permitir leitura de produtos" ON public.products
  FOR SELECT USING (true);

CREATE POLICY "Permitir inserção de produtos" ON public.products
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de produtos" ON public.products
  FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão de produtos" ON public.products
  FOR DELETE USING (true);

-- Políticas para clientes
CREATE POLICY "Permitir leitura de clientes" ON public.customers
  FOR SELECT USING (true);

CREATE POLICY "Permitir inserção de clientes" ON public.customers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de clientes" ON public.customers
  FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão de clientes" ON public.customers
  FOR DELETE USING (true);

-- Políticas para registros de consumo
CREATE POLICY "Permitir leitura de consumos" ON public.consumption_records
  FOR SELECT USING (true);

CREATE POLICY "Permitir inserção de consumos" ON public.consumption_records
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de consumos" ON public.consumption_records
  FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão de consumos" ON public.consumption_records
  FOR DELETE USING (true);

-- Criar índices para melhor performance
CREATE INDEX idx_consumption_records_customer ON public.consumption_records(customer_id);
CREATE INDEX idx_consumption_records_date ON public.consumption_records(consumption_date);
CREATE INDEX idx_consumption_records_paid ON public.consumption_records(paid);