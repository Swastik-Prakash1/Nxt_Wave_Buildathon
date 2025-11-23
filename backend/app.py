import os
import json
import re
import io
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from PIL import Image

# --- CONFIGURATION ---
# SECURITY NOTE: Never hardcode API keys. Set this in Render Environment Variables.
GEMINI_API_KEY = os.environ.get("AIzaSyCuk6xOaEWel1ZH1eT9fapsrcq0_Lv67GI") 
DATA_FILE = "data.json"
MODEL = "gemini-2.0-flash" 

client = genai.Client(api_key=GEMINI_API_KEY)

# --- FLASK SETUP (Updated for Render) ---
# This tells Flask to look for HTML/CSS/JS in the 'frontend' folder one level up
app = Flask(__name__, static_folder="../frontend", static_url_path="/")
CORS(app, resources={r"*": {"origins": "*"}})

# --- DATABASE HELPERS ---
def load_db():
    if not os.path.exists(DATA_FILE):
        return {"events": []}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_db(db):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

def add_event(event_type, text, extra=None):
    db = load_db()
    new_id = (db["events"][-1]["id"] + 1) if db["events"] else 1
    
    entry = {
        "id": new_id,
        "type": event_type,  
        "text": text,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "extra": extra or {}
    }
    db["events"].append(entry)
    save_db(db)
    return entry

def parse_json_safe(text):
    try:
        return json.loads(text)
    except:
        # Fallback regex to find JSON in markdown code blocks
        match = re.search(r"(\{[\s\S]*\})", text)
        if match:
            try: return json.loads(match.group(1))
            except: pass
    return None

# --- API ENDPOINTS ---

# 1. NEW ROOT ROUTE (Serves index.html)
@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/history", methods=["GET"])
def get_history():
    return jsonify(load_db())

@app.route("/delete-event", methods=["POST"])
def delete_event():
    payload = request.get_json() or {}
    eid = payload.get("id")
    if not eid:
        return jsonify({"error": "id required"}), 400
    db = load_db()
    original_len = len(db["events"])
    db["events"] = [e for e in db["events"] if e["id"] != eid]
    save_db(db)
    return jsonify({"ok": True, "deleted_count": original_len - len(db["events"])})

@app.route("/process-text", methods=["POST"])
def process_text():
    payload = request.get_json() or {}
    text = payload.get("text", "").strip()
    
    if len(text) < 2:
        return jsonify({"error": "Text too short/empty"}), 400

    try:
        # STEP 1: Extraction (Get the raw symptoms)
        extract_prompt = (
            f"User Text: '{text}'.\n"
            "Return JSON: {transcription_en, symptoms:[], specific_suggestion}."
        )
        resp_ex = client.models.generate_content(model=MODEL, contents=[extract_prompt])
        parsed_ex = parse_json_safe(resp_ex.text) or {"transcription_en": text, "symptoms": [], "specific_suggestion": ""}

        # STEP 2: Intelligent Triage (Timeline Analysis)
        db = load_db()
        # Fetch last 10 symptoms with timestamps to analyze timeline
        history_context = [
            {"time": e["timestamp"], "symptom": e["text"]} 
            for e in db["events"][-10:] 
            if e["type"] == "symptom"
        ]
        
        triage_prompt = (
            f"Current Patient History (Chronological): {json.dumps(history_context)}\n"
            f"LATEST Complaint: '{parsed_ex.get('transcription_en')}'\n"
            "-----------------------------\n"
            "TASK: Act as a senior medical triage officer. Analyze the TIMELINE of symptoms.\n"
            "RULES:\n"
            "1. TIMELINE MATTERS: If they had fever yesterday and stomach pain today, connect them (e.g., 'Viral Infection' vs just 'Gas').\n"
            "2. PRIORITY CALIBRATION: Be realistic. Knee pain/cough is usually LOW/MEDIUM. Chest pain/Breathing issues are HIGH. Let the severity dictate the priority, do not default to High.\n"
            "3. SPECIALIST: Recommend ONE specialist based on the *combined* picture of history + new symptom.\n"
            "4. REASON: Explain explicitly referencing the history. (e.g. 'Considering your fever from yesterday and current stomach pain...')\n"
            "-----------------------------\n"
            "Return JSON: {specialist, reason, priority}"
        )
        
        resp_tr = client.models.generate_content(model=MODEL, contents=[triage_prompt])
        parsed_tr = parse_json_safe(resp_tr.text) or {"specialist": "General Physician", "reason": "Standard evaluation", "priority": "low"}

        add_event("symptom", parsed_ex.get("transcription_en", text), extra={"triage": parsed_tr})

        return jsonify({"ok": True, "extraction": parsed_ex, "triage": parsed_tr})

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/process-image", methods=["POST"])
def process_image():
    try:
        if 'image' not in request.files:
            return jsonify({"error": "No image uploaded"}), 400
        
        file = request.files['image']
        text_context = request.form.get("text_context", "")
        
        # Load History for Image Context too
        db = load_db()
        history_summary = [e["text"] for e in db["events"][-5:] if e["type"] == "symptom"]

        image = Image.open(file.stream)
        
        prompt = (
            f"Patient Context History: {history_summary}\n"
            f"Current Complaint: '{text_context}'.\n"
            "Now analyze this uploaded image.\n"
            "1. Does the visual evidence confirm or change the diagnosis based on the history?\n"
            "2. If the image shows something severe (deep wound, severe rash), increase priority.\n"
            "Return JSON: {specialist, reason, priority, visual_observation}"
        )

        resp = client.models.generate_content(model=MODEL, contents=[prompt, image])
        parsed = parse_json_safe(resp.text)
        
        if not parsed:
             return jsonify({"error": "AI could not interpret image"}), 500

        add_event("image_analysis", f"Image uploaded for: {text_context}", extra={"triage": parsed})

        return jsonify({"ok": True, "triage": parsed})

    except Exception as e:
        print(f"Image Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/generate-soap", methods=["POST"])
def generate_soap():
    db = load_db()
    events = db['events'][-30:]
    
    prompt = (
        f"Analyze this patient history: {json.dumps(events)}.\n"
        "Generate a professional Medical SOAP Report in JSON format.\n"
        "IMPORTANT: Identify 'Critical Alerts' (e.g., Severe Pain, Surgeries, High Fever, Heart Issues) separately.\n"
        "Return strictly JSON with this structure:\n"
        "{\n"
        "  'patient_summary': 'Short 1-sentence summary',\n"
        "  'critical_alerts': ['Alert 1', 'Alert 2'],\n"
        "  'soap': {\n"
        "    'subjective': 'Detailed patient complaints...',\n"
        "    'objective': 'Observations based on history...',\n"
        "    'assessment': 'Potential diagnosis/analysis...',\n"
        "    'plan': 'Recommended next steps...'\n"
        "  }\n"
        "}"
    )
    
    try:
        resp = client.models.generate_content(model=MODEL, contents=[prompt])
        parsed = parse_json_safe(resp.text)
        if not parsed:
            raise ValueError("Failed to parse AI response")
        return jsonify({"ok": True, "soap_data": parsed})
    except Exception as e:
        print(f"SOAP Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/add-history", methods=["POST"]) 
def add_history():
    payload = request.get_json() or {}
    text = payload.get("text", "")
    if text:
        add_event("history", text)
        return jsonify({"ok": True})
    return jsonify({"error": "no text"}), 400

if __name__ == "__main__":
    if not os.path.exists(DATA_FILE):
        save_db({"events": []})
    print("🚑 Backend running on http://0.0.0.0:8000")
    app.run(host="0.0.0.0", port=8000, debug=True)
