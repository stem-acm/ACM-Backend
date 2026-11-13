import { eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { rolePolicies } from '@/db/schema';
import { type Actor, type FieldChange, writeLog } from '@/services/auditService';

export const ROLES = ['admin', 'intern', 'volunteer'] as const;
export type Role = (typeof ROLES)[number];

export const FEATURES = [
  'dashboard.view',
  'members.view',
  'members.create',
  'members.update',
  'members.delete',
  'members.cards',
  'volunteers.view',
  'volunteers.create',
  'volunteers.update',
  'volunteers.delete',
  'volunteers.certificate',
  'activities.view',
  'activities.create',
  'activities.update',
  'activities.delete',
  'books.view',
  'books.create',
  'books.update',
  'checkins.create',
  'checkins.view',
  'checkins.delete',
  'profile.edit',
  'settings.manage',
] as const;
export type Feature = (typeof FEATURES)[number];
export type Permissions = Record<Feature, boolean>;

const INTERN_FEATURES: Feature[] = [
  'dashboard.view',
  'members.view',
  'members.create',
  'members.update',
  'members.cards',
  'volunteers.view',
  'activities.view',
  'activities.create',
  'activities.update',
  'books.view',
  'books.create',
  'books.update',
  'checkins.create',
  'checkins.view',
  'profile.edit',
];
const VOLUNTEER_FEATURES: Feature[] = [
  'dashboard.view',
  'members.view',
  'volunteers.view',
  'activities.view',
  'books.view',
  'checkins.create',
  'profile.edit',
];

export function defaultPermissions(role: Role): Permissions {
  const allowed =
    role === 'admin' ? FEATURES : role === 'intern' ? INTERN_FEATURES : VOLUNTEER_FEATURES;
  return Object.fromEntries(
    FEATURES.map((feature) => [feature, allowed.includes(feature)])
  ) as Permissions;
}

type StoredPolicy = { active: boolean; permissions: Record<string, boolean> };

/** The effective policy of a role, from its stored row (if any) and its defaults. */
function resolvePolicy(role: Role, stored: StoredPolicy | undefined) {
  const defaults = defaultPermissions(role);
  const permissions = { ...defaults, ...(stored?.permissions ?? {}) };
  // Settings management is reserved for admins, including if old data contains an invalid grant.
  permissions['settings.manage'] = role === 'admin';
  return { role, active: role === 'admin' ? true : (stored?.active ?? true), permissions };
}

export async function getRolePolicy(role: Role) {
  const [stored] = await db.select().from(rolePolicies).where(eq(rolePolicies.role, role)).limit(1);
  return resolvePolicy(role, stored);
}

export async function getAllRolePolicies() {
  return Promise.all(ROLES.map(getRolePolicy));
}

export async function saveRolePolicy(
  role: Role,
  active: boolean,
  permissions: Permissions,
  actor: Actor
) {
  const safePermissions = { ...permissions, 'settings.manage': role === 'admin' };
  if (safePermissions['members.cards']) safePermissions['members.view'] = true;
  if (safePermissions['volunteers.certificate']) safePermissions['volunteers.view'] = true;
  if (safePermissions['checkins.create']) {
    safePermissions['activities.view'] = true;
  }
  if (safePermissions['books.create'] || safePermissions['books.update']) {
    safePermissions['books.view'] = true;
  }
  const safeActive = role === 'admin' ? true : active;
  await db.transaction(async (tx) => {
    // The upsert hides whether the row existed: read it first to pick the log type.
    const [stored] = await tx
      .select()
      .from(rolePolicies)
      .where(eq(rolePolicies.role, role))
      .limit(1);
    const before = resolvePolicy(role, stored);
    await tx
      .insert(rolePolicies)
      .values({ role, active: safeActive, permissions: safePermissions })
      .onConflictDoUpdate({
        target: rolePolicies.role,
        set: {
          active: safeActive,
          permissions: safePermissions,
          updatedAt: new Date(),
        },
      });
    const after = resolvePolicy(role, { active: safeActive, permissions: safePermissions });

    const changedPermissions: Record<string, FieldChange> = {};
    for (const feature of Object.keys(after.permissions) as Feature[]) {
      if (before.permissions[feature] !== after.permissions[feature]) {
        changedPermissions[feature] = {
          before: before.permissions[feature],
          after: after.permissions[feature],
        };
      }
    }
    const log = { entity: 'role_policies' as const, entityId: role, entityLabel: role };
    if (!stored) {
      // First save: "before" is the default policy of the role.
      await writeLog(tx, actor, {
        ...log,
        type: 'role_policy.created',
        changes: changedPermissions,
      });
    } else if (Object.keys(changedPermissions).length > 0) {
      await writeLog(tx, actor, {
        ...log,
        type: 'role_policy.permissions_changed',
        changes: changedPermissions,
      });
    }
    if (before.active !== after.active) {
      await writeLog(tx, actor, {
        ...log,
        type: 'role_policy.activation_changed',
        changes: { active: { before: before.active, after: after.active } },
      });
    }
  });
  return getRolePolicy(role);
}
