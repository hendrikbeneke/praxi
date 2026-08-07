/**
 * Drizzle schema. Empty on purpose — slice 0 wires the tooling up, it creates
 * no domain tables.
 *
 * Tables are added slice by slice, each one in its own migration, and every
 * domain table carries `tenant_id uuid not null` (CLAUDE.md rule 1). The first
 * tables (`tenant`, `practice_settings`, `app_user`, `session`) arrive in
 * slice 1.
 */
export {}
