-- ==============================================================================
-- Migration: 20261103000018_final_audit_hardening.sql
-- Description: Zero-Trust Backend Hardening for Remaining Global Codebase Mutations:
--   1. shared.update_user_profile_full_atomic (Atomic sync of shared.profiles & shared.users)
--   2. app.mark_notification_read_atomic (Single notification mark-as-read)
--   3. app.create_notification_atomic (Authoritative notification insertion)
--   4. shared.submit_issue_atomic (Zero-trust support issue creation)
--   5. shared.add_issue_attachment_atomic (Support issue attachment recording)
--   6. shared.add_issue_message_atomic (Support issue message follow-up)
--   7. shared.update_issue_status_atomic (Support issue status transition)
--   8. shared.submit_suggestion_atomic (Zero-trust feature suggestion creation)
--   9. shared.delete_suggestion_atomic (Atomic rollback/removal of suggestions)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. shared.update_user_profile_full_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.update_user_profile_full_atomic(
    p_company_id               uuid,
    p_user_id                  uuid,
    p_first_name               text,
    p_last_name                text,
    p_phone                    text,
    p_email                    text,
    p_emergency_contact_name   text DEFAULT NULL,
    p_emergency_contact_number text DEFAULT NULL,
    p_profile_photo            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_full_name text;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id is mandatory';
    END IF;

    -- Optional tenant verification if company_id provided
    IF p_company_id IS NOT NULL THEN
        IF NOT shared.verify_tenant_access(p_company_id, NULL) THEN
            RAISE EXCEPTION 'Access denied: Invalid company context.';
        END IF;
    END IF;

    v_full_name := TRIM(CONCAT(COALESCE(p_first_name, ''), ' ', COALESCE(p_last_name, '')));

    -- 1. Upsert / Update shared.profiles
    UPDATE shared.profiles
    SET
        first_name               = COALESCE(p_first_name, first_name),
        last_name                = COALESCE(p_last_name, last_name),
        phone                    = COALESCE(p_phone, phone),
        email                    = COALESCE(p_email, email),
        emergency_contact_name   = COALESCE(p_emergency_contact_name, emergency_contact_name),
        emergency_contact_number = COALESCE(p_emergency_contact_number, emergency_contact_number),
        profile_photo            = COALESCE(p_profile_photo, profile_photo),
        updated_at               = NOW()
    WHERE user_id = p_user_id;

    -- 2. Update shared.users name and phone
    UPDATE shared.users
    SET
        name       = CASE WHEN v_full_name <> '' THEN v_full_name ELSE name END,
        phone      = COALESCE(p_phone, phone),
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'name', v_full_name
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_profile_full_atomic(
    p_company_id               uuid,
    p_user_id                  uuid,
    p_first_name               text,
    p_last_name                text,
    p_phone                    text,
    p_email                    text,
    p_emergency_contact_name   text DEFAULT NULL,
    p_emergency_contact_number text DEFAULT NULL,
    p_profile_photo            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.update_user_profile_full_atomic(
        p_company_id, p_user_id, p_first_name, p_last_name,
        p_phone, p_email, p_emergency_contact_name,
        p_emergency_contact_number, p_profile_photo
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. app.mark_notification_read_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.mark_notification_read_atomic(
    p_notification_id uuid,
    p_company_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF p_notification_id IS NULL THEN
        RAISE EXCEPTION 'p_notification_id is mandatory';
    END IF;

    UPDATE app.notifications
    SET
        is_read = true,
        read_at = NOW()
    WHERE id = p_notification_id
      AND (p_company_id IS NULL OR company_id = p_company_id);

    RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read_atomic(
    p_notification_id uuid,
    p_company_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.mark_notification_read_atomic(p_notification_id, p_company_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. app.create_notification_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_notification_atomic(
    p_company_id uuid,
    p_branch_id  uuid DEFAULT NULL,
    p_user_id    uuid DEFAULT NULL,
    p_category   text DEFAULT 'general',
    p_event_key  text DEFAULT NULL,
    p_title      text DEFAULT 'Notification',
    p_message    text DEFAULT '',
    p_link       text DEFAULT NULL,
    p_metadata   jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_id uuid;
    v_created_at timestamptz;
BEGIN
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'p_company_id is mandatory';
    END IF;

    INSERT INTO app.notifications (
        id,
        company_id,
        branch_id,
        user_id,
        category,
        event_key,
        title,
        message,
        link,
        metadata,
        is_read,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_company_id,
        p_branch_id,
        p_user_id,
        COALESCE(p_category, 'general'),
        p_event_key,
        COALESCE(p_title, 'Notification'),
        COALESCE(p_message, ''),
        p_link,
        COALESCE(p_metadata, '{}'::jsonb),
        false,
        NOW()
    )
    RETURNING id, created_at INTO v_id, v_created_at;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_id,
        'created_at', v_created_at
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification_atomic(
    p_company_id uuid,
    p_branch_id  uuid DEFAULT NULL,
    p_user_id    uuid DEFAULT NULL,
    p_category   text DEFAULT 'general',
    p_event_key  text DEFAULT NULL,
    p_title      text DEFAULT 'Notification',
    p_message    text DEFAULT '',
    p_link       text DEFAULT NULL,
    p_metadata   jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN app.create_notification_atomic(
        p_company_id, p_branch_id, p_user_id,
        p_category, p_event_key, p_title,
        p_message, p_link, p_metadata
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. shared.submit_issue_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.submit_issue_atomic(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL,
    p_user_id     uuid DEFAULT NULL,
    p_category    text DEFAULT 'general',
    p_subject     text DEFAULT '',
    p_description text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_issue shared.issues%ROWTYPE;
BEGIN
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'p_company_id is mandatory';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id is mandatory';
    END IF;

    -- Insert into shared.issues (trigger create_initial_issue_message_after_insert fires automatically)
    INSERT INTO shared.issues (
        id,
        company_id,
        branch_id,
        user_id,
        category,
        subject,
        description,
        status,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        p_company_id,
        p_branch_id,
        p_user_id,
        COALESCE(p_category, 'general'),
        TRIM(COALESCE(p_subject, '')),
        TRIM(COALESCE(p_description, '')),
        'open',
        NOW(),
        NOW()
    )
    RETURNING * INTO v_issue;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_issue.id,
        'reference_number', v_issue.reference_number,
        'status', v_issue.status,
        'created_at', v_issue.created_at
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_issue_atomic(
    p_company_id  uuid,
    p_branch_id   uuid DEFAULT NULL,
    p_user_id     uuid DEFAULT NULL,
    p_category    text DEFAULT 'general',
    p_subject     text DEFAULT '',
    p_description text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.submit_issue_atomic(
        p_company_id, p_branch_id, p_user_id,
        p_category, p_subject, p_description
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. shared.add_issue_attachment_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.add_issue_attachment_atomic(
    p_issue_id     uuid,
    p_message_id   uuid,
    p_storage_path text,
    p_file_name    text,
    p_content_type text DEFAULT 'application/octet-stream',
    p_size_bytes   bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF p_issue_id IS NULL OR p_message_id IS NULL OR p_storage_path IS NULL THEN
        RAISE EXCEPTION 'p_issue_id, p_message_id, and p_storage_path are mandatory';
    END IF;

    INSERT INTO shared.issue_attachments (
        id,
        issue_id,
        message_id,
        storage_path,
        file_name,
        content_type,
        size_bytes,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_issue_id,
        p_message_id,
        p_storage_path,
        p_file_name,
        COALESCE(p_content_type, 'application/octet-stream'),
        COALESCE(p_size_bytes, 0),
        NOW()
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_id,
        'issue_id', p_issue_id,
        'message_id', p_message_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_issue_attachment_atomic(
    p_issue_id     uuid,
    p_message_id   uuid,
    p_storage_path text,
    p_file_name    text,
    p_content_type text DEFAULT 'application/octet-stream',
    p_size_bytes   bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.add_issue_attachment_atomic(
        p_issue_id, p_message_id, p_storage_path,
        p_file_name, p_content_type, p_size_bytes
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. shared.add_issue_message_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.add_issue_message_atomic(
    p_issue_id       uuid,
    p_user_id        uuid,
    p_sender_name    text DEFAULT 'User',
    p_message        text DEFAULT '',
    p_sender_type    text DEFAULT 'customer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_msg shared.issue_messages%ROWTYPE;
BEGIN
    IF p_issue_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_issue_id and p_user_id are mandatory';
    END IF;

    INSERT INTO shared.issue_messages (
        id,
        issue_id,
        sender_type,
        sender_user_id,
        sender_name,
        message,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_issue_id,
        COALESCE(p_sender_type, 'customer'),
        p_user_id,
        COALESCE(p_sender_name, 'User'),
        TRIM(COALESCE(p_message, '')),
        NOW()
    )
    RETURNING * INTO v_msg;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_msg.id,
        'issue_id', v_msg.issue_id,
        'sender_type', v_msg.sender_type,
        'sender_user_id', v_msg.sender_user_id,
        'sender_name', v_msg.sender_name,
        'message', v_msg.message,
        'created_at', v_msg.created_at
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_issue_message_atomic(
    p_issue_id       uuid,
    p_user_id        uuid,
    p_sender_name    text DEFAULT 'User',
    p_message        text DEFAULT '',
    p_sender_type    text DEFAULT 'customer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.add_issue_message_atomic(
        p_issue_id, p_user_id, p_sender_name,
        p_message, p_sender_type
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. shared.update_issue_status_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.update_issue_status_atomic(
    p_issue_id uuid,
    p_status   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_norm_status text;
BEGIN
    IF p_issue_id IS NULL THEN
        RAISE EXCEPTION 'p_issue_id is mandatory';
    END IF;

    v_norm_status := LOWER(TRIM(p_status));
    IF v_norm_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
        RAISE EXCEPTION 'Invalid status: %. Allowed: open, in_progress, resolved, closed', p_status;
    END IF;

    UPDATE shared.issues
    SET
        status     = v_norm_status,
        updated_at = NOW()
    WHERE id = p_issue_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', p_issue_id,
        'status', v_norm_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_issue_status_atomic(
    p_issue_id uuid,
    p_status   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.update_issue_status_atomic(p_issue_id, p_status);
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. shared.submit_suggestion_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.submit_suggestion_atomic(
    p_company_id       uuid,
    p_branch_id        uuid DEFAULT NULL,
    p_user_id          uuid DEFAULT NULL,
    p_category         text DEFAULT 'Feature Request',
    p_title            text DEFAULT '',
    p_description      text DEFAULT '',
    p_business_benefit text DEFAULT NULL,
    p_attachments      jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
DECLARE
    v_suggestion_id uuid := gen_random_uuid();
    v_att jsonb;
BEGIN
    IF p_company_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_company_id and p_user_id are mandatory';
    END IF;

    -- 1. Insert into shared.suggestions
    INSERT INTO shared.suggestions (
        id,
        company_id,
        branch_id,
        user_id,
        category,
        title,
        description,
        business_benefit,
        created_at
    ) VALUES (
        v_suggestion_id,
        p_company_id,
        p_branch_id,
        p_user_id,
        COALESCE(p_category, 'Feature Request'),
        TRIM(COALESCE(p_title, '')),
        TRIM(COALESCE(p_description, '')),
        p_business_benefit,
        NOW()
    );

    -- 2. Insert attachments if provided
    IF p_attachments IS NOT NULL AND jsonb_array_length(p_attachments) > 0 THEN
        FOR v_att IN SELECT * FROM jsonb_array_elements(p_attachments)
        LOOP
            INSERT INTO shared.suggestion_attachments (
                id,
                suggestion_id,
                storage_path,
                file_name,
                content_type,
                size_bytes,
                created_at
            ) VALUES (
                gen_random_uuid(),
                v_suggestion_id,
                v_att->>'storage_path',
                v_att->>'file_name',
                COALESCE(v_att->>'content_type', 'application/octet-stream'),
                COALESCE((v_att->>'size_bytes')::bigint, 0),
                NOW()
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_suggestion_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_suggestion_atomic(
    p_company_id       uuid,
    p_branch_id        uuid DEFAULT NULL,
    p_user_id          uuid DEFAULT NULL,
    p_category         text DEFAULT 'Feature Request',
    p_title            text DEFAULT '',
    p_description      text DEFAULT '',
    p_business_benefit text DEFAULT NULL,
    p_attachments      jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.submit_suggestion_atomic(
        p_company_id, p_branch_id, p_user_id,
        p_category, p_title, p_description,
        p_business_benefit, p_attachments
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. shared.delete_suggestion_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shared.delete_suggestion_atomic(
    p_suggestion_id uuid,
    p_user_id       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    IF p_suggestion_id IS NULL THEN
        RAISE EXCEPTION 'p_suggestion_id is mandatory';
    END IF;

    -- Delete attachments first
    DELETE FROM shared.suggestion_attachments
    WHERE suggestion_id = p_suggestion_id;

    -- Delete suggestion
    DELETE FROM shared.suggestions
    WHERE id = p_suggestion_id
      AND (p_user_id IS NULL OR user_id = p_user_id);

    RETURN jsonb_build_object('success', true, 'id', p_suggestion_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_suggestion_atomic(
    p_suggestion_id uuid,
    p_user_id       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, shared, app, public, pg_temp
AS $$
BEGIN
    RETURN shared.delete_suggestion_atomic(p_suggestion_id, p_user_id);
END;
$$;
