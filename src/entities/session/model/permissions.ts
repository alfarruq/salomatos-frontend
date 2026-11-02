import type { Permission, Role } from './types'

/**
 * Role → permissions, decided on the client. **ADR-012.**
 *
 * §9.2 forbids exactly this, and the reason it gives is sound: if the server
 * owns permissions, a frontend that derives them from a role will eventually
 * disagree with the server and lie to the user about what they may do.
 *
 * That reason does not apply to this backend, because there is nothing to
 * disagree with. `/api/me/` returns a `role` string and nothing else; there is
 * no permission model, no per-view authorisation, and `DEFAULT_PERMISSION_
 * CLASSES` is `IsAuthenticated` alone. The server does not distinguish an
 * admin from a doctor at all.
 *
 * ⚠️ Which makes the honest reading of this table: **it is not security, and
 * here it is not even a reflection of security.** It arranges the interface so
 * a doctor is not shown billing controls. Anyone who wants past it needs
 * DevTools and five seconds, and the server will serve them. Closing that is a
 * backend change (see the review's §A3) and this table is not a substitute for
 * it — it is a placeholder shaped like the thing that should exist, so that
 * when `/api/me/` grows a `permissions[]` array this file is the only one that
 * has to be deleted.
 */
const ALL_PERMISSIONS: readonly Permission[] = [
  'patient:read',
  'patient:create',
  'patient:write',
  'patient:archive',
  'appointment:read',
  'appointment:write',
  'medical-record:read',
  'medical-record:write',
  'billing:read',
  'billing:write',
  'payroll:manage',
  'clinic:manage',
  'staff:manage',
]

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  /** The clinic account itself. Owns everything under it. */
  superadmin: ALL_PERMISSIONS,

  /** Reception and clinic management. Runs the desk, treatments included. */
  admin: [
    'patient:read',
    'patient:create',
    'patient:write',
    'patient:archive',
    'appointment:read',
    'appointment:write',
    'medical-record:read',
    // Product decision 2026-11-02: the desk records treatments for any doctor.
    'medical-record:write',
    'billing:read',
    'billing:write',
    'staff:manage',
  ],

  /** Clinical work. No billing, no archiving, no staff administration. */
  doctor: [
    'patient:read',
    // Own patients only: the create dialog offers no doctor but themselves.
    'patient:create',
    'appointment:read',
    'appointment:write',
    'medical-record:read',
    'medical-record:write',
  ],

  /**
   * Patients have no place in this application at all.
   *
   * They are rows in the same `User` table and authenticate against the same
   * endpoint, so one can hold a valid token — but their appointments,
   * prescriptions and history are served to the Telegram bot
   * (`/api/telegram/*`), and there is no patient portal here by product
   * decision. The `_auth` guard turns them away on the strength of the role;
   * this empty set is the second line, not the first.
   */
  patient: [],
}

export function permissionsForRole(role: Role): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role])
}
