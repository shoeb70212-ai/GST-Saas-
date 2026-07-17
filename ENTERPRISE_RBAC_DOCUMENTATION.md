# Enterprise RBAC & Audit Logging System Architecture

**Document Version:** 1.0  
**Project:** Khatalens (GST SAAS)  
**Date:** July 16, 2026  

---

## 1. Executive Summary
This document outlines the architecture, implementation details, and troubleshooting history of the Enterprise Role-Based Access Control (RBAC) and Audit Logging feature integrated into Khatalens. The system transitions the platform from a single-user model to a multi-user, organization-centric CA Firm model with strict data isolation.

## 2. Core Features Implemented

### 2.1 Database Architecture (PostgreSQL / Supabase)
- **Organizations Core:** Introduced `organizations` as the top-level entity representing a CA Firm.
- **Enterprise RBAC:** Implemented the `organization_members` junction table to map users to organizations with specific roles (`owner`, `admin`, `accountant`).
- **Client-Level Access Control:** Created the `client_assignments` table. By default, Junior Accountants have no visibility into the firm's clients until they are explicitly assigned to a client by a Firm Owner or Admin.
- **Data Association:** Migrated all core tables (`clients`, `invoices`, `gstr2b_records`, `whatsapp_pending_files`) to include a mandatory `org_id` column.

### 2.2 Security & Compliance
- **Immutable Audit Trail:** Implemented the `audit_logs` table. Postgres `AFTER INSERT/UPDATE/DELETE` triggers automatically record every modification to invoices at the database level. The log captures the user ID, timestamp, and a JSON diff of the `previous_state` vs. `new_state`.
- **Row Level Security (RLS):** Activated strict RLS across the entire schema. The Postgres layer guarantees that users can only query rows associated with their `org_id`, and further restricts Junior Accountants to their assigned `client_id`s.

### 2.3 Backend API (FastAPI)
- **Service Role Deprecation:** Refactored FastAPI routes to discontinue the use of the omnipotent Supabase Service Role key.
- **JWT Context Propagation:** The Python backend now extracts the incoming user's JWT and passes it directly to Supabase (`get_user_supabase_client`). This delegates all access control logic down to the Postgres RLS layer, ensuring the backend API cannot accidentally leak unauthorized data.
- **Auto-Injection Triggers:** Created `set_default_org_id` triggers. If the backend fails to provide an `org_id` during an insert, Postgres intercepts the request, looks up the user's active organization, and injects it automatically.

### 2.4 Frontend Interface (React)
- **Team Roster & Onboarding:** Added a "Team Management" interface within the Settings dashboard. Firm Owners can monitor team members and generate secure, 8-character "Join Codes".
- **Instant Provisioning:** Users can enter a Join Code in their settings to instantly attach their profile to the Enterprise Firm as an accountant.
- **Access Management Console:** Upgraded the `ClientsPage` with a "Manage Access" modal, allowing Owners to toggle client visibility for specific accountants.
- **Security Audit Dashboard:** Created `AuditLogsPage.tsx`. Firm Owners have a real-time, read-only view of the firm's tamper-proof audit trail.

---

## 3. Incident Report & Troubleshooting Log

During deployment, several technical hurdles were encountered and resolved. This log serves as a reference for future infrastructure changes.

### 3.1 Migration Idempotency Failure (Policies)
**Incident:** The initial execution of the `migration_phase38_enterprise_rbac.sql` script partially succeeded before being interrupted. Subsequent attempts to run the script resulted in a fatal Postgres error: `ERROR: 42710: policy "Users can view orgs they belong to" for table "organizations" already exists`.  
**Root Cause:** The `CREATE POLICY` statements lacked conditional checks, causing collisions when encountering previously created policies.  
**Resolution:** Refactored the SQL script to be fully idempotent by injecting `DROP POLICY IF EXISTS "policy_name" ON table_name;` prior to every policy creation statement. This ensures the script safely overwrites old policies if re-run.

### 3.2 Migration Idempotency Failure (Triggers)
**Incident:** After resolving the policy collisions, a secondary error surfaced during re-execution: `ERROR: 42710: trigger "trigger_audit_invoices" for relation "invoices" already exists`.  
**Root Cause:** Similar to the policy failure, Postgres rejected the recreation of existing triggers.  
**Resolution:** Applied the idempotency pattern to the trigger definitions by adding `DROP TRIGGER IF EXISTS "trigger_name" ON table_name;` before all `CREATE TRIGGER` blocks. The script executed cleanly (`Success. No rows returned`) after this fix.

### 3.3 Vite Dependency Caching Failure
**Incident:** The React frontend crashed with a fatal browser error: `[plugin:vite:import-analysis] Failed to resolve import "date-fns"`.  
**Root Cause:** The newly created `AuditLogsPage.tsx` relied on the `date-fns` formatting library, which had not been installed.  
**Resolution:** Executed `npm install date-fns`. However, the Vite development server continued to throw the same error because Vite aggressively caches the module graph in `node_modules/.vite` and remembered the missing dependency. The server was terminated and restarted using the cache-busting flag (`npm run dev -- --force`), which forced a recompilation and restored the application.
