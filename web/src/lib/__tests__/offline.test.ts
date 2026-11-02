import { beforeEach, describe, expect, it } from "vitest";
import { __resetDBForTests, clearLocalData } from "../offline/db";
import { enqueue, listOutbox } from "../offline/outbox";
import { resultId, wellnessId } from "../offline/ids";
import { friendlyError, isTransient, syncOutbox, type Uploader } from "../offline/sync";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(async () => {
  __resetDBForTests();
  await clearLocalData();
});

describe("ids deterministas", () => {
  it("misma clave natural => mismo id (idempotencia offline)", async () => {
    const a = await resultId("s1", "p1", "m1", 1);
    expect(a).toMatch(UUID);
    expect(await resultId("s1", "p1", "m1", 1)).toBe(a);
    expect(await resultId("s1", "p1", "m1", 2)).not.toBe(a);
    expect(await wellnessId("p1", "2026-05-01")).not.toBe(await wellnessId("p1", "2026-05-02"));
  });
});

describe("outbox", () => {
  it("una edición del mismo registro reemplaza la pendiente", async () => {
    await enqueue("results", { id: "r1", value: 1.9 });
    await enqueue("results", { id: "r1", value: 1.85 });
    const items = await listOutbox();
    expect(items).toHaveLength(1);
    expect(items[0].row.value).toBe(1.85);
  });
});

describe("sync", () => {
  it("sube sesiones antes que resultados y vacía la outbox", async () => {
    await enqueue("results", { id: "r1", session_id: "s1", value: 1 });
    await enqueue("evaluation_sessions", { id: "s1" });
    const calls: string[] = [];
    const upload: Uploader = async (table) => {
      calls.push(table);
      return { error: null };
    };
    const report = await syncOutbox(upload);
    expect(calls).toEqual(["evaluation_sessions", "results"]);
    expect(report.synced).toBe(2);
    expect(await listOutbox()).toHaveLength(0);
  });

  it("sin red: no pierde nada y queda pendiente", async () => {
    await enqueue("results", { id: "r1", value: 1 });
    const report = await syncOutbox(async () => ({ error: { message: "TypeError: Failed to fetch", code: "" } }));
    expect(report.pending).toBe(1);
    const [item] = await listOutbox();
    expect(item.status).toBe("pending");
    expect(item.attempts).toBe(1);
  });

  it("un dato inválido no frena al resto del lote", async () => {
    await enqueue("results", { id: "ok1", value: 1 });
    await enqueue("results", { id: "bad", value: 99 });
    await enqueue("results", { id: "ok2", value: 2 });
    const upload: Uploader = async (_t, rows) =>
      rows.some((r) => r.id === "bad")
        ? { error: { message: "Valor 99 fuera de rango para \"Sprint 10 m\"", code: "23514", hint: "out_of_range" } }
        : { error: null };
    const report = await syncOutbox(upload);
    expect(report).toMatchObject({ synced: 2, failed: 1 });
    const left = await listOutbox();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ key: "results:bad", status: "error" });
    expect(left[0].error).toMatch(/fuera de rango/);
  });

  it("los registros con error de datos no se reintentan solos", async () => {
    await enqueue("results", { id: "bad", value: 1 });
    await syncOutbox(async () => ({ error: { message: "x", code: "P0001", hint: "consent_required" } }));
    let called = false;
    await syncOutbox(async () => {
      called = true;
      return { error: null };
    });
    expect(called).toBe(false);
  });
});

describe("lesiones sin señal", () => {
  it("se suben al final (después de sesiones/resultados/bienestar) y se reintentan sin duplicar", async () => {
    await enqueue("injuries", { id: "i1", player_id: "p1" });
    await enqueue("wellness_logs", { id: "w1", player_id: "p1" });
    const calls: string[] = [];
    let fail = true;
    const upload: Uploader = async (table) => {
      calls.push(table);
      if (table === "injuries" && fail) return { error: { message: "Failed to fetch", code: "" } };
      return { error: null };
    };
    const first = await syncOutbox(upload);
    expect(calls).toEqual(["wellness_logs", "injuries"]);
    expect(first.pending).toBe(1);
    expect((await listOutbox()).map((i) => i.key)).toEqual(["injuries:i1"]);
    fail = false;
    const second = await syncOutbox(upload);
    expect(second.synced).toBe(1);
    expect(await listOutbox()).toHaveLength(0);
  });

  it("sin consentimiento de salud queda en error con mensaje claro", async () => {
    await enqueue("injuries", { id: "i2", player_id: "p2" });
    await syncOutbox(async () => ({ error: { message: "Falta consentimiento", code: "P0001", hint: "consent_required" } }));
    const [item] = await listOutbox();
    expect(item.status).toBe("error");
    expect(item.error).toMatch(/consentimiento/);
  });
});

describe("clasificación de errores", () => {
  it("red / JWT vencido son transitorios; datos y permisos no", () => {
    expect(isTransient({ message: "Failed to fetch", code: "" })).toBe(true);
    expect(isTransient({ message: "JWT expired", code: "PGRST301" })).toBe(true);
    expect(isTransient({ message: "x", code: "23514" })).toBe(false);
    expect(isTransient({ message: "new row violates row-level security policy", code: "42501" })).toBe(false);
  });
  it("mensajes entendibles para la cancha", () => {
    expect(friendlyError({ message: "...", code: "P0001", hint: "consent_required" })).toMatch(/consentimiento/);
    expect(friendlyError({ message: "new row violates row-level security policy", code: "42501" })).toMatch(/permiso/);
  });
});
