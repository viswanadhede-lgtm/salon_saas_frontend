-- ============================================================================
-- RPC FUNCTION: public.save_business_settings
-- Purpose: Atomically upserts company business settings in company_settings 
--          and synchronizes core fields with the companies table in one transaction.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_business_settings(
    p_company_id uuid,
    p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_at           timestamptz := NOW();
    v_legal_name           text;
    v_display_name         text;
    v_logo_url             text;
    v_cover_image_url      text;
    v_business_category    text;
    v_business_structure   text;
    v_business_description text;
    v_website              text;
    v_google_url           text;
    v_instagram_url        text;
    v_facebook_url         text;
BEGIN
    -- 1. Validate required company_id
    IF p_company_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'company_id is required'
        );
    END IF;

    -- 2. Extract values from JSON payload
    v_legal_name           := NULLIF(TRIM(p_data->>'legal_business_name'), '');
    v_display_name         := NULLIF(TRIM(p_data->>'display_name'), '');
    v_logo_url             := p_data->>'logo_url';
    v_cover_image_url      := p_data->>'cover_image_url';
    v_business_category    := p_data->>'business_category';
    v_business_structure   := p_data->>'business_structure';
    v_business_description := p_data->>'business_description';
    v_website              := p_data->>'website';
    v_google_url           := p_data->>'google_business_profile_url';
    v_instagram_url        := p_data->>'instagram_url';
    v_facebook_url         := p_data->>'facebook_url';

    -- Validate business name fields
    IF v_legal_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'legal_business_name is required'
        );
    END IF;

    IF v_display_name IS NULL THEN
        v_display_name := v_legal_name;
    END IF;

    -- 3. Upsert into company_settings table
    UPDATE public.company_settings
    SET
        legal_business_name         = v_legal_name,
        display_name                = v_display_name,
        logo_url                    = v_logo_url,
        cover_image_url             = v_cover_image_url,
        business_category           = v_business_category,
        business_structure          = v_business_structure,
        business_description        = v_business_description,
        website                     = v_website,
        google_business_profile_url = v_google_url,
        instagram_url               = v_instagram_url,
        facebook_url                = v_facebook_url,
        updated_at                  = v_updated_at
    WHERE company_id = p_company_id;

    IF NOT FOUND THEN
        INSERT INTO public.company_settings (
            company_id,
            legal_business_name,
            display_name,
            logo_url,
            cover_image_url,
            business_category,
            business_structure,
            business_description,
            website,
            google_business_profile_url,
            instagram_url,
            facebook_url,
            created_at,
            updated_at
        ) VALUES (
            p_company_id,
            v_legal_name,
            v_display_name,
            v_logo_url,
            v_cover_image_url,
            v_business_category,
            v_business_structure,
            v_business_description,
            v_website,
            v_google_url,
            v_instagram_url,
            v_facebook_url,
            v_updated_at,
            v_updated_at
        );
    END IF;

    -- 4. Atomically sync branding with companies table
    UPDATE public.companies
    SET
        company_name = v_legal_name,
        display_name = v_display_name,
        logo_url     = v_logo_url,
        updated_at   = v_updated_at
    WHERE company_id = p_company_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Business settings saved and synchronized successfully',
        'company_id', p_company_id,
        'updated_at', v_updated_at
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.save_business_settings(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_business_settings(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_business_settings(uuid, jsonb) TO anon;
