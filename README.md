# Local LLM Chat Web App

A private, local chat interface for running GGUF models (like Gemma) using **FastAPI** and **llama-cpp-python**.

## 🚀 Setup

1.  **Install Requests**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Download Model**:
    Ensure you have your GGUF model file.
    *   Default path configured in `server.py`: `/Users/user_name/ml_models/gemma_models/gemma3_4b_it/gemma-3-4b-it-Q4_K_M.gguf`
    *   *Edit `MODEL_PATH` in `server.py` if your model is elsewhere.*

## 🏃‍♂️ Running the Server

Start the chatbot server:

```bash
python3 server.py
```

- Access the Chat UI: [http://localhost:8080](http://localhost:8080)
- API Endpoint: `http://localhost:8080/api/chat`

## 🔧 Troubleshooting

### "Failed to fetch" or Network Errors
If you are using **Brave Browser** or have strict ad-blockers:
1.  **Disable Shields**: Click the Brave Lion icon (or ad-blocker icon) in your address bar.
2.  **Allow Connection**: Toggle shields/blocking **DOWN** for `localhost`.
3.  **Reload**: Press `Cmd+Shift+R` to hard refresh.

*Reason: Privacy browsers often block connections to local ports (like 8080) if they suspect it's a tracking script.*

### "Conversation roles must alternate"
If you see server errors about roles:
- The server now auto-magically merges "system" prompts into the first user message to keep the model happy. No action needed!
