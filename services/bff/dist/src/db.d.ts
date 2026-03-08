/**
 * PostgreSQL client for BFF. Uses DATABASE_URL from env.
 * If unset, getPool() returns null and the app runs without DB (e.g. health-only).
 */
import pg from "pg";
export declare function getPool(): pg.Pool | null;
export interface Lead {
    id: string;
    name: string;
    email: string | null;
    status: string;
    region: string;
    created_at: Date;
    institution?: string | null;
}
/** Run migrations and seed. Safe to call multiple times. */
export declare function initDb(): Promise<void>;
declare const SORT_COLUMNS: readonly ["name", "email", "status", "region", "created_at"];
export type LeadSortColumn = (typeof SORT_COLUMNS)[number];
export interface GetLeadsFilters {
    search?: string;
    status?: string | string[];
    region?: string | string[];
    /** When true, exclude leads with status=completed and updated_at older than 24h (for reps). */
    hideCompletedOlderThan24h?: boolean;
}
export interface GetLeadsPaginatedResult {
    rows: Lead[];
    total: number;
}
/** Server-side leads: pagination, sort, filters. Safe for arbitrary row counts. */
export declare function getLeadsPaginated(filters: GetLeadsFilters, page: number, limit: number, sortBy: string, sortOrder: "asc" | "desc"): Promise<GetLeadsPaginatedResult>;
export declare function getLeads(): Promise<Lead[]>;
export interface InsertLeadInput {
    name: string;
    email?: string | null;
    status?: string;
    region?: string;
    institution?: string | null;
}
/** Insert a new lead. Returns the created lead or null on error. */
export declare function insertLead(input: InsertLeadInput): Promise<Lead | null>;
export interface UpdateLeadInput {
    name?: string;
    email?: string | null;
    status?: string;
    region?: string;
    institution?: string | null;
}
/** Update an existing lead. Returns the updated lead or null if not found or on error. */
export declare function updateLead(id: string, input: UpdateLeadInput): Promise<Lead | null>;
/** Get a single lead by id. Returns null if not found. */
export declare function getLeadById(id: string): Promise<Lead | null>;
export interface ConsoleLogInsert {
    level: string;
    message: string;
    message_hash?: string | null;
    stack?: string | null;
    source?: string;
    env?: string;
    user_id?: string | null;
    request_id?: string | null;
    metadata?: Record<string, unknown> | null;
}
export interface User {
    id: string;
    email: string;
    name: string | null;
    role: "admin" | "manager" | "rep";
    provider: string;
    provider_id: string;
    region: string | null;
    created_at: Date;
    updated_at: Date;
}
/** Get or create user by auth provider (e.g. Google). New users get role 'rep'. Table from migration 004. */
export declare function getOrCreateUserByProvider(provider: string, providerId: string, email: string, name?: string | null): Promise<User | null>;
/** Get user by id. */
export declare function getUserById(id: string): Promise<User | null>;
export interface HCPRow {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    specialty: string | null;
    institution: string | null;
    region: string;
    created_at: Date;
}
export interface GetHCPFilters {
    search?: string;
    specialty?: string | string[];
    institution?: string | string[];
    region?: string | string[];
}
/** HCP list with institution from joined tbl_hco. Paginated, filtered. */
export declare function getHCPPaginated(filters: GetHCPFilters, page: number, limit: number, sortBy: string, sortOrder: "asc" | "desc"): Promise<{
    rows: HCPRow[];
    total: number;
}>;
export interface InsertHCPInput {
    name: string;
    email: string;
    phone: string;
    specialty?: string | null;
    institution?: string | null;
    region?: string;
    lead_id?: string | null;
}
/** Insert a new HCP. Returns the created HCP or null on error. Creates HCO if institution is new. */
export declare function insertHCP(input: InsertHCPInput): Promise<HCPRow | null>;
export interface UpdateHCPInput {
    name?: string;
    email?: string;
    phone?: string;
    specialty?: string | null;
    institution?: string | null;
    region?: string;
}
/** Update an existing HCP. Returns the updated HCP or null if not found. */
export declare function updateHCP(id: string, input: UpdateHCPInput): Promise<HCPRow | null>;
/** Get single HCP by id. */
export declare function getHCPById(id: string): Promise<HCPRow | null>;
export interface HCORow {
    id: string;
    name: string;
    type: string | null;
    region: string;
    status: string;
    created_at: Date;
}
export interface GetHCOFilters {
    search?: string;
    type?: string;
    region?: string;
    status?: string;
}
/** HCO list. Paginated, filtered. */
export declare function getHCOPaginated(filters: GetHCOFilters, page: number, limit: number, sortBy: string, sortOrder: "asc" | "desc"): Promise<{
    rows: HCORow[];
    total: number;
}>;
/** Get single HCO by id. */
export declare function getHCOById(id: string): Promise<HCORow | null>;
export interface PresentationRow {
    id: string;
    title: string;
    url: string;
    file_type: string;
    created_at: Date;
}
/** Get all presentations. */
export declare function getPresentations(): Promise<PresentationRow[]>;
/** Get single presentation by id. */
export declare function getPresentationById(id: string): Promise<PresentationRow | null>;
export interface AuditLogInsert {
    user_id?: string | null;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    metadata?: Record<string, unknown> | null;
}
/** Insert audit log row (who did what). Table from migration 012. */
export declare function insertAuditLog(row: AuditLogInsert): Promise<void>;
/** Insert a console log row (prod or when ENABLE_CONSOLE_LOG_DB=1). Table from migration 003. */
export declare function insertConsoleLog(row: ConsoleLogInsert): Promise<void>;
export {};
