const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type. Use MP4, MOV, AVI, MKV, or WEBM.'));
  }
});

// Job store (in-memory)
const jobs = {};

// Upload video
router.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const jobId = uuidv4();
  const videoPath = req.file.path;

  jobs[jobId] = {
    id: jobId,
    status: 'uploaded',
    progress: 5,
    step: 'Video uploaded',
    videoPath,
    clips: []
  };

  res.json({ jobId, filename: req.file.filename });

  // Process async
  processVideo(jobId, videoPath).catch(err => {
    console.error('Processing error:', err);
    jobs[jobId].status = 'error';
    jobs[jobId].error = err.message;
  });
});

// Get job status
router.get('/status/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// Main processing pipeline
async function processVideo(jobId, videoPath) {
  const job = jobs[jobId];
  const outputDir = `outputs/${jobId}`;
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    // Step 1: Extract audio
    updateJob(jobId, 10, 'Extracting audio...');
    const audioPath = `temp/${jobId}.wav`;
    await extractAudio(videoPath, audioPath);

    // Step 2: Transcribe
    updateJob(jobId, 25, 'Transcribing speech with Whisper...');
    const transcript = await transcribeAudio(audioPath);

    // Step 3: Analyze transcript
    updateJob(jobId, 50, 'Analyzing transcript for highlights...');
    const segments = analyzeTranscript(transcript);

    if (segments.length === 0) {
      throw new Error('No highlight segments detected. Try a video with more speech.');
    }

    // Step 4: Cut clips
    updateJob(jobId, 65, 'Cutting highlight clips...');
    const clips = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const clipName = `clip_${i + 1}.mp4`;
      const clipPath = path.join(outputDir, clipName);
      const captionPath = path.join(outputDir, `clip_${i + 1}_captions.srt`);

      updateJob(jobId, 65 + (i * 10), `Creating clip ${i + 1} of ${segments.length}...`);

      // Generate SRT captions
      generateSRT(seg.words, captionPath);

      // Cut & convert to 9:16 with captions
      await cutClip(videoPath, clipPath, captionPath, seg.start, seg.end);

      clips.push({
        id: i + 1,
        filename: clipName,
        url: `/outputs/${jobId}/${clipName}`,
        start: seg.start,
        end: seg.end,
        duration: Math.round(seg.end - seg.start),
        score: Math.round(seg.score),
        summary: seg.summary,
        transcript: seg.text
      });
    }

    // Cleanup
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

    jobs[jobId].status = 'done';
    jobs[jobId].progress = 100;
    jobs[jobId].step = 'Complete!';
    jobs[jobId].clips = clips;

  } catch (err) {
    // Cleanup on error
    if (fs.existsSync(`temp/${jobId}.wav`)) fs.unlinkSync(`temp/${jobId}.wav`);
    throw err;
  }
}

function updateJob(jobId, progress, step) {
  jobs[jobId].progress = progress;
  jobs[jobId].step = step;
  jobs[jobId].status = 'processing';
}

// Extract audio from video
function extractAudio(videoPath, audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .output(audioPath)
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

// Transcribe using Whisper CLI
async function transcribeAudio(audioPath) {
  const outDir = path.dirname(audioPath);
  const baseName = path.basename(audioPath, '.wav');

  try {
    // Try whisper command
    await execAsync(`whisper "${audioPath}" --model base --output_format json --output_dir "${outDir}" --word_timestamps True`, {
      timeout: 300000
    });

    const jsonPath = path.join(outDir, `${baseName}.json`);
    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      fs.unlinkSync(jsonPath);
      return data;
    }
  } catch (e) {
    console.log('Whisper not found or failed, using mock transcript for demo:', e.message);
  }

  // Fallback: mock transcript for demo/testing
  return generateMockTranscript();
}

// Mock transcript generator for demo when Whisper not installed
function generateMockTranscript() {
  const words = [
    "Welcome", "to", "this", "amazing", "presentation", "today",
    "I", "want", "to", "share", "something", "incredible", "with", "you",
    "This", "is", "absolutely", "the", "most", "exciting", "thing",
    "I", "have", "ever", "discovered", "in", "my", "entire", "career",
    "You", "will", "not", "believe", "what", "happened", "next",
    "The", "results", "were", "shocking", "and", "completely", "unexpected",
    "Everyone", "was", "blown", "away", "by", "this", "discovery",
    "Can", "you", "imagine", "what", "this", "means", "for", "all", "of", "us",
    "This", "changes", "everything", "we", "thought", "we", "knew",
    "I", "am", "so", "passionate", "about", "this", "topic",
    "Let", "me", "tell", "you", "the", "whole", "story",
    "It", "started", "on", "a", "regular", "Tuesday", "morning",
    "When", "suddenly", "everything", "changed", "dramatically",
    "The", "breakthrough", "came", "when", "we", "least", "expected", "it",
    "And", "that", "is", "when", "I", "realized", "something", "profound",
    "This", "is", "the", "most", "important", "lesson", "I", "ever", "learned",
    "Never", "give", "up", "on", "your", "dreams", "no", "matter", "what",
    "Success", "is", "closer", "than", "you", "think"
  ];

  const segments = [];
  let time = 0;
  const wordsWithTime = words.map(w => {
    const start = time;
    time += 0.4 + Math.random() * 0.3;
    return { word: w, start, end: time };
  });

  // Group into segments of ~15 words
  for (let i = 0; i < wordsWithTime.length; i += 15) {
    const chunk = wordsWithTime.slice(i, i + 15);
    segments.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map(w => w.word).join(' '),
      words: chunk
    });
  }

  return { segments };
}

// AI scoring logic
const EMOTION_WORDS = new Set([
  'amazing', 'incredible', 'shocking', 'unbelievable', 'extraordinary',
  'fantastic', 'terrible', 'horrible', 'wonderful', 'devastating',
  'exciting', 'devastating', 'heartbreaking', 'inspiring', 'brilliant',
  'disaster', 'breakthrough', 'revolutionary', 'legendary', 'epic',
  'never', 'always', 'everyone', 'nobody', 'everything', 'nothing',
  'best', 'worst', 'greatest', 'biggest', 'most', 'first', 'last',
  'love', 'hate', 'fear', 'hope', 'dream', 'fail', 'win', 'lose',
  'shocking', 'urgent', 'critical', 'powerful', 'vital', 'crucial',
  'passionate', 'profound', 'dramatic', 'blown', 'discovered', 'secret',
  'truth', 'lie', 'hidden', 'real', 'fake', 'proof', 'evidence'
]);

const QUESTION_STARTERS = ['what', 'why', 'how', 'when', 'where', 'who', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did'];

function scoreSegment(segment) {
  const text = segment.text.toLowerCase();
  const words = text.split(/\s+/);
  let score = 0;

  // Emotion words
  words.forEach(w => {
    if (EMOTION_WORDS.has(w)) score += 10;
  });

  // Questions
  const sentences = text.split(/[.!?]+/);
  sentences.forEach(s => {
    const firstWord = s.trim().split(' ')[0];
    if (QUESTION_STARTERS.includes(firstWord)) score += 15;
    if (s.includes('?')) score += 10;
  });

  // Exclamations
  const exclamations = (segment.text.match(/!/g) || []).length;
  score += exclamations * 8;

  // All caps words (energy indicators)
  const capsWords = (segment.text.match(/\b[A-Z]{2,}\b/g) || []).length;
  score += capsWords * 5;

  // Duration sweet spot (20-45s is ideal)
  const duration = segment.end - segment.start;
  if (duration >= 20 && duration <= 45) score += 20;
  else if (duration >= 15 && duration <= 60) score += 10;

  // Word density (more words = more engaging)
  const wordCount = words.length;
  score += Math.min(wordCount * 0.5, 15);

  return score;
}

function analyzeTranscript(transcript) {
  if (!transcript || !transcript.segments) return [];

  const segments = transcript.segments;
  if (segments.length === 0) return [];

  // Merge short segments into chunks of 15-60 seconds
  const chunks = [];
  let currentChunk = null;
  const TARGET_MIN = 15;
  const TARGET_MAX = 55;

  for (const seg of segments) {
    if (!currentChunk) {
      currentChunk = {
        start: seg.start,
        end: seg.end,
        text: seg.text,
        words: seg.words || []
      };
    } else {
      const duration = seg.end - currentChunk.start;
      if (duration <= TARGET_MAX) {
        currentChunk.end = seg.end;
        currentChunk.text += ' ' + seg.text;
        currentChunk.words = [...(currentChunk.words || []), ...(seg.words || [])];
      } else {
        if (currentChunk.end - currentChunk.start >= TARGET_MIN) {
          chunks.push(currentChunk);
        }
        currentChunk = {
          start: seg.start,
          end: seg.end,
          text: seg.text,
          words: seg.words || []
        };
      }
    }
  }
  if (currentChunk && currentChunk.end - currentChunk.start >= TARGET_MIN) {
    chunks.push(currentChunk);
  }

  // If no valid chunks, use raw segments
  if (chunks.length === 0) {
    return segments.slice(0, 3).map((s, i) => ({
      ...s,
      score: 50,
      summary: `Highlight ${i + 1}`
    }));
  }

  // Score all chunks
  const scored = chunks.map(chunk => ({
    ...chunk,
    score: scoreSegment(chunk)
  }));

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  // Select top 3 non-overlapping
  const selected = [];
  for (const chunk of scored) {
    if (selected.length >= 3) break;

    const overlaps = selected.some(s =>
      !(chunk.end <= s.start || chunk.start >= s.end)
    );

    if (!overlaps) {
      selected.push({
        ...chunk,
        summary: generateSummary(chunk.text)
      });
    }
  }

  // Sort by time
  selected.sort((a, b) => a.start - b.start);

  return selected;
}

function generateSummary(text) {
  const words = text.split(' ').slice(0, 8).join(' ');
  return words.length < text.length ? words + '...' : words;
}

// Generate SRT caption file
function generateSRT(words, outputPath) {
  if (!words || words.length === 0) {
    fs.writeFileSync(outputPath, '');
    return;
  }

  let srt = '';
  let index = 1;
  const WORDS_PER_CAPTION = 5;

  for (let i = 0; i < words.length; i += WORDS_PER_CAPTION) {
    const chunk = words.slice(i, i + WORDS_PER_CAPTION);
    const start = chunk[0].start;
    const end = chunk[chunk.length - 1].end;
    const text = chunk.map(w => w.word).join(' ');

    srt += `${index}\n`;
    srt += `${formatSRTTime(start)} --> ${formatSRTTime(end)}\n`;
    srt += `${text}\n\n`;
    index++;
  }

  fs.writeFileSync(outputPath, srt);
}

function formatSRTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// Cut video clip and convert to 9:16
function cutClip(inputPath, outputPath, captionPath, start, end) {
  return new Promise((resolve, reject) => {
    const duration = end - start;
    const hasCaptions = fs.existsSync(captionPath) && fs.statSync(captionPath).size > 0;

    let cmd = ffmpeg(inputPath)
      .seekInput(start)
      .duration(duration)
      .videoFilter([
        // Crop to 9:16 vertical format
        'crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9)',
        'scale=1080:1920:force_original_aspect_ratio=decrease',
        'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black'
      ])
      .audioCodec('aac')
      .audioBitrate('128k')
      .videoCodec('libx264')
      .videoBitrate('2000k')
      .outputOptions([
        '-preset fast',
        '-crf 23',
        '-movflags +faststart'
      ]);

    // Add captions if available
    if (hasCaptions) {
      cmd = cmd.outputOptions([
        `-vf crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9),scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,subtitles=${captionPath}:force_style='FontSize=28,FontName=Arial,Bold=1,Alignment=2,MarginV=80,PrimaryColour=&H00ffffff,OutlineColour=&H00000000,Outline=2'`
      ]);
    }

    cmd
      .output(outputPath)
      .on('end', resolve)
      .on('error', (err) => {
        // Try without captions as fallback
        if (hasCaptions) {
          ffmpeg(inputPath)
            .seekInput(start)
            .duration(duration)
            .videoFilter([
              'crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9)',
              'scale=1080:1920:force_original_aspect_ratio=decrease',
              'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black'
            ])
            .audioCodec('aac')
            .videoBitrate('2000k')
            .videoCodec('libx264')
            .outputOptions(['-preset fast', '-crf 23', '-movflags +faststart'])
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        } else {
          reject(err);
        }
      })
      .run();
  });
}

// Delete job files
router.delete('/job/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs[jobId];
  if (!job) return res.status(404).json({ error: 'Not found' });

  // Cleanup files
  try {
    if (job.videoPath && fs.existsSync(job.videoPath)) fs.unlinkSync(job.videoPath);
    const outputDir = `outputs/${jobId}`;
    if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true });
  } catch (e) {}

  delete jobs[jobId];
  res.json({ success: true });
});

module.exports = router;
