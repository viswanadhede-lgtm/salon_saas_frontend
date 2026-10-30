-- ============================================================================
-- RPC FUNCTION: public.onboard_company_workspace
-- Purpose: Atomically provisions an entire tenant workspace during onboarding.
-- Tables written: companies, branches, company_settings, company_contacts,
--                 roles, role_permissions, users, profiles, usage_counters.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.onboard_company_workspace(
    p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- IDs & Timestamps
    v_company_id           uuid := gen_random_uuid();
    v_branch_id            uuid := gen_random_uuid();
    v_owner_role_id        uuid := gen_random_uuid();
    v_manager_role_id      uuid := gen_random_uuid();
    v_reception_role_id    uuid := gen_random_uuid();
    v_staff_role_id        uuid := gen_random_uuid();
    v_profile_id           uuid := gen_random_uuid();
    v_user_id              uuid;
    v_now                  timestamptz := NOW();

    -- Extracted User Fields
    v_full_name            text;
    v_first_name           text;
    v_last_name            text;
    v_email                text;
    v_phone                text;
    v_password_hash        text;

    -- Extracted Company Fields
    v_company_name         text;
    v_business_category    text;
    v_business_structure   text;
    v_business_phone       text;
    v_plan_id              uuid;
    v_plan_name            text;

    -- Extracted Branch Fields
    v_branch_name          text;
    v_branch_phone         text;
    v_branch_address       text;
    v_city                 text;
    v_state                text;
    v_pin_code             text;
    v_country              text;

    -- Permissions
    v_plan_features        jsonb := '[]'::jsonb;
    v_plan_sub_features    jsonb := '[]'::jsonb;
    v_merged_permissions   jsonb := '[]'::jsonb;
    v_permissions_text     text;
BEGIN
    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. INPUT EXTRACTION & VALIDATION
    -- ─────────────────────────────────────────────────────────────────────────
    v_user_id            := (p_data->>'user_id')::uuid;
    v_full_name          := NULLIF(TRIM(p_data->>'full_name'), '');
    v_email              := NULLIF(LOWER(TRIM(p_data->>'email')), '');
    v_phone              := NULLIF(TRIM(p_data->>'phone'), '');
    v_password_hash      := p_data->>'password_hash';

    v_company_name       := NULLIF(TRIM(p_data->>'company_name'), '');
    v_business_category  := COALESCE(NULLIF(TRIM(p_data->>'business_category'), ''), 'Salon & Spa');
    v_business_structure := COALESCE(NULLIF(TRIM(p_data->>'business_structure'), ''), 'single_location');
    v_business_phone     := COALESCE(NULLIF(TRIM(p_data->>'business_phone'), ''), v_phone);
    v_plan_id            := NULLIF(p_data->>'plan_id', '')::uuid;
    v_plan_name          := COALESCE(NULLIF(TRIM(p_data->>'plan_name'), ''), 'Growth');

    v_branch_name        := COALESCE(NULLIF(TRIM(p_data->>'branch_name'), ''), 'Main Branch');
    v_branch_phone       := COALESCE(NULLIF(TRIM(p_data->>'branch_phone'), ''), v_business_phone);
    v_branch_address     := NULLIF(TRIM(p_data->>'branch_address'), '');
    v_city               := NULLIF(TRIM(p_data->>'city'), '');
    v_state              := NULLIF(TRIM(p_data->>'state'), '');
    v_pin_code           := NULLIF(TRIM(p_data->>'pin_code'), '');
    v_country            := COALESCE(NULLIF(TRIM(p_data->>'country'), ''), 'India');

    -- Required checks
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required for workspace onboarding';
    END IF;
    IF v_company_name IS NULL THEN
        RAISE EXCEPTION 'company_name is required';
    END IF;

    -- Name split for profile
    v_first_name := split_part(v_full_name, ' ', 1);
    v_last_name  := NULLIF(SUBSTRING(v_full_name FROM LENGTH(v_first_name) + 2), '');

    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. INSERT COMPANY
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO public.companies (
        company_id,
        owner_user_id,
        company_name,
        display_name,
        plan_id,
        plan_name,
        status,
        owner_name,
        owner_email,
        owner_phone,
        business_category,
        created_at,
        updated_at
    ) VALUES (
        v_company_id,
        v_user_id,
        v_company_name,
        v_company_name,
        v_plan_id,
        v_plan_name,
        'active',
        v_full_name,
        v_email,
        v_phone,
        v_business_category,
        v_now,
        v_now
    );

    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. INSERT PRIMARY BRANCH
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO public.branches (
        branch_id,
        company_id,
        branch_name,
        branch_phone,
        branch_email,
        branch_address,
        address_line_1,
        city,
        state,
        pin_code,
        country,
        manager_user_id,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_branch_id,
        v_company_id,
        v_branch_name,
        v_branch_phone,
        v_email,
        v_branch_address,
        v_branch_address,
        v_city,
        v_state,
        v_pin_code,
        v_country,
        v_user_id,
        'active',
        v_now,
        v_now
    );

    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. INSERT COMPANY SETTINGS & CONTACTS
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO public.company_settings (
        company_id,
        legal_business_name,
        display_name,
        business_category,
        business_structure,
        created_at,
        updated_at
    ) VALUES (
        v_company_id,
        v_company_name,
        v_company_name,
        v_business_category,
        v_business_structure,
        v_now,
        v_now
    );

    INSERT INTO public.company_contacts (
        id,
        company_id,
        primary_phone,
        whatsapp_number,
        email,
        support_phone,
        support_email,
        address_line_1,
        city,
        state,
        pin_code,
        country,
        contact_person_name,
        contact_person_phone,
        contact_person_email,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_company_id,
        v_business_phone,
        v_business_phone,
        v_email,
        v_business_phone,
        v_email,
        v_branch_address,
        v_city,
        v_state,
        v_pin_code,
        v_country,
        v_full_name,
        v_phone,
        v_email,
        v_now,
        v_now
    );

    -- ─────────────────────────────────────────────────────────────────────────
    -- 5. INSERT STANDARD ROLES (Owner, Manager, Receptionist, Staff)
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO public.roles (role_id, company_id, branch_id, role_name, is_default, description, status, created_at, updated_at)
    VALUES 
        (v_owner_role_id,     v_company_id, v_branch_id, 'Owner',        true,  'Unrestricted System Owner',      'active', v_now, v_now),
        (v_manager_role_id,   v_company_id, v_branch_id, 'Manager',      false, 'Branch Operations Manager',       'active', v_now, v_now),
        (v_reception_role_id, v_company_id, v_branch_id, 'Receptionist', false, 'Front-desk & Appointments Desk',  'active', v_now, v_now),
        (v_staff_role_id,     v_company_id, v_branch_id, 'Staff',        false, 'Service Provider / Stylist',      'active', v_now, v_now);

    -- ─────────────────────────────────────────────────────────────────────────
    -- 6. RESOLVE & INSERT ROLE PERMISSIONS
    -- Reads from plan_features & plan_sub_features based on plan_id
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT COALESCE(jsonb_agg(feature_key), '[]'::jsonb)
    INTO v_plan_features
    FROM public.plan_features
    WHERE plan_id = v_plan_id;

    SELECT COALESCE(jsonb_agg(sub_feature_key), '[]'::jsonb)
    INTO v_plan_sub_features
    FROM public.plan_sub_features
    WHERE plan_id = v_plan_id;

    -- Merge unique features + subfeatures
    SELECT COALESCE(jsonb_agg(DISTINCT elem), '["ALL"]'::jsonb)
    INTO v_merged_permissions
    FROM (
        SELECT jsonb_array_elements_text(v_plan_features) AS elem
        UNION
        SELECT jsonb_array_elements_text(v_plan_sub_features) AS elem
    ) combined;

    IF jsonb_array_length(v_merged_permissions) = 0 THEN
        v_permissions_text := '["ALL"]';
    ELSE
        v_permissions_text := v_merged_permissions::text;
    END IF;

    INSERT INTO public.role_permissions (
        id,
        company_id,
        branch_id,
        role_id,
        role_name,
        permission_key,
        status,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_company_id,
        v_branch_id,
        v_owner_role_id,
        'Owner',
        v_permissions_text,
        'active',
        v_now::text,
        v_now::text
    );

    -- ─────────────────────────────────────────────────────────────────────────
    -- 7. INSERT USER (Linking Auth ID to Tenant)
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO public.users (
        user_id,
        company_id,
        branch_id,
        name,
        email,
        phone,
        password_hash,
        role_id,
        role_name,
        status,
        last_login_at,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        v_company_id,
        v_branch_id,
        v_full_name,
        v_email,
        v_phone,
        v_password_hash,
        v_owner_role_id,
        'Owner',
        'active',
        v_now,
        v_now,
        v_now
    );

    -- ─────────────────────────────────────────────────────────────────────────
    -- 8. INSERT PROFILE
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO public.profiles (
        id,
        user_id,
        company_id,
        branch_id,
        first_name,
        last_name,
        phone,
        email,
        role_id,
        role_name,
        joined_on,
        created_at,
        updated_at
    ) VALUES (
        v_profile_id,
        v_user_id,
        v_company_id,
        v_branch_id,
        v_first_name,
        v_last_name,
        v_phone,
        v_email,
        v_owner_role_id,
        'Owner',
        v_now,
        v_now,
        v_now
    );

    -- ─────────────────────────────────────────────────────────────────────────
    -- 9. INITIALIZE USAGE COUNTERS (From plan_limits)
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO public.usage_counters (
        id,
        company_id,
        branch_id,
        plan_id,
        limit_key,
        current_count,
        max_limit,
        created_at,
        updated_at
    )
    SELECT 
        gen_random_uuid(),
        v_company_id,
        v_branch_id,
        v_plan_id,
        pl.limit_key,
        CASE 
            WHEN pl.limit_key = 'max_branches' THEN 1
            WHEN pl.limit_key = 'max_users'    THEN 1
            ELSE 0
        END AS current_count,
        pl.limit_value AS max_limit,
        v_now,
        v_now
    FROM public.plan_limits pl
    WHERE pl.plan_id = v_plan_id
       OR LOWER(pl.plan_name) = LOWER(v_plan_name);

    -- ─────────────────────────────────────────────────────────────────────────
    -- RETURN SUCCESS PAYLOAD
    -- ─────────────────────────────────────────────────────────────────────────
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Workspace initialized successfully',
        'company_id', v_company_id,
        'branch_id', v_branch_id,
        'role_id', v_owner_role_id,
        'user_id', v_user_id
    );

EXCEPTION WHEN OTHERS THEN
    -- Any failure automatically rolls back the entire transaction
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$;

