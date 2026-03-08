/**
 * Backfill decision assignees — uses Gemini to determine who proposed/championed
 * each existing decision based on source_text and context.
 *
 * Usage: npx tsx scripts/backfill-decision-assignees.ts
 */
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_KEY = process.env.GEMINI_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY) {
    console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY');
    process.exit(1);
}

// ── Supabase helpers (raw REST to avoid import issues) ──

async function supabaseGet(table: string, params: string = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
        },
    });
    return res.json();
}

async function supabaseUpdate(table: string, id: string, body: Record<string, unknown>) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
        body: JSON.stringify(body),
    });
    return res.ok;
}

// ── Gemini helper ──

async function callGemini(prompt: string): Promise<string> {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 8192 },
            }),
        },
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Main ──

async function main() {
    console.log('Fetching decisions with no assigned_to...');
    const decisions = await supabaseGet(
        'decisions',
        'assigned_to=is.null&select=id,decision_text,context,source_text,participants&limit=500',
    );

    if (!Array.isArray(decisions) || decisions.length === 0) {
        console.log('No unassigned decisions found. Done.');
        return;
    }

    console.log(`Found ${decisions.length} unassigned decisions. Processing in batches of 20...`);

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 20;
    let updated = 0;

    for (let i = 0; i < decisions.length; i += BATCH_SIZE) {
        const batch = decisions.slice(i, i + BATCH_SIZE);

        const prompt = `You are assigning decision ownership. For each decision below, determine who PROPOSED or CHAMPIONED it based on the source text and context.

Return a JSON array with objects in this format: [{"id": "...", "assigned_to": "Lutfiya Miller" | "Chris Müller" | null}]

The only valid values for assigned_to are:
- "Lutfiya Miller" — if Lutfiya/Dr. Miller proposed or championed this decision
- "Chris Müller" — if Chris/Chris Muller/Chris-Steven proposed or championed this decision
- null — if it's unclear or truly joint

Decisions to classify:
${batch.map((d: any, idx: number) => `${idx + 1}. ID: ${d.id}
   Decision: ${d.decision_text}
   Context: ${d.context ?? 'N/A'}
   Source: ${d.source_text ?? 'N/A'}
   Participants: ${(d.participants ?? []).join(', ')}`).join('\n\n')}

Return ONLY valid JSON, no markdown fences.`;

        try {
            const rawResponse = await callGemini(prompt);
            const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const assignments: { id: string; assigned_to: string | null }[] = JSON.parse(cleaned);

            for (const assignment of assignments) {
                if (assignment.assigned_to) {
                    const ok = await supabaseUpdate('decisions', assignment.id, {
                        assigned_to: assignment.assigned_to,
                    });
                    if (ok) updated++;
                }
            }

            console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: processed ${batch.length} → ${assignments.filter(a => a.assigned_to).length} assigned`);
        } catch (err) {
            console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err);
        }

        // Brief pause between batches to respect rate limits
        if (i + BATCH_SIZE < decisions.length) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    console.log(`\nDone. Updated ${updated} of ${decisions.length} decisions.`);
}

main().catch(console.error);
