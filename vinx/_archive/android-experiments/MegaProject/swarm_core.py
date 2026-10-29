import os
import sys
import time
import re
import requests
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Pull the isolated keys
GEMINI_API_KEY = os.getenv("GEMINI_STUDIO_KEY")
KEY_NEMOTRON = os.getenv("OPENROUTER_KEY_NEMOTRON")
KEY_QWEN = os.getenv("OPENROUTER_KEY_QWEN")
KEY_DEEPSEEK = os.getenv("OPENROUTER_KEY_DEEPSEEK")
KEY_LLAMA = os.getenv("OPENROUTER_KEY_LLAMA")

# Ensure everyone is present
KEYS = {
    "Gemini": GEMINI_API_KEY,
    "Nemotron": KEY_NEMOTRON,
    "Qwen": KEY_QWEN,
    "DeepSeek": KEY_DEEPSEEK,
    "Llama": KEY_LLAMA
}

missing = [name for name, key in KEYS.items() if not key]
if missing:
    print(f"❌ Missing API keys for: {', '.join(missing)}. Ensure all environment variables are exported.")
    sys.exit(1)

# Cloud Router Execution
def call_openrouter(model, system_prompt, user_message, api_key):
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/lovable/lovable-agent",
        "X-Title": "Swarm Core"
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
    }
    try:
        time.sleep(5) # Increased delay for rate limits
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code != 200:
            print(f"❌ OpenRouter Error ({model}): {response.status_code} - {response.text}")
            return ""
        return response.json()['choices'][0]['message']['content']
    except Exception as e:
        print(f"❌ OpenRouter Exception ({model}): {e}")
        return ""

def call_gemini(model, system_prompt, user_message, api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{
            "parts": [{"text": f"System Instruction: {system_prompt}\n\nUser Request: {user_message}"}]
        }]
    }
    try:
        time.sleep(5)
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code != 200:
            print(f"❌ Gemini Error: {response.status_code} - {response.text}")
            return ""
        return response.json()['candidates'][0]['content']['parts'][0]['text']
    except Exception as e:
        print(f"❌ Gemini Exception: {e}")
        return ""

def write_to_disk(ai_output):
    if not ai_output:
        return
    pattern = r'// FILE:\s*([a-zA-Z0-9_\-/.]+)\n```[a-zA-Z]*\n(.*?)```'
    matches = re.findall(pattern, ai_output, re.DOTALL)
    for filepath, code in matches:
        dir_name = os.path.dirname(filepath)
        if dir_name and not os.path.exists(dir_name):
            os.makedirs(dir_name)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(code.strip())
        print(f"💾 [Autonomous Disk] Wrote: {filepath}")

# 🚩 The Milestone Boundary Gate
def trigger_milestone_audit(checkpoint_name):
    print(f"\n🚩 [MILESTONE CHECKPOINT] Auditing: {checkpoint_name}")
    
    # Read the current local state of the project
    snapshot = ""
    for root, dirs, files in os.walk("."):
        # Skip hidden and large folders
        if any(d in root for d in [".git", "node_modules", "dist", "venv"]):
            continue
        for file in files:
            if file.endswith(('.py', '.js', '.ts', '.tsx', '.c', '.h', '.md')) and "swarm_core" not in file:
                p = os.path.join(root, file)
                try:
                    with open(p, 'r', encoding="utf-8") as f:
                        snapshot += f"\n--- FILE: {p} ---\n{f.read()}\n"
                except:
                    continue

    sys_prompt = "You are the Omni-Supervisor (Nemotron). Review this codebase for design flaws, logic errors, or missing dependencies. If perfect, reply '[APPROVED]'. If broken, list specific issues clearly."
    # Using a more reliable model for auditing
    review = call_openrouter("meta-llama/llama-3.3-70b-instruct", sys_prompt, snapshot, KEY_NEMOTRON)
    print(f"💬 [Audit]: {review}")

    if "[APPROVED]" not in review:
        print("🛠️ System drift detected. Deploying Gemma to patch structural flaws...")
        fix_prompt = "You are Gemma. Fix the issues identified in the audit. Output the corrected files using the format: // FILE: path"
        patches = call_openrouter("google/gemma-4-31b-it:free", fix_prompt, f"Fix these issues:\n{review}\n\nCurrent Codebase:\n{snapshot}", KEY_DEEPSEEK)
        write_to_disk(patches)

# 🏁 RUNTIME PIPELINE
STATE_FILE = ".swarm_state"

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            return f.read().splitlines()
    return []

def save_state(milestone):
    with open(STATE_FILE, "a") as f:
        f.write(f"{milestone}\n")

def build_project(blueprint):
    completed = load_state()
    print(f"🚀 Initializing Autonomous Project Build for: {blueprint[:50]}...")
    
    # Milestone 1: Backend & Logic
    if "backend_done" not in completed:
        print("\n🏃 [Phase 1] Writing Backend & Core Logic (Qwen)...")
        qwen_sys = "You are the Lead Backend Engineer. Implement core logic. Use '// FILE: path' headers."
        backend = call_openrouter("qwen/qwen-2.5-coder-32b-instruct", qwen_sys, f"Blueprint: {blueprint}", KEY_QWEN)
        write_to_disk(backend)
        trigger_milestone_audit("Core Engine Integrity")
        save_state("backend_done")
    else:
        print("\n⏭️ [Phase 1] Already completed. Skipping...")
    
    # Milestone 2: Frontend & UI
    if "frontend_done" not in completed:
        print("\n🏃 [Phase 2] Building Frontend Components (Qwen)...")
        qwen_sys_frontend = "You are the Frontend Architect. Create a modern UI. Use '// FILE: path' headers."
        frontend = call_openrouter("qwen/qwen-2.5-coder-32b-instruct", qwen_sys_frontend, f"Blueprint: {blueprint}", KEY_QWEN)
        write_to_disk(frontend)
        trigger_milestone_audit("Full Stack Alignment")
        save_state("frontend_done")
    else:
        print("\n⏭️ [Phase 2] Already completed. Skipping...")
    
    # Milestone 3: Documentation & QA (Llama)
    if "docs_done" not in completed:
        print("\n🏃 [Phase 3] Generating Documentation & Tests (Llama)...")
        llama_sys = "You are the QA Specialist. Generate docs/tests. Use '// FILE: path' headers."
        docs = call_openrouter("meta-llama/llama-3.3-70b-instruct", llama_sys, f"Blueprint: {blueprint}", KEY_LLAMA)
        write_to_disk(docs)
        save_state("docs_done")
    else:
        print("\n⏭️ [Phase 3] Already completed. Skipping...")

    print("\n🏆 PROJECT READY FOR DEPLOYMENT.")


if __name__ == "__main__":
    # This can be overridden by an external gameplan file if needed
    macro_gameplan = "Build a high-performance decentralized token streaming matrix where a python backend coordinates asynchronous matrix transformations via a C engine thread, reporting updates to a web dashboard."
    
    # Check for external gameplan
    if os.path.exists("macro_gameplan.md"):
        with open("macro_gameplan.md", "r", encoding="utf-8") as f:
            macro_gameplan = f.read()
            print("📖 Loaded gameplan from macro_gameplan.md")

    build_project(macro_gameplan)
