import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { h, HttpError, limit, publicUser } from "./util.js";

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
};

export const authRouter = Router();

authRouter.post(
  "/login",
  h(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { client: true } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, "Wrong email or password");
    const token = jwt.sign({ id: user.id }, secret(), { expiresIn: "8h" });
    res.json({ token, user: publicUser(user) });
  })
);

// Sign up with name, email, password and a role (team member, manager or client). Team Members and managers can start
// straight away. A client user sees nothing until a manager links them to one of their clients (People page).
const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your full name").max(60, "Name is too long"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
    role: z.enum(["ASSIGNEE", "MANAGER", "CLIENT"], { errorMap: () => ({ message: "Choose a role" }) }),
    password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password can be at most 72 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

authRouter.post(
  "/register",
  limit(10, 15 * 60 * 1000),
  h(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const { name, email, role, password } = parsed.data;
    if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(409, "An account with this email already exists. Try signing in");
    let user;
    try {
      user = await prisma.user.create({
        data: { name, email, passwordHash: await bcrypt.hash(password, 10), role },
        include: { client: true },
      });
    } catch (e) {
      if (e?.code === "P2002") throw new HttpError(409, "An account with this email already exists. Try signing in");
      throw e;
    }
    // Every manager gets their own "In house" client for internal work.
    if (role === "MANAGER") await prisma.client.create({ data: { name: "In house", managerId: user.id } }).catch(() => {});
    const token = jwt.sign({ id: user.id }, secret(), { expiresIn: "8h" });
    res.status(201).json({ token, user: publicUser(user) });
  })
);

// Loads the user on every request, so role changes apply immediately.
export const auth = h(async (req, _res, next) => {
  const raw = req.headers.authorization?.replace(/^Bearer /, "");
  if (!raw) throw new HttpError(401, "Not signed in");
  let id;
  try {
    id = jwt.verify(raw, secret()).id;
  } catch {
    throw new HttpError(401, "Session expired");
  }
  const user = await prisma.user.findUnique({ where: { id }, include: { client: true } });
  if (!user) throw new HttpError(401, "Not signed in");
  req.user = user;
  next();
});
