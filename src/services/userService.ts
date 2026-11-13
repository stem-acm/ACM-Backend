import bcrypt from 'bcrypt';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { users } from '@/db/schema';
import type { LoginInput, RegisterInput, UpdateProfileInput } from '@/schemas/userSchema';
import { getRolePolicy, type Role } from '@/services/accessService';
import { type Actor, diffRows, snapshot, writeLog } from '@/services/auditService';
import { generateToken } from '@/utils/jwtUtils';

function publicUser(user: typeof users.$inferSelect, permissions: Record<string, boolean>) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    active: user.active,
    permissions,
  };
}

export async function loginUser(input: LoginInput) {
  const [user] = await db.select().from(users).where(eq(users.username, input.username)).limit(1);

  if (!user) {
    throw new Error('User not found');
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.password);

  if (!isPasswordValid) {
    throw new Error('Invalid password');
  }

  const policy = await getRolePolicy(user.role as Role);
  if (!user.active || !policy.active) throw new Error('Account or role is inactive');

  const token = generateToken({
    id: user.id,
    username: user.username,
    email: user.email,
  });

  return {
    token,
    user: publicUser(user, policy.permissions),
  };
}

export async function registerUser(input: RegisterInput, actor: Actor) {
  // Check if username already exists
  const [existingUserByUsername] = await db
    .select()
    .from(users)
    .where(eq(users.username, input.username))
    .limit(1);

  if (existingUserByUsername) {
    throw new Error('Username already exists');
  }

  // Check if email already exists
  const [existingUserByEmail] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existingUserByEmail) {
    throw new Error('Email already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(input.password, 10);

  // Create user and its log in one transaction
  const newUser = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        username: input.username,
        email: input.email,
        password: hashedPassword,
        role: input.role,
      })
      .returning();
    await writeLog(tx, actor, {
      type: 'user.created',
      entity: 'users',
      entityId: created.id,
      entityLabel: created.username,
      changes: snapshot(created),
    });
    return created;
  });

  return {
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    role: newUser.role,
    active: newUser.active,
  };
}

export async function verifyUserToken(userId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    throw new Error('User not found');
  }

  const policy = await getRolePolicy(user.role as Role);
  if (!user.active || !policy.active) throw new Error('Account or role is inactive');
  return publicUser(user, policy.permissions);
}

export async function updateOwnProfile(userId: number, input: UpdateProfileInput, actor: Actor) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('User not found');
  if (!(await bcrypt.compare(input.currentPassword, user.password))) {
    throw new Error('Incorrect current password');
  }
  if (input.username && input.username !== user.username) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, input.username))
      .limit(1);
    if (taken) throw new Error('Username already exists');
  }
  if (input.email && input.email !== user.email) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (taken) throw new Error('Email already exists');
  }
  const newPassword =
    input.newPassword !== undefined ? await bcrypt.hash(input.newPassword, 10) : undefined;
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({
        ...(input.username !== undefined && { username: input.username }),
        ...(input.email !== undefined && { email: input.email }),
        ...(newPassword !== undefined && { password: newPassword }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    const changes = diffRows(user, row);
    if (Object.keys(changes).length > 0) {
      await writeLog(tx, actor, {
        type: 'user.profile_updated',
        entity: 'users',
        entityId: row.id,
        entityLabel: row.username,
        changes,
      });
    }
    // The current password was checked above: a new password equal to it changes nothing.
    if (input.newPassword !== undefined && input.newPassword !== input.currentPassword) {
      await writeLog(tx, actor, {
        type: 'user.password_changed',
        entity: 'users',
        entityId: row.id,
        entityLabel: row.username,
        changes: {},
      });
    }
    return row;
  });
  const policy = await getRolePolicy(updated.role as Role);
  return publicUser(updated, policy.permissions);
}

export interface UserAccessInput {
  role: Role;
  active: boolean;
}

/** Changes the role and the status of an account (`PUT /api/settings/users/:id`). */
export async function updateUserAccess(id: number, input: UserAccessInput, actor: Actor) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new Error('User not found');
    if (id === actor.id && (input.role !== 'admin' || !input.active)) {
      throw new Error('You cannot remove your own admin access');
    }
    if (target.role === 'admin' && target.active && (input.role !== 'admin' || !input.active)) {
      const otherAdmins = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'admin'), eq(users.active, true), ne(users.id, id)))
        .limit(1);
      if (!otherAdmins.length) throw new Error('At least one active admin is required');
    }
    const [updated] = await tx
      .update(users)
      .set({ role: input.role, active: input.active, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    const changes = diffRows(target, updated);
    if (changes.role) {
      await writeLog(tx, actor, {
        type: 'user.role_changed',
        entity: 'users',
        entityId: updated.id,
        entityLabel: updated.username,
        changes: { role: changes.role },
      });
    }
    if (changes.active) {
      await writeLog(tx, actor, {
        type: 'user.activation_changed',
        entity: 'users',
        entityId: updated.id,
        entityLabel: updated.username,
        changes: { active: changes.active },
      });
    }
    return {
      id: updated.id,
      username: updated.username,
      email: updated.email,
      role: updated.role,
      active: updated.active,
    };
  });
}
