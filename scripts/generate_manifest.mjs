/**
 * Generates _manifest.json from saved transcript files and validates them.
 * Run: node scripts/generate_manifest.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_DIR = join(process.cwd(), 'loom_transcripts_chris_lutfiya');

/** Parse the header section of a transcript .txt file */
function parseTranscriptHeader(content) {
    const lines = content.split('\n');
    const header = {};
    for (const line of lines) {
        const titleMatch = line.match(/^Title:\s+(.+)/);
        if (titleMatch) header.title = titleMatch[1].trim();
        const idMatch = line.match(/^Video ID:\s+(.+)/);
        if (idMatch) header.videoId = idMatch[1].trim();
        const urlMatch = line.match(/^URL:\s+(.+)/);
        if (urlMatch) header.url = urlMatch[1].trim();
        const dateMatch = line.match(/^Date:\s+(.+)/);
        if (dateMatch) header.date = dateMatch[1].trim();
        const durationMatch = line.match(/^Duration:\s+(.+)/);
        if (durationMatch) header.duration = durationMatch[1].trim();
        // Stop after the first separator line after the header
        if (line.startsWith('=========') && header.title) break;
    }
    return header;
}

/** Count speaker turns (lines matching [HH:MM:SS] Speaker:) */
function countSpeakerTurns(content) {
    const matches = content.match(/\[\d{2}:\d{2}:\d{2}\] Speaker:/g);
    return matches ? matches.length : 0;
}

/** Count words in the transcript body (after first separator, before END) */
function countWords(content) {
    // Extract body between the two separator lines
    const parts = content.split('==========================================================');
    if (parts.length >= 3) {
        const body = parts[2]; // body is between 2nd and 3rd separator
        return body.split(/\s+/).filter(w => w.length > 0).length;
    }
    return 0;
}

/** Duration string [HH:MM:SS] to seconds */
function durationToSeconds(durStr) {
    if (!durStr || durStr === 'Unknown') return null;
    const match = durStr.match(/\[?(\d{2}):(\d{2}):(\d{2})\]?/);
    if (!match) return null;
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
}

// Video index — all 46 videos from the Loom folder
const allVideos = [
    { id: 'a4305f6e67814a14834dbd7a08392566', title: 'Chris_Lutfiya - 2026_01_26 08_39 CST Recording' },
    { id: 'b0eb3319c8324d6ca235f7dc20c9dcb1', title: 'Innovative Strategies for Community Engagement and AI Integration' },
    { id: '7f91e4a1594a4b7bb350bec7de65102e', title: 'Collaborative Development and Language Translation Strategies' },
    { id: '25193c41b54b4d76ad17f070a1a6de19', title: 'Chris_Lutfiya - 2026_02_22 09_24 CST Recording' },
    { id: '31fad4495aa14949afb558860d04f68d', title: 'Exploring AI Applications in Science and Business Strategies' },
    { id: 'dab88608f9b94b0097df91b600b44a42', title: 'Collaborative Coding and Community Building Insights' },
    { id: 'c60af8a56b7f41c599412db367dddaed', title: 'Collaborative Development Insights and Strategies' },
    { id: '12f0c1e593244929863bb6475341eab2', title: 'Navigating Meeting Tools and Transcription Challenges' },
    { id: '29e32d2d4e0d42c7acfba368a1e408ce', title: 'Chris_Lutfiya - 2026_01_24 12_05 CST Recording' },
    { id: '61a0de36ed334b318bf922bc5ead423b', title: 'Project Development and Collaboration Insights' },
    { id: '3bcd4b1f565d49808c16a724e22b732b', title: 'Testing the Z5 and Important Updates for Tomorrow' },
    { id: 'd34eeea7d6dd49e880deb6210711dd32', title: 'Streamlining API Workflows with Code-less Solutions' },
    { id: 'd54aa65625594337b5cdba7c3addab8d', title: 'Troubleshooting Audio Quality Issues Together' },
    { id: 'c041abae06c9461fa05b18c9a2aa5452', title: 'Collaborative Project Planning and Insights' },
    { id: '43a4d4664dc846e38893943fc2b614e5', title: 'Collaborating on GitHub and Deploying to Vercel' },
    { id: '4a68a23f52304ad9ae68bfc751a53be8', title: 'Lutfiya Dev - 2026_01_25 20_12 CST Recording' },
    { id: '8b23310735e243a1ab910062dc83c9eb', title: 'Chris_Lutfiya - 2026_02_06 11_19 CST Recording' },
    { id: '9f50fe62dfb74d1fabac5e10e2070be3', title: 'Chris_Lutfiya - 2026_02_02 12_44 CST Recording' },
    { id: '927ac16ab3154cea87fa0ab4493080f7', title: 'Mastering Agentic Workflows' },
    { id: 'fdbc5c57530d4ca18499b46c2356a24e', title: 'Agentic Workflow: HCD Queries for DART Studies' },
    { id: '217ec1faa3fa4b67af153adeebdfa254', title: 'Chris/Lutfiya' },
    { id: 'a9cdd77ebe0c4b8e8c7f9ed41cf1c3bb', title: 'Chris/Lutfiya' },
    { id: '650212b3bf264a90bf96f1185f3e896f', title: 'Chris/Lutfiya' },
    { id: 'd9a588cd78c84e80b7258a22d738f26a', title: 'Chris/Lutfiya' },
    { id: '7c6af06fb7674d37864388d4005de193', title: 'Chris/Lutfiya' },
    { id: 'ec093fd83fc7415fa7f45f62f8333ffa', title: 'Chris/Lutfiya' },
    { id: 'eae81c9d341c4be2aae5cd1deb75e36f', title: 'Chris/Lutfiya' },
    { id: 'f4850c18090941f9922a3e07cb5854dd', title: 'Chris/Lutfiya' },
    { id: '3042d0bd28484507ad8779b88fdb6372', title: 'Chris/Lutfiya' },
    { id: '7fdad1586002464a87b0256948d0b20e', title: 'Chris/Lutfiya' },
    { id: '3ac661b55ba3491fadeb8de7dd21b962', title: 'Chris/Lutfiya' },
    { id: '26774d8372de4374860f51e2047a85c0', title: 'Chris/Lutfiya' },
    { id: 'f474055cbd6548369b4daaa25a3afa45', title: 'Chris/Lutfiya' },
    { id: '18f2c64d0a7d44a888b039abe8ca48da', title: 'Chris/Lutfiya' },
    { id: '72e8022163e24e73bed85248d2f06823', title: 'Chris/Lutfiya' },
    { id: '6465656fb6bc48a29a0d88b62d0955f0', title: 'Chris/Lutfiya' },
    { id: '8d00d9ffb4c94580b145334b25a638f9', title: 'Chris/Lutfiya' },
    { id: '70a9d48dd77247ebb68bb355ae7d84ef', title: 'Chris/Lutfiya' },
    { id: '5c80239eb417454cb78e7a709af4d2e0', title: 'Chris/Lutfiya' },
    { id: '78c84ed1a3694b059ab82ba6d522ecb2', title: 'Chris/Lutfiya' },
    { id: '331082f5f2e042619c65f4e9ff0eb457', title: 'Chris/Lutfiya' },
    { id: '8f5fc121313f4671b1b8d33ad31b49aa', title: 'Chris/Lutfiya' },
    { id: '529d3ed9b3e744cf8ccb5d5e8a6f5a09', title: 'Chris/Lutfiya' },
    { id: '27608b95c284481b8acc4b004cab27bf', title: 'Chris/Lutfiya' },
    { id: '37263252fa754f62b3a11f560ab02bbd', title: 'Chris/Lutfiya' },
    { id: 'e3d469d863564cc096c071964d16c2bc', title: 'Chris/Lutfiya' },
];

// No-transcript video IDs (graphQL returned null)
const noTranscriptIds = new Set([
    'a4305f6e67814a14834dbd7a08392566',
    '72e8022163e24e73bed85248d2f06823',
]);

// Read all .txt files in the output directory
const files = readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.txt'));
console.log(`\n📂 Found ${files.length} transcript files in ${OUTPUT_DIR}\n`);

const transcripts = [];
const videoIdsFound = new Set();
const validationErrors = [];

for (const file of files) {
    const filepath = join(OUTPUT_DIR, file);
    const content = readFileSync(filepath, 'utf-8');
    const header = parseTranscriptHeader(content);
    const speakerTurns = countSpeakerTurns(content);
    const wordCount = countWords(content);

    // Validate template structure
    const hasHeader = content.startsWith('==========');
    const hasFooter = content.includes('END OF TRANSCRIPT');
    const hasTimestamps = speakerTurns > 0;
    const hasContent = wordCount > 10;
    const noHtml = !/<[a-z][^>]*>/i.test(content);
    const isUtf8 = true; // Node reads as UTF-8 by default

    if (!hasHeader) validationErrors.push(`${file}: Missing header separator`);
    if (!hasFooter) validationErrors.push(`${file}: Missing END OF TRANSCRIPT footer`);
    if (!hasTimestamps) validationErrors.push(`${file}: No timestamp markers found`);
    if (!hasContent) validationErrors.push(`${file}: Body has fewer than 10 words`);
    if (!noHtml) validationErrors.push(`${file}: Contains HTML tags`);

    if (header.videoId) videoIdsFound.add(header.videoId);

    transcripts.push({
        filename: file,
        video_id: header.videoId || 'unknown',
        title: header.title || file.replace('.txt', ''),
        url: header.url || `https://www.loom.com/share/${header.videoId || 'unknown'}`,
        date: header.date && header.date !== 'Unknown' ? header.date : null,
        duration_seconds: durationToSeconds(header.duration),
        speaker_count: 1, // Loom transcripts don't distinguish speakers in the JSON
        word_count: wordCount,
        extraction_method: 'graphql',
    });

    console.log(`  ✓ ${file} — ${header.videoId?.substring(0, 8)}... — ${wordCount} words, ${speakerTurns} turns`);
}

// Build failed extractions list
const failedExtractions = [];
for (const video of allVideos) {
    if (noTranscriptIds.has(video.id)) {
        failedExtractions.push({
            video_id: video.id,
            title: video.title,
            reason: 'no_transcript_available',
        });
    } else if (!videoIdsFound.has(video.id)) {
        failedExtractions.push({
            video_id: video.id,
            title: video.title,
            reason: 'filename_collision_overwritten',
        });
    }
}

// Build manifest
const manifest = {
    source: 'loom',
    workspace_folder: 'Chris/Lutfiya',
    folder_url: 'https://www.loom.com/looms/videos/Chris-Lutfiya-20f4ba88fde4444eb1f382f0ed8f47e0',
    extraction_timestamp: new Date().toISOString(),
    pipeline_target: 'google_meet_automation',
    total_videos: allVideos.length,
    total_transcripts_extracted: transcripts.length,
    failed_extractions: failedExtractions,
    transcripts,
};

const manifestPath = join(OUTPUT_DIR, '_manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

console.log(`\n📋 Manifest saved to: ${manifestPath}`);
console.log(`\n--- VALIDATION REPORT ---`);
console.log(`Total videos in folder:      ${allVideos.length}`);
console.log(`Transcripts extracted:       ${transcripts.length}`);
console.log(`No transcript available:     ${noTranscriptIds.size}`);
console.log(`Failed/overwritten:          ${failedExtractions.length - noTranscriptIds.size}`);
console.log(`Validation errors:           ${validationErrors.length}`);

if (validationErrors.length > 0) {
    console.log(`\n⚠️  Validation issues:`);
    for (const err of validationErrors) {
        console.log(`  - ${err}`);
    }
} else {
    console.log(`\n✅ All transcript files pass validation!`);
}

// Verify manifest is valid JSON
try {
    JSON.parse(readFileSync(manifestPath, 'utf-8'));
    console.log(`✅ _manifest.json is valid JSON`);
} catch (e) {
    console.log(`❌ _manifest.json is NOT valid JSON: ${e.message}`);
}

console.log(`\n🎉 Done!`);
