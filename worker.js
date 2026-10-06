// Cloudflare Worker for Laya's site. Handles: AI chat, photo emails, and notes you post from admin.html.
//
// Settings > Variables and Secrets:
//   ANTHROPIC_API_KEY  (secret)  for the chat
//   RESEND_API_KEY     (secret)  for photo emails
//   ADMIN_PASSWORD     (secret)  your password for admin.html
//   ALLOWED_ORIGIN     (text)    e.g. https://dumbcoder1.github.io  (lowercase, no slash at the end)
// Settings > Bindings:
//   KV namespace named NOTES     stores your notes
//   (optional) R2 bucket named PHOTOS   keeps a backup copy of photos
//
// IMPORTANT: sign up at resend.com with the same email as TO_EMAIL, because their free test mode only delivers to your own address.

const TO_EMAIL = "manilimelight769@gmail.com";

const SYSTEM = `You are a warm, gentle companion on a personal website that Kimchi made for his girlfriend Laya. She may open this when she feels sad or overwhelmed.
- Be kind, calm, and genuinely present. Listen first, reflect what she says, and ask at most one soft question at a time.
- Keep replies short and conversational (2 to 5 sentences). No lists, no lectures.
- Never pretend to be Kimchi or a human. You are an AI. You are not a therapist and don't diagnose.
- Gently encourage connection with real people (Kimchi, friends, family) and healthy basics like rest, water, and breaks when it fits.
- If she mentions self-harm, suicide, abuse, or being in danger: respond with care, take it seriously, encourage her to contact local emergency services or a crisis line in her country right now and to reach out to someone she trusts in person. Don't leave her alone in the conversation.`;

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
    const fail = (msg, status) => new Response(msg, { status, headers: cors });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const path = new URL(req.url).pathname;

    // Public: read the notes (the site calls this)
    if (req.method === "GET" && path === "/notes") {
      let list = [];
      try { list = JSON.parse((await env.NOTES.get("list")) || "[]"); } catch {}
      return json({ notes: list });
    }

    if (req.method !== "POST" || req.headers.get("Origin") !== env.ALLOWED_ORIGIN) return fail("Forbidden", 403);

    // Photos: one email with all the photos attached
    if (path === "/upload") {
      let form;
      try { form = await req.formData(); } catch { return fail("Bad request", 400); }
      const files = form.getAll("photos").filter(f => typeof f !== "string").slice(0, 10);
      const ok = ["image/jpeg", "image/png", "image/webp"];
      if (!files.length || files.some(f => !ok.includes(f.type))) return fail("Images only", 415);
      if (files.reduce((n, f) => n + f.size, 0) > 25 * 1024 * 1024) return fail("Too big", 413);

      const attachments = [];
      for (const [i, f] of files.entries()) {
        const buf = await f.arrayBuffer();
        if (env.PHOTOS) {
          const key = new Date().toISOString().slice(0, 10) + "/" + crypto.randomUUID() + ".jpg";
          await env.PHOTOS.put(key, buf, { httpMetadata: { contentType: f.type } });
        }
        let bin = "";
        const u8 = new Uint8Array(buf);
        for (let j = 0; j < u8.length; j += 0x8000) bin += String.fromCharCode(...u8.subarray(j, j + 0x8000));
        attachments.push({ filename: "laya-" + (i + 1) + ".jpg", content: btoa(bin) });
      }
      const mail = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Laya's site <onboarding@resend.dev>",
          to: [TO_EMAIL],
          subject: "Laya sent you " + files.length + " photo" + (files.length > 1 ? "s" : ""),
          html: "<p>Laya just sent you " + files.length + " photo" + (files.length > 1 ? "s" : "") + ". They're attached.</p>",
          attachments,
        }),
      });
      if (!mail.ok) return fail("Mail error", 502);
      return json({ ok: true });
    }

    let body;
    try { body = await req.json(); } catch { return fail("Bad request", 400); }

    // Admin: add or delete a note (needs your password)
    if (path === "/admin/add" || path === "/admin/delete") {
      if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) {
        await new Promise(r => setTimeout(r, 1000)); // slows down password guessing
        return fail("Wrong password", 401);
      }
      let list = [];
      try { list = JSON.parse((await env.NOTES.get("list")) || "[]"); } catch {}
      if (path === "/admin/add") {
        const text = String(body.text || "").trim().slice(0, 3000);
        if (!text) return fail("Empty note", 400);
        list.push({ id: crypto.randomUUID(), date: new Date().toISOString(), text });
      } else {
        list = list.filter(n => n.id !== body.id);
      }
      await env.NOTES.put("list", JSON.stringify(list));
      return json({ ok: true, notes: list });
    }

    // Default: AI chat
    const messages = (body.messages || []).slice(-20)
      .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!messages.length || messages[0].role !== "user") return fail("Bad request", 400);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 500, system: SYSTEM, messages }),
    });
    if (!r.ok) return fail("Upstream error", 502);
    const data = await r.json();
    const reply = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    return json({ reply });
  },
};
