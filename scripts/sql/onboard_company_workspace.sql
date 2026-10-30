-- ============================================================================
-- RPC FUNCTION: public.onboard_company_workspace (UPDATED)
-- Purpose: Atomically provisions an entire tenant workspace during onboarding.
--
-- UPDATES APPLIED:
-- 1. ONLY inserts the 'Owner' role into public.roles (removed Manager, Receptionist, Staff).
-- 2. In public.role_permissions, writes the COMPLETE unified list of all features
--    and sub-features as a single JSON array string into permission_key:
--    '["feature_1", "feature_2", ... , "sub_feature_1", "sub_feature_2", ...]'
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

    -- Permissions Processing
    v_raw_features         text;
    v_raw_sub_features     text;
    v_features_json        jsonb := '[]'::jsonb;
    v_sub_feats_json       jsonb := '[]'::jsonb;
    v_final_perms_json     jsonb := '[]'::jsonb;
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
    -- 5. INSERT ROLES: ONLY THE OWNER ROLE
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO public.roles (
        role_id,
        company_id,
        branch_id,
        role_name,
        is_default,
        description,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_owner_role_id,
        v_company_id,
        v_branch_id,
        'Owner',
        true,
        'System Owner Role',
        'active',
        v_now,
        v_now
    );

    -- ─────────────────────────────────────────────────────────────────────────
    -- 6. RESOLVE & INSERT ROLE PERMISSIONS
    -- Unpacks the full array of features + subfeatures for the selected plan
    -- and stores as a single JSON array string in permission_key.
    -- ─────────────────────────────────────────────────────────────────────────
    -- A. Fetch raw feature_key from plan_features
    SELECT feature_key
    INTO v_raw_features
    FROM public.plan_features
    WHERE plan_id = v_plan_id
    LIMIT 1;

    -- Fallback by plan_name if not found by plan_id
    IF (v_raw_features IS NULL OR v_raw_features = '') AND v_plan_name IS NOT NULL THEN
        SELECT pf.feature_key
        INTO v_raw_features
        FROM public.plan_features pf
        WHERE pf.plan_id IN (
            SELECT id FROM public.plans WHERE LOWER(plan_name) = LOWER(v_plan_name)
            UNION
            SELECT plan_id FROM public.plans WHERE LOWER(plan_name) = LOWER(v_plan_name)
        )
        LIMIT 1;
    END IF;

    -- Parse features into jsonb array
    IF v_raw_features IS NOT NULL AND TRIM(v_raw_features) LIKE '[%]' THEN
        BEGIN
            v_features_json := TRIM(v_raw_features)::jsonb;
        EXCEPTION WHEN OTHERS THEN
            v_features_json := '[]'::jsonb;
        END;
    END IF;

    -- Fallback if stored as multiple rows
    IF jsonb_array_length(v_features_json) = 0 THEN
        SELECT COALESCE(jsonb_agg(feature_key), '[]'::jsonb)
        INTO v_features_json
        FROM public.plan_features
        WHERE plan_id = v_plan_id AND feature_key NOT LIKE '[%]';
    END IF;

    -- B. Fetch raw sub_feature_key from plan_sub_features
    SELECT sub_feature_key
    INTO v_raw_sub_features
    FROM public.plan_sub_features
    WHERE plan_id = v_plan_id
    LIMIT 1;

    -- Fallback by plan_name if not found by plan_id
    IF (v_raw_sub_features IS NULL OR v_raw_sub_features = '') AND v_plan_name IS NOT NULL THEN
        SELECT psf.sub_feature_key
        INTO v_raw_sub_features
        FROM public.plan_sub_features psf
        WHERE psf.plan_id IN (
            SELECT id FROM public.plans WHERE LOWER(plan_name) = LOWER(v_plan_name)
            UNION
            SELECT plan_id FROM public.plans WHERE LOWER(plan_name) = LOWER(v_plan_name)
        )
        LIMIT 1;
    END IF;

    -- Parse sub-features into jsonb array
    IF v_raw_sub_features IS NOT NULL AND TRIM(v_raw_sub_features) LIKE '[%]' THEN
        BEGIN
            v_sub_feats_json := TRIM(v_raw_sub_features)::jsonb;
        EXCEPTION WHEN OTHERS THEN
            v_sub_feats_json := '[]'::jsonb;
        END;
    END IF;

    -- Fallback if stored as multiple rows
    IF jsonb_array_length(v_sub_feats_json) = 0 THEN
        SELECT COALESCE(jsonb_agg(sub_feature_key), '[]'::jsonb)
        INTO v_sub_feats_json
        FROM public.plan_sub_features
        WHERE plan_id = v_plan_id AND sub_feature_key NOT LIKE '[%]';
    END IF;

    -- C. Merge all features + subfeatures into one complete, distinct list
    SELECT COALESCE(jsonb_agg(elem ORDER BY elem), '[]'::jsonb)
    INTO v_final_perms_json
    FROM (
        SELECT DISTINCT jsonb_array_elements_text(v_features_json) AS elem
        UNION
        SELECT DISTINCT jsonb_array_elements_text(v_sub_feats_json) AS elem
    ) combined
    WHERE elem IS NOT NULL AND elem <> '';

    -- D. Safe fallback: If plan tables had no rows, populate the full standard keys for the plan
    IF jsonb_array_length(v_final_perms_json) = 0 THEN
        IF LOWER(v_plan_name) LIKE '%growth%' THEN
            -- Growth Plan (41 features + 74 sub-features = 115 total)
            v_final_perms_json := '["analytics_expenses","analytics_overview","billing_subscription_management","bookings_management","company_settings","customers_management","dashboard_access","dashboard_completed_appointments","dashboard_no_shows_cancellations","dashboard_todays_revenue","dashboard_upcoming_appointments","issue_history","manage_addons","notifications","payments_history","pending_payments","pos_system","product_management","report_financial","report_staff_performance","reports_access","reports_category","reports_detail","roles_permissions","sales_history","services_management","settings_business","settings_contact","settings_hours","settings_invoice","settings_invoice_booking","settings_invoice_common","settings_invoice_pos","settings_notifications","settings_payments","settings_tax","staff_management","staff_schedules","support","user_guide","user_management","dashboard_create_booking","create_booking","update_booking","cancel_booking","view_booking_details","reschedule_booking","export_bookings","filter_bookings","create_customer","edit_customer","delete_customer","view_customer_details","view_customer_history","export_customers","filter_customers","create_staff","edit_staff","delete_staff","view_staff_details","manage_staff_services","export_staff","filter_staff","create_schedule","edit_schedule","delete_schedule","bulk_update_schedule","export_schedules","filter_schedules","create_service","edit_service","delete_service","create_category","edit_category","delete_category","manage_prices","export_services","filter_services","pos_create_sale","pos_quick_billing","pos_apply_discount","pos_cancel_sale","pos_print_receipt","pos_reorder_items","add_product","edit_product","delete_product","adjust_stock","create_product_category","edit_product_category","delete_product_category","export_products","filter_products","view_sale_details","reprint_sale_receipt","refund_sale","rebook_from_sale","export_sales_history","filter_sales_history","process_pending_payment","cancel_pending_payment","view_pending_payment_details","export_pending_payments","filter_pending_payments","view_payment_details","refund_payment","reprint_payment_receipt","export_payments_history","filter_payments_history","export_analytics_overview","filter_analytics_overview","view_report_financial","view_report_staff","export_report","filter_report","add_expense","edit_expense","delete_expense","create_expense_category","edit_expense_category","delete_expense_category","export_expenses","filter_expenses","edit_business_settings","edit_contact_settings","edit_operating_hours","edit_tax_settings","edit_payment_settings","edit_notification_settings","edit_common_invoice_settings","edit_booking_invoice_settings","edit_pos_invoice_settings","user_create","user_edit","user_delete","user_toggle_status","export_users","filter_users","role_create","role_edit","role_delete","permission_assign","export_roles","view_current_subscription","view_billing_history","upgrade_subscription","cancel_subscription","view_addons","activate_addon","deactivate_addon","notification_mark_read","notification_clear_all","support_ticket_create","support_ticket_reply","support_ticket_close","view_user_guide"]'::jsonb;
        ELSE
            -- Advance / Pro Plan (All 51 features + all 97 sub-features = 148 total)
            v_final_perms_json := '["analytics_expenses","analytics_overview","billing_subscription_management","bookings_management","branch_management","company_settings","customers_management","dashboard_access","dashboard_completed_appointments","dashboard_no_shows_cancellations","dashboard_todays_revenue","dashboard_upcoming_appointments","issue_history","manage_addons","marketing_coupons","marketing_memberships","marketing_offers","notifications","payments_history","pending_payments","pos_system","product_management","report_bookings","report_customers","report_discount_usages","report_financial","report_memberships","report_product_sales","report_staff_performance","reports_access","reports_category","reports_detail","roles_permissions","sales_history","services_management","settings_business","settings_contact","settings_hours","settings_invoice","settings_invoice_booking","settings_invoice_common","settings_invoice_membership","settings_invoice_pos","settings_notifications","settings_payments","settings_tax","staff_management","staff_schedules","support","user_guide","user_management","dashboard_create_booking","create_booking","update_booking","cancel_booking","view_booking_details","reschedule_booking","export_bookings","filter_bookings","create_customer","edit_customer","delete_customer","view_customer_details","view_customer_history","export_customers","filter_customers","create_staff","edit_staff","delete_staff","view_staff_details","manage_staff_services","export_staff","filter_staff","create_schedule","edit_schedule","delete_schedule","bulk_update_schedule","export_schedules","filter_schedules","create_service","edit_service","delete_service","create_category","edit_category","delete_category","manage_prices","export_services","filter_services","pos_create_sale","pos_quick_billing","pos_apply_discount","pos_cancel_sale","pos_print_receipt","pos_reorder_items","add_product","edit_product","delete_product","adjust_stock","create_product_category","edit_product_category","delete_product_category","export_products","filter_products","view_sale_details","reprint_sale_receipt","refund_sale","rebook_from_sale","export_sales_history","filter_sales_history","process_pending_payment","cancel_pending_payment","view_pending_payment_details","export_pending_payments","filter_pending_payments","create_offer","edit_offer","delete_offer","toggle_offer_status","export_offers","filter_offers","create_coupon","edit_coupon","delete_coupon","toggle_coupon_status","export_coupons","filter_coupons","create_membership","edit_membership","delete_membership","toggle_membership_status","assign_membership","cancel_membership","export_memberships","filter_memberships","export_analytics_overview","filter_analytics_overview","view_report_financial","view_report_staff","view_report_bookings","view_report_customers","view_report_product_sales","view_report_discount_usages","view_report_memberships","export_report","filter_report","add_expense","edit_expense","delete_expense","create_expense_category","edit_expense_category","delete_expense_category","export_expenses","filter_expenses","branch_create","branch_edit","branch_delete","branch_switch","export_branches","edit_business_settings","edit_contact_settings","edit_operating_hours","edit_tax_settings","edit_payment_settings","edit_notification_settings","edit_common_invoice_settings","edit_booking_invoice_settings","edit_pos_invoice_settings","edit_membership_invoice_settings","user_create","user_edit","user_delete","user_toggle_status","export_users","filter_users","role_create","role_edit","role_delete","permission_assign","export_roles","view_current_subscription","view_billing_history","upgrade_subscription","cancel_subscription","view_addons","activate_addon","deactivate_addon","notification_mark_read","notification_clear_all","support_ticket_create","support_ticket_reply","support_ticket_close","view_user_guide"]'::jsonb;
        END IF;
    END IF;

    v_permissions_text := v_final_perms_json::text;

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
