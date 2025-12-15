-- Create validation trigger function for consumption_records items JSONB
CREATE OR REPLACE FUNCTION public.validate_consumption_items()
RETURNS TRIGGER AS $$
DECLARE
  item jsonb;
BEGIN
  -- Validate items is an array
  IF jsonb_typeof(NEW.items) != 'array' THEN
    RAISE EXCEPTION 'items must be a JSON array';
  END IF;
  
  -- Validate each item in the array
  FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
  LOOP
    -- Check required fields exist
    IF NOT (item ? 'product_id' AND item ? 'quantity' AND item ? 'unit_price') THEN
      RAISE EXCEPTION 'Each item must have product_id, quantity, and unit_price';
    END IF;
    
    -- Validate quantity is positive and within reasonable range
    IF (item->>'quantity')::numeric <= 0 OR (item->>'quantity')::numeric > 1000 THEN
      RAISE EXCEPTION 'quantity must be between 1 and 1000';
    END IF;
    
    -- Validate unit_price is positive and within reasonable range
    IF (item->>'unit_price')::numeric <= 0 OR (item->>'unit_price')::numeric > 999999 THEN
      RAISE EXCEPTION 'unit_price must be between 0.01 and 999999';
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for INSERT and UPDATE
DROP TRIGGER IF EXISTS validate_consumption_items_trigger ON public.consumption_records;
CREATE TRIGGER validate_consumption_items_trigger
BEFORE INSERT OR UPDATE ON public.consumption_records
FOR EACH ROW
EXECUTE FUNCTION public.validate_consumption_items();