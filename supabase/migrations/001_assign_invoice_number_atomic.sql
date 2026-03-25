-- Migration: atomic invoice number assignment
-- Replaces the count-then-write pattern in Python with a single transactional function.
-- Uses pg_advisory_xact_lock to serialize concurrent calls for the same user+month.

CREATE OR REPLACE FUNCTION assign_invoice_number_atomic(
  p_invoice_id uuid,
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_count  int;
  v_number text;
BEGIN
  v_prefix := to_char(now(), 'YYYY-MM');

  -- Serialize all calls for this user+month using a session-level advisory lock.
  -- Two int4 args (one per dimension) reduces hash collision risk vs a single int8.
  -- Lock is released automatically at end of transaction.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(v_prefix));

  SELECT COUNT(*) + 1 INTO v_count
  FROM invoices
  WHERE user_id   = p_user_id
    AND status    = 'confirmed'
    AND invoice_number LIKE v_prefix || '-%';

  v_number := v_prefix || '-' || LPAD(v_count::text, 3, '0');

  UPDATE invoices
  SET invoice_number = v_number
  WHERE id = p_invoice_id;

  RETURN v_number;
END;
$$;
