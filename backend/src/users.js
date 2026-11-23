import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { h, HttpError, publicUser } from "./util.js";

// Manager-only. A manager sees all team members, client users who are not linked to a client yet, and the client
// users of their own clients. They never see other managers or other managers' client users.
export const usersRouter = Router();

usersRouter.use((req, _res, next) => (req.user.role === "MANAGER" || req.user.role === "SUPER_MANAGER" ? next() : next(new HttpError(403, "Managers only"))));

const row = (u) => ({ ...publicUser(u), clientId: u.clientId, createdAt: u.createdAt });

usersRouter.get(
  "/",
  h(async (req, res) => {
    const rows = await prisma.user.findMany({
      // A super manager sees every team member and every client user.
      where: req.user.role === "SUPER_MANAGER"
        ? { role: { in: ["ASSIGNEE", "CLIENT"] } }
        : { OR: [{ role: "ASSIGNEE" }, { role: "CLIENT", clientId: null }, { role: "CLIENT", client: { managerId: req.user.id } }] },
      include: { client: true },
      orderBy: { createdAt: "desc" },
    });
    // People waiting for a client first, then everyone else by name.
    res.json(rows.map(row).sort((a, b) => Number(b.pending) - Number(a.pending) || a.name.localeCompare(b.name)));
  })
);

// Roles are chosen at registration. A manager can only fix a client user's name and link them to one of their own clients.
const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  clientId: z.number().int().nullable().optional(),
});

usersRouter.patch(
  "/:id",
  h(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, "Bad id");
    const b = patchSchema.parse(req.body);
    const u = await prisma.user.findUnique({ where: { id }, include: { client: true } });
    const sup = req.user.role === "SUPER_MANAGER";
    const mine = u && u.role === "CLIENT" && (sup || !u.clientId || u.client?.managerId === req.user.id);
    if (!mine) throw new HttpError(404, "User not found");
    const clientId = b.clientId === undefined ? u.clientId : b.clientId;
    if (clientId && !(await prisma.client.findFirst({ where: { id: clientId, ...(sup ? { managerId: { not: null } } : { managerId: req.user.id }) }, select: { id: true } })))
      throw new HttpError(400, "Unknown client");
    const saved = await prisma.user.update({
      where: { id },
      data: { ...(b.name ? { name: b.name } : {}), clientId },
      include: { client: true },
    });
    res.json(row(saved));
  })
);