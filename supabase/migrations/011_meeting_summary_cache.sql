-- Cache Gemini-generated meeting summaries in the transcripts table
ALTER TABLE transcripts ADD COLUMN meeting_summary TEXT;
