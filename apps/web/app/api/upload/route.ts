import { NextRequest, NextResponse } from 'next/server';
import { parseVtt, parseSbv, processUpload } from '../../../lib/upload-pipeline';
import { autoExtractActionItems } from '../../../lib/auto-extract';
import { detectMeetingDate, detectDateFromFilename } from '../../../lib/detect-meeting-date';
import { extractTextFromPdf } from '../../../lib/pdf-extract';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set(['.txt', '.vtt', '.sbv', '.pdf']);

/** Derive a meeting title from a filename: strip extension, replace separators, title-case. */
function titleFromFilename(filename: string): string {
    const base = filename.replace(/\.[^.]+$/, ''); // strip extension
    const words = base.replace(/[-_]+/g, ' ').trim().split(/\s+/);
    return words
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/** Extract text from a PDF file. Returns the raw text or throws. */
async function extractPdfText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return extractTextFromPdf(buffer);
}

export async function POST(request: NextRequest) {
    try {
        const contentType = request.headers.get('content-type') ?? '';

        // ── Pasted-text path (JSON) ─────────────────────────────
        if (contentType.includes('application/json')) {
            const body = await request.json();
            const { text, title: titleOverride, date: dateOverride } = body as {
                text?: string;
                title?: string;
                date?: string;
            };

            if (!text || !text.trim()) {
                return NextResponse.json({ error: 'Transcript text is required' }, { status: 400 });
            }

            const title = titleOverride?.trim() || 'Pasted Transcript';

            // Date cascade: user override → text content detection → undefined (today)
            let detectedDate: Date | null = null;
            let date: Date | undefined;

            if (dateOverride) {
                date = new Date(dateOverride);
            } else {
                detectedDate = detectMeetingDate(text.trim());
                date = detectedDate ?? undefined;
            }

            const transcript = await processUpload({
                text: text.trim(),
                title,
                date,
                extractionMethod: 'paste',
            });

            // Fire-and-forget: auto-extract action items in the background
            autoExtractActionItems(transcript.transcript_id).catch(() => { });

            return NextResponse.json(
                { transcript, detectedDate: detectedDate?.toISOString() ?? null },
                { status: 201 }
            );
        }

        // ── File-upload path (FormData) ─────────────────────────
        const formData = await request.formData();
        const file = formData.get('file');
        const titleOverride = formData.get('title') as string | null;
        const dateOverride = formData.get('date') as string | null;

        // ── Validation ──────────────────────────────────────────

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: 'File is required' }, { status: 400 });
        }

        const filename = file.name;
        const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();

        if (!ALLOWED_EXTENSIONS.has(ext)) {
            return NextResponse.json(
                { error: 'Unsupported file type. Accepted: .txt, .vtt, .sbv, .pdf' },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 });
        }

        // ── Parse file content ──────────────────────────────────

        let parsedText: string;

        if (ext === '.pdf') {
            parsedText = await extractPdfText(file);
        } else {
            const rawText = await file.text();

            switch (ext) {
                case '.vtt':
                    parsedText = parseVtt(rawText);
                    break;
                case '.sbv':
                    parsedText = parseSbv(rawText);
                    break;
                default:
                    parsedText = rawText;
            }
        }

        if (!parsedText.trim()) {
            const msg =
                ext === '.pdf'
                    ? 'Could not extract text from this PDF. It may be an image-based scan.'
                    : 'File contains no transcript text after parsing';
            return NextResponse.json({ error: msg }, { status: 400 });
        }

        // ── Resolve title, date, and extraction method ──────────

        const title = titleOverride?.trim() || titleFromFilename(filename);
        const isPdf = ext === '.pdf';

        // Date cascade: user override → text content detection → filename detection → undefined (today)
        let detectedDate: Date | null = null;
        let date: Date | undefined;

        if (dateOverride) {
            date = new Date(dateOverride);
        } else {
            detectedDate = detectMeetingDate(parsedText);
            if (!detectedDate) {
                detectedDate = detectDateFromFilename(filename);
            }
            date = detectedDate ?? undefined;
        }

        const extractionMethod = isPdf ? 'pdf_upload' : 'upload';

        // ── Process through pipeline ────────────────────────────

        const transcript = await processUpload({ text: parsedText, title, date, extractionMethod });

        // Fire-and-forget: auto-extract action items in the background
        autoExtractActionItems(transcript.transcript_id).catch(() => { });

        return NextResponse.json(
            {
                transcript,
                detectedDate: detectedDate?.toISOString() ?? null,
            },
            { status: 201 }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[upload] Processing failed:', message);
        return NextResponse.json(
            { error: `Failed to process transcript: ${message}` },
            { status: 500 }
        );
    }
}
