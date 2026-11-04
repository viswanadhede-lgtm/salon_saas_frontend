-- ==============================================================================
-- Migration: 20261103000019c_rls_lockdown_shared_schema.sql
-- Description: Phase 13 Database-Wide RLS Lockdown (Part C - shared schema)
--   Enables Row Level Security across all 17 root tenant, IAM, and support tables in `shared`.
--   Applies tenant-isolated & self-scoped SELECT policies.
--   Enforces 0 direct client mutations (no INSERT/UPDATE/DELETE policies for clients).
-- ==============================================================================

-- 1. Enable RLS on all 17 shared base tables
ALTER TABLE shared.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.company_billing_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.company_tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.issue_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.issue_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.suggestion_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.users ENABLE ROW LEVEL SECURITY;

-- 2. Tenant & Identity Root Tables
DROP POLICY IF EXISTS "tenant_select_companies" ON shared.companies;
CREATE POLICY "tenant_select_companies" ON shared.companies
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_branches" ON shared.branches;
CREATE POLICY "tenant_select_branches" ON shared.branches
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_users" ON shared.users;
CREATE POLICY "tenant_select_users" ON shared.users
FOR SELECT TO authenticated, anon
USING (
    shared.verify_tenant_access(company_id, NULL) 
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "tenant_select_profiles" ON shared.profiles;
CREATE POLICY "tenant_select_profiles" ON shared.profiles
FOR SELECT TO authenticated, anon
USING (
    shared.verify_tenant_access(company_id, NULL) 
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "tenant_select_user_preferences" ON shared.user_preferences;
CREATE POLICY "tenant_select_user_preferences" ON shared.user_preferences
FOR SELECT TO authenticated, anon
USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR shared.verify_tenant_access(company_id, NULL)
);

DROP POLICY IF EXISTS "tenant_select_roles" ON shared.roles;
CREATE POLICY "tenant_select_roles" ON shared.roles
FOR SELECT TO authenticated, anon
USING (
    company_id IS NULL 
    OR shared.verify_tenant_access(company_id, NULL)
);

DROP POLICY IF EXISTS "tenant_select_role_permissions" ON shared.role_permissions;
CREATE POLICY "tenant_select_role_permissions" ON shared.role_permissions
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

-- 3. Tenant Settings Tables
DROP POLICY IF EXISTS "tenant_select_company_settings" ON shared.company_settings;
CREATE POLICY "tenant_select_company_settings" ON shared.company_settings
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_billing_info" ON shared.company_billing_information;
CREATE POLICY "tenant_select_billing_info" ON shared.company_billing_information
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_company_contacts" ON shared.company_contacts;
CREATE POLICY "tenant_select_company_contacts" ON shared.company_contacts
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_company_tax" ON shared.company_tax_settings;
CREATE POLICY "tenant_select_company_tax" ON shared.company_tax_settings
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

-- 4. Customer Reviews
DROP POLICY IF EXISTS "tenant_select_reviews" ON shared.reviews;
CREATE POLICY "tenant_select_reviews" ON shared.reviews
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

-- 5. Support Issues and Messages
DROP POLICY IF EXISTS "tenant_select_issues" ON shared.issues;
CREATE POLICY "tenant_select_issues" ON shared.issues
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_issue_messages" ON shared.issue_messages;
CREATE POLICY "tenant_select_issue_messages" ON shared.issue_messages
FOR SELECT TO authenticated, anon
USING (
    EXISTS (
        SELECT 1 FROM shared.issues i 
        WHERE i.id = issue_messages.issue_id 
          AND shared.verify_tenant_access(i.company_id, NULL)
    )
);

DROP POLICY IF EXISTS "tenant_select_issue_attachments" ON shared.issue_attachments;
CREATE POLICY "tenant_select_issue_attachments" ON shared.issue_attachments
FOR SELECT TO authenticated, anon
USING (
    EXISTS (
        SELECT 1 FROM shared.issues i 
        WHERE i.id = issue_attachments.issue_id 
          AND shared.verify_tenant_access(i.company_id, NULL)
    )
);

-- 6. Feature Suggestions and Feedback
DROP POLICY IF EXISTS "tenant_select_suggestions" ON shared.suggestions;
CREATE POLICY "tenant_select_suggestions" ON shared.suggestions
FOR SELECT TO authenticated, anon
USING (shared.verify_tenant_access(company_id, NULL));

DROP POLICY IF EXISTS "tenant_select_suggestion_attachments" ON shared.suggestion_attachments;
CREATE POLICY "tenant_select_suggestion_attachments" ON shared.suggestion_attachments
FOR SELECT TO authenticated, anon
USING (
    EXISTS (
        SELECT 1 FROM shared.suggestions s 
        WHERE s.id = suggestion_attachments.suggestion_id 
          AND shared.verify_tenant_access(s.company_id, NULL)
    )
);

