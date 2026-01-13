import os
import json
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from llama_cpp import Llama
from pydantic import BaseModel
from typing import List, Optional, Literal

app = FastAPI(title="Local LLM Server")

# Enable CORS for the frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"DEBUG: Incoming {request.method} request to {request.url.path}")
    response = await call_next(request)
    print(f"DEBUG: Response status: {response.status_code}")
    return response

# Configuration
# IMPORTANT: Update this path to your local .gguf model file
MODEL_PATH = "/Users/debobratadas/ml_models/gemma_models/gemma3_4b_it/gemma-3-4b-it-Q4_K_M.gguf" 

# Global model instance
llm = None

def load_model():
    global llm
    if llm is None:
        if not os.path.exists(MODEL_PATH):
            print(f"WARNING: Model not found at {MODEL_PATH}. Please update MODEL_PATH in server.py")
            return None
        
        print(f"Loading model from {MODEL_PATH}...")
        try:
            # Adjust n_ctx (context window) and n_gpu_layers as needed
            llm = Llama(
                model_path=MODEL_PATH,
                n_ctx=2048,
                n_threads=8,        # Optimized for performance
                n_gpu_layers=20,    # decrease the gpu layers to 20 if it crashes or takes a lot of time
                verbose=False       # also disable internal Python-side logging
            )
            print("Model loaded successfully!")
        except Exception as e:
            print(f"Failed to load model: {e}")
            return None
    return llm

class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str

class ChatRequest(BaseModel):
    model: Optional[str] = "gemma-local-model"
    messages: List[ChatMessage]
    stream: Optional[bool] = False

# --- API Routes ---

@app.get("/api/tags")
async def get_tags():
    """Mock endpoint to satisfy the connection check in script.js"""
    print("DEBUG: Received request for /api/tags")
    return {"models": [{"name": "gemma-local-model"}]}

@app.post("/api/chat")
async def chat(chat_request: ChatRequest):
    print(f"DEBUG: Received chat request: {chat_request}")
    global llm
    if llm is None:
        load_model()
        if llm is None:
            print("ERROR: Model failed to load")
            raise HTTPException(status_code=500, detail="Model not configured or not found. Check server.py")

    # Process messages to handle system prompts and ensure validity
    raw_messages = [m.model_dump() for m in chat_request.messages]
    processed_messages = []
    
    system_instruction = None
    
    for msg in raw_messages:
        if msg['role'] == 'system':
            if system_instruction is None:
                system_instruction = msg['content']
            else:
                system_instruction += "\n\n" + msg['content']
        else:
            processed_messages.append(msg)
            
    # If we have a system prompt, prepend it to the first user message or handle it
    # Llama-cpp-python can be finicky with explicit 'system' roles depending on the model,
    # so merging into the first user message is a safe compatibility strategy.
    if system_instruction:
        if processed_messages and processed_messages[0]['role'] == 'user':
            processed_messages[0]['content'] = f"{system_instruction}\n\n{processed_messages[0]['content']}"
        else:
            # If no user message starts, insert one (edge case)
            processed_messages.insert(0, {"role": "user", "content": system_instruction})
            
    print(f"DEBUG: Processed {len(raw_messages)} raw messages into {len(processed_messages)} messages for inference.")
    stream = chat_request.stream
    
    try:
        if stream:
            def generate():
                print("DEBUG: Starting stream generation...")
                try:
                    response = llm.create_chat_completion(
                        messages=processed_messages,
                        stream=True
                    )
                    for chunk in response:
                        delta = chunk['choices'][0]['delta']
                        content = delta.get('content', '')
                        
                        yield json.dumps({
                            "message": {
                                "content": content
                            },
                            "done": False
                        }) + "\n"
                except Exception as e:
                    print(f"ERROR: Stream generation error: {e}")
                    yield json.dumps({"error": str(e), "done": True}) + "\n"
                
                yield json.dumps({"done": True}) + "\n"
                print("DEBUG: Stream generation complete.")

            return StreamingResponse(generate(), media_type="application/x-ndjson")
        else:
            print("DEBUG: Starting non-stream generation...")
            response = llm.create_chat_completion(
                messages=processed_messages,
                stream=False
            )
            content = response['choices'][0]['message']['content']
            print("DEBUG: Generation complete.")
            return {
                "message": {
                    "content": content
                },
                "done": True
            }

    except Exception as e:
        print(f"ERROR: General generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Static File Serving ---

@app.get("/")
async def serve_index():
    print("DEBUG: Serving index.html")
    return FileResponse("index.html")

@app.get("/{file_path:path}")
async def serve_static(file_path: str):
    # This serves script.js, style.css, etc.
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    print(f"DEBUG: File not found: {file_path}")
    raise HTTPException(status_code=404)

if __name__ == "__main__":
    print(f"Starting server on http://localhost:8080")
    print(f"Please ensure your model file exists at: {MODEL_PATH}")
    uvicorn.run(app, host="0.0.0.0", port=8080)