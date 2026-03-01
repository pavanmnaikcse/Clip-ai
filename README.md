# ✂️ ClipMind AI

**Free AI Video Clipper — Runs 100% Locally. No Login. No Payment.**

Automatically detect the most exciting moments in any video, cut them into vertical 9:16 clips, and add captions — powered by FFmpeg + Whisper.

---

## 🚀 Quick Start

### 1. Install Node.js
Download from https://nodejs.org (v18 or higher)

### 2. Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg -y
```

**Windows:**
1. Download from https://ffmpeg.org/download.html
2. Extract and add `ffmpeg/bin` to your PATH
3. Verify: `ffmpeg -version`

### 3. Install Whisper (Optional but recommended)

Whisper enables real AI speech-to-text. Without it, a demo transcript is used.

**Install Python 3.8+ first:** https://python.org

```bash
pip install openai-whisper
```

Test it works:
```bash
whisper --help
```

**Note:** First run downloads the `base` model (~150MB). Larger models = better accuracy but slower:
- `tiny` — fastest, less accurate
- `base` — good balance (default)
- `small` — better accuracy
- `medium` — high accuracy
- `large` — best accuracy, slowest

To change model, edit `routes/video.js` line:
```js
await execAsync(`whisper "${audioPath}" --model base ...`);
//                                             ^^^^^ change this
```

### 4. Install Dependencies & Run

```bash
cd clipmind-ai
npm install
npm start
```

Open your browser: **http://localhost:3000**

---

## 📁 Project Structure

```
clipmind-ai/
├── server.js              # Express server entry point
├── package.json           # Node dependencies
├── routes/
│   └── video.js           # Upload, processing, AI logic
├── public/
│   ├── index.html         # Frontend UI
│   ├── style.css          # Styling
│   └── app.js             # Frontend JavaScript
├── uploads/               # Temporary uploaded videos
├── outputs/               # Generated clips (served publicly)
└── temp/                  # Temporary audio files
```

---

## 🧠 How the AI Works

1. **Upload** — Video uploaded via multipart form
2. **Audio Extraction** — FFmpeg strips audio as 16kHz WAV
3. **Transcription** — Whisper converts speech to text with word-level timestamps
4. **AI Scoring** — Each transcript segment scored for:
   - Emotion words (amazing, shocking, never, etc.)
   - Questions (what, why, how, can you, etc.)
   - Exclamations and emphasis
   - Duration sweet spot (20–45 seconds)
   - Word density
5. **Clip Selection** — Top 3 highest-scoring non-overlapping segments chosen
6. **Video Processing** — FFmpeg cuts clips and converts to 9:16 vertical format
7. **Captions** — SRT file generated, burned into video with FFmpeg subtitles filter

---

## ⚙️ Configuration

Edit `routes/video.js` to customize:

```js
// Max clip duration
const TARGET_MAX = 55; // seconds

// Min clip duration
const TARGET_MIN = 15; // seconds

// Number of clips to generate
if (selected.length >= 3) break; // change 3 to any number

// Add your own emotion words
const EMOTION_WORDS = new Set([...]);
```

---

## 🔧 Troubleshooting

**FFmpeg not found:**
```bash
which ffmpeg          # Should show path
ffmpeg -version       # Should show version info
```

**Whisper not found:**
```bash
which whisper         # Should show path
python -m whisper --help  # Alternative
```
If whisper CLI isn't found, try: `python -m whisper` instead of `whisper` in `routes/video.js`

**Large videos timing out:**
- Use a shorter video (under 10 minutes)
- Upgrade to `tiny` Whisper model for speed
- Increase Node.js timeout if needed

**Clips have no captions:**
- FFmpeg needs `libass` for subtitle burning
- On Ubuntu: `sudo apt install libass-dev`
- Clips still work, just without burned-in text

---

## 📦 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | HTML, CSS, Vanilla JS |
| Backend | Node.js, Express |
| Upload | Multer |
| Video Processing | FFmpeg (fluent-ffmpeg) |
| Speech-to-Text | OpenAI Whisper (local) |
| AI Scoring | Custom keyword + heuristic model |

---

## 📝 License

MIT — Free to use, modify, and distribute.
