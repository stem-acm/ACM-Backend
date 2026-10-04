import { eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { rolePolicies } from '@/db/schema';

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
  'checkins.create',
  'checkins.view',
  'profile.edit',
];
const VOLUNTEER_FEATURES: Feature[] = [
  'dashboard.view',
  'members.view',
  'volunteers.view',
  'activities.view',
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

export async function getRolePolicy(role: Role) {
  const [stored] = await db.select().from(rolePolicies).where(eq(rolePolicies.role, role)).limit(1);
  const defaults = defaultPermissions(role);
  const permissions = { ...defaults, ...(stored?.permissions ?? {}) };
  // Settings management is reserved for admins, including if old data contains an invalid grant.
  permissions['settings.manage'] = role === 'admin';
  return { role, active: role === 'admin' ? true : (stored?.active ?? true), permissions };
}

export async function getAllRolePolicies() {
  return Promise.all(ROLES.map(getRolePolicy));
}

export async function saveRolePolicy(role: Role, active: boolean, permissions: Permissions) {
  const safePermissions = { ...permissions, 'settings.manage': role === 'admin' };
  if (safePermissions['members.cards']) safePermissions['members.view'] = true;
  if (safePermissions['volunteers.certificate']) safePermissions['volunteers.view'] = true;
  if (safePermissions['checkins.create']) {
    safePermissions['activities.view'] = true;
  }
  const safeActive = role === 'admin' ? true : active;
  await db
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
  return getRolePolicy(role);
}
