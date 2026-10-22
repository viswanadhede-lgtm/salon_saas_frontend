-- ============================================================================
-- RPC FUNCTION: public.save_contact_settings
-- Purpose: Atomically upserts all contact and address details into
--          company_contacts and syncs owner contact fields into companies.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_contact_settings(
    p_company_id uuid,
    p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_at          timestamptz := NOW();
    v_primary_phone       text;
    v_whatsapp_number     text;
    v_email               text;
    v_alternate_phone     text;
    v_support_phone       text;
    v_support_email       text;
    v_address_line_1      text;
    v_address_line_2      text;
    v_locality_area       text;
    v_landmark            text;
    v_city                text;
    v_district            text;
    v_state               text;
    v_pin_code            text;
    v_country             text;
    v_google_maps_url     text;
    v_latitude            numeric;
    v_longitude           numeric;
    v_contact_person_name  text;
    v_contact_person_phone text;
    v_contact_person_email text;
BEGIN
    -- 1. Validate required company_id
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'company_id is required'
        );
    END IF;

    -- 2. Extract values from JSON payload
    v_primary_phone        := NULLIF(TRIM(p_data->>'primary_phone'), '');
    v_whatsapp_number      := NULLIF(TRIM(p_data->>'whatsapp_number'), '');
    v_email                := NULLIF(TRIM(p_data->>'email'), '');
    v_alternate_phone      := NULLIF(TRIM(p_data->>'alternate_phone'), '');
    v_support_phone        := NULLIF(TRIM(p_data->>'support_phone'), '');
    v_support_email        := NULLIF(TRIM(p_data->>'support_email'), '');
    v_address_line_1       := NULLIF(TRIM(p_data->>'address_line_1'), '');
    v_address_line_2       := NULLIF(TRIM(p_data->>'address_line_2'), '');
    v_locality_area        := NULLIF(TRIM(p_data->>'locality_area'), '');
    v_landmark             := NULLIF(TRIM(p_data->>'landmark'), '');
    v_city                 := NULLIF(TRIM(p_data->>'city'), '');
    v_district             := NULLIF(TRIM(p_data->>'district'), '');
    v_state                := NULLIF(TRIM(p_data->>'state'), '');
    v_pin_code             := NULLIF(TRIM(p_data->>'pin_code'), '');
    v_country              := NULLIF(TRIM(p_data->>'country'), '');
    v_google_maps_url      := NULLIF(TRIM(p_data->>'google_maps_url'), '');
    v_latitude             := CASE WHEN p_data->>'latitude' IS NOT NULL AND p_data->>'latitude' != '' 
                                   THEN (p_data->>'latitude')::numeric ELSE NULL END;
    v_longitude            := CASE WHEN p_data->>'longitude' IS NOT NULL AND p_data->>'longitude' != '' 
                                   THEN (p_data->>'longitude')::numeric ELSE NULL END;
    v_contact_person_name  := NULLIF(TRIM(p_data->>'contact_person_name'), '');
    v_contact_person_phone := NULLIF(TRIM(p_data->>'contact_person_phone'), '');
    v_contact_person_email := NULLIF(TRIM(p_data->>'contact_person_email'), '');

    -- 3. Upsert into company_contacts table
    UPDATE public.company_contacts
    SET
        primary_phone        = v_primary_phone,
        whatsapp_number      = v_whatsapp_number,
        email                = v_email,
        alternate_phone      = v_alternate_phone,
        support_phone        = v_support_phone,
        support_email        = v_support_email,
        address_line_1       = v_address_line_1,
        address_line_2       = v_address_line_2,
        locality_area        = v_locality_area,
        landmark             = v_landmark,
        city                 = v_city,
        district             = v_district,
        state                = v_state,
        pin_code             = v_pin_code,
        country              = v_country,
        google_maps_url      = v_google_maps_url,
        latitude             = v_latitude,
        longitude            = v_longitude,
        contact_person_name  = v_contact_person_name,
        contact_person_phone = v_contact_person_phone,
        contact_person_email = v_contact_person_email,
        updated_at           = v_updated_at
    WHERE company_id = p_company_id;

    IF NOT FOUND THEN
        INSERT INTO public.company_contacts (
            company_id,
            primary_phone,
            whatsapp_number,
            email,
            alternate_phone,
            support_phone,
            support_email,
            address_line_1,
            address_line_2,
            locality_area,
            landmark,
            city,
            district,
            state,
            pin_code,
            country,
            google_maps_url,
            latitude,
            longitude,
            contact_person_name,
            contact_person_phone,
            contact_person_email,
            created_at,
            updated_at
        ) VALUES (
            p_company_id,
            v_primary_phone,
            v_whatsapp_number,
            v_email,
            v_alternate_phone,
            v_support_phone,
            v_support_email,
            v_address_line_1,
            v_address_line_2,
            v_locality_area,
            v_landmark,
            v_city,
            v_district,
            v_state,
            v_pin_code,
            v_country,
            v_google_maps_url,
            v_latitude,
            v_longitude,
            v_contact_person_name,
            v_contact_person_phone,
            v_contact_person_email,
            v_updated_at,
            v_updated_at
        );
    END IF;

    -- 4. Atomically sync owner contact fields into companies table
    UPDATE public.companies
    SET
        owner_name  = COALESCE(v_contact_person_name, owner_name),
        owner_email = COALESCE(v_email, owner_email),
        owner_phone = COALESCE(v_primary_phone, owner_phone),
        updated_at  = v_updated_at
    WHERE company_id = p_company_id;

    RETURN jsonb_build_object(
        'success',    true,
        'message',    'Contact settings saved and synchronized successfully',
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
GRANT EXECUTE ON FUNCTION public.save_contact_settings(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_contact_settings(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_contact_settings(uuid, jsonb) TO anon;
