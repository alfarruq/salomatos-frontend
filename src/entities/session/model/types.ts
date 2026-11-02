/**
 * Permissions the UI knows how to gate on (§9.2).
 *
 * The list is a closed union so a typo in `<Can permission="patinet:read">` is
 * a type error rather than a silently hidden button. Unlike the architecture
 * document intends, the *values* are derived from the role on this client —
 * see `permissions.ts` and ADR-012 for why, and for why that is a placeholder
 * rather than a design.
 */
export type Permission =
  | 'patient:read'
  /** Registering a new patient. Doctors may, but only for themselves (see `CreatePatientDialog`). */
  | 'patient:create'
  | 'patient:write'
  | 'patient:archive'
  | 'appointment:read'
  | 'appointment:write'
  | 'medical-record:read'
  | 'medical-record:write'
  | 'billing:read'
  | 'billing:write'
  /** Doctors' pay terms and payouts. Pay is private from other staff, admins included. */
  | 'payroll:manage'
  | 'clinic:manage'
  | 'staff:manage'

/**
 * The backend's `User.Roles`, verbatim — lowercase, and `admin` rather than
 * `ClinicAdmin`. Matching the wire exactly means no translation layer that
 * could drift.
 *
 * A closed union on purpose: `Roles` is a `TextChoices` on the model, so
 * adding one is a migration and a deploy, not something that can appear
 * unannounced. If an unknown role does arrive, failing loudly beats silently
 * granting the empty permission set and showing an empty application.
 */
export type Role = 'superadmin' | 'admin' | 'doctor' | 'patient'

export interface Session {
  /**
   * From the token's `user_id` claim, not from `/api/me/` — the serializer
   * returns no id at all. See `shared/lib/jwt`.
   */
  userId: number
  /**
   * The tenant every query key is scoped by (§6.2).
   *
   * Equal to `userId`, and that is not a shortcut: this backend resolves
   * tenancy from `request.user` on every query, so "whose data is this" and
   * "who is asking" are the same question. A clinic *is* a user row here
   * (`User.clinic` points at a `superadmin` account), so for a clinic login
   * this is literally the clinic's id; for any other login it is the scope
   * that account's requests will return, which is what the cache must key on.
   */
  clinicId: number
  /** One field on the wire. There is no first/last name split to recover. */
  fullName: string
  phoneNumber: string | null
  email: string | null
  role: Role
  permissions: ReadonlySet<Permission>
}
