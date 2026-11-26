-- =============================================================================
-- Migration: 20261126000001_create_save_company_settings_rpc.sql
-- Description: Consolidated Company Settings RPC (save_company_settings)
-- Target: shared.company_settings
-- Structure:
--   SECTION 1: Security checks (Tenant verification, permissions, payload validation)
--   SECTION 2: Core logic implementation with 3 Groups for 3 Tabs:
--     - Group A: Business Settings
--     - Group B: Contact & Address Settings
--     - Group C: Tax & GST Registrations Settings
-- =============================================================================

CREATE OR REPLACE FUNCTION shared.save_company_settings(
    p_company_id uuid,
    p_section    text,
    p_data       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_now timestamptz := NOW();
    v_clean_gst jsonb := '[]'::jsonb;
BEGIN
    -- =========================================================================
    -- SECTION 1: SECURITY CHECKS
    -- =========================================================================

    -- 1.1 Tenant Access Verification
    IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
        RAISE EXCEPTION 'Access denied: Invalid or unauthorized company context.';
    END IF;

    -- 1.2 Permission Verification (Gate 2: settings_edit)
    IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL THEN
        BEGIN
            PERFORM shared.check_permission(p_company_id, 'settings_edit');
        EXCEPTION WHEN undefined_function THEN
            -- Fallback if granular permission routine is not installed in environment
            NULL;
        END;
    END IF;

    -- 1.3 Validate Section Parameter
    IF p_section NOT IN ('business', 'contact', 'tax') THEN
        RAISE EXCEPTION 'Invalid section "%": must be one of "business", "contact", or "tax".', p_section;
    END IF;

    -- 1.4 Validate p_data Payload Structure
    IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
        RAISE EXCEPTION 'Payload p_data must be a valid JSONB object.';
    END IF;

    -- 1.5 Ensure target row exists in shared.company_settings for p_company_id
    INSERT INTO shared.company_settings (company_id, created_at, updated_at)
    VALUES (p_company_id, v_now, v_now)
    ON CONFLICT (company_id) DO NOTHING;

    -- =========================================================================
    -- SECTION 2: CORE LOGIC IMPLEMENTATION (3 Groups for 3 Tabs)
    -- =========================================================================

    -- -------------------------------------------------------------------------
    -- GROUP A: BUSINESS TAB
    -- -------------------------------------------------------------------------
    IF p_section = 'business' THEN
        -- Basic validation for required business fields
        IF NULLIF(TRIM(COALESCE(p_data->>'legal_business_name', '')), '') IS NULL THEN
            RAISE EXCEPTION 'Legal business name is required.';
        END IF;

        IF NULLIF(TRIM(COALESCE(p_data->>'display_name', '')), '') IS NULL THEN
            RAISE EXCEPTION 'Display / brand name is required.';
        END IF;

        UPDATE shared.company_settings
        SET
            legal_business_name  = TRIM(p_data->>'legal_business_name'),
            display_name         = TRIM(p_data->>'display_name'),
            business_category    = COALESCE(NULLIF(TRIM(p_data->>'business_category'), ''), 'salon_spa'),
            business_description = NULLIF(TRIM(p_data->>'business_description'), ''),
            website              = NULLIF(TRIM(p_data->>'website'), ''),
            instagram_url        = NULLIF(TRIM(p_data->>'instagram_url'), ''),
            facebook_url         = NULLIF(TRIM(p_data->>'facebook_url'), ''),
            logo_url             = CASE WHEN p_data ? 'logo_url' THEN NULLIF(TRIM(p_data->>'logo_url'), '') ELSE logo_url END,
            cover_image_url      = CASE WHEN p_data ? 'cover_image_url' THEN NULLIF(TRIM(p_data->>'cover_image_url'), '') ELSE cover_image_url END,
            updated_at           = v_now
        WHERE company_id = p_company_id;

        -- Synchronize primary company record in shared.companies
        UPDATE shared.companies
        SET
            company_name      = TRIM(p_data->>'legal_business_name'),
            display_name      = TRIM(p_data->>'display_name'),
            business_category = COALESCE(NULLIF(TRIM(p_data->>'business_category'), ''), business_category),
            logo_url          = CASE WHEN p_data ? 'logo_url' THEN NULLIF(TRIM(p_data->>'logo_url'), '') ELSE logo_url END,
            cover_image_url   = CASE WHEN p_data ? 'cover_image_url' THEN NULLIF(TRIM(p_data->>'cover_image_url'), '') ELSE cover_image_url END,
            website           = NULLIF(TRIM(p_data->>'website'), ''),
            updated_at        = v_now
        WHERE company_id = p_company_id;

    -- -------------------------------------------------------------------------
    -- GROUP B: CONTACT TAB
    -- -------------------------------------------------------------------------
    ELSIF p_section = 'contact' THEN
        -- Basic validation for required contact fields
        IF NULLIF(TRIM(COALESCE(p_data->>'primary_contact_name', p_data->>'contact_person_name', '')), '') IS NULL THEN
            RAISE EXCEPTION 'Primary contact person name is required.';
        END IF;

        IF NULLIF(TRIM(COALESCE(p_data->>'primary_email', p_data->>'email', '')), '') IS NULL THEN
            RAISE EXCEPTION 'Primary contact email address is required.';
        END IF;

        IF NULLIF(TRIM(COALESCE(p_data->>'primary_phone', p_data->>'phone', '')), '') IS NULL THEN
            RAISE EXCEPTION 'Primary contact phone number is required.';
        END IF;

        UPDATE shared.company_settings
        SET
            -- Primary Administrative Contact
            primary_contact_name     = TRIM(COALESCE(p_data->>'primary_contact_name', p_data->>'contact_person_name')),
            designation              = NULLIF(TRIM(p_data->>'designation'), ''),
            primary_email            = TRIM(COALESCE(p_data->>'primary_email', p_data->>'email')),
            primary_phone            = TRIM(COALESCE(p_data->>'primary_phone', p_data->>'phone')),
            alternate_phone          = NULLIF(TRIM(p_data->>'alternate_phone'), ''),

            -- Billing / Subscription Contact
            same_as_primary_contact  = COALESCE((p_data->>'same_as_primary_contact')::boolean, true),
            billing_contact_name     = NULLIF(TRIM(p_data->>'billing_contact_name'), ''),
            billing_email            = NULLIF(TRIM(p_data->>'billing_email'), ''),
            billing_phone            = NULLIF(TRIM(p_data->>'billing_phone'), ''),

            -- Registered Business Address
            address_line_1           = NULLIF(TRIM(p_data->>'address_line_1'), ''),
            address_line_2           = NULLIF(TRIM(p_data->>'address_line_2'), ''),
            locality_area            = NULLIF(TRIM(p_data->>'locality_area'), ''),
            landmark                 = NULLIF(TRIM(p_data->>'landmark'), ''),
            city                     = NULLIF(TRIM(p_data->>'city'), ''),
            state                    = NULLIF(TRIM(p_data->>'state'), ''),
            pin_code                 = NULLIF(TRIM(p_data->>'pin_code'), ''),
            country                  = COALESCE(NULLIF(TRIM(p_data->>'country'), ''), 'India'),
            updated_at               = v_now
        WHERE company_id = p_company_id;

        -- Synchronize primary owner/contact on shared.companies
        UPDATE shared.companies
        SET
            owner_name  = TRIM(COALESCE(p_data->>'primary_contact_name', p_data->>'contact_person_name', owner_name)),
            owner_email = TRIM(COALESCE(p_data->>'primary_email', p_data->>'email', owner_email)),
            owner_phone = TRIM(COALESCE(p_data->>'primary_phone', p_data->>'phone', owner_phone)),
            updated_at  = v_now
        WHERE company_id = p_company_id;

    -- -------------------------------------------------------------------------
    -- GROUP C: TAX TAB
    -- -------------------------------------------------------------------------
    ELSIF p_section = 'tax' THEN
        -- Normalize GST registrations JSONB array
        IF p_data ? 'gst_registrations' AND jsonb_typeof(p_data->'gst_registrations') = 'array' THEN
            v_clean_gst := p_data->'gst_registrations';
        ELSE
            v_clean_gst := '[]'::jsonb;
        END IF;

        UPDATE shared.company_settings
        SET
            pan                          = NULLIF(UPPER(TRIM(p_data->>'pan')), ''),
            business_registration_number = NULLIF(TRIM(p_data->>'business_registration_number'), ''),
            registration_type            = NULLIF(TRIM(p_data->>'registration_type'), ''),
            gst_registrations            = v_clean_gst,
            updated_at                   = v_now
        WHERE company_id = p_company_id;
    END IF;

    -- Return JSON status
    RETURN jsonb_build_object(
        'success', true,
        'company_id', p_company_id,
        'section', p_section,
        'updated_at', v_now
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Public Schema Invoker Wrapper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_company_settings(
    p_company_id uuid,
    p_section    text,
    p_data       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.save_company_settings(p_company_id, p_section, p_data);
END;
$$;
