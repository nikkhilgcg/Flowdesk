import "dotenv/config";
import cors from "cors";
import express from "express";
import { auth, authRouter } from "./auth.js";
import { processRouter } from "./processes.js";
import { usersRouter } from "./users.js";
import { prisma } from "./db.js";
import { HttpError } from "./util.js";

const app = express();
app.set("trust proxy", 1); // behind nginx, so rate limits see the real visitor address
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/users", auth, usersRouter);
app.use("/api", auth, processRouter);

// eslint-disable-next-line no-unused-vars
app.use((e, _req, res, _next) => {
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
  if (e?.type === "entity.too.large") return res.status(413).json({ error: "That file is too large. Images can be up to 8 MB" });
  if (e?.name === "ZodError") return res.status(400).json({ error: "Invalid input" });
  console.error(e);
  res.status(500).json({ error: "Something went wrong" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));

// Clients that existed before managers owned clients have no manager. When there is exactly one manager, they get it.
// (With several managers, set Client.managerId yourself: see README.)
(async () => {
  const managers = await prisma.user.findMany({ where: { role: "MANAGER" }, select: { id: true } });
  if (managers.length !== 1) return;
  for (const c of await prisma.client.findMany({ where: { managerId: null }, select: { id: true } }))
    await prisma.client.update({ where: { id: c.id }, data: { managerId: managers[0].id } }).catch(() => {});
})().catch(() => {});

// Images uploaded for a ticket or comment that was never sent are removed after a day.
setInterval(
  () => prisma.attachment.deleteMany({ where: { OR: [{ processId: null }, { inComment: true, eventId: null }], createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } }).catch(() => {}),
  3600 * 1000
).unref();
