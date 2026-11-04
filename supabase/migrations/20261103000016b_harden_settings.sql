-- =============================================================================
-- Migration 20261103000016b: Harden Module 11 (Part B - Settings)
-- Procedures:
--   app.save_billing_information_atomic / public.save_billing_information_atomic (and public.save_billing_information)
--   app.save_invoice_settings_atomic / public.save_invoice_settings_atomic
--   app.save_notification_settings_atomic / public.save_notification_settings_atomic
--   app.save_business_payment_settings_atomic / public.save_business_payment_settings_atomic
--   app.save_company_tax_settings_atomic / public.save_company_tax_settings_atomic
--   app.save_business_settings / public.save_business_settings (hardened with tenant verification)
--   app.save_contact_settings / public.save_contact_settings (hardened with tenant verification)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5. save_billing_information_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.save_billing_information_atomic(
  p_company_id uuid,
  p_data       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id      uuid := gen_random_uuid();
  v_now         timestamptz := NOW();
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company context.';
  END IF;

  SELECT id INTO v_existing_id
  FROM shared.company_billing_information
  WHERE company_id = p_company_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE shared.company_billing_information SET
      legal_business_name = COALESCE(NULLIF(TRIM(p_data->>'legal_business_name'), ''), legal_business_name),
      gstin               = COALESCE(NULLIF(TRIM(p_data->>'gstin'), ''), gstin),
      pan                 = COALESCE(NULLIF(TRIM(p_data->>'pan'), ''), pan),
      billing_email       = COALESCE(NULLIF(TRIM(p_data->>'billing_email'), ''), billing_email),
      billing_phone       = COALESCE(NULLIF(TRIM(p_data->>'billing_phone'), ''), billing_phone),
      address_line_1      = COALESCE(NULLIF(TRIM(p_data->>'address_line_1'), ''), address_line_1),
      address_line_2      = COALESCE(NULLIF(TRIM(p_data->>'address_line_2'), ''), address_line_2),
      city                = COALESCE(NULLIF(TRIM(p_data->>'city'), ''), city),
      district            = COALESCE(NULLIF(TRIM(p_data->>'district'), ''), district),
      state               = COALESCE(NULLIF(TRIM(p_data->>'state'), ''), state),
      pin_code            = COALESCE(NULLIF(TRIM(p_data->>'pin_code'), ''), pin_code),
      country             = COALESCE(NULLIF(TRIM(p_data->>'country'), ''), country, 'India'),
      updated_at          = v_now
    WHERE id = v_existing_id;

    RETURN jsonb_build_object('success', true, 'id', v_existing_id);
  ELSE
    INSERT INTO shared.company_billing_information (
      id, company_id, legal_business_name, gstin, pan,
      billing_email, billing_phone, address_line_1, address_line_2,
      city, district, state, pin_code, country,
      created_at, updated_at
    ) VALUES (
      v_new_id, p_company_id,
      NULLIF(TRIM(p_data->>'legal_business_name'), ''),
      NULLIF(TRIM(p_data->>'gstin'), ''),
      NULLIF(TRIM(p_data->>'pan'), ''),
      NULLIF(TRIM(p_data->>'billing_email'), ''),
      NULLIF(TRIM(p_data->>'billing_phone'), ''),
      NULLIF(TRIM(p_data->>'address_line_1'), ''),
      NULLIF(TRIM(p_data->>'address_line_2'), ''),
      NULLIF(TRIM(p_data->>'city'), ''),
      NULLIF(TRIM(p_data->>'district'), ''),
      NULLIF(TRIM(p_data->>'state'), ''),
      NULLIF(TRIM(p_data->>'pin_code'), ''),
      COALESCE(NULLIF(TRIM(p_data->>'country'), ''), 'India'),
      v_now, v_now
    );

    RETURN jsonb_build_object('success', true, 'id', v_new_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_billing_information_atomic(
  p_company_id uuid,
  p_data       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.save_billing_information_atomic(p_company_id, p_data);
END;
$$;

-- Alias for frontend compatibility with existing RPC calls
CREATE OR REPLACE FUNCTION public.save_billing_information(
  p_company_id uuid,
  p_data       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.save_billing_information_atomic(p_company_id, p_data);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. save_invoice_settings_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.save_invoice_settings_atomic(
  p_company_id         uuid,
  p_branch_id          uuid,
  p_common_invoice     jsonb DEFAULT NULL,
  p_booking_invoice    jsonb DEFAULT NULL,
  p_pos_invoice        jsonb DEFAULT NULL,
  p_membership_invoice jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_now         timestamptz := NOW();
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  SELECT id INTO v_existing_id
  FROM app.invoice_settings
  WHERE company_id = p_company_id AND branch_id = p_branch_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE app.invoice_settings SET
      common_invoice     = COALESCE(p_common_invoice, common_invoice),
      booking_invoice    = COALESCE(p_booking_invoice, booking_invoice),
      pos_invoice        = COALESCE(p_pos_invoice, pos_invoice),
      membership_invoice = COALESCE(p_membership_invoice, membership_invoice),
      updated_at         = v_now
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO app.invoice_settings (
      id, company_id, branch_id,
      common_invoice, booking_invoice, pos_invoice, membership_invoice,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_company_id, p_branch_id,
      COALESCE(p_common_invoice, '{}'::jsonb),
      COALESCE(p_booking_invoice, '{}'::jsonb),
      COALESCE(p_pos_invoice, '{}'::jsonb),
      COALESCE(p_membership_invoice, '{}'::jsonb),
      v_now, v_now
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_invoice_settings_atomic(
  p_company_id         uuid,
  p_branch_id          uuid,
  p_common_invoice     jsonb DEFAULT NULL,
  p_booking_invoice    jsonb DEFAULT NULL,
  p_pos_invoice        jsonb DEFAULT NULL,
  p_membership_invoice jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.save_invoice_settings_atomic(
    p_company_id, p_branch_id, p_common_invoice,
    p_booking_invoice, p_pos_invoice, p_membership_invoice
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. save_notification_settings_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.save_notification_settings_atomic(
  p_company_id               uuid,
  p_branch_id                uuid,
  p_system_notifications     jsonb DEFAULT NULL,
  p_customer_notifications   jsonb DEFAULT NULL,
  p_marketing_notifications  jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_now         timestamptz := NOW();
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  SELECT id INTO v_existing_id
  FROM app.notification_settings
  WHERE company_id = p_company_id AND branch_id = p_branch_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE app.notification_settings SET
      system_notifications    = COALESCE(p_system_notifications, system_notifications),
      customer_notifications  = COALESCE(p_customer_notifications, customer_notifications),
      marketing_notifications = COALESCE(p_marketing_notifications, marketing_notifications),
      updated_at              = v_now
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO app.notification_settings (
      id, company_id, branch_id,
      system_notifications, customer_notifications, marketing_notifications,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_company_id, p_branch_id,
      COALESCE(p_system_notifications, '{}'::jsonb),
      COALESCE(p_customer_notifications, '{}'::jsonb),
      COALESCE(p_marketing_notifications, '{}'::jsonb),
      v_now, v_now
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_notification_settings_atomic(
  p_company_id               uuid,
  p_branch_id                uuid,
  p_system_notifications     jsonb DEFAULT NULL,
  p_customer_notifications   jsonb DEFAULT NULL,
  p_marketing_notifications  jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.save_notification_settings_atomic(
    p_company_id, p_branch_id, p_system_notifications,
    p_customer_notifications, p_marketing_notifications
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. save_business_payment_settings_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.save_business_payment_settings_atomic(
  p_company_id             uuid,
  p_branch_id              uuid,
  p_cash_enabled           boolean DEFAULT true,
  p_upi_enabled            boolean DEFAULT true,
  p_cards_enabled          boolean DEFAULT true,
  p_online_payment_enabled boolean DEFAULT false,
  p_upi_id                 text    DEFAULT NULL,
  p_upi_qr_code_url        text    DEFAULT NULL,
  p_payment_note           text    DEFAULT NULL,
  p_default_payment_method text    DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_now         timestamptz := NOW();
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, p_branch_id) THEN
    RAISE EXCEPTION 'Access denied: Invalid company or branch context.';
  END IF;

  -- Ensure at least one payment method is enabled
  IF NOT (COALESCE(p_cash_enabled, false) OR COALESCE(p_upi_enabled, false) OR
          COALESCE(p_cards_enabled, false) OR COALESCE(p_online_payment_enabled, false)) THEN
    RAISE EXCEPTION 'At least one payment method must be enabled.';
  END IF;

  SELECT id INTO v_existing_id
  FROM app.business_payment_settings
  WHERE company_id = p_company_id AND branch_id = p_branch_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE app.business_payment_settings SET
      cash_enabled           = COALESCE(p_cash_enabled, cash_enabled),
      upi_enabled            = COALESCE(p_upi_enabled, upi_enabled),
      cards_enabled          = COALESCE(p_cards_enabled, cards_enabled),
      online_payment_enabled = COALESCE(p_online_payment_enabled, online_payment_enabled),
      upi_id                 = p_upi_id,
      upi_qr_code_url        = p_upi_qr_code_url,
      payment_note           = p_payment_note,
      default_payment_method = COALESCE(p_default_payment_method, default_payment_method),
      updated_at             = v_now
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO app.business_payment_settings (
      id, company_id, branch_id,
      cash_enabled, upi_enabled, cards_enabled, online_payment_enabled,
      upi_id, upi_qr_code_url, payment_note, default_payment_method,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_company_id, p_branch_id,
      COALESCE(p_cash_enabled, true),
      COALESCE(p_upi_enabled, true),
      COALESCE(p_cards_enabled, true),
      COALESCE(p_online_payment_enabled, false),
      p_upi_id, p_upi_qr_code_url, p_payment_note,
      COALESCE(p_default_payment_method, 'cash'),
      v_now, v_now
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_business_payment_settings_atomic(
  p_company_id             uuid,
  p_branch_id              uuid,
  p_cash_enabled           boolean DEFAULT true,
  p_upi_enabled            boolean DEFAULT true,
  p_cards_enabled          boolean DEFAULT true,
  p_online_payment_enabled boolean DEFAULT false,
  p_upi_id                 text    DEFAULT NULL,
  p_upi_qr_code_url        text    DEFAULT NULL,
  p_payment_note           text    DEFAULT NULL,
  p_default_payment_method text    DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.save_business_payment_settings_atomic(
    p_company_id, p_branch_id, p_cash_enabled, p_upi_enabled,
    p_cards_enabled, p_online_payment_enabled, p_upi_id,
    p_upi_qr_code_url, p_payment_note, p_default_payment_method
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. save_company_tax_settings_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.save_company_tax_settings_atomic(
  p_company_id                   uuid,
  p_business_registration_number text    DEFAULT NULL,
  p_gstin                        text    DEFAULT NULL,
  p_pan                          text    DEFAULT NULL,
  p_gst_registration_state       text    DEFAULT NULL,
  p_default_tax_rate             numeric DEFAULT NULL,
  p_tax_label                    text    DEFAULT 'GST',
  p_prices_include_tax           boolean DEFAULT false,
  p_show_tax_breakdown           boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_now         timestamptz := NOW();
BEGIN
  IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
    RAISE EXCEPTION 'Access denied: Invalid company context.';
  END IF;

  IF p_default_tax_rate IS NOT NULL AND p_default_tax_rate < 0 THEN
    RAISE EXCEPTION 'Tax rate cannot be negative.';
  END IF;

  SELECT id INTO v_existing_id
  FROM shared.company_tax_settings
  WHERE company_id = p_company_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE shared.company_tax_settings SET
      business_registration_number = p_business_registration_number,
      gstin                        = p_gstin,
      pan                          = p_pan,
      gst_registration_state       = p_gst_registration_state,
      default_tax_rate             = p_default_tax_rate,
      tax_label                    = COALESCE(p_tax_label, tax_label, 'GST'),
      prices_include_tax           = COALESCE(p_prices_include_tax, prices_include_tax, false),
      show_tax_breakdown           = COALESCE(p_show_tax_breakdown, show_tax_breakdown, true),
      updated_at                   = v_now
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO shared.company_tax_settings (
      id, company_id, business_registration_number, gstin, pan,
      gst_registration_state, default_tax_rate, tax_label,
      prices_include_tax, show_tax_breakdown, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_company_id, p_business_registration_number,
      p_gstin, p_pan, p_gst_registration_state, p_default_tax_rate,
      COALESCE(p_tax_label, 'GST'),
      COALESCE(p_prices_include_tax, false),
      COALESCE(p_show_tax_breakdown, true),
      v_now, v_now
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_company_tax_settings_atomic(
  p_company_id                   uuid,
  p_business_registration_number text    DEFAULT NULL,
  p_gstin                        text    DEFAULT NULL,
  p_pan                          text    DEFAULT NULL,
  p_gst_registration_state       text    DEFAULT NULL,
  p_default_tax_rate             numeric DEFAULT NULL,
  p_tax_label                    text    DEFAULT 'GST',
  p_prices_include_tax           boolean DEFAULT false,
  p_show_tax_breakdown           boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
  RETURN app.save_company_tax_settings_atomic(
    p_company_id, p_business_registration_number, p_gstin, p_pan,
    p_gst_registration_state, p_default_tax_rate, p_tax_label,
    p_prices_include_tax, p_show_tax_breakdown
  );
END;
$$;

