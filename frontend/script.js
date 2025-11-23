// --- DOM ELEMENTS ---
const recordingView = document.getElementById("recordingView");
const resultView = document.getElementById("resultView");
const micBtn = document.getElementById("micBtn");
const micIcon = document.getElementById("micIcon");
const statusText = document.getElementById("statusText");
const livePreview = document.getElementById("livePreview");

// Result Elements
const resTranscript = document.getElementById("resTranscript");
const resTags = document.getElementById("resTags");
const resSpecialist = document.getElementById("resSpecialist");
const resReason = document.getElementById("resReason");
const resPriority = document.getElementById("resPriority");
const resSuggestion = document.getElementById("resSuggestion");
const resetBtn = document.getElementById("resetBtn");

// SOS Elements
const sosOverlay = document.getElementById("sosOverlay");
const sosTimer = document.getElementById("sosTimer");
const cancelSosBtn = document.getElementById("cancelSosBtn");
const sosStatusMsg = document.getElementById("sosStatusMsg");

// Image Upload Elements
const imageInput = document.getElementById("imageInput");
const uploadBtn = document.getElementById("uploadBtn");
const uploadPrompt = document.getElementById("uploadPrompt");
const uploadLoading = document.getElementById("uploadLoading");

const prevSpecialist = document.getElementById("prevSpecialist");

// Timeline Elements
const timelineList = document.getElementById("timelineList");
const addHistoryBtn = document.getElementById("addHistoryBtn");
const historyInput = document.getElementById("historyInput");
const soapBtn = document.getElementById("soapBtn");

// --- STATE ---
let recognition;
let isRecording = false;
let finalDraft = ""; 
let sosInterval;
let audioCtx; 

// --- 1. PERSISTENCE CHECK ---
window.addEventListener("DOMContentLoaded", () => {
    const savedResult = localStorage.getItem("lastAnalysisResult");
    if (savedResult) {
        try {
            const data = JSON.parse(savedResult);
            showResults(data); 
        } catch(e) {
            localStorage.removeItem("lastAnalysisResult");
        }
    }
    const savedSpec = localStorage.getItem("currentSpecialistName");
    if (savedSpec) {
        prevSpecialist.textContent = savedSpec;
    }
    loadHistory();
});

// --- 2. SPEECH ENGINE ---
if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        isRecording = true;
        finalDraft = "";
        livePreview.textContent = "...";
        micBtn.classList.add("listening");
        micIcon.innerHTML = '<i class="fa-solid fa-stop"></i>';
        statusText.textContent = "Listening... Tap to Stop";
    };

    recognition.onresult = (event) => {
        let interim = "";
        let finalChunk = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalChunk += event.results[i][0].transcript + " ";
            } else {
                interim += event.results[i][0].transcript;
            }
        }
        finalDraft += finalChunk;
        livePreview.textContent = finalDraft + interim;
    };

    recognition.onerror = (e) => {
        if (e.error === 'not-allowed') {
             statusText.textContent = "Mic Permission Denied";
             isRecording = false;
             micBtn.classList.remove("listening");
             micIcon.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
        }
    };

    recognition.onend = () => {
        if (isRecording) {
            stopAndSend();
        }
    };
} else {
    alert("Please use Google Chrome or Edge.");
}

// --- 3. BUTTON HANDLERS ---
micBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (!recognition) return;
    if (isRecording) {
        stopAndSend();
    } else {
        try { recognition.start(); } catch(e){}
    }
});

function stopAndSend() {
    isRecording = false;
    micBtn.classList.remove("listening");
    micIcon.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    recognition.stop();
    
    setTimeout(() => {
        const textToSend = (livePreview.textContent || "").trim();
        
        // --- SOS LOGIC CHECK ---
        if (checkSOS(textToSend)) {
            triggerSOS(textToSend); // Trigger Emergency Flow
        } else if (textToSend.length > 2) {
            statusText.textContent = "Analyzing symptoms...";
            sendToBackend(textToSend); // Normal Flow
        } else {
            statusText.textContent = "No speech detected. Tap to try again.";
            micIcon.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        }
    }, 500);
}

// --- 4. SOS EMERGENCY SYSTEM ---
function checkSOS(text) {
    const t = text.toLowerCase();
    const triggers = ["numb arm", "chest pain", "heart attack", "stroke", "can't breathe", "collapse", "emergency"];
    return triggers.some(trigger => t.includes(trigger));
}

function triggerSOS(text) {
    sosOverlay.classList.remove("hidden");
    let count = 10;
    sosTimer.innerText = count;
    sosStatusMsg.classList.add("hidden");
    
    // Reset buttons
    micIcon.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    statusText.textContent = "Ready to listen...";

    sosInterval = setInterval(() => {
        count--;
        sosTimer.innerText = count;
        
        if (count <= 0) {
            clearInterval(sosInterval);
            activateBeacon();
        }
    }, 1000);

    // If cancelled, proceed to normal analysis
    cancelSosBtn.onclick = () => {
        clearInterval(sosInterval);
        stopBeep();
        sosOverlay.classList.add("hidden");
        sendToBackend(text); // Proceed with medical analysis anyway
    };
}

function activateBeacon() {
    sosStatusMsg.classList.remove("hidden");
    sosTimer.innerHTML = '<i class="fa-solid fa-tower-broadcast"></i>';
    sosOverlay.classList.add("beeping");
    startBeep();
    // Simulate sending message
    console.log("SOS MESSAGE SENT TO EMERGENCY CONTACTS");
}

// Sound generator using Web Audio API
function startBeep() {
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    
    // Pulse the gain to create beep effect
    setInterval(() => {
        gain.gain.setValueAtTime(1, audioCtx.currentTime);
        gain.gain.setValueAtTime(0, audioCtx.currentTime + 0.1);
    }, 500);
}

function stopBeep() {
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
    }
    sosOverlay.classList.remove("beeping");
}


// --- 5. BACKEND COMMUNICATION ---
async function sendToBackend(text) {
    try {
        const res = await fetch("http://127.0.0.1:8000/process-text", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        
        if (data.ok) {
            localStorage.setItem("lastAnalysisResult", JSON.stringify(data));
            showResults(data);
            loadHistory();
        } else {
            statusText.textContent = "Error: " + (data.error || "Unknown");
            micIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        }
    } catch (e) {
        statusText.textContent = "Connection Error";
        micIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
    }
}

// --- 6. RENDER RESULTS & IMAGE UPLOAD ---
function showResults(data) {
    recordingView.classList.add("hidden");
    resultView.classList.remove("hidden");

    // Reset Image Upload Section
    uploadPrompt.classList.remove("hidden");
    uploadLoading.classList.add("hidden");
    imageInput.value = ""; 

    resTranscript.textContent = `"${data.extraction.transcription_en}"`;
    
    resTags.innerHTML = "";
    (data.extraction.symptoms || []).forEach(s => {
        const sp = document.createElement("span");
        sp.textContent = s;
        resTags.appendChild(sp);
    });

    updateTriageUI(data.triage, data.extraction.specific_suggestion);
}

function updateTriageUI(triage, suggestion) {
    const specName = triage.specialist || "General Physician";
    resSpecialist.textContent = specName;
    resReason.textContent = triage.reason || "Standard evaluation based on symptoms.";
    resSuggestion.textContent = suggestion || (triage.visual_observation ? "Visual analysis completed." : "Monitor symptoms.");

    const p = (triage.priority || "low").toLowerCase();
    resPriority.textContent = p + " Priority";
    
    if(p === 'high') {
        resPriority.style.background = '#fee2e2'; resPriority.style.color = '#ef4444';
    } else if (p === 'medium') {
        resPriority.style.background = '#fef3c7'; resPriority.style.color = '#d97706';
    } else {
        resPriority.style.background = '#d1fae5'; resPriority.style.color = '#059669';
    }

    prevSpecialist.textContent = specName;
    localStorage.setItem("currentSpecialistName", specName);
}

// Image Upload Logic
uploadBtn.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", async (e) => {
    if(e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    const textContext = resTranscript.textContent.replace(/"/g, ""); // Get existing text
    
    uploadPrompt.classList.add("hidden");
    uploadLoading.classList.remove("hidden");

    const formData = new FormData();
    formData.append("image", file);
    formData.append("text_context", textContext);

    try {
        const res = await fetch("http://127.0.0.1:8000/process-image", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        
        if (data.ok && data.triage) {
            updateTriageUI(data.triage, data.triage.visual_observation);
            alert("Analysis Updated based on Image!");
        } else {
            alert("Error analyzing image.");
            uploadPrompt.classList.remove("hidden");
        }
    } catch(err) {
        console.error(err);
        alert("Upload failed.");
        uploadPrompt.classList.remove("hidden");
    } finally {
        uploadLoading.classList.add("hidden");
    }
});

// --- 7. RESET TO RECORDING ---
resetBtn.addEventListener("click", () => {
    localStorage.removeItem("lastAnalysisResult");
    finalDraft = "";
    livePreview.textContent = "";
    statusText.textContent = "Ready to listen...";
    micIcon.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    
    resultView.classList.add("hidden");
    recordingView.classList.remove("hidden");
});

// --- 8. TIMELINE & DELETE ---
async function loadHistory() {
    try {
        const res = await fetch("http://127.0.0.1:8000/history");
        const data = await res.json();
        
        timelineList.innerHTML = "";
        const events = (data.events || []).slice().reverse();

        if(events.length === 0) {
            timelineList.innerHTML = "<li style='justify-content:center; color:#9ca3af; font-style:italic;'>No history yet.</li>";
            return;
        }

        events.forEach(evt => {
            const li = document.createElement("li");
            const dateObj = new Date(evt.timestamp);
            const timeStr = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const dateStr = dateObj.toLocaleDateString();

            li.innerHTML = `
                <div class="timeline-content">
                    <span class="timeline-text">${evt.text}</span>
                    <span class="timeline-time"><i class="fa-regular fa-calendar"></i> ${dateStr} at ${timeStr}</span>
                </div>
                <button type="button" class="delete-btn" onclick="deleteEvent(${evt.id})" title="Remove">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
            timelineList.appendChild(li);
        });
    } catch(e) { console.error(e); }
}

window.deleteEvent = async function(id) {
    try {
        await fetch("http://127.0.0.1:8000/delete-event", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ id })
        });
        loadHistory();
    } catch(e) { console.error("Delete failed"); }
};

addHistoryBtn.addEventListener("click", async () => {
    const text = historyInput.value;
    if(!text) return;
    
    addHistoryBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    await fetch("http://127.0.0.1:8000/add-history", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ text })
    });
    
    historyInput.value = "";
    addHistoryBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    loadHistory();
});

// --- 9. SOAP GENERATION ---
soapBtn.addEventListener("click", async () => {
    const originalText = soapBtn.innerHTML;
    soapBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    
    try {
        const res = await fetch("http://127.0.0.1:8000/generate-soap", { method: "POST" });
        const d = await res.json();
        
        if(d.ok && d.soap_data) {
            generateReportHTML(d.soap_data);
        } else {
            alert("Could not generate report data.");
        }
    } catch(e) {
        alert("Failed to connect for report.");
    } finally {
        soapBtn.innerHTML = originalText;
    }
});

function generateReportHTML(data) {
    const summary = data.patient_summary || "No summary available.";
    const alerts = data.critical_alerts || [];
    const soap = data.soap || {};

    let alertHTML = "";
    if (alerts.length > 0) {
        alertHTML = `
            <div class="alert-section">
                <div class="alert-header">⚠️ CRITICAL ATTENTION REQUIRED</div>
                <ul class="alert-list">
                    ${alerts.map(a => `<li>${a}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    const w = window.open("", "_blank");
    w.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>MediMind Clinical Report</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
            <style>
                :root { --primary: #4f46e5; --dark: #1e293b; --light-gray: #f8fafc; --red: #ef4444; }
                body { font-family: 'Outfit', sans-serif; background: #e2e8f0; padding: 40px; margin: 0; color: var(--dark); }
                .page { background: white; max-width: 800px; margin: 0 auto; padding: 50px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border-radius: 8px; }
                
                .header { display: flex; justify-content: space-between; border-bottom: 2px solid var(--light-gray); padding-bottom: 20px; margin-bottom: 30px; }
                .brand { color: var(--primary); font-size: 1.5rem; font-weight: 700; }
                .date { color: #64748b; font-weight: 500; }

                .summary-box { background: #f1f5f9; padding: 20px; border-left: 5px solid var(--primary); border-radius: 4px; margin-bottom: 30px; font-style: italic; color: #334155; }

                .alert-section { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 30px; animation: pulse 2s infinite; }
                .alert-header { color: var(--red); font-weight: 800; letter-spacing: 1px; margin-bottom: 10px; font-size: 0.9rem; }
                .alert-list { margin: 0; padding-left: 20px; color: #991b1b; font-weight: 600; }
                @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.2); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); } }

                .soap-grid { display: grid; grid-template-columns: 1fr; gap: 25px; }
                
                .soap-section { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
                .soap-title { background: var(--primary); color: white; padding: 10px 20px; font-weight: 700; letter-spacing: 1px; font-size: 0.9rem; }
                .soap-content { padding: 20px; line-height: 1.6; color: #475569; white-space: pre-wrap; }

                .plan-section .soap-title { background: #059669; }
                .assessment-section .soap-title { background: #0284c7; }

                @media print { body { background: white; padding: 0; } .page { box-shadow: none; } }
            </style>
        </head>
        <body>
            <div class="page">
                <div class="header">
                    <div class="brand">MediMind Report</div>
                    <div class="date">Generated: ${new Date().toLocaleString()}</div>
                </div>

                ${alertHTML}

                <div class="summary-box">
                    <strong>Patient Summary:</strong> ${summary}
                </div>

                <div class="soap-grid">
                    <div class="soap-section">
                        <div class="soap-title">S - SUBJECTIVE (Symptoms)</div>
                        <div class="soap-content">${soap.subjective || "No data recorded."}</div>
                    </div>
                    <div class="soap-section">
                        <div class="soap-title">O - OBJECTIVE (Observations)</div>
                        <div class="soap-content">${soap.objective || "No data recorded."}</div>
                    </div>
                    <div class="soap-section assessment-section">
                        <div class="soap-title">A - ASSESSMENT (Diagnosis)</div>
                        <div class="soap-content">${soap.assessment || "Pending evaluation."}</div>
                    </div>
                    <div class="soap-section plan-section">
                        <div class="soap-title">P - PLAN (Treatment & Next Steps)</div>
                        <div class="soap-content">${soap.plan || "Follow up recommended."}</div>
                    </div>
                </div>

                <div style="margin-top: 40px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
                    Generated by AI Health Companion • Not a replacement for professional medical advice.
                </div>
            </div>
        </body>
        </html>
    `);
    w.document.close();
}