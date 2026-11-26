-- =============================================================================
-- MIGRATION: 20261126000001_create_save_company_settings_rpc.sql
-- DESCRIPTION: Consolidated Company Settings RPC
-- TARGET: shared.company_settings
--
-- SECTION 1: SECURITY CHECKS AND VALIDATION
--
-- SECTION 2: CORE LOGIC
--   GROUP A: BUSINESS SETTINGS
--   GROUP B: CONTACT AND ADDRESS SETTINGS
--   GROUP C: TAX AND GST REGISTRATIONS
--
-- PUBLIC WRAPPER:
--   public.save_company_settings()
-- =============================================================================


-- =============================================================================
-- MAIN IMPLEMENTATION
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
    v_now       timestamptz := NOW();
    v_clean_gst jsonb;
    v_gst_item  jsonb;
BEGIN

    -- =========================================================================
    -- SECTION 1: SECURITY CHECKS AND VALIDATION
    -- =========================================================================

    -- 1.1 Tenant Access Verification

    IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
        RAISE EXCEPTION
            'Access denied: Invalid or unauthorized company context.';
    END IF;


    -- 1.2 Permission Verification

    IF COALESCE(auth.role(), '') <> 'service_role'
       AND auth.uid() IS NOT NULL
    THEN
        PERFORM shared.check_permission(
            p_company_id,
            'settings_edit'
        );
    END IF;


    -- 1.3 Section Validation

    IF p_section IS NULL
       OR p_section NOT IN ('business', 'contact', 'tax')
    THEN
        RAISE EXCEPTION
            'Invalid section: must be business, contact, or tax.';
    END IF;


    -- 1.4 Payload Validation

    IF p_data IS NULL
       OR jsonb_typeof(p_data) <> 'object'
    THEN
        RAISE EXCEPTION
            'Payload p_data must be a valid JSONB object.';
    END IF;


    -- 1.5 Ensure Company Settings Row Exists

    INSERT INTO shared.company_settings (
        company_id,
        created_at,
        updated_at
    )
    VALUES (
        p_company_id,
        v_now,
        v_now
    )
    ON CONFLICT (company_id) DO NOTHING;


    -- =========================================================================
    -- SECTION 2: CORE LOGIC IMPLEMENTATION
    -- =========================================================================


    -- -------------------------------------------------------------------------
    -- GROUP A: BUSINESS TAB
    -- -------------------------------------------------------------------------

    IF p_section = 'business' THEN

        -- Required Field Validation

        IF NULLIF(
            TRIM(p_data->>'legal_business_name'),
            ''
        ) IS NULL THEN
            RAISE EXCEPTION
                'Legal business name is required.';
        END IF;

        IF NULLIF(
            TRIM(p_data->>'display_name'),
            ''
        ) IS NULL THEN
            RAISE EXCEPTION
                'Display / brand name is required.';
        END IF;


        -- Update shared.company_settings

        UPDATE shared.company_settings
        SET

            legal_business_name =
                TRIM(p_data->>'legal_business_name'),

            display_name =
                TRIM(p_data->>'display_name'),

            business_category =
                CASE
                    WHEN p_data ? 'business_category'
                    THEN COALESCE(
                        NULLIF(TRIM(p_data->>'business_category'), ''),
                        'salon_spa'
                    )
                    ELSE business_category
                END,

            business_description =
                CASE
                    WHEN p_data ? 'business_description'
                    THEN NULLIF(
                        TRIM(p_data->>'business_description'),
                        ''
                    )
                    ELSE business_description
                END,

            website =
                CASE
                    WHEN p_data ? 'website'
                    THEN NULLIF(TRIM(p_data->>'website'), '')
                    ELSE website
                END,

            instagram_url =
                CASE
                    WHEN p_data ? 'instagram_url'
                    THEN NULLIF(TRIM(p_data->>'instagram_url'), '')
                    ELSE instagram_url
                END,

            facebook_url =
                CASE
                    WHEN p_data ? 'facebook_url'
                    THEN NULLIF(TRIM(p_data->>'facebook_url'), '')
                    ELSE facebook_url
                END,

            logo_url =
                CASE
                    WHEN p_data ? 'logo_url'
                    THEN NULLIF(TRIM(p_data->>'logo_url'), '')
                    ELSE logo_url
                END,

            cover_image_url =
                CASE
                    WHEN p_data ? 'cover_image_url'
                    THEN NULLIF(TRIM(p_data->>'cover_image_url'), '')
                    ELSE cover_image_url
                END,

            updated_at = v_now

        WHERE company_id = p_company_id;


        -- Synchronize shared.companies

        UPDATE shared.companies
        SET

            company_name =
                TRIM(p_data->>'legal_business_name'),

            display_name =
                TRIM(p_data->>'display_name'),

            business_category =
                CASE
                    WHEN p_data ? 'business_category'
                    THEN COALESCE(
                        NULLIF(TRIM(p_data->>'business_category'), ''),
                        'salon_spa'
                    )
                    ELSE business_category
                END,

            logo_url =
                CASE
                    WHEN p_data ? 'logo_url'
                    THEN NULLIF(TRIM(p_data->>'logo_url'), '')
                    ELSE logo_url
                END,

            updated_at = v_now

        WHERE company_id = p_company_id;


    -- -------------------------------------------------------------------------
    -- GROUP B: CONTACT AND ADDRESS TAB
    -- -------------------------------------------------------------------------

    ELSIF p_section = 'contact' THEN

        -- Required Field Validation

        IF NULLIF(
            TRIM(COALESCE(
                p_data->>'primary_contact_name',
                p_data->>'contact_person_name'
            )),
            ''
        ) IS NULL THEN
            RAISE EXCEPTION
                'Primary contact person name is required.';
        END IF;

        IF NULLIF(
            TRIM(COALESCE(
                p_data->>'primary_contact_email',
                p_data->>'primary_email',
                p_data->>'email'
            )),
            ''
        ) IS NULL THEN
            RAISE EXCEPTION
                'Primary contact email address is required.';
        END IF;

        IF NULLIF(
            TRIM(COALESCE(
                p_data->>'primary_contact_phone',
                p_data->>'primary_phone',
                p_data->>'phone'
            )),
            ''
        ) IS NULL THEN
            RAISE EXCEPTION
                'Primary contact phone number is required.';
        END IF;


        -- Update shared.company_settings

        UPDATE shared.company_settings
        SET

            primary_contact_name =
                TRIM(COALESCE(
                    p_data->>'primary_contact_name',
                    p_data->>'contact_person_name'
                )),

            primary_contact_designation =
                CASE
                    WHEN p_data ? 'primary_contact_designation'
                      OR p_data ? 'designation'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'primary_contact_designation',
                            p_data->>'designation'
                        )),
                        ''
                    )
                    ELSE primary_contact_designation
                END,

            primary_contact_email =
                TRIM(COALESCE(
                    p_data->>'primary_contact_email',
                    p_data->>'primary_email',
                    p_data->>'email'
                )),

            primary_contact_phone =
                TRIM(COALESCE(
                    p_data->>'primary_contact_phone',
                    p_data->>'primary_phone',
                    p_data->>'phone'
                )),

            alternate_contact_phone =
                CASE
                    WHEN p_data ? 'alternate_contact_phone'
                      OR p_data ? 'alternate_phone'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'alternate_contact_phone',
                            p_data->>'alternate_phone'
                        )),
                        ''
                    )
                    ELSE alternate_contact_phone
                END,

            billing_same_as_primary =
                COALESCE(
                    (
                        COALESCE(
                            p_data->>'billing_same_as_primary',
                            p_data->>'same_as_primary_contact'
                        )
                    )::boolean,
                    billing_same_as_primary,
                    true
                ),

            billing_contact_name =
                CASE
                    WHEN p_data ? 'billing_contact_name'
                    THEN NULLIF(
                        TRIM(p_data->>'billing_contact_name'),
                        ''
                    )
                    ELSE billing_contact_name
                END,

            billing_contact_email =
                CASE
                    WHEN p_data ? 'billing_contact_email'
                      OR p_data ? 'billing_email'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'billing_contact_email',
                            p_data->>'billing_email'
                        )),
                        ''
                    )
                    ELSE billing_contact_email
                END,

            billing_contact_phone =
                CASE
                    WHEN p_data ? 'billing_contact_phone'
                      OR p_data ? 'billing_phone'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'billing_contact_phone',
                            p_data->>'billing_phone'
                        )),
                        ''
                    )
                    ELSE billing_contact_phone
                END,

            registered_address_line1 =
                CASE
                    WHEN p_data ? 'registered_address_line1'
                      OR p_data ? 'address_line_1'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'registered_address_line1',
                            p_data->>'address_line_1'
                        )),
                        ''
                    )
                    ELSE registered_address_line1
                END,

            registered_address_line2 =
                CASE
                    WHEN p_data ? 'registered_address_line2'
                      OR p_data ? 'address_line_2'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'registered_address_line2',
                            p_data->>'address_line_2'
                        )),
                        ''
                    )
                    ELSE registered_address_line2
                END,

            registered_locality =
                CASE
                    WHEN p_data ? 'registered_locality'
                      OR p_data ? 'locality_area'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'registered_locality',
                            p_data->>'locality_area'
                        )),
                        ''
                    )
                    ELSE registered_locality
                END,

            registered_landmark =
                CASE
                    WHEN p_data ? 'registered_landmark'
                      OR p_data ? 'landmark'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'registered_landmark',
                            p_data->>'landmark'
                        )),
                        ''
                    )
                    ELSE registered_landmark
                END,

            registered_city =
                CASE
                    WHEN p_data ? 'registered_city'
                      OR p_data ? 'city'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'registered_city',
                            p_data->>'city'
                        )),
                        ''
                    )
                    ELSE registered_city
                END,

            registered_state =
                CASE
                    WHEN p_data ? 'registered_state'
                      OR p_data ? 'state'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'registered_state',
                            p_data->>'state'
                        )),
                        ''
                    )
                    ELSE registered_state
                END,

            registered_pin_code =
                CASE
                    WHEN p_data ? 'registered_pin_code'
                      OR p_data ? 'pin_code'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'registered_pin_code',
                            p_data->>'pin_code'
                        )),
                        ''
                    )
                    ELSE registered_pin_code
                END,

            registered_country =
                CASE
                    WHEN p_data ? 'registered_country'
                      OR p_data ? 'country'
                    THEN COALESCE(
                        NULLIF(
                            TRIM(COALESCE(
                                p_data->>'registered_country',
                                p_data->>'country'
                            )),
                            ''
                        ),
                        'India'
                    )
                    ELSE registered_country
                END,

            updated_at = v_now

        WHERE company_id = p_company_id;


        -- Synchronize Owner Details in shared.companies

        UPDATE shared.companies
        SET

            owner_name =
                TRIM(COALESCE(
                    p_data->>'primary_contact_name',
                    p_data->>'contact_person_name'
                )),

            owner_email =
                TRIM(COALESCE(
                    p_data->>'primary_contact_email',
                    p_data->>'primary_email',
                    p_data->>'email'
                )),

            owner_phone =
                TRIM(COALESCE(
                    p_data->>'primary_contact_phone',
                    p_data->>'primary_phone',
                    p_data->>'phone'
                )),

            updated_at = v_now

        WHERE company_id = p_company_id;


    -- -------------------------------------------------------------------------
    -- GROUP C: TAX AND GST REGISTRATIONS TAB
    -- -------------------------------------------------------------------------

    ELSIF p_section = 'tax' THEN

        -- GST JSONB Validation

        IF p_data ? 'gst_registrations' THEN

            IF jsonb_typeof(p_data->'gst_registrations') <> 'array' THEN
                RAISE EXCEPTION
                    'gst_registrations must be a JSONB array.';
            END IF;

            v_clean_gst := p_data->'gst_registrations';

            FOR v_gst_item IN
                SELECT value
                FROM jsonb_array_elements(v_clean_gst)
            LOOP

                IF jsonb_typeof(v_gst_item) <> 'object' THEN
                    RAISE EXCEPTION
                        'Each GST registration must be a JSONB object.';
                END IF;

                IF NULLIF(
                    TRIM(v_gst_item->>'gstin'),
                    ''
                ) IS NULL THEN
                    RAISE EXCEPTION
                        'GSTIN is required for every GST registration.';
                END IF;

                IF NULLIF(
                    TRIM(v_gst_item->>'state'),
                    ''
                ) IS NULL THEN
                    RAISE EXCEPTION
                        'State is required for every GST registration.';
                END IF;

            END LOOP;

        END IF;


        -- Update shared.company_settings

        UPDATE shared.company_settings
        SET

            pan_number =
                CASE
                    WHEN p_data ? 'pan_number'
                      OR p_data ? 'pan'
                    THEN NULLIF(
                        UPPER(TRIM(COALESCE(
                            p_data->>'pan_number',
                            p_data->>'pan'
                        ))),
                        ''
                    )
                    ELSE pan_number
                END,

            business_registration_number =
                CASE
                    WHEN p_data ? 'business_registration_number'
                    THEN NULLIF(
                        TRIM(p_data->>'business_registration_number'),
                        ''
                    )
                    ELSE business_registration_number
                END,

            business_registration_type =
                CASE
                    WHEN p_data ? 'business_registration_type'
                      OR p_data ? 'registration_type'
                    THEN NULLIF(
                        TRIM(COALESCE(
                            p_data->>'business_registration_type',
                            p_data->>'registration_type'
                        )),
                        ''
                    )
                    ELSE business_registration_type
                END,

            gst_registrations =
                CASE
                    WHEN p_data ? 'gst_registrations'
                    THEN v_clean_gst
                    ELSE gst_registrations
                END,

            updated_at = v_now

        WHERE company_id = p_company_id;

    END IF;


    -- =========================================================================
    -- SUCCESS RESPONSE
    -- =========================================================================

    RETURN jsonb_build_object(
        'success', true,
        'company_id', p_company_id,
        'section', p_section,
        'updated_at', v_now
    );

END;
$$;


-- =============================================================================
-- PUBLIC SCHEMA WRAPPER
-- =============================================================================

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

    RETURN shared.save_company_settings(
        p_company_id,
        p_section,
        p_data
    );

END;
$$;


-- =============================================================================
-- FUNCTION EXECUTION PERMISSIONS
-- =============================================================================

REVOKE ALL ON FUNCTION shared.save_company_settings(
    uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.save_company_settings(
    uuid, text, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_company_settings(
    uuid, text, jsonb
) TO authenticated, service_role;


-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
