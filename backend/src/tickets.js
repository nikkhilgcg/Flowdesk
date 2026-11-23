import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { h, HttpError, isPending, publicUser } from "./util.js";

export const processRouter = Router();

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];

// When nobody picks a due date, it is set from the priority: High 2 days, Medium 4 days, Low 1 week.
const DEFAULT_DUE_DAYS = { HIGH: 2, MEDIUM: 4, LOW: 7 };
const defaultDue = (priority) => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + DEFAULT_DUE_DAYS[priority]));
};
const STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "APPROVED"];

// ---- visibility: the single place that decides who can see which ticket ----
// A manager sees only the tickets of the clients they own (so manager 1 never sees manager 2's work).
// A team member sees tickets assigned to them, plus any ticket where they were @mentioned in a comment.
// A super manager sees every ticket of every client and manager, and can do everything a manager can.
const scope = (u) =>
  u.role === "SUPER_MANAGER"
    ? {}
    : u.role === "MANAGER"
      ? { client: { managerId: u.id } }
      : u.role === "ASSIGNEE"
      ? { OR: [{ assigneeId: u.id }, { events: { some: { mentions: { has: u.id } } } }] }
      : { clientId: u.clientId ?? -1 };

// A super manager can do everything a manager can, for every client (not only their own).
const isManager = (u) => u.role === "MANAGER" || u.role === "SUPER_MANAGER";

// Shown wherever the person behind a comment, status change or image has been deleted from the database.
const DELETED_USER = "Deleted user";

// ---- ids look like TKT-101 (database id + 100) ----
const OFFSET = 100;
const keyOf = (id) => `TKT-${id + OFFSET}`;
const idOf = (k) => {
  const m = /^TKT-(\d+)$/.exec(k);
  return m ? Number(m[1]) - OFFSET : NaN;
};

const include = { client: { include: { manager: { select: { name: true } } } }, assignee: { select: { id: true, name: true } } };
const dto = (p) => ({
  key: keyOf(p.id),
  title: p.title,
  description: p.description,
  priority: p.priority,
  dueDate: p.dueDate,
  status: p.status,
  reworkCount: p.reworkCount,
  createdAt: p.createdAt,
  client: { id: p.client.id, name: p.client.name, owner: p.client.manager?.name ?? null },
  assignee: p.assignee,
});

// A ticket outside the caller's scope is reported as not found, never as forbidden.
const find = async (u, key) => {
  const id = idOf(key);
  const p = Number.isInteger(id) ? await prisma.process.findFirst({ where: { id, ...scope(u) }, include }) : null;
  if (!p) throw new HttpError(404, "Ticket not found");
  return p;
};

// People who can be @mentioned on a ticket: the manager who owns its client, all team members, plus the users of
// this ticket's own client. Never other managers or users of other clients. Mentioning a team member gives them access.
const mentionable = async (p) => {
  const c = await prisma.client.findUnique({ where: { id: p.clientId }, select: { managerId: true } });
  return prisma.user.findMany({
    where: { OR: [{ id: c?.managerId ?? -1 }, { role: "ASSIGNEE" }, { clientId: p.clientId }] },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
};

// "In house" is a built-in client for internal work. Every manager has their own.
const IN_HOUSE = "In house";
const ensureInHouse = async (managerId) =>
  (await prisma.client.findFirst({ where: { name: IN_HOUSE, managerId } })) ?? prisma.client.create({ data: { name: IN_HOUSE, managerId } });
const sortClients = (l) => [...l].sort((a, b) => (a.name === IN_HOUSE ? -1 : b.name === IN_HOUSE ? 1 : a.name.localeCompare(b.name)));

// Names typed as "@Full Name" in a text, matched against the people allowed to be mentioned.
const mentionIds = (text, people, selfId) => {
  const lower = text.toLowerCase();
  return people.filter((m) => m.id !== selfId && lower.includes("@" + m.name.toLowerCase())).map((m) => m.id);
};

processRouter.get("/me", (req, res) => res.json(publicUser(req.user)));

// Everything below needs an account that a manager has set up (role and client).
processRouter.use((req, _res, next) =>
  isPending(req.user) ? next(new HttpError(403, "Your account is waiting for a manager to give you access")) : next()
);

// A super manager is allowed to do everything: see, create, edit, assign, approve and delete any ticket.

processRouter.get(
  "/meta",
  h(async (req, res) => {
    // Managers get their own clients and all team members. Team Members get the clients (with the owning manager's name),
    // so they can pick one when creating a ticket.
    if (req.user.role === "CLIENT") throw new HttpError(403, "Not available");
    const mgr = req.user.role === "MANAGER";
    const sup = req.user.role === "SUPER_MANAGER";   // gets every manager's clients (with the owner's name) and all team members
    if (mgr) await ensureInHouse(req.user.id);
    const [rows, assignees] = await Promise.all([
      prisma.client.findMany({
        where: mgr ? { managerId: req.user.id } : { managerId: { not: null } },
        select: { id: true, name: true, manager: { select: { name: true } } },
        orderBy: { name: "asc" },
      }),
      mgr || sup ? prisma.user.findMany({ where: { role: "ASSIGNEE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    ]);
    const clients = rows.map((c) => ({ id: c.id, name: c.name, ...(mgr ? {} : { owner: c.manager?.name ?? null }) }));
    res.json({ clients: sortClients(clients), assignees });
  })
);

// Who can be @mentioned while writing a new ticket: all staff plus the users of the chosen client.
processRouter.get(
  "/mentionable",
  h(async (req, res) => {
    const u = req.user;
    const asked = Number(req.query.clientId);
    let clientId = u.role === "CLIENT" ? u.clientId : Number.isInteger(asked) && asked > 0 ? asked : -1;
    // A manager can only look at their own clients.
    if (u.role === "MANAGER" && clientId > 0 && !(await prisma.client.findFirst({ where: { id: clientId, managerId: u.id }, select: { id: true } }))) clientId = -1;
    res.json(await mentionable({ clientId }));
  })
);

// A manager adds a new client. It belongs to that manager and appears in their client dropdowns.
processRouter.post(
  "/clients",
  h(async (req, res) => {
    if (!isManager(req.user)) throw new HttpError(403, "Managers only");
    const parsed = z.object({ name: z.string().trim().min(1, "Enter the client name").max(80, "Client name is too long") }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const { name } = parsed.data;
    const taken = new HttpError(409, "A client with this name already exists");
    if (await prisma.client.findFirst({ where: { managerId: req.user.id, name: { equals: name, mode: "insensitive" } }, select: { id: true } })) throw taken;
    try {
      res.status(201).json(await prisma.client.create({ data: { name, managerId: req.user.id }, select: { id: true, name: true } }));
    } catch (e) {
      if (e?.code === "P2002") throw taken;
      throw e;
    }
  })
);

processRouter.get(
  "/tickets",
  h(async (req, res) => {
    const rows = await prisma.process.findMany({ where: scope(req.user), include, orderBy: { createdAt: "desc" } });
    // The latest comment that mentioned this user, per ticket (for the Mentions tab).
    const mentions = await prisma.processEvent.findMany({
      where: { mentions: { has: req.user.id }, processId: { in: rows.map((r) => r.id) } },
      orderBy: { createdAt: "desc" },
      select: { processId: true, type: true, body: true, createdAt: true, actor: { select: { name: true } }, process: { select: { description: true } } },
    });
    const last = new Map();
    for (const m of mentions)
      if (!last.has(m.processId)) last.set(m.processId, { by: m.actor?.name ?? DELETED_USER, at: m.createdAt, text: ((m.type === "CREATED" ? m.process.description : m.body) ?? "").slice(0, 160) });
    res.json(rows.map((r) => ({ ...dto(r), mention: last.get(r.id) ?? null })));
  })
);

processRouter.get(
  "/tickets/:key",
  h(async (req, res) => {
    const p = await find(req.user, req.params.key);
    const events = await prisma.processEvent.findMany({
      where: { processId: p.id },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { name: true } } },
    });
    const last = [...events].reverse().find((e) => e.type === "CREATED" || e.type === "STATUS");
    const createdBy = events.find((e) => e.type === "CREATED")?.actorId ?? null;
    const all = await prisma.attachment.findMany({
      where: { processId: p.id, OR: [{ inComment: false }, { eventId: { not: null } }] },
      orderBy: { createdAt: "asc" },
      select: { ...attMeta, inComment: true, eventId: true },
    });
    const byEvent = new Map();
    for (const a of all) if (a.inComment) byEvent.set(a.eventId, [...(byEvent.get(a.eventId) ?? []), attDto(a)]);
    res.json({
      ...dto(p),
      statusBy: last ? (last.actor?.name ?? DELETED_USER) : null,
      // Whoever created it, the manager who owns its client, and any super manager can delete a ticket.
      canDelete: req.user.role === "SUPER_MANAGER" || (req.user.role === "MANAGER" && p.client.managerId === req.user.id) || createdBy === req.user.id,
      events: events.map((e) => ({ ...e, actor: { name: e.actor?.name ?? DELETED_USER }, attachments: byEvent.get(e.id) ?? [] })),
      people: await mentionable(p),
      attachments: all.filter((a) => !a.inComment).map(attDto),
    });
  })
);

// ---- image attachments ----
const MAX_IMG = 8 * 1024 * 1024;
const MAX_PER_PROCESS = 10;
const imageBody = express.raw({ type: ["image/png", "image/jpeg", "image/gif", "image/webp"], limit: MAX_IMG });
// The file's real type comes from its first bytes, never from what the browser claims.
const sniff = (b) => {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.toString("ascii", 0, 4) === "GIF8") return "image/gif";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
};
const readImage = (req) => {
  const bad = new HttpError(415, "Upload a PNG, JPEG, GIF or WebP image");
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad;
  const mime = sniff(req.body);
  if (!mime) throw bad;
  return { mime, size: req.body.length, data: req.body };
};
const attMeta = { id: true, mime: true, size: true, createdAt: true, uploaderId: true, uploader: { select: { name: true } } };
const attDto = (a) => ({ id: a.id, mime: a.mime, size: a.size, createdAt: a.createdAt, uploaderId: a.uploaderId, by: a.uploader?.name ?? DELETED_USER });

// Who may open an attachment: whoever can see its process, or (before the ticket exists) only the uploader.
const canOpen = async (u, a) =>
  a.processId
    ? !!(await prisma.process.findFirst({ where: { id: a.processId, ...scope(u) }, select: { id: true } }))
    : a.uploaderId === u.id;

// Uploaded while writing a new ticket; attached to it when the ticket is created.
processRouter.post(
  "/attachments",
  imageBody,
  h(async (req, res) => {
    const img = readImage(req);
    if ((await prisma.attachment.count({ where: { uploaderId: req.user.id, processId: null } })) >= MAX_PER_PROCESS * 2)
      throw new HttpError(400, "Too many unsent images. Create the ticket first");
    const a = await prisma.attachment.create({ data: { ...img, uploaderId: req.user.id }, select: attMeta });
    res.status(201).json(attDto(a));
  })
);

// Added to a ticket that already exists.
processRouter.post(
  "/tickets/:key/attachments",
  imageBody,
  h(async (req, res) => {
    const u = req.user;
    const p = await find(u, req.params.key);
    if (p.status === "APPROVED" && u.role === "ASSIGNEE") throw new HttpError(403, "This ticket is approved and locked");
    const img = readImage(req);
    if ((await prisma.attachment.count({ where: { processId: p.id, inComment: false } })) >= MAX_PER_PROCESS)
      throw new HttpError(400, `A ticket can have up to ${MAX_PER_PROCESS} images`);
    const a = await prisma.attachment.create({ data: { ...img, uploaderId: u.id, processId: p.id }, select: attMeta });
    res.status(201).json(attDto(a));
  })
);

// Image for a comment that is being written. Stays a draft until the comment is posted.
const MAX_PER_COMMENT = 5;
processRouter.post(
  "/tickets/:key/comment-images",
  imageBody,
  h(async (req, res) => {
    const u = req.user;
    const p = await find(u, req.params.key);
    const img = readImage(req);
    if ((await prisma.attachment.count({ where: { processId: p.id, uploaderId: u.id, inComment: true, eventId: null } })) >= MAX_PER_COMMENT)
      throw new HttpError(400, `A comment can have up to ${MAX_PER_COMMENT} images`);
    const a = await prisma.attachment.create({ data: { ...img, uploaderId: u.id, processId: p.id, inComment: true }, select: attMeta });
    res.status(201).json(attDto(a));
  })
);

processRouter.get(
  "/attachments/:id",
  h(async (req, res) => {
    const id = Number(req.params.id);
    const a = Number.isInteger(id) ? await prisma.attachment.findUnique({ where: { id } }) : null;
    if (!a || !(await canOpen(req.user, a))) throw new HttpError(404, "Image not found");
    res.set({ "Content-Type": a.mime, "Content-Length": a.size, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400" });
    res.end(Buffer.from(a.data));
  })
);

processRouter.delete(
  "/attachments/:id",
  h(async (req, res) => {
    const u = req.user;
    const id = Number(req.params.id);
    const a = Number.isInteger(id) ? await prisma.attachment.findUnique({ where: { id }, select: { id: true, uploaderId: true, processId: true } }) : null;
    if (!a || !(await canOpen(u, a))) throw new HttpError(404, "Image not found");
    if (a.uploaderId !== u.id && !isManager(u)) throw new HttpError(403, "Only the person who added it, or a manager, can remove it");
    await prisma.attachment.delete({ where: { id: a.id } });
    res.json({ ok: true });
  })
);

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(""),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  clientId: z.number().int().optional(),
  assigneeId: z.number().int().nullable().optional(),
  attachmentIds: z.array(z.number().int()).max(MAX_PER_PROCESS).default([]),
});

processRouter.post(
  "/tickets",
  h(async (req, res) => {
    const u = req.user;
    const b = createSchema.parse(req.body);
    // Clients create for their own client. Managers and assignees choose the client.
    const clientId = u.role === "CLIENT" ? u.clientId : b.clientId;
    if (!clientId) throw new HttpError(400, "Client is required");
    // A manager can only use their own clients. A team member can use any client that has a manager.
    if (u.role === "MANAGER" && !(await prisma.client.findFirst({ where: { id: clientId, managerId: u.id }, select: { id: true } })))
      throw new HttpError(400, "Unknown client");
    // Team Members and super managers can use any client that has a manager.
    if ((u.role === "ASSIGNEE" || u.role === "SUPER_MANAGER") && !(await prisma.client.findFirst({ where: { id: clientId, managerId: { not: null } }, select: { id: true } })))
      throw new HttpError(400, "Unknown client");
    // Managers can assign anyone. A ticket created by an assignee is assigned to them, so it shows up on their board.
    let assigneeId = u.role === "ASSIGNEE" ? u.id : null;
    if (isManager(u) && b.assigneeId) {
      const a = await prisma.user.findFirst({ where: { id: b.assigneeId, role: "ASSIGNEE" } });
      if (!a) throw new HttpError(400, "Unknown assignee");
      assigneeId = a.id;
    }
    // @mentions typed in the description (same rule as comments)
    const ids = b.description ? mentionIds(b.description, await mentionable({ clientId }), u.id) : [];
    const p = await prisma.$transaction(async (tx) => {
      const created = await tx.process.create({
        data: {
          title: b.title,
          description: b.description,
          priority: b.priority,
          dueDate: b.dueDate ? new Date(b.dueDate) : defaultDue(b.priority),
          clientId,
          assigneeId,
          events: { create: { actorId: u.id, type: "CREATED", mentions: ids } },
        },
        include: { ...include, events: { select: { id: true } } },
      });
      if (ids.length)
        await tx.notification.createMany({
          data: ids.map((userId) => ({ userId, actorId: u.id, processId: created.id, eventId: created.events[0].id, type: "MENTION" })),
        });
      // Only the caller's own, not-yet-attached images can be attached.
      if (b.attachmentIds.length)
        await tx.attachment.updateMany({ where: { id: { in: b.attachmentIds }, uploaderId: u.id, processId: null }, data: { processId: created.id } });
      return created;
    });
    res.status(201).json(dto(p));
  })
);

processRouter.patch(
  "/tickets/:key",
  h(async (req, res) => {
    const u = req.user;
    if (!isManager(u)) throw new HttpError(403, "Managers only");
    const { assigneeId } = z.object({ assigneeId: z.number().int().nullable() }).parse(req.body);
    const p = await find(u, req.params.key);
    const a = assigneeId ? await prisma.user.findFirst({ where: { id: assigneeId, role: "ASSIGNEE" } }) : null;
    if (assigneeId && !a) throw new HttpError(400, "Unknown assignee");
    const [updated] = await prisma.$transaction([
      prisma.process.update({ where: { id: p.id }, data: { assigneeId: a?.id ?? null }, include }),
      prisma.processEvent.create({
        data: { processId: p.id, actorId: u.id, type: "ASSIGNED", body: a ? `assigned to ${a.name}` : "removed the assignee" },
      }),
    ]);
    res.json(dto(updated));
  })
);

// Change the due date. Whoever can see the ticket may do it (creator, manager, team member, client),
// except that a team member cannot touch an approved (locked) ticket. The change is written to the activity log.
processRouter.put(
  "/tickets/:key/due-date",
  h(async (req, res) => {
    const u = req.user;
    const { dueDate } = z.object({ dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date") }).parse(req.body);
    const p = await find(u, req.params.key);
    if (p.status === "APPROVED" && u.role === "ASSIGNEE") throw new HttpError(403, "This ticket is approved and locked");
    const next = new Date(dueDate);
    if (Number.isNaN(next.getTime())) throw new HttpError(400, "Pick a valid date");
    if (p.dueDate && p.dueDate.getTime() === next.getTime()) throw new HttpError(400, "Nothing was changed");
    const day = (d) => (d ? d.toISOString().slice(0, 10) : "none");
    const [updated] = await prisma.$transaction([
      prisma.process.update({ where: { id: p.id }, data: { dueDate: next }, include }),
      prisma.processEvent.create({
        data: { processId: p.id, actorId: u.id, type: "DUE_DATE", body: `changed the due date from ${day(p.dueDate)} to ${day(next)}` },
      }),
    ]);
    res.json(dto(updated));
  })
);

// Delete a ticket with its comments, activity, images and notifications (they cascade in the database).
// Allowed for whoever created it, the manager who owns its client, and super managers.
processRouter.delete(
  "/tickets/:key",
  h(async (req, res) => {
    const u = req.user;
    const p = await find(u, req.params.key);
    const first = await prisma.processEvent.findFirst({ where: { processId: p.id, type: "CREATED" }, orderBy: { id: "asc" }, select: { actorId: true } });
    const ok = u.role === "SUPER_MANAGER" || (u.role === "MANAGER" && p.client.managerId === u.id) || first?.actorId === u.id;
    if (!ok) throw new HttpError(403, "Only the person who created this ticket, its manager or a super manager can delete it");
    await prisma.process.delete({ where: { id: p.id } });
    res.json({ ok: true });
  })
);

// Edit the description of a ticket. Whoever can see the ticket may edit it, except that a team member
// cannot touch an approved (locked) process. Each edit is written to the activity log. Anyone newly
// @mentioned in the new text gets a notification, the same as when the ticket was created.
processRouter.put(
  "/tickets/:key/description",
  h(async (req, res) => {
    const u = req.user;
    const { description } = z.object({ description: z.string().trim().max(5000) }).parse(req.body);
    const p = await find(u, req.params.key);
    if (p.status === "APPROVED" && u.role === "ASSIGNEE") throw new HttpError(403, "This ticket is approved and locked");
    if (description === p.description) throw new HttpError(400, "Nothing was changed");
    const people = await mentionable(p);
    const earlier = await prisma.processEvent.findMany({ where: { processId: p.id }, select: { mentions: true } });
    const already = new Set(earlier.flatMap((e) => e.mentions));
    const ids = mentionIds(description, people, u.id).filter((id) => !already.has(id));
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.process.update({ where: { id: p.id }, data: { description }, include });
      const ev = await tx.processEvent.create({
        data: { processId: p.id, actorId: u.id, type: "DESCRIPTION", body: description, mentions: ids },
      });
      if (ids.length)
        await tx.notification.createMany({
          data: ids.map((userId) => ({ userId, actorId: u.id, processId: p.id, eventId: ev.id, type: "MENTION" })),
        });
      return saved;
    });
    res.json(dto(updated));
  })
);

// ---- status changes ----
// Anyone who can see a ticket can move it between To Do, In Progress and In Review.
// Approving, and rejecting (sending it back from In Review to To Do with a reason), is a decision
// that only a manager or the client can make. Rejection counts as rework.
// Once approved, a ticket is locked: only a manager or the client can reopen it.
processRouter.post(
  "/tickets/:key/transition",
  h(async (req, res) => {
    const u = req.user;
    const { to, reason } = z
      .object({ to: z.enum(STATUSES), reason: z.string().trim().max(2000).optional() })
      .parse(req.body);
    const p = await find(u, req.params.key);
    if (p.status === to) throw new HttpError(400, "The ticket is already in that status");
    const approve = to === "APPROVED";
    const reject = p.status === "IN_REVIEW" && to === "TODO";
    const decider = isManager(u) || u.role === "CLIENT";
    if ((approve || reject) && !decider) throw new HttpError(403, "Only a manager or the client can approve or reject");
    if (p.status === "APPROVED" && !decider) throw new HttpError(403, "This ticket is approved and locked. Only a manager or the client can reopen it");
    if (approve && p.status !== "IN_REVIEW") throw new HttpError(400, "Only a ticket in review can be approved");
    if (reject && !reason) throw new HttpError(400, "A reason is required to reject");
    await prisma.$transaction(async (tx) => {
      // updateMany with the old status guards against two people acting at once
      const r = await tx.process.updateMany({
        where: { id: p.id, status: p.status },
        data: { status: to, ...(reject ? { reworkCount: { increment: 1 } } : {}) },
      });
      if (r.count === 0) throw new HttpError(409, "Status changed meanwhile, please refresh");
      await tx.processEvent.create({
        data: { processId: p.id, actorId: u.id, type: "STATUS", fromStatus: p.status, toStatus: to, body: reject ? reason : null },
      });
    });
    res.json(dto(await find(u, req.params.key)));
  })
);

processRouter.post(
  "/tickets/:key/comments",
  h(async (req, res) => {
    const u = req.user;
    const { body, attachmentIds } = z
      .object({ body: z.string().trim().max(2000).default(""), attachmentIds: z.array(z.number().int()).max(MAX_PER_COMMENT).default([]) })
      .refine((v) => v.body || v.attachmentIds.length, { message: "Write a comment or add an image" })
      .parse(req.body);
    const p = await find(u, req.params.key);
    // Mentions come from the text itself: every "@Full Name" of someone who may be mentioned here.
    // (Typing the name by hand works as well as picking it from the list.)
    const people = await mentionable(p);
    const ids = mentionIds(body, people, u.id);
    const e = await prisma.$transaction(async (tx) => {
      const ev = await tx.processEvent.create({
        data: { processId: p.id, actorId: u.id, type: "COMMENT", body, mentions: ids },
        include: { actor: { select: { name: true } } },
      });
      if (attachmentIds.length) {
        // Only this person's own draft images on this ticket can be attached.
        const r = await tx.attachment.updateMany({
          where: { id: { in: attachmentIds }, uploaderId: u.id, processId: p.id, inComment: true, eventId: null },
          data: { eventId: ev.id },
        });
        if (r.count !== attachmentIds.length) throw new HttpError(400, "An image could not be attached. Add it again");
      }
      if (ids.length)
        await tx.notification.createMany({
          data: ids.map((userId) => ({ userId, actorId: u.id, processId: p.id, eventId: ev.id, type: "MENTION" })),
        });
      return ev;
    });
    res.status(201).json(e);
  })
);

// ---- notifications (the bell in the navbar) ----
processRouter.get(
  "/notifications",
  h(async (req, res) => {
    const where = { userId: req.user.id };
    const [rows, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { actor: { select: { name: true } }, event: { select: { body: true, type: true } }, process: { select: { description: true, title: true } } },
      }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    res.json({
      unread,
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        key: keyOf(n.processId),
        actor: n.actor?.name ?? DELETED_USER,
        text: ((n.event.type === "CREATED" ? n.process.description || n.process.title : n.event.body) ?? "").slice(0, 140),
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    });
  })
);

processRouter.post(
  "/notifications/read-all",
  h(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  })
);

processRouter.post(
  "/notifications/:id/read",
  h(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, "Bad id");
    await prisma.notification.updateMany({ where: { id, userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  })
);