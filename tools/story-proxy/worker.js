// LOCAL-ONLY passthrough to Workers AI for tools/make-stories.mjs. Run with `npx wrangler dev --remote` in this folder
// and never deploy it: it has no authentication.
export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return new Response('POST only', { status: 405 });
    const { model, messages, opts } = await req.json();
    const r = await env.AI.run(model, { messages, ...opts });
    return Response.json({ text: r.choices?.[0]?.message?.content ?? r.response ?? '' });
  },
};
