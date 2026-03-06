import { useState } from "react";

/* ─────────────────────────────── DATA ─────────────────────────────── */
const CATEGORIES = [
  { letter: "A", icon: "\uD83C\uDF10", name: "Community Platform", fullName: "Community Platform (ScienceExperts.ai)" },
  { letter: "B", icon: "\uD83D\uDCE2", name: "Content & Marketing", fullName: "Content & Marketing" },
  { letter: "C", icon: "\u2699\uFE0F", name: "Tools & Workflow", fullName: "Tools & Workflow" },
  { letter: "D", icon: "\uD83D\uDCBC", name: "Client & Consulting", fullName: "Client & Consulting Work" },
  { letter: "E", icon: "\uD83D\uDC65", name: "Team & Operations", fullName: "Team & Operations" },
  { letter: "F", icon: "\uD83D\uDCDA", name: "Knowledge Management", fullName: "Knowledge Management" },
  { letter: "G", icon: "\uD83D\uDD27", name: "Infrastructure", fullName: "Infrastructure & DevOps" },
];

const INITIAL_ACTIONS = [
  { id:"A1", title:"Purchase scienceexperts.ai domain", status:"done", owners:[{n:"Lutfiya",f:"us"},{n:"Chris",f:"de"}], date:"~Late Jan 2026", evidence:"Domain bought during loom_ec093fd session (Spaceship, ~$17 USD). Confirmed owned and active.", cat:"A" },
  { id:"A2", title:"Set up email addresses on scienceexperts.ai domain", status:"progress", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"~Late Jan 2026", evidence:"Discussed needing admin@ and personal addresses. Google Workspace or Resend mentioned as options.", cat:"A" },
  { id:"A3", title:"Deploy community to Vercel with custom domain", status:"progress", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Jan 24", evidence:"DNS/nameserver config discussed. Community is deployed but domain not yet pointed.", cat:"A" },
  { id:"A4", title:"Implement DeepL runtime translation layer", status:"done", owners:[{n:"Chris",f:"de"}], date:"Jan 16\u201320", evidence:"Translation PR merged. DeepL API key configured and operational.", cat:"A" },
  { id:"A5", title:"Build translation blacklist (preserve terms like \u201Cskills\u201D, brand names)", status:"planned", owners:[{n:"Lutfiya",f:"us"}], date:"~Late Jan 2026", evidence:"Discussed in context of community names getting mangled by translation. No implementation seen yet.", cat:"A" },
  { id:"A6", title:"Add drag-and-drop resource upload to admin panel", status:"progress", owners:[{n:"Lutfiya",f:"us"}], date:"Feb 22", evidence:"Multi-file-type support requested (PDF, MP4, images). Development prompted via GSD.", cat:"A" },
  { id:"A7", title:"Set up separate dev and production environments", status:"done", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Feb 22", evidence:"Site went offline during dev work, prompting the need for separation. Dev env reset completed.", cat:"A" },
  { id:"A8", title:"Connect Resend API for community email campaigns", status:"planned", owners:[{n:"Lutfiya",f:"us"}], date:"Feb 22", evidence:"Mentioned wanting centralized email through ScienceExperts.ai domain.", cat:"A" },
  { id:"B1", title:"Start YouTube channel and publish AI content", status:"progress", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Jan 16\u201328", evidence:"Discussed repeatedly. Chris has YouTube expertise; Lutfiya cautious about posting before leaving day job.", cat:"B" },
  { id:"B2", title:"Build Chrome extension for localized event-based ad generation", status:"done", owners:[{n:"Chris",f:"de"}], date:"Jan 28\u201329", evidence:"Working prototype shown Jan 29. Generates posts based on local events + VPN location.", cat:"B" },
  { id:"B3", title:"Create community course modules (agentic workflows for life sciences)", status:"progress", owners:[{n:"Lutfiya",f:"us"},{n:"Chris",f:"de"}], date:"Feb 22", evidence:"Extensive brainstorming session. 20+ ideas generated. Key modules: literature search automation, regulatory workflows.", cat:"B" },
  { id:"B4", title:"Post LinkedIn page / professional profile", status:"progress", owners:[{n:"Lutfiya",f:"us"}], date:"~Late Jan 2026", evidence:"Explicitly stated waiting until resignation from day job. On strategic hold.", cat:"B" },
  { id:"B5", title:"Develop content positioning strategy", status:"progress", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Jan 28", evidence:"Discussed using flat vector stories, case studies instead of direct medical terminology.", cat:"B" },
  { id:"B6", title:"Finalize community pricing tiers", status:"progress", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Feb 22", evidence:"Three tiers discussed: Free/Explorer, Pro/Practitioner, Enterprise. Stripe integration pending.", cat:"B" },
  { id:"C1", title:"Set up Anti-Gravity as primary development IDE", status:"done", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Dec 16\u201318", evidence:"Both actively using. Chris has multi-monitor setup (middle=Anti-Gravity, left=terminal, right=browser).", cat:"C" },
  { id:"C2", title:"Install CleanShot Pro for screenshots/annotations", status:"done", owners:[{n:"Lutfiya",f:"us"}], date:"Jan 24", evidence:"Purchased via AppSumo bundle during Jan 24 call. Keyboard shortcuts configured.", cat:"C" },
  { id:"C3", title:"Watch Nick Sayer\u2019s Anti-Gravity agent video", status:"progress", owners:[{n:"Lutfiya",f:"us"}], date:"Jan 24", evidence:"Chris sent link; Lutfiya acknowledged but completion not confirmed in transcripts.", cat:"C" },
  { id:"C4", title:"Try Anthropic agent manager / sub-agent architecture", status:"progress", owners:[{n:"Chris",f:"de"}], date:"~Late Jan 2026", evidence:"Chris planning to test $200 plan. Gave Lutfiya a DJ tool prompt to test the concept.", cat:"C" },
  { id:"C5", title:"Evaluate video automation (Remotion)", status:"abandoned", owners:[{n:"Chris",f:"de"}], date:"Jan 28", evidence:"Tested but quality insufficient. Concluded AI video generation not ready for production use.", cat:"C" },
  { id:"D1", title:"Evaluate pharma client\u2019s RAG system for IND document assembly", status:"progress", owners:[{n:"Lutfiya",f:"us"}], date:"Jan 29", evidence:"Preliminary scoping phase. Checking Module 4 to Module 2 mapping, dose levels, study summaries.", cat:"D" },
  { id:"D2", title:"Obtain archive study reports from former colleague for testing", status:"planned", owners:[{n:"Lutfiya",f:"us"}], date:"Jan 29", evidence:"Colleague agreed to share 10\u201315 archived INDs. Email request pending.", cat:"D" },
  { id:"D3", title:"Build Study Monitor prototype (data viz for CRO labs)", status:"progress", owners:[{n:"Lutfiya",f:"us"}], date:"~Feb 2026", evidence:"Prototype built with mock data. Hematology & clinical chemistry visualizations. Planning demo call.", cat:"D" },
  { id:"D4", title:"Deploy personal website (3rdai.com)", status:"progress", owners:[{n:"Lutfiya",f:"us"}], date:"~Feb 2026", evidence:"Website done, deployment blocked by Gemini timeout. Admin dashboard + CRM + blog auto-generation added.", cat:"D" },
  { id:"E1", title:"Recruit Thai for security/development role", status:"planned", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Jan 28", evidence:"Both agree Thai has credibility from hackathon. Chris wants to approach once platform is further along.", cat:"E" },
  { id:"E2", title:"Evaluate Med for AWS/infrastructure role", status:"planned", owners:[{n:"Lutfiya",f:"us"}], date:"Jan 28", evidence:"Med is in Nashville, builds VS Code extensions, has AWS expertise. Never met in person.", cat:"E" },
  { id:"E3", title:"Recruit Jennifer for outreach/community growth", status:"planned", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Jan 20", evidence:"Discussed as potential team member for international outreach.", cat:"E" },
  { id:"E4", title:"Touch base with BrazilNut hackathon group", status:"progress", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Jan 28", evidence:"Chris flagged the group may feel neglected. Needs communication to maintain engagement.", cat:"E" },
  { id:"F1", title:"Put Loom transcripts into NotebookLM for knowledge extraction", status:"progress", owners:[{n:"Chris",f:"de"}], date:"Jan 24", evidence:"Chris has been creating gems from various video sources. 180+ MD files from community noted.", cat:"F" },
  { id:"F2", title:"Set up shared NotebookLM workspace", status:"done", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Jan 24", evidence:"Lutfiya added as editor to Chris's NotebookLM via 3rdAI email. 98 sources shared.", cat:"F" },
  { id:"F3", title:"Import AWS training transcripts into NotebookLM", status:"progress", owners:[{n:"Lutfiya",f:"us"}], date:"Jan 24", evidence:"Found local folder with AWS transcripts. Upload to Google Drive discussed.", cat:"F" },
  { id:"G1", title:"Set up Amazon Bedrock for secure file AI access", status:"progress", owners:[{n:"Lutfiya",f:"us"}], date:"~Late Jan 2026", evidence:"Account validation error on AWS. Needs resolution to use AI models on sensitive files.", cat:"G" },
  { id:"G2", title:"Conduct security audit before community launch", status:"planned", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Jan 28", evidence:"Thai reviewed code in security call \u2014 found nothing concerning. Need someone with deep software security expertise.", cat:"G" },
  { id:"E5", title:"Set up international payment processing (Stripe + alternatives)", status:"blocked", owners:[{n:"Chris",f:"de"},{n:"Lutfiya",f:"us"}], date:"Feb 22", evidence:"Stripe requires US entity or EIN. Evaluating Lemon Squeezy and Paddle as alternatives for EU/international.", cat:"E" },
  { id:"B7", title:"Record first ScienceExperts.ai explainer video", status:"done", owners:[{n:"Chris",f:"de"}], date:"Feb 15", evidence:"Chris recorded screen walkthrough of community platform features. Ready for editing.", cat:"B" },
];

const INITIAL_DECISIONS = [
  { id:"D01", text:"Community name: ScienceExperts.ai", context:"Evolved from \"3rd AI Community\" to \"ScienceExperts\" to \"ScienceExperts.ai\". Final name confirmed when domain was purchased.", date:"Jan 2026", domain:"Business", domainClass:"business", confidence:3, superseded:false },
  { id:"D02", text:"US legal jurisdiction for community", context:"LLC formation in Texas. Chris recommended US entity for payment processing. Lutfiya's location makes this practical.", date:"Jan 20", domain:"Operations", domainClass:"operations", confidence:3, superseded:false },
  { id:"D03", text:"Build custom community platform (not School)", context:"Pivoted away from Skool early on. Custom Next.js build gives full control over features, branding, and data.", date:"Dec 2025", domain:"Architecture", domainClass:"architecture", confidence:3, superseded:false },
  { id:"D04", text:"DeepL for runtime translation (not Google Translate)", context:"DeepL chosen for quality. Runtime approach means content stored in English, translated on-demand per user locale.", date:"Jan 16", domain:"Architecture", domainClass:"architecture", confidence:3, superseded:false },
  { id:"D05", text:"Flat vector illustration style for brand visuals", context:"Chris proposed; both agreed it avoids \"stock photo\" look and scales across cultures. Works well for science content.", date:"Jan 20", domain:"Design", domainClass:"design", confidence:2, superseded:false },
  { id:"D06", text:"Supabase as primary database and auth provider", context:"Already integrated with community platform. Row-level security, real-time subscriptions, auth out of the box.", date:"Dec 2025", domain:"Architecture", domainClass:"architecture", confidence:3, superseded:false },
  { id:"D07", text:"Three-tier pricing: Free / Pro / Enterprise", context:"Free tier for discovery, Pro for individual scientists, Enterprise for pharma teams. Exact pricing TBD.", date:"Feb 22", domain:"Business", domainClass:"business", confidence:2, superseded:false },
  { id:"D08", text:"MeetScript as internal meeting intelligence tool", context:"Built by Lutfiya for processing Loom recordings. Gemini 2.5 Flash for extraction, OpenAI for embeddings.", date:"Jan 2026", domain:"Product", domainClass:"product", confidence:3, superseded:false },
  { id:"D09", text:"Thai as priority security hire", context:"Met at BrazilNut hackathon. Demonstrated security expertise. Both co-founders trust his judgment.", date:"Jan 28", domain:"Operations", domainClass:"operations", confidence:2, superseded:false },
  { id:"D10", text:"Wait on public LinkedIn until Lutfiya\u2019s resignation", context:"Strategic hold to avoid employer complications. Will launch coordinated social presence after transition.", date:"Jan 2026", domain:"Business", domainClass:"business", confidence:3, superseded:false },
  { id:"D11", text:"Vercel for frontend deployment", context:"Already in use for community platform. Good DX, preview deployments, edge functions.", date:"Dec 2025", domain:"Infrastructure", domainClass:"infrastructure", confidence:3, superseded:false },
  { id:"D12", text:"Science professionals (not students) as primary audience", context:"Focus on working scientists, regulatory professionals, and pharma teams\u2014not academic students.", date:"Jan 20", domain:"Product", domainClass:"product", confidence:3, superseded:false },
  { id:"D13", text:"English as primary content language, German as first translation", context:"Content authored in English. DeepL handles German + other languages at runtime.", date:"Jan 16", domain:"Product", domainClass:"product", confidence:3, superseded:false },
  { id:"D14", text:"Agentic workflows as core curriculum differentiator", context:"Not just \"AI for scientists\" but hands-on agentic workflow training. Literature search, regulatory filing, lab data analysis.", date:"Feb 22", domain:"Product", domainClass:"product", confidence:2, superseded:false },
  { id:"D15", text:"No AI-generated video for now (quality insufficient)", context:"Chris tested Remotion and other tools. Quality not production-ready. Will revisit when technology improves.", date:"Jan 28", domain:"Design", domainClass:"design", confidence:2, superseded:false },
  { id:"D16", text:"Shared NotebookLM as knowledge base", context:"Central repository for meeting insights, research, and content planning. 98+ sources loaded.", date:"Jan 24", domain:"Operations", domainClass:"operations", confidence:2, superseded:false },
  { id:"D17", text:"Spaceship as domain registrar", context:"Chosen for price (~$17) and simplicity. DNS management adequate for current needs.", date:"Jan 2026", domain:"Infrastructure", domainClass:"infrastructure", confidence:2, superseded:false },
  { id:"D18", text:"Anti-Gravity as primary development environment", context:"Both co-founders adopted early. Multi-agent architecture aligns with their development philosophy.", date:"Dec 2025", domain:"Architecture", domainClass:"architecture", confidence:3, superseded:false },
  { id:"D19", text:"Case studies over direct marketing for content strategy", context:"Show don\u2019t tell. Real-world examples of AI in science resonate better than feature lists.", date:"Jan 28", domain:"Design", domainClass:"design", confidence:2, superseded:false },
  { id:"D20", text:"Security-first architecture for science community", context:"Non-negotiable given audience handles sensitive research and regulatory data. Audit before launch.", date:"Jan 28", domain:"Architecture", domainClass:"architecture", confidence:3, superseded:false },
];

const THEMES = [
  { freq:"3+ calls", title:"Payment gateway challenges (international)", desc:"Stripe requires US entity; alternatives like Lemon Squeezy and Paddle being evaluated for EU/international support." },
  { freq:"2 calls", title:"BrazilNut group engagement risk", desc:"Hackathon team may feel neglected. Chris flagged need for proactive communication to maintain engagement." },
  { freq:"3+ calls", title:"Lutfiya\u2019s day job transition timing", desc:"Multiple decisions (LinkedIn, public profile, YouTube) deliberately delayed until after resignation." },
  { freq:"4+ calls", title:"Chris\u2019s concern about AI content looking generic", desc:"Recurring push for distinctive visual style, flat vectors, and authentic case studies over \u201CAI slop.\u201D" },
  { freq:"2 calls", title:"Security as non-negotiable for science community", desc:"Both co-founders agree: audience handles sensitive data. Security audit required before any public launch." },
];

const CHECKLIST = [
  { text: "Deduplicate transcripts \u2014 Use video_id from headers. Import only one transcript per unique session." },
  { text: "Skip 3 empty transcripts \u2014 2026-02-02, 2026-02-06, loom_e5793ef contain no content." },
  { text: "Set canonical speakers \u2014 Map all \u201CSpeaker\u201D labels to Chris M\u00FCller or Lutfiya Miller." },
  { text: "Infer dates for Loom-ID files \u2014 Use _manifest.json dates when transcript headers lack dates." },
  { text: "Mark historical action items \u2014 Import with is_historical: true flag to avoid polluting active tracker." },
  { text: "Mark historical decisions \u2014 Import with is_historical: true and link to superseding decision if applicable." },
  { text: "Apply tags during import \u2014 community-platform, marketing, meetscript, design, business, consulting, infra." },
];

const STATS = { sessions: 27, transcripts: 39, hours: "~45", words: "~290K", days: 68 };

/* ─────────── STATUS CONFIG ─────────── */
const STATUS_CONFIG = {
  done:      { label: "Done",        bg: "#DCFCE7", color: "#16A34A", icon: "\u2713" },
  progress:  { label: "In Progress", bg: "#FEF3C7", color: "#D97706", icon: "\u25C8" },
  planned:   { label: "Planned",     bg: "#DBEAFE", color: "#2563EB", icon: "\u25CF" },
  blocked:   { label: "Blocked",     bg: "#FEE2E2", color: "#DC2626", icon: "\u26A0" },
  abandoned: { label: "Abandoned",   bg: "#F3F4F6", color: "#6B7280", icon: "\u2715" },
};

const DOMAIN_COLORS = {
  architecture:   { bg: "#EDE9FE", color: "#7C3AED" },
  product:        { bg: "#DBEAFE", color: "#2563EB" },
  business:       { bg: "#FEF3C7", color: "#D97706" },
  design:         { bg: "#FCE7F3", color: "#DB2777" },
  infrastructure: { bg: "#D1FAE5", color: "#059669" },
  operations:     { bg: "#E0E7FF", color: "#4F46E5" },
};

/* ─────────── FLAG COMPONENTS ─────────── */
const FlagDot = ({ flag, size = 12 }) => {
  const gradients = {
    de: "linear-gradient(180deg, #000 33%, #DD0000 33% 66%, #FFCC00 66%)",
    us: "linear-gradient(180deg, #3C3B6E 45%, #B22234 45% 65%, white 65% 75%, #B22234 75%)",
  };
  return (
    <span style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: gradients[flag], border: "1px solid rgba(0,0,0,0.08)",
      verticalAlign: "middle", marginRight: 2, flexShrink: 0,
    }} />
  );
};

const FlagCircle = ({ flag, size = 44 }) => {
  const gradients = {
    de: "linear-gradient(180deg, #000 33%, #DD0000 33% 66%, #FFCC00 66%)",
    us: "linear-gradient(180deg, #3C3B6E 40%, #B22234 40% 55%, white 55% 62%, #B22234 62% 77%, white 77% 84%, #B22234 84%)",
  };
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: gradients[flag],
      boxShadow: "0 0 0 2px white, 0 0 0 3px #E5E5E5", flexShrink: 0,
    }} />
  );
};

/* ─────────── PROGRESS RING ─────────── */
const ProgressRing = ({ percent, size = 64 }) => {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E5E5" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#16A34A" strokeWidth={5}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: "rotate(90deg)", transformOrigin: "center", fontSize: 14, fontWeight: 700, fill: "#1A1A1A" }}>
        {percent}%
      </text>
    </svg>
  );
};

/* ─────────── CONFIDENCE DOTS ─────────── */
const ConfidenceDots = ({ filled, total = 3 }) => (
  <span style={{ display: "inline-flex", gap: 3, marginLeft: 6 }}>
    {Array.from({ length: total }, (_, i) => (
      <span key={i} style={{
        width: 6, height: 6, borderRadius: "50%",
        background: i < filled ? "#D42B2B" : "#E5E5E5",
      }} />
    ))}
  </span>
);

/* ═══════════════════════════════ MAIN COMPONENT ═══════════════════════════════ */
export default function BacklogReview() {
  const [actions, setActions] = useState(INITIAL_ACTIONS);
  const [filter, setFilter] = useState("all");
  const [expandedEvidence, setExpandedEvidence] = useState({});
  const [checklistState, setChecklistState] = useState(() => CHECKLIST.map(() => false));
  const [activeTab, setActiveTab] = useState("actions");
  const [celebrateId, setCelebrateId] = useState(null);

  /* ── Computed Stats ── */
  const statusCounts = actions.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});
  const doneCount = statusCounts.done || 0;
  const totalCount = actions.length;
  const completionPct = Math.round((doneCount / totalCount) * 100);

  /* ── Toggle action status ── */
  const cycleStatus = (id) => {
    setActions(prev => prev.map(a => {
      if (a.id !== id) return a;
      const order = ["planned", "progress", "done", "blocked", "abandoned"];
      const idx = order.indexOf(a.status);
      const next = order[(idx + 1) % order.length];
      if (next === "done") {
        setCelebrateId(id);
        setTimeout(() => setCelebrateId(null), 1200);
      }
      return { ...a, status: next };
    }));
  };

  /* ── Filter logic ── */
  const filteredActions = filter === "all" ? actions : actions.filter(a => a.status === filter);
  const groupedActions = CATEGORIES.map(cat => ({
    ...cat,
    items: filteredActions.filter(a => a.cat === cat.letter),
  })).filter(g => g.items.length > 0);

  /* ── Styles ── */
  const SE = {
    red: "#D42B2B", black: "#1A1A1A", dark: "#2D2D2D", gray: "#6B6B6B",
    grayLight: "#9A9A9A", border: "#E5E5E5", bg: "#FAFAF9", white: "#FFFFFF", cream: "#F7F6F3",
  };

  return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: SE.bg, color: SE.black, minHeight: "100vh", lineHeight: 1.6 }}>

      {/* ═══ HERO ═══ */}
      <header style={{
        position: "relative", minHeight: 380,
        background: `linear-gradient(135deg, ${SE.black} 0%, #2A1A1A 40%, ${SE.dark} 100%)`,
        display: "flex", alignItems: "center", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: "-50%", right: "-20%", width: 600, height: 600,
          background: "radial-gradient(circle, rgba(212,43,43,0.15) 0%, transparent 70%)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 4,
          background: "linear-gradient(90deg, #D42B2B, #FFCC00, #3C3B6E, #D42B2B)",
          backgroundSize: "300% 100%", animation: "borderShimmer 6s ease-in-out infinite",
        }} />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 40px 50px", position: "relative", zIndex: 1, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
            <div style={{ width: 5, height: 48, background: SE.red, borderRadius: 2 }} />
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 900, fontSize: 28, color: SE.white, letterSpacing: -0.5 }}>
              scienceexperts<span style={{ color: SE.red }}>.ai</span>
            </span>
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800, fontSize: "clamp(32px, 5vw, 52px)", color: SE.white, lineHeight: 1.1, marginBottom: 16, letterSpacing: -1 }}>
            Co-Founders<br />Build Review
          </h1>
          <p style={{ fontSize: 17, color: SE.grayLight, maxWidth: 600, lineHeight: 1.6 }}>
            Decisions, action items, and strategic direction extracted from {STATS.sessions} unique sessions across 3 months of co-founder calls. Interactive tracker \u2014 click any item to update its status.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 28, fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
            <span><strong style={{ color: "rgba(255,255,255,0.9)" }}>Dec 16, 2025</strong> \u2014 <strong style={{ color: "rgba(255,255,255,0.9)" }}>Feb 22, 2026</strong></span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
            <span><strong style={{ color: "rgba(255,255,255,0.9)" }}>{STATS.transcripts}</strong> transcripts processed</span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
            <span><strong style={{ color: "rgba(255,255,255,0.9)" }}>{STATS.sessions}</strong> unique sessions</span>
          </div>
        </div>
      </header>

      {/* ═══ FOUNDERS STRIP ═══ */}
      <div style={{ maxWidth: 1100, margin: "-36px auto 0", padding: "0 40px", position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "1fr 80px 1fr", alignItems: "center" }}>
        <div style={{ background: SE.white, borderRadius: 14, padding: "22px 26px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: `1px solid ${SE.border}`, display: "flex", alignItems: "center", gap: 16 }}>
          <FlagCircle flag="de" />
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Chris M\u00FCller</h3>
            <div style={{ fontSize: 12, color: SE.gray, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 500 }}>{"\u25C6"} Marketing {"&"} Design Lead</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ width: 40, height: 40, background: SE.red, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 18, boxShadow: "0 2px 12px rgba(212,43,43,0.3)" }}>{"&"}</div>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: SE.gray, fontWeight: 600 }}>3rd AI</div>
        </div>
        <div style={{ background: SE.white, borderRadius: 14, padding: "22px 26px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: `1px solid ${SE.border}`, display: "flex", alignItems: "center", gap: 16 }}>
          <FlagCircle flag="us" />
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Lutfiya Miller</h3>
            <div style={{ fontSize: 12, color: SE.gray, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 500 }}>{"\u25C6"} Science {"&"} Content Lead</div>
          </div>
        </div>
      </div>

      {/* ═══ STATS RIBBON ═══ */}
      <div style={{ maxWidth: 1100, margin: "32px auto 0", padding: "0 40px", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
        {[
          { value: totalCount, label: "Action Items", sub: `across ${CATEGORIES.length} categories` },
          { value: INITIAL_DECISIONS.length, label: "Decisions Made", sub: "across 5 domains" },
          { value: doneCount, label: "Completed", sub: `${completionPct}% done rate`, isRed: true },
        ].map((s, i) => (
          <div key={i} style={{ background: SE.white, border: `1px solid ${SE.border}`, borderRadius: 12, padding: 20, textAlign: "center" }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 800, color: s.isRed ? SE.red : SE.black, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: SE.gray, marginTop: 6, fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: SE.grayLight, marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
        <div style={{ background: SE.white, border: `1px solid ${SE.border}`, borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <ProgressRing percent={completionPct} />
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: SE.gray, marginTop: 8, fontWeight: 500 }}>Completion</div>
        </div>
        <div style={{ background: SE.white, border: `1px solid ${SE.border}`, borderRadius: 12, padding: 20, textAlign: "center" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{THEMES.length}</div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: SE.gray, marginTop: 6, fontWeight: 500 }}>Recurring Themes</div>
          <div style={{ fontSize: 11, color: SE.grayLight, marginTop: 2 }}>flagged for review</div>
        </div>
      </div>

      {/* ═══ TAB NAV ═══ */}
      <div style={{ maxWidth: 1100, margin: "48px auto 0", padding: "0 40px" }}>
        <div style={{ display: "flex", gap: 0, borderBottom: `2px solid ${SE.border}` }}>
          {[
            { key: "actions", label: "Action Items", count: totalCount },
            { key: "decisions", label: "Decisions", count: INITIAL_DECISIONS.length },
            { key: "themes", label: "Themes & Patterns", count: THEMES.length },
            { key: "checklist", label: "Import Checklist", count: CHECKLIST.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, padding: "12px 24px",
              border: "none", borderBottom: activeTab === tab.key ? `3px solid ${SE.red}` : "3px solid transparent",
              background: "none", color: activeTab === tab.key ? SE.black : SE.gray,
              cursor: "pointer", transition: "all 0.2s", marginBottom: -2,
            }}>
              {tab.label} <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 4 }}>({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 40px 80px" }}>

        {/* ── ACTIONS TAB ── */}
        {activeTab === "actions" && (
          <div style={{ marginTop: 32 }}>
            {/* Filter bar */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
              {[
                { key: "all", label: `All (${totalCount})` },
                { key: "done", label: `\u2713 Done (${statusCounts.done || 0})` },
                { key: "progress", label: `\u25C8 In Progress (${statusCounts.progress || 0})` },
                { key: "planned", label: `\u25CF Planned (${statusCounts.planned || 0})` },
                { key: "blocked", label: `\u26A0 Blocked (${statusCounts.blocked || 0})` },
                { key: "abandoned", label: `\u2715 Abandoned (${statusCounts.abandoned || 0})` },
              ].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, padding: "6px 14px",
                  borderRadius: 20, border: `1.5px solid ${filter === f.key ? SE.black : SE.border}`,
                  background: filter === f.key ? SE.black : SE.white,
                  color: filter === f.key ? SE.white : SE.gray,
                  cursor: "pointer", transition: "all 0.2s", textTransform: "uppercase", letterSpacing: 0.3,
                }}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Tip */}
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "12px 18px", marginBottom: 24, fontSize: 13, color: "#92400E", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{"\uD83D\uDCA1"}</span>
              <span><strong>Tip:</strong> Click the status badge on any item to cycle through statuses: Planned \u2192 In Progress \u2192 Done \u2192 Blocked \u2192 Abandoned</span>
            </div>

            {/* Grouped action items */}
            {groupedActions.map(group => (
              <div key={group.letter} style={{ marginBottom: 36 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>{group.icon}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{group.fullName}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: SE.gray, background: SE.cream, padding: "2px 10px", borderRadius: 10 }}>{group.items.length} items</span>
                </div>

                {group.items.map(action => {
                  const sc = STATUS_CONFIG[action.status];
                  const isExpanded = expandedEvidence[action.id];
                  const isCelebrating = celebrateId === action.id;
                  return (
                    <div key={action.id} style={{
                      background: SE.white, border: `1px solid ${SE.border}`, borderRadius: 10,
                      padding: "18px 22px", marginBottom: 10, display: "grid",
                      gridTemplateColumns: "40px 1fr auto", gap: 14, alignItems: "start",
                      transition: "all 0.3s",
                      borderColor: isCelebrating ? "#16A34A" : undefined,
                      boxShadow: isCelebrating ? "0 0 20px rgba(22,163,74,0.2)" : undefined,
                      opacity: action.status === "abandoned" ? 0.55 : 1,
                    }}>
                      {/* ID */}
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 500,
                        color: SE.gray, background: SE.cream, padding: "4px 0", textAlign: "center",
                        borderRadius: 6, marginTop: 2,
                      }}>{action.id}</div>

                      {/* Body */}
                      <div>
                        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, lineHeight: 1.4,
                          textDecoration: action.status === "done" ? "line-through" : "none",
                          color: action.status === "done" ? SE.gray : SE.black,
                        }}>{action.title}</h4>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 12, background: SE.cream, color: SE.dark, border: `1px solid ${SE.border}`, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {action.owners.map((o, i) => (
                              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                {i > 0 && <span style={{ color: SE.grayLight, margin: "0 2px" }}>{"&"}</span>}
                                <FlagDot flag={o.f} /> {o.n}
                              </span>
                            ))}
                          </span>
                          <span style={{ fontSize: 11, color: SE.grayLight }}>{action.date}</span>
                        </div>
                        {action.evidence && (
                          <>
                            <span onClick={() => setExpandedEvidence(p => ({ ...p, [action.id]: !p[action.id] }))}
                              style={{ fontSize: 11, color: SE.red, cursor: "pointer", fontWeight: 500, marginTop: 6, display: "inline-block", userSelect: "none" }}>
                              {isExpanded ? "Hide evidence \u25B4" : "Show evidence \u25BE"}
                            </span>
                            {isExpanded && (
                              <div style={{ fontSize: 12, color: SE.gray, marginTop: 6, padding: "10px 14px", background: SE.cream, borderRadius: 8, borderLeft: `3px solid ${SE.red}`, lineHeight: 1.5 }}>
                                {action.evidence}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Status badge (clickable) */}
                      <button onClick={() => cycleStatus(action.id)} title="Click to change status" style={{
                        fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 12,
                        background: sc.bg, color: sc.color, border: "none", cursor: "pointer",
                        whiteSpace: "nowrap", letterSpacing: 0.3, transition: "all 0.2s",
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                        {sc.icon} {sc.label}
                        {isCelebrating && <span style={{ marginLeft: 4, animation: "pop 0.5s ease-out" }}>{"\uD83C\uDF89"}</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── DECISIONS TAB ── */}
        {activeTab === "decisions" && (
          <div style={{ marginTop: 32 }}>
            {INITIAL_DECISIONS.map(dec => {
              const dc = DOMAIN_COLORS[dec.domainClass] || { bg: SE.cream, color: SE.gray };
              return (
                <div key={dec.id} style={{
                  background: SE.white, border: `1px solid ${SE.border}`, borderLeft: `4px solid ${dec.superseded ? SE.grayLight : SE.red}`,
                  borderRadius: 10, padding: "20px 24px", marginBottom: 12,
                  opacity: dec.superseded ? 0.6 : 1, transition: "box-shadow 0.2s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 500, color: SE.gray, background: SE.cream, padding: "3px 8px", borderRadius: 4 }}>{dec.id}</span>
                      <span style={{ fontSize: 12, color: SE.grayLight }}>{dec.date}</span>
                      <ConfidenceDots filled={dec.confidence} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "3px 10px", borderRadius: 4, background: dc.bg, color: dc.color }}>{dec.domain}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 8 }}>{dec.text}</div>
                  <div style={{ fontSize: 13, color: SE.gray, lineHeight: 1.5 }}>{dec.context}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── THEMES TAB ── */}
        {activeTab === "themes" && (
          <div style={{ marginTop: 32 }}>
            {THEMES.map((theme, i) => (
              <div key={i} style={{ background: SE.cream, borderRadius: 10, padding: "16px 20px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, color: SE.red, background: SE.white, border: `1.5px solid ${SE.red}`, borderRadius: 8, padding: "4px 10px", whiteSpace: "nowrap", flexShrink: 0 }}>{theme.freq}</span>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{theme.title}</h4>
                  <p style={{ fontSize: 12, color: SE.gray, margin: 0 }}>{theme.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── CHECKLIST TAB ── */}
        {activeTab === "checklist" && (
          <div style={{ marginTop: 32 }}>
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "12px 18px", marginBottom: 24, fontSize: 13, color: "#92400E", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{"\u2705"}</span>
              <span><strong>Before importing into MeetScript:</strong> Check off each step as you complete it.</span>
            </div>
            {CHECKLIST.map((item, i) => (
              <div key={i} onClick={() => setChecklistState(p => p.map((v, j) => j === i ? !v : v))}
                style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: i < CHECKLIST.length - 1 ? `1px solid ${SE.border}` : "none", cursor: "pointer" }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 1,
                  border: checklistState[i] ? "2px solid #16A34A" : `2px solid ${SE.border}`,
                  background: checklistState[i] ? "#16A34A" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s", color: "white", fontSize: 13, fontWeight: 700,
                }}>{checklistState[i] && "\u2713"}</div>
                <div style={{ fontSize: 14, lineHeight: 1.5, textDecoration: checklistState[i] ? "line-through" : "none", color: checklistState[i] ? SE.grayLight : SE.black }}>{item.text}</div>
              </div>
            ))}
            <div style={{ marginTop: 20, fontSize: 13, color: SE.gray, textAlign: "center" }}>
              {checklistState.filter(Boolean).length} of {CHECKLIST.length} steps completed
            </div>
          </div>
        )}

        {/* ═══ PARTNERSHIP SECTION ═══ */}
        <div style={{
          background: `linear-gradient(135deg, ${SE.black}, #2A1A1A)`, borderRadius: 16,
          padding: 32, marginTop: 48, color: SE.white, position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -100, right: -100, width: 300, height: 300, background: "radial-gradient(circle, rgba(212,43,43,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 800, marginBottom: 20, display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
            {"\uD83E\uDD1D"} Your Co-Founder Journey So Far
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, position: "relative" }}>
            {[
              { value: STATS.sessions, label: "Build Sessions" },
              { value: STATS.hours, label: "Hours Together" },
              { value: STATS.words, label: "Words Exchanged" },
              { value: `${STATS.days} days`, label: "Since First Call" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 800, color: SE.red }}>{s.value}</div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 16, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FlagDot flag="de" size={16} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>CET</span>
            </span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>\u2014</span>
            <span>Building across 7 hours apart, building one platform</span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>\u2014</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FlagDot flag="us" size={16} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>CST</span>
            </span>
          </div>
        </div>
      </div>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 40px 48px", textAlign: "center", color: SE.grayLight, fontSize: 12, borderTop: `1px solid ${SE.border}` }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 16, color: SE.black, marginBottom: 6 }}>
          scienceexperts<span style={{ color: SE.red }}>.ai</span>
        </div>
        <div>Prepared for Co-Founders Build Meeting \u00B7 March 2026</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: SE.cream, padding: "6px 16px", borderRadius: 20, fontSize: 12, color: SE.gray, marginTop: 12 }}>
          <FlagDot flag="de" /> Prost! <span style={{ color: SE.border }}>|</span> Cheers! <FlagDot flag="us" />
        </div>
      </footer>

      {/* ═══ KEYFRAMES ═══ */}
      <style>{`
        @keyframes borderShimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes pop {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}
