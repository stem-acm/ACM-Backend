import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { users } from '@/db/schema';
import type { LoginInput, RegisterInput } from '@/schemas/userSchema';
import { generateToken } from '@/utils/jwtUtils';

export async function loginUser(input: LoginInput) {
  const [user] = await db.select().from(users).where(eq(users.username, input.username)).limit(1);

  if (!user) {
    throw new Error('User not found');
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.password);

  if (!isPasswordValid) {
    throw new Error('Invalid password');
  }

  const token = generateToken({
    id: user.id,
    username: user.username,
    email: user.email,
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
  };
}

export async function registerUser(input: RegisterInput) {
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

  // Create user
  const [newUser] = await db
    .insert(users)
    .values({
      username: input.username,
      email: input.email,
      password: hashedPassword,
    })
    .returning();

  return {
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
  };
}

export async function verifyUserToken(userId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    throw new Error('User not found');
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}
