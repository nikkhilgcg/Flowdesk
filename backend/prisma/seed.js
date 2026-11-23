import bcrypt from "bcryptjs";
import pkg from "@prisma/client";

const prisma = new pkg.PrismaClient();
const PASSWORD = "password123";
const FLOW = ["TODO", "IN_PROGRESS", "IN_REVIEW", "APPROVED"];

async function main() {
  // Never wipe a database that already has people in it, unless explicitly forced.
  if (process.env.FORCE_SEED !== "true" && (await prisma.user.count()) > 0) {
    console.log("Database already has users, skipping seed. (Set FORCE_SEED=true to wipe and reseed.)");
    return;
  }
  await prisma.notification.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.processEvent.deleteMany();
  await prisma.process.deleteMany();
  // Clients and users point at each other, so break the links before deleting.
  await prisma.client.updateMany({ data: { managerId: null } });
  await prisma.user.updateMany({ data: { clientId: null } });
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const user = (name, email, role, clientId) =>
    prisma.user.create({ data: { name, email, role, passwordHash: hash, clientId } });

  // Two managers. Each owns their own clients and never sees the other's.
  const riya = await user("Riya Mehta", "riya@flowdesk.test", "MANAGER");
  const karan = await user("Karan Verma", "karan@flowdesk.test", "MANAGER");
  const client = (name, managerId) => prisma.client.create({ data: { name, managerId } });
  const gt = await client("GT", riya.id);
  const acme = await client("Acme Corp", riya.id);
  const nw = await client("Northwind", karan.id);
  const zenith = await client("Zenith Labs", karan.id);
  await client("In house", riya.id);
  await client("In house", karan.id);
  const manager = { [gt.id]: riya, [acme.id]: riya, [nw.id]: karan, [zenith.id]: karan };

  // Employees are shared: they can be assigned work by either manager.
  const arjun = await user("Arjun Rao", "arjun@flowdesk.test", "ASSIGNEE");
  const sana = await user("Sana Khan", "sana@flowdesk.test", "ASSIGNEE");
  const dev = await user("Dev Patel", "dev@flowdesk.test", "ASSIGNEE");
  await user("GT Portal User", "gt@client.test", "CLIENT", gt.id);
  await user("Acme Portal User", "acme@client.test", "CLIENT", acme.id);
  await user("Northwind Portal User", "northwind@client.test", "CLIENT", nw.id);
  await user("Zenith Portal User", "zenith@client.test", "CLIENT", zenith.id);

  // Created in order on a fresh table, so they become TKT-101 ... TKT-107
  const rows = [
    ["Quarterly filing preparation", "Collect ledgers and prepare the filing pack for GT.", gt.id, arjun.id, "IN_REVIEW", "HIGH", "2026-11-20", 0],
    ["Vendor onboarding checklist", "Verify vendor documents and complete the onboarding checklist.", gt.id, sana.id, "IN_PROGRESS", "MEDIUM", "2026-11-25", 1],
    ["Annual compliance review", "Review last year findings and update the compliance tracker.", acme.id, arjun.id, "TODO", "HIGH", "2026-11-18", 0],
    ["Invoice reconciliation", "Reconcile open invoices against bank statements.", acme.id, dev.id, "IN_PROGRESS", "LOW", "2026-12-02", 0],
    ["Policy document refresh", "Refresh and republish the internal policy documents.", nw.id, sana.id, "APPROVED", "LOW", "2026-11-10", 0],
    ["Audit evidence collection", "Collect and index audit evidence.", nw.id, dev.id, "IN_REVIEW", "MEDIUM", "2026-11-22", 2],
    ["Contract renewal workflow", "Prepare renewal terms and route for sign-off.", gt.id, dev.id, "TODO", "MEDIUM", "2026-12-05", 0],
    ["Brand asset handover", "Collect and hand over the final brand assets.", zenith.id, arjun.id, "IN_PROGRESS", "MEDIUM", "2026-11-28", 0],
  ];
  for (const [title, description, clientId, assigneeId, status, priority, due, reworkCount] of rows) {
    const p = await prisma.process.create({
      data: { title, description, clientId, assigneeId, status, priority, dueDate: new Date(due), reworkCount },
    });
    await prisma.processEvent.create({ data: { processId: p.id, actorId: manager[clientId].id, type: "CREATED" } });
    for (let i = 1; i <= FLOW.indexOf(status); i++) {
      await prisma.processEvent.create({
        data: {
          processId: p.id,
          actorId: FLOW[i] === "APPROVED" ? manager[clientId].id : assigneeId,
          type: "STATUS",
          fromStatus: FLOW[i - 1],
          toStatus: FLOW[i],
        },
      });
    }
  }
  console.log(`Seeded. All demo users have the password: ${PASSWORD}`);
}

main().finally(() => prisma.$disconnect());
