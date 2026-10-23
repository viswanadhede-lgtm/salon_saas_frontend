-- =============================================================================
-- RPC FUNCTION: public.save_billing_information
-- Purpose: Atomically upserts company billing details in company_billing_information
--          and synchronizes GSTIN/PAN with company_tax_settings and legal name with companies.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_billing_information(
    p_company_id uuid,
    p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_at          timestamptz := NOW();
    v_id                  uuid;
    v_legal_name          text;
    v_gstin               text;
    v_pan                 text;
    v_billing_email       text;
    v_billing_phone       text;
    v_address_line_1      text;
    v_address_line_2      text;
    v_city                text;
    v_district            text;
    v_state               text;
    v_pin_code            text;
    v_country             text;
BEGIN
    -- 1. Validate required company_id
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'company_id is required'
        );
    END IF;

    -- 2. Extract values from JSON payload
    v_legal_name     := NULLIF(TRIM(p_data->>'legal_business_name'), '');
    v_gstin          := NULLIF(UPPER(TRIM(p_data->>'gstin')), '');
    v_pan            := NULLIF(UPPER(TRIM(p_data->>'pan')), '');
    v_billing_email  := NULLIF(TRIM(p_data->>'billing_email'), '');
    v_billing_phone  := NULLIF(TRIM(p_data->>'billing_phone'), '');
    v_address_line_1 := NULLIF(TRIM(p_data->>'address_line_1'), '');
    v_address_line_2 := NULLIF(TRIM(p_data->>'address_line_2'), '');
    v_city           := NULLIF(TRIM(p_data->>'city'), '');
    v_district       := NULLIF(TRIM(p_data->>'district'), '');
    v_state          := NULLIF(TRIM(p_data->>'state'), '');
    v_pin_code       := NULLIF(TRIM(p_data->>'pin_code'), '');
    v_country        := COALESCE(NULLIF(TRIM(p_data->>'country'), ''), 'India');

    -- Validate required billing fields
    IF v_legal_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Legal business name is required');
    END IF;
    IF v_billing_email IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Billing email is required');
    END IF;
    IF v_address_line_1 IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Address Line 1 is required');
    END IF;
    IF v_city IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'City is required');
    END IF;
    IF v_state IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'State is required');
    END IF;
    IF v_pin_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'PIN code is required');
    END IF;

    -- 3. Upsert into company_billing_information table
    SELECT id INTO v_id
    FROM public.company_billing_information
    WHERE company_id = p_company_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        UPDATE public.company_billing_information
        SET
            legal_business_name = v_legal_name,
            gstin               = v_gstin,
            pan                 = v_pan,
            billing_email       = v_billing_email,
            billing_phone       = v_billing_phone,
            address_line_1      = v_address_line_1,
            address_line_2      = v_address_line_2,
            city                = v_city,
            district            = v_district,
            state               = v_state,
            pin_code            = v_pin_code,
            country             = v_country,
            updated_at          = v_updated_at
        WHERE id = v_id;
    ELSE
        INSERT INTO public.company_billing_information (
            company_id,
            legal_business_name,
            gstin,
            pan,
            billing_email,
            billing_phone,
            address_line_1,
            address_line_2,
            city,
            district,
            state,
            pin_code,
            country,
            created_at,
            updated_at
        ) VALUES (
            p_company_id,
            v_legal_name,
            v_gstin,
            v_pan,
            v_billing_email,
            v_billing_phone,
            v_address_line_1,
            v_address_line_2,
            v_city,
            v_district,
            v_state,
            v_pin_code,
            v_country,
            v_updated_at,
            v_updated_at
        )
        RETURNING id INTO v_id;
    END IF;

    -- 4. Atomically synchronize GSTIN & PAN with company_tax_settings table
    IF v_gstin IS NOT NULL OR v_pan IS NOT NULL THEN
        UPDATE public.company_tax_settings
        SET
            gstin                  = COALESCE(v_gstin, gstin),
            pan                    = COALESCE(v_pan, pan),
            gst_registration_state = COALESCE(gst_registration_state, v_state),
            updated_at             = v_updated_at
        WHERE company_id = p_company_id;

        IF NOT FOUND THEN
            INSERT INTO public.company_tax_settings (
                company_id,
                gstin,
                pan,
                gst_registration_state,
                updated_at
            ) VALUES (
                p_company_id,
                v_gstin,
                v_pan,
                v_state,
                v_updated_at
            );
        END IF;
    END IF;

    -- 5. Atomically synchronize legal company name with companies table
    UPDATE public.companies
    SET
        company_name = v_legal_name,
        updated_at   = v_updated_at
    WHERE company_id = p_company_id;

    RETURN jsonb_build_object(
        'success',    true,
        'message',    'Billing information saved and synchronized successfully',
        'id',         v_id,
        'company_id', p_company_id,
        'updated_at', v_updated_at
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', SQLERRM,
        'detail',  SQLSTATE
    );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.save_billing_information(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_billing_information(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_billing_information(uuid, jsonb) TO anon;
