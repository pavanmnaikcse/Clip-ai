const API = '';

let currentJobId = null;
let pollInterval = null;

// DOM refs
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const uploadProgress = document.getElementById('uploadProgress');
const uploadBar = document.getElementById('uploadBar');
const uploadPct = document.getElementById('uploadPct');
const processingSection = document.getElementById('processingSection');
const processBar = document.getElementById('processBar');
const processPct = document.getElementById('processPct');
const stepLabel = document.getElementById('stepLabel');
const stepsList = document.getElementById('stepsList');
const resultsSection = document.getElementById('resultsSection');
const clipsGrid = document.getElementById('clipsGrid');
const errorSection = document.getElementById('errorSection');
const errorMsg = document.getElementById('errorMsg');
const howSection = document.getElementById('howSection');

// Drag and drop
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

dropZone.addEventListener('click', (e) => {
  if (e.target === dropZone || e.target.tagName === 'H3' || e.target.tagName === 'P' || e.target.classList.contains('upload-icon')) {
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
  const ext = file.name.split('.').pop().toLowerCase();
  const allowedExts = ['mp4', 'mov', 'avi', 'mkv', 'webm'];

  if (!allowedExts.includes(ext)) {
    alert('Please upload a video file (MP4, MOV, AVI, MKV, WEBM)');
    return;
  }

  if (file.size > 500 * 1024 * 1024) {
    alert('File is too large. Maximum size is 500MB.');
    return;
  }

  uploadFile(file);
}

async function uploadFile(file) {
  // Show upload progress
  uploadProgress.style.display = 'block';
  howSection.style.display = 'none';

  const formData = new FormData();
  formData.append('video', file);

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener('progress', e => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      uploadBar.style.width = pct + '%';
      uploadPct.textContent = pct + '%';
    }
  });

  xhr.addEventListener('load', () => {
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      currentJobId = data.jobId;
      startProcessing();
    } else {
      let err = 'Upload failed';
      try { err = JSON.parse(xhr.responseText).error; } catch(e) {}
      showError(err);
    }
  });

  xhr.addEventListener('error', () => showError('Network error during upload'));

  xhr.open('POST', `${API}/api/upload`);
  xhr.send(formData);
}

function startProcessing() {
  uploadSection.style.display = 'none';
  processingSection.style.display = 'block';

  pollInterval = setInterval(pollStatus, 2000);
  pollStatus();
}

async function pollStatus() {
  if (!currentJobId) return;

  try {
    const res = await fetch(`${API}/api/status/${currentJobId}`);
    if (!res.ok) throw new Error('Status fetch failed');
    const job = await res.json();

    updateProgress(job);

    if (job.status === 'done') {
      clearInterval(pollInterval);
      showResults(job.clips);
    } else if (job.status === 'error') {
      clearInterval(pollInterval);
      showError(job.error || 'Processing failed');
    }
  } catch (e) {
    console.error('Poll error:', e);
  }
}

function updateProgress(job) {
  const pct = job.progress || 0;
  processBar.style.width = pct + '%';
  processPct.textContent = pct + '%';

  if (job.step) {
    stepLabel.textContent = job.step;
  }

  // Update step indicators
  const stepItems = stepsList.querySelectorAll('.step-item');
  stepItems.forEach(item => {
    const threshold = parseInt(item.dataset.step);
    if (pct >= threshold) {
      item.classList.remove('active');
      item.classList.add('done');
    } else if (pct >= threshold - 15) {
      item.classList.add('active');
      item.classList.remove('done');
    } else {
      item.classList.remove('active', 'done');
    }
  });
}

function showResults(clips) {
  processingSection.style.display = 'none';
  resultsSection.style.display = 'block';

  clipsGrid.innerHTML = '';

  clips.forEach(clip => {
    const card = createClipCard(clip);
    clipsGrid.appendChild(card);
  });

  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function createClipCard(clip) {
  const card = document.createElement('div');
  card.className = 'clip-card';

  const startTime = formatTime(clip.start);
  const endTime = formatTime(clip.end);

  card.innerHTML = `
    <div class="clip-preview">
      <video
        src="${clip.url}"
        preload="metadata"
        controls
        playsinline
        poster=""
      ></video>
      <div class="clip-badge">Clip ${clip.id}</div>
      <div class="score-badge">Score ${clip.score}</div>
    </div>
    <div class="clip-info">
      <h4>Highlight ${clip.id}</h4>
      <div class="clip-meta">⏱ ${clip.duration}s &nbsp;·&nbsp; 🕐 ${startTime} – ${endTime} &nbsp;·&nbsp; 📐 9:16</div>
      <div class="clip-transcript">${clip.transcript || clip.summary}</div>
      <div class="clip-actions">
        <a href="${clip.url}" download="clipmind_highlight_${clip.id}.mp4" class="btn btn-primary">⬇ Download</a>
        <button class="btn btn-outline" onclick="previewClip(this, '${clip.url}')">▶ Preview</button>
      </div>
    </div>
  `;

  return card;
}

function previewClip(btn, url) {
  const video = btn.closest('.clip-card').querySelector('video');
  if (video.paused) {
    video.play();
    btn.textContent = '⏸ Pause';
  } else {
    video.pause();
    btn.textContent = '▶ Preview';
  }
}

function showError(msg) {
  uploadSection.style.display = 'none';
  processingSection.style.display = 'none';
  errorSection.style.display = 'block';
  errorMsg.textContent = msg;
}

function resetApp() {
  // Cleanup job
  if (currentJobId) {
    fetch(`${API}/api/job/${currentJobId}`, { method: 'DELETE' }).catch(() => {});
    currentJobId = null;
  }

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  // Reset UI
  uploadSection.style.display = 'block';
  uploadProgress.style.display = 'none';
  processingSection.style.display = 'none';
  resultsSection.style.display = 'none';
  errorSection.style.display = 'none';
  howSection.style.display = 'block';

  uploadBar.style.width = '0%';
  uploadPct.textContent = '0%';
  processBar.style.width = '0%';
  processPct.textContent = '0%';
  stepLabel.textContent = 'Processing...';

  fileInput.value = '';
  clipsGrid.innerHTML = '';

  stepsList.querySelectorAll('.step-item').forEach(i => i.classList.remove('active', 'done'));

  uploadSection.scrollIntoView({ behavior: 'smooth' });
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
