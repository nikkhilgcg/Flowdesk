import { prisma } from "./db.js";

const DAY = 24 * 3600 * 1000;
// Overdue is counted in whole calendar days in this timezone (so the day rolls over at local midnight).
const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

// Today's date in TZ as a UTC-midnight timestamp. Due dates are stored the same way (a date at 00:00 UTC).
const today = () => {
  let ymd;
  try {
    ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    ymd = new Date().toISOString().slice(0, 10); // unknown timezone name: fall back to UTC
  }
  return Date.parse(ymd);
};
const dayOf = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

// Tickets approved before the approvedAt column existed: use the time of their last "approved" status change.
async function backfillApprovedAt() {
  await prisma.$executeRaw`
    UPDATE "Process" p
    SET "approvedAt" = COALESCE(
      (SELECT MAX(e."createdAt") FROM "ProcessEvent" e WHERE e."processId" = p.id AND e."type" = 'STATUS' AND e."toStatus" = 'APPROVED'),
      p."updatedAt")
    WHERE p."status" = 'APPROVED' AND p."approvedAt" IS NULL`;
}

// Once a day per overdue ticket (not yet approved) everyone involved gets "overdue by N days":
// whoever created it, its assignee, the manager who owns the client, and every super manager.
// Process.overdueNotifiedDays remembers the last N sent, so a ticket is reminded at most once per day,
// however often this runs or the server restarts.
export async function notifyOverdue() {
  const now = today();
  const rows = await prisma.process.findMany({
    where: { status: { not: "APPROVED" }, dueDate: { lt: new Date(now) } },
    select: {
      id: true, dueDate: true, assigneeId: true, overdueNotifiedDays: true,
      client: { select: { managerId: true } },
      events: { where: { type: "CREATED" }, orderBy: { id: "asc" }, take: 1, select: { actor: { select: { id: true, role: true } } } },
    },
  });
  const due = rows
    .map((r) => ({ r, days: Math.floor((now - dayOf(r.dueDate)) / DAY) }))
    .filter((x) => x.days >= 1 && x.days > x.r.overdueNotifiedDays);
  if (!due.length) return;
  const supers = (await prisma.user.findMany({ where: { role: "SUPER_MANAGER" }, select: { id: true } })).map((u) => u.id);

  for (const { r, days } of due) {
    const creator = r.events[0]?.actor;
    // A team member who created the ticket but has since been replaced as assignee can no longer open it, so skip them.
    const creatorId = creator && (creator.role !== "ASSIGNEE" || creator.id === r.assigneeId) ? creator.id : null;
    const people = [...new Set([creatorId, r.assigneeId, r.client.managerId, ...supers].filter(Boolean))];
    await prisma.$transaction(async (tx) => {
      // Claim this day first, so two runs at the same moment cannot both send it.
      const claimed = await tx.process.updateMany({
        where: { id: r.id, status: { not: "APPROVED" }, overdueNotifiedDays: r.overdueNotifiedDays },
        data: { overdueNotifiedDays: days },
      });
      if (claimed.count === 0) return;
      // Yesterday's reminder, if nobody opened it, is replaced by today's so the bell does not fill up.
      await tx.notification.deleteMany({ where: { processId: r.id, type: "OVERDUE", readAt: null } });
      await tx.notification.createMany({ data: people.map((userId) => ({ userId, processId: r.id, type: "OVERDUE", overdueDays: days })) });
    });
  }
}

export function startJobs() {
  const run = () => notifyOverdue().catch((e) => console.error("Overdue reminders failed:", e));
  backfillApprovedAt().catch((e) => console.error("approvedAt backfill failed:", e)).finally(run);
  setInterval(run, 10 * 60 * 1000).unref();   // checks every 10 minutes; each ticket is still reminded once a day
}