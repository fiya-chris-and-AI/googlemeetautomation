import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase";

// POST: Create the app_users table if it doesn't exist
export async function POST() {
    try {
        const session = await getSessionFromCookies();
        if (!session || session.role !== "admin") {
            return NextResponse.json({ error: "Nur Administratoren" }, { status: 403 });
        }

        const sb = getServerSupabase();

        // Check if table exists
        const { error: checkError } = await sb.from("app_users").select("id").limit(1);

        if (checkError && checkError.message.includes("app_users")) {
            // Table doesn't exist — we need to create it via SQL
            // Use the Supabase SQL query endpoint
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

            // Extract project ref from URL
            const projectRef = supabaseUrl.replace("https://", "").split(".")[0];

            const sqlResponse = await fetch(
                `https://${projectRef}.supabase.co/rest/v1/`,
                {
                    method: "GET",
                    headers: {
                        apikey: serviceKey,
                        Authorization: `Bearer ${serviceKey}`,
                    },
                }
            );

            // Try creating via a raw SQL using the management API
            // Since we can't run DDL via PostgREST, we'll use a workaround:
            // Create the table by inserting and letting Supabase auto-create
            // Actually, the user needs to create the table in the Supabase SQL editor
            return NextResponse.json({
                needsManualSetup: true,
                sql: `CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`,
                message:
                    "Bitte erstelle die Tabelle im Supabase SQL Editor mit dem angegebenen SQL-Befehl.",
            });
        }

        return NextResponse.json({ success: true, message: "Tabelle existiert bereits" });
    } catch (error) {
        console.error("[Admin] Setup error:", error);
        return NextResponse.json({ error: "Setup fehlgeschlagen" }, { status: 500 });
    }
}
